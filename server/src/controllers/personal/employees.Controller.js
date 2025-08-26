const { query, insertOne } = require("../../config/mongo");
const { querysql } = require("../../config/mysql");
const employeeController = {};

// Importamos el modelo de Employee

const { ObjectId } = require("mongodb");
const { updateOne } = require("../../config/mongo");

// Función para obtener todos los empleados
employeeController.getEmployees = async (req, res) => {
  try {
    const employees = await query("PLANTILLA", {});
    res.status(200).json(employees);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};

employeeController.getProfileData = async (req, res) => {
  const { id } = req.params;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  try {
    // Buscar el empleado por su ID
    const employee = await query("PLANTILLA", {
      _id: new ObjectId(id),
    });
    if (!employee || employee.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    if (employee[0].DIRECCION) {
      employee[0].DIRECCION_COMPLETA = `${employee[0].DIRECCION.DOMICILIO} ${employee[0].DIRECCION.NUM_EXT}, ${employee[0].DIRECCION.COLONIA}, ${employee[0].DIRECCION.MUNICIPIO} ${employee[0].DIRECCION.ESTADO}.`;
      employee[0].CP = employee[0].DIRECCION.CP;
    } else {
      employee[0].DIRECCION_COMPLETA = employee[0].DOMICILIO;
    }

    // Buscar el estado de la plaza del empleado
    const status_plaza = await query("PLAZAS", {
      NUMPLA: employee[0].NUMPLA,
    });

    if (!status_plaza || status_plaza.length === 0) {
      return res.status(404).json({ message: "Plaza no encontrada" });
    }

    let percepciones,
      deducciones = {};

    //obtener las entradas de su bitácora personal
    try {
      const bitacora = await query("BITACORA", {
        id_plantilla: employee[0]._id,
      });
      employee[0].bitacora = bitacora;
    } catch (error) {
      console.error("Error retrieving bitacora:", error);
      return res
        .status(500)
        .json({ message: "Error retrieving bitacora", error });
    }
    // Calcular percepciones y deducciones según el tipo de nómina
    switch (employee[0].TIPONOM) {
      case "M51":
      case "F51":
        percepciones = await querysql(
          `SELECT * FROM catalogo_base  WHERE nivel = ?`,
          [employee[0].NIVEL]
        );
        percepciones = percepciones[0];
        const isrDataB = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [percepciones.sueldo_base, percepciones.sueldo_base]
        );
        const isrObjectB = isrDataB[0];
        deducciones.ISR = (
          ((parseFloat(percepciones.sueldo_base) -
            parseFloat(isrObjectB.limite_inf)) *
            parseFloat(isrObjectB.porcentajeliminf)) /
            100 +
          parseFloat(isrObjectB.cuota_fija)
        ).toFixed(2);
        const FONDO_PENSIONES = (
          parseFloat(percepciones.sueldo_base) * 0.09
        ).toFixed(2);
        deducciones.FONDO_PENSIONES = FONDO_PENSIONES;
        deducciones.CUOTA_SINDICAL = (
          parseFloat(percepciones.sueldo_base) * 0.01
        ).toFixed(2);
        deducciones.IMSS = (
          parseFloat(percepciones.sueldo_base) * 0.041219
        ).toFixed(2);
        if (employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_base WHERE NIVEL = ?`,
            [employee[0].NIVEL]
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }
        break;
      case "F53":
      case "M53": //nomina dde contratooo
      case "FCT":
      case "CCT":
      case "FCO":
      case "511":
        percepciones = await querysql(
          `SELECT * FROM catalogo_contrato WHERE nivel = ?`,
          [employee[0].NIVEL]
        );
        percepciones = percepciones[0];
        const sueldoGravable = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.estimulo)
        ).toFixed(2);
        const isrDataCC = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravable, sueldoGravable]
        );
        const isrObjectCC = isrDataCC[0];
        deducciones.ISR = (
          ((parseFloat(sueldoGravable) - parseFloat(isrObjectCC.limite_inf)) *
            parseFloat(isrObjectCC.porcentajeliminf)) /
            100 +
          parseFloat(isrObjectCC.cuota_fija)
        ).toFixed(2);
        const limiteSubsidio = await querysql(
          "SELECT * FROM subsidio_isr WHERE id = 1"
        );
        if (
          parseFloat(sueldoGravable) < parseFloat(limiteSubsidio[0].lim_sup)
        ) {
          const isrValue = parseFloat(deducciones.ISR);
          const subsidioValue = parseFloat(limiteSubsidio[0].SUBSIDIO);
          if (!isNaN(isrValue) && !isNaN(subsidioValue)) {
            deducciones.ISR = Math.max(0, isrValue - subsidioValue).toFixed(2);
          } else {
            deducciones.ISR = "0.00";
          }
        }
        deducciones.IMSS = (
          parseFloat(percepciones.sueldo_base) * 0.041219
        ).toFixed(2);
        if (employee[0].NUMQUIN > 0 && employee[0].TIPONOM === "CN") {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_confianza WHERE nivel = ?`,
            [employee[0].NIVEL]
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }
        break;

      case "FMM":
      case "MMS":
        percepciones = await querysql(
          `SELECT * FROM catalogo_mandosmedios WHERE nivel = ?`,
          [employee[0].NIVEL]
        );
        percepciones = percepciones[0];

        const sueldoGravableMM = (
          parseFloat(percepciones.rdl) +
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.comp_fija_garan)
        ).toFixed(2);

        const isrObjectMM = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableMM, sueldoGravableMM]
        );
        const CAT_SEGURO = await querysql(
          "SELECT * FROM seg_vida WHERE nivel = ?",
          [employee[0].NIVEL]
        );

        deducciones.ISR = (
          ((parseFloat(sueldoGravableMM) -
            parseFloat(isrObjectMM[0].limite_inf)) *
            isrObjectMM[0].porcentajeliminf) /
            100 +
          parseFloat(isrObjectMM[0].cuota_fija)
        ).toFixed(2);
        deducciones.SEGURO_VIDA = parseFloat(CAT_SEGURO[0].seg_vida).toFixed(2);
        deducciones.FONDO_PEN = (
          parseFloat(percepciones.sueldo_base) * 0.09
        ).toFixed(2);
        deducciones.ISR =
          parseFloat(deducciones.ISR) - parseFloat(percepciones.isr_rdl);

        delete percepciones.isr_rdl;
        delete percepciones.rdl;
        if (employee[0].NUMQUIN > 0 && employee[0].TIPONOM === "CN") {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_mandosmedios WHERE nivel = ?`,
            [employee[0].NIVEL]
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        break;
      default:
        return res
          .status(400)
          .json({ message: "Tipo de nómina no reconocido" });
    }
    delete percepciones.id;
    delete percepciones.nivel;

    // Agregar percepciones, deducciones y estado de plaza al empleado
    employee[0].percepciones = percepciones;
    employee[0].deducciones = deducciones;
    employee[0].status_plaza = status_plaza;
    console.log(employee[0]);
    const userAction = {
      username: user.username,
      module: "PSL-CE",
      action: `SOLICITÓ LA INFORMACION DE: "${employee[0].NOMBRES} ${employee[0].APE_PAT} ${employee[0].APE_MAT}"`,
      timestamp: currentDateTime,
    };

    await insertOne("USER_ACTIONS", userAction);

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
    if (/^[a-zA-Z\s]+$/.test(searchQuery)) {
      // Si la consulta contiene solo letras y espacios
      const regex = new RegExp(
        `^${searchQuery.trim().replace(/\s+/g, " ")}$`,
        "i"
      );
      empleados = await query("PLANTILLA", {
        $and: [
          {
            $or: [
              { APE_PAT: { $regex: regex } },
              { APE_MAT: { $regex: regex } },
              { NOMBRES: { $regex: regex } },
              {
                $expr: {
                  $eq: [
                    {
                      $concat: ["$APE_PAT", " ", "$APE_MAT", " ", "$NOMBRES"],
                    },
                    searchQuery.trim(),
                  ],
                },
              },
              {
                $expr: {
                  $eq: [
                    {
                      $concat: ["$APE_PAT", " ", "$NOMBRES"],
                    },
                    searchQuery.trim(),
                  ],
                },
              },
              {
                $expr: {
                  $eq: [
                    {
                      $concat: ["$APE_MAT", " ", "$NOMBRES"],
                    },
                    searchQuery.trim(),
                  ],
                },
              },
            ],
          },
        ],
      });
    } else if (/^[a-zA-Z0-9]+$/.test(searchQuery)) {
      // Si la consulta contiene letras y números
      empleados = await query("PLANTILLA", {
        $and: [
          { STATUS: 1 },
          { $or: [{ CURP: searchQuery }, { RFC: searchQuery }] },
        ],
      });
    } else if (/^\d+$/.test(searchQuery)) {
      empleados = await query("PLANTILLA", {
        $and: [{ STATUS: 1 }, { NUMEMP: parseInt(searchQuery, 10) }],
      });
      // Si la consulta contiene solo números
      empleados = await query("PLANTILLA", { NUMTARJETAS: searchQuery });
    } else {
      return res.status(400).json({ message: "Consulta no válida" });
    }

    res.send(empleados);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al recuperar los datos" });
  }
};

employeeController.updateProyect = async (req, res) => {
  const { _id, PROYECTO, ADSCRIPCION } = req.body;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });
  try {
    const employee = await query("PLANTILLA", { _id: new ObjectId(_id) });
    if (!employee || employee.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }
    const fullName = `${employee[0].NOMBRES} ${employee[0].APE_PAT} ${employee[0].APE_MAT}`;
    userAction.action = `ACTUALIZÓ EL PROYECTO DE: "${fullName}" A "${PROYECTO}"`;
  } catch (error) {
    console.error("Error retrieving employee:", error);
    return res
      .status(500)
      .json({ message: "Error retrieving employee", error });
  }
  const userAction = {
    username: user.username,
    module: "PSL-CE",
    action: `ACTUALIZÓ EL PROYECTO DE: "${fullName}" A "${PROYECTO}"`,
    timestamp: currentDateTime,
  };
  try {
    const result = await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(_id) },
      { $set: { PROYECTO, ADSCRIPCION } }
    );
    const data = { _id };
    await insertOne("USER_ACTIONS", userAction);

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ message: "Empleado no encontrado o sin cambios" });
    }

    res
      .status(200)
      .json({ message: "Empleado actualizado correctamente", _id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al actualizar el empleado", error });
  }
};

// Exportamos el controlador de empleados
module.exports = employeeController;
