const Agenda = require("agenda");
const { ObjectId } = require("mongodb");
const { query, insertOne, updateOne } = require("./mongo");
const {
  crearTalonesParaFecha,
  getQuincenaInfo,
} = require("../libs/talonesQuincena");
const {
  ADSCRIPCIONES_AUDI,
  PROYECTOS_PLAN,
  PROYECTOS_CATASTRO,
  getAreaResp,
} = require("../libs/areaResp");
require("dotenv").config();


// Crear instancia de Agenda conectada a MongoDB SIRH2026
const agenda = new Agenda({
  db: {
    address: `${process.env.MONGO_URI}/SIRH2026`,
    collection: "AGENDA_LOGS",
  },
  processEvery: "5 seconds", // Verificar trabajos cada minuto
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
    new Date().toISOString(),
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
      discharge_date: { $lte: today },
      $or: [
        { PROCESADO: false },
        { PROCESADO: "false" },
        { PROCESADO: "FALSE" },
        { PROCESADO: { $exists: false } },
        { PROCESADO: null },
      ],
    });

    console.log(
      `Se encontraron ${bajasPendientes.length} bajas extemporáneas pendientes`,
    );

    registrosProcesados = bajasPendientes.length;

    for (const baja of bajasPendientes) {
      try {
        console.log(`Procesando baja extemporánea: ${baja._id}`);

        if (baja.discharge_date <= today && baja.reason !== "L-PRRO") {
          const limpiezaPlantilla = {
            CONSEC: null,
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
            ESTADO_CIVIL: null,
            NACIONAL: null,
            LUGARNAC: null,
            CP: null,
            TEL_PERSONAL: null,
            MADRE: null,
            PADRE: null,
            ALERGIA: null,
            TIPOPAG: null,
            BANCO: null,
            FOLNORTE: 0,
            CUENTA: null,
            FORBANA: null,
            NOMINA: null,
            EMAIL: null,
            DOMICILIO: null,
            PROFES: null,
            FECHA_NAC: null,
            APE_PAT: null,
            APE_MAT: "VACANTE",
            NOMBRES: null,
            AREA_RESP: null,
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
            STATUS_EMPLEADO: null,
            DIRECCION: {
              CP: 0,
              ESTADO: null,
              MUNICIPIO: null,
              LOCALIDAD: null,
              COLONIA: null,
              DOMICILIO: null,
              NUM_EXT: null,
            },
            CONYUGE: null,
            DIRECCION_FISCAL: {
              CP: 0,
              ESTADO: null,
              MUNICIPIO: null,
              LOCALIDAD: null,
              BARRIO: null,
              DOMICILIO: null,
              NUM_EXT: null,
            },
            EMAIL_INSTITUCIONAL: null,
            ESTADONAC: null,
            ESTUDIOS: null,
            FECHA_NOMBRAMIENTO: null,
            SINDICATO: {
              AFILIADO: false,
              DELEGACION: null,
              DELEGADO: null,
              FECHA_AFILIACION: null,
            },
            FECHA_ENTRADA_DEFINITIVA: null,
            GASCOM: 0,
            GUARDE: 0,
            NACIONALIDAD: null,
            NUMPLA_ORIGEN: null,
            PARENTESCO: null,
            SUELDO_GRV: 0,
            TEL_CASA: null,
            TIPONOM: baja.TIPONOM || null,
            MOD_ANTE: baja.MOD_ANTE || null,
          };

          let plantillaResult = null;
          if (baja.id_employee) {
            try {
              plantillaResult = await updateOne(
                "PLANTILLA",
                { _id: new ObjectId(String(baja.id_employee)) },
                { $set: limpiezaPlantilla },
              );
            } catch (errorIdObjectId) {
              console.warn(
                `id_employee no válido como ObjectId (${baja.id_employee}): ${errorIdObjectId.message}`,
              );
            }
          }

          if (!plantillaResult || plantillaResult.matchedCount === 0) {
            plantillaResult = await updateOne(
              "PLANTILLA",
              { _id: String(baja.id_employee) },
              { $set: limpiezaPlantilla },
            );
          }

          if (
            (!plantillaResult || plantillaResult.matchedCount === 0) &&
            baja.NUMPLA !== undefined &&
            baja.NUMPLA !== null
          ) {
            const numplaValue = String(baja.NUMPLA);
            const numplaAsNumber = Number(numplaValue);
            const filtrosNumpla = [{ NUMPLA: numplaValue }];
            if (!Number.isNaN(numplaAsNumber)) {
              filtrosNumpla.push({ NUMPLA: numplaAsNumber });
            }

            plantillaResult = await updateOne(
              "PLANTILLA",
              { $or: filtrosNumpla },
              { $set: limpiezaPlantilla },
            );
          }

          if (!plantillaResult || plantillaResult.matchedCount === 0) {
            console.warn(
              `No se encontró registro en PLANTILLA para id_empleado: ${baja.id_employee} ni por NUMPLA: ${baja.NUMPLA}`,
            );
            registrosErrores++;
          } else {
            console.log(
              `PLANTILLA limpiada correctamente para baja ${baja._id}`,
            );
          }

          const numplaValue = String(baja.NUMPLA);
          const numplaAsNumber = Number(numplaValue);
          const filtrosPlaza = [{ NUMPLA: numplaValue }];
          if (!Number.isNaN(numplaAsNumber)) {
            filtrosPlaza.push({ NUMPLA: numplaAsNumber });
          }

          const plazaResult = await updateOne(
            "PLAZAS",
            { $or: filtrosPlaza },
            { $set: { status: 2 } },
          );

          if (!plazaResult || plazaResult.matchedCount === 0) {
            console.warn(
              `No se encontró registro en PLAZAS para NUMPLA: ${baja.NUMPLA}`,
            );
          } else {
            console.log(
              `PLAZAS actualizada a status=2 para NUMPLA: ${baja.NUMPLA}`,
            );
          }
        }

        await updateOne(
          "BAJAS",
          { _id: baja._id },
          { $set: { PROCESADO: true, fechaProceso: new Date() } },
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
    new Date().toISOString(),
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
      `Se encontraron ${altasPendientes.length} altas extemporáneas pendientes`,
    );

    registrosProcesados = altasPendientes.length;

    for (const alta of altasPendientes) {
      try {
        console.log(`Procesando alta extemporánea: ${alta._id}`);

        await updateOne(
          "altasExtemporaneas",
          { _id: alta._id },
          { $set: { procesado: true, fechaProceso: new Date() } },
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
    new Date().toISOString(),
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
      `Se encontraron ${licenciasPendientes.length} licencias extemporáneas pendientes`,
    );

    registrosProcesados = licenciasPendientes.length;

    for (const licencia of licenciasPendientes) {
      try {
        console.log(`Procesando licencia extemporánea: ${licencia._id}`);

        await updateOne(
          "licenciasExtemporaneas",
          { _id: licencia._id },
          { $set: { procesado: true, fechaProceso: new Date() } },
        );

        registrosExitosos++;
      } catch (errorLicencia) {
        registrosErrores++;
        console.error(
          `Error procesando licencia ${licencia._id}:`,
          errorLicencia,
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
    const fechaJob = job?.attrs?.data?.fecha
      ? new Date(job.attrs.data.fecha)
      : new Date();
    const forzar = Boolean(job?.attrs?.data?.forzar);
    const infoQuincena = getQuincenaInfo(fechaJob);

    if (!infoQuincena.esDiaPago && !forzar) {
      await registrarActividadAgenda({
        tarea: nombreTarea,
        estado: "omitido",
        mensaje: `No es día de pago. Día actual: ${infoQuincena.dia}/${infoQuincena.mes}/${infoQuincena.anio}`,
        detalles: {
          dia: infoQuincena.dia,
          mes: infoQuincena.mes,
          anio: infoQuincena.anio,
          fechaEvaluada: infoQuincena.fechaMx.format("YYYY-MM-DD"),
        },
        registrosProcesados: 0,
        registrosExitosos: 0,
        registrosErrores: 0,
        duracion: Date.now() - inicioTarea,
      });

      return;
    }

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "iniciado",
      mensaje: `Iniciando creación de talones - Quincena ${infoQuincena.quincenaDelAnio}`,
      detalles: {
        fechaEjecucion: new Date().toISOString(),
        quincena: infoQuincena.quincenaDelAnio,
        fechaPago: infoQuincena.fechaMx.format("YYYY-MM-DD"),
        forzada: forzar,
      },
    });

    const resultado = await crearTalonesParaFecha({
      fechaBase: fechaJob,
      forzar,
    });

    registrosProcesados = resultado.registrosProcesados;
    registrosExitosos = resultado.registrosExitosos;
    registrosErrores = resultado.registrosErrores;

    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "completado",
      mensaje: `Creados ${registrosExitosos} talones para quincena ${resultado.quincenaDelAnio}`,
      detalles: {
        fechaEjecucion: new Date().toISOString(),
        quincena: resultado.quincenaDelAnio,
        fechaPago: resultado.fechaMx.format("YYYY-MM-DD"),
        forzada: forzar,
      },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
    });

    console.log(
      `✓ Talones generados: ${registrosExitosos} de ${registrosProcesados} empleados (Quincena ${resultado.quincenaDelAnio})`,
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
    new Date().toISOString(),
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
      `Actualizando período vacacional para ${empleados.length} empleados`,
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
          },
        );

        registrosExitosos++;
      } catch (errorVacacion) {
        registrosErrores++;
        console.error(
          `Error procesando vacaciones para empleado ${empleado._id}:`,
          errorVacacion,
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

// Tarea: Limpiar status de empleados - Se ejecuta cada 24 horas
agenda.define("limpiarStatusEmpleado", async (job) => {
  const inicioTarea = Date.now();
  const nombreTarea = "limpiarStatusEmpleado";
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });

  console.log(
    "Ejecutando tarea de limpieza de status del empleados:",
    new Date().toISOString(),
  );

  await registrarActividadAgenda({
    tarea: nombreTarea,
    estado: "iniciado",
    mensaje: "Iniciando limpieza de status de empleados",
    detalles: { fechaEjecucion: new Date().toISOString() },
  });

  let registrosProcesados = 0;
  let registrosExitosos = 0;
  let registrosErrores = 0;

  try {
    const empleados = await query("PLANTILLA", {
      status: 1,
      STATUS_EMPLEADO: { $exists: true, $ne: [] },
    });

    console.log(
      `Actualizando status de ${empleados.length} empleados`,
    );

    registrosProcesados = empleados.length;
    const fechaActual = new Date().toISOString().slice(0, 10);

    for (const empleado of empleados) {
      try {

        const statusEmpleado = empleado.STATUS_EMPLEADO || [];
        const nuevosStatus = statusEmpleado.filter((item) => {
          return !item.HASTA || item.HASTA >= fechaActual;
        });

        const updateFields = {
          STATUS_EMPLEADO: nuevosStatus,
        };

        const hasAsignLab = nuevosStatus.some((item) => item.STATUS === "ASIG_LAB");
        if (!hasAsignLab) {
          updateFields.AREA_RESP = getAreaResp(empleado.ADSCRIPCION, empleado.PROYECTO);
        }

        if (nuevosStatus.length !== statusEmpleado.length) {
          // Identificar estados expirados (removidos)
          const removedStatuses = statusEmpleado.filter((item) => item.HASTA && item.HASTA < fechaActual);

          const remainingStatus = nuevosStatus[0] || null;

          for (let i = 0; i < removedStatuses.length; i++) {
            const removed = removedStatuses[i];

            const hsy_data = {
              STATUS: remainingStatus ? remainingStatus.STATUS : null,
              LUGAR_COMISIONADO: remainingStatus ? remainingStatus.LUGAR_COMISIONADO : null,
              DESDE: remainingStatus ? remainingStatus.DESDE : null,
              HASTA: remainingStatus ? remainingStatus.HASTA : null,
              PROYECTO: remainingStatus ? remainingStatus.PROYECTO : null,
              CLAVE: remainingStatus ? remainingStatus.CLAVE : null,
              FOLIO: remainingStatus ? remainingStatus.FOLIO : null,
              currentDateTime,
              last_status: removed.STATUS,
              last_lugarComisionado: removed.LUGAR_COMISIONADO,
              last_desde: removed.DESDE,
              last_hasta: removed.HASTA,
              last_proyecto: removed.PROYECTO,
              last_clave: removed.CLAVE,
              last_folio: removed.FOLIO,
              id_employee: empleado._id,
            };
            delete hsy_data._id;
            await insertOne("HSY_STATUS_EMPLEADO", hsy_data);
          }

          // Actualizar el STATUS_EMPLEADO con los nuevos (sin expirados)
          await updateOne(
            "PLANTILLA",
            { _id: empleado._id },
            { $set: updateFields },
          );
          console.log(`Status limpiado para empleado ${empleado._id}`);
        }

        registrosExitosos++;
      } catch (errorStatus) {
        registrosErrores++;
        console.error(
          `Error procesando status para empleado ${empleado._id}:`,
          errorStatus,
        );
      }
    }

    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "completado",
      mensaje: "Actualización de status completada exitosamente",
      detalles: {
        fechaEjecucion: new Date().toISOString(),
      },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
    });

    console.log("Status de empleados actualizado correctamente");
  } catch (error) {
    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "error",
      mensaje: "Error en actualización de status empleado",
      detalles: { fechaEjecucion: new Date().toISOString() },
      registrosProcesados,
      registrosExitosos,
      registrosErrores,
      duracion,
      error: error.message,
    });

    console.error("Error en tarea de gestión de status de empleados:", error);
  }
});

