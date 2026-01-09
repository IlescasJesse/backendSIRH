const { Router } = require("express");
const router = Router();
const reportesPersonalController = require("../../controllers/personal/reportesPersonal.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.post(
  "/getReportVacants/:queryParam",
  verifyToken,
  reportesPersonalController.getReportVacants
);

router.post(
  "/getReportLicenses",
  verifyToken,
  reportesPersonalController.getReportLicenses
);

router.post(
  "/getDataPersonalizada",
  verifyToken,
  reportesPersonalController.getDataPersonalizada
);

router.get(
  "/getPlantillaXLSX/:status",
  verifyToken,
  reportesPersonalController.getPlantillaXLSX
);

module.exports = router;
