const express = require("express");
const router = express.Router();
const verifyToken = require("../../middleware/authMiddleware");
const { query, insertOne, updateOne } = require("../../config/mongo");
const { agenda } = require("../../config/agenda");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");

// Secret key para JWT (misma que en authMiddleware)
const SECRET_KEY =
  "639ucb29m39h4vyfkn0j4a7fq45ib2fiaojoomon57bhr7t86wuybuj9tc4meqx4";

// Login específico para app móvil
router.post("/login", async (req, res) => {
  const { username, password, deviceId } = req.body;

  console.log("\n=== LOGIN MÓVIL ===");
  console.log("Username:", username);
  console.log("Device ID:", deviceId);
  console.log("IP:", req.connection.remoteAddress || req.socket.remoteAddress);

  try {
    // Buscar usuario en MongoDB tabla USUARIOS
    const users = await query("USUARIOS", { username });

    if (users.length === 0) {
      console.log("❌ Usuario no encontrado:", username);
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    const user = users[0];
    console.log("✓ Usuario encontrado:", user.username);

    // Verificar que el usuario tenga contraseña
    if (!user.password) {
      console.log("❌ Usuario sin contraseña configurada");
      return res.status(401).json({
        success: false,
        message: "Usuario sin contraseña configurada",
      });
    }

    // Verificar contraseña
    console.log("Verificando contraseña...");
    const isPasswordValid = await bcryptjs.compare(password, user.password);

    if (!isPasswordValid) {
      console.log("❌ Contraseña inválida");
      return res.status(401).json({
        success: false,
        message: "Credenciales inválidas",
      });
    }

    console.log("✓ Contraseña válida");

    // Generar token JWT
    console.log("Generando token JWT...");
    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
        role: user.role || "user",
      },
      SECRET_KEY,
      { expiresIn: "7d" }
    );

    console.log("✓ Token generado");

    // Guardar sesión móvil en SESIONES_MOBILE (colección separada)
    console.log("Guardando sesión en SESIONES_MOBILE...");
    await insertOne("SESIONES_MOBILE", {
      jwt: token,
      username: user.username,
      userId: user._id,
      deviceId,
      loginTime: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      ip: req.connection.remoteAddress || req.socket.remoteAddress,
      platform: "mobile",
      userAgent: req.headers["user-agent"] || "unknown",
    });

    console.log("✓ Sesión móvil guardada");

    // Registrar login móvil
    await insertOne("MOBILE_LOGINS", {
      userId: user._id,
      username: user.username,
      deviceId,
      timestamp: new Date(),
      ip: req.connection.remoteAddress || req.socket.remoteAddress,
    });

    console.log("✓ Login exitoso para:", username);
    console.log("===================\n");

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role || "user",
        fullName: user.fullName,
      },
    });
  } catch (error) {
    console.error("\n❌ ERROR EN LOGIN MÓVIL:");
    console.error("Error completo:", error);
    console.error("Stack:", error.stack);
    console.error("===================\n");

    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      error: error.message,
    });
  }
});

// Rutas protegidas con token JWT
router.use(verifyToken);

// Dashboard principal
router.get("/dashboard", async (req, res) => {
  try {
    const logs = await query("AGENDA_LOGS", {}, { limit: 100 });

    const totalLogs = logs.length;
    const completedTasks = logs.filter(
      (log) => log.estado === "completado"
    ).length;
    const failedTasks = logs.filter((log) => log.estado === "error").length;
    const successRate = totalLogs > 0 ? (completedTasks / totalLogs) * 100 : 0;

    const recentActivities = logs
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 10)
      .map((log) => ({
        tarea: log.tarea,
        estado: log.estado,
        mensaje: log.mensaje,
        timestamp: log.timestamp,
      }));

    res.json({
      totalLogs,
      completedTasks,
      failedTasks,
      successRate: Math.round(successRate * 10) / 10,
      recentActivities,
    });
  } catch (error) {
    console.error("Error en dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener dashboard",
    });
  }
});

