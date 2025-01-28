const app = require("./app");
require("./config/mongo");
require("./config/mysql");

const { ping: pingMySQL } = require("./config/mysql");
const { ping: pingMongo } = require("./config/mongo");

async function startServer() {
  try {
    await pingMySQL();
    await pingMongo();
    console.log("Server running at http://0.0.0.0:" + app.get("port"));
    app.listen(app.get("port"), "0.0.0.0", () => {
      console.log("Server on port", app.get("port"));
    });
  } catch (err) {
    console.error("Error starting server:", err);
  }
}

startServer();
