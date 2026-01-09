const Agenda = require("agenda");
const { ObjectId } = require("mongodb");
const { query, insertOne, updateOne } = require("./mongo");
require("dotenv").config();

// Crear instancia de Agenda conectada a MongoDB
const agenda = new Agenda({
  db: { address: process.env.MONGO_URI, collection: "AGENDA_LOGS" },
  processEvery: "1 minute", // Verificar trabajos cada minuto
  maxConcurrency: 20,
});

// Función helper para registrar actividad de tareas
async function registrarActividadAgenda(datosActividad) {
  try {
    const registro = {
      tarea: datosActividad.tarea,
      estado: datosActividad.estado, // 'iniciado', 'completado', 'error'
      mensaje: datosActividad.mensaje,
      detalles: datosActividad.detalles || {},
      registrosProcesados: datosActividad.registrosProcesados || 0,
      registrosExitosos: datosActividad.registrosExitosos || 0,
      registrosErrores: datosActividad.registrosErrores || 0,
      duracion: datosActividad.duracion || null,
      error: datosActividad.error || null,
      timestamp: new Date(),
    };

    await insertOne("AGENDA_LOGS", registro);
  } catch (error) {
    console.error("Error al registrar actividad de agenda:", error);
  }
}

// Definir las tareas que se ejecutarán

// Tarea: Efectuar bajas extemporáneas - Se ejecuta diariamente
agenda.define("bajasExtemporaneas", async (job) => {
  const inicioTarea = Date.now();
  const nombreTarea = "bajasExtemporaneas";

  console.log(
    "Ejecutando tarea de bajas extemporáneas:",
    new Date().toISOString()
  );

  await registrarActividadAgenda({
    tarea: nombreTarea,
    estado: "iniciado",
    mensaje: "Iniciando proceso de bajas extemporáneas",
    detalles: { fechaEjecucion: new Date().toISOString() },
  });

  let registrosProcesados = 0;
  let registrosExitosos = 0;
  let registrosErrores = 0;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const bajasPendientes = await query("BAJAS", {
      discharge_date: { $gte: today },
      PROCESADO: false,
    });

    console.log(
      `Se encontraron ${bajasPendientes.length} bajas extemporáneas pendientes`
    );

    registrosProcesados = bajasPendientes.length;

    for (const baja of bajasPendientes) {
      try {
        console.log(`Procesando baja extemporánea: ${baja._id}`);

        if (baja.discharge_date === today && baja.reason !== "L-PRRO") {
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
              `No se encontró registro en PLANTILLA para id_empleado: ${baja.id_employee}`
            );
            registrosErrores++;
          }

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
        }

        await updateOne(
          "BAJAS",
          { _id: baja._id },
          { $set: { PROCESADO: true, fechaProceso: new Date() } }
        );

        registrosExitosos++;
      } catch (errorBaja) {
        registrosErrores++;
        console.error(`Error procesando baja ${baja._id}:`, errorBaja);
      }
    }

    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "completado",
      mensaje: "Proceso de bajas extemporáneas completado exitosamente",
      detalles: {
        fechaEjecucion: new Date().toISOString(),
      },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
    });

    console.log("Bajas extemporáneas procesadas correctamente");
  } catch (error) {
    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "error",
      mensaje: "Error en proceso de bajas extemporáneas",
      detalles: {
        fechaEjecucion: new Date().toISOString(),
      },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
      error: error.message,
    });

    console.error("Error en tarea de bajas extemporáneas:", error);
  }
});

// Tarea: Efectuar altas extemporáneas - Se ejecuta diariamente
agenda.define("altasExtemporaneas", async (job) => {
  const inicioTarea = Date.now();
  const nombreTarea = "altasExtemporaneas";

  console.log(
    "Ejecutando tarea de altas extemporáneas:",
    new Date().toISOString()
  );

  await registrarActividadAgenda({
    tarea: nombreTarea,
    estado: "iniciado",
    mensaje: "Iniciando proceso de altas extemporáneas",
    detalles: { fechaEjecucion: new Date().toISOString() },
  });

  let registrosProcesados = 0;
  let registrosExitosos = 0;
  let registrosErrores = 0;

  try {
    const altasPendientes = await query("altasExtemporaneas", {
      procesado: false,
    });

    console.log(
      `Se encontraron ${altasPendientes.length} altas extemporáneas pendientes`
    );

    registrosProcesados = altasPendientes.length;

    for (const alta of altasPendientes) {
      try {
        console.log(`Procesando alta extemporánea: ${alta._id}`);

        await updateOne(
          "altasExtemporaneas",
          { _id: alta._id },
          { $set: { procesado: true, fechaProceso: new Date() } }
        );

        registrosExitosos++;
      } catch (errorAlta) {
        registrosErrores++;
        console.error(`Error procesando alta ${alta._id}:`, errorAlta);
      }
    }

    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "completado",
      mensaje: "Proceso de altas extemporáneas completado exitosamente",
      detalles: { fechaEjecucion: new Date().toISOString() },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
    });

    console.log("Altas extemporáneas procesadas correctamente");
  } catch (error) {
    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "error",
      mensaje: "Error en proceso de altas extemporáneas",
      detalles: { fechaEjecucion: new Date().toISOString() },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
      error: error.message,
    });

    console.error("Error en tarea de altas extemporáneas:", error);
  }
});

