const {
    query,
    deleteOne,
    insertOne,
    findById,
    updateOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const moment = require("moment");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const fontPath = path.join(__dirname, "../../assets/fonts/Consolas.ttf");
const fontPathArial = path.join(__dirname, "../../assets/fonts/arial.ttf");
const fontPathArialBlack = path.join(
    __dirname,
    "../../assets/fonts/ARIALBD 1.TTF",
);

const permisosExtController = {};

// Obtener perfil del empleado
permisosExtController.getProfile = async (req, res) => {
    const id = req.params.id;
    const user = req.user;

    try {
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
            hsy_proyectos,
            hsy_recategorizaciones,
            hsy_status,
        };

        // Buscar empleado en PLANTILLA y PLANTILLA_FORANEA
        const [employeePlantilla = [], employeeForanea = []] = await Promise.all([
            query("PLANTILLA", { _id: new ObjectId(id) }),
            query("PLANTILLA_FORANEA", { _id: new ObjectId(id) }),
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

        const permisosExt = await query("PERMISOS_EXT", {
            ID_CTRL_ASIST: new ObjectId(emp.ID_CTRL_ASIST) || [],
        });
        emp.historial = historial;

        const ASIST_PROFILE = {
            employee: [emp],
            permisosExt: permisosExt,
        };
        const currentDateTime = moment().format("YYYY-MM-DD HH:mm:ss");
        const userAction = {
            timestamp: currentDateTime,
            username: user.username,
            module: "AEI-PI",
            action: `CONSULTÓ EL PERFIL DE INCIDENCIAS DEL EMPLEADO "${emp.NOMBRES} ${emp.APE_PAT} ${emp.APE_MAT}"`,
        };
        await insertOne("USER_ACTIONS", userAction);

        res.send(ASIST_PROFILE);
    } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).send({ error: "An error occurred while fetching data" });
    }
};

permisosExtController.newExtPermit = async (req, res) => {
    const user = req.user;

    const {
        _id,
        TIPO,
        DESDE,
        HASTA,
        NUM_DIAS,
        OFICIO_SOLICITUD,
        OFICIO_AUTORIZACION,
        OBSERVACIONES,
        ID_CTRL_ASIST,
        NUMTARJETA,
    } = req.body;
    // Crear el nuevo registro de permiso extraordinario
    const extPermitData = {
        id_empoyee: _id,
        TIPO,
        DESDE,
        HASTA,
        NUM_DIAS,
        OFICIO_SOLICITUD,
        OFICIO_AUTORIZACION,
        OBSERVACIONES,
        ID_CTRL_ASIST: new ObjectId(ID_CTRL_ASIST),
        AÑO: moment(DESDE).year(),
    };
    const userAction = {
        username: user.username,
        module: "AEI-PEXT",
        action: `CREÓ UN NUEVO PERMISO EXTRAORDINARIO DEL EMPLEADO CON TARJETA "${NUMTARJETA}"`,
        timestamp: moment().format("YYYY-MM-DD HH:mm:ss"),
    };
    try {
        await insertOne("PERMISOS_EXT", extPermitData);
        res
            .status(200)
            .send({ message: "External permit created", data: extPermitData });
    } catch (error) {
        console.error("Error creating external permit:", error);
        res
            .status(500)
            .send({ error: "An error occurred while creating the external permit" });
    }
};

permisosExtController.updateExtPermit = async (req, res) => {
    const { _id, ...updateData } = req.body;

    try {
        const result = await query("PERMISOS_EXT", {
            _id: new ObjectId(_id),
        });

        if (!result || result.length === 0) {
            return res.status(404).send({ error: "External permit not found" });
        }

        await updateOne(
            "PERMISOS_EXT",
            { _id: new ObjectId(_id) },
            { $set: updateData }
        );
        res
            .status(200)
            .send({ message: "External permit updated successfully", data: result });
    } catch (error) {
        console.error("Error updating external permit:", error);
        const employee = result[0];
        res.status(500).send({
            error: "An error occurred while updating the external permit",
            _id: employee.id_empoyee,
        });
    }
};

permisosExtController.deleteExtPermit = async (req, res) => {
    const { id } = req.params;

    try {
        const permitData = await query("PERMISOS_EXT", {
            _id: new ObjectId(id),
        });
        const result = await deleteOne("PERMISOS_EXT", { _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).send({ error: "External permit not found" });
        }
        res
            .status(200)
            .send({ message: "External permit deleted", data: permitData[0] });
    } catch (error) {
        console.error("Error deleting external permit:", error);
        res.status(500).send({
            error: "An error occurred while deleting the external permit",
            data,
        });
    }
};

