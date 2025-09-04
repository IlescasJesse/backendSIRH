const { querysql } = require("../../config/mysql");
const { query } = require("../../config/mongo");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const PizZip = require("pizzip");
const fontPath = path.join(__dirname, "../../assets/fonts/Consolas.ttf");
const reportesIncidenciasController = {};

reportesIncidenciasController.printEconomicDays = async (req, res) => {
  const unidades_responsables = await querysql(
    "SELECT * FROM unidad_responsable"
  );
  const doc = new PDFDocument();
  const quin = req.query.quincena || req.params.quincena;
  console.log(quin);

  const economicos_quincena = await query("PERMISOS_ECONOMICOS", {
    QUINCENA: parseInt(quin, 10),
  });
  console.log(economicos_quincena);

  // Validar si no hay datos
  if (economicos_quincena.length === 0) {
    return res.status(404).json({
      message: "No se encontraron datos para la quincena especificada.",
    });
  }

  const filePath = path.join(
    __dirname,
    `../../docs/reportes/p_economicos/QUINCENA${quin}.pdf`
  );

  try {
    const stream = fs.createWriteStream(filePath);

    stream.on("error", (err) => {
      console.error("Error al escribir el archivo:", err.message);
      res.status(500).json({ message: "Error al generar el reporte." });
      doc.end();
    });

    stream.on("finish", () => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=QUINCENA${quin}.pdf`
      );
      res.download(filePath, `QUINCENA${quin}.pdf`, (err) => {
        if (err) {
          console.error("Error al descargar el archivo:", err.message);
          res.status(500).json({ message: "Error al descargar el archivo." });
        }
      });
    });

    doc.pipe(stream);

    // Registrar fuente personalizada
    doc.registerFont("Consolas", fontPath);
    doc.font("Consolas").fontSize(10);

    const currentDate = new Date().toLocaleDateString("es-MX");
    const fechas = economicos_quincena.map((permiso) => permiso.FECHA_CAPTURA);
    const FECHA_CAPTURA_INICIAL = fechas.reduce(
      (min, fecha) => (new Date(fecha) < new Date(min) ? fecha : min),
      fechas[0]
    );
    const FECHA_CAPTURA_FINAL = fechas.reduce(
      (max, fecha) => (new Date(fecha) > new Date(max) ? fecha : max),
      fechas[0]
    );
    const invertDateFormat = (date) => {
      const [year, month, day] = date.split("/");
      return `${day}-${month}-${year}`;
    };
    const FECHA_CAPTURA_INICIAL_INVERTIDA = invertDateFormat(
      FECHA_CAPTURA_INICIAL
    );
    const FECHA_CAPTURA_FINAL_INVERTIDA = invertDateFormat(FECHA_CAPTURA_FINAL);

    // Configurar márgenes

    // Agregar encabezado y pie de página dinámico
    let pageNumber = 0;
    const addHeaderAndFooter = () => {
      pageNumber++;
      doc.fontSize(10).text(`Página ${pageNumber}`, 60, 20, {
        align: "center",
        width: 612, // Ancho de una hoja tamaño carta en puntos (8.5 pulgadas * 72 puntos por pulgada)
      });
      doc.text("PERECO.TXT", { align: "center" });
    };

    doc.on("pageAdded", addHeaderAndFooter);

    // Primera página
    doc.margins = { top: 72, bottom: 72, left: 60, right: 40 };
    addHeaderAndFooter();

    doc.text(currentDate, { align: "right" });
    doc.text("GOBIERNO DEL ESTADO DE OAXACA", { align: "center" });
    doc.text("SECRETARÍA DE ADMINISTRACIÓN", { align: "center" });
    doc.text("DIRECCIÓN DE RECURSOS HUMANOS", { align: "center" });
    doc.text("DEPARTAMENTO DE REGISTROS DE PERSONAL", { align: "center" });
    doc.moveDown();
    doc.text("REPORTE DE: PERMISOS ECONÓMICOS", { align: "center" });
    doc.moveDown();
    doc.text(
      `PERIODO DE CAPTURA DEL : ${FECHA_CAPTURA_INICIAL_INVERTIDA} AL ${FECHA_CAPTURA_FINAL_INVERTIDA}`,
      { align: "center" }
    );
    doc.moveDown();

    // Agrupar por PROYECTO
    const proyectosAgrupados = economicos_quincena.reduce((acc, permiso) => {
      const { PROYECTO } = permiso;
      if (!acc[PROYECTO]) {
        acc[PROYECTO] = [];
      }
      acc[PROYECTO].push(permiso);
      return acc;
    }, {});

    // Generar tablas por cada proyecto
    Object.keys(proyectosAgrupados).forEach((proyecto) => {
      const unidadResponsable = unidades_responsables.find(
        (unidad) => unidad.PROYECTO === proyecto
      );
      const unidadResponsableNombre = unidadResponsable
        ? ` - ${unidadResponsable.UNIDAD_RESPONSABLE}`
        : "";
      doc.text(`PROYECTO: ${proyecto}${unidadResponsableNombre}`, {
        align: "left",
      });
      doc.text(
        "---------------------------------------------------------------------------------------"
      ),
        { align: "center" };
      doc.text(
        "R.F.C             N O M B R E                      CATG.        DESDE     HASTA   #DÍAS",
        { align: "right" }
      );
      doc.text(
        "---------------------------------------------------------------------------------------",
        { align: "center" }
      );

      proyectosAgrupados[proyecto].forEach((permiso) => {
        const { RFC, NOMBRE, CLAVECAT, DESDE, HASTA, NUM_DIAS } = permiso;
        const truncatedName =
          NOMBRE.length > 30 ? NOMBRE.substring(0, 30) : NOMBRE;
        const formatFecha = (fecha) => {
          const [year, month, day] = fecha.split("-");
          return `${day}-${month}-${year}`;
        };

        doc.text(
          `${RFC.padEnd(14)} ${truncatedName.padEnd(30)}      ${CLAVECAT.padEnd(
            10
          )} ${formatFecha(DESDE).padEnd(10)} ${formatFecha(HASTA).padEnd(
            10
          )}  ${NUM_DIAS.toString().padStart(2)}`
        ),
          { align: "rigth" };
      });

      const totalDias = proyectosAgrupados[proyecto].reduce(
        (sum, permiso) => sum + permiso.NUM_DIAS,
        0
      );
      const uniquePersons = new Set(
        proyectosAgrupados[proyecto].map((permiso) => permiso.RFC)
      );
      doc.text(
        "---------------------------------------------------------------------------------------"
      );

      doc.text(
        `PERSONAS POR PROYECTO: ${uniquePersons.size}                                TOTAL DE DIAS POR PROYECTO: ${totalDias}`,
        {
          align: "center",
        }
      );
    });
    doc.moveDown();
    // Calcular el total general de personas y días
    const totalGeneralDias = economicos_quincena.reduce(
      (sum, permiso) => sum + permiso.NUM_DIAS,
      0
    );
    const totalGeneralPersonas = new Set(
      economicos_quincena.map((permiso) => permiso.RFC)
    ).size;
    doc.text(
      "---------------------------------------------------------------------------------------",
      { align: "center" }
    );
    doc.text(
      `TOTAL GENERAL DE PERSONAS: ${totalGeneralPersonas}                                 TOTAL GENERAL DE DÍAS: ${totalGeneralDias}`,
      { align: "center" }
    );

    doc.text(
      "---------------------------------------------------------------------------------------- ",
      { align: "center" }
    );
    doc.moveDown(6);

    doc.text("L.A LAURA CONCEPCIÓN MARTÍNEZ GUTIERREZ", { align: "center" });
    doc.text("JEFA DEL DEPARTAMENTO DE RECURSOS HUMANOS", { align: "center" });
    doc.end();
  } catch (error) {
    console.error("Error al crear el archivo:", error.message);
    res.status(500).json({ message: "Error al generar el reporte." });
  }
};
reportesIncidenciasController.printIncidenciasCentral = async (req, res) => {
  const quin = req.query.quincena || req.params.quincena;
  const excludedProjects = [
    "1140041480100000220",
    "1140041480100000222",
    "1140041480100000223",
    "1140041480100000227",
    "1140041480100000226",
    "1140041480100000230",
    "1140041480100000231",
    "1140041480100000232",
    "1140041480100000233",
    "1140041480100000234",
  ];

  const incidencias_central = await query("INCIDENCIAS", {
    QUINCENA: parseInt(quin, 10),
  });

  // Filtrar resultados para excluir los proyectos especificados
  const filteredIncidencias = incidencias_central.filter(
    (incidencia) => !excludedProjects.includes(incidencia.PROYECTO)
  );
  console.log(filteredIncidencias);
  const doc = new PDFDocument();

  if (filteredIncidencias.length === 0) {
    return res.status(404).json({
      message: "No se encontraron datos para la quincena especificada.",
    });
  }

  const filePath = path.join(
    __dirname,
    `../../docs/reportes/incidencias_central/INCIDENCIAS${quin}.pdf`
  );

  try {
    const stream = fs.createWriteStream(filePath);

    stream.on("error", (err) => {
      console.error("Error al escribir el archivo:", err.message);
      res.status(500).json({ message: "Error al generar el reporte." });
      doc.end();
    });

    stream.on("finish", () => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=INCIDENCIAS_CENTRAL_${quin}.pdf`
      );
      res.download(filePath, `INCIDENCIAS_CENTRAL_${quin}.pdf`, (err) => {
        if (err) {
          console.error("Error al descargar el archivo:", err.message);
          res.status(500).json({ message: "Error al descargar el archivo." });
        }
      });
    });

    doc.pipe(stream);

    // Registrar fuente personalizada
    doc.registerFont("Consolas", fontPath);
    doc.font("Consolas").fontSize(10);

    const currentDate = new Date().toLocaleDateString("es-MX");

    const getPeriodoFromQuincena = (quincena) => {
      const monthNames = [
        "ENERO",
        "FEBRERO",
        "MARZO",
        "ABRIL",
        "MAYO",
        "JUNIO",
        "JULIO",
        "AGOSTO",
        "SEPTIEMBRE",
        "OCTUBRE",
        "NOVIEMBRE",
        "DICIEMBRE",
      ];
      const year = new Date().getFullYear();
      const month = Math.ceil(quincena / 2);
      const isFirstHalf = quincena % 2 !== 0;

      const startDay = isFirstHalf ? "01" : "16";
      const endDay = isFirstHalf
        ? "15"
        : month === 2
        ? new Date(year, 1, 29).getDate() === 29
          ? "29"
          : "28"
        : new Date(year, month, 0).getDate();

      return `CORRESPONDIENTE AL PERIODO DEL ${startDay} DE ${
        monthNames[month - 1]
      } AL ${endDay} DE ${monthNames[month - 1]} DE ${year}`;
    };

    const periodo = getPeriodoFromQuincena(parseInt(quin, 10));
    // Agregar encabezado y pie de página dinámico
    let pageNumber = 0;
    const addHeaderAndFooter = () => {
      pageNumber++;
      doc.fontSize(10).text(`Página ${pageNumber}`, 60, 20, {
        align: "right",
        width: 612, // Ancho de una hoja tamaño carta en puntos (8.5 pulgadas * 72 puntos por pulgada)
      });
      doc.text(currentDate, { align: "right" });
      doc.text("GOBIERNO DEL ESTADO DE OAXACA", { align: "center" });
      doc.text("SECRETARÍA DE ADMINISTRACIÓN", { align: "center" });
      doc.text("DIRECCIÓN DE RECURSOS HUMANOS", { align: "center" });
      doc.text("DEPARTAMENTO DE REGISTROS DE PERSONAL", { align: "center" });
      doc.text(`PÁGINA ${pageNumber}`, { align: "center" });
      doc.text("REPORTE DE: INCIDENCIAS CENTRAL", { align: "center" });
      doc.text(periodo, { align: "center" });
      doc.moveDown(0.5); // Reducir espacio entre encabezado y filas
    };

    doc.on("pageAdded", addHeaderAndFooter);

    // Primera página
    doc.margins = { top: 72, bottom: 72, left: 60, right: 40 };
    addHeaderAndFooter();

    // Agregar contenido al documento

    doc.moveDown();

    // Determinar días del periodo
    const isFirstHalf = periodo.includes("01 DE");
    const daysInPeriod = isFirstHalf
      ? Array.from({ length: 15 }, (_, i) =>
          (i + 1).toString().padStart(2, "0")
        )
      : Array.from(
          {
            length:
              new Date(
                new Date().getFullYear(),
                parseInt(quin / 2),
                0
              ).getDate() - 15,
          },
          (_, i) => (i + 16).toString().padStart(2, "0")
        );

    // Encabezado de la tabla
    const tableHeaders = [
      "TAR.",
      "N O M B R E\nTIPO DE RELACIÓN LABORAL",
      "HORARIO",
      ...daysInPeriod,
    ];
    const columnWidths = [50, 150, 60, ...Array(daysInPeriod.length).fill(20)];
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const headerHeight = 30;
    const rowHeight = headerHeight * 1;
    const maxTableWidth = 550;
    const scaleFactor =
      tableWidth > maxTableWidth ? maxTableWidth / tableWidth : 1;

    // Dibujar encabezados sin bordes
    let x = 30;
    let y = doc.y;
    tableHeaders.forEach((header, index) => {
      doc.text(header, x + 5, y + 5, {
        width: columnWidths[index] * scaleFactor,
        align: "left",
      });
      x += columnWidths[index] * scaleFactor;
    });

    // Dibujar filas con datos, limitando a 17 filas por página
    let rowCount = 0;
    filteredIncidencias.forEach((incidencia) => {
      if (rowCount === 17) {
        doc.addPage();

        y = doc.y;
        rowCount = 0;

        // Dibujar encabezados nuevamente en la nueva página
        x = 30;
        tableHeaders.forEach((header, index) => {
          doc.text(header, x + 5, y + 5, {
            width: columnWidths[index] * scaleFactor,
            align: "left",
          });
          x += columnWidths[index] * scaleFactor;
        });
      }

      x = 30;
      y += rowHeight;

      const { NUMTARJETA, HORARIO, NOMBRE, TIPONOM, INCIDENCIAS } = incidencia;
      const replaceIncidenciasValue = (value) => {
        // Reemplazar el valor de la incidencia según sea necesario
        const replacements = {
          A: "F",
          B: "FR",
          E: "RM",
          V: "MD",
          // Agregar más reemplazos según sea necesario
        };
        return replacements[value] || value;
      };

      const replaceTiponomValue = (value) => {
        const replacements = {
          M51: "BASE",
          F51: "BASE",
          FCT: "CONTRATO CONFIANZA",
          CCT: "CONTRATO CONFIANZA",
          FCO: "NOMBRAMIENTO CONFIANZA",
          511: "NOMBRAMIENTO CONFIANZA",
          F53: "CONTRATO",
          M53: "CONTRATO",
          MMS: "MANDOS MEDIOS",
          FMM: "MANDOS MEDIOS",
        };
        return replacements[value] || value;
      };

      const rowData = [
        NUMTARJETA,
        `${
          NOMBRE.length > 24 ? NOMBRE.substring(0, 24) + "." : NOMBRE
        }\n${replaceTiponomValue(TIPONOM)}`,
        HORARIO ? HORARIO.split(".")[0] : "", // Si HORARIO es null, usar ""
        ...daysInPeriod.map((day) =>
          INCIDENCIAS && INCIDENCIAS[day]
            ? replaceIncidenciasValue(INCIDENCIAS[day])
            : ""
        ),
      ];

      rowData.forEach((data, index) => {
        doc.rect(x, y, columnWidths[index] * scaleFactor, rowHeight).stroke();
        doc.text(data, x + 5, y + 5, {
          width: columnWidths[index] * scaleFactor,
          align: index === 0 ? "left" : "",
        });
        x += columnWidths[index] * scaleFactor;
      });

      rowCount++;
    });
    doc.moveDown(2);
    doc.text("ACOTACIONES:", 30, y + rowHeight + 10);
    doc.text("F = FALTA", 30, y + rowHeight + 25);
    doc.text("FR = FALTA POR RETARDO ", 100, y + rowHeight + 25);
    doc.text("RM = RETARDO MATUTINO", 250, y + rowHeight + 25);
    doc.text("MD = MEDIA DÍA", 450, y + rowHeight + 25);

    doc.end();
  } catch (error) {
    console.error("Error al crear el archivo:", error.message);
    res.status(500).json({ message: "Error al generar el reporte." });
  }
};
reportesIncidenciasController.printIncidenciasAuditoria = async (req, res) => {
  const quin = req.query.quincena || req.params.quincena;
  const includedProjects = [
    "1140041480100000220",
    "1140041480100000222",
    "1140041480100000223",
    "1140041480100000227",
    "1140041480100000226",
    "1140041480100000230",
    "1140041480100000231",
    "1140041480100000232",
    "1140041480100000233",
    "1140041480100000234",
  ];

  const incidencias_auditoria = await query("INCIDENCIAS", {
    QUINCENA: parseInt(quin, 10),
  });

  // Filtrar resultados para incluir solo los proyectos especificados
  const filteredIncidencias = incidencias_auditoria.filter((incidencia) =>
    includedProjects.includes(incidencia.PROYECTO)
  );
  console.log(filteredIncidencias);
  const doc = new PDFDocument();

  if (filteredIncidencias.length === 0) {
    return res.status(404).json({
      message: "No se encontraron datos para la quincena especificada.",
    });
  }

  const filePath = path.join(
    __dirname,
    `../../docs/reportes/incidencias_auditoria/INCIDENCIAS${quin}.pdf`
  );

  try {
    const stream = fs.createWriteStream(filePath);

    stream.on("error", (err) => {
      console.error("Error al escribir el archivo:", err.message);
      res.status(500).json({ message: "Error al generar el reporte." });
      doc.end();
    });

    stream.on("finish", () => {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=INCIDENCIAS_AUDITORIA_${quin}.pdf`
      );
      res.download(filePath, `INCIDENCIAS_AUDITORIA_${quin}.pdf`, (err) => {
        if (err) {
          console.error("Error al descargar el archivo:", err.message);
          res.status(500).json({ message: "Error al descargar el archivo." });
        }
      });
    });

    doc.pipe(stream);

    // Registrar fuente personalizada
    doc.registerFont("Consolas", fontPath);
    doc.font("Consolas").fontSize(10);

    const currentDate = new Date().toLocaleDateString("es-MX");

    const getPeriodoFromQuincena = (quincena) => {
      const monthNames = [
        "ENERO",
        "FEBRERO",
        "MARZO",
        "ABRIL",
        "MAYO",
        "JUNIO",
        "JULIO",
        "AGOSTO",
        "SEPTIEMBRE",
        "OCTUBRE",
        "NOVIEMBRE",
        "DICIEMBRE",
      ];
      const year = new Date().getFullYear();
      const month = Math.ceil(quincena / 2);
      const isFirstHalf = quincena % 2 !== 0;

      const startDay = isFirstHalf ? "01" : "16";
      const endDay = isFirstHalf
        ? "15"
        : month === 2
        ? new Date(year, 1, 29).getDate() === 29
          ? "29"
          : "28"
        : new Date(year, month, 0).getDate();

      return `CORRESPONDIENTE AL PERIODO DEL ${startDay} DE ${
        monthNames[month - 1]
      } AL ${endDay} DE ${monthNames[month - 1]} DE ${year}`;
    };

    const periodo = getPeriodoFromQuincena(parseInt(quin, 10));
    // Agregar encabezado y pie de página dinámico
    let pageNumber = 0;
    const addHeaderAndFooter = () => {
      pageNumber++;
      doc.fontSize(10).text(`Página ${pageNumber}`, 60, 20, {
        align: "right",
        width: 612, // Ancho de una hoja tamaño carta en puntos (8.5 pulgadas * 72 puntos por pulgada)
      });
      doc.text(currentDate, { align: "right" });
      doc.text("GOBIERNO DEL ESTADO DE OAXACA", { align: "center" });
      doc.text("SECRETARÍA DE ADMINISTRACIÓN", { align: "center" });
      doc.text("DIRECCIÓN DE RECURSOS HUMANOS", { align: "center" });
      doc.text("DEPARTAMENTO DE REGISTROS DE PERSONAL", { align: "center" });
      doc.text(`PÁGINA ${pageNumber}`, { align: "center" });
      doc.text("REPORTE DE: INCIDENCIAS AUDITORÍA", { align: "center" });
      doc.text(periodo, { align: "center" });
      doc.moveDown(0.5); // Reducir espacio entre encabezado y filas
    };

    doc.on("pageAdded", addHeaderAndFooter);

    // Primera página
    doc.margins = { top: 72, bottom: 72, left: 60, right: 40 };
    addHeaderAndFooter();

    // Agregar contenido al documento

    doc.moveDown();

    // Determinar días del periodo
    const isFirstHalf = periodo.includes("01 DE");
    const daysInPeriod = isFirstHalf
      ? Array.from({ length: 15 }, (_, i) =>
          (i + 1).toString().padStart(2, "0")
        )
      : Array.from(
          {
            length:
              new Date(
                new Date().getFullYear(),
                parseInt(quin / 2),
                0
              ).getDate() - 15,
          },
          (_, i) => (i + 16).toString().padStart(2, "0")
        );

    // Encabezado de la tabla
    const tableHeaders = [
      "TAR.",
      "N O M B R E\nTIPO DE RELACIÓN LABORAL",
      "HORARIO",
      ...daysInPeriod,
    ];
    const columnWidths = [50, 150, 60, ...Array(daysInPeriod.length).fill(20)];
    const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const headerHeight = 30;
    const rowHeight = headerHeight * 1;
    const maxTableWidth = 550;
    const scaleFactor =
      tableWidth > maxTableWidth ? maxTableWidth / tableWidth : 1;

    // Dibujar encabezados sin bordes
    let x = 30;
    let y = doc.y;
    tableHeaders.forEach((header, index) => {
      doc.text(header, x + 5, y + 5, {
        width: columnWidths[index] * scaleFactor,
        align: "left",
      });
      x += columnWidths[index] * scaleFactor;
    });

    // Dibujar filas con datos, limitando a 17 filas por página
    let rowCount = 0;
    filteredIncidencias.forEach((incidencia) => {
      if (rowCount === 17) {
        doc.addPage();

        y = doc.y;
        rowCount = 0;

        // Dibujar encabezados nuevamente en la nueva página
        x = 30;
        tableHeaders.forEach((header, index) => {
          doc.text(header, x + 5, y + 5, {
            width: columnWidths[index] * scaleFactor,
            align: "left",
          });
          x += columnWidths[index] * scaleFactor;
        });
      }

      x = 30;
      y += rowHeight;

      const { NUMTARJETA, HORARIO, NOMBRE, TIPONOM, INCIDENCIAS } = incidencia;
      const replaceIncidenciasValue = (value) => {
        // Reemplazar el valor de la incidencia según sea necesario
        const replacements = {
          A: "F",
          B: "FR",
          E: "RM",
          V: "MD",
          // Agregar más reemplazos según sea necesario
        };
        return replacements[value] || value;
      };

      const replaceTiponomValue = (value) => {
        const replacements = {
          M51: "BASE",
          F51: "BASE",
          FCT: "CONTRATO CONFIANZA",
          CCT: "CONTRATO CONFIANZA",
          FCO: "NOMBRAMIENTO CONFIANZA",
          511: "NOMBRAMIENTO CONFIANZA",
          F53: "CONTRATO",
          M53: "CONTRATO",
          MMS: "MANDOS MEDIOS",
          FMM: "MANDOS MEDIOS",
        };
        return replacements[value] || value;
      };

      const rowData = [
        NUMTARJETA,
        `${
          NOMBRE.length > 24 ? NOMBRE.substring(0, 24) + "." : NOMBRE
        }\n${replaceTiponomValue(TIPONOM)}`,
        HORARIO ? HORARIO.split(".")[0] : "", // Si HORARIO es null, usar ""
        ...daysInPeriod.map((day) =>
          INCIDENCIAS && INCIDENCIAS[day]
            ? replaceIncidenciasValue(INCIDENCIAS[day])
            : ""
        ),
      ];

      rowData.forEach((data, index) => {
        doc.rect(x, y, columnWidths[index] * scaleFactor, rowHeight).stroke();
        doc.text(data, x + 5, y + 5, {
          width: columnWidths[index] * scaleFactor,
          align: index === 0 ? "left" : "",
        });
        x += columnWidths[index] * scaleFactor;
      });

      rowCount++;
    });
    doc.moveDown(2);
    doc.text("ACOTACIONES:", 30, y + rowHeight + 10);
    doc.text("F = FALTA", 30, y + rowHeight + 25);
    doc.text("FR = FALTA POR RETARDO ", 100, y + rowHeight + 25);
    doc.text("RM = RETARDO MATUTINO", 250, y + rowHeight + 25);
    doc.text("MD = MEDIA DÍA", 450, y + rowHeight + 25);

    doc.end();
  } catch (error) {
    console.error("Error al crear el archivo:", error.message);
    res.status(500).json({ message: "Error al generar el reporte." });
  }
};
reportesIncidenciasController.printInasistenciasCentral = async (req, res) => {
  const quin = req.query.quincena || req.params.quincena;
  const unidades_responsables = await querysql(
    "SELECT * FROM unidad_responsable"
  );
  const excludedProjects = [
    "1140041480100000220",
    "1140041480100000222",
    "1140041480100000223",
    "1140041480100000227",
    "1140041480100000226",
    "1140041480100000230",
    "1140041480100000231",
    "1140041480100000232",
    "1140041480100000233",
    "1140041480100000234",
  ];
  const inasistencias_central = await query("INCIDENCIAS", {
    QUINCENA: parseInt(quin, 10),
  });

  // Filtrar resultados para excluir los proyectos especificados
  const filteredInasistencias = inasistencias_central.filter(
    (inasistencia) => !excludedProjects.includes(inasistencia.PROYECTO)
  );

  if (filteredInasistencias.length === 0) {
    return res.status(404).json({
      message: "No se encontraron datos para la quincena especificada.",
    });
  }

  // Filtrar por TIPONOM y crear sus respectivos arrays
  const tiponomGroups = {
    M51: { label: "BASE CENTRAL", data: [] },
    F51: { label: "BASE FORÁNEA", data: [] },
    CCT: { label: "CONTRATO CONFIANZA CENTRAL", data: [] },
    FCT: { label: "CONTRATO CONFIANZA FORÁNEO", data: [] },
    511: { label: "NOMBRAMIENTO CONFIANZA CENTRAL", data: [] },
    FCO: { label: "NOMBRAMIENTO CONFIANZA FORÁNEO", data: [] },
    M53: { label: "CONTRATO CENTRAL", data: [] },
    F53: { label: "CONTRATO FORÁNEO", data: [] },
    MMS: { label: "MANDOS MEDIOS CENTRAL", data: [] },
    FMM: { label: "MANDOS MEDIOS FORÁNEOS", data: [] },
  };

  filteredInasistencias.forEach((inasistencia) => {
    if (tiponomGroups[inasistencia.TIPONOM]) {
      tiponomGroups[inasistencia.TIPONOM].data.push(inasistencia);
    }
  });

  const currentDate = new Date().toLocaleDateString("es-MX");

  const getPeriodoFromQuincena = (quincena) => {
    const monthNames = [
      "ENERO",
      "FEBRERO",
      "MARZO",
      "ABRIL",
      "MAYO",
      "JUNIO",
      "JULIO",
      "AGOSTO",
      "SEPTIEMBRE",
      "OCTUBRE",
      "NOVIEMBRE",
      "DICIEMBRE",
    ];
    const year = new Date().getFullYear();
    const month = Math.ceil(quincena / 2);
    const isFirstHalf = quincena % 2 !== 0;

    const startDay = isFirstHalf ? "01" : "16";
    const endDay = isFirstHalf
      ? "15"
      : month === 2
      ? new Date(year, 1, 29).getDate() === 29
        ? "29"
        : "28"
      : new Date(year, month, 0).getDate();

    return `CORRESPONDIENTE AL PERIODO DEL ${startDay} DE ${
      monthNames[month - 1]
    } AL ${endDay} DE ${monthNames[month - 1]} DE ${year}`;
  };

  const periodo = getPeriodoFromQuincena(parseInt(quin, 10));

  const doc = new PDFDocument();
  const filePath = path.join(
    __dirname,
    `../../docs/reportes/inasistencias_central/INASISTENCIAS_CENTRAL_${quin}.pdf`
  );

  const stream = fs.createWriteStream(filePath);

  stream.on("error", (err) => {
    console.error("Error al escribir el archivo:", err.message);
    doc.end();
  });

  stream.on("finish", () => {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=INASISTENCIAS_CENTRAL_${quin}.pdf`
    );
    res.download(filePath, `INASISTENCIAS_CENTRAL_${quin}.pdf`, (err) => {
      if (err) {
        console.error("Error al descargar el archivo:", err.message);
        res.status(500).json({ message: "Error al descargar el archivo." });
      }
    });
  });

  doc.pipe(stream);

  // Registrar fuente personalizada
  doc.registerFont("Consolas", fontPath);
  doc.font("Consolas").fontSize(10);

  // Agregar encabezado y pie de página dinámico
  let pageNumber = 0;

  const addHeaderAndFooter = (groupName) => {
    doc.fontSize(10).text(`Página ${pageNumber}`, 60, 20, {
      align: "right",
      width: 612,
    });
    pageNumber++;
    doc.text(currentDate, { align: "right" });
    doc.text("GOBIERNO DEL ESTADO DE OAXACA", { align: "center" });
    doc.text("SECRETARÍA DE ADMINISTRACIÓN", { align: "center" });
    doc.text("DIRECCIÓN DE RECURSOS HUMANOS", { align: "center" });
    doc.text("DEPARTAMENTO DE REGISTROS DE PERSONAL", { align: "center" });
    doc.text(`PÁGINA ${pageNumber}`, { align: "center" });
    doc.text("REPORTE DE RETARDOS E INASISTENCIAS  ", {
      align: "center",
    });
    doc.text(periodo, { align: "center" });
    doc.moveDown(2);
  };

  // Primera página
  doc.margins = { top: 72, bottom: 72, left: 60, right: 40 };

  // Agregar contenido por cada grupo
  Object.entries(tiponomGroups).forEach(([tiponom, group]) => {
    if (group.data.length > 0) {
      if (pageNumber > 0) doc.addPage(); // Agregar nueva página si no es la primera
      addHeaderAndFooter(group.label);
      doc.text(`NÓMINA: ${group.label} (${tiponom})`, { align: "left" });
      doc.text(
        "---------------------------------------------------------------------------------------",
        { align: "center" }
      );
      doc.text(
        "R.F.C           N O M B R E                          RETARDOS            INASISTENCIAS",
        { align: "left" }
      );
      doc.text(
        "---------------------------------------------------------------------------------------",
        { align: "center" }
      );
      doc.moveDown(0.5);

      // Agrupar por PROYECTO dentro del grupo actual
      const proyectosAgrupados = group.data.reduce((acc, inasistencia) => {
        const { PROYECTO } = inasistencia;
        if (!acc[PROYECTO]) {
          acc[PROYECTO] = [];
        }
        acc[PROYECTO].push(inasistencia);
        return acc;
      }, {});

      // Generar tablas por cada proyecto
      Object.keys(proyectosAgrupados).forEach((proyecto) => {
        const unidadResponsable = unidades_responsables.find(
          (unidad) => unidad.PROYECTO === proyecto
        );
        const unidadResponsableNombre = unidadResponsable
          ? ` - ${unidadResponsable.OBRA_ACTIVIDAD}`
          : "";
        doc.text(`PROYECTO: ${proyecto}${unidadResponsableNombre}`, {
          align: "left",
        });
        doc.moveDown(0.5);
        proyectosAgrupados[proyecto].forEach((inasistencia) => {
          const { RFC, NOMBRE, CONTADORES_REPORTE } = inasistencia;
          const truncatedName =
            NOMBRE.length > 30 ? NOMBRE.substring(0, 30) : NOMBRE;
          let RETARDOS = CONTADORES_REPORTE?.RETARDOS || 0;
          let INASISTENCIAS = CONTADORES_REPORTE?.INASISTENCIAS || 0;

          // Convert to string and add .0 if it's an integer
          RETARDOS = Number.isInteger(RETARDOS)
            ? `${RETARDOS}.0`
            : RETARDOS.toString();
          INASISTENCIAS = Number.isInteger(INASISTENCIAS)
            ? `${INASISTENCIAS}.0`
            : INASISTENCIAS.toString();

          const retardosText = RETARDOS === "0.0" ? "" : RETARDOS;
          const inasistenciasText =
            INASISTENCIAS === "0.0" ? "" : INASISTENCIAS;

          doc.text(
            `${RFC.padEnd(14)} ${truncatedName.padEnd(
              30
            )}     ${retardosText.padStart(
              10
            )}     ${inasistenciasText.padStart(15)}`,
            { align: "left" }
          );
        });
        doc.text(
          "---------------------------------------------------------------------------------------",
          { align: "center" }
        );

        doc.moveDown();
      });
      doc.text(`TOTAL EMPLEADOS: ${group.data.length}`, { align: "left" });

      // Agregar firma al final de cada grupo
      doc.moveDown(6);
      doc.text("L.A. LAURA CONCEPCIÓN MARTÍNEZ GUTIERREZ", {
        align: "center",
      });
      doc.text("JEFA DEL DEPTO DE RECURSOS HUMANOS", { align: "center" });
    }
  });

  doc.end();
};
reportesIncidenciasController.printInasistenciasAuditoria = async (
  req,
  res
) => {
  const quin = req.query.quincena || req.params.quincena;
  const unidades_responsables = await querysql(
    "SELECT * FROM unidad_responsable"
  );
  const includedProjects = [
    "1140041480100000220",
    "1140041480100000222",
    "1140041480100000223",
    "1140041480100000227",
    "1140041480100000226",
    "1140041480100000230",
    "1140041480100000231",
    "1140041480100000232",
    "1140041480100000233",
    "1140041480100000234",
  ];
  const inasistencias_auditoria = await query("INCIDENCIAS", {
    QUINCENA: parseInt(quin, 10),
  });

  // Filtrar resultados para incluir solo los proyectos especificados
  const filteredInasistencias = inasistencias_auditoria.filter((inasistencia) =>
    includedProjects.includes(inasistencia.PROYECTO)
  );

  if (filteredInasistencias.length === 0) {
    return res.status(404).json({
      message: "No se encontraron datos para la quincena especificada.",
    });
  }

  // Filtrar por TIPONOM y crear sus respectivos arrays
  const tiponomGroups = {
    F51: { label: "BASE FORÁNEA", data: [] },
    M51: { label: "BASE CENTRAL", data: [] },
    FCT: { label: "CONTRATO CONFIANZA FORÁNEO", data: [] },
    CCT: { label: "CONTRATO CONFIANZA CENTRAL", data: [] },
    FCO: { label: "NOMBRAMIENTO CONFIANZA FORÁNEO", data: [] },
    511: { label: "NOMBRAMIENTO CONFIANZA CENTRAL", data: [] },
    F53: { label: "CONTRATO FORÁNEO", data: [] },
    M53: { label: "CONTRATO CENTRAL", data: [] },
    FMM: { label: "MANDOS MEDIOS FORÁNEOS", data: [] },
    MMS: { label: "MANDOS MEDIOS CENTRAL", data: [] },
  };

  filteredInasistencias.forEach((inasistencia) => {
    if (tiponomGroups[inasistencia.TIPONOM]) {
      tiponomGroups[inasistencia.TIPONOM].data.push(inasistencia);
    }
  });

  const currentDate = new Date().toLocaleDateString("es-MX");

  const getPeriodoFromQuincena = (quincena) => {
    const monthNames = [
      "ENERO",
      "FEBRERO",
      "MARZO",
      "ABRIL",
      "MAYO",
      "JUNIO",
      "JULIO",
      "AGOSTO",
      "SEPTIEMBRE",
      "OCTUBRE",
      "NOVIEMBRE",
      "DICIEMBRE",
    ];
    const year = new Date().getFullYear();
    const month = Math.ceil(quincena / 2);
    const isFirstHalf = quincena % 2 !== 0;

    const startDay = isFirstHalf ? "01" : "16";
    const endDay = isFirstHalf
      ? "15"
      : month === 2
      ? new Date(year, 1, 29).getDate() === 29
        ? "29"
        : "28"
      : new Date(year, month, 0).getDate();

    return `CORRESPONDIENTE AL PERIODO DEL ${startDay} DE ${
      monthNames[month - 1]
    } AL ${endDay} DE ${monthNames[month - 1]} DE ${year}`;
  };

  const periodo = getPeriodoFromQuincena(parseInt(quin, 10));

  const doc = new PDFDocument();
  const filePath = path.join(
    __dirname,
    `../../docs/reportes/inasistencias_auditoria/INASISTENCIAS_AUDITORIA_${quin}.pdf`
  );

  const stream = fs.createWriteStream(filePath);

  stream.on("error", (err) => {
    console.error("Error al escribir el archivo:", err.message);
    doc.end();
  });

  stream.on("finish", () => {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=INASISTENCIAS_AUDITORIA_${quin}.pdf`
    );
    res.download(filePath, `INASISTENCIAS_AUDITORIA_${quin}.pdf`, (err) => {
      if (err) {
        console.error("Error al descargar el archivo:", err.message);
        res.status(500).json({ message: "Error al descargar el archivo." });
      }
    });
  });

  doc.pipe(stream);

  // Registrar fuente personalizada
  doc.registerFont("Consolas", fontPath);
  doc.font("Consolas").fontSize(10);

  // Agregar encabezado y pie de página dinámico
  let pageNumber = 0;

  const addHeaderAndFooter = (groupName) => {
    doc.fontSize(10).text(`Página ${pageNumber}`, 60, 20, {
      align: "right",
      width: 612,
    });
    pageNumber++;
    doc.text(currentDate, { align: "right" });
    doc.text("GOBIERNO DEL ESTADO DE OAXACA", { align: "center" });
    doc.text("SECRETARÍA DE ADMINISTRACIÓN", { align: "center" });
    doc.text("DIRECCIÓN DE RECURSOS HUMANOS", { align: "center" });
    doc.text("DEPARTAMENTO DE REGISTROS DE PERSONAL", { align: "center" });
    doc.text(`PÁGINA ${pageNumber}`, { align: "center" });
    doc.text("REPORTE DE RETARDOS E INASISTENCIAS  ", {
      align: "center",
    });
    doc.text(periodo, { align: "center" });
    doc.moveDown(2);
  };

  // Primera página
  doc.margins = { top: 72, bottom: 72, left: 60, right: 40 };

  // Agregar contenido por cada grupo
  Object.entries(tiponomGroups).forEach(([tiponom, group]) => {
    if (group.data.length > 0) {
      if (pageNumber > 0) doc.addPage(); // Agregar nueva página si no es la primera
      addHeaderAndFooter(group.label);
      doc.text(`NÓMINA: ${group.label} (${tiponom})`, { align: "left" });
      doc.text(
        "---------------------------------------------------------------------------------------",
        { align: "center" }
      );
      doc.text(
        "R.F.C           N O M B R E                          RETARDOS            INASISTENCIAS",
        { align: "left" }
      );
      doc.text(
        "---------------------------------------------------------------------------------------",
        { align: "center" }
      );
      doc.moveDown(0.5);

      // Agrupar por PROYECTO dentro del grupo actual
      const proyectosAgrupados = group.data.reduce((acc, inasistencia) => {
        const { PROYECTO } = inasistencia;
        if (!acc[PROYECTO]) {
          acc[PROYECTO] = [];
        }
        acc[PROYECTO].push(inasistencia);
        return acc;
      }, {});

      // Generar tablas por cada proyecto
      Object.keys(proyectosAgrupados).forEach((proyecto) => {
        const unidadResponsable = unidades_responsables.find(
          (unidad) => unidad.PROYECTO === proyecto
        );
        const unidadResponsableNombre = unidadResponsable
          ? ` - ${unidadResponsable.OBRA_ACTIVIDAD}`
          : "";
        doc.text(`PROYECTO: ${proyecto}${unidadResponsableNombre}`, {
          align: "left",
        });
        doc.moveDown(0.5);
        proyectosAgrupados[proyecto].forEach((inasistencia) => {
          const { RFC, NOMBRE, CONTADORES_REPORTE } = inasistencia;
          const truncatedName =
            NOMBRE.length > 30 ? NOMBRE.substring(0, 30) : NOMBRE;
          let RETARDOS = CONTADORES_REPORTE?.RETARDOS || 0;
          let INASISTENCIAS = CONTADORES_REPORTE?.INASISTENCIAS || 0;

          // Convert to string and add .0 if it's an integer
          RETARDOS = Number.isInteger(RETARDOS)
            ? `${RETARDOS}.0`
            : RETARDOS.toString();
          INASISTENCIAS = Number.isInteger(INASISTENCIAS)
            ? `${INASISTENCIAS}.0`
            : INASISTENCIAS.toString();

          const retardosText = RETARDOS === "0.0" ? "" : RETARDOS;
          const inasistenciasText =
            INASISTENCIAS === "0.0" ? "" : INASISTENCIAS;

          doc.text(
            `${RFC.padEnd(14)} ${truncatedName.padEnd(
              30
            )}     ${retardosText.padStart(
              10
            )}     ${inasistenciasText.padStart(15)}`,
            { align: "left" }
          );
        });
        doc.text(
          "---------------------------------------------------------------------------------------",
          { align: "center" }
        );

        doc.moveDown();
      });
      doc.text(`TOTAL EMPLEADOS: ${group.data.length}`, { align: "left" });

      // Agregar firma al final de cada grupo
      doc.moveDown(6);
      doc.text("L.A. LAURA CONCEPCIÓN MARTÍNEZ GUTIERREZ", {
        align: "center",
      });
      doc.text("JEFA DEL DEPTO DE RECURSOS HUMANOS", { align: "center" });
    }
  });

  doc.end();
};

reportesIncidenciasController.getDataPersonalizada = async (req, res) => {
  const { NOMBRE, SEXO, EDAD, TIPONOM, NOMCATE, ADSCRIPCION, STATUS_EMPLEADO, PRINT } = req.body;

  let filtro = {};
  if (SEXO) filtro.SEXO = SEXO;

  if (TIPONOM) {
    if (TIPONOM === "B") {
      filtro.TIPONOM = { $in: ["F51", "M51"] };
    } else if (TIPONOM === "CC") {
      filtro.TIPONOM = { $in: ["FCT", "CCT"] };
    } else if (TIPONOM === "NC") {
      filtro.TIPONOM = { $in: ["FCO", "511"] };
    } else if (TIPONOM === "MM") {
      filtro.TIPONOM = { $in: ["FMM", "MMS"] };
    }
  }
  if (NOMCATE) filtro.NOMCATE = NOMCATE;
  if (ADSCRIPCION) filtro.ADSCRIPCION = ADSCRIPCION;
  if (STATUS_EMPLEADO) {
    if (STATUS_EMPLEADO === "ACTIVO") {
      filtro["$or"] = [
        { "STATUS_EMPLEADO": null },
        { "STATUS_EMPLEADO.STATUS": null },
      ];
    } else {
      filtro["STATUS_EMPLEADO.STATUS"] = STATUS_EMPLEADO;
    }
  }
  filtro.status = 1;

  const employees = await query("PLANTILLA", filtro);

  if (!employees || employees.length === 0) {
    return res.status(202).json({ message: "No hay empleados con los filtros especificados" });
  }

  let empleadosFiltrados = employees;
  if (NOMBRE) {
    const nombreBuscado = NOMBRE.replace(/\s+/g, " ").trim().toLowerCase();
    empleadosFiltrados = employees.filter(emp => {
      const nombreCompleto = `${emp.APE_PAT} ${emp.APE_MAT} ${emp.NOMBRES}`.replace(/\s+/g, " ").trim().toLowerCase();
      return nombreCompleto.includes(nombreBuscado);
    });
  }
  if (EDAD) {
    const match = /^(\d+)\s*[aA]\s*(\d+)$/.exec(EDAD);

    if (match) {
      const minEdad = parseInt(match[1], 10);
      const maxEdad = parseInt(match[2], 10);

      const hoy = new Date();

      function calcularEdad(fechaNac) {
        const fecha = new Date(fechaNac);
        let edad = hoy.getFullYear() - fecha.getFullYear();
        const m = hoy.getMonth() - fecha.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < fecha.getDate())) {
          edad--;
        }
        return edad;
      }

      empleadosFiltrados = empleadosFiltrados.filter(emp => {
        if (!emp.FECHA_NAC || emp.FECHA_NAC === "" || emp.FECHA_NAC === "null") return false;

        const edad = calcularEdad(emp.FECHA_NAC);
        return edad >= minEdad && edad <= maxEdad;
      });
    }
  }

  empleadosFiltrados = empleadosFiltrados.map(emp => ({
    _id: emp._id,
    NOMBRE: `${emp.APE_PAT} ${emp.APE_MAT} ${emp.NOMBRES}`,
    SEXO: emp.SEXO,
    TIPONOM: emp.TIPONOM,
    NUMPLA: emp.NUMPLA,
    ADSCRIPCION: emp.ADSCRIPCION,
    NOMCATE: emp.NOMCATE,
    FECHA_NAC: emp.FECHA_NAC,
    STATUS_EMPLEADO: emp?.STATUS_EMPLEADO?.STATUS || ""
  }))
    .sort((a, b) => a.NOMBRE.localeCompare(b.NOMBRE));

  if (empleadosFiltrados.length === 0) {
    return res.status(202).json({ message: "No hay empleados con el nombre especificado" });
  }

  if (!PRINT) {
    res.status(202).json({ empleadosFiltrados });
  } else {
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ layout: "landscape", margin: 40 });

    const tipoNomMapping = {
      M51: "BASE FORÁNEA",
      F51: "BASE CENTRAL",
      FCT: "CONTRATO CONFIANZA FORANEO",
      CCT: "CONTRATO CONFIANZA CENTRAL",
      FCO: "NOMBRAMIENTO CONFIANZA FORANEO",
      511: "NOMBRAMIENTO CONFIANZA CENTRAL",
      F53: "CONTRATO FORÁNEO",
      M53: "CONTRATO CENTRAL",
      MMS: "MANDOS MEDIOS FORÁNEOS",
      FMM: "MANDOS MEDIOS CENTRAL",
    };

    const tipoStatusMapping = {
      COM_SDCL: "COMISIONADO AL SINCICATO",
      COM_LAB: "COMISIONADO LABORALMENTE",
      ASIG_LAB: "ASIGNADO LABORALMENTE",
      EXIMA: "EXIMA",
    };

    const rows = empleadosFiltrados.map((emp, i) => {
      let row = [
        `${i + 1}`,
        emp.NOMBRE,
        emp.SEXO === "H" ? "HOMBRE" : "MUJER",
        tipoNomMapping[emp.TIPONOM] ?? emp.TIPONOM,
        emp.NUMPLA || "",
        (emp.ADSCRIPCION || ""),
        (emp.NOMCATE || ""),
        tipoStatusMapping[emp?.STATUS_EMPLEADO] ?? "ACTIVO"
      ];
      return row;
    });

    const filePath = path.join(
      __dirname,
      `../../docs/reportes/personal/LISTA_PERSONAL.pdf`
    );

    try {
      const stream = fs.createWriteStream(filePath);

      stream.on("error", (err) => {
        console.error("Error al escribir el archivo:", err.message);
        res.status(500).json({ message: "Error al generar el reporte." });
        doc.end();
      });

      stream.on("finish", () => {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=LISTA_PERSONAL.pdf`
        );
        res.download(filePath, `LISTA_PERSONAL.pdf`, (err) => {
          if (err) {
            console.error("Error al descargar el archivo:", err.message);
            res.status(500).json({ message: "Error al descargar el archivo." });
          }
        });
      });

      doc.pipe(stream);

      doc.registerFont("Times-Roman", fontPath);
      doc.font("Times-Roman").fontSize(9);

      let pageNumber = 0;
      const addHeaderAndFooter = () => {
        pageNumber++;
        doc.fontSize(10).text(`PÁGINA ${pageNumber}`, 60, 20, { align: "right" });
        doc.fontSize(18).text("LISTA DE PERSONAL", { align: "center" });
        doc.fontSize(10);
        doc.fontSize(10).text(`TOTAL: ${empleadosFiltrados.length} ${empleadosFiltrados.length > 1 ? 'EMPLEADOS' : 'EMPLEADO'}`, 40, 50, { align: "left" });
        doc.fontSize(10);
      };

      doc.on("pageAdded", addHeaderAndFooter);

      doc.margins = { top: 72, bottom: 72, left: 60, right: 60 };
      addHeaderAndFooter();

      // --- TABLA MANUAL ---
      const headers = ["#", "NOMBRE", "SEXO", "NOMBRAMIENTO", "PLAZA", "ADSCRIPCIÓN", "PUESTO", "STATUS"];
      const columns = [30, 150, 40, 80, 40, 170, 100, 100];
      let y = doc.y + 10;
      const rowHeight = 18;

      let x = doc.page.margins.left;
      headers.forEach((header, i) => {
        // Dibuja el fondo
        doc.rect(x, y, columns[i], rowHeight).fillAndStroke("#9D2449", "#000000");
        // Cambia el color de texto a blanco
        doc.fillColor("#FFFFFF").text(header, x + 2, y + 4, { width: columns[i] - 4, align: "left" });
        // Regresa el color de texto a negro para el resto del documento
        doc.fillColor("#000000");
        x += columns[i];
      });
      y += rowHeight;

      // Dibuja filas
      for (let i = 0; i < rows.length; i++) {
        x = doc.page.margins.left;

        // Calcular el alto máximo de la fila
        const cellHeights = rows[i].map((cell, j) =>
          doc.heightOfString(String(cell), { width: columns[j] - 4, align: "left" }) + 4
        );
        const maxRowHeight = Math.max(...cellHeights, 18);

        // Salto de página si no cabe la fila
        if (y + maxRowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          y = doc.y + 10;
          // Redibuja encabezados
          let xh = doc.page.margins.left;
          headers.forEach((header, j) => {
            doc.rect(xh, y, columns[j], 18).fillAndStroke("#9D2449", "#000000");
            doc.fillColor("#FFFFFF").text(header, xh + 2, y + 4, { width: columns[j] - 4, align: "left" });
            doc.fillColor("#000000");
            xh += columns[j];
          });
          y += 18;
        }

        // Dibuja la fila
        rows[i].forEach((cell, j) => {
          // Si la fila es par, pinta el fondo
          if (i % 2 === 1) {
            doc.rect(x, y, columns[j], maxRowHeight).fillAndStroke("#f2f2f2", "#000000");
          } else {
            doc.rect(x, y, columns[j], maxRowHeight).stroke();
          }
          doc.fillColor("#000000").text(String(cell), x + 2, y + 4, { width: columns[j] - 4, align: "left" });
          x += columns[j];
        });
        y += maxRowHeight;
      }

      doc.end();

    } catch (error) {
      console.error("Error al crear el archivo:", error.message);
      res.status(500).json({ message: "Error al generar el reporte." });
    }
  }
}
module.exports = reportesIncidenciasController;
