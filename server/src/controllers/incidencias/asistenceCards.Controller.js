const router = require("express").Router();
const PDFDocument = require("pdfkit");
const asistenceCardsController = {};
const fs = require("fs");
const path = require("path");
const { querysql } = require("../../config/mysql");
const { query } = require("../../config/mongo");

// asistenceCardsController.printAsistenceCards = async (req, res) => {
//   const docWidth = 8.1 * 28.35; // Convert cm to points (1 cm = 28.35 points)
//   const docHeight = 18.3 * 28.35;

//   try {
//     const doc = new PDFDocument({ size: [docWidth, docHeight] });
//     doc.fontSize(9); // Match font size with singleAsistenceCard
//     const plantilla = await query("PLANTILLA", {});

//     if (!plantilla || plantilla.length === 0) {
//       return res.status(404).json({
//         message:
//           "No se encontraron datos para generar las tarjetas de asistencia.",
//       });
//     }

//     plantilla.forEach((record, index) => {
//       if (index > 0) doc.addPage(); // Add a new page for each record except the first

//       doc.fontSize(18).font("Helvetica-Bold"); // Match font style and size for NUMTARJETA
//       doc.text(record.NUMTARJETA, (7 - 0.2) * 28.35, (1.8 - 1 - 0.2) * 28.35);
//       doc.fontSize(8.5).font("Helvetica"); // Reset font size and style for other text

//       let adscripcion = record.ADSCRIPCION;
//       if (adscripcion.startsWith("SUBSECRETARÍA")) {
//         adscripcion = adscripcion.replace("SUBSECRETARÍA", "SUBSEC.");
//       } else if (adscripcion.startsWith("PROCURADURÍA")) {
//         adscripcion = adscripcion.replace("PROCURADURÍA", "PROCUR.");
//       } else if (adscripcion.startsWith("DIRECCIÓN")) {
//         adscripcion = adscripcion.replace("DIRECCIÓN", "DIR.");
//       } else if (adscripcion.startsWith("COORDINACIÓN")) {
//         adscripcion = adscripcion.replace("COORDINACIÓN", "COORD.");
//       } else if (adscripcion.startsWith("DEPARTAMENTO")) {
//         adscripcion = adscripcion.replace("DEPARTAMENTO", "DEPTO.");
//       }

//       doc.text(adscripcion, 0, (2.5 - 1) * 28.35, {
//         width: docWidth,
//         align: "center",
//       });

//       const fullName = `${record.APE_PAT} ${record.APE_MAT} ${record.NOMBRES}`;
//       doc.text(fullName, 0, (3.2 - 1) * 28.35, {
//         width: docWidth,
//         align: "center",
//       });

//       let tipoNom = "";
//       if (["M51", "F51"].includes(record.TIPONOM)) {
//         tipoNom = "PB";
//       } else if (["FCO", "511"].includes(record.TIPONOM)) {
//         tipoNom = "NC";
//       } else if (["FCT", "CCT", "F53", "M53"].includes(record.TIPONOM)) {
//         tipoNom = "CC";
//       }
//       doc.text(tipoNom, 0, (4 - 1) * 28.35, {
//         width: docWidth,
//         align: "center",
//       });

//       doc.text(record.TURNOMAT, 0, 3.8 * 28.35, {
//         width: docWidth,
//         align: "center",
//       });

//       const currentDate = new Date();
//       const year = currentDate.getFullYear();
//       const month = currentDate.getMonth();
//       const day = currentDate.getDate();
//       const isLeapYear =
//         (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
//       const daysInMonth = [
//         31,
//         isLeapYear ? 29 : 28,
//         31,
//         30,
//         31,
//         30,
//         31,
//         31,
//         30,
//         31,
//         30,
//         31,
//       ];
//       const quincena =
//         day <= 15
//           ? `01 AL 15 DE ${currentDate
//               .toLocaleString("es-ES", { month: "long" })
//               .toUpperCase()}`
//           : `16 AL ${daysInMonth[month]} DE ${currentDate
//               .toLocaleString("es-ES", { month: "long" })
//               .toUpperCase()}`;
//       doc.text(quincena, 0, (5.6 - 1) * 28.35, {
//         width: docWidth,
//         align: "center",
//       });
//     });

//     const filePath = path.join(__dirname, "asistenceCards.pdf");
//     const stream = fs.createWriteStream(filePath);

//     doc.pipe(stream);
//     doc.end();

//     stream.on("error", (err) => {
//       console.error("Error al escribir el archivo:", err.message);
//       res.status(500).json({ message: "Error al generar el reporte." });
//     });

//     stream.on("finish", () => {
//       res.setHeader("Content-Type", "application/pdf");
//       res.setHeader(
//         "Content-Disposition",
//         `attachment; filename=asistenceCards.pdf`
//       );
//       const currentDate = new Date();
//       const year = currentDate.getFullYear();
//       const month = currentDate
//         .toLocaleString("es-ES", { month: "long" })
//         .toUpperCase();
//       const day = currentDate.getDate();
//       const quincena = day <= 15 ? "PRIMERA_QUINCENA" : "SEGUNDA_QUINCENA";
//       const fileName = `TARJETAS_${quincena}_${month}.pdf`;

