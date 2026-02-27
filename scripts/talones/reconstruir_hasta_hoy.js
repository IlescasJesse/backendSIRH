const moment = require("moment-timezone");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { connect, deleteMany } = require("../../src/config/mongo");
const {
  TIMEZONE,
  crearTalonesParaFecha,
  obtenerFechasPagoHasta,
  getQuincenaInfo,
} = require("../../src/libs/talonesQuincena");

const MARKER_PATH = path.resolve(
  __dirname,
  "../../logs/.talones_reconstruidos_once.json",
);

async function reconstruirTalonesHastaHoy() {
  try {
    const confirm = process.argv.includes("--confirm");
    const forceRepeat = process.argv.includes("--force-repeat");

    if (!confirm) {
      console.log(
        "Este script es manual y destructivo. Ejecuta con --confirm para continuar.",
      );
      process.exit(1);
    }

    if (fs.existsSync(MARKER_PATH) && !forceRepeat) {
      const marker = JSON.parse(fs.readFileSync(MARKER_PATH, "utf8"));
      console.log(
        `Este script ya fue ejecutado el ${marker.ejecutadoEn}. Si realmente deseas repetirlo usa --force-repeat.`,
      );
      process.exit(1);
    }

    await connect();

    const anioArg = Number(process.argv[2]);
    const anio = Number.isInteger(anioArg)
      ? anioArg
      : moment.tz(TIMEZONE).year();

    const hoy = moment.tz(TIMEZONE).endOf("day").toDate();
    const fechasPago = obtenerFechasPagoHasta(hoy, anio);

    console.log(
      `Limpiando TALONES y reconstruyendo hasta hoy (${moment.tz(hoy, TIMEZONE).format("YYYY-MM-DD")}) para ${anio}`,
    );

    await deleteMany("TALONES", {});
    console.log("Colección TALONES limpiada.");

    let totalProcesados = 0;
    let totalExitosos = 0;
    let totalErrores = 0;

    for (const fecha of fechasPago) {
      const info = getQuincenaInfo(fecha);
      const resultado = await crearTalonesParaFecha({ fechaBase: fecha });

      totalProcesados += resultado.registrosProcesados;
      totalExitosos += resultado.registrosExitosos;
      totalErrores += resultado.registrosErrores;

      console.log(
        `Quincena ${info.quincenaDelAnio} (${info.fechaMx.format("YYYY-MM-DD")}): ${resultado.registrosExitosos}/${resultado.registrosProcesados} creados`,
      );
    }

    console.log("Reconstrucción finalizada.");
    console.log(
      `Totales -> Procesados: ${totalProcesados}, Creados: ${totalExitosos}, Errores: ${totalErrores}`,
    );

    const marker = {
      ejecutadoEn: moment.tz(TIMEZONE).format("YYYY-MM-DD HH:mm:ss"),
      anio,
      totalProcesados,
      totalExitosos,
      totalErrores,
    };

    fs.mkdirSync(path.dirname(MARKER_PATH), { recursive: true });
    fs.writeFileSync(MARKER_PATH, JSON.stringify(marker, null, 2));

    process.exit(0);
  } catch (error) {
    console.error("Error reconstruyendo talones:", error.message);
    process.exit(1);
  }
}

reconstruirTalonesHastaHoy();
