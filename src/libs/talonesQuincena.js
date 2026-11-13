const { ObjectId } = require("mongodb");
const moment = require("moment-timezone");
const { connect, query } = require("../config/mongo");

const TIMEZONE = "America/Mexico_City";

// Mayo y diciembre tienen un solo pago, que suele hacerse antes de fin de mes
// (p. ej. diciembre 2024 se pagó el 13). Ese talón se crea este día del mes
// para que ya exista cuando se entregue.
const DIA_PAGO_UNICO = Number(process.env.TALONES_DIA_PAGO_UNICO) || 10;

// Los talones de la primera quincena (pago del 15) se crean antes, este día,
// para que ya existan cuando lleguen los sobres. La fecha de pago sigue
// siendo el 15; el día 15 el cron vuelve a pasar sin duplicar.
const DIA_CREACION_Q1 = Number(process.env.TALONES_DIA_CREACION_Q1) || 13;

// Fecha de pago que corresponde crear en una fecha dada, o null si ese día no
// se crean talones. Día DIA_CREACION_Q1 (no mayo ni diciembre) → el 15.
function fechaPagoParaCrear(fecha = new Date()) {
  const f = moment.tz(fecha, TIMEZONE);
  const mes = f.month() + 1;
  if (f.date() === DIA_CREACION_Q1 && mes !== 5 && mes !== 12) {
    return f.clone().date(15).startOf("day").toDate();
  }
  return getQuincenaInfo(fecha).esDiaPago ? f.clone().startOf("day").toDate() : null;
}

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
  const esDiaPagoUnico = pagoUnicoMes && dia === DIA_PAGO_UNICO;
  const esDiaPago = esQuincena1 || esQuincena2 || esDiaPagoUnico;

  // Numeración de 1 a 22: una por fecha de pago (mayo y diciembre cuentan una sola).
  const quincenaDelMes = dia <= 15 ? 1 : 2;
  // En mayo y diciembre cualquier día del mes es la quincena única (9 y 22).
  const quincenaDelAnio =
    (mes - 1) * 2 +
    (pagoUnicoMes ? 2 : quincenaDelMes) -
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
  // El día de creación anticipada (13) se crean los talones del pago del 15.
  const fechaPagoCrear = fechaPagoParaCrear(fechaBase);
  const info = getQuincenaInfo(fechaPagoCrear || fechaBase);

  if (!fechaPagoCrear && !forzar) {
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

      // Ya existe si tiene la misma quincena del año (así mayo y diciembre no
      // se duplican entre el día de pago único y el fin de mes) o la misma fecha.
      const yaExiste = doc?.TALONES?.some((talon) =>
        (Number(talon.YEAR) === Number(info.anio) &&
          Number(talon.QUIN) === Number(info.quincenaDelAnio)) ||
        (talon.FECHA_PAG &&
          moment.tz(talon.FECHA_PAG, TIMEZONE).format("YYYY-MM-DD") === fechaPagoKey));
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

// Talones del retroactivo: un sobre extra al año sin fecha fija (QUIN "RETRO",
// TIPO "RETROACTIVO"). Lo genera un usuario desde la pantalla de talones.
// - Uno por empleado y año: si ya lo tiene, no se crea otro.
// - Respeta alta y baja con la fecha de pago indicada (o hoy).
// - simular: true solo cuenta, no escribe.
async function crearTalonesRetroactivo({ anio, fechaPago = new Date(), simular = false, usuario = null } = {}) {
  const db = await connect();
  const info = getQuincenaInfo(fechaPago);
  const empleadosActivos = (
    await Promise.all(
      COLECCIONES_EMPLEADOS.map((col) =>
        db.collection(col).find({ status: 1 }, { projection: { _id: 1, NUMEMP: 1, RFC: 1, FECHA_INGRESO: 1 } }).toArray(),
      ),
    )
  ).flat();
  const bajasPendientes = await obtenerBajasPendientes();
  const docsTalones = await db
    .collection("TALONES")
    .find(
      { _idEmployee: { $in: empleadosActivos.map((e) => e._id) } },
      { projection: { _idEmployee: 1, NUMEMP: 1, RFC: 1, "TALONES.QUIN": 1, "TALONES.YEAR": 1 } },
    )
    .toArray();
  const docsPorEmpleado = new Map();
  for (const doc of docsTalones) {
    const k = String(doc._idEmployee);
    if (!docsPorEmpleado.has(k)) docsPorEmpleado.set(k, []);
    docsPorEmpleado.get(k).push(doc);
  }

  const resumen = { anio, fechaPago: info.fechaMx.format("YYYY-MM-DD"), empleados: empleadosActivos.length, creados: 0, yaTenian: 0, omitidosAltaBaja: 0 };
  const operaciones = [];
  for (const empleado of empleadosActivos) {
    if (!correspondeTalon(empleado, info, bajasPendientes.get(String(empleado._id))).corresponde) {
      resumen.omitidosAltaBaja++;
      continue;
    }
    const doc = (docsPorEmpleado.get(String(empleado._id)) || []).find((d) => talonesSonDe(d, empleado));
    if (doc?.TALONES?.some((t) => t.QUIN === "RETRO" && Number(t.YEAR) === Number(anio))) {
      resumen.yaTenian++;
      continue;
    }
    const talon = {
      _id: new ObjectId(),
      QUIN: "RETRO",
      TIPO: "RETROACTIVO",
      YEAR: Number(anio),
      FECHA_PAG: info.fechaPago,
      STATUS: 1,
      FOLIO: null,
      GENERADO_POR: usuario,
      FECHA_GENERADO: new Date(),
    };
    operaciones.push(doc
      ? { updateOne: { filter: { _id: doc._id }, update: { $push: { TALONES: talon } } } }
      : { insertOne: { document: { _idEmployee: empleado._id, ...identidadEmpleado(empleado), TALONES: [talon] } } });
    resumen.creados++;
  }
  if (!simular && operaciones.length > 0) {
    await db.collection("TALONES").bulkWrite(operaciones, { ordered: false });
  }
  return { ...resumen, simulado: simular };
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

    // Mayo y diciembre: un solo pago, el día DIA_PAGO_UNICO.
    const fechaFinal = mes === 5 || mes === 12
      ? moment.tz({ year: anioObjetivo, month: mes - 1, day: DIA_PAGO_UNICO }, TIMEZONE).startOf("day")
      : ultima;
    if (fechaFinal.isSameOrBefore(limite)) {
      fechas.push(fechaFinal.toDate());
    }
  }

  return fechas;
}

module.exports = {
  TIMEZONE,
  DIA_CREACION_Q1,
  fechaPagoParaCrear,
  DIA_PAGO_UNICO,
  COLECCIONES_EMPLEADOS,
  getQuincenaInfo,
  crearTalonesParaFecha,
  crearTalonesRetroactivo,
  obtenerFechasPagoHasta,
  identidadEmpleado,
  filtroTalonesDe,
  talonesSonDe,
  correspondeTalon,
};