// Generar reporte de permisos extraordinarios
permisosExtController.printReport = async (req, res) => {
    const { _id } = req.body;
    const user = req.user;
    const currentDateTime = new Date().toLocaleString("en-US", {
        timeZone: "America/Mexico_City",
    });

    const permisosExt = await query("PERMISOS_EXT", { id_empoyee: _id });

    const [employeePlantilla = [], employeeForanea = []] = await Promise.all([
        query("PLANTILLA", { _id: new ObjectId(_id) }),
        query("PLANTILLA_FORANEA", { _id: new ObjectId(_id) }),
    ]);

    const employee = employeePlantilla.length
        ? employeePlantilla
        : employeeForanea.length
            ? employeeForanea
            : [];

    if (!employee || employee.length === 0) {
        res.status(404).send({ error: "Empleado no encontrado" });
        return;
    }

    const emp = employee[0];

    const tipoMapping = {
        LENP: "LICENCIA POR ENFERMEDAD NO PROFESIONAL",
        CUFA: "CUIDADOS DE UN FAMILIAR",
        CUMA: "CUIDADOS MATERNOS",
        PATE: "PATERNIDAD",
        FAFA: "FALLECIMIENTO DE UN FAMILIAR"
    };

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


    const rows = permisosExt.map((empRow, i) => ([
        `${i + 1}`,
        tipoMapping[empRow.TIPO] ?? empRow.TIPO,
        empRow.DESDE || "",
        empRow.HASTA || "",
        empRow.NUM_DIAS || "",
        empRow.OFICIO_SOLICITUD || "",
        empRow.OFICIO_AUTORIZACION || "",
        empRow.OBSERVACIONES || "",
    ]));

    const templateData = {
        NOMBRE_COMPLETO: `${emp.APE_PAT || ""} ${emp.APE_MAT || ""} ${emp.NOMBRES || ""}`.trim(),
        CURP: emp.CURP || "",
        RFC: emp.RFC || "",
        SEX: emp.SEXO || "",
        PHONE: emp.TEL_PERSONAL || "",
        NUMPLA: emp.NUMPLA || "",
        TJT: emp.NUMTARJETA || "",
        TIPONOM: tipoNomMapping[emp.TIPONOM] || emp.TIPONOM || "",
        ADSCRIPCION: emp.ADSCRIPCION || "",
    };
    const userAction = {
        username: user.username,
        module: "PSL-BE",
        action: `GENERO EL REPORTE DE PERMISOS EXTRAORDINARIOS DE: "${templateData.NOMBRE_COMPLETO}"`,
        timestamp: currentDateTime,
    };

    const content = fs.readFileSync(
        path.resolve(__dirname, "../../templates/permisosExtTemplate.docx"),
        "binary"
    );
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });


    try {
        doc.render(templateData);
        const buf = doc.getZip().generate({ type: "nodebuffer" });
        const outputDir = path.resolve(__dirname, "../../docs/permisosExt");
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = path.join(outputDir, `PERMISOS_EXT_${templateData.CURP}.docx`);
        fs.writeFileSync(outputPath, buf);

        res.setHeader(
            "Content-Disposition",
            `attachment; filename=PERMISOS_EXT_${templateData.CURP}.docx`
        );
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
        await insertOne("USER_ACTIONS", userAction);
        res.status(200).sendFile(outputPath);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al generar el documento" });
        return;
    }

    // const filePath = path.join(
    //     __dirname,
    //     `../../docs/reportes/incidencias/PERMISOS_EXTRAORDINARIOS_${emp.CURP}.pdf`,
    // );

    // try {
    //     const stream = fs.createWriteStream(filePath);

    //     stream.on("error", (err) => {
    //         console.error("Error al escribir el archivo:", err.message);
    //         res.status(500).json({ message: "Error al generar el reporte." });
    //         doc.end();
    //     });

    //     stream.on("finish", () => {
    //         res.setHeader("Content-Type", "application/pdf");
    //         res.setHeader(
    //             "Content-Disposition",
    //             `attachment; filename=PERMISOS_EXTRAORDINARIOS_${emp.CURP}.pdf`,
    //         );
    //         res.download(filePath, `PERMISOS_EXTRAORDINARIOS_${emp.CURP}.pdf`, (err) => {
    //             if (err) {
    //                 console.error("Error al descargar el archivo:", err.message);
    //                 res.status(500).json({ message: "Error al descargar el archivo." });
    //             }
    //         });
    //     });

    //     doc.pipe(stream);
    //     doc.registerFont("Consolas", fontPathArial);
    //     doc.registerFont("Arial-black", fontPathArialBlack);
    //     doc.font("Consolas").fontSize(9);

    //     const currentDate = new Date().toLocaleDateString("es-MX");

    //     let pageNumber = 0;
    //     let isFirstPage = true;
    //     const addHeaderAndFooter = () => {
    //         pageNumber++;
    //         const footerY = doc.page.height - doc.page.margins.bottom - 12;
    //         doc.fontSize(10).text(`PÁGINA ${pageNumber}`, 60, footerY, { align: "right" });
    //         doc.fontSize(10).text(`FECHA: ${currentDate}`, 60, 20, { align: "right" });
    //         if (isFirstPage) {
    //             doc.fontSize(12).font("Arial-black").text("REPORTE DE PERMISOS EXTRAORDINARIOS", { align: "center" }).font("Consolas");
    //             isFirstPage = false;
    //         }
    //         doc.fontSize(10);
    //     };

    //     doc.on("pageAdded", addHeaderAndFooter);
    //     doc.margins = { top: 72, bottom: 72, left: 60, right: 60 };
    //     addHeaderAndFooter();

    //     // --- Encabezado tipo tarjeta (título, recuadro y filas en 3 columnas, adscripción con colspan) ---
    //     const totalWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    //     let y = doc.y + 10;
    //     const titleBarHeight = 26;
    //     const headerBoxHeight = 135;
    //     const startX = doc.page.margins.left;
    //     const padding = 0;
    //     const contentWidth = totalWidth - padding * 2;

    //     // Título superior (barra)
    //     doc.fillColor("#000000").fontSize(10).font("Arial-black").text("1.- INFORMACIÓN PERSONAL", startX, y + 20, { width: totalWidth, align: "start" });
    //     doc.fillColor("#000000").font("Consolas").fontSize(9);

    //     // Recuadro principal debajo de la barra
    //     const headerTop = y + titleBarHeight + 8;
    //     // doc.roundedRect(startX, headerTop, totalWidth, headerBoxHeight).stroke();

    //     // Preparar columnas
    //     const colInnerX = startX + padding;
    //     const colWidth = Math.floor(contentWidth / 3);
    //     const labelFontSize = 9;
    //     const valueFontSize = 11;
    //     const lineGap = 22;

    //     const renderInline = (label, value, tx, ty, width = colWidth, centerValue = false) => {
    //         doc.fontSize(labelFontSize).fillColor("#6b6b6b");
    //         const labelWidth = Math.ceil(doc.widthOfString(label, { fontSize: labelFontSize })) + 4;
    //         const usableLabelWidth = Math.min(labelWidth, Math.floor(width * 0.45));
    //         doc.text(label, tx, ty, { width: usableLabelWidth, align: "left" });

    //         doc.fontSize(valueFontSize).fillColor("#000000");
    //         const valueX = tx + usableLabelWidth + 4;
    //         const valueWidth = width - usableLabelWidth - 8;
    //         const valueText = String(value || "");

    //         // Si es centrado (para nombres), mostrar el valor centrado
    //         if (centerValue) {
    //             doc.text(valueText, tx, ty, { width: width, align: "center" });
    //         } else {
    //             doc.text(valueText, valueX, ty, { width: valueWidth, align: "left" });
    //         }

    //         // Dibujar borde alrededor de la columna con línea delgada
    //         const lineWidth = 0.5; // Línea delgada
    //         doc.lineWidth(lineWidth);
    //         doc.rect(tx, ty - 2, width, valueFontSize + 8).stroke();
    //         doc.lineWidth(1); // Restaurar ancho de línea normal
    //     };

    //     const safe = (v) => (v === undefined || v === null ? "" : String(v));

    //     // New helper: render ONLY label (for column header rows)
    //     const renderLabel = (label, tx, ty, width = colWidth) => {
    //         doc.fontSize(labelFontSize).fillColor("#6b6b6b");
    //         doc.text(label, tx, ty, { width: width, align: "center" });
    //     };

    //     // Modified rowsDef for your desired layout
    //     const rowsDef = [
    //         // Fila 1: Nombre dividido en 3 columnas
    //         [{ label: "Nombre:", value: safe(emp.APE_PAT || ""), span: 1 },
    //         { label: "", value: safe(emp.APE_MAT || ""), span: 1 },
    //         { label: "", value: safe(emp.NOMBRES || ""), span: 1 },
    //         ],

    //         // Fila 2: Solo etiquetas como encabezados (sin valores)
    //         [{ type: "header", label: "Apellido Paterno", span: 1 },
    //         { type: "header", label: "Apellido Materno", span: 1 },
    //         { type: "header", label: "Nombre(s)", span: 1 }],

    //         [{ label: "C.U.R.P.:", value: safe(emp.CURP || "") },
    //         { label: "R.F.C.:", value: safe(emp.RFC || "") },
    //         { label: "NUP:", value: safe(emp.NUMPLA || emp.NUM_PLAZA || emp.NO_PLAZA || "") }],

    //         [{ label: "Sexo:", value: (emp.SEXO === "H" ? "HOMBRE" : emp.SEXO === "M" ? "MUJER" : safe(emp.SEXO || "")) },
    //         { label: "Teléfono Personal:", value: safe(emp.TEL_PERSONAL || emp.TELEFONO || "") },
    //         { label: "Tarjeta:", value: safe(emp.NUMTARJETA || emp.TARJETA || "") }],

    //         [{ label: "Adscripción:", value: safe(emp.ADSCRIPCION || emp.ADSCRIP || emp.DEPARTAMENTO || ""), span: 2 },
    //         { label: "Proyecto:", value: safe(emp.PROYECTO || emp.PROYECT || "") }]
    //     ];

    //     // En el loop de dibujado, cambiar a:
    //     let rowY = headerTop + 8;
    //     for (let r = 0; r < rowsDef.length; r++) {
    //         let tx = colInnerX;
    //         for (let c = 0; c < rowsDef[r].length; c++) {
    //             const colDef = rowsDef[r][c];
    //             if (colDef.type === "header") {
    //                 // Render only label, centered
    //                 renderLabel(colDef.label, tx, rowY, colDef.span === 2 ? colWidth * 2 + 8 : colWidth);
    //                 tx += colDef.span === 2 ? colWidth * 2 + 8 : colWidth;
    //             } else if (colDef.span === 2) {
    //                 renderInline(colDef.label, colDef.value, tx, rowY, colWidth * 2 + 8, false);
    //                 tx += colWidth * 2 + 8;
    //             } else {
    //                 // Primera fila (r === 0) con valores centrados
    //                 const isCentredRow = (r === 0);
    //                 renderInline(colDef.label, colDef.value, tx, rowY, colWidth, isCentredRow);
    //                 tx += colWidth;
    //             }
    //         }
    //         rowY += lineGap;
    //     }

    //     // mover cursor para la tabla
    //     y = headerTop + headerBoxHeight + 12;
    //     doc.y = y;

    //     // Encabezado de tabla
    //     const headers = ["#", "TIPO", "DESDE", "HASTA", "TOTAL DE DÍAS", "OFICIO DE SOLICITUD", "OFICIO DE AUTORIZACIÓN", "OBSERVACIONES"];
    //     const columns = [30, 120, 50, 40, 60, 60, 70, 20];
    //     const rowHeight = 18;
    //     let x = doc.page.margins.left;

    //     headers.forEach((header, i) => {
    //         doc.rect(x, y, columns[i], rowHeight).fillAndStroke("#6C6E6D", "#000000");
    //         doc.fillColor("#FFFFFF").text(header, x + 4, y + 4, { width: columns[i] - 8, align: "left" });
    //         doc.fillColor("#000000");
    //         x += columns[i];
    //     });
    //     y += rowHeight;

    //     // Filas
    //     for (let i = 0; i < rows.length; i++) {
    //         x = doc.page.margins.left;
    //         const cellHeights = rows[i].map(
    //             (cell, j) =>
    //                 doc.heightOfString(String(cell), {
    //                     width: columns[j] - 4,
    //                     align: "left",
    //                 }) + 4
    //         );
    //         const maxRowHeight = Math.max(...cellHeights, 18);

    //         if (y + maxRowHeight > doc.page.height - doc.page.margins.bottom) {
    //             doc.addPage();
    //             y = doc.y + 10;
    //             let xh = doc.page.margins.left;
    //             headers.forEach((header, j) => {
    //                 doc.rect(xh, y, columns[j], 18).fillAndStroke("#6C6E6D", "#000000");
    //                 doc.fillColor("#FFFFFF").text(header, xh + 4, y + 4, { width: columns[j] - 8, align: "left" });
    //                 doc.fillColor("#000000");
    //                 xh += columns[j];
    //             });
    //             y += 18;
    //         }

    //         rows[i].forEach((cell, j) => {
    //             if (i % 2 === 1) {
    //                 doc.rect(x, y, columns[j], maxRowHeight).fillAndStroke("#fff", "#000000");
    //             } else {
    //                 doc.rect(x, y, columns[j], maxRowHeight).stroke();
    //             }
    //             doc.fillColor("#000000").text(String(cell), x + 4, y + 4, {
    //                 width: columns[j] - 8,
    //                 align: "left",
    //             });
    //             x += columns[j];
    //         });
    //         y += maxRowHeight;
    //     }

    //     doc.end();
    // } catch (error) {
    //     console.error("Error al crear el archivo:", error.message);
    //     res.status(500).json({ message: "Error al generar el reporte." });
    // }
};
module.exports = permisosExtController;
