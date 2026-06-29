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
    const [employeePlantilla = [], employeeForanea = [], employeeGafetes = []] =
      await Promise.all([
        query("PLANTILLA", { _id: new ObjectId(id) }),
        query("PLANTILLA_FORANEA", { _id: new ObjectId(id) }),
        query("GAFETES_TEMPO", { _id: new ObjectId(id) }),
      ]);

    const employee = employeePlantilla.length
      ? employeePlantilla
      : employeeForanea.length
        ? employeeForanea
        : employeeGafetes.length
          ? employeeGafetes
          : [];

    if (!employee || employee.length === 0) {
      res.status(404).send({ error: "No data found" });
      return;
    }

    const emp = employee[0];

    if (emp.DIRECCION) {
      emp.DIRECCION_COMPLETA = [
        `${emp.DIRECCION.DOMICILIO} ${emp.DIRECCION.NUM_EXT}`,
        emp.DIRECCION.COLONIA,
        emp.DIRECCION.LOCALIDAD,
        emp.DIRECCION.MUNICIPIO,
        emp.DIRECCION.ESTADO,
      ].filter(Boolean).join(', ') + '.',
        emp.CP = emp.DIRECCION.CP;
    } else {
      emp.DIRECCION_COMPLETA = emp.DOMICILIO;
    }

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
      action: `CONSULTÓ EL PERFIL DE GAFETES DEL EMPLEADO "${emp.NOMBRES} ${emp.APE_PAT} ${emp.APE_MAT}"`,
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
  const updateData = req.body.data;
  try {
    const id = updateData._id;
    console.log(updateData);

    delete updateData._id;
    // Buscar primero en PLANTILLA
    const employeePlantilla = await query("PLANTILLA", {
      _id: new ObjectId(id),
    });

    if (employeePlantilla.length > 0) {
      await updateOne(
        "PLANTILLA",
        { _id: new ObjectId(id) },
        { $set: updateData },
      );
      res.send({ message: "Employee updated successfully", _id: id });
    } else {
      // Buscar en PLANTILLA_FORANEA si no está en PLANTILLA
      const employeeForanea = await query("PLANTILLA_FORANEA", {
        _id: new ObjectId(id),
      });
      if (employeeForanea.length > 0) {
        await updateOne(
          "PLANTILLA_FORANEA",
          { _id: new ObjectId(id) },
          { $set: updateData },
        );
        res.send({ message: "Employee updated successfully", _id: id });
      } else {
        // Si no está en PLANTILLA ni en PLANTILLA_FORANEA, buscar en GAFETES_TEMPO
        const employeeGafetesTempo = await query("GAFETES_TEMPO", {
          _id: new ObjectId(id),
        });
        if (employeeGafetesTempo.length > 0) {
          await updateOne(
            "GAFETES_TEMPO",
            { _id: new ObjectId(id) },
            { $set: updateData },
          );
          res
            .status(200)
            .send({ message: "Employee updated successfully", _id: id });
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
    res111
      .status(500)
      .send({ error: "An error occurred while updating employee data" });
  }
};

gafetesController.printCredentialsEstructure = async (req, res) => {
  const { PDFDocument, rgb } = require("pdf-lib");
  const fontkit = require("@pdf-lib/fontkit");
  const fs = require("fs");
  const path = require("path");

  try {
    const { data } = req.body;

    // Validar que data existe
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return res.status(400).send({ error: "No se proporcionaron datos" });
    }

    // Convertir a array si es un solo objeto
    const employees = Array.isArray(data) ? data : [data];

    // Crear un nuevo documento PDF
    const pdfDoc = await PDFDocument.create();

    // Registrar fontkit para fuentes personalizadas
    pdfDoc.registerFontkit(fontkit);

    // Cargar fuentes personalizadas
    const fontBlackPath = path.join(
      __dirname,
      "../../assets/fonts",
      "Montserrat-Black.ttf",
    );
    const fontMediumPath = path.join(
      __dirname,
      "../../assets/fonts",
      "Montserrat-Medium.ttf",
    );

    const fontBlackBytes = fs.readFileSync(fontBlackPath);
    const fontMediumBytes = fs.readFileSync(fontMediumPath);

    const fontBlack = await pdfDoc.embedFont(fontBlackBytes);
    const fontMedium = await pdfDoc.embedFont(fontMediumBytes);

    // Función para convertir HEX a RGB
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? rgb(
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255,
        )
        : rgb(0, 0, 0);
    };

    // Función para dividir texto en líneas según ancho máximo
    const splitTextByWidth = (text, font, fontSize, maxWidthCm, cmToPixel) => {
      if (!text) return [];

      const maxWidth = maxWidthCm * cmToPixel;
      const words = text.split(" ");
      const lines = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      return lines;
    };

    for (let i = 0; i < employees.length; i += 2) {
      const employee1 = employees[i];
      const employee2 = employees[i + 1];

      const templatePath = employee2
        ? path.join(__dirname, "../../templates", "g_estructura.pdf")
        : path.join(__dirname, "../../templates", "g_estructura_single.pdf");

      if (!fs.existsSync(templatePath)) {
        return res.status(404).send({
          error: "Template PDF no encontrado",
          path: templatePath,
        });
      }

      if (employee2) {

        // Cargar el template para cada gafete
        const templateBytes = fs.readFileSync(templatePath);
        const templateDoc = await PDFDocument.load(templateBytes);

        const [templatePage] = await pdfDoc.copyPages(templateDoc, [0]);
        pdfDoc.addPage(templatePage);

        const pages = pdfDoc.getPages();
        const currentPage = pages[pages.length - 1];
        const { width, height } = currentPage.getSize();

        // Conversión correcta: 1 cm = 28.3465 puntos (1 inch = 72 points, 1 inch = 2.54 cm)
        const CM_TO_POINTS = 28.3465;

        // Bajar 1.7 cm - Subir 1.5 cm = Bajar 0.2 cm
        const offsetY = CM_TO_POINTS;
        // Mover a la derecha 1.5 cm + 0.2 cm = 1.7 cm
        const offsetX = CM_TO_POINTS;

        // Procesar ADSCRIPCION (primer renglón 5cm, segundo 6cm)
        const adscripcion1Lines = splitTextByWidth(
          employee1.ADSCRIPCION || "",
          fontBlack,
          8,
          5,
          CM_TO_POINTS,
        );

        const adscripcion2Lines = splitTextByWidth(
          employee2.ADSCRIPCION || "",
          fontBlack,
          8,
          5,
          CM_TO_POINTS,
        );

        // Procesar DOMICILIO (primer renglón 5cm, segundo 5cm)
        const domicilio1Lines = splitTextByWidth(
          employee1.DOMICILIO || "",
          fontBlack,
          8,
          5,
          CM_TO_POINTS,
        );

        const domicilio2Lines = splitTextByWidth(
          employee2.DOMICILIO || "",
          fontBlack,
          8,
          5,
          CM_TO_POINTS,
        );

        // Procesar APELLIDOS (APE_PAT + A|PE_MAT) con ancho de 6cm
        const apellidos1Text = `${employee1.APE_PAT || ""} ${employee1.APE_MAT || ""
          }`.trim();
        const apellidos1Lines = splitTextByWidth(
          apellidos1Text,
          fontMedium,
          12,
          6,
          CM_TO_POINTS,
        );

        const apellidos2Text = `${employee2.APE_PAT || ""} ${employee2.APE_MAT || ""
          }`.trim();
        const apellidos2Lines = splitTextByWidth(
          apellidos2Text,
          fontMedium,
          12,
          6,
          CM_TO_POINTS,
        );

        // Antes de armar los campos, truncar AVISAR a una sola línea (máximo 5cm)
        const avisarSingleLine =
          splitTextByWidth(
            employee1.AVISAR || "",
            fontBlack,
            8,
            5,
            CM_TO_POINTS,
          )[0] || "";

        const avisar2SingleLine =
          splitTextByWidth(
            employee2.AVISAR || "",
            fontBlack,
            8,
            5,
            CM_TO_POINTS,
          )[0] || "";

        // Configuración de campos según las coordenadas proporcionadas
        const fieldsData = [
          {
            text: employee1.NUP || "",
            x: 5 * CM_TO_POINTS,
            y: height - 2.9 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.NUP || "",
            x: 5 * CM_TO_POINTS,
            y: height - 16.02 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.NUE || "",
            x: 8.5 * CM_TO_POINTS,
            y: height - 2.9 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.NUE || "",
            x: 8.5 * CM_TO_POINTS,
            y: height - 16.02 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.RFC || "",
            x: 5 * CM_TO_POINTS,
            y: height - 3.47 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.RFC || "",
            x: 5 * CM_TO_POINTS,
            y: height - 16.59 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.CURP || "",
            x: 5 * CM_TO_POINTS,
            y: height - 3.98 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.CURP || "",
            x: 5 * CM_TO_POINTS,
            y: height - 17.1 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.TEL_PERSONAL || "",
            x: 5.2 * CM_TO_POINTS,
            y: height - 7.2 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.TEL_PERSONAL || "",
            x: 5.2 * CM_TO_POINTS,
            y: height - 20.32 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: avisarSingleLine,
            x: 5.3 * CM_TO_POINTS,
            y: height - 8.98 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: avisar2SingleLine,
            x: 5.3 * CM_TO_POINTS,
            y: height - 22.1 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.TEL_EMERGENCIA1 || "",
            x: 5.83 * CM_TO_POINTS,
            y: height - 9.55 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.TEL_EMERGENCIA1 || "",
            x: 5.83 * CM_TO_POINTS,
            y: height - 22.67 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.AFILIACI || "",
            x: 5.3 * CM_TO_POINTS,
            y: height - 10.07 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.AFILIACI || "",
            x: 5.3 * CM_TO_POINTS,
            y: height - 23.19 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.SANGRE || "",
            x: 6.3 * CM_TO_POINTS,
            y: height - 10.55 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: hexToRgb("#9D2449"),
          },
          {
            text: employee2.SANGRE || "",
            x: 6.3 * CM_TO_POINTS,
            y: height - 23.67 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: hexToRgb("#9D2449"),
          },
          {
            text: employee1.ALERGIAS || "",
            x: 5.3 * CM_TO_POINTS,
            y: height - 10.995 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.ALERGIAS || "",
            x: 5.3 * CM_TO_POINTS,
            y: height - 24.115 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
        ];

        // Insertar los datos en el PDF
        fieldsData.forEach((field) => {
          if (field.text) {
            currentPage.drawText(String(field.text), {
              x: field.x,
              y: field.y,
              size: field.size,
              font: field.font,
              color: field.color,
            });
          }
        });

        // Función para centrar texto en un rango
        const centerText = (text, font, fontSize, startX, endX) => {
          const textWidth = font.widthOfTextAtSize(text, fontSize);
          const availableWidth = endX - startX;
          const centeredX = startX + (availableWidth - textWidth) / 2;
          return centeredX;
        };

        const startX = 9.6 * CM_TO_POINTS + offsetX + 0.25 * CM_TO_POINTS;
        const endX = 17.8 * CM_TO_POINTS + offsetX + 0.25 * CM_TO_POINTS;

        if (employee1.NOMBRES) {
          const nombresX = centerText(
            employee1.NOMBRES,
            fontBlack,
            12,
            startX,
            endX,
          );
          currentPage.drawText(employee1.NOMBRES, {
            x: nombresX,
            y: height - 7.65 * CM_TO_POINTS,
            size: 12,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });
        }

        if (employee2.NOMBRES) {
          const nombresX = centerText(
            employee2.NOMBRES,
            fontBlack,
            12,
            startX,
            endX,
          );
          currentPage.drawText(employee2.NOMBRES, {
            x: nombresX,
            y: height - 20.77 * CM_TO_POINTS,
            size: 12,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar APELLIDOS (APE_PAT + APE_MAT) centrado
        if (apellidos1Lines.length > 0) {
          const apellidosX = centerText(
            apellidos1Lines[0],
            fontMedium,
            12,
            startX,
            endX,
          );
          const apellidosY = height - 8.15 * CM_TO_POINTS;

          currentPage.drawText(apellidos1Lines[0], {
            x: apellidosX,
            y: apellidosY,
            size: 12,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        if (apellidos2Lines.length > 0) {
          const apellidosX = centerText(
            apellidos2Lines[0],
            fontMedium,
            12,
            startX,
            endX,
          );
          const apellidosY = height - 21.27 * CM_TO_POINTS;

          currentPage.drawText(apellidos2Lines[0], {
            x: apellidosX,
            y: apellidosY,
            size: 12,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar NOMCATE centrado
        if (employee1.NOMCATE) {
          const nomcateX = centerText(
            employee1.NOMCATE,
            fontMedium,
            10,
            startX,
            endX,
          );
          currentPage.drawText(employee1.NOMCATE, {
            x: nomcateX,
            y: height - 8.65 * CM_TO_POINTS,
            size: 10,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        if (employee2.NOMCATE) {
          const nomcateX = centerText(
            employee2.NOMCATE,
            fontMedium,
            10,
            startX,
            endX,
          );
          currentPage.drawText(employee2.NOMCATE, {
            x: nomcateX,
            y: height - 21.77 * CM_TO_POINTS,
            size: 10,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar ADSCRIPCION con múltiples líneas
        if (adscripcion1Lines.length > 0) {
          // Primera línea (máximo 5cm)
          const pixelX1 = 5.9 * CM_TO_POINTS;
          const pixelY1 = height - 4.48 * CM_TO_POINTS;

          currentPage.drawText(adscripcion1Lines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Espacio vertical entre líneas de adscripción (usar 0.30 cm)
          const LINE_SPACING_ADS = 0.3 * CM_TO_POINTS;

          // Segunda línea si existe (máximo 5cm), alineada con la primera
          if (adscripcion1Lines.length > 1) {
            const remainingText = adscripcion1Lines.slice(1).join(" ");
            const secondLineParts = splitTextByWidth(
              remainingText,
              fontBlack,
              8,
              5, // ancho 5cm para la segunda línea
              CM_TO_POINTS,
            );

            if (secondLineParts.length > 0) {
              // Alinear X con la primera línea
              const pixelX2 = pixelX1;
              const pixelY2 = pixelY1 - LINE_SPACING_ADS;

              currentPage.drawText(secondLineParts[0], {
                x: pixelX2,
                y: pixelY2,
                size: 8,
                font: fontBlack,
                color: rgb(0, 0, 0),
              });

              // Si hay más texto, crear una tercera línea con el resto
              const remainingAfterSecond =
                secondLineParts.length > 1
                  ? secondLineParts.slice(1).join(" ")
                  : adscripcion1Lines.slice(2).join(" ");

              if (
                remainingAfterSecond &&
                remainingAfterSecond.trim().length > 0
              ) {
                const thirdLineParts = splitTextByWidth(
                  remainingAfterSecond,
                  fontBlack,
                  8,
                  5, // ancho 5cm para la tercera línea
                  CM_TO_POINTS,
                );
                if (thirdLineParts.length > 0) {
                  const pixelY3 = pixelY2 - LINE_SPACING_ADS;
                  currentPage.drawText(thirdLineParts[0], {
                    x: pixelX1,
                    y: pixelY3,
                    size: 8,
                    font: fontBlack,
                    color: rgb(0, 0, 0),
                  });
                }
              }
            }
          }
        }

        if (adscripcion2Lines.length > 0) {
          const pixelX1 = 5.9 * CM_TO_POINTS;
          const pixelY1 = height - 17.6 * CM_TO_POINTS;

          currentPage.drawText(adscripcion2Lines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Espacio vertical entre líneas de adscripción (usar 0.30 cm)
          const LINE_SPACING_ADS = 0.3 * CM_TO_POINTS;

          // Segunda línea si existe (máximo 5cm), alineada con la primera
          if (adscripcion2Lines.length > 1) {
            const remainingText = adscripcion2Lines.slice(1).join(" ");
            const secondLineParts = splitTextByWidth(
              remainingText,
              fontBlack,
              8,
              5, // ancho 5cm para la segunda línea
              CM_TO_POINTS,
            );

            if (secondLineParts.length > 0) {
              // Alinear X con la primera línea
              const pixelX2 = pixelX1;
              const pixelY2 = pixelY1 - LINE_SPACING_ADS;

              currentPage.drawText(secondLineParts[0], {
                x: pixelX2,
                y: pixelY2,
                size: 8,
                font: fontBlack,
                color: rgb(0, 0, 0),
              });

              // Si hay más texto, crear una tercera línea con el resto
              const remainingAfterSecond =
                secondLineParts.length > 1
                  ? secondLineParts.slice(1).join(" ")
                  : adscripcion2Lines.slice(2).join(" ");

              if (
                remainingAfterSecond &&
                remainingAfterSecond.trim().length > 0
              ) {
                const thirdLineParts = splitTextByWidth(
                  remainingAfterSecond,
                  fontBlack,
                  8,
                  5, // ancho 5cm para la tercera línea
                  CM_TO_POINTS,
                );
                if (thirdLineParts.length > 0) {
                  const pixelY3 = pixelY2 - LINE_SPACING_ADS;
                  currentPage.drawText(thirdLineParts[0], {
                    x: pixelX1,
                    y: pixelY3,
                    size: 8,
                    font: fontBlack,
                    color: rgb(0, 0, 0),
                  });
                }
              }
            }
          }
        }

        // Insertar DOMICILIO con múltiples líneas
        if (domicilio1Lines.length > 0) {
          // Primera línea (máximo 5cm) -> subir 0.3 cm
          const pixelX1 = 5.6 * CM_TO_POINTS;
          const pixelY1 = height - 6.25 * CM_TO_POINTS;

          // Espacio vertical entre líneas reducido (0.25 cm)
          const LINE_SPACING = 0.3 * CM_TO_POINTS;

          // Dibujar primera línea
          currentPage.drawText(domicilio1Lines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Segunda línea (si existe)
          if (domicilio1Lines.length > 1) {
            const secondText = domicilio1Lines[1];
            const pixelY2 = pixelY1 - LINE_SPACING;

            currentPage.drawText(secondText, {
              x: pixelX1, // misma alineación que la primera
              y: pixelY2,
              size: 8,
              font: fontBlack,
              color: rgb(0, 0, 0),
            });

            // Si hay más de dos líneas, crear una tercera con el resto del texto
            if (domicilio1Lines.length > 2) {
              const remainingText = domicilio1Lines.slice(2).join(" ");
              // Asegurarse que la tercera línea quepa en 5cm (tomar solo la primera línea resultante)
              const thirdLineParts = splitTextByWidth(
                remainingText,
                fontBlack,
                8,
                5, // ancho 5cm
                CM_TO_POINTS,
              );
              if (thirdLineParts.length > 0) {
                const pixelY3 = pixelY2 - LINE_SPACING;
                currentPage.drawText(thirdLineParts[0], {
                  x: pixelX1,
                  y: pixelY3,
                  size: 8,
                  font: fontBlack,
                  color: rgb(0, 0, 0),
                });
              }
            }
          }
        }

        if (domicilio2Lines.length > 0) {
          // Primera línea (máximo 5cm) -> subir 0.3 cm
          const pixelX1 = 5.6 * CM_TO_POINTS;
          const pixelY1 = height - 19.37 * CM_TO_POINTS;

          // Espacio vertical entre líneas reducido (0.25 cm)
          const LINE_SPACING = 0.3 * CM_TO_POINTS;

          // Dibujar primera línea
          currentPage.drawText(domicilio2Lines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Segunda línea (si existe)
          if (domicilio2Lines.length > 1) {
            const secondText = domicilio2Lines[1];
            const pixelY2 = pixelY1 - LINE_SPACING;

            currentPage.drawText(secondText, {
              x: pixelX1, // misma alineación que la primera
              y: pixelY2,
              size: 8,
              font: fontBlack,
              color: rgb(0, 0, 0),
            });

            // Si hay más de dos líneas, crear una tercera con el resto del texto
            if (domicilio2Lines.length > 2) {
              const remainingText = domicilio2Lines.slice(2).join(" ");
              // Asegurarse que la tercera línea quepa en 5cm (tomar solo la primera línea resultante)
              const thirdLineParts = splitTextByWidth(
                remainingText,
                fontBlack,
                8,
                5, // ancho 5cm
                CM_TO_POINTS,
              );
              if (thirdLineParts.length > 0) {
                const pixelY3 = pixelY2 - LINE_SPACING;
                currentPage.drawText(thirdLineParts[0], {
                  x: pixelX1,
                  y: pixelY3,
                  size: 8,
                  font: fontBlack,
                  color: rgb(0, 0, 0),
                });
              }
            }
          }
        }


      } else {

        const employee = employee1;

        // Cargar el template para cada gafete
        const templateBytes = fs.readFileSync(templatePath);
        const templateDoc = await PDFDocument.load(templateBytes);

        const [templatePage] = await pdfDoc.copyPages(templateDoc, [0]);
        pdfDoc.addPage(templatePage);

        const pages = pdfDoc.getPages();
        const currentPage = pages[pages.length - 1];
        const { width, height } = currentPage.getSize();

        // Conversión correcta: 1 cm = 28.3465 puntos (1 inch = 72 points, 1 inch = 2.54 cm)
        const CM_TO_POINTS = 28.3465;

        // Bajar 1.7 cm - Subir 1.5 cm = Bajar 0.2 cm
        const offsetY = (1.7 - 1.5) * CM_TO_POINTS;
        // Mover a la derecha 1.5 cm + 0.2 cm = 1.7 cm
        const offsetX = (1.5 + 0.2) * CM_TO_POINTS;

        // Procesar ADSCRIPCION (primer renglón 5cm, segundo 6cm)
        const adscripcionLines = splitTextByWidth(
          employee.ADSCRIPCION || "",
          fontBlack,
          8,
          5, // <- ancho cambiado a 5cm
          CM_TO_POINTS,
        );

        // Procesar DOMICILIO (primer renglón 5cm, segundo 5cm)
        const domicilioLines = splitTextByWidth(
          employee.DOMICILIO || "",
          fontBlack,
          8,
          5, // <- ancho cambiado a 5cm
          CM_TO_POINTS,
        );

        // Procesar APELLIDOS (APE_PAT + A|PE_MAT) con ancho de 6cm
        const apellidosText = `${employee.APE_PAT || ""} ${employee.APE_MAT || ""
          }`.trim();
        const apellidosLines = splitTextByWidth(
          apellidosText,
          fontMedium,
          12,
          6,
          CM_TO_POINTS,
        );

        // Antes de armar los campos, truncar AVISAR a una sola línea (máximo 5cm)
        const avisarSingleLine =
          splitTextByWidth(
            employee.AVISAR || "",
            fontBlack,
            8,
            5, // ancho máximo 5cm (igual que ADSCRIPCION/DOMICILIO)
            CM_TO_POINTS,
          )[0] || "";

        // Configuración de campos según las coordenadas proporcionadas
        const fieldsData = [
          {
            text: employee.NUP || "",
            x: 6.5 * CM_TO_POINTS + offsetX,
            y: height - 6.24 * CM_TO_POINTS - offsetY, // Bajar 0.1 cm (remover el +0.1)
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.NUE || "",
            x: 10 * CM_TO_POINTS + offsetX,
            y: height - 6.24 * CM_TO_POINTS - offsetY, // Bajar 0.1 cm (remover el +0.1)
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.RFC || "",
            x: 6.5 * CM_TO_POINTS + offsetX,
            y: height - 6.81 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.CURP || "",
            x: 6.5 * CM_TO_POINTS + offsetX,
            y: height - 7.3 * CM_TO_POINTS - offsetY, // Debajo de RFC
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.TEL_PERSONAL || "",
            x: 6.7 * CM_TO_POINTS + offsetX,
            y: height - 10.53 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: avisarSingleLine,
            x: 5.8 * CM_TO_POINTS + offsetX + 1 * CM_TO_POINTS, // 1 cm a la derecha
            y: height - 12.31 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.TEL_EMERGENCIA1 || "",
            x: 7 * CM_TO_POINTS + offsetX + 0.3 * CM_TO_POINTS, // 3mm a la derecha
            y: height - 12.9 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.AFILIACI || "",
            x: 5.75 * CM_TO_POINTS + offsetX + 1 * CM_TO_POINTS, // 1 cm a la derecha
            y: height - 13.39 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.SANGRE || "",
            x: 6.8 * CM_TO_POINTS + offsetX + 1 * CM_TO_POINTS, // 1 cm a la derecha
            y: height - 13.76 * CM_TO_POINTS - offsetY - 0.1 * CM_TO_POINTS, // 1mm abajo
            font: fontBlack,
            size: 8,
            color: hexToRgb("#9D2449"),
          },
          {
            text: employee.ALERGIAS || "",
            x: 5.85 * CM_TO_POINTS + offsetX + 1 * CM_TO_POINTS, // 1 cm a la derecha
            y: height - 14.35 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
        ];

        // Insertar los datos en el PDF
        fieldsData.forEach((field) => {
          if (field.text) {
            currentPage.drawText(String(field.text), {
              x: field.x,
              y: field.y,
              size: field.size,
              font: field.font,
              color: field.color,
            });
          }
        });

        // Función para centrar texto en un rango
        const centerText = (text, font, fontSize, startX, endX) => {
          const textWidth = font.widthOfTextAtSize(text, fontSize);
          const availableWidth = endX - startX;
          const centeredX = startX + (availableWidth - textWidth) / 2;
          return centeredX;
        };

        const startX = 12.2 * CM_TO_POINTS + offsetX + 0.25 * CM_TO_POINTS; // 0.25cm a la derecha
        const endX = 20.2 * CM_TO_POINTS + offsetX + 0.25 * CM_TO_POINTS; // 0.25cm a la derecha

        // Insertar NOMBRES centrado
        if (employee.NOMBRES) {
          const nombresX = centerText(
            employee.NOMBRES,
            fontBlack,
            12,
            startX,
            endX,
          );
          currentPage.drawText(employee.NOMBRES, {
            x: nombresX,
            y: height - 11 * CM_TO_POINTS - offsetY,
            size: 12,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar NOMCATE centrado
        if (employee.NOMCATE) {
          const nomcateX = centerText(
            employee.NOMCATE,
            fontMedium,
            10,
            startX,
            endX,
          );
          currentPage.drawText(employee.NOMCATE, {
            x: nomcateX,
            y: height - 12 * CM_TO_POINTS - offsetY,
            size: 10,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar ADSCRIPCION con múltiples líneas
        if (adscripcionLines.length > 0) {
          // Primera línea (máximo 5cm)
          const pixelX1 = 7.4 * CM_TO_POINTS + offsetX;
          const pixelY1 =
            height - 8 * CM_TO_POINTS - offsetY + 0.2 * CM_TO_POINTS; // Subir 0.2cm

          currentPage.drawText(adscripcionLines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Espacio vertical entre líneas de adscripción (usar 0.30 cm)
          const LINE_SPACING_ADS = 0.3 * CM_TO_POINTS;

          // Segunda línea si existe (máximo 5cm), alineada con la primera
          if (adscripcionLines.length > 1) {
            const remainingText = adscripcionLines.slice(1).join(" ");
            const secondLineParts = splitTextByWidth(
              remainingText,
              fontBlack,
              8,
              5, // ancho 5cm para la segunda línea
              CM_TO_POINTS,
            );

            if (secondLineParts.length > 0) {
              // Alinear X con la primera línea
              const pixelX2 = pixelX1;
              const pixelY2 = pixelY1 - LINE_SPACING_ADS;

              currentPage.drawText(secondLineParts[0], {
                x: pixelX2,
                y: pixelY2,
                size: 8,
                font: fontBlack,
                color: rgb(0, 0, 0),
              });

              // Si hay más texto, crear una tercera línea con el resto
              const remainingAfterSecond =
                secondLineParts.length > 1
                  ? secondLineParts.slice(1).join(" ")
                  : adscripcionLines.slice(2).join(" ");

              if (
                remainingAfterSecond &&
                remainingAfterSecond.trim().length > 0
              ) {
                const thirdLineParts = splitTextByWidth(
                  remainingAfterSecond,
                  fontBlack,
                  8,
                  5, // ancho 5cm para la tercera línea
                  CM_TO_POINTS,
                );
                if (thirdLineParts.length > 0) {
                  const pixelY3 = pixelY2 - LINE_SPACING_ADS;
                  currentPage.drawText(thirdLineParts[0], {
                    x: pixelX1,
                    y: pixelY3,
                    size: 8,
                    font: fontBlack,
                    color: rgb(0, 0, 0),
                  });
                }
              }
            }
          }
        }

        // Insertar DOMICILIO con múltiples líneas
        if (domicilioLines.length > 0) {
          // Primera línea (máximo 5cm) -> subir 0.3 cm
          const pixelX1 = 7.1 * CM_TO_POINTS + offsetX;
          const pixelY1 =
            height - 9.9 * CM_TO_POINTS - offsetY + 0.3 * CM_TO_POINTS;

          // Espacio vertical entre líneas reducido (0.25 cm)
          const LINE_SPACING = 0.3 * CM_TO_POINTS;

          // Dibujar primera línea
          currentPage.drawText(domicilioLines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Segunda línea (si existe)
          if (domicilioLines.length > 1) {
            const secondText = domicilioLines[1];
            const pixelY2 = pixelY1 - LINE_SPACING;

            currentPage.drawText(secondText, {
              x: pixelX1, // misma alineación que la primera
              y: pixelY2,
              size: 8,
              font: fontBlack,
              color: rgb(0, 0, 0),
            });

            // Si hay más de dos líneas, crear una tercera con el resto del texto
            if (domicilioLines.length > 2) {
              const remainingText = domicilioLines.slice(2).join(" ");
              // Asegurarse que la tercera línea quepa en 5cm (tomar solo la primera línea resultante)
              const thirdLineParts = splitTextByWidth(
                remainingText,
                fontBlack,
                8,
                5, // ancho 5cm
                CM_TO_POINTS,
              );
              if (thirdLineParts.length > 0) {
                const pixelY3 = pixelY2 - LINE_SPACING;
                currentPage.drawText(thirdLineParts[0], {
                  x: pixelX1,
                  y: pixelY3,
                  size: 8,
                  font: fontBlack,
                  color: rgb(0, 0, 0),
                });
              }
            }
          }
        }

        // Insertar APELLIDOS (APE_PAT + APE_MAT) centrado
        if (apellidosLines.length > 0) {
          const apellidosX = centerText(
            apellidosLines[0],
            fontMedium,
            12,
            startX,
            endX,
          );
          const apellidosY = height - 11.5 * CM_TO_POINTS - offsetY;

          currentPage.drawText(apellidosLines[0], {
            x: apellidosX,
            y: apellidosY,
            size: 12,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

      }

    }

    // Guardar el PDF modificado
    const pdfBytes = await pdfDoc.save();

    // Enviar el PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=credenciales_${Date.now()}.pdf`,
    );
    res.send(Buffer.from(pdfBytes));

    // Registrar la acción
    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const userAction = {
      timestamp: currentDateTime,
      username: req.user?.username || "System",
      module: "GAFETES",
      action: `GENERÓ ${employees.length} CREDENCIAL(ES)`,
    };
    await insertOne("USER_ACTIONS", userAction);
  } catch (error) {
    console.error("Error generating credentials:", error);
    res.status(500).send({
      error: "Error generando las credenciales",
      details: error.message,
    });
  }
};
gafetesController.printCredentialsHonorarios = async (req, res) => {
  const { PDFDocument, rgb } = require("pdf-lib");
  const fontkit = require("@pdf-lib/fontkit");
  const fs = require("fs");
  const path = require("path");

  try {
    const { data } = req.body;

    // Validar que data existe
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return res.status(400).send({ error: "No se proporcionaron datos" });
    }

    // Convertir a array si es un solo objeto
    const employees = Array.isArray(data) ? data : [data];

    // Crear un nuevo documento PDF
    const pdfDoc = await PDFDocument.create();

    // Registrar fontkit para fuentes personalizadas
    pdfDoc.registerFontkit(fontkit);

    // Cargar fuentes personalizadas
    const fontBlackPath = path.join(
      __dirname,
      "../../assets/fonts",
      "Montserrat-Black.ttf",
    );
    const fontMediumPath = path.join(
      __dirname,
      "../../assets/fonts",
      "Montserrat-Medium.ttf",
    );

    const fontBlackBytes = fs.readFileSync(fontBlackPath);
    const fontMediumBytes = fs.readFileSync(fontMediumPath);

    const fontBlack = await pdfDoc.embedFont(fontBlackBytes);
    const fontMedium = await pdfDoc.embedFont(fontMediumBytes);

    // Función para convertir HEX a RGB
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? rgb(
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255,
        )
        : rgb(0, 0, 0);
    };

    // Función para dividir texto en líneas según ancho máximo
    const splitTextByWidth = (text, font, fontSize, maxWidthCm, cmToPixel) => {
      if (!text) return [];

      const maxWidth = maxWidthCm * cmToPixel;
      const words = text.split(" ");
      const lines = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      return lines;
    };

    for (let i = 0; i < employees.length; i += 2) {
      const employee1 = employees[i];
      const employee2 = employees[i + 1];

      const templatePath = employee2
        ? path.join(__dirname, "../../templates", "g_honorarios.pdf")
        : path.join(__dirname, "../../templates", "g_honorarios_single.pdf");

      if (!fs.existsSync(templatePath)) {
        return res.status(404).send({
          error: "Template PDF no encontrado",
          path: templatePath,
        });
      }

      if (employee2) {
        // Cargar el template para cada gafete
        const templateBytes = fs.readFileSync(templatePath);
        const templateDoc = await PDFDocument.load(templateBytes);

        const [templatePage] = await pdfDoc.copyPages(templateDoc, [0]);
        pdfDoc.addPage(templatePage);

        const pages = pdfDoc.getPages();
        const currentPage = pages[pages.length - 1];
        const { width, height } = currentPage.getSize();

        // Conversión correcta: 1 cm = 28.3465 puntos (1 inch = 72 points, 1 inch = 2.54 cm)
        const CM_TO_POINTS = 28.3465;


        // Bajar 1.7 cm - Subir 1.5 cm = Bajar 0.2 cm
        const offsetY = CM_TO_POINTS;
        // Mover a la derecha 1.5 cm + 0.2 cm = 1.7 cm
        const offsetX = CM_TO_POINTS;

        // Procesar ADSCRIPCION (primer renglón 5cm, segundo 6cm)
        const adscripcion1Lines = splitTextByWidth(
          employee1.ADSCRIPCION || "",
          fontBlack,
          8,
          5,
          CM_TO_POINTS,
        );

        const adscripcion2Lines = splitTextByWidth(
          employee2.ADSCRIPCION || "",
          fontBlack,
          8,
          5,
          CM_TO_POINTS,
        );

        // Procesar DOMICILIO (primer renglón 5cm, segundo 5cm)
        const domicilio1Lines = splitTextByWidth(
          employee1.DOMICILIO || "",
          fontBlack,
          8,
          5,
          CM_TO_POINTS,
        );

        const domicilio2Lines = splitTextByWidth(
          employee2.DOMICILIO || "",
          fontBlack,
          8,
          5,
          CM_TO_POINTS,
        );

        // Procesar APELLIDOS (APE_PAT + APE_MAT) con ancho de 6cm
        const apellidos1Text = `${employee1.APE_PAT || ""} ${employee1.APE_MAT || ""
          }`.trim();
        const apellidos1Lines = splitTextByWidth(
          apellidos1Text,
          fontMedium,
          12,
          6,
          CM_TO_POINTS,
        );

        const apellidos2Text = `${employee2.APE_PAT || ""} ${employee2.APE_MAT || ""
          }`.trim();
        const apellidos2Lines = splitTextByWidth(
          apellidos2Text,
          fontMedium,
          12,
          6,
          CM_TO_POINTS,
        );

        // Antes de armar los campos, truncar AVISAR a una sola línea (máximo 5cm)
        const avisarSingleLine =
          splitTextByWidth(
            employee1.AVISAR || "",
            fontBlack,
            8,
            5,
            CM_TO_POINTS,
          )[0] || "";

        const avisar2SingleLine =
          splitTextByWidth(
            employee2.AVISAR || "",
            fontBlack,
            8,
            5,
            CM_TO_POINTS,
          )[0] || "";

        // Configuración de campos según las coordenadas proporcionadas
        const fieldsData = [
          {
            text: employee1.RFC || "",
            x: 5 * CM_TO_POINTS,
            y: height - 3.17 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.RFC || "",
            x: 5 * CM_TO_POINTS,
            y: height - 16.29 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.CURP || "",
            x: 5.25 * CM_TO_POINTS,
            y: height - 3.83 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.CURP || "",
            x: 5.25 * CM_TO_POINTS,
            y: height - 16.95 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.TEL_PERSONAL || "",
            x: 5.2 * CM_TO_POINTS,
            y: height - 7.2 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.TEL_PERSONAL || "",
            x: 5.2 * CM_TO_POINTS,
            y: height - 20.32 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: avisarSingleLine,
            x: 5.3 * CM_TO_POINTS,
            y: height - 9.17 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: avisar2SingleLine,
            x: 5.3 * CM_TO_POINTS,
            y: height - 22.29 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.TEL_EMERGENCIA1 || "",
            x: 6 * CM_TO_POINTS,
            y: height - 9.68 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.TEL_EMERGENCIA1 || "",
            x: 6 * CM_TO_POINTS,
            y: height - 22.80 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.SANGRE || "",
            x: 6.3 * CM_TO_POINTS,
            y: height - 10.20 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: hexToRgb("#9D2449"),
          },
          {
            text: employee2.SANGRE || "",
            x: 6.3 * CM_TO_POINTS,
            y: height - 23.32 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: hexToRgb("#9D2449"),
          },
          {
            text: employee1.ALERGIAS || "",
            x: 5.3 * CM_TO_POINTS,
            y: height - 10.71 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.ALERGIAS || "",
            x: 5.3 * CM_TO_POINTS,
            y: height - 23.83 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
        ];

        // Insertar los datos en el PDF
        fieldsData.forEach((field) => {
          if (field.text) {
            currentPage.drawText(String(field.text), {
              x: field.x,
              y: field.y,
              size: field.size,
              font: field.font,
              color: field.color,
            });
          }
        });

        // Función para centrar texto en un rango
        const centerText = (text, font, fontSize, startX, endX) => {
          const textWidth = font.widthOfTextAtSize(text, fontSize);
          const availableWidth = endX - startX;
          const centeredX = startX + (availableWidth - textWidth) / 2;
          return centeredX;
        };

        const startX = 9.6 * CM_TO_POINTS + offsetX + 0.25 * CM_TO_POINTS;
        const endX = 17.8 * CM_TO_POINTS + offsetX + 0.25 * CM_TO_POINTS;

        if (employee1.NOMBRES) {
          const nombresX = centerText(
            employee1.NOMBRES,
            fontBlack,
            12,
            startX,
            endX,
          );
          currentPage.drawText(employee1.NOMBRES, {
            x: nombresX,
            y: height - 7.65 * CM_TO_POINTS,
            size: 12,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });
        }

        if (employee2.NOMBRES) {
          const nombresX = centerText(
            employee2.NOMBRES,
            fontBlack,
            12,
            startX,
            endX,
          );
          currentPage.drawText(employee2.NOMBRES, {
            x: nombresX,
            y: height - 20.77 * CM_TO_POINTS,
            size: 12,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });
        }

        if (apellidos1Lines.length > 0) {
          const apellidosX = centerText(
            apellidos1Lines[0],
            fontMedium,
            12,
            startX,
            endX,
          );
          const apellidosY = height - 8.15 * CM_TO_POINTS;

          currentPage.drawText(apellidos1Lines[0], {
            x: apellidosX,
            y: apellidosY,
            size: 12,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        if (apellidos2Lines.length > 0) {
          const apellidosX = centerText(
            apellidos2Lines[0],
            fontMedium,
            12,
            startX,
            endX,
          );
          const apellidosY = height - 21.27 * CM_TO_POINTS;

          currentPage.drawText(apellidos2Lines[0], {
            x: apellidosX,
            y: apellidosY,
            size: 12,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar NOMCATE centrado
        if (employee1.NOMCATE) {
          const nomcateX = centerText(
            employee1.NOMCATE,
            fontMedium,
            10,
            startX,
            endX,
          );
          currentPage.drawText(employee1.NOMCATE, {
            x: nomcateX,
            y: height - 8.65 * CM_TO_POINTS,
            size: 10,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        if (employee2.NOMCATE) {
          const nomcateX = centerText(
            employee2.NOMCATE,
            fontMedium,
            10,
            startX,
            endX,
          );
          currentPage.drawText(employee2.NOMCATE, {
            x: nomcateX,
            y: height - 21.77 * CM_TO_POINTS,
            size: 10,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar ADSCRIPCION con múltiples líneas
        if (adscripcion1Lines.length > 0) {
          // Primera línea (máximo 5cm)
          const pixelX1 = 5 * CM_TO_POINTS;
          const pixelY1 = height - 4.48 * CM_TO_POINTS;

          currentPage.drawText(adscripcion1Lines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Espacio vertical entre líneas de adscripción (usar 0.30 cm)
          const LINE_SPACING_ADS = 0.3 * CM_TO_POINTS;

          // Segunda línea si existe (máximo 5cm), alineada con la primera
          if (adscripcion1Lines.length > 1) {
            const remainingText = adscripcion1Lines.slice(1).join(" ");
            const secondLineParts = splitTextByWidth(
              remainingText,
              fontBlack,
              8,
              5, // ancho 5cm para la segunda línea
              CM_TO_POINTS,
            );

            if (secondLineParts.length > 0) {
              // Alinear X con la primera línea
              const pixelX2 = pixelX1;
              const pixelY2 = pixelY1 - LINE_SPACING_ADS;

              currentPage.drawText(secondLineParts[0], {
                x: pixelX2,
                y: pixelY2,
                size: 8,
                font: fontBlack,
                color: rgb(0, 0, 0),
              });

              // Si hay más texto, crear una tercera línea con el resto
              const remainingAfterSecond =
                secondLineParts.length > 1
                  ? secondLineParts.slice(1).join(" ")
                  : adscripcion1Lines.slice(2).join(" ");

              if (
                remainingAfterSecond &&
                remainingAfterSecond.trim().length > 0
              ) {
                const thirdLineParts = splitTextByWidth(
                  remainingAfterSecond,
                  fontBlack,
                  8,
                  5, // ancho 5cm para la tercera línea
                  CM_TO_POINTS,
                );
                if (thirdLineParts.length > 0) {
                  const pixelY3 = pixelY2 - LINE_SPACING_ADS;
                  currentPage.drawText(thirdLineParts[0], {
                    x: pixelX1,
                    y: pixelY3,
                    size: 8,
                    font: fontBlack,
                    color: rgb(0, 0, 0),
                  });
                }
              }
            }
          }
        }

        if (adscripcion2Lines.length > 0) {
          const pixelX1 = 5 * CM_TO_POINTS;
          const pixelY1 = height - 17.6 * CM_TO_POINTS;

          currentPage.drawText(adscripcion2Lines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Espacio vertical entre líneas de adscripción (usar 0.30 cm)
          const LINE_SPACING_ADS = 0.3 * CM_TO_POINTS;

          // Segunda línea si existe (máximo 5cm), alineada con la primera
          if (adscripcion2Lines.length > 1) {
            const remainingText = adscripcion2Lines.slice(1).join(" ");
            const secondLineParts = splitTextByWidth(
              remainingText,
              fontBlack,
              8,
              5, // ancho 5cm para la segunda línea
              CM_TO_POINTS,
            );

            if (secondLineParts.length > 0) {
              // Alinear X con la primera línea
              const pixelX2 = pixelX1;
              const pixelY2 = pixelY1 - LINE_SPACING_ADS;

              currentPage.drawText(secondLineParts[0], {
                x: pixelX2,
                y: pixelY2,
                size: 8,
                font: fontBlack,
                color: rgb(0, 0, 0),
              });

              // Si hay más texto, crear una tercera línea con el resto
              const remainingAfterSecond =
                secondLineParts.length > 1
                  ? secondLineParts.slice(1).join(" ")
                  : adscripcion2Lines.slice(2).join(" ");

              if (
                remainingAfterSecond &&
                remainingAfterSecond.trim().length > 0
              ) {
                const thirdLineParts = splitTextByWidth(
                  remainingAfterSecond,
                  fontBlack,
                  8,
                  5, // ancho 5cm para la tercera línea
                  CM_TO_POINTS,
                );
                if (thirdLineParts.length > 0) {
                  const pixelY3 = pixelY2 - LINE_SPACING_ADS;
                  currentPage.drawText(thirdLineParts[0], {
                    x: pixelX1,
                    y: pixelY3,
                    size: 8,
                    font: fontBlack,
                    color: rgb(0, 0, 0),
                  });
                }
              }
            }
          }
        }

        // Insertar DOMICILIO con múltiples líneas
        if (domicilio1Lines.length > 0) {
          // Primera línea (máximo 5cm) -> subir 0.3 cm
          const pixelX1 = 5.6 * CM_TO_POINTS;
          const pixelY1 = height - 6.25 * CM_TO_POINTS;

          // Espacio vertical entre líneas reducido (0.25 cm)
          const LINE_SPACING = 0.3 * CM_TO_POINTS;

          // Dibujar primera línea
          currentPage.drawText(domicilio1Lines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Segunda línea (si existe)
          if (domicilio1Lines.length > 1) {
            const secondText = domicilio1Lines[1];
            const pixelY2 = pixelY1 - LINE_SPACING;

            currentPage.drawText(secondText, {
              x: pixelX1, // misma alineación que la primera
              y: pixelY2,
              size: 8,
              font: fontBlack,
              color: rgb(0, 0, 0),
            });

            // Si hay más de dos líneas, crear una tercera con el resto del texto
            if (domicilio1Lines.length > 2) {
              const remainingText = domicilio1Lines.slice(2).join(" ");
              // Asegurarse que la tercera línea quepa en 5cm (tomar solo la primera línea resultante)
              const thirdLineParts = splitTextByWidth(
                remainingText,
                fontBlack,
                8,
                5, // ancho 5cm
                CM_TO_POINTS,
              );
              if (thirdLineParts.length > 0) {
                const pixelY3 = pixelY2 - LINE_SPACING;
                currentPage.drawText(thirdLineParts[0], {
                  x: pixelX1,
                  y: pixelY3,
                  size: 8,
                  font: fontBlack,
                  color: rgb(0, 0, 0),
                });
              }
            }
          }
        }

        if (domicilio2Lines.length > 0) {
          // Primera línea (máximo 5cm) -> subir 0.3 cm
          const pixelX1 = 5.6 * CM_TO_POINTS;
          const pixelY1 = height - 19.37 * CM_TO_POINTS;

          // Espacio vertical entre líneas reducido (0.25 cm)
          const LINE_SPACING = 0.3 * CM_TO_POINTS;

          // Dibujar primera línea
          currentPage.drawText(domicilio2Lines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Segunda línea (si existe)
          if (domicilio2Lines.length > 1) {
            const secondText = domicilio2Lines[1];
            const pixelY2 = pixelY1 - LINE_SPACING;

            currentPage.drawText(secondText, {
              x: pixelX1, // misma alineación que la primera
              y: pixelY2,
              size: 8,
              font: fontBlack,
              color: rgb(0, 0, 0),
            });

            // Si hay más de dos líneas, crear una tercera con el resto del texto
            if (domicilio2Lines.length > 2) {
              const remainingText = domicilio2Lines.slice(2).join(" ");
              // Asegurarse que la tercera línea quepa en 5cm (tomar solo la primera línea resultante)
              const thirdLineParts = splitTextByWidth(
                remainingText,
                fontBlack,
                8,
                5, // ancho 5cm
                CM_TO_POINTS,
              );
              if (thirdLineParts.length > 0) {
                const pixelY3 = pixelY2 - LINE_SPACING;
                currentPage.drawText(thirdLineParts[0], {
                  x: pixelX1,
                  y: pixelY3,
                  size: 8,
                  font: fontBlack,
                  color: rgb(0, 0, 0),
                });
              }
            }
          }
        }
      } else {

        const employee = employee1;

        // Cargar el template para cada gafete
        const templateBytes = fs.readFileSync(templatePath);
        const templateDoc = await PDFDocument.load(templateBytes);

        const [templatePage] = await pdfDoc.copyPages(templateDoc, [0]);
        pdfDoc.addPage(templatePage);

        const pages = pdfDoc.getPages();
        const currentPage = pages[pages.length - 1];
        const { width, height } = currentPage.getSize();

        // Conversión correcta: 1 cm = 28.3465 puntos (1 inch = 72 points, 1 inch = 2.54 cm)
        const CM_TO_POINTS = 28.3465;

        // Bajar 1.7 cm - Subir 1.5 cm = Bajar 0.2 cm
        const offsetY = (1.7 - 1.5) * CM_TO_POINTS;
        // Mover a la derecha 1.5 cm + 0.2 cm = 1.7 cm
        const offsetX = (1.5 + 0.2) * CM_TO_POINTS;

        // Procesar ADSCRIPCION (primer renglón 5cm, segundo 6cm)
        const adscripcionLines = splitTextByWidth(
          employee.ADSCRIPCION || "",
          fontBlack,
          8,
          5, // <- ancho cambiado a 5cm
          CM_TO_POINTS,
        );

        // Procesar DOMICILIO (primer renglón 5cm, segundo 5cm)
        const domicilioLines = splitTextByWidth(
          employee.DOMICILIO || "",
          fontBlack,
          8,
          5, // <- ancho cambiado a 5cm
          CM_TO_POINTS,
        );

        // Procesar APELLIDOS (APE_PAT + APE_MAT) con ancho de 6cm
        const apellidosText = `${employee.APE_PAT || ""} ${employee.APE_MAT || ""
          }`.trim();
        const apellidosLines = splitTextByWidth(
          apellidosText,
          fontMedium,
          12,
          6,
          CM_TO_POINTS,
        );

        // Antes de armar los campos, truncar AVISAR a una sola línea (máximo 5cm)
        const avisarSingleLine =
          splitTextByWidth(
            employee.AVISAR || "",
            fontBlack,
            8,
            5, // ancho máximo 5cm (igual que ADSCRIPCION/DOMICILIO)
            CM_TO_POINTS,
          )[0] || "";

        // Configuración de campos según las coordenadas proporcionadas
        const fieldsData = [
          {
            text: employee.RFC || "",
            x: 6.35 * CM_TO_POINTS + offsetX,
            y: height - 6.49 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.CURP || "",
            x: 6.72 * CM_TO_POINTS + offsetX,
            y: height - 7.15 * CM_TO_POINTS - offsetY, // Debajo de RFC
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.TEL_PERSONAL || "",
            x: 6.6 * CM_TO_POINTS + offsetX,
            y: height - 10.52 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: avisarSingleLine,
            x: 5.72 * CM_TO_POINTS + offsetX + 1 * CM_TO_POINTS, // 1 cm a la derecha
            y: height - 12.5 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.TEL_EMERGENCIA1 || "",
            x: 7.1 * CM_TO_POINTS + offsetX + 0.3 * CM_TO_POINTS, // 3mm a la derecha
            y: height - 12.98 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.SANGRE || "",
            x: 6.77 * CM_TO_POINTS + offsetX + 1 * CM_TO_POINTS, // 1 cm a la derecha
            y: height - 13.41 * CM_TO_POINTS - offsetY - 0.1 * CM_TO_POINTS, // 1mm abajo
            font: fontBlack,
            size: 8,
            color: hexToRgb("#9D2449"),
          },
          {
            text: employee.ALERGIAS || "",
            x: 5.8 * CM_TO_POINTS + offsetX + 1 * CM_TO_POINTS, // 1 cm a la derecha
            y: height - 14.03 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
        ];

        // Insertar los datos en el PDF
        fieldsData.forEach((field) => {
          if (field.text) {
            currentPage.drawText(String(field.text), {
              x: field.x,
              y: field.y,
              size: field.size,
              font: field.font,
              color: field.color,
            });
          }
        });

        // Función para centrar texto en un rango
        const centerText = (text, font, fontSize, startX, endX) => {
          const textWidth = font.widthOfTextAtSize(text, fontSize);
          const availableWidth = endX - startX;
          const centeredX = startX + (availableWidth - textWidth) / 2;
          return centeredX;
        };

        const startX = 12.2 * CM_TO_POINTS + offsetX + 0.25 * CM_TO_POINTS; // 0.25cm a la derecha
        const endX = 20.2 * CM_TO_POINTS + offsetX + 0.25 * CM_TO_POINTS; // 0.25cm a la derecha

        // Insertar NOMBRES centrado
        if (employee.NOMBRES) {
          const nombresX = centerText(
            employee.NOMBRES,
            fontBlack,
            12,
            startX,
            endX,
          );
          currentPage.drawText(employee.NOMBRES, {
            x: nombresX,
            y: height - 11 * CM_TO_POINTS - offsetY,
            size: 12,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar NOMCATE centrado
        if (employee.NOMCATE) {
          const nomcateX = centerText(
            employee.NOMCATE,
            fontMedium,
            10,
            startX,
            endX,
          );
          currentPage.drawText(employee.NOMCATE, {
            x: nomcateX,
            y: height - 12 * CM_TO_POINTS - offsetY,
            size: 10,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar ADSCRIPCION con múltiples líneas
        if (adscripcionLines.length > 0) {
          // Primera línea (máximo 5cm)
          const pixelX1 = 6.4 * CM_TO_POINTS + offsetX;
          const pixelY1 =
            height - 8 * CM_TO_POINTS - offsetY + 0.2 * CM_TO_POINTS; // Subir 0.2cm

          currentPage.drawText(adscripcionLines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Espacio vertical entre líneas de adscripción (usar 0.30 cm)
          const LINE_SPACING_ADS = 0.3 * CM_TO_POINTS;

          // Segunda línea si existe (máximo 5cm), alineada con la primera
          if (adscripcionLines.length > 1) {
            const remainingText = adscripcionLines.slice(1).join(" ");
            const secondLineParts = splitTextByWidth(
              remainingText,
              fontBlack,
              8,
              5, // ancho 5cm para la segunda línea
              CM_TO_POINTS,
            );

            if (secondLineParts.length > 0) {
              // Alinear X con la primera línea
              const pixelX2 = pixelX1;
              const pixelY2 = pixelY1 - LINE_SPACING_ADS;

              currentPage.drawText(secondLineParts[0], {
                x: pixelX2,
                y: pixelY2,
                size: 8,
                font: fontBlack,
                color: rgb(0, 0, 0),
              });

              // Si hay más texto, crear una tercera línea con el resto
              const remainingAfterSecond =
                secondLineParts.length > 1
                  ? secondLineParts.slice(1).join(" ")
                  : adscripcionLines.slice(2).join(" ");

              if (
                remainingAfterSecond &&
                remainingAfterSecond.trim().length > 0
              ) {
                const thirdLineParts = splitTextByWidth(
                  remainingAfterSecond,
                  fontBlack,
                  8,
                  5, // ancho 5cm para la tercera línea
                  CM_TO_POINTS,
                );
                if (thirdLineParts.length > 0) {
                  const pixelY3 = pixelY2 - LINE_SPACING_ADS;
                  currentPage.drawText(thirdLineParts[0], {
                    x: pixelX1,
                    y: pixelY3,
                    size: 8,
                    font: fontBlack,
                    color: rgb(0, 0, 0),
                  });
                }
              }
            }
          }
        }

        // Insertar DOMICILIO con múltiples líneas
        if (domicilioLines.length > 0) {
          // Primera línea (máximo 5cm) -> subir 0.3 cm
          const pixelX1 = 6.95 * CM_TO_POINTS + offsetX;
          const pixelY1 =
            height - 9.9 * CM_TO_POINTS - offsetY + 0.3 * CM_TO_POINTS;

          // Espacio vertical entre líneas reducido (0.25 cm)
          const LINE_SPACING = 0.3 * CM_TO_POINTS;

          // Dibujar primera línea
          currentPage.drawText(domicilioLines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Segunda línea (si existe)
          if (domicilioLines.length > 1) {
            const secondText = domicilioLines[1];
            const pixelY2 = pixelY1 - LINE_SPACING;

            currentPage.drawText(secondText, {
              x: pixelX1, // misma alineación que la primera
              y: pixelY2,
              size: 8,
              font: fontBlack,
              color: rgb(0, 0, 0),
            });

            // Si hay más de dos líneas, crear una tercera con el resto del texto
            if (domicilioLines.length > 2) {
              const remainingText = domicilioLines.slice(2).join(" ");
              // Asegurarse que la tercera línea quepa en 5cm (tomar solo la primera línea resultante)
              const thirdLineParts = splitTextByWidth(
                remainingText,
                fontBlack,
                8,
                5, // ancho 5cm
                CM_TO_POINTS,
              );
              if (thirdLineParts.length > 0) {
                const pixelY3 = pixelY2 - LINE_SPACING;
                currentPage.drawText(thirdLineParts[0], {
                  x: pixelX1,
                  y: pixelY3,
                  size: 8,
                  font: fontBlack,
                  color: rgb(0, 0, 0),
                });
              }
            }
          }
        }

        // Insertar APELLIDOS (APE_PAT + APE_MAT) centrado
        if (apellidosLines.length > 0) {
          const apellidosX = centerText(
            apellidosLines[0],
            fontMedium,
            12,
            startX,
            endX,
          );
          const apellidosY = height - 11.5 * CM_TO_POINTS - offsetY;

          currentPage.drawText(apellidosLines[0], {
            x: apellidosX,
            y: apellidosY,
            size: 12,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }
      }

    }

    // Guardar el PDF modificado
    const pdfBytes = await pdfDoc.save();

    // Enviar el PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=credenciales_${Date.now()}.pdf`,
    );
    res.send(Buffer.from(pdfBytes));

    // Registrar la acción
    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const userAction = {
      timestamp: currentDateTime,
      username: req.user?.username || "System",
      module: "GAFETES",
      action: `GENERÓ ${employees.length} CREDENCIAL(ES)`,
    };
    await insertOne("USER_ACTIONS", userAction);
  } catch (error) {
    console.error("Error generating credentials:", error);
    res.status(500).send({
      error: "Error generando las credenciales",
      details: error.message,
    });
  }
};
gafetesController.printCredentialsServicios = async (req, res) => {
  const { PDFDocument, rgb } = require("pdf-lib");
  const fontkit = require("@pdf-lib/fontkit");
  const fs = require("fs");
  const path = require("path");

  try {
    const { data } = req.body;

    // Validar que data existe
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return res.status(400).send({ error: "No se proporcionaron datos" });
    }

    // Convertir a array si es un solo objeto
    const employees = Array.isArray(data) ? data : [data];

    // Crear un nuevo documento PDF
    const pdfDoc = await PDFDocument.create();

    // Registrar fontkit para fuentes personalizadas
    pdfDoc.registerFontkit(fontkit);

    // Cargar fuentes personalizadas
    const fontBlackPath = path.join(
      __dirname,
      "../../assets/fonts",
      "Montserrat-Black.ttf",
    );
    const fontMediumPath = path.join(
      __dirname,
      "../../assets/fonts",
      "Montserrat-Medium.ttf",
    );

    const fontBlackBytes = fs.readFileSync(fontBlackPath);
    const fontMediumBytes = fs.readFileSync(fontMediumPath);

    const fontBlack = await pdfDoc.embedFont(fontBlackBytes);
    const fontMedium = await pdfDoc.embedFont(fontMediumBytes);

    // Función para convertir HEX a RGB
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? rgb(
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255,
        )
        : rgb(0, 0, 0);
    };

    // Función para dividir texto en líneas según ancho máximo
    const splitTextByWidth = (text, font, fontSize, maxWidthCm, cmToPixel) => {
      if (!text) return [];

      const maxWidth = maxWidthCm * cmToPixel;
      const words = text.split(" ");
      const lines = [];
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }

      return lines;
    };

    for (let i = 0; i < employees.length; i += 2) {

      const employee1 = employees[i];
      const employee2 = employees[i + 1];

      const templatePath = employee2
        ? path.join(__dirname, "../../templates", "g_servicios.pdf")
        : path.join(__dirname, "../../templates", "g_servicios_single.pdf");

      if (!fs.existsSync(templatePath)) {
        return res.status(404).send({
          error: "Template PDF no encontrado",
          path: templatePath,
        });
      }

      if (employee2) {
        // Cargar el template para cada gafete
        const templateBytes = fs.readFileSync(templatePath);
        const templateDoc = await PDFDocument.load(templateBytes);

        const [templatePage] = await pdfDoc.copyPages(templateDoc, [0]);
        pdfDoc.addPage(templatePage);

        const pages = pdfDoc.getPages();
        const currentPage = pages[pages.length - 1];
        const { width, height } = currentPage.getSize();

        // Conversión correcta: 1 cm = 28.3465 puntos (1 inch = 72 points, 1 inch = 2.54 cm)
        const CM_TO_POINTS = 28.3465;


        // Bajar 1.7 cm - Subir 1.5 cm = Bajar 0.2 cm
        const offsetY = CM_TO_POINTS;
        // Mover a la derecha 1.5 cm + 0.2 cm = 1.7 cm
        const offsetX = CM_TO_POINTS;

        // Procesar ADSCRIPCION (primer renglón 5cm, segundo 6cm)
        const adscripcion1Lines = splitTextByWidth(
          employee1.ADSCRIPCION || "",
          fontBlack,
          8,
          5,
          CM_TO_POINTS,
        );

        const adscripcion2Lines = splitTextByWidth(
          employee2.ADSCRIPCION || "",
          fontBlack,
          8,
          5,
          CM_TO_POINTS,
        );

        // Procesar DOMICILIO (primer renglón 5cm, segundo 5cm)
        const domicilio1Lines = splitTextByWidth(
          employee1.DOMICILIO || "",
          fontBlack,
          8,
          5,
          CM_TO_POINTS,
        );

        const domicilio2Lines = splitTextByWidth(
          employee2.DOMICILIO || "",
          fontBlack,
          8,
          5,
          CM_TO_POINTS,
        );

        // Procesar APELLIDOS (APE_PAT + APE_MAT) con ancho de 6cm
        const apellidos1Text = `${employee1.APE_PAT || ""} ${employee1.APE_MAT || ""
          }`.trim();
        const apellidos1Lines = splitTextByWidth(
          apellidos1Text,
          fontMedium,
          12,
          6,
          CM_TO_POINTS,
        );

        const apellidos2Text = `${employee2.APE_PAT || ""} ${employee2.APE_MAT || ""
          }`.trim();
        const apellidos2Lines = splitTextByWidth(
          apellidos2Text,
          fontMedium,
          12,
          6,
          CM_TO_POINTS,
        );

        // Antes de armar los campos, truncar AVISAR a una sola línea (máximo 5cm)
        const avisarSingleLine =
          splitTextByWidth(
            employee1.AVISAR || "",
            fontBlack,
            8,
            5,
            CM_TO_POINTS,
          )[0] || "";

        const avisar2SingleLine =
          splitTextByWidth(
            employee2.AVISAR || "",
            fontBlack,
            8,
            5,
            CM_TO_POINTS,
          )[0] || "";

        // Configuración de campos según las coordenadas proporcionadas
        const fieldsData = [
          {
            text: employee1.RFC || "",
            x: 5 * CM_TO_POINTS,
            y: height - 3.17 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.RFC || "",
            x: 5 * CM_TO_POINTS,
            y: height - 16.29 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.CURP || "",
            x: 5.25 * CM_TO_POINTS,
            y: height - 3.83 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.CURP || "",
            x: 5.25 * CM_TO_POINTS,
            y: height - 16.95 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.TEL_PERSONAL || "",
            x: 5.2 * CM_TO_POINTS,
            y: height - 7.2 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.TEL_PERSONAL || "",
            x: 5.2 * CM_TO_POINTS,
            y: height - 20.32 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: avisarSingleLine,
            x: 5.3 * CM_TO_POINTS,
            y: height - 9.17 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: avisar2SingleLine,
            x: 5.3 * CM_TO_POINTS,
            y: height - 22.29 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.TEL_EMERGENCIA1 || "",
            x: 6 * CM_TO_POINTS,
            y: height - 9.68 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.TEL_EMERGENCIA1 || "",
            x: 6 * CM_TO_POINTS,
            y: height - 22.80 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.SANGRE || "",
            x: 6.3 * CM_TO_POINTS,
            y: height - 10.20 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: hexToRgb("#9D2449"),
          },
          {
            text: employee2.SANGRE || "",
            x: 6.3 * CM_TO_POINTS,
            y: height - 23.32 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: hexToRgb("#9D2449"),
          },
          {
            text: employee1.ALERGIAS || "",
            x: 5.3 * CM_TO_POINTS,
            y: height - 10.71 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.ALERGIAS || "",
            x: 5.3 * CM_TO_POINTS,
            y: height - 23.83 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee1.AFILIACI || "",
            x: 7.05 * CM_TO_POINTS,
            y: height - 11.25 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee2.AFILIACI || "",
            x: 7.05 * CM_TO_POINTS,
            y: height - 24.38 * CM_TO_POINTS,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
        ];

        // Insertar los datos en el PDF
        fieldsData.forEach((field) => {
          if (field.text) {
            currentPage.drawText(String(field.text), {
              x: field.x,
              y: field.y,
              size: field.size,
              font: field.font,
              color: field.color,
            });
          }
        });

        // Función para centrar texto en un rango
        const centerText = (text, font, fontSize, startX, endX) => {
          const textWidth = font.widthOfTextAtSize(text, fontSize);
          const availableWidth = endX - startX;
          const centeredX = startX + (availableWidth - textWidth) / 2;
          return centeredX;
        };

        const startX = 9.6 * CM_TO_POINTS + offsetX + 0.25 * CM_TO_POINTS;
        const endX = 17.8 * CM_TO_POINTS + offsetX + 0.25 * CM_TO_POINTS;

        if (employee1.NOMBRES) {
          const nombresX = centerText(
            employee1.NOMBRES,
            fontBlack,
            12,
            startX,
            endX,
          );
          currentPage.drawText(employee1.NOMBRES, {
            x: nombresX,
            y: height - 7.65 * CM_TO_POINTS,
            size: 12,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });
        }

        if (employee2.NOMBRES) {
          const nombresX = centerText(
            employee2.NOMBRES,
            fontBlack,
            12,
            startX,
            endX,
          );
          currentPage.drawText(employee2.NOMBRES, {
            x: nombresX,
            y: height - 20.77 * CM_TO_POINTS,
            size: 12,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });
        }

        if (apellidos1Lines.length > 0) {
          const apellidosX = centerText(
            apellidos1Lines[0],
            fontMedium,
            12,
            startX,
            endX,
          );
          const apellidosY = height - 8.15 * CM_TO_POINTS;

          currentPage.drawText(apellidos1Lines[0], {
            x: apellidosX,
            y: apellidosY,
            size: 12,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        if (apellidos2Lines.length > 0) {
          const apellidosX = centerText(
            apellidos2Lines[0],
            fontMedium,
            12,
            startX,
            endX,
          );
          const apellidosY = height - 21.27 * CM_TO_POINTS;

          currentPage.drawText(apellidos2Lines[0], {
            x: apellidosX,
            y: apellidosY,
            size: 12,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar NOMCATE centrado
        if (employee1.NOMCATE) {
          const nomcateX = centerText(
            employee1.NOMCATE,
            fontMedium,
            10,
            startX,
            endX,
          );
          currentPage.drawText(employee1.NOMCATE, {
            x: nomcateX,
            y: height - 8.65 * CM_TO_POINTS,
            size: 10,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        if (employee2.NOMCATE) {
          const nomcateX = centerText(
            employee2.NOMCATE,
            fontMedium,
            10,
            startX,
            endX,
          );
          currentPage.drawText(employee2.NOMCATE, {
            x: nomcateX,
            y: height - 21.77 * CM_TO_POINTS,
            size: 10,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar ADSCRIPCION con múltiples líneas
        if (adscripcion1Lines.length > 0) {
          // Primera línea (máximo 5cm)
          const pixelX1 = 5 * CM_TO_POINTS;
          const pixelY1 = height - 4.48 * CM_TO_POINTS;

          currentPage.drawText(adscripcion1Lines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Espacio vertical entre líneas de adscripción (usar 0.30 cm)
          const LINE_SPACING_ADS = 0.3 * CM_TO_POINTS;

          // Segunda línea si existe (máximo 5cm), alineada con la primera
          if (adscripcion1Lines.length > 1) {
            const remainingText = adscripcion1Lines.slice(1).join(" ");
            const secondLineParts = splitTextByWidth(
              remainingText,
              fontBlack,
              8,
              5, // ancho 5cm para la segunda línea
              CM_TO_POINTS,
            );

            if (secondLineParts.length > 0) {
              // Alinear X con la primera línea
              const pixelX2 = pixelX1;
              const pixelY2 = pixelY1 - LINE_SPACING_ADS;

              currentPage.drawText(secondLineParts[0], {
                x: pixelX2,
                y: pixelY2,
                size: 8,
                font: fontBlack,
                color: rgb(0, 0, 0),
              });

              // Si hay más texto, crear una tercera línea con el resto
              const remainingAfterSecond =
                secondLineParts.length > 1
                  ? secondLineParts.slice(1).join(" ")
                  : adscripcion1Lines.slice(2).join(" ");

              if (
                remainingAfterSecond &&
                remainingAfterSecond.trim().length > 0
              ) {
                const thirdLineParts = splitTextByWidth(
                  remainingAfterSecond,
                  fontBlack,
                  8,
                  5, // ancho 5cm para la tercera línea
                  CM_TO_POINTS,
                );
                if (thirdLineParts.length > 0) {
                  const pixelY3 = pixelY2 - LINE_SPACING_ADS;
                  currentPage.drawText(thirdLineParts[0], {
                    x: pixelX1,
                    y: pixelY3,
                    size: 8,
                    font: fontBlack,
                    color: rgb(0, 0, 0),
                  });
                }
              }
            }
          }
        }

        if (adscripcion2Lines.length > 0) {
          const pixelX1 = 5 * CM_TO_POINTS;
          const pixelY1 = height - 17.6 * CM_TO_POINTS;

          currentPage.drawText(adscripcion2Lines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Espacio vertical entre líneas de adscripción (usar 0.30 cm)
          const LINE_SPACING_ADS = 0.3 * CM_TO_POINTS;

          // Segunda línea si existe (máximo 5cm), alineada con la primera
          if (adscripcion2Lines.length > 1) {
            const remainingText = adscripcion2Lines.slice(1).join(" ");
            const secondLineParts = splitTextByWidth(
              remainingText,
              fontBlack,
              8,
              5, // ancho 5cm para la segunda línea
              CM_TO_POINTS,
            );

            if (secondLineParts.length > 0) {
              // Alinear X con la primera línea
              const pixelX2 = pixelX1;
              const pixelY2 = pixelY1 - LINE_SPACING_ADS;

              currentPage.drawText(secondLineParts[0], {
                x: pixelX2,
                y: pixelY2,
                size: 8,
                font: fontBlack,
                color: rgb(0, 0, 0),
              });

              // Si hay más texto, crear una tercera línea con el resto
              const remainingAfterSecond =
                secondLineParts.length > 1
                  ? secondLineParts.slice(1).join(" ")
                  : adscripcion2Lines.slice(2).join(" ");

              if (
                remainingAfterSecond &&
                remainingAfterSecond.trim().length > 0
              ) {
                const thirdLineParts = splitTextByWidth(
                  remainingAfterSecond,
                  fontBlack,
                  8,
                  5, // ancho 5cm para la tercera línea
                  CM_TO_POINTS,
                );
                if (thirdLineParts.length > 0) {
                  const pixelY3 = pixelY2 - LINE_SPACING_ADS;
                  currentPage.drawText(thirdLineParts[0], {
                    x: pixelX1,
                    y: pixelY3,
                    size: 8,
                    font: fontBlack,
                    color: rgb(0, 0, 0),
                  });
                }
              }
            }
          }
        }

        // Insertar DOMICILIO con múltiples líneas
        if (domicilio1Lines.length > 0) {
          // Primera línea (máximo 5cm) -> subir 0.3 cm
          const pixelX1 = 5.6 * CM_TO_POINTS;
          const pixelY1 = height - 6.25 * CM_TO_POINTS;

          // Espacio vertical entre líneas reducido (0.25 cm)
          const LINE_SPACING = 0.3 * CM_TO_POINTS;

          // Dibujar primera línea
          currentPage.drawText(domicilio1Lines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Segunda línea (si existe)
          if (domicilio1Lines.length > 1) {
            const secondText = domicilio1Lines[1];
            const pixelY2 = pixelY1 - LINE_SPACING;

            currentPage.drawText(secondText, {
              x: pixelX1, // misma alineación que la primera
              y: pixelY2,
              size: 8,
              font: fontBlack,
              color: rgb(0, 0, 0),
            });

            // Si hay más de dos líneas, crear una tercera con el resto del texto
            if (domicilio1Lines.length > 2) {
              const remainingText = domicilio1Lines.slice(2).join(" ");
              // Asegurarse que la tercera línea quepa en 5cm (tomar solo la primera línea resultante)
              const thirdLineParts = splitTextByWidth(
                remainingText,
                fontBlack,
                8,
                5, // ancho 5cm
                CM_TO_POINTS,
              );
              if (thirdLineParts.length > 0) {
                const pixelY3 = pixelY2 - LINE_SPACING;
                currentPage.drawText(thirdLineParts[0], {
                  x: pixelX1,
                  y: pixelY3,
                  size: 8,
                  font: fontBlack,
                  color: rgb(0, 0, 0),
                });
              }
            }
          }
        }

        if (domicilio2Lines.length > 0) {
          // Primera línea (máximo 5cm) -> subir 0.3 cm
          const pixelX1 = 5.6 * CM_TO_POINTS;
          const pixelY1 = height - 19.37 * CM_TO_POINTS;

          // Espacio vertical entre líneas reducido (0.25 cm)
          const LINE_SPACING = 0.3 * CM_TO_POINTS;

          // Dibujar primera línea
          currentPage.drawText(domicilio2Lines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Segunda línea (si existe)
          if (domicilio2Lines.length > 1) {
            const secondText = domicilio2Lines[1];
            const pixelY2 = pixelY1 - LINE_SPACING;

            currentPage.drawText(secondText, {
              x: pixelX1, // misma alineación que la primera
              y: pixelY2,
              size: 8,
              font: fontBlack,
              color: rgb(0, 0, 0),
            });

            // Si hay más de dos líneas, crear una tercera con el resto del texto
            if (domicilio2Lines.length > 2) {
              const remainingText = domicilio2Lines.slice(2).join(" ");
              // Asegurarse que la tercera línea quepa en 5cm (tomar solo la primera línea resultante)
              const thirdLineParts = splitTextByWidth(
                remainingText,
                fontBlack,
                8,
                5, // ancho 5cm
                CM_TO_POINTS,
              );
              if (thirdLineParts.length > 0) {
                const pixelY3 = pixelY2 - LINE_SPACING;
                currentPage.drawText(thirdLineParts[0], {
                  x: pixelX1,
                  y: pixelY3,
                  size: 8,
                  font: fontBlack,
                  color: rgb(0, 0, 0),
                });
              }
            }
          }
        }
      } else {

        const employee = employee1;

        // Cargar el template para cada gafete
        const templateBytes = fs.readFileSync(templatePath);
        const templateDoc = await PDFDocument.load(templateBytes);

        const [templatePage] = await pdfDoc.copyPages(templateDoc, [0]);
        pdfDoc.addPage(templatePage);

        const pages = pdfDoc.getPages();
        const currentPage = pages[pages.length - 1];
        const { width, height } = currentPage.getSize();

        // Conversión correcta: 1 cm = 28.3465 puntos (1 inch = 72 points, 1 inch = 2.54 cm)
        const CM_TO_POINTS = 28.3465;

        // Bajar 1.7 cm - Subir 1.5 cm = Bajar 0.2 cm
        const offsetY = (1.7 - 1.5) * CM_TO_POINTS;
        // Mover a la derecha 1.5 cm + 0.2 cm = 1.7 cm
        const offsetX = (1.5 + 0.2) * CM_TO_POINTS;

        // Procesar ADSCRIPCION (primer renglón 5cm, segundo 6cm)
        const adscripcionLines = splitTextByWidth(
          employee.ADSCRIPCION || "",
          fontBlack,
          8,
          5, // <- ancho cambiado a 5cm
          CM_TO_POINTS,
        );

        // Procesar DOMICILIO (primer renglón 5cm, segundo 5cm)
        const domicilioLines = splitTextByWidth(
          employee.DOMICILIO || "",
          fontBlack,
          8,
          5, // <- ancho cambiado a 5cm
          CM_TO_POINTS,
        );

        // Procesar APELLIDOS (APE_PAT + APE_MAT) con ancho de 6cm
        const apellidosText = `${employee.APE_PAT || ""} ${employee.APE_MAT || ""
          }`.trim();
        const apellidosLines = splitTextByWidth(
          apellidosText,
          fontMedium,
          12,
          6,
          CM_TO_POINTS,
        );

        // Antes de armar los campos, truncar AVISAR a una sola línea (máximo 5cm)
        const avisarSingleLine =
          splitTextByWidth(
            employee.AVISAR || "",
            fontBlack,
            8,
            5, // ancho máximo 5cm (igual que ADSCRIPCION/DOMICILIO)
            CM_TO_POINTS,
          )[0] || "";

        // Configuración de campos según las coordenadas proporcionadas
        const fieldsData = [
          {
            text: employee.RFC || "",
            x: 6.35 * CM_TO_POINTS + offsetX,
            y: height - 6.49 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.CURP || "",
            x: 6.72 * CM_TO_POINTS + offsetX,
            y: height - 7.15 * CM_TO_POINTS - offsetY, // Debajo de RFC
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.TEL_PERSONAL || "",
            x: 6.6 * CM_TO_POINTS + offsetX,
            y: height - 10.52 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: avisarSingleLine,
            x: 5.72 * CM_TO_POINTS + offsetX + 1 * CM_TO_POINTS, // 1 cm a la derecha
            y: height - 12.5 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.TEL_EMERGENCIA1 || "",
            x: 7.1 * CM_TO_POINTS + offsetX + 0.3 * CM_TO_POINTS, // 3mm a la derecha
            y: height - 12.98 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.SANGRE || "",
            x: 6.77 * CM_TO_POINTS + offsetX + 1 * CM_TO_POINTS, // 1 cm a la derecha
            y: height - 13.41 * CM_TO_POINTS - offsetY - 0.1 * CM_TO_POINTS, // 1mm abajo
            font: fontBlack,
            size: 8,
            color: hexToRgb("#9D2449"),
          },
          {
            text: employee.ALERGIAS || "",
            x: 5.8 * CM_TO_POINTS + offsetX + 1 * CM_TO_POINTS, // 1 cm a la derecha
            y: height - 14.03 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
          {
            text: employee.AFILIACI || "",
            x: 7.45 * CM_TO_POINTS + offsetX + 1 * CM_TO_POINTS, // 1 cm a la derecha
            y: height - 14.57 * CM_TO_POINTS - offsetY,
            font: fontBlack,
            size: 8,
            color: rgb(0, 0, 0),
          },
        ];

        // Insertar los datos en el PDF
        fieldsData.forEach((field) => {
          if (field.text) {
            currentPage.drawText(String(field.text), {
              x: field.x,
              y: field.y,
              size: field.size,
              font: field.font,
              color: field.color,
            });
          }
        });

        // Función para centrar texto en un rango
        const centerText = (text, font, fontSize, startX, endX) => {
          const textWidth = font.widthOfTextAtSize(text, fontSize);
          const availableWidth = endX - startX;
          const centeredX = startX + (availableWidth - textWidth) / 2;
          return centeredX;
        };

        const startX = 12.2 * CM_TO_POINTS + offsetX + 0.25 * CM_TO_POINTS; // 0.25cm a la derecha
        const endX = 20.2 * CM_TO_POINTS + offsetX + 0.25 * CM_TO_POINTS; // 0.25cm a la derecha

        // Insertar NOMBRES centrado
        if (employee.NOMBRES) {
          const nombresX = centerText(
            employee.NOMBRES,
            fontBlack,
            12,
            startX,
            endX,
          );
          currentPage.drawText(employee.NOMBRES, {
            x: nombresX,
            y: height - 11 * CM_TO_POINTS - offsetY,
            size: 12,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar NOMCATE centrado
        if (employee.NOMCATE) {
          const nomcateX = centerText(
            employee.NOMCATE,
            fontMedium,
            10,
            startX,
            endX,
          );
          currentPage.drawText(employee.NOMCATE, {
            x: nomcateX,
            y: height - 12 * CM_TO_POINTS - offsetY,
            size: 10,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }

        // Insertar ADSCRIPCION con múltiples líneas
        if (adscripcionLines.length > 0) {
          // Primera línea (máximo 5cm)
          const pixelX1 = 6.4 * CM_TO_POINTS + offsetX;
          const pixelY1 =
            height - 8 * CM_TO_POINTS - offsetY + 0.2 * CM_TO_POINTS; // Subir 0.2cm

          currentPage.drawText(adscripcionLines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Espacio vertical entre líneas de adscripción (usar 0.30 cm)
          const LINE_SPACING_ADS = 0.3 * CM_TO_POINTS;

          // Segunda línea si existe (máximo 5cm), alineada con la primera
          if (adscripcionLines.length > 1) {
            const remainingText = adscripcionLines.slice(1).join(" ");
            const secondLineParts = splitTextByWidth(
              remainingText,
              fontBlack,
              8,
              5, // ancho 5cm para la segunda línea
              CM_TO_POINTS,
            );

            if (secondLineParts.length > 0) {
              // Alinear X con la primera línea
              const pixelX2 = pixelX1;
              const pixelY2 = pixelY1 - LINE_SPACING_ADS;

              currentPage.drawText(secondLineParts[0], {
                x: pixelX2,
                y: pixelY2,
                size: 8,
                font: fontBlack,
                color: rgb(0, 0, 0),
              });

              // Si hay más texto, crear una tercera línea con el resto
              const remainingAfterSecond =
                secondLineParts.length > 1
                  ? secondLineParts.slice(1).join(" ")
                  : adscripcionLines.slice(2).join(" ");

              if (
                remainingAfterSecond &&
                remainingAfterSecond.trim().length > 0
              ) {
                const thirdLineParts = splitTextByWidth(
                  remainingAfterSecond,
                  fontBlack,
                  8,
                  5, // ancho 5cm para la tercera línea
                  CM_TO_POINTS,
                );
                if (thirdLineParts.length > 0) {
                  const pixelY3 = pixelY2 - LINE_SPACING_ADS;
                  currentPage.drawText(thirdLineParts[0], {
                    x: pixelX1,
                    y: pixelY3,
                    size: 8,
                    font: fontBlack,
                    color: rgb(0, 0, 0),
                  });
                }
              }
            }
          }
        }

        // Insertar DOMICILIO con múltiples líneas
        if (domicilioLines.length > 0) {
          // Primera línea (máximo 5cm) -> subir 0.3 cm
          const pixelX1 = 6.95 * CM_TO_POINTS + offsetX;
          const pixelY1 =
            height - 9.9 * CM_TO_POINTS - offsetY + 0.3 * CM_TO_POINTS;

          // Espacio vertical entre líneas reducido (0.25 cm)
          const LINE_SPACING = 0.3 * CM_TO_POINTS;

          // Dibujar primera línea
          currentPage.drawText(domicilioLines[0], {
            x: pixelX1,
            y: pixelY1,
            size: 8,
            font: fontBlack,
            color: rgb(0, 0, 0),
          });

          // Segunda línea (si existe)
          if (domicilioLines.length > 1) {
            const secondText = domicilioLines[1];
            const pixelY2 = pixelY1 - LINE_SPACING;

            currentPage.drawText(secondText, {
              x: pixelX1, // misma alineación que la primera
              y: pixelY2,
              size: 8,
              font: fontBlack,
              color: rgb(0, 0, 0),
            });

            // Si hay más de dos líneas, crear una tercera con el resto del texto
            if (domicilioLines.length > 2) {
              const remainingText = domicilioLines.slice(2).join(" ");
              // Asegurarse que la tercera línea quepa en 5cm (tomar solo la primera línea resultante)
              const thirdLineParts = splitTextByWidth(
                remainingText,
                fontBlack,
                8,
                5, // ancho 5cm
                CM_TO_POINTS,
              );
              if (thirdLineParts.length > 0) {
                const pixelY3 = pixelY2 - LINE_SPACING;
                currentPage.drawText(thirdLineParts[0], {
                  x: pixelX1,
                  y: pixelY3,
                  size: 8,
                  font: fontBlack,
                  color: rgb(0, 0, 0),
                });
              }
            }
          }
        }

        // Insertar APELLIDOS (APE_PAT + APE_MAT) centrado
        if (apellidosLines.length > 0) {
          const apellidosX = centerText(
            apellidosLines[0],
            fontMedium,
            12,
            startX,
            endX,
          );
          const apellidosY = height - 11.5 * CM_TO_POINTS - offsetY;

          currentPage.drawText(apellidosLines[0], {
            x: apellidosX,
            y: apellidosY,
            size: 12,
            font: fontMedium,
            color: rgb(0, 0, 0),
          });
        }
      }

    }

    // Guardar el PDF modificado
    const pdfBytes = await pdfDoc.save();

    // Enviar el PDF
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=credenciales_${Date.now()}.pdf`,
    );
    res.send(Buffer.from(pdfBytes));

    // Registrar la acción
    const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const userAction = {
      timestamp: currentDateTime,
      username: req.user?.username || "System",
      module: "GAFETES",
      action: `GENERÓ ${employees.length} CREDENCIAL(ES)`,
    };
    await insertOne("USER_ACTIONS", userAction);
  } catch (error) {
    console.error("Error generating credentials:", error);
    res.status(500).send({
      error: "Error generando las credenciales",
      details: error.message,
    });
  }
};
module.exports = gafetesController;
