const { ObjectId } = require("mongodb");
const moment = require("moment-timezone");
const { connect, query } = require("../config/mongo");

const TIMEZONE = "America/Mexico_City";

// Colecciones de empleados que reciben talón de pago.
const COLECCIONES_EMPLEADOS = ["PLANTILLA", "PLANTILLA_FORANEA"];

function getQuincenaInfo(fechaBase = new Date()) {
  const fechaMx = moment.tz(fechaBase, TIMEZONE);
  const dia = fechaMx.date();
  const mes = fechaMx.month() + 1;
  const anio = fechaMx.year();
  const ultimoDiaMes = fechaMx.clone().endOf("month").date();

  // En mayo y diciembre se paga una sola vez: al cierre del mes.
  const pagoUnicoMes = mes === 5 || mes === 12;
  const esQuincena1 = dia === 15 && !pagoUnicoMes;
  const esQuincena2 = dia === ultimoDiaMes;
  const esDiaPago = esQuincena1 || esQuincena2;

  // Numeración de 1 a 22: una por fecha de pago (mayo y diciembre cuentan una sola).
  const quincenaDelMes = dia <= 15 ? 1 : 2;
  const quincenaDelAnio =
    (mes - 1) * 2 +
    quincenaDelMes -
    (mes >= 5 ? 1 : 0) -
    (mes === 12 ? 1 : 0);

  // Primer día del periodo que cubre este pago (mayo y diciembre: el mes completo).
  const inicioPeriodo =
    quincenaDelMes === 1 || pagoUnicoMes
      ? fechaMx.clone().startOf("month")
      : fechaMx.clone().date(16).startOf("day");

  return {
    fechaMx,
    dia,
    mes,
    anio,
    ultimoDiaMes,
    esQuincena1,
    esQuincena2,
    esDiaPago,
    quincenaDelMes,
    quincenaDelAnio,
    fechaPago: fechaMx.clone().startOf("day").toDate(),
    inicioPeriodo: inicioPeriodo.toDate(),
  };
}

// ---------------------------------------------------------------------------
// Talones ligados a la PERSONA, no solo a la plaza.
// PLANTILLA tiene un registro por plaza que se reutiliza cuando entra alguien
// nuevo, así que cada documento de TALONES guarda también NUMEMP (o RFC si no
// hay NUMEMP) de su dueño. Los documentos viejos sin NUMEMP ni RFC se siguen
// mostrando hasta que se ejecute scripts/talones/vincular_persona.js.
// ---------------------------------------------------------------------------
function identidadEmpleado(emp = {}) {
  const NUMEMP = emp.NUMEMP != null && String(emp.NUMEMP).trim() !== "" ? String(emp.NUMEMP).trim() : null;
  const RFC = emp.RFC ? String(emp.RFC).trim().toUpperCase() : null;
  return { NUMEMP, RFC };
}

const FILTRO_LEGADO = { NUMEMP: { $exists: false }, RFC: { $exists: false } };

// Filtro de Mongo para el documento de TALONES de quien ocupa hoy el registro.
function filtroTalonesDe(emp) {
  const { NUMEMP, RFC } = identidadEmpleado(emp);
  const persona = NUMEMP ? { NUMEMP } : RFC ? { RFC } : null;
  return {
    _idEmployee: emp._id,
    $or: persona ? [persona, FILTRO_LEGADO] : [FILTRO_LEGADO],
  };
}

// Lo mismo que filtroTalonesDe, pero para un documento ya leído.
function talonesSonDe(doc, emp) {
  if (!doc || !emp || String(doc._idEmployee) !== String(emp._id)) return false;
  const esLegado = !("NUMEMP" in doc) && !("RFC" in doc);
  if (esLegado) return true;
  const { NUMEMP, RFC } = identidadEmpleado(emp);
  if (NUMEMP) return doc.NUMEMP === NUMEMP;
  if (RFC) return doc.RFC === RFC;
  return false;
}

const aFecha = (valor, formatos) => {
  if (!valor) return null;
  const m = valor instanceof Date
    ? moment.tz(valor, TIMEZONE)
    : moment.tz(String(valor), formatos || [moment.ISO_8601, "YYYY-MM-DD", "DD/MM/YYYY"], TIMEZONE);
  return m.isValid() ? m : null;
};

// ¿Le toca talón a este empleado en este pago?
// - Alta: solo desde la quincena de su FECHA_INGRESO (ingreso <= fecha de pago).
// - Baja: no después de la quincena de su baja (baja >= inicio del periodo).
function correspondeTalon(emp, info, fechaBaja = null) {
  const ingreso = aFecha(emp.FECHA_INGRESO);
  if (ingreso && ingreso.isAfter(moment.tz(info.fechaPago, TIMEZONE).endOf("day"))) {
    return { corresponde: false, motivo: "ALTA_POSTERIOR" };
  }
  const baja = aFecha(fechaBaja);
  if (baja && baja.isBefore(moment.tz(info.inicioPeriodo, TIMEZONE).startOf("day"))) {
    return { corresponde: false, motivo: "BAJA_ANTERIOR" };
  }
  return { corresponde: true };
}

