const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const http = require("http");
const { Server } = require("socket.io");
const { startAgenda } = require("./config/agenda");
const { requestLogger, errorLogger } = require("./middleware/loggerMiddleware");

require("dotenv").config();

const app = express();

app.set("port", process.env.PORT || 3000);
app.use(morgan("dev"));
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

// Middleware de logging con colores
app.use(requestLogger);

app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 6 * 60 * 60, // 6 horas en segundos
    }),
    cookie: { maxAge: 6 * 60 * 60 * 1000 }, // 6 horas en milisegundos
  })
);

// ---- SOCKET.IO ----
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:4040",
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  socket.on("join", ({ username, rol, permissions }) => {
    console.log("📥 Join recibido:", { username, rol, permissions });

    if (username) socket.join(`USER_${username}`);
    if (rol) socket.join(`ROL_${rol}`);

    if (permissions?.length) {
      permissions.forEach(permission => {
        socket.join(`PERMISSION_${permission}`);
      });
    }

    // 🔥 Mostrar salas del usuario
    console.log("📌 Salas del socket:", [...socket.rooms]);
  });

  socket.on("disconnect", () => {
    console.log("🔴 Cliente desconectado:", socket.id);
  });
});




// rutas para personal
app.use("/api/personal", require("./routes/personal/login.routes"));
app.use("/api/personal", require("./routes/personal/employees.routes"));
app.use("/api/personal", require("./routes/personal/register.routes"));
app.use("/api/personal", require("./routes/personal/offEmpployees.routes"));
app.use("/api/personal", require("./routes/personal/addEmployee.routes"));
app.use("/api/personal", require("./routes/personal/reportes.routes"));
app.use("/api/personal", require("./routes/personal/delegaciones.routes"));

//rutas para incidencias
app.use(
  "/api/control-asistencia",
  require("./routes/incidencias/incidencias.routes")
);
//rutas para permisos extraordinarios
app.use("/api/permisos-ext", require("./routes/permisos-ext/permisosExt.routes"));
app.use("/api/permisos-ext", require("./routes/permisos-ext/reportes.routes"));
//rutas para vacaciones
app.use("/api/vacaciones", require("./routes/vacaciones/vacaciones.routes"));
//rutas para gafetes
app.use("/api/gafetes", require("./routes/gafetes/gafetes.routes"));
app.use(
  "/api/control-asistencia",
  require("./routes/incidencias/reportes.routes")
);
//rutas para talones
app.use("/api/talon", require("./routes/talones/talones.routes"));
// rutas para utilidades
app.use("/api", require("./routes/calendar/calendar.routes"));
app.use("/api", require("./routes/libs/libs.routes"));
// rutas para monitor del servidor
app.use("/api/monitor", require("./routes/monitor/monitor.routes"));
// rutas para app móvil (con IP whitelist)
app.use("/api/mobile/monitor", require("./routes/monitor/mobile.routes"));

// rutas para notificaciones
app.use("/api/notificaciones", require("./routes/notificaciones/notificaciones.routes"));

// Middleware de manejo de errores (debe ir al final)
app.use(errorLogger);

// Iniciar Agenda (scheduler de tareas automáticas)
startAgenda().catch((err) => {
  console.error("Error al iniciar Agenda:", err);
});

module.exports = { app, server, io };
