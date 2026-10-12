// Middleware de permisos granulares, reutiliza el arreglo `permissions`
// que ya viaja en el JWT (ver src/controllers/personal/login.Controller.js).
// Uso: router.post("/ruta", verifyToken, requirePermission("PRT-DOC"), controller.metodo)
const requirePermission = (permissionCode) => (req, res, next) => {
  const userPermissions = req.user?.permissions || [];

  // "*" = acceso total (mismo criterio que notificaciones.Controller.js).
  if (!userPermissions.includes("*") && !userPermissions.includes(permissionCode)) {
    return res.status(403).json({
      message: `No tienes el permiso requerido (${permissionCode}) para esta acción`,
    });
  }

  next();
};

module.exports = requirePermission;
