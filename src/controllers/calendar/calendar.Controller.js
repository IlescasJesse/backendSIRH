const { query, updateOne, insertOne } = require("../../config/mongo");
const moment = require("moment-timezone");
const { ObjectId } = require("mongodb");
const calendarController = {};

// Definir los días de cada quincena para cada mes
const quincenasPorMes = {
  1: [15, 16], // Enero: 15 días en la primera quincena, 16 en la segunda
  2: [15, 13], // Febrero: 15 días en la primera quincena, 13 en la segunda (28 días)
  3: [15, 16], // Marzo: 15 días en la primera quincena, 16 en la segunda
  4: [15, 15], // Abril: 15 días en ambas quincenas
  5: [15, 16], // Mayo: 15 días en la primera quincena, 16 en la segunda
  6: [15, 15], // Junio: 15 días en ambas quincenas
  7: [15, 16], // Julio: 15 días en la primera quincena, 16 en la segunda
  8: [15, 16], // Agosto: 15 días en la primera quincena, 16 en la segunda
  9: [15, 15], // Septiembre: 15 días en ambas quincenas
  10: [15, 16], // Octubre: 15 días en la primera quincena, 16 en la segunda
  11: [15, 15], // Noviembre: 15 días en ambas quincenas
  12: [15, 16], // Diciembre: 15 días en la primera quincena, 16 en la segunda
};

calendarController.getCalendar = async (req, res) => {
  try {
    // Obtener la fecha actual
    const currentDate = moment().tz("America/Mexico_City");

    // Calcular la quincena actual
    const currentQuin = currentDate.date() <= 15 ? 1 : 2;
    const currentMonth = currentDate.month() + 1; // Los meses en moment son 0-11
    const currentYear = currentDate.year();

    // Calcular el número de quincena en el año
    const quinNumber = (currentMonth - 1) * 2 + currentQuin;

    // Imprimir el número de quincena en consola para verificar
    console.log(`Número de quincena actual: ${quinNumber}`);

    // Realizar la consulta a MongoDB para obtener los datos de la quincena actual y anteriores
    const data = await query("CALENDARIO", { QUIN: { $lte: quinNumber } });

    // Organizar los datos en arrays separados por quincena
    const organizedData = {};
    data.forEach((item) => {
      const fecha = moment(item.FECHA, "DD-MM-YYYY");
      const mes = fecha.month() + 1; // Los meses en moment son 0-11
      const dia = fecha.date();
      const [primeraQuincena, segundaQuincena] = quincenasPorMes[mes];

      // Determinar a qué quincena pertenece el día
      const quincena =
        dia <= primeraQuincena
          ? (mes - 1) * 2 + 1 // Primera quincena del mes
          : (mes - 1) * 2 + 2; // Segunda quincena del mes

      if (!organizedData[quincena]) {
        organizedData[quincena] = [];
      }
      organizedData[quincena].push(item);
    });

    // Convertir el objeto en un array de arrays
    const result = Object.keys(organizedData)
      .sort((a, b) => a - b) // Asegurar que las quincenas estén en orden
      .map((key) => organizedData[key]);

    // Enviar el resultado
    res.send(result);
  } catch (error) {
    console.error("Error en la consulta a MongoDB:", error);
    res.status(500).send("Error en la consulta");
  }
};

calendarController.changeStatus = async (req, res) => {
  const { _id, HABIL, MOTIVO } = req.body; // Cambiado FESTIVIDAD a MOTIVO
  const currentDateTime = moment()
    .tz("America/Mexico_City")
    .format("YYYY-MM-DD HH:mm:ss");

  const user = req.user; // Obtener el usuario autenticado
  console.log(req.body.MOTIVO);
  if (!user) {
    return res.status(401).send("Usuario no autenticado");
  }

  try {
    const updateFields = {};

    if (HABIL) {
      if (HABIL.BASE !== undefined) {
        updateFields["HABIL.BASE"] = HABIL.BASE;
        updateFields["MOTIVO"] = MOTIVO;
      }
      if (HABIL.CONTRATO !== undefined) {
        updateFields["HABIL.CONTRATO"] = HABIL.CONTRATO;
        updateFields["MOTIVO"] = MOTIVO;
      }
    }
    const calendario = await query("CALENDARIO", { _id: new ObjectId(_id) });

    // Actualizar el estado del calendario en MongoDB
    await updateOne(
      "CALENDARIO",
      { _id: new ObjectId(_id) },
      { $set: updateFields }
    );
    const userAction = {
      username: user.username,
      module: "AEI-EC",
      action: `CAMBIO EL ESTATUS DE LA FECHA : ${calendario[0].FECHA} POR MOTIVO: ${MOTIVO}`,
      timestamp: currentDateTime,
      dataAditional: {
        HABIL: HABIL,
      },
    };
    await insertOne("USERS_ACTIONS", userAction);
    res.status(200).send("Estado actualizado correctamente");
  } catch (error) {
    console.error("Error al actualizar el estado:", error);
    res.status(500).send("Error al actualizar el estado");
  }
};

module.exports = calendarController;