//       res.download(filePath, fileName, (err) => {
//         if (err) {
//           console.error("Error al descargar el archivo:", err.message);
//           res.status(500).json({ message: "Error al descargar el archivo." });
//         } else {
//           fs.unlink(filePath, (unlinkErr) => {
//             if (unlinkErr) {
//               console.error("Error al eliminar el archivo:", unlinkErr.message);
//             }
//           });
//         }
//       });
//     });
//   } catch (error) {
//     res.status(500).json({
//       message: "Error al generar las tarjetas de asistencia.",
//       details: error.message,
//     });
//   }
// };
asistenceCardsController.printAsistenceCards = async (req, res) => {
  const docWidth = 8.1 * 28.35; // Convert cm to points (1 cm = 28.35 points)
  const docHeight = 18.3 * 28.35;
  const { area_resp } = req.query || req.params;
  try {
    const { QUINCENA, TARJETAS } = req.body;

    if (
      !QUINCENA ||
      !TARJETAS ||
      !Array.isArray(TARJETAS) ||
      TARJETAS.length === 0
    ) {
      return res.status(400).json({
        message:
          "Los parámetros QUINCENA y TARJETAS son obligatorios y TARJETAS debe ser un array.",
      });
    }

    const queryFilter = {
      NUMTARJETA: { $in: TARJETAS.map((num) => parseInt(num, 10)) },
      AREA_RESP: area_resp ? { $eq: area_resp } : undefined,
    };

    const tarjetas = await query("PLANTILLA", queryFilter);

    if (!tarjetas || tarjetas.length === 0) {
      return res.status(404).json({
        message:
          "No se encontraron registros para las tarjetas proporcionadas.",
      });
    }

    const doc = new PDFDocument({ size: [docWidth, docHeight] });
    doc.fontSize(9);

    tarjetas.forEach((record, index) => {
      if (index > 0) doc.addPage();

      doc.fontSize(18).font("Helvetica-Bold");
      doc.text(record.NUMTARJETA, (7 - 0.2) * 28.35, (1.8 - 1 - 0.2) * 28.35);
      doc.fontSize(8.5).font("Helvetica");

      let adscripcion = record.ADSCRIPCION;
      if (adscripcion.startsWith("SUBSECRETARÍA")) {
        adscripcion = adscripcion.replace("SUBSECRETARÍA", "SUBSEC.");
      } else if (adscripcion.startsWith("PROCURADURÍA")) {
        adscripcion = adscripcion.replace("PROCURADURÍA", "PROCUR.");
      } else if (adscripcion.startsWith("DIRECCIÓN")) {
        adscripcion = adscripcion.replace("DIRECCIÓN", "DIR.");
      } else if (adscripcion.startsWith("COORDINACIÓN")) {
        adscripcion = adscripcion.replace("COORDINACIÓN", "COORD.");
      } else if (adscripcion.startsWith("DEPARTAMENTO")) {
        adscripcion = adscripcion.replace("DEPARTAMENTO", "DEPTO.");
      }

      doc.text(adscripcion, 0, (2.5 - 1) * 28.35, {
        width: docWidth,
        align: "center",
      });

      const fullName = `${record.APE_PAT} ${record.APE_MAT} ${record.NOMBRES}`;
      doc.text(fullName, 0, (3.2 - 1) * 28.35, {
        width: docWidth,
        align: "center",
      });

      let tipoNom = "";
      if (["M51", "F51"].includes(record.TIPONOM)) {
        tipoNom = "PB";
      } else if (["FCO", "511"].includes(record.TIPONOM)) {
        tipoNom = "NC";
      } else if (["FCT", "CCT", "F53", "M53"].includes(record.TIPONOM)) {
        tipoNom = "CC";
      }
      doc.text(tipoNom, 0, (4 - 1) * 28.35, {
        width: docWidth,
        align: "center",
      });

      doc.text(record.TURNOMAT, 0, 3.8 * 28.35, {
        width: docWidth,
        align: "center",
      });

      doc.text(QUINCENA, 0, (5.6 - 1) * 28.35, {
        width: docWidth,
        align: "center",
      });
    });

    const filePath = path.join(__dirname, "requestedAsistenceCards.pdf");
    const stream = fs.createWriteStream(filePath);

    doc.pipe(stream);
    doc.end();

    stream.on("error", (err) => {
      console.error("Error al escribir el archivo:", err.message);
      res.status(500).json({ message: "Error al generar el reporte." });
    });

    stream.on("finish", () => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=requestedAsistenceCards.pdf`
      );

      const fileName = `TARJETAS_SOLICITADAS.pdf`;

      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error("Error al descargar el archivo:", err.message);
          res.status(500).json({ message: "Error al descargar el archivo." });
        } else {
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
              console.error("Error al eliminar el archivo:", unlinkErr.message);
            }
          });
        }
      });
    });
  } catch (error) {
    res.status(500).json({
      message: "Error al generar las tarjetas de asistencia.",
      details: error.message,
    });
  }
};
module.exports = asistenceCardsController;
