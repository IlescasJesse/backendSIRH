const Agenda = require("agenda");
const { ObjectId } = require("mongodb");
const { query, insertOne, updateOne } = require("./mongo");
require("dotenv").config();

// Crear instancia de Agenda conectada a MongoDB
const agenda = new Agenda({
  db: { address: process.env.MONGO_URI, collection: "agendaJobs" },
  processEvery: "1 minute", // Verificar trabajos cada minuto
  maxConcurrency: 20,
});

// Definir las tareas que se ejecutarán

// Tarea: Efectuar bajas extemporáneas - Se ejecuta diariamente
agenda.define("bajasExtemporaneas", async (job) => {
  console.log(
    "Ejecutando tarea de bajas extemporáneas:",
    new Date().toISOString()
  );
  const { data } = job.attrs;

  try {
    // Consultar colección de bajas extemporáneas
    // Obtener bajas cuya discharge_date es mayor o igual a hoy (pendientes a futuro)
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const bajasPendientes = await query("BAJAS", {
      discharge_date: { $gte: today },
      PROCESADO: false,
    });

    console.log(
      `Se encontraron ${bajasPendientes.length} bajas extemporáneas pendientes`
    );

    // Procesar cada baja
    for (const baja of bajasPendientes) {
      console.log(`Procesando baja extemporánea: ${baja._id}`);

      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      if (baja.discharge_date === today && baja.reason !== "L-PRRO") {
        // Actualizar plantilla
        // Actualizar plantilla y manejar errores si no se encuentra
        const plantillaResult = await updateOne(
          "PLANTILLA",
          { _id: new ObjectId(baja.id_employee) },
          {
            $set: {
              CONSEC: null,
              CLAVE: null,
              CURP: null,
              RFC: null,
              AFILIACI: null,
              NUMEMP: null,
              NUMQUIN: 0,
              FECHA_INGRESO: null,
              SANGRE: null,
              AVISAR: null,
              TEL_EMERGENCIA1: null,
              TEL_EMERGENCIA2: null,
              NUMTARJETA: null,
              TURNOMAT: null,
              TURNOVES: null,
              SABADO: null,
              SEXO: null,
              FECHA_NAC: null,
              LUGARNAC: null,
              CP: null,
              TEL_PERSONAL: null,
              ALERGIA: null,
              TIPOPAG: null,
              BANCO: null,
              CUENTA: null,
              NOMINA: null,
              EMAIL: null,
              DOMICILIO: null,
              PROFES: null,
              APE_PAT: null,
              APE_MAT: "VACANTE",
              NOMBRES: null,
              VACACIONES: {
                PERIODO: 0,
                FECHA_VACACIONES: null,
                DIAS: null,
                FECHAS: {
                  FECHA_INICIO: null,
                  FECHA_FINAL: null,
                },
              },
              status: 2,
              AREA_RESP: null,
              STATUS_EMPLEADO: null,
              GASCOM: 0,
              GUARDE: 0,
              SUELDO_GRV: 0,
              CONYUGE: null,
              DIRECCION: null,
              DIRECCION_FISCAL: null,
              EMAIL_INSTITUCIONAL: null,
              ESTADONAC: null,
              ESTADO_CIVIL: null,
              ESTUDIOS: null,
              FECHA_ENTRADA_DEFINITIVA: null,
              NACIONALIDAD: null,
              PARENTESCO: null,
              TEL_CASA: null,
            },
          }
        );
        if (!plantillaResult || plantillaResult.matchedCount === 0) {
          console.warn(
            `No se encontró registro en PLANTILLA para id_empleado: ${baja.id_empleado}`
          );
        }

        // Actualizar plaza y manejar errores si no se encuentra
        const plazaResult = await updateOne(
          "PLAZAS",
          { NUMPLA: baja.NUMPLA },
          { $set: { status: 2 } }
        );
        if (!plazaResult || plazaResult.matchedCount === 0) {
          console.warn(
            `No se encontró registro en PLAZAS para NUMPLA: ${baja.NUMPLA}`
          );
        }

        await updateOne(
          "PLAZAS",
          { NUMPLA: baja.NUMPLA },
          { $set: { status: 2 } }
        );
      }

      // Marcar baja como procesada
      await updateOne(
        "BAJAS",
        { _id: baja._id },
        { $set: { PROCESADO: true, fechaProceso: new Date() } }
      );
    }

    console.log("Bajas extemporáneas procesadas correctamente");
  } catch (error) {
    console.error("Error en tarea de bajas extemporáneas:", error);
  }
});