// Tarea: Gestionar licencias extemporáneas - Se ejecuta diariamente
agenda.define("licenciasExtemporaneas", async (job) => {
  const inicioTarea = Date.now();
  const nombreTarea = "licenciasExtemporaneas";

  console.log(
    "Ejecutando tarea de licencias extemporáneas:",
    new Date().toISOString()
  );

  await registrarActividadAgenda({
    tarea: nombreTarea,
    estado: "iniciado",
    mensaje: "Iniciando proceso de licencias extemporáneas",
    detalles: { fechaEjecucion: new Date().toISOString() },
  });

  let registrosProcesados = 0;
  let registrosExitosos = 0;
  let registrosErrores = 0;

  try {
    const licenciasPendientes = await query("licenciasExtemporaneas", {
      procesado: false,
    });

    console.log(
      `Se encontraron ${licenciasPendientes.length} licencias extemporáneas pendientes`
    );

    registrosProcesados = licenciasPendientes.length;

    for (const licencia of licenciasPendientes) {
      try {
        console.log(`Procesando licencia extemporánea: ${licencia._id}`);

        await updateOne(
          "licenciasExtemporaneas",
          { _id: licencia._id },
          { $set: { procesado: true, fechaProceso: new Date() } }
        );

        registrosExitosos++;
      } catch (errorLicencia) {
        registrosErrores++;
        console.error(
          `Error procesando licencia ${licencia._id}:`,
          errorLicencia
        );
      }
    }

    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "completado",
      mensaje: "Proceso de licencias extemporáneas completado exitosamente",
      detalles: { fechaEjecucion: new Date().toISOString() },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
    });

    console.log("Licencias extemporáneas procesadas correctamente");
  } catch (error) {
    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "error",
      mensaje: "Error en proceso de licencias extemporáneas",
      detalles: { fechaEjecucion: new Date().toISOString() },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
      error: error.message,
    });

    console.error("Error en tarea de licencias extemporáneas:", error);
  }
});

