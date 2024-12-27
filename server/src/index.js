const app = require("./app");
require("./config/mongo");
require("./config/mysql");

const { ping: pingMySQL } = require("./config/mysql");
const { ping: pingMongo } = require("./config/mongo");

async function startServer() {
  try {
    await pingMySQL();
    await pingMongo();
    app.listen(app.get("port"), () => {
      console.log("Server on port", app.get("port"));
    });
  } catch (err) {
    console.error("Error starting server:", err);
  }
}

startServer();
