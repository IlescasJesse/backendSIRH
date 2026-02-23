const { query } = require("../../config/mongo");
const notificacionesController = {};

notificacionesController.getNotificaciones = async (req, res) => {
    try {
        const notificaciones = await query("notifications", {});
        const users = await query("USUARIOS", {});

        // Crear mapa de usuarios por username para búsqueda rápida
        const userMap = new Map(users.map(u => [u.username, u]));

        // Excluir acciones cuyo texto comience con "CONSULTÓ" (case-insensitive)
        const filteredNotificaciones = notificaciones.filter((a) => {
            const text = (a.action || "").toString().trim();
            return !/^CONSULTÓ/i.test(text);
        });

        filteredNotificaciones.forEach((action) => {
            const matchedUser = userMap.get(action.username);
            if (matchedUser) {
                const fullName = String(matchedUser.name || "").trim();
                const nameParts = fullName.split(/\s+/).filter(Boolean);
                action.name = nameParts.slice(0, 2).join(" ");
            }
        });

        // Ordenar por fecha y hora (más recientes primero)
        filteredNotificaciones.sort((a, b) => {
            // Parsear fecha DD/MM/AAAA a Date
            const parseFecha = (fechaStr) => {
                if (!fechaStr) return new Date(0);
                const [dd, mm, aaaa] = fechaStr.split("/");
                return new Date(aaaa, mm - 1, dd);
            };

            const dateA = parseFecha(a.fecha);
            const dateB = parseFecha(b.fecha);

            if (dateA.getTime() !== dateB.getTime()) {
                return dateB.getTime() - dateA.getTime(); // Más recientes primero
            }

            // Si las fechas son iguales, ordenar por hora (más recientes primero)
            const parseHora = (horaStr) => {
                if (!horaStr) return "00:00";
                return horaStr.split(" ")[0]; // Extrae HH:MM
            };

            const horaA = parseHora(a.hora);
            const horaB = parseHora(b.hora);

            return horaB.localeCompare(horaA); // Orden descendente
        });

        res.send(filteredNotificaciones);
    } catch (error) {
        res.status(500).json({ error: "An error occurred while fetching data" });
    }
};

// Exportamos el controlador de notificaciones
module.exports = notificacionesController;