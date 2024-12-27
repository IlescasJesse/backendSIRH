const { querysql } = require("../config/mysql");

const calcularSalarios = {};
calcularSalarios.base = async (nivel) => {
  try {
    const dataSalaries = await querysql(
      "SELECT * FROM salaries WHERE nivel = ?",
      [nivel]
    );
    return dataSalaries;
  } catch (error) {
    console.error("Error fetching salaries:", error);
    throw error;
  }
};

module.exports = {
  calcularSalarios,
};
