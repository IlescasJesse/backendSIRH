const { Router } = require("express");
const router = Router();
const offEmployeeController = require("../controllers/offEmployees.Controller");

router.post("/getDataOff/:query", offEmployeeController.getDatatoOff);
router.post("/saveDataOff", offEmployeeController.saveDataOff);
router.get("/getRecent-casualties", offEmployeeController.getRecentCasualties);
router.post("/download-baja/:curp", offEmployeeController.downloadBaja);

module.exports = router;