// Logs de Agenda
router.get("/agenda/logs", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const logs = await query(
      "AGENDA_LOGS",
      {},
      { sort: { timestamp: -1 }, limit }
    );

    res.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error("Error al obtener logs:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener logs",
    });
  }
});

// Estadísticas de Agenda
router.get("/agenda/stats", async (req, res) => {
  try {
    const logs = await query("AGENDA_LOGS", {});

    const totalTasks = logs.length;
    const successfulTasks = logs.filter(
      (log) => log.estado === "completado"
    ).length;
    const failedTasks = logs.filter((log) => log.estado === "error").length;

    const taskStats = {};
    logs.forEach((log) => {
      if (!taskStats[log.tarea]) {
        taskStats[log.tarea] = {
          total: 0,
          completados: 0,
          errores: 0,
        };
      }
      taskStats[log.tarea].total++;
      if (log.estado === "completado") taskStats[log.tarea].completados++;
      if (log.estado === "error") taskStats[log.tarea].errores++;
    });

    res.json({
      success: true,
      totalTasks,
      successfulTasks,
      failedTasks,
      taskStats,
    });
  } catch (error) {
    console.error("Error al obtener estadísticas:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener estadísticas",
    });
  }
});

// Ejecutar tarea de Agenda
router.post("/agenda/run/:taskName", async (req, res) => {
  const { taskName } = req.params;

  try {
    // Validar que la tarea existe
    const validTasks = [
      "bajasExtemporaneas",
      "altasExtemporaneas",
      "licenciasExtemporaneas",
      "crearTalones",
      "gestionarPeriodoVacacional",
    ];

    if (!validTasks.includes(taskName)) {
      return res.status(400).json({
        success: false,
        message: "Tarea no válida",
      });
    }

    // Ejecutar tarea ahora
    await agenda.now(taskName);

    // Registrar ejecución manual
    await insertOne("MANUAL_EXECUTIONS", {
      tarea: taskName,
      ejecutadoPor: req.user.username,
      userId: req.user.id,
      timestamp: new Date(),
      tipo: "mobile",
    });

    res.json({
      success: true,
      message: `Tarea "${taskName}" ejecutada correctamente`,
    });
  } catch (error) {
    console.error("Error al ejecutar tarea:", error);
    res.status(500).json({
      success: false,
      message: `Error al ejecutar tarea: ${error.message}`,
    });
  }
});

// Estado del servidor
router.get("/server/health", (req, res) => {
  const memoryUsage = process.memoryUsage();

  res.json({
    success: true,
    uptime: process.uptime(),
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
    },
    timestamp: new Date(),
    version: process.version,
  });
});

// Logs recientes (general)
router.get("/logs/recent", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const logs = await query(
      "AGENDA_LOGS",
      {},
      { sort: { timestamp: -1 }, limit }
    );

    res.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error("Error al obtener logs recientes:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener logs",
    });
  }
});

// Endpoint para resetear/reiniciar el servidor (solo admin)
router.post("/admin/reset", async (req, res) => {
  const user = req.user;

  console.log("\n=== RESET SERVIDOR ===");
  console.log("Usuario:", user.username);
  console.log("Rol:", user.role);

  try {
    // Verificar que el usuario sea admin
    if (user.role !== "admin" && user.role !== "superadmin") {
      console.log("❌ Acceso denegado - Usuario no es admin");
      return res.status(403).json({
        success: false,
        message: "Acceso denegado. Se requieren permisos de administrador.",
      });
    }

    console.log("✓ Usuario autorizado");
    console.log("⚠ Reiniciando servidor en 2 segundos...");

    // Enviar respuesta antes de reiniciar
    res.json({
      success: true,
      message:
        "Servidor reiniciándose... Espera 10-15 segundos antes de volver a conectar.",
    });

    // Reiniciar el proceso después de enviar la respuesta
    setTimeout(() => {
      console.log("🔄 REINICIANDO SERVIDOR...");
      process.exit(0); // Termina el proceso (PM2, nodemon o el gestor de procesos lo reiniciará automáticamente)
    }, 2000);
  } catch (error) {
    console.error("\n❌ ERROR AL REINICIAR SERVIDOR:");
    console.error("Error completo:", error);
    console.error("Stack:", error.stack);
    console.error("===================\n");

    res.status(500).json({
      success: false,
      message: "Error al reiniciar servidor",
      error: error.message,
    });
  }
});

