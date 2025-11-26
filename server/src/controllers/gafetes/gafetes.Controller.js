const {
  query,
  deleteOne,
  insertOne,
  findById,
  updateOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const moment = require("moment");

const gafetesController = {};

// Obtener perfil del empleado
gafetesController.createProvCredentials = async (req, res) => {
  const data = req.body;
  try {
    await insertOne("GAFETES_TEMPO", data);
    res.send({ message: "Temporary credentials created successfully" });
  } catch (error) {
    console.error("Error creating temporary credentials:", error);
    res.status(500).send({
      error: "An error occurred while creating temporary credentials",
    });
  }
};
gafetesController.getProfile = async (req, res) => {
  const id = req.params.id;
  const user = req.user;

  try {
    // Buscar empleado en PLANTILLA y PLANTILLA_FORANEA
    const [employeePlantilla = [], employeeForanea = []] = await Promise.all([
      query("PLANTILLA", { _id: new ObjectId(id) }),
      query("PLANTILLA_FORANEA", { _id: new ObjectId(id) }),
      query("GAFETES_TEMPO", { _id: new ObjectId(id) }),
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

    const emp = employee[0];

    // Obtener la bitácora del empleado
    const bitacora = await query("BITACORA", {
      id_plantilla: emp._id,
    });

    emp.bitacora = bitacora;

    const ASIST_PROFILE = {
      employee: [emp],
    };

    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const userAction = {
      timestamp: currentDateTime,
      username: user.username,
      module: "AEI-PI",
      action: `CONSULTÓ EL PERFIL DE VACACIONES DEL EMPLEADO "${emp.NOMBRES} ${emp.APE_PAT} ${emp.APE_MAT}"`,
    };
    await insertOne("USER_ACTIONS", userAction);
    console.log("Profile data:", ASIST_PROFILE);
    res.send(ASIST_PROFILE);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).send({ error: "An error occurred while fetching data" });
  }
};
gafetesController.updateEmployee = async (req, res) => {
  const updateData = req.body;
  updateData._id = req.params.id;
  try {
    const id = updateData._id;
    delete updateData._id;
    // Buscar primero en PLANTILLA
    const employeePlantilla = await query("PLANTILLA", {
      _id: new ObjectId(id),
    });

    if (employeePlantilla.length > 0) {
      await updateOne(
        "PLANTILLA",
        { _id: new ObjectId(id) },
        { $set: updateData }
      );
      res.send({ message: "Employee updated successfully" });
    } else {
      // Buscar en PLANTILLA_FORANEA si no está en PLANTILLA
      const employeeForanea = await query("PLANTILLA_FORANEA", {
        _id: new ObjectId(id),
      });
      if (employeeForanea.length > 0) {
        await updateOne(
          "PLANTILLA_FORANEA",
          { _id: new ObjectId(id) },
          { $set: updateData }
        );
        res.send({ message: "Employee updated successfully" });
      } else {
        // Si no está en PLANTILLA ni en PLANTILLA_FORANEA, buscar en GAFETES_TEMPO
        const employeeGafetesTempo = await query("GAFETES_TEMPO", {
          _id: new ObjectId(id),
        });
        if (employeeGafetesTempo.length > 0) {
          await updateOne(
            "GAFETES_TEMPO",
            { _id: new ObjectId(id) },
            { $set: updateData }
          );
          res.send({ message: "Employee updated successfully" });
        } else {
          res.status(404).send({
            error:
              "Empleado no encontrado en PLANTILLA, PLANTILLA_FORANEA ni en GAFETES_TEMPO",
          });
        }
      }
    }
  } catch (error) {
    console.error("Error updating employee:", error);
    res
      .status(500)
      .send({ error: "An error occurred while updating employee data" });
  }
};
gafetesController.printCredentials = async (req, res) => {
  try {
    const data = req.body;

    // Verificar si data es un array o un objeto individual
    const credentials = Array.isArray(data) ? data : [data];

    // Crear documento PDF en tamaño carta (216mm x 279mm)
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 20,
    });

    // Configurar headers para la respuesta
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=gafetes-${moment().format("YYYY-MM-DD-HHmmss")}.pdf`
    );

    // Pipe el PDF a la respuesta
    doc.pipe(res);

    // Procesar cada credencial
    for (let i = 0; i < credentials.length; i++) {
      const credential = credentials[i];

      // Determinar el tipo de credencial
      const tipoCredencial =
        credential.TIPO_CREDENCIAL || credential.tipo || "BASE";

      // Agregar nueva página si no es la primera credencial
      if (i > 0) {
        doc.addPage();
      }

      // Renderizar según el tipo de credencial
      switch (tipoCredencial.toUpperCase()) {
        case "BASE":
          renderCredentialBASE(doc, credential);
          break;
        case "CONTRATO":
          renderCredentialCONTRATO(doc, credential);
          break;
        case "HONORARIOS":
          renderCredentialHONORARIOS(doc, credential);
          break;
        default:
          console.warn(
            `Tipo de credencial desconocido: ${tipoCredencial}, usando BASE por defecto`
          );
          renderCredentialBASE(doc, credential);
      }
    }

    // Finalizar el documento
    doc.end();

    // Log de acción del usuario
    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const userAction = {
      timestamp: currentDateTime,
      username: req.user?.username || "system",
      module: "GAFETES",
      action: `GENERÓ ${credentials.length} CREDENCIAL(ES) EN PDF`,
    };
    await insertOne("USER_ACTIONS", userAction);
  } catch (error) {
    console.error("Error generating credentials PDF:", error);
    res.status(500).send({
      error: "An error occurred while generating credentials PDF",
      details: error.message,
    });
  }
};

// ==========================================
// FUNCIONES DE RENDERIZADO PARA CADA TIPO
// ==========================================

/**
 * Renderiza credencial tipo BASE
 * @param {PDFDocument} doc - Documento PDF
 * @param {Object} data - Datos del empleado
 */
function renderCredentialBASE(doc, data) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  // TÍTULO DEL TIPO DE CREDENCIAL
  doc
    .fontSize(10)
    .fillColor("#0066cc")
    .text("CREDENCIAL - BASE", 50, 30, { align: "left" });

  // ENCABEZADO
  doc
    .fontSize(16)
    .fillColor("#000000")
    .text("CREDENCIAL DE IDENTIFICACIÓN", 0, 60, { align: "center" });

  // BORDE DE LA CREDENCIAL
  const credX = 50;
  const credY = 100;
  const credWidth = pageWidth - 100;
  const credHeight = 350;

  doc.rect(credX, credY, credWidth, credHeight).stroke();

  // FOTO (placeholder)
  const fotoX = credX + 20;
  const fotoY = credY + 20;
  doc.rect(fotoX, fotoY, 120, 150).stroke();
  doc.fontSize(10).text("FOTO", fotoX + 40, fotoY + 70);

  // INFORMACIÓN DEL EMPLEADO
  const infoX = fotoX + 140;
  let infoY = credY + 20;

  doc
    .fontSize(14)
    .fillColor("#000000")
    .font("Helvetica-Bold")
    .text(
      `${data.NOMBRES || ""} ${data.APE_PAT || ""} ${data.APE_MAT || ""}`,
      infoX,
      infoY,
      { width: 300 }
    );

  infoY += 30;
  doc.fontSize(11).font("Helvetica");

  // Campos específicos para BASE
  doc.text(`RFC: ${data.RFC || "N/A"}`, infoX, infoY);
  infoY += 20;
  doc.text(`No. Empleado: ${data.NUM_EMPLEADO || "N/A"}`, infoX, infoY);
  infoY += 20;
  doc.text(`CURP: ${data.CURP || "N/A"}`, infoX, infoY);
  infoY += 20;
  doc.text(`Puesto: ${data.PUESTO || "N/A"}`, infoX, infoY);
  infoY += 20;
  doc.text(`Departamento: ${data.DEPARTAMENTO || "N/A"}`, infoX, infoY);
  infoY += 20;
  doc.text(
    `Fecha Ingreso: ${
      data.FECHA_INGRESO
        ? moment(data.FECHA_INGRESO).format("DD/MM/YYYY")
        : "N/A"
    }`,
    infoX,
    infoY
  );

  // CÓDIGO DE BARRAS / QR (placeholder)
  const qrY = credY + credHeight - 80;
  doc.rect(credX + 20, qrY, 100, 60).stroke();
  doc.fontSize(8).text("CÓDIGO QR", credX + 40, qrY + 25);

  // PIE DE PÁGINA
  doc
    .fontSize(8)
    .fillColor("#666666")
    .text(
      "Esta credencial es propiedad de la empresa",
      credX,
      credY + credHeight + 20,
      {
        width: credWidth,
        align: "center",
      }
    );
}

/**
 * Renderiza credencial tipo CONTRATO
 * @param {PDFDocument} doc - Documento PDF
 * @param {Object} data - Datos del empleado
 */
function renderCredentialCONTRATO(doc, data) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  // TÍTULO DEL TIPO DE CREDENCIAL
  doc
    .fontSize(10)
    .fillColor("#cc6600")
    .text("CREDENCIAL - CONTRATO", 50, 30, { align: "left" });

  // ENCABEZADO
  doc
    .fontSize(16)
    .fillColor("#000000")
    .text("CREDENCIAL DE IDENTIFICACIÓN", 0, 60, { align: "center" });

  doc
    .fontSize(12)
    .fillColor("#cc6600")
    .text("PERSONAL POR CONTRATO", 0, 85, { align: "center" });

  // BORDE DE LA CREDENCIAL (color diferente)
  const credX = 50;
  const credY = 110;
  const credWidth = pageWidth - 100;
  const credHeight = 350;

  doc.strokeColor("#cc6600").rect(credX, credY, credWidth, credHeight).stroke();
  doc.strokeColor("#000000"); // Restaurar color

  // FOTO (placeholder)
  const fotoX = credX + 20;
  const fotoY = credY + 20;
  doc.rect(fotoX, fotoY, 120, 150).stroke();
  doc.fontSize(10).text("FOTO", fotoX + 40, fotoY + 70);

  // INFORMACIÓN DEL EMPLEADO
  const infoX = fotoX + 140;
  let infoY = credY + 20;

  doc
    .fontSize(14)
    .fillColor("#000000")
    .font("Helvetica-Bold")
    .text(
      `${data.NOMBRES || ""} ${data.APE_PAT || ""} ${data.APE_MAT || ""}`,
      infoX,
      infoY,
      { width: 300 }
    );

  infoY += 30;
  doc.fontSize(11).font("Helvetica");

  // Campos específicos para CONTRATO
  doc.text(`RFC: ${data.RFC || "N/A"}`, infoX, infoY);
  infoY += 20;
  doc.text(
    `No. Contrato: ${data.NUM_CONTRATO || data.NUM_EMPLEADO || "N/A"}`,
    infoX,
    infoY
  );
  infoY += 20;
  doc.text(`Puesto: ${data.PUESTO || "N/A"}`, infoX, infoY);
  infoY += 20;
  doc.text(`Área: ${data.AREA || data.DEPARTAMENTO || "N/A"}`, infoX, infoY);
  infoY += 20;
  doc.text(
    `Vigencia: ${
      data.FECHA_INICIO ? moment(data.FECHA_INICIO).format("DD/MM/YYYY") : "N/A"
    } - ${
      data.FECHA_FIN ? moment(data.FECHA_FIN).format("DD/MM/YYYY") : "N/A"
    }`,
    infoX,
    infoY,
    { width: 300 }
  );

  // SELLO DE TEMPORAL
  doc
    .fontSize(20)
    .fillColor("#cc6600")
    .opacity(0.3)
    .text("TEMPORAL", credX + credWidth / 2 - 60, credY + credHeight / 2 - 20, {
      rotate: -30,
    });
  doc.opacity(1); // Restaurar opacidad

  // CÓDIGO DE BARRAS / QR (placeholder)
  const qrY = credY + credHeight - 80;
  doc.rect(credX + 20, qrY, 100, 60).stroke();
  doc
    .fontSize(8)
    .fillColor("#000000")
    .text("CÓDIGO QR", credX + 40, qrY + 25);

  // PIE DE PÁGINA
  doc
    .fontSize(8)
    .fillColor("#666666")
    .text(
      "Personal por contrato - Vigencia limitada",
      credX,
      credY + credHeight + 20,
      {
        width: credWidth,
        align: "center",
      }
    );
}

/**
 * Renderiza credencial tipo HONORARIOS
 * @param {PDFDocument} doc - Documento PDF
 * @param {Object} data - Datos del empleado
 */
function renderCredentialHONORARIOS(doc, data) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  // TÍTULO DEL TIPO DE CREDENCIAL
  doc
    .fontSize(10)
    .fillColor("#009900")
    .text("CREDENCIAL - HONORARIOS", 50, 30, { align: "left" });

  // ENCABEZADO
  doc
    .fontSize(16)
    .fillColor("#000000")
    .text("CREDENCIAL DE IDENTIFICACIÓN", 0, 60, { align: "center" });

  doc
    .fontSize(12)
    .fillColor("#009900")
    .text("PRESTADOR DE SERVICIOS PROFESIONALES", 0, 85, { align: "center" });

  // BORDE DE LA CREDENCIAL (color diferente)
  const credX = 50;
  const credY = 110;
  const credWidth = pageWidth - 100;
  const credHeight = 350;

  doc.strokeColor("#009900").rect(credX, credY, credWidth, credHeight).stroke();
  doc.strokeColor("#000000"); // Restaurar color

  // FOTO (placeholder)
  const fotoX = credX + 20;
  const fotoY = credY + 20;
  doc.rect(fotoX, fotoY, 120, 150).stroke();
  doc.fontSize(10).text("FOTO", fotoX + 40, fotoY + 70);

  // INFORMACIÓN DEL EMPLEADO
  const infoX = fotoX + 140;
  let infoY = credY + 20;

  doc
    .fontSize(14)
    .fillColor("#000000")
    .font("Helvetica-Bold")
    .text(
      `${data.NOMBRES || ""} ${data.APE_PAT || ""} ${data.APE_MAT || ""}`,
      infoX,
      infoY,
      { width: 300 }
    );

  infoY += 30;
  doc.fontSize(11).font("Helvetica");

  // Campos específicos para HONORARIOS
  doc.text(`RFC: ${data.RFC || "N/A"}`, infoX, infoY);
  infoY += 20;
  doc.text(
    `No. Prestador: ${data.NUM_PRESTADOR || data.NUM_EMPLEADO || "N/A"}`,
    infoX,
    infoY
  );
  infoY += 20;
  doc.text(`Servicio: ${data.SERVICIO || data.PUESTO || "N/A"}`, infoX, infoY, {
    width: 300,
  });
  infoY += 20;
  doc.text(`Área: ${data.AREA || data.DEPARTAMENTO || "N/A"}`, infoX, infoY);
  infoY += 20;
  doc.text(
    `Vigencia: ${
      data.FECHA_INICIO ? moment(data.FECHA_INICIO).format("DD/MM/YYYY") : "N/A"
    } - ${
      data.FECHA_FIN ? moment(data.FECHA_FIN).format("DD/MM/YYYY") : "N/A"
    }`,
    infoX,
    infoY,
    { width: 300 }
  );

  // SELLO DE HONORARIOS
  doc
    .fontSize(16)
    .fillColor("#009900")
    .opacity(0.3)
    .text(
      "HONORARIOS",
      credX + credWidth / 2 - 60,
      credY + credHeight / 2 - 20,
      {
        rotate: -30,
      }
    );
  doc.opacity(1); // Restaurar opacidad

  // CÓDIGO DE BARRAS / QR (placeholder)
  const qrY = credY + credHeight - 80;
  doc.rect(credX + 20, qrY, 100, 60).stroke();
  doc
    .fontSize(8)
    .fillColor("#000000")
    .text("CÓDIGO QR", credX + 40, qrY + 25);

  // PIE DE PÁGINA
  doc
    .fontSize(8)
    .fillColor("#666666")
    .text(
      "Prestador de servicios profesionales - Sin relación laboral",
      credX,
      credY + credHeight + 20,
      {
        width: credWidth,
        align: "center",
      }
    );
}

module.exports = gafetesController;
