const { ObjectId } = require("mongodb");
const moment = require("moment-timezone");
const { query, insertOne, updateOne } = require("../config/mongo");

const TIMEZONE = "America/Mexico_City";

function getQuincenaInfo(fechaBase = new Date()) {
  const fechaMx = moment.tz(fechaBase, TIMEZONE);
  const dia = fechaMx.date();
  const mes = fechaMx.month() + 1;
  const anio = fechaMx.year();
  const ultimoDiaMes = fechaMx.clone().endOf("month").date();

  const esQuincena1 = dia === 15;
  const esQuincena2 = dia === ultimoDiaMes;
  const esDiaPago = esQuincena1 || esQuincena2;

  const quincenaDelMes = esDiaPago ? (esQuincena1 ? 1 : 2) : dia <= 15 ? 1 : 2;
  const quincenaDelAnio = (mes - 1) * 2 + quincenaDelMes;

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
  };
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

  const empleadosActivos = await query("PLANTILLA", { status: 1 });
  let registrosExitosos = 0;
  let registrosErrores = 0;

  for (const empleado of empleadosActivos) {
    try {
      const talonExistente = await query("TALONES", {
        _idEmployee: empleado._id,
      });

      const nuevoTalon = {
        _id: new ObjectId(),
        QUIN: info.quincenaDelAnio,
        FECHA_PAG: info.fechaPago,
        STATUS: 2,
        FOLIO: null,
      };

      if (talonExistente.length === 0) {
        await insertOne("TALONES", {
          _idEmployee: empleado._id,
          TALONES: [nuevoTalon],
        });
        registrosExitosos++;
      } else {
        const empleadoActual = await query("PLANTILLA", {
          _id: empleado._id,
          status: 1,
        });

        if (empleadoActual.length > 0) {
          const yaExiste = talonExistente[0].TALONES?.some(
            (t) => Number(t.QUIN) === Number(info.quincenaDelAnio),
          );

          if (!yaExiste) {
            await updateOne(
              "TALONES",
              { _idEmployee: empleado._id },
              { $push: { TALONES: nuevoTalon } },
            );
            registrosExitosos++;
          }
        }
      }
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

    if (primera.isSameOrBefore(limite)) {
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
  getQuincenaInfo,
  crearTalonesParaFecha,
  obtenerFechasPagoHasta,
};
