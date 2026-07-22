const {
    query,
    insertOne,
} = require("../../config/mongo");
const { ObjectId } = require("mongodb");
const path = require("path");
const moment = require("moment");
const fs = require("fs");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

const reportesPermisosExtController = {};

// Generar reporte de de todos los permisos extraordinarios
reportesPermisosExtController.printReport = async (req, res) => {
    const { _id } = req.body;
    const user = req.user;
    const currentDateTime = new Date().toLocaleString("en-US", {
        timeZone: "America/Mexico_City",
    });

    const employeeIdObj = new ObjectId(_id);

    const permisosExt = await query("PERMISOS_EXT", {
        $or: [
            { id_empoyee: employeeIdObj },
            { id_employee: employeeIdObj },
            { id_empoyee: _id },
            { id_employee: _id },
        ],
    });

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

    const totalDaysLENP = permisosExt
        .filter((p) => p.TIPO === "LENP") // usa "LEND" si ese es el valor real
        .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

    const totalDaysCUFA = permisosExt
        .filter((p) => p.TIPO === "CUFA")
        .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

    const totalDaysCUMA = permisosExt
        .filter((p) => p.TIPO === "CUMA")
        .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

    const totalDaysPATE = permisosExt
        .filter((p) => p.TIPO === "PATE")
        .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

    const totalDaysFAFA = permisosExt
        .filter((p) => p.TIPO === "FAFA")
        .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

    const emp = employee[0];

    const tipoMapping = {
        LENP: "LICENCIA POR ENFERMEDAD NO PROFESIONAL",
        CUFA: "CUIDADOS DE UN FAMILIAR",
        CUMA: "CUIDADOS MATERNOS",
        PATE: "PATERNIDAD",
        FAFA: "FALLECIMIENTO DE UN FAMILIAR",
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

    // Mapear datos de permisos para la tabla
    const permisosData =
        permisosExt.sort((a, b) => {
            const dateA = a.DESDE ? moment(a.DESDE).valueOf() : 0;
            const dateB = b.DESDE ? moment(b.DESDE).valueOf() : 0;
            const datediff = dateB - dateA;

            if (datediff === 0) {
                const dateAHasta = a.HASTA ? moment(a.HASTA).valueOf() : 0;
                const dateBHasta = b.HASTA ? moment(b.HASTA).valueOf() : 0;
                return dateBHasta - dateAHasta;
            }

            return datediff;
        })
            .map((empRow, i) => ({
                I: i + 1,
                T: tipoMapping[empRow.TIPO] ?? empRow.TIPO,
                D: empRow.DESDE ? moment(empRow.DESDE).format("DD/MM/YYYY") : "",
                H: empRow.HASTA ? moment(empRow.HASTA).format("DD/MM/YYYY") : "",
                N: empRow.NUM_DIAS || "",
                O: empRow.OFICIO_SOLICITUD || "",
                A: empRow.OFICIO_AUTORIZACION || "",
                B: empRow.OBSERVACIONES || "",
            }));

    const templateData = {
        NOMBRE_COMPLETO:
            `${emp.APE_PAT || ""} ${emp.APE_MAT || ""} ${emp.NOMBRES || ""}`.trim(),
        CURP: emp.CURP || "",
        RFC: emp.RFC || "",
        SEX: emp.SEXO || "",
        PHONE: emp.TEL_PERSONAL || "",
        NUMPLA: emp.NUMPLA || "",
        TJT: emp.NUMTARJETA || "",
        TIPONOM: tipoNomMapping[emp.TIPONOM] || emp.TIPONOM || "",
        ADSCRIPCION: emp.ADSCRIPCION || "",
        H: permisosData, // Array de permisos para la tabla
        D_LE: totalDaysLENP, // total de días LENP del empleado
        D_CF: totalDaysCUFA,
        D_M: totalDaysCUMA,
        D_P: totalDaysPATE,
        D_FF: totalDaysFAFA,
        D_TOTAL:
            totalDaysLENP +
            totalDaysCUFA +
            totalDaysCUMA +
            totalDaysPATE +
            totalDaysFAFA,
    };

    const userAction = {
        username: user.username,
        module: "PSL-BE",
        action: `GENERO EL REPORTE DE PERMISOS EXTRAORDINARIOS DE: "${templateData.NOMBRE_COMPLETO}"`,
        timestamp: currentDateTime,
    };

    const content = fs.readFileSync(
        path.resolve(__dirname, "../../templates/permisosExtTemplate.docx"),
        "binary",
    );
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });
    try {
        doc.render(templateData);
        const buf = doc.getZip().generate({ type: "nodebuffer" });
        const outputDir = path.resolve(__dirname, `../../docs/reportes/permisos_extraordinarios/empleado/`);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = path.join(
            outputDir,
            `CURP_${templateData.CURP}.docx`,
        );
        fs.writeFileSync(outputPath, buf);

        res.setHeader(
            "Content-Disposition",
            `attachment; filename=CURP_${templateData.CURP}.docx`,
        );
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        await insertOne("USER_ACTIONS", userAction);
        res.status(200).sendFile(outputPath);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al generar el documento" });
    }
};