// Tarea: Crear talones de pago - Se ejecuta los días 15 y último del mes
agenda.define("crearTalones", async (job) => {
  const inicioTarea = Date.now();
  const nombreTarea = "crearTalones";

  let registrosProcesados = 0;
  let registrosExitosos = 0;
  let registrosErrores = 0;

  try {
    const hoy = new Date();
    const dia = hoy.getDate();
    const mes = hoy.getMonth() + 1;
    const año = hoy.getFullYear();
    const ultimoDiaMes = new Date(año, mes, 0).getDate();

    let esQuincena1 = dia === 15;
    let esQuincena2 = dia === ultimoDiaMes;

    if (!esQuincena1 && !esQuincena2) {
      await registrarActividadAgenda({
        tarea: nombreTarea,
        estado: "omitido",
        mensaje: `No es día de pago. Día actual: ${dia}/${mes}/${año}`,
        detalles: { dia, mes, año },
        registrosProcesados: 0,
        registrosExitosos: 0,
        registrosErrores: 0,
        duracion: Date.now() - inicioTarea,
      });

      return;
    }

    const quincenaDelMes = esQuincena1 ? 1 : 2;
    const quincenaDelAño = (mes - 1) * 2 + quincenaDelMes;
    const fechaPago = new Date(año, mes - 1, dia);

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "iniciado",
      mensaje: `Iniciando creación de talones - Quincena ${quincenaDelAño}`,
      detalles: {
        fechaEjecucion: new Date().toISOString(),
        quincena: quincenaDelAño,
        fechaPago: fechaPago.toISOString().slice(0, 10),
      },
    });

    const empleadosActivos = await query("PLANTILLA", { status: 1 });
    registrosProcesados = empleadosActivos.length;

    for (const empleado of empleadosActivos) {
      try {
        const talonExistente = await query("TALONES", {
          _idEmployee: empleado._id,
        });

        const nuevoTalon = {
          _id: new ObjectId(),
          QUIN: quincenaDelAño,
          FECHA_PAG: fechaPago,
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
              (t) => t.QUIN === quincenaDelAño
            );

            if (!yaExiste) {
              await updateOne(
                "TALONES",
                { _idEmployee: empleado._id },
                { $push: { TALONES: nuevoTalon } }
              );
              registrosExitosos++;
            }
          }
        }
      } catch (errorTalon) {
        registrosErrores++;
        console.error(
          `Error procesando talón para empleado ${empleado._id}:`,
          errorTalon.message
        );
      }
    }

    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "completado",
      mensaje: `Creados ${registrosExitosos} talones para quincena ${quincenaDelAño}`,
      detalles: {
        fechaEjecucion: new Date().toISOString(),
        quincena: quincenaDelAño,
        fechaPago: fechaPago.toISOString().slice(0, 10),
      },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
    });

    console.log(
      `✓ Talones generados: ${registrosExitosos} de ${registrosProcesados} empleados (Quincena ${quincenaDelAño})`
    );
  } catch (error) {
    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "error",
      mensaje: "Error en creación de talones",
      detalles: { fechaEjecucion: new Date().toISOString() },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
      error: error.message,
    });

    console.error("✗ Error en tarea de creación de talones:", error.message);
  }
});

// Tarea: Gestionar período vacacional - Se ejecuta cada 6 meses
agenda.define("gestionarPeriodoVacacional", async (job) => {
  const inicioTarea = Date.now();
  const nombreTarea = "gestionarPeriodoVacacional";

  console.log(
    "Ejecutando tarea de gestión de período vacacional:",
    new Date().toISOString()
  );

  await registrarActividadAgenda({
    tarea: nombreTarea,
    estado: "iniciado",
    mensaje: "Iniciando actualización de período vacacional",
    detalles: { fechaEjecucion: new Date().toISOString() },
  });

  let registrosProcesados = 0;
  let registrosExitosos = 0;
  let registrosErrores = 0;

  try {
    const empleados = await query("empleados", {
      status: "activo",
    });

    console.log(
      `Actualizando período vacacional para ${empleados.length} empleados`
    );

    registrosProcesados = empleados.length;
    const fechaActualizacion = new Date();

    for (const empleado of empleados) {
      try {
        console.log(`Actualizando vacaciones para: ${empleado.nombre}`);

        const diasVacacionesNuevos = 6;

        const registroVacaciones = {
          empleadoId: empleado._id,
          periodo: fechaActualizacion,
          diasAcumulados: diasVacacionesNuevos,
          diasDisponibles:
            (empleado.diasVacacionesDisponibles || 0) + diasVacacionesNuevos,
          fechaActualizacion: fechaActualizacion,
        };

        await insertOne("vacaciones", registroVacaciones);

        await updateOne(
          "empleados",
          { _id: empleado._id },
          {
            $set: {
              diasVacacionesDisponibles: registroVacaciones.diasDisponibles,
            },
          }
        );

        registrosExitosos++;
      } catch (errorVacacion) {
        registrosErrores++;
        console.error(
          `Error procesando vacaciones para empleado ${empleado._id}:`,
          errorVacacion
        );
      }
    }

    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "completado",
      mensaje: "Actualización de período vacacional completada exitosamente",
      detalles: {
        fechaEjecucion: new Date().toISOString(),
        diasAcumulados: 6,
      },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
    });

    console.log("Período vacacional actualizado correctamente");
  } catch (error) {
    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "error",
      mensaje: "Error en actualización de período vacacional",
      detalles: { fechaEjecucion: new Date().toISOString() },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
      error: error.message,
    });

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
      "0 0 * * *",
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

    // Crear talones - Día 15 de cada mes a las 08:00
    await agenda.every(
      "0 8 15 * *",
      "crearTalones",
      {},
      {
        timezone: "America/Mexico_City",
      }
    );

    // Crear talones - Último día del mes a las 08:00 (28-31)
    await agenda.every(
      "0 8 28-31 * *",
      "crearTalones",
      {},
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
