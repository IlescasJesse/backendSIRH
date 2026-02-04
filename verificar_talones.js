const { MongoClient } = require("mongodb");
require("dotenv").config();

async function verificarTalones() {
  const client = new MongoClient(process.env.MONGO_URI);

  try {
    await client.connect();
    const db = client.db();

    console.log("=== VERIFICACIÓN DE TALONES ===\n");

    // 1. Verificar fecha actual
    const hoy = new Date();
    const dia = hoy.getDate();
    const mes = hoy.getMonth() + 1;
    const año = hoy.getFullYear();
    console.log(`Fecha actual: ${dia}/${mes}/${año}`);
    console.log(`Día: ${dia}`);

    // 2. Verificar trabajos de Agenda programados
    console.log("\n--- Trabajos de Agenda ---");
    const jobs = await db
      .collection("AGENDA_LOGS")
      .find()
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();

    console.log(`Total de registros en AGENDA_LOGS: ${jobs.length}`);

    const crearTalonesJobs = jobs.filter((j) => j.tarea === "crearTalones");
    console.log(`\nRegistros de crearTalones: ${crearTalonesJobs.length}`);

    if (crearTalonesJobs.length > 0) {
      console.log("\nÚltimos registros de crearTalones:");
      crearTalonesJobs.slice(0, 5).forEach((job) => {
        console.log(
          `- ${job.timestamp.toISOString()}: ${job.estado} - ${job.mensaje}`
        );
        if (job.detalles) {
          console.log(`  Detalles:`, job.detalles);
        }
      });
    } else {
      console.log("⚠️  NO HAY REGISTROS de la tarea crearTalones");
    }

    // 3. Verificar colección de jobs de agenda
    console.log("\n--- Jobs Activos en Agenda ---");
    const agendaJobs = await db
      .collection("AGENDA_LOGS")
      .find({ name: "crearTalones" })
      .toArray();
    console.log(`Jobs de crearTalones encontrados: ${agendaJobs.length}`);

    // 4. Verificar empleados activos
    console.log("\n--- Empleados Activos ---");
    const empleadosActivos = await db
      .collection("PLANTILLA")
      .countDocuments({ status: 1 });
    console.log(`Total empleados activos: ${empleadosActivos}`);

    // 5. Verificar talones creados hoy
    console.log("\n--- Talones Creados Hoy ---");
    const inicioHoy = new Date(año, mes - 1, dia, 0, 0, 0);
    const finHoy = new Date(año, mes - 1, dia, 23, 59, 59);

    const talonesHoy = await db
      .collection("TALONES")
      .find({
        "TALONES.FECHA_PAG": {
          $gte: inicioHoy,
          $lte: finHoy,
        },
      })
      .toArray();

    console.log(`Talones creados hoy: ${talonesHoy.length}`);

    // 6. Verificar quincena actual
    const quincenaDelMes = dia === 15 ? 1 : 2;
    const quincenaDelAño = (mes - 1) * 2 + quincenaDelMes;
    console.log(`\n--- Quincena Actual ---`);
    console.log(`Quincena del año: ${quincenaDelAño}`);

    const talonesQuincena = await db
      .collection("TALONES")
      .find({
        "TALONES.QUIN": quincenaDelAño,
      })
      .toArray();

    console.log(
      `Talones para quincena ${quincenaDelAño}: ${talonesQuincena.length}`
    );

    // 7. Verificar si el servidor de Agenda está corriendo
    console.log("\n--- Estado del Sistema ---");
    const serverInfo = await db.admin().serverStatus();
    console.log(`MongoDB conectado: ${serverInfo.ok === 1 ? "✓" : "✗"}`);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.close();
  }
}

verificarTalones();