// Tarea: Efectuar altas extemporáneas - Se ejecuta diariamente
agenda.define("altasExtemporaneas", async (job) => {
  console.log(
    "Ejecutando tarea de altas extemporáneas:",
    new Date().toISOString()
  );
  const { data } = job.attrs;

  try {
    // Consultar colección de altas extemporáneas
    const altasPendientes = await query("altasExtemporaneas", {
      procesado: false,
    });

    console.log(
      `Se encontraron ${altasPendientes.length} altas extemporáneas pendientes`
    );

    // Procesar cada alta
    for (const alta of altasPendientes) {
      console.log(`Procesando alta extemporánea: ${alta._id}`);

      // Aquí implementa tu lógica de negocio
      // Ejemplo: dar de alta empleado, actualizar registros, etc.

      // Marcar como procesado
      await updateOne(
        "altasExtemporaneas",
        { _id: alta._id },
        { $set: { procesado: true, fechaProceso: new Date() } }
      );
    }

    console.log("Altas extemporáneas procesadas correctamente");
  } catch (error) {
    console.error("Error en tarea de altas extemporáneas:", error);
  }
});

// Tarea: Gestionar licencias extemporáneas - Se ejecuta diariamente
agenda.define("licenciasExtemporaneas", async (job) => {
  console.log(
    "Ejecutando tarea de licencias extemporáneas:",
    new Date().toISOString()
  );
  const { data } = job.attrs;

  try {
    // Consultar colección de licencias extemporáneas
    const licenciasPendientes = await query("licenciasExtemporaneas", {
      procesado: false,
    });

    console.log(
      `Se encontraron ${licenciasPendientes.length} licencias extemporáneas pendientes`
    );

    // Procesar cada licencia
    for (const licencia of licenciasPendientes) {
      console.log(`Procesando licencia extemporánea: ${licencia._id}`);

      // Aquí implementa tu lógica de negocio
      // Ejemplo: registrar licencia, actualizar días, notificar, etc.

      // Marcar como procesado
      await updateOne(
        "licenciasExtemporaneas",
        { _id: licencia._id },
        { $set: { procesado: true, fechaProceso: new Date() } }
      );
    }

    console.log("Licencias extemporáneas procesadas correctamente");
  } catch (error) {
    console.error("Error en tarea de licencias extemporáneas:", error);
  }
});

// Tarea: Crear talones de pago - Se ejecuta los días 14 y último del mes
agenda.define("crearTalones", async (job) => {
  console.log(
    "Ejecutando tarea de creación de talones:",
    new Date().toISOString()
  );
  const { data } = job.attrs;

  try {
    // Consultar empleados activos
    const empleadosActivos = await query("empleados", {
      status: "activo",
    });

    console.log(
      `Generando talones para ${empleadosActivos.length} empleados activos`
    );

    const periodo = data?.periodo || "quincenal";
    const fechaGeneracion = new Date();

    // Generar talón para cada empleado
    for (const empleado of empleadosActivos) {
      console.log(`Generando talón para empleado: ${empleado.nombre}`);

      const talon = {
        empleadoId: empleado._id,
        nombre: empleado.nombre,
        periodo: periodo,
        fechaGeneracion: fechaGeneracion,
        // Aquí calcula el salario según tu lógica
        salarioBruto: empleado.salario,
        deducciones: 0,
        salarioNeto: empleado.salario,
        estado: "generado",
      };

      // Insertar talón en la colección
      await insertOne("talones", talon);
    }

    console.log("Talones generados correctamente");
  } catch (error) {
    console.error("Error en tarea de creación de talones:", error);
  }
});

