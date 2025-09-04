const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const { Server } = require("socket.io");

require("dotenv").config();

const app = express();

app.set("port", process.env.PORT || 3000);
app.use(morgan("dev"));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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

// Middleware para imprimir la información de la sesión
app.use((req, res, next) => {
  if (req.session.user) {
    console.log("Información de la sesión:", req.session.user.username);
  }
  next();
});
// Configuración de CORS para el servidor de Socket.IO
const serverIO = require("http").createServer(app);
const io = new Server(serverIO, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:4040",
    methods: ["GET", "POST"],
  },
});
// Middleware para manejar las conexiones de Socket.IO
io.on("connection", (socket) => {
  console.log("Nuevo cliente conectado:", socket.id);

  // Aquí puedes manejar eventos específicos de Socket.IO
  socket.on("disconnect", () => {
    console.log("Cliente desconectado:", socket.id);
  });
});

// rutas para personal

app.use("/api/personal", require("./routes/personal/login.routes"));
app.use("/api/personal", require("./routes/personal/employees.routes"));
app.use("/api/personal", require("./routes/personal/register.routes"));
app.use("/api/personal", require("./routes/personal/offEmpployees.routes"));
app.use("/api/personal", require("./routes/personal/addEmployee.routes"));
app.use("/api/personal", require("./routes/personal/reportes.routes"));
//
//rutas para incidencias
app.use(
  "/api/control-asistencia",
  require("./routes/incidencias/incidencias.routes")
);
// rutas para reportes de incidencias
app.use(
  "/api/control-asistencia",
  require("./routes/incidencias/reportes.routes")
);
// rutas para utilidades
app.use("/api", require("./routes/calendar/calendar.routes"));
app.use("/api", require("./routes/libs/libs.routes"));

// Iniciar el servidor
app.listen(app.get("port"), () => {
  console.log(`Servidor en puerto ${app.get("port")}`);
});

module.exports = app;
