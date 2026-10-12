// Fase 1: solo RH (permiso PRT-DOC) solicita/expide constancias a nombre
// de empleados. Login RFC de empleados llega en fase 2, no se monta aquí.
const { Router } = require("express");
const router = Router();
const constanciasController = require("../../controllers/portal/constancias.Controller");
const destinatariosController = require("../../controllers/portal/destinatarios.Controller");
const firmantesController = require("../../controllers/portal/firmantes.Controller");
const delegacionSindicalController = require("../../controllers/portal/delegacionSindical.Controller");
const firmantePerfilController = require("../../controllers/portal/firmantePerfil.Controller");
const misDocumentosController = require("../../controllers/portal/misDocumentos.Controller");
const verifyToken = require("../../middleware/authMiddleware");
const requirePermission = require("../../middleware/requirePermission");
const { requireAdminPermission } = require("../../middleware/permissionsMiddleware");

router.post(
  "/constancias/cad",
  verifyToken,
  requirePermission("PRT-DOC"),
  constanciasController.generarCAD
);
router.post(
  "/constancias/cni",
  verifyToken,
  requirePermission("PRT-DOC"),
  constanciasController.generarCNI
);
router.get(
  "/constancias",
  verifyToken,
  requirePermission("PRT-DOC"),
  constanciasController.listarConstancias
);

router.get(
  "/constancias/:folio/pdf",
  verifyToken,
  requirePermission("PRT-DOC"),
  constanciasController.descargarPdf
);

// Catálogo de destinatarios ("dirigido a"), config separada de expedición.
router.post(
  "/destinatarios",
  verifyToken,
  requirePermission("PRT-CFG"),
  destinatariosController.crear
);
router.get(
  "/destinatarios",
  verifyToken,
  requirePermission("PRT-CFG"),
  destinatariosController.listar
);
router.patch(
  "/destinatarios/:id",
  verifyToken,
  requirePermission("PRT-CFG"),
  destinatariosController.actualizar
);
router.delete(
  "/destinatarios/:id",
  verifyToken,
  requirePermission("PRT-CFG"),
  destinatariosController.desactivar
);

// Catálogo de firmantes y configuración de quién firma (titular / suplente /
// ausencia del titular).
router.post("/firmantes", verifyToken, requirePermission("PRT-FIR"), firmantesController.crear);
router.get("/firmantes", verifyToken, requirePermission("PRT-FIR"), firmantesController.listar);
router.patch("/firmantes/:id", verifyToken, requirePermission("PRT-FIR"), firmantesController.actualizar);
router.delete("/firmantes/:id", verifyToken, requirePermission("PRT-FIR"), firmantesController.desactivar);
// Quien expide (PRT-DOC) también necesita ver quién firma y su firma; solo PRT-FIR la modifica.
const requireFirmaLectura = (req, res, next) => {
  const permisos = req.user?.permissions || [];
  if (permisos.includes("*") || permisos.includes("PRT-FIR") || permisos.includes("PRT-DOC")) {
    return next();
  }
  return res.status(403).json({ message: "No tienes el permiso requerido (PRT-DOC o PRT-FIR) para esta acción" });
};
router.get(
  "/configuracion-firma",
  verifyToken,
  requireFirmaLectura,
  firmantesController.obtenerConfiguracion
);
router.get("/firmantes/:id/firma", verifyToken, requireFirmaLectura, firmantesController.firmaImagen);
router.put(
  "/configuracion-firma",
  verifyToken,
  requirePermission("PRT-FIR"),
  firmantesController.guardarConfiguracion
);

// Vista por Delegación Sindical: selector de delegación + carga en bloque de
// sus afiliados de base para la pantalla de Expedición (mismo permiso que
// expedir, no uno nuevo — es solo otra forma de elegir a quién).
router.get(
  "/delegaciones",
  verifyToken,
  requirePermission("PRT-DOC"),
  delegacionSindicalController.listarDelegaciones
);
router.get(
  "/delegaciones/:delegacion/empleados",
  verifyToken,
  requirePermission("PRT-DOC"),
  delegacionSindicalController.getEmpleadosPorDelegacion
);

// Perfil de Firmante (permiso PRT-PF): cuenta propia, enriquecida por RFC.
// buscar-rfc lo usa el diálogo de crear usuario (solo admin, "*"), el resto
// lo usa el firmante logueado sobre sí mismo.
router.get(
  "/firmantes/buscar-rfc/:rfc",
  verifyToken,
  requireAdminPermission(),
  firmantePerfilController.buscarPorRfc
);
router.get(
  "/adscripciones-catalogo",
  verifyToken,
  requireAdminPermission(),
  firmantePerfilController.catalogoAdscripciones
);
router.get(
  "/mi-personal",
  verifyToken,
  requirePermission("PRT-PF"),
  firmantePerfilController.miPersonal
);
router.get(
  "/mi-firma",
  verifyToken,
  requirePermission("PRT-PF"),
  firmantePerfilController.obtenerMiFirma
);
router.get(
  "/mi-firma/imagen",
  verifyToken,
  requirePermission("PRT-PF"),
  firmantePerfilController.obtenerMiFirmaImagen
);
router.post(
  "/mi-firma",
  verifyToken,
  requirePermission("PRT-PF"),
  firmantePerfilController.guardarMiFirma
);

// Personal a cargo del firmante y registro de lo firmado a su nombre. La firma
// se estampa sola al expedir; "mis-documentos" es de solo lectura. Las rutas
// fijas (resumen, validar) van antes de las que llevan :folio.
router.get(
  "/mi-personal-a-cargo",
  verifyToken,
  requirePermission("PRT-PF"),
  firmantePerfilController.miPersonalACargo
);
router.get(
  "/mis-documentos",
  verifyToken,
  requirePermission("PRT-PF"),
  misDocumentosController.listar
);
router.get(
  "/mis-documentos/resumen",
  verifyToken,
  requirePermission("PRT-PF"),
  misDocumentosController.resumen
);
router.get(
  "/mis-documentos/resumen/pdf",
  verifyToken,
  requirePermission("PRT-PF"),
  misDocumentosController.resumenPdf
);
router.post(
  "/mis-documentos/validar",
  verifyToken,
  requirePermission("PRT-PF"),
  misDocumentosController.validar
);
router.get(
  "/mis-documentos/:folio/pdf",
  verifyToken,
  requirePermission("PRT-PF"),
  misDocumentosController.descargarPdf
);

module.exports = router;