// ==================== BAJAS EXTEMPORÁNEAS ====================

// Obtener todas las bajas pendientes (PROCESADO: false)
router.get("/bajas/pendientes", async (req, res) => {
  const user = req.user;

  console.log("\n=== CONSULTA BAJAS PENDIENTES ===");
  console.log("Usuario:", user.username);

  try {
    const today = new Date().toISOString().slice(0, 10);

    // Obtener todas las bajas pendientes de procesar
    const bajasPendientes = await query("BAJAS", {
      PROCESADO: false,
    });

    console.log(`✓ Se encontraron ${bajasPendientes.length} bajas pendientes`);

    // Obtener información de los empleados para cada baja
    const bajasConEmpleado = await Promise.all(
      bajasPendientes.map(async (baja) => {
        let empleado = null;

        if (baja.id_employee) {
          try {
            const empleados = await query("PLANTILLA", {
              _id: new ObjectId(baja.id_employee),
            });
            empleado = empleados.length > 0 ? empleados[0] : null;
          } catch (error) {
            console.error(
              `Error obteniendo empleado ${baja.id_employee}:`,
              error
            );
          }
        }

        return {
          _id: baja._id ? baja._id.toString() : null,
          id_employee: baja.id_employee ? baja.id_employee.toString() : null,

          // Datos del empleado desde BAJAS
          NOMBRE: baja.NOMBRE || null,
          APE_PAT: baja.APE_PAT || null,
          APE_MAT: baja.APE_MAT || null,
          NOMBRES: baja.NOMBRES || null,
          CURP: baja.CURP || null,
          RFC: baja.RFC || null,
          SEXO: baja.SEXO || null,

          // Datos de plaza y categoría
          NUMPLA: baja.NUMPLA ? String(baja.NUMPLA) : null,
          NUMEMP: baja.NUMEMP ? String(baja.NUMEMP) : null,
          TIPONOM: baja.TIPONOM || null,
          CLAVECAT: baja.CLAVECAT || null,
          CATEGORIA_DESCRIPCION: baja.CATEGORIA_DESCRIPCION || null,
          NIVEL: baja.NIVEL || null,

          // Ubicación
          CP: baja.CP ? String(baja.CP) : null,
          ESTADO: baja.ESTADO || null,
          MUNICIPIO: baja.MUNICIPIO || null,
          COLONIA: baja.COLONIA || null,
          DOMICILIO: baja.DOMICILIO || null,
          NUM_EXT: baja.NUM_EXT || null,
          DOMICLIO_COMPLETO: baja.DOMICLIO_COMPLETO || null,

          // Unidad y proyecto
          UNIDAD_RESPONSABLE: baja.UNIDAD_RESPONSABLE || null,
          PROYECTO: baja.PROYECTO || null,

          // Datos de la baja
          discharge_date: baja.discharge_date || null,
          reason: baja.reason || "",
          time: baja.time || null,
          TIEMPO_BAJA: baja.TIEMPO_BAJA || null,
          OWNER: baja.OWNER || false,
          PROCESADO: baja.PROCESADO || false,
          createdAt: baja.createdAt || null,

          // Información del empleado desde PLANTILLA (si existe)
          empleado: empleado
            ? {
                _id: empleado._id ? empleado._id.toString() : null,
                nombre: `${empleado.NOMBRES || ""} ${empleado.APE_PAT || ""} ${
                  empleado.APE_MAT || ""
                }`.trim(),
                NUMEMP: empleado.NUMEMP ? String(empleado.NUMEMP) : null,
                status:
                  empleado.status !== null && empleado.status !== undefined
                    ? Number(empleado.status)
                    : null,
              }
            : null,

          // Indicadores
          esHoy: baja.discharge_date === today,
          esPasada: baja.discharge_date < today,
          esFutura: baja.discharge_date > today,
        };
      })
    );

    // Ordenar por fecha de baja
    bajasConEmpleado.sort(
      (a, b) => new Date(a.discharge_date) - new Date(b.discharge_date)
    );

    console.log("===================\n");

    res.json({
      success: true,
      total: bajasConEmpleado.length,
      bajas: bajasConEmpleado,
      fechaConsulta: today,
    });
  } catch (error) {
    console.error("\n❌ ERROR AL CONSULTAR BAJAS PENDIENTES:");
    console.error("Error completo:", error);
    console.error("===================\n");

    res.status(500).json({
      success: false,
      message: "Error al consultar bajas pendientes",
      error: error.message,
    });
  }
});

