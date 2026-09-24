const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const http = require("http");
const { Server } = require("socket.io");
const { startAgenda } = require("./config/agenda");
const { requestLogger, errorLogger } = require("./middleware/loggerMiddleware");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const socketAuth = require("./middleware/socketAuth");
require("dotenv").config();

const allowedOrigins = [
  "https://sirh.local"
].filter(Boolean);

const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
  })
);
app.use(cookieParser());

app.set("port", process.env.PORT || 3000);
app.use(morgan("dev"));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origen no permitido por CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: false, limit: "50mb" }));

// Middleware de logging con colores
app.use(requestLogger);

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      ttl: 6 * 60 * 60,
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 6 * 60 * 60 * 1000,
    },
  })
);

// ---- SOCKET.IO ----
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST"],
  },
});

io.use(socketAuth);

app.set("io", io);

io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  socket.on("join", () => {
    const { username, permissions = [] } = socket.user;

    socket.join(`USER_${username}`);

    for (const permission of permissions) {
      socket.join(`PERMISSION_${permission}`);
    }

    console.log("Socket autenticado:", username);
    console.log("Salas del socket:", [...socket.rooms]);
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
app.use("/api/personal", require("./routes/personal/adscripcionProyecto.routes"));
app.use("/api/personal", require("./routes/personal/sueldos.routes"));
app.use("/api/personal", require("./routes/personal/reportesRetroactivos.routes"));

//rutas para incidencias
app.use("/api/control-asistencia", require("./routes/incidencias/incidencias.routes"));
app.use("/api/control-asistencia", require("./routes/incidencias/reportes.routes"));

//rutas para permisos extraordinarios
app.use("/api/permisos-ext", require("./routes/permisos-ext/permisosExt.routes"));
app.use("/api/permisos-ext", require("./routes/permisos-ext/reportes.routes"));
//rutas para vacaciones
app.use("/api/vacaciones", require("./routes/vacaciones/vacaciones.routes"));
//rutas para gafetes
app.use("/api/gafetes", require("./routes/gafetes/gafetes.routes"));

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
