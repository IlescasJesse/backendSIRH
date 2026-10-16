const { Router } = require("express");
const router = Router();
const reportesPersonalController = require("../../controllers/personal/reportesPersonal.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const { requirePermission } = require("../../middleware/permissionsMiddleware");
const multer = require("multer");

// Configuración para recibir el Excel en memoria
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // Máximo 10 MB
    },
    fileFilter: (req, file, cb) => {
        if (!/\.xlsx$/i.test(file.originalname)) {
            return cb(new Error("Solo se permiten archivos Excel .xlsx"));
        }

        cb(null, true);
    },
});

// Ruta para obtener buscar a los empleados de acuerdo a filtros y la generación del reporte
router.post("/getDataPersonalizada", verifyToken, requirePermission(['PSL-RP']), reportesPersonalController.getDataPersonalizada);

// Ruta para generar y descargar el reporte de la plantilla activa en excel
router.get("/getPlantillaXLSX/:status", verifyToken, requirePermission(['PSL-RP']), reportesPersonalController.getPlantillaXLSX);

// Ruta para generar y descargar el reporte de área actualmente
router.post("/getPlantillaReportArea", verifyToken, requirePermission(['PSL-RP']), reportesPersonalController.getPlantillaReportArea);

// Ruta para generar y descargar el reporte de las bajas entre un rango de fechas
router.post("/getBajasBetweenDates", verifyToken, requirePermission(['PSL-RP']), reportesPersonalController.getBajasBetweenDates);

// Ruta para generar y descargar el reporte de las licencias activas
router.get("/getReportLicenses", verifyToken, requirePermission(['PSL-RP']), reportesPersonalController.getReportLicenses);

// Ruta para generar y descargar el reporte de vacaciones de empleados por área
router.post("/getReportVacationsArea", verifyToken, requirePermission(['PSL-RPV']), reportesPersonalController.getReportVacationsArea);

// Ruta para comparar un Excel con la información de PLANTILLA
router.post("/compararExcelNomina", verifyToken, requirePermission(['PSL-CPN']), upload.single("archivo"), reportesPersonalController.getDifferencesBetweenPayroll);

module.exports = router;
