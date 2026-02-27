const moment = require("moment-timezone");
require("dotenv").config();

const { connect } = require("../../src/config/mongo");
const {
  TIMEZONE,
  crearTalonesParaFecha,
  getQuincenaInfo,
} = require("../../src/libs/talonesQuincena");

async function generarEneroYFebrero1() {
  try {
    await connect();

    const anioArg = Number(process.argv[2]);
    const anio = Number.isInteger(anioArg)
      ? anioArg
      : moment.tz(TIMEZONE).year();

    const fechas = [
      moment
        .tz({ year: anio, month: 0, day: 15 }, TIMEZONE)
        .startOf("day")
        .toDate(),
      moment
        .tz({ year: anio, month: 0, day: 31 }, TIMEZONE)
        .startOf("day")
        .toDate(),
      moment
        .tz({ year: anio, month: 1, day: 15 }, TIMEZONE)
        .startOf("day")
        .toDate(),
    ];

    console.log(`Generando quincenas de enero y 1ra de febrero para ${anio}`);

    for (const fecha of fechas) {
      const info = getQuincenaInfo(fecha);
      const resultado = await crearTalonesParaFecha({ fechaBase: fecha });

      console.log(
        `Quincena ${info.quincenaDelAnio} (${info.fechaMx.format("YYYY-MM-DD")}): ${resultado.registrosExitosos}/${resultado.registrosProcesados} creados`,
      );
    }

    console.log("Proceso terminado.");
    process.exit(0);
  } catch (error) {
    console.error("Error generando quincenas enero/febrero:", error.message);
    process.exit(1);
  }
}

generarEneroYFebrero1();