// Tarea: Backup automático - Se ejecuta diariamente a las 20:00
agenda.define("realizarBackup", async (job) => {
  const inicioTarea = Date.now();
  const nombreTarea = "realizarBackup";

  const { runBackup } = require("../../scripts/backup/backup");

  console.log("Ejecutando backup automático:", new Date().toISOString());

  await registrarActividadAgenda({
    tarea: nombreTarea,
    estado: "iniciado",
    mensaje: "Iniciando backup diario (MySQL + MongoDB)",
    detalles: { fechaEjecucion: new Date().toISOString() },
  });

  let logs = [];
  try {
    const resultado = await runBackup({
      onLog: (msg, type) => {
        logs.push({ msg, type });
        console.log(msg);
      },
    });

    const duracion = Date.now() - inicioTarea;

    if (resultado.success) {
      await registrarActividadAgenda({
        tarea: nombreTarea,
        estado: "completado",
        mensaje: `Backup completado: ${resultado.results.zip?.sizeMB || 0} MB comprimido`,
        detalles: {
          fechaEjecucion: new Date().toISOString(),
          archivo: resultado.zipPath,
          mysql: resultado.results.mysql,
          mongo: resultado.results.mongo,
          logs,
        },
        duracion,
      });
      console.log(`✓ Backup automático completado en ${duracion}ms`);
    } else {
      await registrarActividadAgenda({
        tarea: nombreTarea,
        estado: "error",
        mensaje: "Backup completado con errores",
        detalles: {
          fechaEjecucion: new Date().toISOString(),
          mysql: resultado.results.mysql,
          mongo: resultado.results.mongo,
          error: resultado.error,
          logs,
        },
        duracion,
      });
      console.error("⚠ Backup automático completado con errores");
    }
  } catch (error) {
    const duracion = Date.now() - inicioTarea;

    await registrarActividadAgenda({
      tarea: nombreTarea,
      estado: "error",
      mensaje: "Error crítico en backup automático",
      detalles: { fechaEjecucion: new Date().toISOString(), logs },
      duracion,
      error: error.message,
    });

    console.error("✗ Error en backup automático:", error.message);
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
      //"*/5 * * * * *",
      "bajasExtemporaneas",
      {},
      {
        timezone: "America/Mexico_City",
      },
    );

    // Altas extemporáneas - Diariamente a las 01:00
    await agenda.every(
      "0 1 * * *",
      "altasExtemporaneas",
      {},
      {
        timezone: "America/Mexico_City",
      },
    );

    // Licencias extemporáneas - Diariamente a las 02:00
    await agenda.every(
      "0 2 * * *",
      "licenciasExtemporaneas",
      {},
      {
        timezone: "America/Mexico_City",
      },
    );

    // Crear talones - Día 15 de cada mes a las 08:00
    await agenda.every(
      "0 8 15 * *",
      "crearTalones",
      {},
      {
        timezone: "America/Mexico_City",
      },
    );

    // Crear talones - Último día del mes a las 08:00 (28-31)
    await agenda.every(
      "0 8 28-31 * *",
      "crearTalones",
      {},
      {
        timezone: "America/Mexico_City",
      },
    );

    // Gestionar período vacacional - Cada 6 meses
    await agenda.every(
      "6 months",
      "gestionarPeriodoVacacional",
      {},
      {
        skipImmediate: true,
      },
    );

    // Limpiar status de empleados - Cada 24 horas
    await agenda.every(
      "0 0 * * *",
      //"10 seconds",
      "limpiarStatusEmpleado",
      {},
      {
        timezone: "America/Mexico_City",
      },
    );

    // Backup automático - Diariamente a las 20:00 (8 PM)
    await agenda.every(
      "0 20 * * *",
      "realizarBackup",
      {},
      {
        timezone: "America/Mexico_City",
      },
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
