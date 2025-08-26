const { Router } = require("express");
const router = Router();
const offEmployeeController = require("../../controllers/personal/offEmployees.Controller");
const verifyToken = require("../../middleware/authMiddleware");

router.post(
  "/getDataOff/:query",
  verifyToken,
  offEmployeeController.getDatatoOff
);
router.post("/saveDataOff", verifyToken, offEmployeeController.saveDataOff);
router.get(
  "/getRecent-casualties",
  verifyToken,
  offEmployeeController.getRecentCasualties
);
router.post(
  "/download-baja/:curp",
  verifyToken,
  offEmployeeController.downloadBaja
);
router.get(
  "/getDataLicenses/:numpla",
  verifyToken,
  offEmployeeController.getDataLicenses
);
router.get("/getLicenses", verifyToken, offEmployeeController.getLicenses);
// router.put(
//   "/updateLicense/:id",
//   verifyToken,
//   offEmployeeController.updateLicense
// );

module.exports = router;