// Ejecutar una baja específica manualmente
router.post("/bajas/ejecutar/:bajaId", async (req, res) => {
  const user = req.user;
  const { bajaId } = req.params;

  console.log("\n=== EJECUTAR BAJA MANUAL ===");
  console.log("Usuario:", user.username);
  console.log("Baja ID:", bajaId);

  try {
    // Buscar la baja
    const bajas = await query("BAJAS", {
      _id: new ObjectId(bajaId),
    });

    if (bajas.length === 0) {
      console.log("❌ Baja no encontrada");
      return res.status(404).json({
        success: false,
        message: "Baja no encontrada",
      });
    }

    const baja = bajas[0];

    // Verificar que no esté procesada
    if (baja.PROCESADO) {
      console.log("⚠️ Baja ya procesada");
      return res.status(400).json({
        success: false,
        message: "Esta baja ya fue procesada anteriormente",
      });
    }

    console.log("✓ Baja encontrada, procesando...");

    // Ejecutar la misma lógica que bajasExtemporaneas
    const today = new Date().toISOString().slice(0, 10);
    let procesoExitoso = false;
    let mensaje = "";

    if (baja.discharge_date <= today && baja.reason !== "L-PRRO") {
      // Actualizar PLANTILLA
      const plantillaResult = await updateOne(
        "PLANTILLA",
        { _id: new ObjectId(baja.id_employee) },
        {
          $set: {
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

      if (plantillaResult && plantillaResult.matchedCount > 0) {
        console.log("✓ Empleado actualizado en PLANTILLA");
      } else {
        console.warn("⚠️ No se encontró empleado en PLANTILLA");
      }

      // Actualizar PLAZAS
      const plazaResult = await updateOne(
        "PLAZAS",
        { NUMPLA: baja.NUMPLA },
        { $set: { status: 2 } }
      );

      if (plazaResult && plazaResult.matchedCount > 0) {
        console.log("✓ Plaza actualizada");
      }

      procesoExitoso = true;
      mensaje = "Baja procesada exitosamente. Empleado y plaza actualizados.";
    } else if (baja.discharge_date > today) {
      mensaje = "Esta baja es para una fecha futura. No se puede procesar aún.";
    } else if (baja.discharge_date < today) {
      mensaje = "Esta baja es de una fecha pasada. Se marcará como procesada.";
      procesoExitoso = true;
    } else if (baja.reason === "L-PRRO") {
      mensaje =
        "Esta baja tiene motivo L-PRRO. Se marca como procesada sin cambios.";
      procesoExitoso = true;
    }

    // Marcar como procesada
    await updateOne(
      "BAJAS",
      { _id: new ObjectId(bajaId) },
      {
        $set: {
          PROCESADO: true,
          fechaProceso: new Date(),
          procesadoPor: user.username,
          procesoManual: true,
        },
      }
    );

    console.log("✓ Baja marcada como PROCESADO: true");
    console.log("===================\n");

    res.json({
      success: true,
      message: mensaje,
      procesoExitoso,
      baja: {
        _id: baja._id ? baja._id.toString() : null,
        discharge_date: baja.discharge_date || null,
        PROCESADO: true,
        fechaProceso: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("\n❌ ERROR AL EJECUTAR BAJA:");
    console.error("Error completo:", error);
    console.error("Stack:", error.stack);
    console.error("===================\n");

    res.status(500).json({
      success: false,
      message: "Error al ejecutar baja",
      error: error.message,
    });
  }
});

module.exports = router;
