const Notification = require("../models/notification.model");

async function createNotification(io, data) {

    // 1️⃣ Guardar en BD
    const notification = await Notification.create(data);

    // 2️⃣ Emitir por ROLES
    if (data.rol?.length) {
        data.rol.forEach(rol => {
            io.to(`ROL_${rol}`)
                .emit("new-notification", notification);
        });
    }

    // 3️⃣ Emitir por PERMISOS 🔥 (LO QUE TE FALTA)
    if (data.permissions?.length) {
        data.permissions.forEach(p => {
            io.to(`PERMISSION_${p}`)
                .emit("new-notification", notification);
        });
    }

    // 4️⃣ Emitir a usuario específico
    if (data.userTarget) {
        io.to(`USER_${data.userTarget}`)
            .emit("new-notification", notification);
    }

    return notification;
}

module.exports = { createNotification };
