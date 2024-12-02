const mongoose = require("mongoose");

mongoose
  .connect("mongodb://localhost:27017/sirh", {})
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));
