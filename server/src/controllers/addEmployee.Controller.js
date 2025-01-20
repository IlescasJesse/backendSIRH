const { query } = require("../config/mongo");
const { querysql } = require("../config/mysql");

employeeController = {};

// Función para obtener posiciones vacantes y sus ocupantes anteriores
employeeController.getVacants = async (req, res) => {
  try {
    const vacants = await query("PLANTILLA_2025", { status: 2 });
    const previousOcupant = await query("PLAZAS_2025", { status: 2 });
    vacants.forEach((vacant) => {
      const matchingPreviousOcupant = previousOcupant.find(
        (po) => po.NUMPLA === vacant.NUMPLA
      );
      if (matchingPreviousOcupant) {
        vacant.previousOcupant = matchingPreviousOcupant;
      }
    });

    res.status(200).json(vacants);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};

// Función para obtener información del municipio basada en el código postal
employeeController.getMpio = async (req, res) => {
  const { zipCode } = req.body;
  if (!zipCode) {
    return res.status(400).json({ message: "zipCode is required" });
  }
  try {
    const mpios = await querysql(
      "SELECT d_codigo, d_asenta, d_tipo_asenta, D_mnpio, d_estado, d_ciudad FROM CP_2025 WHERE d_codigo = ?",
      [zipCode]
    );
    const formattedMpios = mpios.map((mpio) => ({
      municipio: mpio.D_mnpio.toUpperCase(),

      estado: mpio.d_estado.toUpperCase(),

      asentamiento: `${mpio.d_tipo_asenta.toUpperCase()} ${mpio.d_asenta.toUpperCase()}`,

      ciudad: mpio.d_ciudad.toUpperCase(),

      complete: `${mpio.d_tipo_asenta.toUpperCase()} ${mpio.d_asenta.toUpperCase()}, ${mpio.D_mnpio.toUpperCase()}, ${mpio.d_estado.toUpperCase()}`,

      ciudad: mpio.d_ciudad,
      complete: `${mpio.d_tipo_asenta} ${mpio.d_asenta}, ${mpio.D_mnpio}, ${mpio.d_estado}`,
    }));
    res.status(200).json(formattedMpios);
  } catch (error) {
    console.error("Error ejecutando la consulta SQL:", error);
    res.status(500).json({ message: "Error executing SQL query", error });
  }
};

// Función para obtener información interna incluyendo unidad ejecutora, categorías y adscripciones
employeeController.internalInformation = async (req, res) => {
  try {
    const unity_ejecutor = await querysql("SELECT * FROM UNIDAD_RESPONSABLE");
    const categorias = await querysql("SELECT * FROM CATEGORIAS_CATALOGO");

    const level2 = await querysql(
      "SELECT NOMBRE, CODIGO_INTERNO, NIVEL FROM ADSC_LEVEL2"
    );
    const level3 = await querysql(
      "SELECT NOMBRE, CODIGO_INTERNO, NIVEL FROM ADSC_LEVEL3"
    );
    const level4 = await querysql(
      "SELECT NOMBRE, CODIGO_INTERNO, NIVEL FROM ADSC_LEVEL4 "
    );
    const level5 = await querysql(
      "SELECT NOMBRE, CODIGO_INTERNO, NIVEL FROM ADSC_LEVEL5"
    );

    const departamentos = level3
      .filter((item) => item.NIVEL === 5)
      .concat(level4.filter((item) => item.NIVEL === 5))
      .concat(level5.filter((item) => item.NIVEL === 5));

    const unidades = level4
      .filter((item) => item.NIVEL === 4)
      .concat(level3.filter((item) => item.NIVEL === 4));

    const direcciones = level3
      .filter((item) => item.NIVEL === 3)
      .concat(level2.filter((item) => item.NIVEL === 3));

    const subsecretarias = level2.filter((item) => item.NIVEL === 2);

    const adscripciones = [
      subsecretarias,
      direcciones,
      unidades,
      departamentos,
    ];

    const unidad_ejecutora = Object.values(
      unity_ejecutor.reduce((acc, item) => {
        const { UNIDAD_EJECUTORA, UNIDAD_RESPONSABLE, ...rest } = item;
        if (!acc[UNIDAD_EJECUTORA]) {
          acc[UNIDAD_EJECUTORA] = {
            UNIDAD_EJECUTORA,
            UNIDADES_RESPONSABLES: [],
          };
        }
        acc[UNIDAD_EJECUTORA].UNIDADES_RESPONSABLES.push({
          UNIDAD_RESPONSABLE,
          ...rest,
        });
        return acc;
      }, {})
    );
    const internalInformation = { unidad_ejecutora, categorias, adscripciones };

    res.status(200).json(internalInformation);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};

// Función para obtener información de una plaza basada en su número
employeeController.dataPlaza = async (req, res) => {
  const { NUMPLA } = req.body;
  if (!NUMPLA) {
    return res.status(400).json({ message: "NUMPLA is required" });
  }
  try {
    const dataPlaza = await query("PLAZAS_2025", { NUMPLA, status: 2 });
    if (!dataPlaza || dataPlaza.length === 0) {
      return res.status(404).json({ message: "plaza vacante no encontrada" });
    }
    res.status(200).json(dataPlaza);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving employees", error: err });
  }
};

// Función para guardar un empleado
employeeController.saveEmployee = async (req, res) => {
  const { data } = req.body;
  console.log(data);
  res.status(200).json({ message: "Employee saved" });
};

module.exports = employeeController;