// Generar reporte de permisos extraordinarios por tipo
reportesPermisosExtController.printReportType = async (req, res) => {
    const { type } = req.body;
    const user = req.user;
    const currentDateTime = new Date().toLocaleString("en-US", {
        timeZone: "America/Mexico_City",
    });
    const currentYear = moment().year();
    const typeClean = String(type || "").trim().toUpperCase();
    const yearFilter = [currentYear, `${currentYear}`];

    const filter = {
        TIPO: typeClean,
        $or: [
            { AÑO: { $in: yearFilter } },
            { ANO: { $in: yearFilter } },
        ],
    };

    const permisosExt = await query("PERMISOS_EXT", filter);

    if (!permisosExt || permisosExt.length === 0) {
        return res.status(404).json({ message: "No hay permisos extraordinarios para el tipo/año solicitados." });
    }

    const getEmployeeByIdEmployee = async (idEmployee) => {
        if (!idEmployee) return null;

        const [plantilla = [], foranea = []] = await Promise.all([
            query("PLANTILLA", { _id: new ObjectId(idEmployee) }),
            query("PLANTILLA_FORANEA", { _id: new ObjectId(idEmployee) }),
        ]);
        return [...plantilla, ...foranea][0] || null;
    };

    const totalDays = permisosExt.reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

    const tipoMapping = {
        LENP: "LICENCIA POR ENFERMEDAD NO PROFESIONAL",
        CUFA: "CUIDADOS DE UN FAMILIAR",
        CUMA: "CUIDADOS MATERNOS",
        PATE: "PATERNIDAD",
        FAFA: "FALLECIMIENTO DE UN FAMILIAR",
    };

    const permisosData = await Promise.all(
        permisosExt.sort((a, b) => {
            const dateA = a.DESDE ? moment(a.DESDE).valueOf() : 0;
            const dateB = b.DESDE ? moment(b.DESDE).valueOf() : 0;
            const datediff = dateB - dateA;

            if (datediff === 0) {
                const dateAHasta = a.HASTA ? moment(a.HASTA).valueOf() : 0;
                const dateBHasta = b.HASTA ? moment(b.HASTA).valueOf() : 0;
                return dateBHasta - dateAHasta;
            }

            return datediff;
        }).map(async (empRow, i) => {
            const idEmployee = empRow.id_empoyee;
            const empData = await getEmployeeByIdEmployee(idEmployee);

            return {
                I: i + 1,
                NOMBRE: `${empData.APE_PAT || ""} ${empData.APE_MAT || ""} ${empData.NOMBRES || ""}`.trim(),
                TARJETA: empData?.NUMTARJETA || "",
                INI: empRow.DESDE ? moment(empRow.DESDE).format("DD/MM/YYYY") : "",
                FIN: empRow.HASTA ? moment(empRow.HASTA).format("DD/MM/YYYY") : "",
                DIAS: empRow.NUM_DIAS || "",
                O_SOLI: empRow.OFICIO_SOLICITUD || "",
                O_AUT: empRow.OFICIO_AUTORIZACION || ""
            };
        }),
    );

    const templateData = {
        fechaHoy: moment().format("DD/MM/YYYY"),
        tipoPermiso: tipoMapping[type] || type,
        totalPersonas: permisosExt.length,
        totalDias: totalDays,
        H: permisosData,
    };

    const userAction = {
        username: user.username,
        module: "PSL-BE",
        action: `GENERO EL REPORTE DE PERMISOS EXTRAORDINARIOS POR "${templateData.tipoPermiso}"`,
        timestamp: currentDateTime,
    };

    const content = fs.readFileSync(
        path.resolve(__dirname, "../../templates/permisosExtTypeTemplate.docx"),
        "binary",
    );
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });
    try {
        doc.render(templateData);
        const buf = doc.getZip().generate({ type: "nodebuffer" });
        const outputDir = path.resolve(__dirname, "../../docs/reportes/permisos_extraordinarios/tipo_permiso/");
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = path.join(
            outputDir,
            `${templateData.tipoPermiso}.docx`,
        );
        fs.writeFileSync(outputPath, buf);

        res.setHeader(
            "Content-Disposition",
            `attachment; filename=${templateData.tipoPermiso}.docx`,
        );
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        await insertOne("USER_ACTIONS", userAction);
        res.status(200).sendFile(outputPath);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al generar el documento" });
    }
};

