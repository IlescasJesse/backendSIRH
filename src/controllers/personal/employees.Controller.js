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
let historial;

employeeController.getProfileData = async (req, res) => {
  const { id } = req.params;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  try {
    const hsy_areas = await query("HSY_AREAS", {
      id_employee: new ObjectId(id),
    });
    const hsy_proyectos = await query("HSY_PROYECTOS", {
      id_employee: new ObjectId(id),
    });
    const hsy_licencias = await query("HSY_LICENCIAS", {
      id_employee: new ObjectId(id),
    });
    const hsy_recategorizaciones = await query("HSY_RECATEGORIZACIONES", {
      id_employee: new ObjectId(id),
    });
    const hsy_status = await query("HSY_STATUS_EMPLEADO", {
      id_employee: new ObjectId(id),
    });

    historial = {
      hsy_licencias,
      hsy_areas,
      hsy_proyectos,
      hsy_recategorizaciones,
      hsy_status,
    };
    // Buscar el empleado por su ID
    // const employee = await query("PLANTILLA", {
    //   _id: new ObjectId(id),
    //   $or: [{ STATUS: 1 }, { STATUS: 2 }, { status: 1 }, { status: 2 }],
    // });
    // if (!employee || employee.length === 0) {
    //   return res.status(404).json({ message: "Empleado no encontrado" });
    // }

    const [employeePlantilla = [], employeeForanea = []] = await Promise.all([
      query("PLANTILLA", { _id: new ObjectId(id), $or: [{ STATUS: 1 }, { STATUS: 2 }, { status: 1 }, { status: 2 }] }),
      query("LICENCIAS", { _id: new ObjectId(id), $or: [{ status: 1 }] }),
    ]);

    const employee = employeePlantilla.length
      ? employeePlantilla
      : employeeForanea.length
        ? employeeForanea
        : [];

    if (!employee || employee.length === 0) {
      res.status(404).send({ error: "No data found" });
      return;
    }

    // Validamos si el perfil que se esta consultado es de un empleado con licencia activa
    const licenciaActiva = await query("LICENCIAS", {
      _id: new ObjectId(id),
      status: 1,
    });


    if (licenciaActiva && licenciaActiva.length > 0) {
      employee[0].LICENCIA_ACTIVA = true;
    } else {
      employee[0].LICENCIA_ACTIVA = false;
    }

    // Validamos si el empleado esta cubriendo una licencia, para no descontarle fondo de pensiones ni cuota sindical
    const cubreLicencia = await query("LICENCIAS", {
      NUMPLA: employee[0].NUMPLA,
      status: 1,
    });

    if (cubreLicencia && cubreLicencia.length > 0) {
      employee[0].CUBRIENDO_LICENCIA = true;
    } else {
      employee[0].CUBRIENDO_LICENCIA = false;
    }

    const faceRecognition = await query("VECTORES_FACIALES", {
      employeeId: new ObjectId(id),
    });

    if (faceRecognition && faceRecognition.length > 0) {
      employee[0].FACE_RECOGNITION = true;
    } else {
      employee[0].FACE_RECOGNITION = false;
    }

    if (employee[0].DIRECCION) {
      employee[0].DIRECCION_COMPLETA = `${employee[0].DIRECCION.DOMICILIO} ${employee[0].DIRECCION.NUM_EXT}, ${employee[0].DIRECCION.COLONIA}, ${employee[0].DIRECCION.MUNICIPIO} ${employee[0].DIRECCION.ESTADO}.`;
      employee[0].CP = employee[0].DIRECCION.CP;
    } else {
      employee[0].DIRECCION_COMPLETA = employee[0].DOMICILIO;
    }

    // Buscar el estado de la plaza del empleado
    const status_plaza = await query("PLAZAS", {
      NUMPLA: employee[0].NUMPLA_ORIGEN ? employee[0].NUMPLA_ORIGEN : employee[0].NUMPLA,
    });

    if (!status_plaza || status_plaza.length === 0) {
      return res.status(404).json({ message: "Plaza no encontrada" });
    }

    let percepciones, deducciones = {};

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
      // Percepciones y deducciones para base central o foránea
      case "M51":
      case "F51":
        // Obtener percepciones base según el nivel del empleado
        percepciones = await querysql(
          `SELECT * FROM catalogo_base  WHERE nivel = ?`,
          [employee[0].NIVEL],
        );
        percepciones = percepciones[0];

        if (employee[0].LICENCIA_ACTIVA === false && employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_base WHERE NIVEL = ?`,
            [employee[0].NIVEL],
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        // Determinar si la quincena actual es de 16 días (segunda quincena de mes con 31 días) para aunmentar el día de ajuste
        const now = new Date();
        const day = now.getDate();
        const month = now.getMonth() + 1;
        const isSegundaQuincena16Dias = day > 15 && [1, 3, 5, 7, 8, 10, 12].includes(month);

        let sueldoGravableB;
        if (isSegundaQuincena16Dias) {
          const diaAjuste = percepciones.sueldo_base / 30;
          percepciones.dia_ajuste = diaAjuste.toFixed(2);

          sueldoGravableB = (
            parseFloat(percepciones.sueldo_base) +
            parseFloat(percepciones.dia_ajuste)
          ).toFixed(2);
        } else {
          sueldoGravableB = parseFloat(percepciones.sueldo_base).toFixed(2);
        }

        // Calcular las deducciones 
        const isrDataB = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableB, sueldoGravableB],
        );
        const isrObjectB = isrDataB[0];

        const isrBrutoB =
          ((sueldoGravableB - parseFloat(isrObjectB.limite_inf)) *
            parseFloat(isrObjectB.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectB.cuota_fija);

        const subsidioDataB = await querysql(
          "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
          [sueldoGravableB, sueldoGravableB],
        );

        const subsidioB =
          subsidioDataB && subsidioDataB.length > 0
            ? parseFloat(subsidioDataB[0].subsidio)
            : 0;

        let isrFinal = isrBrutoB - subsidioB;

        if (isrFinal < 0) isrFinal = 0;

        deducciones.ISR = isrFinal.toFixed(2);

        // Si el empleado esta cubriendo una licencia, no se le descuenta el fondo de pensiones
        if (employee[0].CUBRIENDO_LICENCIA === false || employee[0].LICENCIA_ACTIVA === true) {
          const FONDO_PENSIONES = (
            parseFloat(percepciones.sueldo_base) * 0.09
          ).toFixed(2);
          deducciones.FONDO_PENSIONES = FONDO_PENSIONES;
        }

        // Si el empleado esta cubriendo una licencia, no se le descuenta la cuota sindical
        if (employee[0].CUBRIENDO_LICENCIA === false || employee[0].LICENCIA_ACTIVA === true) {
          deducciones.CUOTA_SINDICAL = (
            parseFloat(percepciones.sueldo_base) * 0.01
          ).toFixed(2);
        }

        deducciones.IMSS = (
          parseFloat(percepciones.sueldo_base) * 0.041219
        ).toFixed(2);
        break;
      case "FCT":
      case "CCT":
      case "F53":
      case "M53":
        percepciones = await querysql(
          `SELECT * FROM catalogo_contrato WHERE nivel = ?`,
          [employee[0].NIVEL],
        );
        percepciones = percepciones[0];

        if (employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_confianza WHERE nivel = ?`,
            [employee[0].NIVEL],
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        const sueldoGravableCC = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.estimulo)
        ).toFixed(2);

        const isrDataCC = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableCC, sueldoGravableCC],
        );
        const isrObjectCC = isrDataCC[0];

        const isrBrutoCC =
          ((sueldoGravableCC - parseFloat(isrObjectCC.limite_inf)) *
            parseFloat(isrObjectCC.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectCC.cuota_fija);

        const subsidioDataCC = await querysql(
          "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
          [sueldoGravableCC, sueldoGravableCC],
        );

        const subsidioCC =
          subsidioDataCC && subsidioDataCC.length > 0
            ? parseFloat(subsidioDataCC[0].subsidio)
            : 0;

        let isrFinalCC = isrBrutoCC - subsidioCC;

        if (isrFinalCC < 0) isrFinalCC = 0;

        deducciones.ISR = isrFinalCC.toFixed(2);

        const FONDO_PENSIONES_CC = (
          parseFloat(percepciones.sueldo_base) * 0.09
        ).toFixed(2);
        deducciones.FONDO_PENSIONES = FONDO_PENSIONES_CC;

        deducciones.IMSS = (
          parseFloat(percepciones.sueldo_base) * 0.041219
        ).toFixed(2);

        break;

      case "FCO":
      case "511":
        percepciones = await querysql(
          `SELECT * FROM catalogo_contrato WHERE nivel = ?`,
          [employee[0].NIVEL],
        );

        percepciones = percepciones[0];

        if (employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_confianza WHERE nivel = ?`,
            [employee[0].NIVEL],
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        const sueldoGravableCN = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.estimulo)
        ).toFixed(2);

        const isrDataCN = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableCN, sueldoGravableCN],
        );
        const isrObjectCN = isrDataCN[0];

        const isrBrutoCN =
          ((sueldoGravableCN - parseFloat(isrObjectCN.limite_inf)) *
            parseFloat(isrObjectCN.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectCN.cuota_fija);

        const subsidioDataCN = await querysql(
          "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
          [sueldoGravableCN, sueldoGravableCN],
        );

        const subsidioCN =
          subsidioDataCN && subsidioDataCN.length > 0
            ? parseFloat(subsidioDataCN[0].subsidio)
            : 0;

        let isrFinalCN = isrBrutoCN - subsidioCN;

        if (isrFinalCN < 0) isrFinalCN = 0;

        deducciones.ISR = isrFinalCN.toFixed(2);

        const FONDO_PENSIONES_CN = (
          parseFloat(percepciones.sueldo_base) * 0.09
        ).toFixed(2);
        deducciones.FONDO_PENSIONES = FONDO_PENSIONES_CN;

        deducciones.CUOTA_SINDICAL = (
          parseFloat(percepciones.sueldo_base) * 0.01
        ).toFixed(2);

        deducciones.IMSS = (
          parseFloat(percepciones.sueldo_base) * 0.041219
        ).toFixed(2);

        break;

      case "FMM":
      case "MMS":
        percepciones = await querysql(
          `SELECT * FROM catalogo_mandosmedios WHERE nivel = ?`,
          [employee[0].NIVEL],
        );
        percepciones = percepciones[0];

        if (employee[0].NUMQUIN > 0) {
          const quinquenio = await querysql(
            `SELECT quin_${employee[0].NUMQUIN} FROM quin_mandosmedios WHERE nivel = ?`,
            [employee[0].NIVEL],
          );
          percepciones[`QUINQUENIOS: ${employee[0].NUMQUIN}`] =
            quinquenio[0][`quin_${employee[0].NUMQUIN}`];
        }

        const sueldoGravableMM = (
          parseFloat(percepciones.rdl) +
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.comp_fija_garan)
        ).toFixed(2);

        const isrDataMM = await querysql(
          "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
          [sueldoGravableMM, sueldoGravableMM],
        );

        const isrObjectMM = isrDataMM[0];
        const isrBrutoMMM =
          ((sueldoGravableMM - parseFloat(isrObjectMM.limite_inf)) *
            parseFloat(isrObjectMM.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectMM.cuota_fija);

        const subsidioDataMM = await querysql(
          "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
          [sueldoGravableMM, sueldoGravableMM],
        );

        const subsidioMM =
          subsidioDataMM && subsidioDataMM.length > 0
            ? parseFloat(subsidioDataMM[0].subsidio)
            : 0;

        let isrFinalMM = isrBrutoMMM - subsidioMM;

        if (isrFinalMM < 0) isrFinalMM = 0;

        deducciones.ISR = isrFinalMM.toFixed(2);

        deducciones.IMSS = (
          parseFloat(percepciones.sueldo_base) * 0.041219
        ).toFixed(2);

        const CAT_SEGURO = await querysql(
          "SELECT * FROM seg_vida WHERE nivel = ?",
          [employee[0].NIVEL],
        );

        deducciones.SEGURO_VIDA = parseFloat(CAT_SEGURO[0].seg_vida).toFixed(2);
        deducciones.FONDO_PENCIONES = (
          parseFloat(percepciones.sueldo_base) * 0.09
        ).toFixed(2);
        deducciones.ISR =
          parseFloat(deducciones.ISR) - parseFloat(percepciones.isr_rdl);

        delete percepciones.isr_rdl;
        delete percepciones.rdl;

        break;
      default:
        return res
          .status(400)
          .json({ message: "Tipo de nómina no reconocido" });
    }
    delete percepciones.id;
    delete percepciones.nivel;

    // Agregar percepciones, deducciones y estado de plaza al empleado
    employee[0].historial = historial;
    employee[0].percepciones = percepciones;
    employee[0].deducciones = deducciones;
    employee[0].status_plaza = status_plaza;
    const userAction = {
      username: user.username,
      module: "PSL-CE",
      action: `CONSULTÓ EL PERFIL DEL EMPLEADO"${employee[0].NOMBRES} ${employee[0].APE_PAT} ${employee[0].APE_MAT}"`,
      timestamp: currentDateTime,
    };

    await insertOne("USER_ACTIONS", userAction);

    // Enviar la respuesta con los datos del empleado
    res.json(employee[0]);
  } catch (error) {
    console.error(error?.message, error?.stack);
    res.status(500).json({ message: "Error al buscar el empleado", error: error.message ?? String(error) });
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
        "i",
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
employeeController.updateArea = async (req, res) => {
  const { _id, ADSCRIPCION, AREA_RESP, CLAVE } = req.body;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });

  try {
    // Verificar si el empleado existe
    const employee = await query("PLANTILLA", { _id: new ObjectId(_id) });
    if (!employee || employee.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    if (CLAVE === employee[0].CLAVE) {
      return res.status(409).json({ message: "Sin cambios" });
    }

    const fullName = `${employee[0].NOMBRES} ${employee[0].APE_PAT} ${employee[0].APE_MAT}`;
    const hsy_data = {
      ...req.body,
      currentDateTime,
      last_adscripcion: employee[0].ADSCRIPCION,
      last_clave: employee[0].CLAVE,
      id_employee: new ObjectId(_id),
    };
    delete hsy_data._id;

    // Actualizar la adscripción del empleado
    const result = await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(_id) },
      { $set: { ADSCRIPCION, AREA_RESP, CLAVE } },
    );
    await insertOne("HSY_AREAS", hsy_data);

    // Registrar la acción del usuario
    const userAction = {
      username: user.username,
      module: "PSL-CE",
      action: `MODIFICÓ LA ADSCRIPCIÓN A DEL EMPLEADO: "${fullName}"`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res.status(200).json({ message: "Empleado actualizado correctamente", _id });
  } catch (error) {
    console.error("Error al actualizar el empleado:", error);
    res.status(500).json({ message: "Error al actualizar el empleado", error });
  }
};
employeeController.updateProyect = async (req, res) => {
  const { _id, PROYECTO, ADSCRIPCION, AREA_RESP, CLAVE } = req.body;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });

  try {
    // Verificar si el empleado existe
    const employee = await query("PLANTILLA", { _id: new ObjectId(_id) });
    if (!employee || employee.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    if (PROYECTO === employee[0].PROYECTO) {
      return res.status(409).json({ message: "Sin cambios" });
    }

    const fullName = `${employee[0].NOMBRES} ${employee[0].APE_PAT} ${employee[0].APE_MAT}`;
    const hsy_data = {
      ...req.body,
      currentDateTime,
      last_proyect: employee[0].PROYECTO,
      last_adscripcion: employee[0].ADSCRIPCION,
      id_employee: new ObjectId(_id),
    };
    delete hsy_data._id;
    // Actualizar el proyecto y/o adscripción del empleado
    const result = await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(_id) },
      { $set: { PROYECTO, ADSCRIPCION, AREA_RESP, CLAVE } },
    );
    await insertOne("HSY_PROYECTOS", hsy_data);

    // Registrar la acción del usuario
    const userAction = {
      username: user.username,
      module: "PSL-CE",
      action: `MODIFICÓ EL PROYECTO A DEL EMPLEADO: "${fullName}"`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res
      .status(200)
      .json({ message: "Empleado actualizado correctamente", _id });
  } catch (error) {
    console.error("Error al actualizar el empleado:", error);
    res.status(500).json({ message: "Error al actualizar el empleado", error });
  }
};
employeeController.recategorizeEmployee = async (req, res) => {
  const { _id, NUMPLA, CLAVECAT, NOMCATE, NIVEL, TIPONOM } = req.body;
  const { user } = req;
  const currentDateTime = new Date().toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
  });

  try {
    // Verificar si el empleado existe
    const employee = await query("PLANTILLA", { _id: new ObjectId(_id) });
    if (!employee || employee.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    let NUMPLA_ORIGEN = employee[0].NUMPLA_ORIGEN;

    // Si NO tiene plaza origen, se asigna la actual (la primera con la que entró)
    if (!NUMPLA_ORIGEN) {
      NUMPLA_ORIGEN = employee[0].NUMPLA;
    }

    const fullName = `${employee[0].NOMBRES} ${employee[0].APE_PAT} ${employee[0].APE_MAT}`;
    const hsy_data = {
      ...req.body,
      currentDateTime,
      last_numpla: employee[0].NUMPLA,
      last_clavecat: employee[0].CLAVECAT,
      last_nomcate: employee[0].NOMCATE,
      last_level: employee[0].NIVEL,
      id_employee: new ObjectId(_id),
    };
    delete hsy_data._id;
    // Actualizar el proyecto y/o adscripción del empleado
    const result = await updateOne(
      "PLANTILLA",
      { _id: new ObjectId(_id) },
      { $set: { NUMPLA, CLAVECAT, NOMCATE, NIVEL, TIPONOM, NUMPLA_ORIGEN } },
    );
    await insertOne("HSY_RECATEGORIZACIONES", hsy_data);

    if (!result || result.matchedCount === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: "Empleado no encontrado o sin cambios" });
    }

    // Registrar la acción del usuario
    const userAction = {
      username: user.username,
      module: "PSL-CE",
      action: `RECATEGORIZÓ A "${NOMCATE} - ${CLAVECAT}" AL EMPLEADO: "${fullName}"`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res.status(200).json({ message: "Empleado actualizado correctamente", _id });
  } catch (error) {
    console.error("Error al actualizar el empleado:", error);
    res.status(500).json({ message: "Error al actualizar el empleado", error });
  }
};
employeeController.getUserActions = async (req, res) => {
  res.status(200).json("");
  // try {
  //   const actions = await query("USER_ACTIONS", {});
  //   const users = await query("USUARIOS", {});

  //   // Excluir acciones cuyo texto comience con "CONSULTÓ" (case-insensitive)
  //   const filteredActions = actions.filter((a) => {
  //     const text = (a.action || "").toString().trim();
  //     return !/^CONSULTÓ/i.test(text);
  //   });

  //   filteredActions.forEach((action) => {
  //     const matchedUser = users.find((u) => u.username === action.username);
  //     if (matchedUser) {
  //       action.name = matchedUser.name;
  //     }
  //   });

  //   res.send(filteredActions);
  // } catch (error) {
  //   console.error("Error fetching user actions:", error);
  //   res.status(500).json({ error: "An error occurred while fetching data" });
  // }
};
employeeController.getUserActionsPersonal = async (req, res) => {
  try {
    const actions = await query("USER_ACTIONS", {});
    const users = await query("USUARIOS", {});

    const filteredActions = actions.filter((a) => {
      const text = (a.action || "").toString().trim();
      const module = (a.module || "").toString().trim();
      return !/^CONSULTÓ/i.test(text) && /^PSL/i.test(module);
    });

    filteredActions.forEach((action) => {
      const matchedUser = users.find((u) => u.username === action.username);
      if (matchedUser) {
        action.name = matchedUser.name;
      }
    });

    res.send(filteredActions);
  } catch (error) {
    console.error("Error fetching user actions:", error);
    res.status(500).json({ error: "An error occurred while fetching data" });
  }
};
employeeController.addCategory = async (req, res) => {
  const { CLAVE_CATEGORIA, DESCRIPCION, NIVEL, T_NOMINA } = req.body;

  try {
    // Validar que los campos requeridos no sean undefined
    if (!CLAVE_CATEGORIA || !DESCRIPCION || !NIVEL || !T_NOMINA) {
      return res
        .status(400)
        .json({ message: "Todos los campos son obligatorios" });
    }

    // Insertar la nueva categoría en la base de datos
    const result = await querysql(
      `INSERT INTO categorias_catalogo (CLAVE_CATEGORIA, DESCRIPCION, NIVEL, T_NOMINA) VALUES (?, ?, ?, ?)`,
      [CLAVE_CATEGORIA, DESCRIPCION, NIVEL, T_NOMINA],
    );

    res.status(201).json({ message: "Categoría agregada correctamente" });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      res.status(403).json({ message: "La categoría ya existe" });
    } else if (error.code === "ER_BAD_FIELD_ERROR") {
      res.status(404).json({ message: "No se pudo agregar la categoría" });
    } else {
      console.error("Error adding category:", error);
      res.status(500).json({ message: "Error interno del servidor", error });
    }
  }
};

// Función para obtener conteo de empleados por tipo de nombramiento y género
employeeController.getEmployeeCount = async (req, res) => {
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  const tipoNomMap = {
    F51: "BASE FORÁNEA",
    M51: "BASE CENTRAL",
    FCT: "CONTRATO CONFIANZA FORANEO",
    CCT: "CONTRATO CONFIANZA CENTRAL",
    FCO: "NOMBRAMIENTO CONFIANZA FORANEO",
    511: "NOMBRAMIENTO CONFIANZA CENTRAL",
    F53: "CONTRATO FORÁNEO",
    M53: "CONTRATO CENTRAL",
    FMM: "MANDOS MEDIOS FORÁNEOS",
    MMS: "MANDOS MEDIOS CENTRAL",
  };

  try {
    const todosEmpleados = await query("PLANTILLA", { status: 1 });

    // Contar por tipo de nombramiento
    const conteo = {};
    let totalHombres = 0;
    let totalMujeres = 0;

    todosEmpleados.forEach((emp) => {
      const tipoNom = emp.TIPONOM || "SIN ASIGNAR";
      conteo[tipoNom] = (conteo[tipoNom] || 0) + 1;
      if (emp.SEXO === "H") {
        totalHombres++;
      } else if (emp.SEXO === "M") {
        totalMujeres++;
      }
    });

    // Construir respuesta con descripción
    const porTipoNombramiento = Object.keys(conteo)
      .sort()
      .map((clave) => ({
        clave,
        descripcion: tipoNomMap[clave] || "Tipo no definido",
        cantidad: conteo[clave],
      }));
    // Registrar acción del usuario
    const userAction = {
      username: user.username,
      module: "PSL-EST",
      action: `CONSULTÓ CONTEO DE EMPLEADOS POR TIPO DE NOMBRAMIENTO Y GÉNERO`,
      timestamp: currentDateTime,
    };
    await insertOne("USER_ACTIONS", userAction);

    res.status(200).json({
      totalEmpleados: todosEmpleados.length,
      totalHombres,
      totalMujeres,
      porTipoNombramiento,
    });
  } catch (error) {
    console.error("Error counting employees by tipo de nombramiento:", error);
    res
      .status(500)
      .json({ error: "An error occurred while counting employees" });
  }
};

// Exportamos el controlador de empleados
module.exports = employeeController;
