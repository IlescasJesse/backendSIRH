const { query } = require("../config/mongo");
const { querysql } = require("../config/mysql");
const employeeController = {};

// Importamos el modelo de Employee
const Employee = require("../models/Employee");
const { ObjectId } = require("mongodb");

// Función para obtener todos los empleados
employeeController.getEmployees = async (req, res) => {
  try {
    const employees = await query("plantilla_humanos", {});
    res.status(200).json(employees);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};

// Función para obtener los datos de perfil de un empleado por su ID
employeeController.getProfileData = async (req, res) => {
  const { id } = req.params;
  console.log(id);
  try {
    const employee = await query("plantilla_humanos", {
      _id: new ObjectId(id),
    });
    const licenses = await query("plazas", { NUMPLA: employee[0].NUMPLA });
    const salariesData = await querysql(
      `SELECT * FROM CAT_BASE WHERE nivel = ?`,
      [employee[0].NIVEL]
    );
    const salaries = salariesData[0];
    console.log(salaries);

    if (!employee || employee.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }
    //verifica el statiuas de las plazas

    employee[0].licenses = licenses;
    res.json(employee[0]);

    console.log(
      employee[0].NOMBRES +
        employee[0].APE_PAT +
        employee[0].APE_MAT +
        "---" +
        employee[0]._id
    );
  } catch (error) {
    res.status(500).json({ message: "Error al buscar el empleado", error });
  }
};

// Función para buscar empleados por una consulta
employeeController.getEmployee = async (req, res) => {
  const { query: searchQuery } = req.params;
  console.log(searchQuery);
  try {
    let empleados;
    const queryDivided = searchQuery.split(" ");

    if (searchQuery) {
      const regexQueries = [
        { CURP: { $regex: searchQuery, $options: "i" } },
        { NOMBRES: { $regex: searchQuery, $options: "i" } },
        { APE_MAT: { $regex: searchQuery, $options: "i" } },
        { APE_PAT: { $regex: searchQuery, $options: "i" } },
      ];

      if (queryDivided.length > 1) {
        regexQueries.push({
          $or: [
            {
              $and: [
                { APE_MAT: { $regex: queryDivided[0], $options: "i" } },
                { APE_PAT: { $regex: queryDivided[1], $options: "i" } },
              ],
            },
            {
              $and: [
                { APE_MAT: { $regex: queryDivided[1], $options: "i" } },
                { APE_PAT: { $regex: queryDivided[0], $options: "i" } },
              ],
            },
            {
              $and: [
                { NOMBRES: { $regex: queryDivided[0], $options: "i" } },
                { APE_PAT: { $regex: queryDivided[1], $options: "i" } },
              ],
            },
          ],
        });
      }

      empleados = await query("plantilla_humanos", { $or: regexQueries });
    } else {
      empleados = await query("plantilla_humanos", {});
    }

    const formattedEmployees = empleados.map((emp) => ({
      _id: emp._id,
      NOMBRE: `${emp.APE_PAT} ${emp.APE_MAT} ${emp.NOMBRES}`,
      CURP: emp.CURP,
      RFC: emp.RFC,
      CLAVECAT: emp.CLAVECAT,
      PROYECTO: emp.PROYECTO,
    }));

    res.json(formattedEmployees);
    console.log(formattedEmployees);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al recuperar los datos" });
  }
};

// Exportamos el controlador de empleados
module.exports = employeeController;
