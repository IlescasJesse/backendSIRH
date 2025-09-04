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

reportesPersonalController.getDataPersonalizada = async (req, res) => {
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

module.exports = reportesPersonalController;
