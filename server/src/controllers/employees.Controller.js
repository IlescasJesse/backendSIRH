const { parse } = require("path");
const { query } = require("../config/mongo");
const { querysql } = require("../config/mysql");
const employeeController = {};

// Importamos el modelo de Employee
const Employee = require("../models/Employee");
const { ObjectId } = require("mongodb");

// Función para obtener todos los empleados
employeeController.getEmployees = async (req, res) => {
  try {
    const employees = await query("PLANTILLA_2025", {});
    res.status(200).json(employees);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};

employeeController.getProfileData = async (req, res) => {
  const { id } = req.params;

  try {
    // Buscar el empleado por su ID
    const employee = await query("PLANTILLA_2025", {
      _id: new ObjectId(id),
    });
    if (!employee || employee.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    // Buscar el estado de la plaza del empleado
    const status_plaza = await query("PLAZAS_2025", {
      NUMPLA: employee[0].NUMPLA,
    });

    if (!status_plaza || status_plaza.length === 0) {
      return res.status(404).json({ message: "Plaza no encontrada" });
    }

    let percepciones,
      deducciones = {};

    // Calcular percepciones y deducciones según el tipo de nómina
    switch (employee[0].TIPONOM) {
      case "B":
        percepciones = await querysql(
          `SELECT * FROM CAT_BASE WHERE nivel = ?`,
          [employee[0].NIVEL]
        );
        percepciones = percepciones[0];
        const isrDataB = await querysql(
          "SELECT * FROM CAT_ISR WHERE ? > LIMITE_INFERIOR AND ? < LIMITE_SUPERIOR",
          [percepciones.SUELDO_BASE, percepciones.SUELDO_BASE]
        );
        const isrObjectB = isrDataB[0];
        deducciones.ISR = (
          ((parseFloat(percepciones.SUELDO_BASE) -
            parseFloat(isrObjectB.LIMITE_INFERIOR)) *
            parseFloat(isrObjectB.PORCENTAJE_LIMITE_INFERIOR)) /
            100 +
          parseFloat(isrObjectB.CUOTA_FIJA)
        ).toFixed(2);
        const FONDO_PENSIONES = (
          parseFloat(percepciones.SUELDO_BASE) * 0.09
        ).toFixed(2);
        deducciones.CUOTA_SINDICAL = (
          parseFloat(percepciones.SUELDO_BASE) * 0.01
        ).toFixed(2);
        deducciones.IMSS = (
          parseFloat(percepciones.SUELDO_BASE) * 0.041219
        ).toFixed(2);

        if (employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT QUINQUENIO_${employee[0].NUMQUIN} FROM CAT_QUINQUENIOS_BASE WHERE NIVEL = ?`,
            [employee[0].NIVEL]
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`QUINQUENIO_${employee[0].NUMQUIN}`];
        }
        break;

      case "CN":
      case "CC":
        percepciones = await querysql(
          `SELECT * FROM CAT_CONTRATO WHERE NIVEL = ?`,
          [employee[0].NIVEL]
        );
        percepciones = percepciones[0];
        const sueldoGravable = (
          parseFloat(percepciones.SUELDO_BASE) +
          parseFloat(percepciones.ESTIMULO)
        ).toFixed(2);
        const isrDataCC = await querysql(
          "SELECT * FROM CAT_ISR WHERE ? > LIMITE_INFERIOR AND ? < LIMITE_SUPERIOR",
          [sueldoGravable, sueldoGravable]
        );
        const isrObjectCC = isrDataCC[0];
        deducciones.ISR = (
          ((parseFloat(sueldoGravable) -
            parseFloat(isrObjectCC.LIMITE_INFERIOR)) *
            parseFloat(isrObjectCC.PORCENTAJE_LIMITE_INFERIOR)) /
            100 +
          parseFloat(isrObjectCC.CUOTA_FIJA)
        ).toFixed(2);
        const limiteSubsidio = await querysql(
          "SELECT * FROM SUBSIDIO_ISR WHERE ID = 1"
        );
        if (
          parseFloat(sueldoGravable) <
          parseFloat(limiteSubsidio[0].LIMITE_SUPERIOR)
        ) {
          deducciones.ISR = Math.max(
            0,
            parseFloat(deducciones.ISR) - parseFloat(limiteSubsidio[0].SUBSIDIO)
          );
        }
        deducciones.IMSS = (
          parseFloat(percepciones.SUELDO_BASE) * 0.041219
        ).toFixed(2);
        if (employee[0].NUMQUIN > 0 && employee[0].TIPONOM === "CN") {
          const quinquenio = await querysql(
            `SELECT QUINQUENIO_${employee[0].NUMQUIN} FROM CAT_QUINQUENIOS_CONFIANZA WHERE NIVEL = ?`,
            [employee[0].NIVEL]
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`QUINQUENIO_${employee[0].NUMQUIN}`];
        }
        break;

      case "MM":
        percepciones = await querysql(
          `SELECT * FROM CAT_MANDOS_MEDIOS WHERE NIVEL = ?`,
          [employee[0].NIVEL]
        );
        percepciones = percepciones[0];

        const sueldoGravableMM = (
          parseFloat(percepciones.RDL) +
          parseFloat(percepciones.SUELDO_BASE) +
          parseFloat(percepciones.COMPENSACION_FIJA)
        ).toFixed(2);

        const isrObjectMM = await querysql(
          "SELECT * FROM CAT_ISR WHERE ? > LIMITE_INFERIOR AND ? < LIMITE_SUPERIOR",
          [sueldoGravableMM, sueldoGravableMM]
        );
        const CAT_SEGURO = await querysql(
          "SELECT * FROM CAT_SEGURO WHERE NIVEL = ?",
          [employee[0].NIVEL]
        );

        deducciones.ISR = (
          ((parseFloat(sueldoGravableMM) -
            parseFloat(isrObjectMM[0].LIMITE_INFERIOR)) *
            isrObjectMM[0].PORCENTAJE_LIMITE_INFERIOR) /
            100 +
          parseFloat(isrObjectMM[0].CUOTA_FIJA)
        ).toFixed(2);
        deducciones.SEGURO_VIDA = parseFloat(CAT_SEGURO[0].SEGURO_VIDA).toFixed(
          2
        );
        deducciones.FONDO_PEN = (
          parseFloat(percepciones.SUELDO_BASE) * 0.09
        ).toFixed(2);
        deducciones.ISR =
          parseFloat(deducciones.ISR) - parseFloat(percepciones.ISR_RDL);

        delete percepciones.ISR_RDL;
        delete percepciones.RDL;
        if (employee[0].NUMQUIN > 0 && employee[0].TIPONOM === "CN") {
          const quinquenio = await querysql(
            `SELECT QUINQUENIO_${employee[0].NUMQUIN} FROM CAT_QUINQUENIOS_MANDOS_MEDIOS WHERE NIVEL = ?`,
            [employee[0].NIVEL]
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`QUINQUENIO_${employee[0].NUMQUIN}`];
        }

        break;
      default:
        return res
          .status(400)
          .json({ message: "Tipo de nómina no reconocido" });
    }
    delete percepciones.ID;
    delete percepciones.NIVEL;

    // Agregar percepciones, deducciones y estado de plaza al empleado
    employee[0].percepciones = percepciones;
    employee[0].deducciones = deducciones;
    employee[0].status_plaza = status_plaza;
    console.log(employee[0]);
    // Enviar la respuesta con los datos del empleado
    res.json(employee[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al buscar el empleado", error });
  }
};

// Función para buscar empleados por una consulta
employeeController.getEmployee = async (req, res) => {
  const { query: searchQuery } = req.params;

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

      empleados = await query("PLANTILLA_2025", { $or: regexQueries });
    } else {
      empleados = await query("PLANTILLA_2025", {});
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al recuperar los datos" });
  }
};

// Exportamos el controlador de empleados
module.exports = employeeController;