// Generar reporte de permisos extraordinarios por quincena
reportesPermisosExtController.printReportQuincena = async (req, res) => {
    const { quincena } = req.body;
    const user = req.user;
    const currentDateTime = new Date().toLocaleString("en-US", {
        timeZone: "America/Mexico_City",
    });
    const year = moment().year();

    const q = Number(quincena);
    if (!q || q < 1 || q > 24) {
        return res.status(400).json({ message: "Quincena inválida" });
    }

    const month = Math.ceil(q / 2);
    const isSecond = q % 2 === 0;
    const startDay = isSecond ? 16 : 1;
    const endDay = isSecond ? moment({ year, month: month - 1 }).endOf("month").date() : 15;

    const desdeQuincena = moment({ year, month: month - 1, day: startDay }).format("YYYY-MM-DD");
    const hastaQuincena = moment({ year, month: month - 1, day: endDay }).format("YYYY-MM-DD");

    const filter = {
        $and: [
            { $or: [{ AÑO: { $in: [year, `${year}`] } }, { ANO: { $in: [year, `${year}`] } }] },
            { DESDE: { $lte: hastaQuincena } },
            { HASTA: { $gte: desdeQuincena } },
        ],
    };

    const permisosExt = await query("PERMISOS_EXT", filter);

    if (!permisosExt || permisosExt.length === 0) {
        return res.status(404).json({ message: "No hay permisos extraordinarios para la quincena solicitada." });
    }

    const getEmployeeByIdEmployee = async (idEmployee) => {
        if (!idEmployee) return null;

        const [plantilla = [], foranea = []] = await Promise.all([
            query("PLANTILLA", { _id: new ObjectId(idEmployee) }),
            query("PLANTILLA_FORANEA", { _id: new ObjectId(idEmployee) }),
        ]);
        return [...plantilla, ...foranea][0] || null;
    };

    const totalDaysLENP = permisosExt
        .filter((p) => p.TIPO === "LENP")
        .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

    const totalDaysCUFA = permisosExt
        .filter((p) => p.TIPO === "CUFA")
        .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

    const totalDaysCUMA = permisosExt
        .filter((p) => p.TIPO === "CUMA")
        .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

    const totalDaysPATE = permisosExt
        .filter((p) => p.TIPO === "PATE")
        .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

    const totalDaysFAFA = permisosExt
        .filter((p) => p.TIPO === "FAFA")
        .reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

    const tipoMapping = {
        LENP: "LICENCIA POR ENFERMEDAD NO PROFESIONAL",
        CUFA: "CUIDADOS DE UN FAMILIAR",
        CUMA: "CUIDADOS MATERNOS",
        PATE: "PATERNIDAD",
        FAFA: "FALLECIMIENTO DE UN FAMILIAR",
    };

    const permisosData = await Promise.all(
        permisosExt.sort((a, b) => {
            const dateA = a.DESDE ? moment(a.DESDE).valueOf() : 0;
            const dateB = b.DESDE ? moment(b.DESDE).valueOf() : 0;
            const datediff = dateB - dateA;

            if (datediff === 0) {
                const dateAHasta = a.HASTA ? moment(a.HASTA).valueOf() : 0;
                const dateBHasta = b.HASTA ? moment(b.HASTA).valueOf() : 0;
                return dateBHasta - dateAHasta;
            }

            return datediff;
        }).map(async (empRow, i) => {
            const idEmployee = empRow.id_empoyee;
            const empData = await getEmployeeByIdEmployee(idEmployee);

            return {
                I: i + 1,
                NOMBRE: `${empData.APE_PAT || ""} ${empData.APE_MAT || ""} ${empData.NOMBRES || ""}`.trim(),
                TARJETA: empData?.NUMTARJETA || "",
                TIPO: tipoMapping[empRow.TIPO] || empRow.TIPO,
                INI: empRow.DESDE ? moment(empRow.DESDE).format("DD/MM/YYYY") : "",
                FIN: empRow.HASTA ? moment(empRow.HASTA).format("DD/MM/YYYY") : "",
                DIAS: empRow.NUM_DIAS || "",
                O_SOLI: empRow.OFICIO_SOLICITUD || "",
                O_AUT: empRow.OFICIO_AUTORIZACION || ""
            };
        }),
    );

    const templateData = {
        fechaHoy: moment().format("DD/MM/YYYY"),
        quincena: `${startDay} AL ${endDay} DE ${moment({ year, month: month - 1, day: 1 }).locale("es").format("MMMM").toUpperCase()} DE ${year}`,
        DIAS_LENP: totalDaysLENP,
        DIAS_CUFA: totalDaysCUFA,
        DIAS_CUMA: totalDaysCUMA,
        DIAS_PATE: totalDaysPATE,
        DIAS_FAFA: totalDaysFAFA,
        TOTAL: totalDaysLENP + totalDaysCUFA + totalDaysCUMA + totalDaysPATE + totalDaysFAFA,
        H: permisosData,
    };

    const userAction = {
        username: user.username,
        module: "PSL-BE",
        action: `GENERO EL REPORTE DE PERMISOS EXTRAORDINARIOS DE LA QUINCENA: "${quincena}"`,
        timestamp: currentDateTime,
    };

    const content = fs.readFileSync(
        path.resolve(__dirname, "../../templates/permisosExtQuincenaTemplate.docx"),
        "binary",
    );
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });
    try {
        doc.render(templateData);
        const buf = doc.getZip().generate({ type: "nodebuffer" });
        const outputDir = path.resolve(__dirname, "../../docs/reportes/permisos_extraordinarios/quincena/");
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = path.join(
            outputDir,
            `QUINCENA_${quincena}.docx`,
        );
        fs.writeFileSync(outputPath, buf);

        res.setHeader(
            "Content-Disposition",
            `attachment; filename=QUINCENA_${quincena}.docx`,
        );
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        await insertOne("USER_ACTIONS", userAction);
        res.status(200).sendFile(outputPath);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al generar el documento" });
    }
};

