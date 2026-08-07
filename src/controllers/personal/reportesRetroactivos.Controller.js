const moment = require("moment");
require("moment/locale/es");
moment.locale("es");

const { withDatabase: withMongoDatabase, dropDatabase: dropMongoDatabase } = require("../../config/mongo");
const { withDatabase: withMysqlDatabase } = require("../../config/mysql");
const {
  TEMP_DB,
  MYSQL_TEMP_DB,
  listBackupDates,
  restoreMongoCollections,
  restoreMysqlCatalogos,
  dropMysqlTempDatabase,
} = require("../../services/backupRestore.service");
const reportesPersonalController = require("./reportesPersonal.Controller");

const reportesRetroactivosController = {};

const getIO = (req) => req.app.get("io");

// Progreso siempre se emite a la sala del usuario que pidió el reporte,
// así el frontend puede mostrarle qué está pasando (restaurando backup,
// generando excel, etc.) mientras espera.
function emitProgreso(io, username, mensaje, status = "en_progreso") {
  if (!io || !username) return;
  io.to(`USER_${username}`).emit("reporte-retroactivo-progreso", {
    mensaje,
    status,
    timestamp: new Date().toISOString(),
  });
}

reportesRetroactivosController.getBackupDatesAvailable = async (req, res) => {
  try {
    const fechas = await listBackupDates();
    const data = fechas.map((fecha) => ({
      fecha,
      label: moment(fecha, "YYYY-MM-DD").format("DD [DE] MMMM [DE] YYYY").toUpperCase(),
    }));
    res.status(200).json({ fechas: data });
  } catch (error) {
    console.error("Error al listar backups disponibles:", error);
    res.status(500).json({
      message: "No se pudo consultar los backups disponibles",
      error: error.message,
    });
  }
};

reportesRetroactivosController.getPlantillaReportAreaRetroactivo = async (req, res) => {
  const io = getIO(req);
  const username = req.user?.username;
  const { FECHA_BACKUP } = req.body;

  if (!FECHA_BACKUP) {
    return res.status(400).json({ message: "Falta la fecha de backup (FECHA_BACKUP)" });
  }

  try {
    emitProgreso(io, username, `Verificando backup del ${FECHA_BACKUP}...`);

    const progressCb = (mensaje) => emitProgreso(io, username, mensaje);

    // Mongo: PLANTILLA/BAJAS/LICENCIAS/etc. -> base temporal SIRH2026_BK
    await restoreMongoCollections(FECHA_BACKUP, undefined, progressCb);

    // MySQL: catálogos de sueldo/ISR/adscripciones de esa misma fecha -> base temporal sirh_bk
    await restoreMysqlCatalogos(FECHA_BACKUP, progressCb);

    emitProgreso(io, username, "Backup restaurado, generando reporte...");

    // Reusa exactamente la misma lógica de getPlantillaReportArea (filtros,
    // catálogos de sueldo, layout de Excel), pero apuntando ambas bases
    // (Mongo y MySQL) a las copias temporales restauradas de esa fecha.
    await withMysqlDatabase(MYSQL_TEMP_DB, () =>
      withMongoDatabase(TEMP_DB, () =>
        reportesPersonalController.getPlantillaReportArea(req, res)
      )
    );

    emitProgreso(io, username, "Reporte generado correctamente", "completado");
  } catch (error) {
    console.error("Error al generar reporte retroactivo:", error);
    emitProgreso(io, username, error.message || "Error al generar el reporte histórico", "error");

    if (!res.headersSent) {
      res.status(500).json({
        message: "Error al generar el reporte histórico",
        error: error.message,
      });
    }
  } finally {
    try {
      await dropMongoDatabase(TEMP_DB);
    } catch (cleanupError) {
      console.error("Error al limpiar base Mongo temporal:", cleanupError);
    }
    try {
      await dropMysqlTempDatabase();
    } catch (cleanupError) {
      console.error("Error al limpiar base MySQL temporal:", cleanupError);
    }
  }
};

module.exports = reportesRetroactivosController;
