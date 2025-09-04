const { Router } = require("express");
const router = Router();
const reportesPersonalController = require("../../controllers/personal/reportesPersonal.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get(
    "/getReportVacants/:queryParam",
    verifyToken,
    reportesPersonalController.getReportVacants
);

router.get(
    "/getReportLicenses",
    verifyToken,
    reportesPersonalController.getReportLicenses
);

module.exports = router;
