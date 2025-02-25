const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const app = express();
const path = require("path");

app.set("port", process.env.PORT || 3000);
app.use(morgan("dev"));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Rutas de la API
app.use("/api", require("./routes/login.routes"));
app.use("/api", require("./routes/employees.routes"));
app.use("/api", require("./routes/register.routes"));
app.use("/api", require("./routes/offEmpployees.routes"));
app.use("/api", require("./routes/addEmployee.routes"));

module.exports = app;