// Generar reporte de permisos extraordinarios por quincena y tipo
reportesPermisosExtController.printReportQuincenaAndType = async (req, res) => {
    const { quincena, tipo } = req.body;
    const user = req.user;
    const currentDateTime = new Date().toLocaleString("en-US", {
        timeZone: "America/Mexico_City",
    });
    const year = moment().year();

    const q = Number(quincena);
    if (!q || q < 1 || q > 24) {
        return res.status(400).json({ message: "Quincena inválida" });
    }

    let typeText = '';
    if (tipo === 'LENP') {
        typeText = 'LICENCIA POR ENFERMEDAD NO PROFESIONAL';
    } else if (tipo === 'CUFA') {
        typeText = 'CUIDADADOS DE UN FAMILIAR';
    } else if (tipo === 'CUMA') {
        typeText = 'CUIDADOS MATERNOS';
    } else if (tipo === 'PATE') {
        typeText = 'PATERNIDAD';
    } else if (tipo === 'FAFA') {
        typeText = 'FALLECIMIENTO DE UN FAMILIAR';
    }

    const month = Math.ceil(q / 2);
    const isSecond = q % 2 === 0;
    const startDay = isSecond ? 16 : 1;
    const endDay = isSecond ? moment({ year, month: month - 1 }).endOf("month").date() : 15;

    const desdeQuincena = moment({ year, month: month - 1, day: startDay }).format("YYYY-MM-DD");
    const hastaQuincena = moment({ year, month: month - 1, day: endDay }).format("YYYY-MM-DD");

    const filter = {
        $and: [
            { $or: [{ AÑO: { $in: [year, `${year}`] } }, { ANO: { $in: [year, `${year}`] } }] },
            { DESDE: { $lte: hastaQuincena } },
            { HASTA: { $gte: desdeQuincena } },
            { TIPO: { $in: [tipo] } },
        ],
    };

    const permisosExt = await query("PERMISOS_EXT", filter);

    if (!permisosExt || permisosExt.length === 0) {
        return res.status(404).json({ message: "No hay permisos extraordinarios para la quincena y/o tipo solicitados." });
    }

    const getEmployeeByIdEmployee = async (idEmployee) => {
        if (!idEmployee) return null;

        const [plantilla = [], foranea = []] = await Promise.all([
            query("PLANTILLA", { _id: new ObjectId(idEmployee) }),
            query("PLANTILLA_FORANEA", { _id: new ObjectId(idEmployee) }),
        ]);
        return [...plantilla, ...foranea][0] || null;
    };

    const totalDays = permisosExt.reduce((sum, p) => sum + (Number(p.NUM_DIAS) || 0), 0);

    const tipoMapping = {
        LENP: "LICENCIA POR ENFERMEDAD NO PROFESIONAL",
        CUFA: "CUIDADOS DE UN FAMILIAR",
        CUMA: "CUIDADOS MATERNOS",
        PATE: "PATERNIDAD",
        FAFA: "FALLECIMIENTO DE UN FAMILIAR",
    };

    const permisosData = await Promise.all(
        permisosExt.sort((a, b) => {
            const dateA = a.DESDE ? moment(a.DESDE).valueOf() : 0;
            const dateB = b.DESDE ? moment(b.DESDE).valueOf() : 0;
            const datediff = dateB - dateA;

            if (datediff === 0) {
                const dateAHasta = a.HASTA ? moment(a.HASTA).valueOf() : 0;
                const dateBHasta = b.HASTA ? moment(b.HASTA).valueOf() : 0;
                return dateBHasta - dateAHasta;
            }

            return datediff;
        }).map(async (empRow, i) => {
            const idEmployee = empRow.id_empoyee;
            const empData = await getEmployeeByIdEmployee(idEmployee);

            return {
                I: i + 1,
                NOMBRE: `${empData.APE_PAT || ""} ${empData.APE_MAT || ""} ${empData.NOMBRES || ""}`.trim(),
                TARJETA: empData?.NUMTARJETA || "",
                INI: empRow.DESDE ? moment(empRow.DESDE).format("DD/MM/YYYY") : "",
                FIN: empRow.HASTA ? moment(empRow.HASTA).format("DD/MM/YYYY") : "",
                DIAS: empRow.NUM_DIAS || "",
                O_SOLI: empRow.OFICIO_SOLICITUD || "",
                O_AUT: empRow.OFICIO_AUTORIZACION || ""
            };
        }),
    );

    const templateData = {
        fechaHoy: moment().format("DD/MM/YYYY"),
        quincena: `${startDay} AL ${endDay} DE ${moment({ year, month: month - 1, day: 1 }).locale("es").format("MMMM").toUpperCase()} DE ${year}`,
        tipoPermiso: tipoMapping[tipo] || tipo,
        totalPersonas: permisosExt.length,
        totalDias: totalDays,
        H: permisosData,
    };

    const userAction = {
        username: user.username,
        module: "PSL-BE",
        action: `GENERO EL REPORTE DE PERMISOS EXTRAORDINARIOS DE LA QUINCENA: "${quincena}" Y DE TIPO "${typeText}"`,
        timestamp: currentDateTime,
    };

    const content = fs.readFileSync(
        path.resolve(__dirname, "../../templates/permisosExtTipoyQuincenaTemplate.docx"),
        "binary",
    );
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });
    try {
        doc.render(templateData);
        const buf = doc.getZip().generate({ type: "nodebuffer" });
        const outputDir = path.resolve(__dirname, "../../docs/reportes/permisos_extraordinarios/quincena_y_tipo/");
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = path.join(
            outputDir,
            `QUINCENA_${quincena}_TIPO_${typeText}.docx`,
        );
        fs.writeFileSync(outputPath, buf);

        res.setHeader(
            "Content-Disposition",
            `attachment; filename=QUINCENA_${quincena}_TIPO_${typeText}.docx`,
        );
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        await insertOne("USER_ACTIONS", userAction);
        res.status(200).sendFile(outputPath);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error al generar el documento" });
    }
};

module.exports = reportesPermisosExtController;