const requirePermission = (permissions = []) => {
    return (req, res, next) => {
        const userPermissions = req.user?.permissions || [];

        const hasAccess =
            userPermissions.includes("*") ||
            permissions.some((perm) => userPermissions.includes(perm));

        if (hasAccess) {
            return next();
        }

        return res.status(403).json({
            success: false,
            message: `No tienes permisos suficientes`,
        });
    };
};

const requireAnyPermission = () => {
    return (req, res, next) => {

        const userPermissions = req.user?.permissions || [];

        const hasAccess =
            userPermissions.includes("*") ||
            userPermissions.length > 0;

        if (hasAccess) {
            return next();
        }

        return res.status(403).json({
            success: false,
            message: 'No tienes permisos suficientes',
        });
    };
};

const requireAdminPermission = () => {
    return (req, res, next) => {
        const userPermissions = req.user?.permissions || [];

        const hasAccess = userPermissions.includes("*")

        if (hasAccess) {
            return next();
        }

        return res.status(403).json({
            success: false,
            message: `No tienes permisos suficientes`,
        });
    };
};

module.exports = {
    requirePermission,
    requireAnyPermission,
    requireAdminPermission
};