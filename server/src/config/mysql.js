const mysql = require("mysql2/promise");
require("dotenv").config();

async function querysql(sql, params) {
  const connection = await mysql.createConnection({
    host: process.env.HOSTSQL,
    user: process.env.USERSQL,
    password: process.env.PWDSQL,
    database: process.env.DB,
    port: process.env.SQLPORT,
  });

  try {
    const [results] = await connection.execute(sql, params);
    return results;
  } finally {
    await connection.end();
  }
}

async function ping() {
  const connection = await mysql.createConnection({
    host: process.env.HOSTSQL,
    user: process.env.USERSQL,
    password: process.env.PWDSQL,
    database: process.env.DB,
    port: process.env.SQLPORT,
  });

  try {
    await connection.ping();
    console.log(
      "MySQL server is active ON " +
        process.env.HOSTSQL +
        ":" +
        process.env.SQLPORT
    );
  } finally {
    await connection.end();
  }
}

module.exports = { querysql, ping };
