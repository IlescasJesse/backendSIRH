require("dotenv").config();
const { server, app } = require("./app");
const { ping: pingMySQL } = require("./config/mysql");
const { ping: pingMongo } = require("./config/mongo");
const { connectMongoose } = require("./config/mongoose");

async function startServer() {
  try {
    await pingMySQL();
    await pingMongo();
    await connectMongoose();
    server.listen(app.get("port"), "0.0.0.0", () => {
      console.log("Server running at http://0.0.0.0:" + app.get("port"));
    });
  } catch (err) {
    console.error("Error starting server:", err);
  }
}

startServer();
