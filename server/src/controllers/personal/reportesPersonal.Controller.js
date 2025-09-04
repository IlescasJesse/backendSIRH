const { query } = require("../../config/mongo");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const PizZip = require("pizzip");
const fontPath = path.join(__dirname, "../../assets/fonts/Consolas.ttf");
const reportesPersonalController = {};

reportesPersonalController.getReportVacants = async (req, res) => {
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ layout: "landscape", margin: 40 });
    const queryParam = req.params.queryParam;
    try {
        let vacants = [];
        let title = "";
        if (queryParam === "ALL") {
            vacants = await query("PLANTILLA", {
                status: { $in: [2, 3] },
                $or: [
                    { TIPONOM: { $in: ["F51", "M51", "FCT", "CCT", "FCO", "511", "F53", "M53", "FMM", "MMS", ""] } },
                    { TIPONOM: null },
                    { TIPONOM: { $exists: false } }
                ]
            });
            title = "VACANTES DISPONIBLES";
        } else if (queryParam === "B") {
            vacants = await query("PLANTILLA", {
                status: { $in: [2, 3] },
                $or: [
                    { TIPONOM: { $in: ["F51", "M51"] } }
                ]
            });
            title = "VACANTES DISPONIBLES DE BASE";
        } else if (queryParam === "C") {
            vacants = await query("PLANTILLA", {
                status: { $in: [2, 3] },
                $or: [
                    { TIPONOM: { $in: ["FCT", "CCT", "FCO", "511", "F53", "M53"] } }
                ]
            });
            title = "VACANTES DISPONIBLES DE CONFIANZA";
        } else if (queryParam === "MM") {
            vacants = await query("PLANTILLA", {
                status: { $in: [2, 3] },
                $or: [
                    { TIPONOM: { $in: ["FMM", "MMS"] } }
                ]
            });
            title = "VACANTES DISPONIBLES DE MANDOS MEDIOS";
        }

        if (!vacants || vacants.length === 0) {
            return res.status(204).json({ message: "No hay vacantes" });
        }

        const previousOcupant = await query("PLAZAS", {
            status: { $in: [2, 3] },
        });

        vacants.forEach((vacant) => {
            const matchingPreviousOcupant = previousOcupant.find(
                (po) => po.NUMPLA === vacant.NUMPLA
            );
            if (matchingPreviousOcupant) {
                vacant.status_plaza = matchingPreviousOcupant;
            }
        })

        vacants.sort((a, b) => {
            const nameA = a.status_plaza?.previousOcuppants?.length
                ? (a.status_plaza.previousOcuppants[a.status_plaza.previousOcuppants.length - 1].NOMBRE || "").toUpperCase()
                : "";
            const nameB = b.status_plaza?.previousOcuppants?.length
                ? (b.status_plaza.previousOcuppants[b.status_plaza.previousOcuppants.length - 1].NOMBRE || "").toUpperCase()
                : "";
            return nameA.localeCompare(nameB);
        });

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

        const rows = vacants.map((emp, i) => {
            let row = [
                `${i + 1}`,
                emp.status_plaza?.previousOcuppants?.[emp.status_plaza.previousOcuppants.length - 1]?.NOMBRE,
                (emp.ADSCRIPCION || ""),
                tipoNomMapping[emp.TIPONOM] ?? emp.TIPONOM,
                emp.NUMPLA || "",
            ];
            return row;
        });

        const filePath = path.join(
            __dirname,
            `../../docs/reportes/personal/VACANTES.pdf`
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
                    `attachment; filename=VACANTES.pdf`
                );
                res.download(filePath, `VACANTES.pdf`, (err) => {
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
                doc.fontSize(18).text(`${title}`, { align: "center" });
                doc.fontSize(10);
                doc.fontSize(10).text(`TOTAL: ${vacants.length} ${vacants.length > 1 ? 'VACANTES' : 'VACANTE'}`, 40, 50, { align: "left" });
                doc.fontSize(10);
            };

            doc.on("pageAdded", addHeaderAndFooter);

            doc.margins = { top: 72, bottom: 72, left: 60, right: 60 };
            addHeaderAndFooter();

            // --- TABLA MANUAL ---
            const headers = ["#", "OCUPANTES ANTERIOR", "ADSCRIPCIÓN", "NOMBRAMIENTO", "PLAZA"];
            const columns = [30, 233, 230, 180, 40];
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
    } catch (err) {
        res.status(500).json({ message: "Error retrieving employees", error: err });
    }
}

reportesPersonalController.getReportLicenses = async (req, res) => {
    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ layout: "landscape", margin: 40 });
    try {
        const licenses = await query("LICENCIAS", {});
        if (licenses.length > 0) {
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

            const rows = licenses.map((emp, i) => {
                let row = [
                    `${i + 1}`,
                    `${emp.APE_PAT || ''} ${emp.APE_MAT || ''} ${emp.NOMBRES || ''}`.trim(),
                    emp.ADSCRIPCION || "",
                    tipoNomMapping[emp.TIPONOM] ?? `BASE`,
                    emp.NUMPLA || "",
                    emp.time ? (emp.time > 1 ? `${emp.time} AÑOS` : `${emp.time} AÑO`) : 'DESCONOCIDO'
                ];
                return row;
            });

            const filePath = path.join(
                __dirname,
                `../../docs/reportes/personal/LICENCIAS.pdf`
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
                        `attachment; filename=LICENCIAS.pdf`
                    );
                    res.download(filePath, `LICENCIAS.pdf`, (err) => {
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
                    doc.fontSize(18).text("LICENCIAS ACTIVAS", { align: "center" });
                    doc.fontSize(10);
                    doc.fontSize(10).text(`TOTAL: ${licenses.length} ${licenses.length > 1 ? 'LICENCIAS' : 'LICENCIA'}`, 40, 50, { align: "left" });
                    doc.fontSize(10);
                };

                doc.on("pageAdded", addHeaderAndFooter);

                doc.margins = { top: 72, bottom: 72, left: 60, right: 60 };
                addHeaderAndFooter();

                // --- TABLA MANUAL ---
                const headers = ["#", "NOMBRE", "ADSCRIPCIÓN", "NOMBRAMIENTO", "PLAZA", "TIEMPO"];
                const columns = [30, 200, 262, 100, 40, 80];
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

        } else {
            res.status(201).json({ message: "No se encontraron licencias" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al recuperar las licencias" });
    }
}

module.exports = reportesPersonalController;