// Tarea: Gestionar período vacacional - Se ejecuta cada 6 meses
agenda.define("gestionarPeriodoVacacional", async (job) => {
  console.log(
    "Ejecutando tarea de gestión de período vacacional:",
    new Date().toISOString()
  );
  const { data } = job.attrs;

  try {
    // Consultar todos los empleados activos
    const empleados = await query("empleados", {
      status: "activo",
    });

    console.log(
      `Actualizando período vacacional para ${empleados.length} empleados`
    );

    const fechaActualizacion = new Date();

    // Actualizar vacaciones para cada empleado
    for (const empleado of empleados) {
      console.log(`Actualizando vacaciones para: ${empleado.nombre}`);

      // Calcular días de vacaciones según antigüedad
      // Esto es un ejemplo, ajusta según tus reglas de negocio
      const diasVacacionesNuevos = 6; // 6 días por semestre

      const registroVacaciones = {
        empleadoId: empleado._id,
        periodo: fechaActualizacion,
        diasAcumulados: diasVacacionesNuevos,
        diasDisponibles:
          (empleado.diasVacacionesDisponibles || 0) + diasVacacionesNuevos,
        fechaActualizacion: fechaActualizacion,
      };

      // Insertar registro de vacaciones
      await insertOne("vacaciones", registroVacaciones);

      // Actualizar empleado con nuevo saldo
      await updateOne(
        "empleados",
        { _id: empleado._id },
        {
          $set: {
            diasVacacionesDisponibles: registroVacaciones.diasDisponibles,
          },
        }
      );
    }

    console.log("Período vacacional actualizado correctamente");
  } catch (error) {
    console.error("Error en tarea de gestión de período vacacional:", error);
  }
});

// Función para iniciar Agenda
async function startAgenda() {
  try {
    await agenda.start();
    console.log("Scheduler ONLINE");

    // Programar las tareas recurrentes
    // Bajas extemporáneas - Diariamente a las 00:00
    await agenda.every(
      "*/30 * * * * *",
      "bajasExtemporaneas",
      {},
      {
        timezone: "America/Mexico_City",
      }
    );

    // Altas extemporáneas - Diariamente a las 01:00
    await agenda.every(
      "0 1 * * *",
      "altasExtemporaneas",
      {},
      {
        timezone: "America/Mexico_City",
      }
    );

    // Licencias extemporáneas - Diariamente a las 02:00
    await agenda.every(
      "0 2 * * *",
      "licenciasExtemporaneas",
      {},
      {
        timezone: "America/Mexico_City",
      }
    );

    // Crear talones - Día 14 de cada mes a las 08:00
    await agenda.every(
      "0 8 14 * *",
      "crearTalones",
      {},
      {
        timezone: "America/Mexico_City",
      }
    );

    // Crear talones - Último día del mes a las 08:00
    await agenda.every(
      "0 8 28-31 * *",
      "crearTalones",
      { periodo: "ultimo-dia" },
      {
        timezone: "America/Mexico_City",
      }
    );

    // Gestionar período vacacional - Cada 6 meses
    await agenda.every(
      "6 months",
      "gestionarPeriodoVacacional",
      {},
      {
        skipImmediate: true,
      }
    );

    console.log("✓ Tareas programadas correctamente");
  } catch (error) {
    console.error("❌ Error al iniciar Agenda:", error);
  }
}

// Función para detener Agenda de forma limpia
async function stopAgenda() {
  await agenda.stop();
}

// Manejar cierre del proceso
process.on("SIGTERM", stopAgenda);
process.on("SIGINT", stopAgenda);

module.exports = { agenda, startAgenda, stopAgenda };
