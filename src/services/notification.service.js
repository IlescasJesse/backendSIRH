const Notification = require("../models/notification.model");
const { query } = require("../config/mongo");

async function createNotification(io, data) {

    const notificationDoc = await Notification.create({
        ...data,
        readBy: [],
    });

    const notification = notificationDoc.toObject();
    const users = await query("USUARIOS", {});
    const userMap = new Map(users.map(u => [u.username, u]));

    const userFound = userMap.get(notification.username);

    if (userFound) {
        const fullName = (userFound.name || "").trim();
        const parts = fullName.split(/\s+/);
        notification.name = parts.slice(0, 2).join(" ");
    } else {
        notification.name = notification.username;
    }


    // 🔥 GLOBAL REAL
    if (data.all) {
        io.emit("new-notification", notification);
        return notification;
    }

    const sentUsers = new Set();

    // ============================
    // 🔵 POR MÓDULOS
    // ============================
    if (data.module?.length) {

        users.forEach(u => {

            const userModule = u.module || null;

            const hasModule = data.module.some(m =>
                userModule === '*' || userModule === m
            );

            if (hasModule && !sentUsers.has(u.username)) {
                sentUsers.add(u.username);

                io.to(`USER_${u.username}`)
                    .emit("new-notification", notification);
            }
        });
    }

    // ============================
    // 🟡 POR PERMISOS
    // ============================
    if (data.permissions?.length) {
        data.permissions.forEach(p => {
            io.to(`PERMISSION_${p}`)
                .emit("new-notification", notification);
        });
    }

    // ============================
    // 🟣 USUARIO ESPECÍFICO
    // ============================
    if (data.userTarget) {
        io.to(`USER_${data.userTarget}`)
            .emit("new-notification", notification);
    }

    return notification;
}

module.exports = { createNotification };
