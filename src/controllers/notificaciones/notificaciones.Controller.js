const { query } = require("../../config/mongo");
const notificacionesController = {};

notificacionesController.getNotificaciones = async (req, res) => {
    try {
        const user = req.user;
        const username = user.username;

        const notificaciones = await query("notifications", {});
        const users = await query("USUARIOS", {});

        const userMap = new Map(users.map(u => [u.username, u]));

        let filteredNotificaciones = notificaciones.filter((n) => {

            const text = (n.action || "").toString().trim();
            if (/^CONSULTÓ/i.test(text)) return false;

            if (n.all) return true;

            const userPermissions = user.permissions || [];

            const userModules = userPermissions.map(p => {
                if (p === '*') return '*';
                return p.split('-')[0];
            });

            if (n.module?.length) {
                return n.module.some(m =>
                    userModules.includes('*') || userModules.includes(m)
                );
            }

            if (n.permissions?.length) {

                if (userPermissions.includes('*')) return true;

                return n.permissions.some(p =>
                    userPermissions.includes(p)
                );
            }

            return false;
        });

        console.log('Notificaciones', filteredNotificaciones);


        filteredNotificaciones.forEach((action) => {

            const matchedUser = userMap.get(action.username);

            if (matchedUser) {
                const fullName = String(matchedUser.name || "").trim();
                const nameParts = fullName.split(/\s+/).filter(Boolean);
                action.name = nameParts.slice(0, 2).join(" ");
            } else {
                action.name = action.username;
            }

            if (!action.readBy) {
                action.readBy = [];
            }

            action.isRead = action.readBy.includes(username);
        });

        filteredNotificaciones.sort((a, b) => {
            const parseFecha = (fechaStr) => {
                if (!fechaStr) return new Date(0);
                const [dd, mm, aaaa] = fechaStr.split("/");
                return new Date(aaaa, mm - 1, dd);
            };

            const dateA = parseFecha(a.fecha);
            const dateB = parseFecha(b.fecha);

            if (dateA.getTime() !== dateB.getTime()) {
                return dateB.getTime() - dateA.getTime();
            }

            const parseHora = (horaStr) => {
                if (!horaStr) return "00:00";
                return horaStr.split(" ")[0];
            };

            return parseHora(b.hora).localeCompare(parseHora(a.hora));
        });

        res.send(filteredNotificaciones);

    } catch (error) {
        res.status(500).json({ error: "An error occurred while fetching data" });
    }
};

// Exportamos el controlador de notificaciones
module.exports = notificacionesController;