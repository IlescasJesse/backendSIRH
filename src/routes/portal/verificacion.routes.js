// Pública, sin auth: verificación de documentos por folio + código.
const { Router } = require("express");
const router = Router();
const constanciasController = require("../../controllers/portal/constancias.Controller");
const rateLimitVerificacion = require("../../middleware/rateLimitVerificacion");

router.get("/:folio", rateLimitVerificacion, constanciasController.verificar);

module.exports = router;
