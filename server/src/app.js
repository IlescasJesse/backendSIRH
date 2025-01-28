const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const app = express();
const path = require("path");

app.set("port", process.env.PORT || 3000);
app.use(morgan("dev"));
app.use(
  cors({
    origin: "0.0.0.0:3000", // Allow all origins
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Servir archivos estáticos de la carpeta dist/sirh/browser

// Rutas de la API
app.use(express.static(path.join(__dirname, "dist/sirh/browser")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist/sirh/browser/index.html"));
});
app.use("/api", require("./routes/employees.routes"));
app.use("/api", require("./routes/login.routes"));
app.use("/api", require("./routes/register.routes"));
app.use("/api", require("./routes/offEmpployees.routes"));
app.use("/api", require("./routes/addEmployee.routes"));

module.exports = app;