// Bajas registradas que aún no se procesan (fecha de baja futura o pendiente):
// el empleado sigue con status 1, pero no debe recibir talones posteriores.
async function obtenerBajasPendientes() {
  const bajas = await query("BAJAS", {
    reason: { $ne: "L-PRRO" },
    $or: [
      { PROCESADO: false },
      { PROCESADO: "false" },
      { PROCESADO: "FALSE" },
      { PROCESADO: { $exists: false } },
      { PROCESADO: null },
    ],
  });
  const mapa = new Map();
  for (const baja of bajas) {
    if (baja.id_employee && baja.discharge_date) {
      mapa.set(String(baja.id_employee), baja.discharge_date);
    }
  }
  return mapa;
}

async function crearTalonesParaFecha({
  fechaBase = new Date(),
  forzar = false,
} = {}) {
  const info = getQuincenaInfo(fechaBase);

  if (!info.esDiaPago && !forzar) {
    return {
      omitido: true,
      motivo: `No es día de pago. Día actual: ${info.dia}/${info.mes}/${info.anio}`,
      ...info,
      registrosProcesados: 0,
      registrosExitosos: 0,
      registrosErrores: 0,
    };
  }

  const db = await connect();
  const proyeccionEmpleado = { _id: 1, NUMEMP: 1, RFC: 1, FECHA_INGRESO: 1 };
  const empleadosActivos = (
    await Promise.all(
      COLECCIONES_EMPLEADOS.map((col) =>
        db.collection(col).find({ status: 1 }, { projection: proyeccionEmpleado }).toArray(),
      ),
    )
  ).flat();
  const bajasPendientes = await obtenerBajasPendientes();

  // Un solo viaje a la base: documentos de talones sin imágenes.
  const docsTalones = await db
    .collection("TALONES")
    .find(
      { _idEmployee: { $in: empleadosActivos.map((e) => e._id) } },
      { projection: { _idEmployee: 1, NUMEMP: 1, RFC: 1, "TALONES.FECHA_PAG": 1, "TALONES.YEAR": 1, "TALONES.QUIN": 1 } },
    )
    .toArray();
  const docsPorEmpleado = new Map();
  for (const doc of docsTalones) {
    const k = String(doc._idEmployee);
    if (!docsPorEmpleado.has(k)) docsPorEmpleado.set(k, []);
    docsPorEmpleado.get(k).push(doc);
  }

  const fechaPagoKey = info.fechaMx.format("YYYY-MM-DD");
  let registrosExitosos = 0;
  let registrosErrores = 0;
  let registrosOmitidos = 0;

  for (const empleado of empleadosActivos) {
    try {
      const { corresponde } = correspondeTalon(
        empleado,
        info,
        bajasPendientes.get(String(empleado._id)),
      );
      if (!corresponde) {
        registrosOmitidos++;
        continue;
      }

      const doc = (docsPorEmpleado.get(String(empleado._id)) || []).find((d) =>
        talonesSonDe(d, empleado),
      );

      const yaExiste = doc?.TALONES?.some((talon) => {
        if (talon.FECHA_PAG) {
          return moment.tz(talon.FECHA_PAG, TIMEZONE).format("YYYY-MM-DD") === fechaPagoKey;
        }
        // Compatibilidad con registros sin FECHA_PAG.
        return (
          Number(talon.YEAR) === Number(info.anio) &&
          Number(talon.QUIN) === Number(info.quincenaDelAnio)
        );
      });
      if (yaExiste) continue;

      const nuevoTalon = {
        _id: new ObjectId(),
        QUIN: info.quincenaDelAnio,
        YEAR: info.anio,
        FECHA_PAG: info.fechaPago,
        // 1 = PENDIENTE de entregar (2 = ENTREGADO, 3 = PRESTADO). Ver TALON_STATUS en talones.Controller.
        STATUS: 1,
        FOLIO: null,
      };

      if (doc) {
        await db.collection("TALONES").updateOne({ _id: doc._id }, { $push: { TALONES: nuevoTalon } });
      } else {
        await db.collection("TALONES").insertOne({
          _idEmployee: empleado._id,
          ...identidadEmpleado(empleado),
          TALONES: [nuevoTalon],
        });
      }
      registrosExitosos++;
    } catch (errorTalon) {
      registrosErrores++;
      console.error(
        `Error procesando talón para empleado ${empleado._id}:`,
        errorTalon.message,
      );
    }
  }

  return {
    omitido: false,
    ...info,
    registrosProcesados: empleadosActivos.length,
    registrosExitosos,
    registrosErrores,
    registrosOmitidos,
  };
}

function obtenerFechasPagoHasta(fechaLimite = new Date(), anio = null) {
  const limite = moment.tz(fechaLimite, TIMEZONE).endOf("day");
  const anioObjetivo = anio || limite.year();
  const fechas = [];

  for (let mes = 1; mes <= 12; mes++) {
    const primera = moment
      .tz({ year: anioObjetivo, month: mes - 1, day: 15 }, TIMEZONE)
      .startOf("day");
    const ultima = moment
      .tz({ year: anioObjetivo, month: mes - 1, day: 1 }, TIMEZONE)
      .endOf("month")
      .startOf("day");

    if (
      mes !== 5 &&
      mes !== 12 &&
      primera.isSameOrBefore(limite)
    ) {
      fechas.push(primera.toDate());
    }

    if (ultima.isSameOrBefore(limite)) {
      fechas.push(ultima.toDate());
    }
  }

  return fechas;
}

module.exports = {
  TIMEZONE,
  COLECCIONES_EMPLEADOS,
  getQuincenaInfo,
  crearTalonesParaFecha,
  obtenerFechasPagoHasta,
  identidadEmpleado,
  filtroTalonesDe,
  talonesSonDe,
  correspondeTalon,
};
