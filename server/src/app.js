const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const app = express();

app.set("port", process.env.PORT || 4000);
app.use(morgan("dev"));
app.use(
  cors({
    origin: "http://localhost:4200",
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api", require("./routes/employees.routes"));
app.use("/api", require("./routes/login.routes"));
app.use("/api", require("./routes/register.routes"));
app.use("/api", require("./routes/offEmpployees.routes"));
app.use("/api", require("./routes/addEmployee.routes"));
module.exports = app;
