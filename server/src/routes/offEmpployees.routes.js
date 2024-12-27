const { Router } = require("express");
const router = Router();
const offEmployeeController = require("../controllers/offEmployees.Controller");

router.post("/getDataOff/:query", offEmployeeController.getDatatoOff);
router.post("/saveDataOff", offEmployeeController.saveDataOff);

module.exports = router;
