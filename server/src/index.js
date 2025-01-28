const app = require("./app");
require("./config/mongo");
require("./config/mysql");

const { ping: pingMySQL } = require("./config/mysql");
const { ping: pingMongo } = require("./config/mongo");

async function startServer() {
  try {
    await pingMySQL();
    await pingMongo();
    const host = "localhost";
    const port = app.get("port");

    console.log(`Server running at http://${host}:${port}`);
    app.listen(port, host, () => {
      console.log(`Server on port ${port}`);
    });
  } catch (err) {
    console.error("Error starting server:", err);
  }
}

startServer();
