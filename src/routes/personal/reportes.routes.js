const { Router } = require("express");
const router = Router();
const reportesPersonalController = require("../../controllers/personal/reportesPersonal.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.get(
  "/getReportLicenses",
  verifyToken,
  reportesPersonalController.getReportLicenses,
);

router.post(
  "/getDataPersonalizada",
  verifyToken,
  reportesPersonalController.getDataPersonalizada,
);

router.get(
  "/getPlantillaXLSX/:status",
  verifyToken,
  reportesPersonalController.getPlantillaXLSX,
);

router.post(
  "/getBajasBetweenDates",
  verifyToken,
  reportesPersonalController.getBajasBetweenDates,
);

router.post(
  "/getPlantillaReportArea",
  verifyToken,
  reportesPersonalController.getPlantillaReportArea,
);

module.exports = router;
