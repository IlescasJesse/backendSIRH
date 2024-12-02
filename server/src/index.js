const app = require("./app");
require("./config/mongo");

app.listen(app.get("port"));
console.log("Server on port", app.get("port"));
