const jwt = require("jsonwebtoken");
const { query } = require("../config/mongo");

function getToken(socket) {
    const authToken = socket.handshake.auth?.token;

    if (authToken) {
        return authToken;
    }

    const cookieHeader = socket.handshake.headers.cookie || "";
    const cookies = Object.fromEntries(
        cookieHeader.split(";").map((cookie) => {
            const [name, ...value] = cookie.trim().split("=");
            return [name, decodeURIComponent(value.join("="))];
        })
    );

    return cookies.access_token;
}

async function socketAuth(socket, next) {
    try {
        const token = getToken(socket);

        if (!token) {
            return next(new Error("No autenticado"));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const [webSession, mobileSession] = await Promise.all([
            query("SESIONES", { jwt: token }),
            query("SESIONES_MOBILE", { jwt: token }),
        ]);

        if (webSession.length === 0 && mobileSession.length === 0) {
            return next(new Error("Sesión inválida"));
        }

        const users = await query("USUARIOS", {
            username: decoded.username,
        });

        if (users.length === 0 || users[0].status === 2) {
            return next(new Error("Usuario inválido"));
        }

        const user = users[0];

        socket.user = {
            id: user._id,
            username: user.username,
            rol: user.rol,
            permissions: user.permissions || [],
        };

        next();
    } catch (error) {
        console.error("Error autenticando Socket.IO:", error.message);
        next(new Error("No autorizado"));
    }
}

module.exports = socketAuth;