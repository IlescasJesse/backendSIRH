const { query, insertOne } = require("../../config/mongo");
const path = require("path");
const { querysql } = require("../../config/mysql");
const moment = require("moment");
const { ObjectId } = require("mongodb");
const ExcelJS = require("exceljs");
const reportesPersonalController = {};

reportesPersonalController.getReportLicenses = async (req, res) => {

  try {
    const licenses = await query("LICENCIAS", { status: 1 });

    if (!licenses || licenses.length === 0) {
      return res.status(404).json({ message: "No se encontraron licencias activas" });
    }

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

    const formatearTiempoLicencia = (dischargeDate, returnDate) => {
      if (!returnDate) {
        return 'INDEFINIDO';
      }

      const start = moment(dischargeDate).startOf('day');
      const end = moment(returnDate).startOf('day');

      if (!start.isValid() || !end.isValid()) {
        return 'INDEFINIDO';
      }

      let years = end.diff(start, 'years');
      const afterYears = start.clone().add(years, 'years');

      let months = end.diff(afterYears, 'months');
      const afterMonths = afterYears.clone().add(months, 'months');

      let days = end.diff(afterMonths, 'days');

      if (days >= 28) {
        months += 1;
        days = 0;
      }

      if (months >= 12) {
        years += 1;
        months = 0;
      }

      let result = '';

      if (years > 0) {
        result += years === 1 ? '1 AÑO' : `${years} AÑOS`;
      }

      if (months > 0) {
        if (result) result += ' Y ';
        result += months === 1 ? '1 MES' : `${months} MESES`;
      }

      if (days > 0) {
        if (result) result += ' Y ';
        result += days === 1 ? '1 DÍA' : `${days} DÍAS`;
      }

      return result || '0 DÍAS';
    };

    // Crea el libro y la hoja
    const ExcelJS = require("exceljs");
    const moment = require("moment");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("LICENCIAS");

    const fechaFormato = moment().locale('es').format('DD [DE] MMMM [DEL] YYYY').toUpperCase();
    worksheet.mergeCells('C2:E2');
    worksheet.getCell('C2').value = `LICENCIAS DEL ${fechaFormato}`;
    worksheet.getCell('C2').font = { bold: true };
    worksheet.getCell('C2').font.size = 18;

    const headerRow = worksheet.getRow(4);
    headerRow.values = [
      "ENTIDAD",
      "NOM_FONDO",
      "CLAVE_DEPEN",
      "DEPEN",
      "RFC",
      "CURP",
      "NOM_EMP",
      "NUM_EMP",
      "PLAZA",
      "TIPO_DE_PERSONAL",
      "CAT_PUESTO",
      "NIVELSALARIAL",
      "ZE",
      "FECHA_BAJA",
      "FECHA_REINC",
      "ECHA_BAJA",
      "EFEC_REINC",
      "MOT",
      "MOTIVO",
      "ESTATUS",
      "NUM_LICENCIA",
      "SOPORTE_LIC"
    ];
    headerRow.font = { bold: true };

    let rowIndex = 5;
    for (const item of licenses) {
      const dataRow = worksheet.getRow(rowIndex);

      let dischargeDate = null;
      if (item.discharge_date) {
        dischargeDate = new Date(item.discharge_date);
      }

      const nombreCompleto = `${item.APE_PAT || ''} ${item.APE_MAT || ''} ${item.NOMBRES || ''}`.trim();
      const nivel = item.NIVEL
        ? String(item.NIVEL).replace(/[^0-9].*$/, '').replace(/^0+/, '')
        : '';


      dataRow.values = [
        'OAXACA',
        '',
        114,
        'SECRETARÍA DE FINANZAS',
        item.RFC || '',
        item.CURP || '',
        nombreCompleto,
        item.NUMEMP || '',
        item.NUMPLA || '',
        'BASE',
        item.CLAVECAT || '',
        Number(nivel) || '',
        6,
        dischargeDate || '',
        '',
        '',
        '',
        '',
        '',
        item.reason === 'L-SS' ? 'LICENCIA SIN GOCE DE SUELDO' : 'LICENCIA INDEFINIDA A BASE',
        formatearTiempoLicencia(item.discharge_date, item.end_date),
        ''

      ];
      rowIndex++;
    }

    // Genera el archivo y responde para descarga
    const fechaStr = moment().format("YYYY-MM-DD_HH-mm-ss");

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename=LICENCIAS_ACTIVAS_${fechaStr}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error al recuperar las licencias" });
  }
};

reportesPersonalController.getDataPersonalizada = async (req, res) => {
  let claveAdscripcion;
  let claves = [];

  let catalogoBase = [];
  let catalogoContrato = [];
  let catalogoMandos = [];
  let isrTable = [];
  let quinBase = [];
  let quinConfianza = [];
  let quinMandos = [];
  let segVida = [];
  let subsidioISR = [];
  let licencias = [];
  let personalGasadmi = [];
  let personalEstimulo = [];

  const baseMap = new Map();
  const contratoMap = new Map();
  const mandosMap = new Map();
  const quinBaseMap = new Map();
  const quinConfianzaMap = new Map();
  const quinMandosMap = new Map();
  const segVidaMap = new Map();
  const licenciaMap = new Map();
  const gasadmiMap = new Map();
  const estimuloMap = new Map();

  const buscarISR = (sueldoGravable) => {
    return isrTable.find(r =>
      sueldoGravable >= Number(r.limite_inf) &&
      sueldoGravable <= Number(r.limite_sup)
    );
  };

  const buscarSubsidio = (sueldoGravable) => {
    return subsidioISR.find(r =>
      sueldoGravable >= Number(r.lim_inf) &&
      sueldoGravable <= Number(r.lim_sup)
    );
  };

  const obtenerQuinquenio = (mapa, nivel, numQuin) => {

    if (!numQuin || numQuin <= 0)
      return 0;

    const fila = mapa.get(String(nivel));

    if (!fila)
      return 0;

    return Number(fila[`quin_${numQuin}`]) || 0;
  };

  async function procesarNomina(employee) {
    let percepciones = {};
    let deducciones = {};

    employee.CUBRIENDO_LICENCIA = licenciaMap.has(String(employee._id));

    const nivel = String(employee.NIVEL);
    const tipo = employee.TIPONOM;

    switch (tipo) {

      // ======================
      // 🔸 BASE
      // ======================
      case "M51":
      case "F51":

        const catalogoB = baseMap.get(nivel);
        if (!catalogoB) break;
        percepciones = { ...catalogoB };

        const dataGasadmi = gasadmiMap.get(String(employee._id));

        if (dataGasadmi) {
          percepciones.gasadmi = dataGasadmi.gasadmi;
        }

        if (employee.NUM_HIJOS && employee.NUM_HIJOS > 0) {
          percepciones.guarderia = (Number(employee.NUM_HIJOS) * Number(percepciones.guarderia)).toFixed(2);
        } else {
          delete percepciones.guarderia;
        }

        // ✅ ELIMINAR cualquier quinquenio previo
        Object.keys(percepciones).forEach(key => {
          if (key.startsWith("QUINQUENIOS")) {
            delete percepciones[key];
          }
        });

        const sueldoBase = parseFloat(percepciones.sueldo_base);

        let sueldoGravableB;

        const quinquenioBase =
          obtenerQuinquenio(
            quinBaseMap,
            employee.NIVEL,
            employee.NUMQUIN
          );

        if (quinquenioBase) {
          percepciones[`QUINQUENIOS: ${employee.NUMQUIN}`] =
            quinquenioBase;
        }

        sueldoGravableB = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.despensa) +
          parseFloat(percepciones.act_cul_dep) +
          parseFloat(percepciones.api_base) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.gasadmi ? percepciones.gasadmi : 0) +
          parseFloat(quinquenioBase) +
          parseFloat(percepciones.guarderia ? percepciones.guarderia : 0)
        ).toFixed(2);

        const isrObjectB = buscarISR(Number(sueldoGravableB));

        if (!isrObjectB) {
          throw new Error(
            `No se encontró rango de ISR para el sueldo gravable: ${sueldoGravableB}`
          );
        }

        const isrBrutoB =
          ((sueldoGravableB - parseFloat(isrObjectB.limite_inf)) *
            parseFloat(isrObjectB.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectB.cuota_fija);

        const subsidioB = Number(buscarSubsidio(Number(sueldoGravableB))?.subsidio) || 0;

        let isrFinal = isrBrutoB - subsidioB;
        if (isrFinal < 0) isrFinal = 0;

        const isrRedondeado = (Math.round(isrFinal * 10) / 10).toFixed(2);
        deducciones.ISR = isrRedondeado;

        if (!employee.CUBRIENDO_LICENCIA && employee.FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_BASE = (sueldoBase * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_BASE * 10) / 10).toFixed(2);
        }
        if (!employee.CUBRIENDO_LICENCIA && employee.SINDICATO?.CUOTA_SINDICAL === true) {
          const CUOTA_SINDICAL_BASE = (sueldoBase * 0.01).toFixed(2);
          deducciones.CUOTA_SINDICAL = (Math.round(CUOTA_SINDICAL_BASE * 10) / 10).toFixed(2);
        }

        const IMSS_BASE = (sueldoBase * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_BASE * 10) / 10).toFixed(2);

        break;

      // ======================
      // 🔸 CONTRATO
      // ======================
      case "FCT":
      case "CCT":
      case "F53":
      case "M53":

        const catalogoCC = contratoMap.get(nivel);
        if (!catalogoCC) break;
        percepciones = { ...catalogoCC };

        const estimuloRealConfianza = estimuloMap.get(String(employee._id));

        if (estimuloRealConfianza) {
          percepciones.estimulo = estimuloRealConfianza.estimulo;
        }

        // ✅ ELIMINAR cualquier quinquenio previo
        Object.keys(percepciones).forEach(key => {
          if (key.startsWith("QUINQUENIOS")) {
            delete percepciones[key];
          }
        });

        const quinquenioCC =
          obtenerQuinquenio(
            quinConfianzaMap,
            employee.NIVEL,
            employee.NUMQUIN
          );

        if (quinquenioCC) {
          percepciones[`QUINQUENIOS: ${employee.NUMQUIN}`] =
            quinquenioCC;
        }

        const sueldoGravableCC = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.canasta_basica) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.estimulo) +
          parseFloat(percepciones.api_contrato) +
          parseFloat(quinquenioCC)
        ).toFixed(2);

        const isrObjectCC = buscarISR(Number(sueldoGravableCC));

        if (!isrObjectCC) {
          throw new Error(
            `No se encontró rango de ISR para el sueldo gravable: ${sueldoGravableCC}`
          );
        }

        const isrBrutoCC =
          ((sueldoGravableCC - parseFloat(isrObjectCC.limite_inf)) *
            parseFloat(isrObjectCC.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectCC.cuota_fija);

        const subsidioCC = Number(buscarSubsidio(Number(sueldoGravableCC))?.subsidio) || 0;

        let isrFinalCC = isrBrutoCC - subsidioCC;
        if (isrFinalCC < 0) isrFinalCC = 0;

        deducciones.ISR = (Math.round(isrFinalCC * 10) / 10).toFixed(2);

        if (employee.FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_CC = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_CC * 10) / 10).toFixed(2);
        }

        const IMSS_CC = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_CC * 10) / 10).toFixed(2);

        break;

      case "FCO":
      case "511":

        const catalogoCN = contratoMap.get(nivel);
        if (!catalogoCN) break;
        percepciones = { ...catalogoCN };

        const estimuloRealNombramiento =
          estimuloMap.get(String(employee._id));

        if (estimuloRealNombramiento) {
          percepciones.estimulo = estimuloRealNombramiento.estimulo;
        }

        // ✅ ELIMINAR cualquier quinquenio previo
        Object.keys(percepciones).forEach(key => {
          if (key.startsWith("QUINQUENIOS")) {
            delete percepciones[key];
          }
        });

        const quinquenioCN =
          obtenerQuinquenio(
            quinConfianzaMap,
            employee.NIVEL,
            employee.NUMQUIN
          );

        if (quinquenioCN) {
          percepciones[`QUINQUENIOS: ${employee.NUMQUIN}`] =
            quinquenioCN;
        }

        const sueldoGravableCN = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.canasta_basica) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.estimulo) +
          parseFloat(percepciones.api_contrato) +
          parseFloat(quinquenioCN)
        ).toFixed(2);

        const isrObjectCN = buscarISR(Number(sueldoGravableCN));

        if (!isrObjectCN) {
          throw new Error(
            `No se encontró rango de ISR para el sueldo gravable: ${sueldoGravableCN}`
          );
        }

        const isrBrutoCN =
          ((sueldoGravableCN - parseFloat(isrObjectCN.limite_inf)) *
            parseFloat(isrObjectCN.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectCN.cuota_fija);

        const subsidioCN = Number(buscarSubsidio(Number(sueldoGravableCN))?.subsidio) || 0;

        let isrFinalCN = isrBrutoCN - subsidioCN;
        if (isrFinalCN < 0) isrFinalCN = 0;

        deducciones.ISR = (Math.round(isrFinalCN * 10) / 10).toFixed(2);

        if (employee.FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_CN = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_CN * 10) / 10).toFixed(2);
        }

        if (employee.SINDICATO?.CUOTA_SINDICAL === true) {
          const CUOTA_SINDICAL_CN = (parseFloat(percepciones.sueldo_base) * 0.01).toFixed(2);
          deducciones.CUOTA_SINDICAL = (Math.round(CUOTA_SINDICAL_CN * 10) / 10).toFixed(2);
        }

        const IMSS_CN = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_CN * 10) / 10).toFixed(2);

        break;

      // ======================
      // 🔸 MANDOS MEDIOS
      // ======================
      case "FMM":
      case "MMS":

        const catalogoMM = mandosMap.get(nivel);
        if (!catalogoMM) break;
        percepciones = { ...catalogoMM };

        // ✅ ELIMINAR cualquier quinquenio previo
        Object.keys(percepciones).forEach(key => {
          if (key.startsWith("QUINQUENIOS")) {
            delete percepciones[key];
          }
        });

        const quinquenioMms =
          obtenerQuinquenio(
            quinMandosMap,
            employee.NIVEL,
            employee.NUMQUIN
          );

        if (quinquenioMms) {
          percepciones[`QUINQUENIOS: ${employee.NUMQUIN}`] =
            quinquenioMms;
        }

        const sueldoGravableMM = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.comp_fija_garan) +
          parseFloat(percepciones.api_mms) +
          parseFloat(quinquenioMms)
        ).toFixed(2);

        const isrObjectMM = buscarISR(Number(sueldoGravableMM));

        if (!isrObjectMM) {
          throw new Error(
            `No se encontró rango de ISR para el sueldo gravable: ${sueldoGravableMM}`
          );
        }

        const isrBrutoMM =
          ((sueldoGravableMM - parseFloat(isrObjectMM.limite_inf)) *
            parseFloat(isrObjectMM.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectMM.cuota_fija);

        const subsidioMM = Number(buscarSubsidio(Number(sueldoGravableMM))?.subsidio) || 0;

        let isrFinalMM = isrBrutoMM - subsidioMM;
        if (isrFinalMM < 0) isrFinalMM = 0;

        deducciones.ISR = (Math.round(isrFinalMM * 10) / 10).toFixed(2);

        const IMSS_MMS = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_MMS * 10) / 10).toFixed(2);

        const seguro = segVidaMap.get(String(employee.NIVEL));

        const SEGURO_VIDA_MMS = Number(seguro?.seg_vida) || 0;

        deducciones.SEGURO_VIDA = (Math.round(SEGURO_VIDA_MMS * 10) / 10).toFixed(2);

        if (employee.FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_MMS = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_MMS * 10) / 10).toFixed(2);
        }

        delete percepciones.isr_rdl;
        delete percepciones.rdl;

        break;

      default:
        throw new Error("Tipo de nómina no reconocido");
    }

    return { percepciones, deducciones };
  }

  try {
    const {
      CLAVE,
      ADSCRIPCION,
      SUBNIVELES,
      TIPONOM,
      CLAVECAT,
      FECHA_INGRESO,
      FECHA_NOMBRAMIENTO,
      NUMQUIN,
      GASADMIN,
      ESTIMULO,
      FONDO_PENSIONES,
      CUOTA_SINDICAL,
      SEXO,
      FECHA_NAC,
      STATUS_EMPLEADO,
      LICENCIA,
      CAMPOS
    } = req.body;

    const campos = CAMPOS || {};

    const necesitaNomina = [
      "PERCEPCIONES",
      "TOTAL_PERCEPCIONES",
      "DEDUCCIONES",
      "TOTAL_DEDUCCIONES",
      "NETO"
    ].some(campo => campos[campo] === true);

    const necesitaLicencias =
      necesitaNomina ||
      LICENCIA !== null && LICENCIA !== undefined ||
      FONDO_PENSIONES !== null && FONDO_PENSIONES !== undefined ||
      CUOTA_SINDICAL !== null && CUOTA_SINDICAL !== undefined;

    const necesitaGasadmi =
      necesitaNomina ||
      (GASADMIN !== null && GASADMIN !== undefined);

    const necesitaEstimulo =
      necesitaNomina ||
      (ESTIMULO !== null && ESTIMULO !== undefined);

    [
      catalogoBase,
      catalogoContrato,
      catalogoMandos,
      isrTable,
      quinBase,
      quinConfianza,
      quinMandos,
      segVida,
      subsidioISR,
      licencias,
      personalGasadmi,
      personalEstimulo
    ] = await Promise.all([
      necesitaNomina ? querysql(`SELECT * FROM catalogo_base`) : Promise.resolve([]),
      necesitaNomina ? querysql(`SELECT * FROM catalogo_contrato`) : Promise.resolve([]),
      necesitaNomina ? querysql(`SELECT * FROM catalogo_mandosmedios`) : Promise.resolve([]),
      necesitaNomina ? querysql(`SELECT * FROM catalogo_isr`) : Promise.resolve([]),
      necesitaNomina ? querysql(`SELECT * FROM quin_base`) : Promise.resolve([]),
      necesitaNomina ? querysql(`SELECT * FROM quin_confianza`) : Promise.resolve([]),
      necesitaNomina ? querysql(`SELECT * FROM quin_mandosmedios`) : Promise.resolve([]),
      necesitaNomina ? querysql(`SELECT * FROM seg_vida`) : Promise.resolve([]),
      necesitaNomina ? querysql(`SELECT * FROM subsidio_isr`) : Promise.resolve([]),

      necesitaLicencias ? query("LICENCIAS", { status: 1 }) : Promise.resolve([]),
      necesitaGasadmi ? query("PERSONAL_GASADMI", {}) : Promise.resolve([]),
      necesitaEstimulo ? query("PERSONAL_ESTIMULO", {}) : Promise.resolve([])
    ]);

    catalogoBase.forEach(x => baseMap.set(String(x.nivel), x));
    catalogoContrato.forEach(x => contratoMap.set(String(x.nivel), x));
    catalogoMandos.forEach(x => mandosMap.set(String(x.nivel), x));
    quinBase.forEach(x => quinBaseMap.set(String(x.nivel), x));
    quinConfianza.forEach(x => quinConfianzaMap.set(String(x.nivel), x));
    quinMandos.forEach(x => quinMandosMap.set(String(x.nivel), x));
    segVida.forEach(x => segVidaMap.set(String(x.nivel), x));

    licencias.forEach(x => licenciaMap.set(String(x.id_employee), true));
    personalGasadmi.forEach(x => gasadmiMap.set(String(x.id_employee), x));
    personalEstimulo.forEach(x => estimuloMap.set(String(x.id_employee), x));

    let filtro = {};

    if (ADSCRIPCION !== null) {
      if (SUBNIVELES !== true) {
        filtro.ADSCRIPCION = ADSCRIPCION;
      }
    }

    if (SUBNIVELES === true && ADSCRIPCION !== null) {
      const resultado = await querysql(`SELECT clave FROM adscripciones WHERE nombre = ? `, [ADSCRIPCION]);
      claveAdscripcion = resultado?.[0]?.clave;
      const include104 = Number(claveAdscripcion) === 102;

      const adscripciones = await querysql(
        `WITH RECURSIVE jerarquia AS ( SELECT id_adscripcion, nombre, clave, parent_id FROM adscripciones WHERE clave = ${claveAdscripcion} UNION ALL SELECT a.id_adscripcion, a.nombre, a.clave, a.parent_id FROM adscripciones a INNER JOIN jerarquia j ON a.parent_id = j.id_adscripcion ) SELECT * FROM jerarquia;`
      );

      claves = adscripciones.map(a => a.clave);

      // Si la clave solicitada es 102, incluir también 104 en la lista de claves
      if (include104 && !claves.includes(104)) {
        claves.push(104);
      }
    }

    if (TIPONOM && TIPONOM?.length > 0) {
      filtro.TIPONOM = { $in: TIPONOM };
    }

    if (CLAVECAT && CLAVECAT !== null) {
      filtro.CLAVECAT = CLAVECAT;
    }

    if (FECHA_INGRESO?.start || FECHA_INGRESO?.end) {
      filtro.FECHA_INGRESO = {};

      if (FECHA_INGRESO.start) {
        filtro.FECHA_INGRESO.$gte = moment.utc(
          FECHA_INGRESO.start,
          'YYYY-MM-DD'
        ).startOf('day').toDate();
      }

      if (FECHA_INGRESO.end) {
        filtro.FECHA_INGRESO.$lte = moment.utc(
          FECHA_INGRESO.end,
          'YYYY-MM-DD'
        ).endOf('day').toDate();
      }
    }

    if (FECHA_NOMBRAMIENTO?.start || FECHA_NOMBRAMIENTO?.end) {
      filtro.FECHA_NOMBRAMIENTO = {};

      if (FECHA_NOMBRAMIENTO.start) {
        filtro.FECHA_NOMBRAMIENTO.$gte = moment.utc(
          FECHA_NOMBRAMIENTO.start,
          'YYYY-MM-DD'
        ).startOf('day').toDate();
      }

      if (FECHA_NOMBRAMIENTO.end) {
        filtro.FECHA_NOMBRAMIENTO.$lte = moment.utc(
          FECHA_NOMBRAMIENTO.end,
          'YYYY-MM-DD'
        ).endOf('day').toDate();
      }
    }

    if (NUMQUIN !== null && NUMQUIN !== undefined && NUMQUIN !== '') {
      filtro.NUMQUIN = Number(NUMQUIN);
    }

    if (SEXO && SEXO !== null) {
      filtro.SEXO = SEXO
    }

    if (FECHA_NAC?.start || FECHA_NAC?.end) {
      filtro.FECHA_NAC = {};

      if (FECHA_NAC.start) {
        filtro.FECHA_NAC.$gte = moment.utc(
          FECHA_NAC.start,
          'YYYY-MM-DD'
        ).startOf('day').toDate();
      }

      if (FECHA_NAC.end) {
        filtro.FECHA_NAC.$lte = moment.utc(
          FECHA_NAC.end,
          'YYYY-MM-DD'
        ).endOf('day').toDate();
      }
    }

    if (STATUS_EMPLEADO) {
      if (STATUS_EMPLEADO === "ACTIVO") {
        filtro["$or"] = [
          { STATUS_EMPLEADO: { $exists: false } },
          { STATUS_EMPLEADO: null },
          { STATUS_EMPLEADO: { $size: 0 } },
          {
            STATUS_EMPLEADO: {
              $not: {
                $elemMatch: {
                  STATUS: { $ne: null }
                }
              }
            }
          }
        ];
      } else {
        filtro.STATUS_EMPLEADO = {
          $elemMatch: { STATUS: STATUS_EMPLEADO }
        };
      }
    }

    filtro.status = 1;

    const employees = await query("PLANTILLA", filtro);

    if (!employees || employees.length === 0) {
      return res.status(404).json({ message: "No hay empleados con los filtros especificados" });
    }

    let empleadosFiltrados = employees;

    if (CLAVE && CLAVE !== null) {
      const claveArray = Array.isArray(CLAVE) ? CLAVE : [CLAVE];
      empleadosFiltrados = empleadosFiltrados.filter((emp) => {
        const statusClave = emp.STATUS_EMPLEADO?.find(se => se.CLAVE)?.CLAVE;
        const claveToCheck = statusClave !== undefined ? statusClave : emp.CLAVE;
        return claveArray.includes(claveToCheck);
      });
    }

    if (SUBNIVELES === true && ADSCRIPCION != null) {
      let claveArray = SUBNIVELES ? claves.map(c => Number(c)) : (Array.isArray(claveAdscripcion) ? claveAdscripcion : [claveAdscripcion]).map(c => Number(c));

      if (claveArray.includes(102)) {
        claveArray = [...new Set([...claveArray, 104])];
      }

      empleadosFiltrados = empleadosFiltrados.filter(emp =>
        claveArray.includes(Number(emp.CLAVE))
      );

      empleadosFiltrados = empleadosFiltrados.map(emp => ({
        ...emp,
        CLAVE: Number(emp.CLAVE),
        ADSCRIPCION: emp.ADSCRIPCION
      }));

      const jerarquia = await querysql(`
        WITH RECURSIVE jerarquia AS (
          SELECT 
            id_adscripcion,
            nombre,
            clave,
            parent_id,
            CAST(LPAD(clave, 5, '0') AS CHAR(100)) AS path
          FROM adscripciones
          WHERE parent_id IS NULL
          
          UNION ALL
          
          SELECT 
            a.id_adscripcion,
            a.nombre,
            a.clave,
            a.parent_id,
            CONCAT(j.path, '-', LPAD(a.clave, 5, '0'))
          FROM adscripciones a
          INNER JOIN jerarquia j 
            ON a.parent_id = j.id_adscripcion
        )
        SELECT id_adscripcion, nombre, clave, parent_id, path FROM jerarquia ORDER BY path
      `);

      const pathMap = new Map();
      jerarquia.forEach(item => {
        pathMap.set(item.clave, item.path);
      });

      empleadosFiltrados.sort((a, b) => {
        const pathA = pathMap.get(Number(a.CLAVE)) || '';
        const pathB = pathMap.get(Number(b.CLAVE)) || '';

        return pathA.localeCompare(pathB);
      });
    }

    if (GASADMIN !== null && GASADMIN !== undefined) {
      empleadosFiltrados = empleadosFiltrados.filter(empleado => {
        const tieneGasadmin = gasadmiMap.has(String(empleado._id));
        return GASADMIN ? tieneGasadmin : !tieneGasadmin;
      });
    }

    if (ESTIMULO !== null && ESTIMULO !== undefined) {
      empleadosFiltrados = empleadosFiltrados.filter(empleado => {
        const tieneEstimuloDiferente = estimuloMap.has(String(empleado._id));
        return ESTIMULO ? tieneEstimuloDiferente : !tieneEstimuloDiferente;
      });
    }

    if (FONDO_PENSIONES !== null && FONDO_PENSIONES !== undefined) {
      empleadosFiltrados = empleadosFiltrados.filter(empleado => {
        const cubriendoLicencia = licenciaMap.has(String(empleado._id));
        const tieneFechaNombramiento = !!empleado.FECHA_NOMBRAMIENTO;

        if (FONDO_PENSIONES === true) {
          return !cubriendoLicencia && tieneFechaNombramiento;
        }

        if (FONDO_PENSIONES === false) {
          return cubriendoLicencia || !tieneFechaNombramiento;
        }

        return true;
      });
    }

    if (CUOTA_SINDICAL !== null && CUOTA_SINDICAL !== undefined) {
      empleadosFiltrados = empleadosFiltrados.filter(empleado => {
        const cubriendoLicencia = licenciaMap.has(String(empleado._id));
        const aplicaCuotaSindicial = !!empleado.SINDICATO?.CUOTA_SINDICAL === true;

        if (CUOTA_SINDICAL === true) {
          return !cubriendoLicencia && aplicaCuotaSindicial;
        }

        if (CUOTA_SINDICAL === false) {
          return cubriendoLicencia || !aplicaCuotaSindicial;
        }

        return true;
      });
    }

    if (LICENCIA !== null && LICENCIA !== undefined) {
      empleadosFiltrados = empleadosFiltrados.filter(empleado => {
        const cubreLicencia = licenciaMap.has(String(empleado._id));
        return LICENCIA ? cubreLicencia : !cubreLicencia;
      });
    }

    if (empleadosFiltrados.length === 0) {
      return res.status(404).json({ message: "No hay empleados con el nombre especificado" });
    }

    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("PLANTILLA");

    // Definición de todas las columnas disponibles
    const columnas = [
      // Identificación
      { header: "NUMEMP", key: "NUMEMP" },
      { header: "NUMPLA", key: "NUMPLA" },
      { header: "NOMBRE", key: "NOMBRE_COMPLETO" },

      // Datos laborales
      { header: "CLAVE", key: "CLAVE" },
      { header: "AREA", key: "ADSCRIPCION" },
      { header: "PROYECTO", key: "PROYECTO" },
      { header: "TIPONOM", key: "TIPONOM" },
      { header: "MOD_ANTE", key: "MOD_ANTE" },
      { header: "CLAVECAT", key: "CLAVECAT" },
      { header: "NOMCATE", key: "NOMCATE" },
      { header: "NIVEL", key: "NIVEL" },
      { header: "INGRESO", key: "FECHA_INGRESO" },
      { header: "NOMBRAMIENTO", key: "FECHA_NOMBRAMIENTO" },
      { header: "NUMQUIN", key: "NUMQUIN" },

      // Percepciones
      { header: "SUELDO", key: "SUELDO" },
      { header: "QUINENIO", key: "QUINQUENIO" },
      { header: "PSM", key: "PSM" },
      { header: "API BASE", key: "API_BASE" },
      { header: "API CONFIANZA", key: "API_CONFIANZA" },
      { header: "API MANDOS MEDIOS", key: "API_MANDOS_MEDIOS" },
      { header: "DESPENSA", key: "DESPENSA" },
      { header: "ACT_CUL_DEP", key: "ACT_CUL_DEP" },
      { header: "GUARDERIA", key: "GUARDERIA" },
      { header: "DIA_AJUSTE", key: "DIA_AJUSTE" },
      { header: "CANASTA", key: "CANASTA" },
      { header: "ESTIMULO", key: "ESTIMULO" },
      { header: "GASADMI", key: "GASADMI" },
      { header: "COMP_FIJA_GARAN", key: "COMP_FIJA_GARAN" },
      { header: "PERCEPCIONES", key: "TOTAL_PERCEPCIONES" },

      // Deducciones
      { header: "ISR", key: "ISR" },
      { header: "FONDODEP", key: "FONDODEP" },
      { header: "IMSS", key: "IMSS" },
      { header: "CUOTASIN", key: "CUOTA_SINDICAL" },
      { header: "SEGURO_VIDA", key: "SEGURO_VIDA" },
      { header: "DEDUCCIONES", key: "TOTAL_DEDUCCIONES" },
      { header: "NETO", key: "NETO" },

      // Datos personales
      { header: "CURP", key: "CURP" },
      { header: "RFC", key: "RFC" },
      { header: "SEXO", key: "SEXO" },
      { header: "FECHA_NAC", key: "FECHA_NAC" },
      { header: "NACIONALIDAD", key: "NACIONALIDAD" },
      { header: "EDOCIVIL", key: "ESTADO_CIVIL" },
      { header: "CONYUGE", key: "CONYUGE" },

      // Contacto
      { header: "CELULAR", key: "TEL_PERSONAL" },
      { header: "EMAIL", key: "EMAIL" },

      // Domicilio
      { header: "CP", key: "CP" },
      { header: "DOMICILIO", key: "DOMICILIO" },
      { header: "LUGARNAC", key: "LUGARNAC" },

      // Datos médicos y emergencia
      { header: "AFILIACION", key: "AFILIACI" },
      { header: "SANGRE", key: "SANGRE" },
      { header: "ALERGIA", key: "ALERGIA" },
      { header: "AVISAR", key: "AVISAR" },
      { header: "TELEFONO", key: "TEL_EMERGENCIA1" },
      { header: "TELEFONO1", key: "TEL_EMERGENCIA2" },

      // Familia
      { header: "PADRE", key: "PADRE" },
      { header: "MADRE", key: "MADRE" },

      // Profesional
      { header: "PROFESION", key: "PROFESION1" },
      { header: "PROFESION2", key: "PROFESION2" },

      // Datos bancarios
      { header: "TIPOPAGO", key: "TIPOPAG" },
      { header: "BANCO", key: "BANCO" },
      { header: "CUENTA", key: "CUENTA" },
      { header: "FOLIONORTE", key: "FOLNORTE" },

      // Operativos
      { header: "NUMTARJETA", key: "NUMTARJETA" },
      { header: "TURNOMAT", key: "TURNOMAT" },
      { header: "TURNOVES", key: "TURNOVES" },
      { header: "AREAR_ESP", key: "AREA_RESP" },
      { header: "ESTATUS_UNO", key: "PRIMER_STATUS" },
      { header: "LUGAR_FISICAMENTE", key: "LUGAR_FISICAMENTE1" },
      { header: "FECHAS", key: "FECHA1" },
      { header: "ESTATUS_DOS", key: "SEGUNDO_STATUS" },
      { header: "LUGAR_FISICAMENTE", key: "LUGAR_FISICAMENTE2" },
      { header: "FECHAS", key: "FECHA2" },

      // Históricos
      { header: "OCUPANTE_ANTERIOR", key: "OCUPANTE_ANT" },
      { header: "FECHA_BAJA", key: "FECHA_BAJA" },
      { header: "MOTIVO", key: "MOTIVO" },
    ];

    // Relacionar cada checkbox del formulario con sus columnas de Excel
    const columnasPorCampo = {
      NUEMP: ["NUMEMP"],
      NUMPLA: ["NUMPLA"],
      NOMBRE: ["NOMBRE_COMPLETO"],
      CLAVE: ["CLAVE"],
      AREA: ["ADSCRIPCION"],
      PROYECTO: ["PROYECTO"],
      TIPONOM: ["TIPONOM"],
      MOD_ANT: ["MOD_ANTE"],
      CLAVECAT: ["CLAVECAT"],
      NOMCATE: ["NOMCATE"],
      NIVEL: ["NIVEL"],
      INGRESO: ["FECHA_INGRESO"],
      NOMBRAMIENTO: ["FECHA_NOMBRAMIENTO"],
      NUMQUIN: ["NUMQUIN"],

      PERCEPCIONES: [
        "SUELDO",
        "QUINQUENIO",
        "PSM",
        "API_BASE",
        "API_CONFIANZA",
        "API_MANDOS_MEDIOS",
        "DESPENSA",
        "ACT_CUL_DEP",
        "GUARDERIA",
        "DIA_AJUSTE",
        "CANASTA",
        "ESTIMULO",
        "GASADMI",
        "COMP_FIJA_GARAN"
      ],
      TOTAL_PERCEPCIONES: ["TOTAL_PERCEPCIONES"],

      DEDUCCIONES: [
        "ISR",
        "FONDODEP",
        "IMSS",
        "CUOTA_SINDICAL",
        "SEGURO_VIDA"
      ],
      TOTAL_DEDUCCIONES: ["TOTAL_DEDUCCIONES"],
      NETO: ["NETO"],

      CURP: ["CURP"],
      RFC: ["RFC"],
      SEXO: ["SEXO"],
      FECHA_NAC: ["FECHA_NAC"],
      NACIONALIDAD: ["NACIONALIDAD"],
      EDOCIVIL: ["ESTADO_CIVIL"],
      CONYUGE: ["CONYUGE"],
      CELULAR: ["TEL_PERSONAL"],
      EMAIL: ["EMAIL"],
      CP: ["CP"],
      DOMICILIO: ["DOMICILIO"],
      LUGARNAC: ["LUGARNAC"],

      AFILIACION: ["AFILIACI"],
      SANGRE: ["SANGRE"],
      ALERGIA: ["ALERGIA"],
      AVISAR: ["AVISAR"],
      TELEFONOS_EMERGENCIA: [
        "TEL_EMERGENCIA1",
        "TEL_EMERGENCIA2"
      ],

      PADRE: ["PADRE"],
      MADRE: ["MADRE"],
      PROFESION: ["PROFESION1", "PROFESION2"],

      BANCO: ["TIPOPAG", "BANCO", "CUENTA", "FOLNORTE"],
      TARJETA: ["NUMTARJETA"],
      HORARIO: ["TURNOMAT", "TURNOVES"],
      AREARESP: ["AREA_RESP"],
      STATUS_EMPLEADO: [
        "PRIMER_STATUS",
        "LUGAR_FISICAMENTE1",
        "FECHA1",
        "SEGUNDO_STATUS",
        "LUGAR_FISICAMENTE2",
        "FECHA2"
      ],

      OCUPANTE_ANT: [
        "OCUPANTE_ANT",
        "FECHA_BAJA",
        "MOTIVO"
      ]
    };

    const camposSeleccionados = CAMPOS || {};

    const clavesSeleccionadas = new Set(
      Object.entries(camposSeleccionados)
        .filter(([campo, seleccionado]) =>
          seleccionado === true &&
          Object.prototype.hasOwnProperty.call(columnasPorCampo, campo)
        )
        .flatMap(([campo]) => columnasPorCampo[campo])
    );

    const columnasFiltradas = columnas.filter(columna =>
      clavesSeleccionadas.has(columna.key)
    );

    worksheet.columns = columnasFiltradas;


    const columnasNumericas = new Set([
      "SUELDO",
      "QUINQUENIO",
      "PSM",
      "API_BASE",
      "API_CONFIANZA",
      "API_MANDOS_MEDIOS",
      "DESPENSA",
      "ACT_CUL_DEP",
      "DIA_AJUSTE",
      "CANASTA",
      "ESTIMULO",
      "GASADMI",
      "GUARDERIA",
      "COMP_FIJA_GARAN",
      "TOTAL_PERCEPCIONES",
      "ISR",
      "FONDODEP",
      "IMSS",
      "CUOTA_SINDICAL",
      "SEGURO_VIDA",
      "TOTAL_DEDUCCIONES",
      "NETO"
    ]);

    columnasFiltradas.forEach(columna => {
      if (columnasNumericas.has(columna.key)) {
        worksheet.getColumn(columna.key).numFmt = "#,##0.00";
      }
    });


    const necesitaPlazas = campos.OCUPANTE_ANT === true;

    const plazas = necesitaPlazas
      ? await query("PLAZAS", {})
      : [];

    const mapaPlazas = new Map();

    plazas.forEach(p => {
      mapaPlazas.set(p.NUMPLA, p);
    });

    const areaRespMapping = {
      CTRAL: "CENTRAL",
      AUD: "AUDITORÍA",
      PLAN: "PLANEACIÓN",
      CAST: "CATASTRO",
    };

    const motivoBajaMapping = {
      "R-DEF": "RENUNCIA - DEFINITIVA",
      "R-OCA": "RENUNCIA - POR OCUPAR OTRO CARGO",
      "R-JUB": "RENUNCIA - POR JUBILACIÓN",
      "R-PEN": "RENUNCIA - POR PENSIÓN",
      "L-IBASE": "LICENCIA - INDEFINIDA A BASE",
      "L-SS": "LICENCIA - SIN GOCE DE SUELDO",
      "L-PRRO": "LICENCIA - PRÓRROGA",
      "RR": "RECISIÓN O REVOCACIÓN",
      "DEF": "DEFUNCIÓN"
    };

    const tipoStatusMapping = {
      COM_SDCL: "COMISIONADO AL SINDICATO",
      COM_LAB: "COMISIONADO LABORALMENTE",
      ASIG_LAB: "ASIGNADO LABORALMENTE",
      EXIMA: "EXIMA",
      LISTA_ASIST: "LISTA DE ASISTENCIA",
    };

    for (const item of empleadosFiltrados) {
      let percepciones = {};
      let deducciones = {};

      let totalPercepciones = 0;
      let totalDeducciones = 0;
      let percepcionNeta = 0;

      if (necesitaNomina) {
        const resultadoNomina = await procesarNomina(item);

        percepciones = resultadoNomina.percepciones;
        deducciones = resultadoNomina.deducciones;

        const sumarPercepciones = obj =>
          Object.entries(obj || {}).reduce((total, [key, valor]) => {
            if (["nivel", "id"].includes(key)) return total;

            const numero = Number(valor);
            return total + (Number.isNaN(numero) ? 0 : numero);
          }, 0);

        const sumarDeducciones = obj =>
          Object.values(obj || {}).reduce((total, valor) => {
            const numero = Number.parseFloat(valor);
            return total + (Number.isNaN(numero) ? 0 : numero);
          }, 0);

        totalPercepciones = sumarPercepciones(percepciones);
        totalDeducciones = sumarDeducciones(deducciones);
        percepcionNeta = totalPercepciones - totalDeducciones;
      }

      const plaza = mapaPlazas.get(item.NUMPLA) || {};
      const ocupanteReciente = (plaza.previousOcuppants || []).slice(-1)[0] || {};
      const dischargeDate = ocupanteReciente.FECHA_BAJA ? new Date(ocupanteReciente.FECHA_BAJA) : '';

      const direccion = item.DIRECCION || {};
      const estudios = item.ESTUDIOS || {};
      const est1 = estudios.PRIMER_ESTUDIO || {};
      const est2 = estudios.SEGUNDO_ESTUDIO || {};
      const quinquenio = Object.entries(percepciones)
        .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

      const formatearFecha = (fecha) => {
        if (!fecha) return '';

        const [anio, mes, dia] = fecha.split('-');

        return `${dia}-${mes}-${anio}`;
      };

      const fila = {
        ...item,
        SUELDO: Number(percepciones.sueldo_base) || 0.00,
        QUINQUENIO: Number(quinquenio) || 0.00,
        PSM: Number(percepciones.psm) || 0.00,
        API_BASE: Number(percepciones.api_base) || 0.00,
        API_CONFIANZA: Number(percepciones.api_contrato) || 0.00,
        API_MANDOS_MEDIOS: Number(percepciones.api_mms) || 0.00,
        DESPENSA: Number(percepciones.despensa) || 0.00,
        ACT_CUL_DEP: Number(percepciones.act_cul_dep) || 0.00,
        DIA_AJUSTE: Number(percepciones.dia_ajuste) || 0.00,
        CANASTA: Number(percepciones.canasta_basica) || 0.00,
        ESTIMULO: Number(percepciones.estimulo) || 0.00,
        GASADMI: Number(percepciones.gasadmi) || 0.00,
        GUARDERIA: Number(percepciones.guarderia) || 0.00,
        COMP_FIJA_GARAN: Number(percepciones.comp_fija_garan) || 0.00,
        TOTAL_PERCEPCIONES: Number(totalPercepciones.toFixed(2)) || 0.00,

        ISR: Number(deducciones.ISR) || 0.00,
        FONDODEP: Number(deducciones.FONDO_PENSIONES) || 0.00,
        IMSS: Number(deducciones.IMSS) || 0.00,
        CUOTA_SINDICAL: Number(deducciones.CUOTA_SINDICAL) || 0.00,
        SEGURO_VIDA: Number(deducciones.SEGURO_VIDA) || 0.00,
        TOTAL_DEDUCCIONES: Number(totalDeducciones.toFixed(2)) || 0.00,
        NETO: Number(percepcionNeta.toFixed(2)) || 0.00,

        NOMBRE_COMPLETO: item.status === 1 ? `${item.APE_PAT || ""} ${item.APE_MAT || ""} ${item.NOMBRES || ""}`.trim()
          : item.status === 3 ? 'PROPUESTA POR APLICAR' : 'VACANTE',

        CLAVE: item.CLAVE,
        ADSCRIPCION: item.ADSCRIPCION,
        AREA_RESP: areaRespMapping[item.AREA_RESP] || item.AREA_RESP || "",
        PRIMER_STATUS: tipoStatusMapping[item?.STATUS_EMPLEADO?.[0]?.STATUS] || '',
        LUGAR_FISICAMENTE1: item?.STATUS_EMPLEADO?.[0]?.LUGAR_COMISIONADO || '',
        FECHA1: item?.STATUS_EMPLEADO?.[0]
          ? `${formatearFecha(item.STATUS_EMPLEADO[0].DESDE)} / ${formatearFecha(item.STATUS_EMPLEADO[0].HASTA)}`
          : '',

        SEGUNDO_STATUS: tipoStatusMapping[item?.STATUS_EMPLEADO?.[1]?.STATUS] || '',
        LUGAR_FISICAMENTE2: item?.STATUS_EMPLEADO?.[1]?.LUGAR_COMISIONADO || '',
        FECHA2: item?.STATUS_EMPLEADO?.[1]
          ? `${formatearFecha(item.STATUS_EMPLEADO[1].DESDE)} / ${formatearFecha(item.STATUS_EMPLEADO[1].HASTA)}`
          : '',

        CP: direccion?.CP || item.CP || "",
        DOMICILIO: direccion?.DOMICILIO
          ? `${direccion.DOMICILIO} ${direccion.NUM_EXT || ""}${direccion.COLONIA ? `, ${direccion.COLONIA}` : ""
          }${direccion.MUNICIPIO ? `, ${direccion.MUNICIPIO}` : ""}${direccion.ESTADO ? `, ${direccion.ESTADO}` : ""
          }`
          : item.DOMICILIO || "",

        PROFESION1: est1?.NIVEL_ESTUDIO
          ? `${est1.NIVEL_ESTUDIO} ${est1.PROFES || ""}${est1.CEDULA ? ` (CÉDULA: ${est1.CEDULA})` : ""
          }`
          : item.PROFES || "",

        PROFESION2: est2?.NIVEL_ESTUDIO
          ? `${est2.NIVEL_ESTUDIO} ${est2.PROFES || ""}${est2.CEDULA ? ` (CÉDULA: ${est2.CEDULA})` : ""
          }`
          : "",

        OCUPANTE_ANT: ocupanteReciente.NOMBRE || "",
        FECHA_BAJA: dischargeDate,
        MOTIVO: motivoBajaMapping[ocupanteReciente.MOTIVO_BAJA] || ocupanteReciente.MOTIVO_BAJA || "",
      };


      worksheet.addRow(fila);
    };

    worksheet.getRow(1).font = { bold: true };

    // Genera el archivo y responde para descarga
    const fileName = `PLANTILLA.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error al generar el archivo Excel:", error.message);
    res.status(500).json({ message: "Error al generar el archivo Excel." });
  }
};

reportesPersonalController.getPlantillaXLSX = async (req, res) => {
  const [
    catalogoBase,
    catalogoContrato,
    catalogoMandos,
    isrTable,
    quinBase,
    quinConfianza,
    quinMandos,
    segVida,
    subsidioISR,
    licencias,
    personalGasadmi,
    personalEstimulo
  ] = await Promise.all([
    querysql(`SELECT * FROM catalogo_base`),
    querysql(`SELECT * FROM catalogo_contrato`),
    querysql(`SELECT * FROM catalogo_mandosmedios`),
    querysql(`SELECT * FROM catalogo_isr`),
    querysql(`SELECT * FROM quin_base`),
    querysql(`SELECT * FROM quin_confianza`),
    querysql(`SELECT * FROM quin_mandosmedios`),
    querysql(`SELECT * FROM seg_vida`),
    querysql(`SELECT * FROM subsidio_isr`),

    query("LICENCIAS", { status: 1 }),
    query("PERSONAL_GASADMI", {}),
    query("PERSONAL_ESTIMULO", {})
  ]);

  const baseMap = new Map();
  catalogoBase.forEach(x => baseMap.set(String(x.nivel), x));

  const contratoMap = new Map();
  catalogoContrato.forEach(x => contratoMap.set(String(x.nivel), x));

  const mandosMap = new Map();
  catalogoMandos.forEach(x => mandosMap.set(String(x.nivel), x));

  const quinBaseMap = new Map();
  quinBase.forEach(x => quinBaseMap.set(String(x.nivel), x));

  const quinConfianzaMap = new Map();
  quinConfianza.forEach(x => quinConfianzaMap.set(String(x.nivel), x));

  const quinMandosMap = new Map();
  quinMandos.forEach(x => quinMandosMap.set(String(x.nivel), x));

  const segVidaMap = new Map();
  segVida.forEach(x => segVidaMap.set(String(x.nivel), x));

  const licenciaMap = new Map();

  licencias.forEach(x => {
    licenciaMap.set(String(x.id_employee), true);
  });

  const gasadmiMap = new Map();

  personalGasadmi.forEach(x => {
    gasadmiMap.set(String(x.id_employee), x);
  });

  const estimuloMap = new Map();

  personalEstimulo.forEach(x => {
    estimuloMap.set(String(x.id_employee), x);
  });

  const buscarISR = (sueldoGravable) => {
    return isrTable.find(r =>
      sueldoGravable >= Number(r.limite_inf) &&
      sueldoGravable <= Number(r.limite_sup)
    );
  };

  const buscarSubsidio = (sueldoGravable) => {
    return subsidioISR.find(r =>
      sueldoGravable >= Number(r.lim_inf) &&
      sueldoGravable <= Number(r.lim_sup)
    );
  };

  const obtenerQuinquenio = (mapa, nivel, numQuin) => {

    if (!numQuin || numQuin <= 0)
      return 0;

    const fila = mapa.get(String(nivel));

    if (!fila)
      return 0;

    return Number(fila[`quin_${numQuin}`]) || 0;
  };

  async function procesarNomina(employee) {
    let percepciones = {};
    let deducciones = {};

    employee.CUBRIENDO_LICENCIA = licenciaMap.has(String(employee._id));

    const nivel = String(employee.NIVEL);
    const tipo = employee.TIPONOM;

    switch (tipo) {

      // ======================
      // 🔸 BASE
      // ======================
      case "M51":
      case "F51":

        // ✅ CLONAR objeto para evitar mutación global
        percepciones = { ...baseMap.get(nivel) };
        if (!percepciones) break;

        const dataGasadmi = gasadmiMap.get(String(employee._id));

        if (dataGasadmi) {
          percepciones.gasadmi = dataGasadmi.gasadmi;
        }

        if (employee.NUM_HIJOS && employee.NUM_HIJOS > 0) {
          percepciones.guarderia = (Number(employee.NUM_HIJOS) * Number(percepciones.guarderia)).toFixed(2);
        } else {
          delete percepciones.guarderia;
        }

        // ✅ ELIMINAR cualquier quinquenio previo
        Object.keys(percepciones).forEach(key => {
          if (key.startsWith("QUINQUENIOS")) {
            delete percepciones[key];
          }
        });

        const sueldoBase = parseFloat(percepciones.sueldo_base);

        // Determinar si la quincena actual es de 16 días (segunda quincena de mes con 31 días) para aunmentar el día de ajuste
        // const now = new Date();
        // const day = now.getDate();
        // const month = now.getMonth() + 1;
        // const isSegundaQuincena16Dias = day > 15 && [1, 3, 5, 7, 8, 10, 12].includes(month);

        let sueldoGravableB;
        // if (isSegundaQuincena16Dias) {
        //   const diaAjuste = percepciones.sueldo_base / 30;
        //   percepciones.dia_ajuste = diaAjuste.toFixed(2);
        // }

        const quinquenioBase =
          obtenerQuinquenio(
            quinBaseMap,
            employee.NIVEL,
            employee.NUMQUIN
          );

        if (quinquenioBase) {
          percepciones[`QUINQUENIOS: ${employee.NUMQUIN}`] =
            quinquenioBase;
        }

        sueldoGravableB = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.despensa) +
          parseFloat(percepciones.act_cul_dep) +
          parseFloat(percepciones.api_base) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.gasadmi ? percepciones.gasadmi : 0) +
          parseFloat(quinquenioBase) +
          parseFloat(percepciones.guarderia ? percepciones.guarderia : 0)
        ).toFixed(2);

        const isrObjectB = buscarISR(Number(sueldoGravableB));

        const isrBrutoB =
          ((sueldoGravableB - parseFloat(isrObjectB.limite_inf)) *
            parseFloat(isrObjectB.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectB.cuota_fija);

        const subsidioB = Number(buscarSubsidio(Number(sueldoGravableB))?.subsidio) || 0;

        let isrFinal = isrBrutoB - subsidioB;
        if (isrFinal < 0) isrFinal = 0;

        const isrRedondeado = (Math.round(isrFinal * 10) / 10).toFixed(2);
        deducciones.ISR = isrRedondeado;

        if (!employee.CUBRIENDO_LICENCIA && employee.FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_BASE = (sueldoBase * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_BASE * 10) / 10).toFixed(2);
        }
        if (!employee.CUBRIENDO_LICENCIA && employee.SINDICATO?.CUOTA_SINDICAL === true) {
          const CUOTA_SINDICAL_BASE = (sueldoBase * 0.01).toFixed(2);
          deducciones.CUOTA_SINDICAL = (Math.round(CUOTA_SINDICAL_BASE * 10) / 10).toFixed(2);
        }

        const IMSS_BASE = (sueldoBase * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_BASE * 10) / 10).toFixed(2);

        break;

      // ======================
      // 🔸 CONTRATO
      // ======================
      case "FCT":
      case "CCT":
      case "F53":
      case "M53":

        percepciones = { ...contratoMap.get(nivel) };
        if (!percepciones) break;

        const estimuloRealConfianza = estimuloMap.get(String(employee._id));

        if (estimuloRealConfianza) {
          percepciones.estimulo = estimuloRealConfianza.estimulo;
        }

        // ✅ ELIMINAR cualquier quinquenio previo
        Object.keys(percepciones).forEach(key => {
          if (key.startsWith("QUINQUENIOS")) {
            delete percepciones[key];
          }
        });

        const quinquenioCC =
          obtenerQuinquenio(
            quinConfianzaMap,
            employee.NIVEL,
            employee.NUMQUIN
          );

        if (quinquenioCC) {
          percepciones[`QUINQUENIOS: ${employee.NUMQUIN}`] =
            quinquenioCC;
        }

        const sueldoGravableCC = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.canasta_basica) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.estimulo) +
          parseFloat(percepciones.api_contrato) +
          parseFloat(quinquenioCC)
        ).toFixed(2);

        const isrObjectCC = buscarISR(Number(sueldoGravableCC));

        const isrBrutoCC =
          ((sueldoGravableCC - parseFloat(isrObjectCC.limite_inf)) *
            parseFloat(isrObjectCC.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectCC.cuota_fija);

        const subsidioCC = Number(buscarSubsidio(Number(sueldoGravableCC))?.subsidio) || 0;

        let isrFinalCC = isrBrutoCC - subsidioCC;
        if (isrFinalCC < 0) isrFinalCC = 0;

        deducciones.ISR = (Math.round(isrFinalCC * 10) / 10).toFixed(2);

        if (employee.FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_CC = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_CC * 10) / 10).toFixed(2);
        }

        const IMSS_CC = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_CC * 10) / 10).toFixed(2);

        break;

      case "FCO":
      case "511":

        percepciones = { ...contratoMap.get(nivel) };
        if (!percepciones) break;

        const estimuloRealNombramiento =
          estimuloMap.get(String(employee._id));

        if (estimuloRealNombramiento) {
          percepciones.estimulo = estimuloRealNombramiento.estimulo;
        }

        // ✅ ELIMINAR cualquier quinquenio previo
        Object.keys(percepciones).forEach(key => {
          if (key.startsWith("QUINQUENIOS")) {
            delete percepciones[key];
          }
        });

        const quinquenioCN =
          obtenerQuinquenio(
            quinConfianzaMap,
            employee.NIVEL,
            employee.NUMQUIN
          );

        if (quinquenioCN) {
          percepciones[`QUINQUENIOS: ${employee.NUMQUIN}`] =
            quinquenioCN;
        }

        const sueldoGravableCN = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.canasta_basica) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.estimulo) +
          parseFloat(percepciones.api_contrato) +
          parseFloat(quinquenioCN)
        ).toFixed(2);

        const isrObjectCN = buscarISR(Number(sueldoGravableCN));

        const isrBrutoCN =
          ((sueldoGravableCN - parseFloat(isrObjectCN.limite_inf)) *
            parseFloat(isrObjectCN.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectCN.cuota_fija);

        const subsidioCN = Number(buscarSubsidio(Number(sueldoGravableCN))?.subsidio) || 0;

        let isrFinalCN = isrBrutoCN - subsidioCN;
        if (isrFinalCN < 0) isrFinalCN = 0;

        deducciones.ISR = (Math.round(isrFinalCN * 10) / 10).toFixed(2);

        if (employee.FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_CN = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_CN * 10) / 10).toFixed(2);
        }

        if (employee.SINDICATO?.CUOTA_SINDICAL === true) {
          const CUOTA_SINDICAL_CN = (parseFloat(percepciones.sueldo_base) * 0.01).toFixed(2);
          deducciones.CUOTA_SINDICAL = (Math.round(CUOTA_SINDICAL_CN * 10) / 10).toFixed(2);
        }

        const IMSS_CN = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_CN * 10) / 10).toFixed(2);

        break;

      // ======================
      // 🔸 MANDOS MEDIOS
      // ======================
      case "FMM":
      case "MMS":

        percepciones = { ...mandosMap.get(nivel) };
        if (!percepciones) break;

        // ✅ ELIMINAR cualquier quinquenio previo
        Object.keys(percepciones).forEach(key => {
          if (key.startsWith("QUINQUENIOS")) {
            delete percepciones[key];
          }
        });

        const quinquenioMms =
          obtenerQuinquenio(
            quinMandosMap,
            employee.NIVEL,
            employee.NUMQUIN
          );

        if (quinquenioMms) {
          percepciones[`QUINQUENIOS: ${employee.NUMQUIN}`] =
            quinquenioMms;
        }

        const sueldoGravableMM = (
          parseFloat(percepciones.sueldo_base) +
          parseFloat(percepciones.psm) +
          parseFloat(percepciones.comp_fija_garan) +
          parseFloat(percepciones.api_mms) +
          parseFloat(quinquenioMms)
        ).toFixed(2);

        const isrObjectMM = buscarISR(Number(sueldoGravableMM));

        const isrBrutoMM =
          ((sueldoGravableMM - parseFloat(isrObjectMM.limite_inf)) *
            parseFloat(isrObjectMM.porcentajeliminf)) /
          100 +
          parseFloat(isrObjectMM.cuota_fija);

        const subsidioMM = Number(buscarSubsidio(Number(sueldoGravableMM))?.subsidio) || 0;

        let isrFinalMM = isrBrutoMM - subsidioMM;
        if (isrFinalMM < 0) isrFinalMM = 0;

        deducciones.ISR = (Math.round(isrFinalMM * 10) / 10).toFixed(2);

        const IMSS_MMS = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
        deducciones.IMSS = (Math.round(IMSS_MMS * 10) / 10).toFixed(2);

        const seguro = segVidaMap.get(String(employee.NIVEL));

        const SEGURO_VIDA_MMS = Number(seguro?.seg_vida) || 0;

        deducciones.SEGURO_VIDA = (Math.round(SEGURO_VIDA_MMS * 10) / 10).toFixed(2);

        if (employee.FECHA_NOMBRAMIENTO) {
          const FONDO_PENSIONES_MMS = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
          deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_MMS * 10) / 10).toFixed(2);
        }

        delete percepciones.isr_rdl;
        delete percepciones.rdl;

        break;

      default:
        throw new Error("Tipo de nómina no reconocido");
    }

    return { percepciones, deducciones };
  }

  try {
    // Obtener el parámetro status de los params de la ruta y convertirlo a entero
    const statusParam = req.params.status ? req.params.status.split(',').map(Number) : [1];

    const filtro = { status: { $in: statusParam } };

    const plantilla = await query("PLANTILLA", filtro);

    if (!plantilla || plantilla.length === 0) {
      return res
        .status(404)
        .json({ message: "No hay registros de plantilla." });
    }

    // Crea el libro y la hoja
    const ExcelJS = require("exceljs");
    const moment = require("moment");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("PLANTILLA");

    const columnas = [
      // Identificación del empleado
      { header: "NUMEMP", key: "NUMEMP" },
      { header: "NUMPLA", key: "NUMPLA" },
      { header: "NOMBRE", key: "NOMBRE_COMPLETO" },

      // Datos laborales
      { header: "CLAVE", key: "CLAVE" },
      { header: "AREA", key: "ADSCRIPCION" },
      { header: "PROYECTO", key: "PROYECTO" },
      { header: "TIPONOM", key: "TIPONOM" },
      { header: "MOD_ANTE", key: "MOD_ANTE" },
      { header: "CLAVECAT", key: "CLAVECAT" },
      { header: "NOMCATE", key: "NOMCATE" },
      { header: "NIVEL", key: "NIVEL" },
      { header: "INGRESO", key: "FECHA_INGRESO" },
      { header: "NOMBRAMIENTO", key: "FECHA_NOMBRAMIENTO" },
      { header: "NUMQUIN", key: "NUMQUIN" },

      { header: "SUELDO", key: "SUELDO" },
      { header: "QUINENIO", key: "QUINQUENIO" },
      { header: "PSM", key: "PSM" },
      { header: "API BASE", key: "API_BASE" },
      { header: "API CONFIANZA", key: "API_CONFIANZA" },
      { header: "API MANDOS MEDIOS", key: "API_MANDOS_MEDIOS" },

      { header: "DESPENSA", key: "DESPENSA" },
      { header: "ACT_CUL_DEP", key: "ACT_CUL_DEP" },
      { header: "GUARDERIA", key: "GUARDERIA" },
      { header: "DIA_AJUSTE", key: "DIA_AJUSTE" },

      { header: "CANASTA", key: "CANASTA" },
      { header: "ESTIMULO", key: "ESTIMULO" },
      { header: "GASADMI", key: "GASADMI" },

      { header: "COMP_FIJA_GARAN", key: "COMP_FIJA_GARAN" },

      { header: "PERCEPCIONES", key: "TOTAL_PERCEPCIONES" },

      { header: "ISR", key: "ISR" },
      { header: "FONDODEP", key: "FONDODEP" },
      { header: "IMSS", key: "IMSS" },
      { header: "CUOTASIN", key: "CUOTA_SINDICAL" },
      { header: "SEGURO_VIDA", key: "SEGURO_VIDA" },
      { header: "DEDUCCIONES", key: "TOTAL_DEDUCCIONES" },

      { header: "NETO", key: "NETO" },

      // Datos personales
      { header: "CURP", key: "CURP" },
      { header: "RFC", key: "RFC" },
      { header: "SEXO", key: "SEXO" },
      { header: "FECHA_NAC", key: "FECHA_NAC" },
      { header: "NACIONALIDAD", key: "NACIONALIDAD" },
      { header: "EDOCIVIL", key: "ESTADO_CIVIL" },
      { header: "CONYUGE", key: "CONYUGE" },

      // Contacto
      { header: "CELULAR", key: "TEL_PERSONAL" },
      { header: "EMAIL", key: "EMAIL" },

      // Domicilio
      { header: "CP", key: "CP" },
      { header: "DOMICILIO", key: "DOMICILIO" },
      { header: "LUGARNAC", key: "LUGARNAC" },

      // Datos médicos / emergencia
      { header: "AFILIACION", key: "AFILIACI" },
      { header: "SANGRE", key: "SANGRE" },
      { header: "ALERGIA", key: "ALERGIA" },
      { header: "AVISAR", key: "AVISAR" },
      { header: "TELEFONO", key: "TEL_EMERGENCIA1" },
      { header: "TELEFONO1", key: "TEL_EMERGENCIA2" },

      // Familia
      { header: "PADRE", key: "PADRE" },
      { header: "MADRE", key: "MADRE" },

      // Profesional
      { header: "PROFESION", key: "PROFESION1" },
      { header: "PROFESION2", key: "PROFESION2" },

      // Datos bancarios
      { header: "TIPOPAGO", key: "TIPOPAG" },
      { header: "BANCO", key: "BANCO" },
      { header: "CUENTA", key: "CUENTA" },
      { header: "FOLIONORTE", key: "FOLNORTE" },

      // Operativos
      { header: "NUMTARJETA", key: "NUMTARJETA" },
      { header: "TURNOMAT", key: "TURNOMAT" },
      { header: "TURNOVES", key: "TURNOVES" },
      { header: "AREAR_ESP", key: "AREA_RESP" },
      { header: "COMISIONADO", key: "COMISIONADO" },
      { header: "LUGAR_COMISIONADO", key: "LUGAR_COMI" },

      // Históricos
      { header: "OCUPANTE_ANTERIOR", key: "OCUPANTE_ANT" },
      { header: "FECHA_BAJA", key: "FECHA_BAJA" },
      { header: "MOTIVO", key: "MOTIVO" },
    ];

    worksheet.columns = columnas;

    [
      "SUELDO",
      "QUINQUENIO",
      "PSM",
      "API_BASE",
      "API_CONFIANZA",
      "API_MANDOS_MEDIOS",
      "DESPENSA",
      "ACT_CUL_DEP",
      "DIA_AJUSTE",
      "CANASTA",
      "ESTIMULO",
      "GASADMI",
      "GUARDERIA",
      "COMP_FIJA_GARAN",
      "TOTAL_PERCEPCIONES",
      "ISR",
      "FONDODEP",
      "IMSS",
      "CUOTA_SINDICAL",
      "SEGURO_VIDA",
      "TOTAL_DEDUCCIONES",
      "NETO",
    ].forEach((key) => {
      worksheet.getColumn(key).numFmt = "#,##0.00";
    });

    const plazas = await query("PLAZAS", {});

    const mapaPlazas = new Map();

    plazas.forEach((p) => {
      mapaPlazas.set(p.NUMPLA, p);
    });

    const areaRespMapping = {
      CTRAL: "CENTRAL",
      AUD: "AUDITORÍA",
      PLAN: "PLANEACIÓN",
      CAST: "CATASTRO",
    };

    const motivoBajaMapping = {
      "R-DEF": "RENUNCIA - DEFINITIVA",
      "R-OCA": "RENUNCIA - POR OCUPAR OTRO CARGO",
      "R-JUB": "RENUNCIA - POR JUBILACIÓN",
      "R-PEN": "RENUNCIA - POR PENSIÓN",
      "L-IBASE": "LICENCIA - INDEFINIDA A BASE",
      "L-SS": "LICENCIA - SIN GOCE DE SUELDO",
      "L-PRRO": "LICENCIA - PRÓRROGA",
      "RR": "RECISIÓN O REVOCACIÓN",
      "DEF": "DEFUNCIÓN"
    };

    // Agrega los datos
    for (const item of plantilla) {
      const { percepciones, deducciones } = await procesarNomina(item);
      const sumarPercepciones = (obj) => {
        return Object.entries(obj || {}).reduce((acc, [key, val]) => {
          if (['nivel', 'id'].includes(key)) return acc;
          const num = Number(val);
          return acc + (isNaN(num) ? 0 : num);
        }, 0);
      };

      const sumarDeducciones = (obj) => {
        return Object.values(obj || {}).reduce((acc, val) => {
          const num = parseFloat(val);
          return acc + (isNaN(num) ? 0 : num);
        }, 0);
      };

      const totalPercepciones = sumarPercepciones(percepciones);
      const totalDeducciones = sumarDeducciones(deducciones);
      const percepcionNeta = totalPercepciones - totalDeducciones;

      const plaza = mapaPlazas.get(item.NUMPLA) || {};
      const ocupanteReciente = (plaza.previousOcuppants || []).slice(-1)[0] || {};
      const dischargeDate = ocupanteReciente.FECHA_BAJA ? new Date(ocupanteReciente.FECHA_BAJA) : '';

      const direccion = item.DIRECCION || {};
      const estudios = item.ESTUDIOS || {};
      const est1 = estudios.PRIMER_ESTUDIO || {};
      const est2 = estudios.SEGUNDO_ESTUDIO || {};
      const quinquenio = Object.entries(percepciones)
        .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

      const fila = {
        ...item,
        SUELDO: Number(percepciones.sueldo_base) || 0.00,
        QUINQUENIO: Number(quinquenio) || 0.00,
        PSM: Number(percepciones.psm) || 0.00,
        API_BASE: Number(percepciones.api_base) || 0.00,
        API_CONFIANZA: Number(percepciones.api_contrato) || 0.00,
        API_MANDOS_MEDIOS: Number(percepciones.api_mms) || 0.00,
        DESPENSA: Number(percepciones.despensa) || 0.00,
        ACT_CUL_DEP: Number(percepciones.act_cul_dep) || 0.00,
        DIA_AJUSTE: Number(percepciones.dia_ajuste) || 0.00,
        CANASTA: Number(percepciones.canasta_basica) || 0.00,
        ESTIMULO: Number(percepciones.estimulo) || 0.00,
        GASADMI: Number(percepciones.gasadmi) || 0.00,
        GUARDERIA: Number(percepciones.guarderia) || 0.00,
        COMP_FIJA_GARAN: Number(percepciones.comp_fija_garan) || 0.00,
        TOTAL_PERCEPCIONES: Number(totalPercepciones.toFixed(2)) || 0.00,

        ISR: Number(deducciones.ISR) || 0.00,
        FONDODEP: Number(deducciones.FONDO_PENSIONES) || 0.00,
        IMSS: Number(deducciones.IMSS) || 0.00,
        CUOTA_SINDICAL: Number(deducciones.CUOTA_SINDICAL) || 0.00,
        SEGURO_VIDA: Number(deducciones.SEGURO_VIDA) || 0.00,
        TOTAL_DEDUCCIONES: Number(totalDeducciones.toFixed(2)) || 0.00,
        NETO: Number(percepcionNeta.toFixed(2)) || 0.00,

        NOMBRE_COMPLETO: item.status === 1 ? `${item.APE_PAT || ""} ${item.APE_MAT || ""} ${item.NOMBRES || ""}`.trim()
          : item.status === 3 ? 'PROPUESTA POR APLICAR' : 'VACANTE',

        CLAVE: item.STATUS_EMPLEADO?.find(s => s.STATUS === "ASIG_LAB")?.CLAVE || item.CLAVE,
        ADSCRIPCION: item.STATUS_EMPLEADO?.find(s => s.STATUS === "ASIG_LAB")?.LUGAR_COMISIONADO || item.ADSCRIPCION,
        AREA_RESP: areaRespMapping[item.AREA_RESP] || item.AREA_RESP || "",
        COMISIONADO: item.STATUS_EMPLEADO?.find(s => s.STATUS === "COM_SDCL" || s.STATUS === "COM_LAB") ? 'SI' : 'NO',
        LUGAR_COMI: item.STATUS_EMPLEADO?.find(s => s.STATUS === "COM_SDCL" || s.STATUS === "COM_LAB")?.LUGAR_COMISIONADO || "",

        CP: direccion?.CP || item.CP || "",
        DOMICILIO: direccion?.DOMICILIO
          ? `${direccion.DOMICILIO} ${direccion.NUM_EXT || ""}${direccion.COLONIA ? `, ${direccion.COLONIA}` : ""
          }${direccion.MUNICIPIO ? `, ${direccion.MUNICIPIO}` : ""}${direccion.ESTADO ? `, ${direccion.ESTADO}` : ""
          }`
          : item.DOMICILIO || "",

        PROFESION1: est1?.NIVEL_ESTUDIO
          ? `${est1.NIVEL_ESTUDIO} ${est1.PROFES || ""}${est1.CEDULA ? ` (CÉDULA: ${est1.CEDULA})` : ""
          }`
          : item.PROFES || "",

        PROFESION2: est2?.NIVEL_ESTUDIO
          ? `${est2.NIVEL_ESTUDIO} ${est2.PROFES || ""}${est2.CEDULA ? ` (CÉDULA: ${est2.CEDULA})` : ""
          }`
          : "",

        OCUPANTE_ANT: ocupanteReciente.NOMBRE || "",
        FECHA_BAJA: dischargeDate,
        MOTIVO: motivoBajaMapping[ocupanteReciente.MOTIVO_BAJA] || ocupanteReciente.MOTIVO_BAJA || "",
      };


      worksheet.addRow(fila);
    };

    worksheet.getRow(1).font = { bold: true };

    // Genera el archivo y responde para descarga
    const fechaStr = moment().format("YYYY-MM-DD_HH-mm-ss");
    const tipoRegistro =
      statusParam === 1 ? "ACTIVOS" : statusParam === 2 ? "VACANTES" : "PLANTILLA";
    const fileName = `PLANTILLA_${tipoRegistro}_${fechaStr}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error al generar el archivo Excel:", error.message);
    res.status(500).json({ message: "Error al generar el archivo Excel." });
  }
};

reportesPersonalController.getBajasBetweenDates = async (req, res) => {
  try {
    const { FECHA_INI, FECHA_FIN } = req.body;

    if (!FECHA_INI || !FECHA_FIN) {
      return res.status(400).json({
        message: "Debes enviar FECHA_INI y FECHA_FIN en el body.",
      });
    }

    const ExcelJS = require("exceljs");
    const moment = require("moment");

    const parseDateInput = (value) => {
      if (!value) return null;
      if (value instanceof Date && !isNaN(value)) return value;

      if (typeof value === "string") {
        const trimmed = value.trim();

        const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
        if (ymdMatch) {
          const [, y, m, d] = ymdMatch;
          return new Date(Number(y), Number(m) - 1, Number(d));
        }

        const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dmyMatch) {
          const [, d, m, y] = dmyMatch;
          return new Date(Number(y), Number(m) - 1, Number(d));
        }

        const parsed = new Date(trimmed);
        if (!isNaN(parsed)) return parsed;
      }

      return null;
    };

    const startDateRaw = parseDateInput(FECHA_INI);
    const endDateRaw = parseDateInput(FECHA_FIN);

    if (!startDateRaw || !endDateRaw) {
      return res.status(400).json({
        message: "Formato de fecha inválido. Usa YYYY-MM-DD o DD/MM/YYYY.",
      });
    }

    const startDate = new Date(startDateRaw);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(endDateRaw);
    endDate.setHours(23, 59, 59, 999);

    if (startDate > endDate) {
      return res.status(400).json({
        message: "FECHA_INI no puede ser mayor que FECHA_FIN.",
      });
    }

    const [bajas, plantilla] = await Promise.all([
      query("BAJAS", {}),
      query("PLANTILLA", {}),
    ]);

    if (!bajas || bajas.length === 0) {
      return res.status(404).json({
        message: "No hay registros en la colección BAJAS.",
      });
    }

    const formatDateKey = (dateValue) => {
      const dateObj = parseDateInput(dateValue);
      if (!dateObj) return null;
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    const formatDateDisplay = (dateValue) => {
      const dateObj = parseDateInput(dateValue);
      if (!dateObj) return "";
      return new Intl.DateTimeFormat("es-MX", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(dateObj);
    };

    const formatMonthKey = (dateValue) => {
      const dateObj = parseDateInput(dateValue);
      if (!dateObj) return null;
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
      return `${y}-${m}`;
    };

    const formatMonthDisplay = (dateValue) => {
      const dateObj = parseDateInput(dateValue);
      if (!dateObj) return "";
      return new Intl.DateTimeFormat("es-MX", {
        month: "long",
        year: "numeric",
      })
        .format(dateObj)
        .toUpperCase();
    };

    const bajasFiltradas = bajas
      .map((baja) => {
        const fechaBaja =
          parseDateInput(baja.discharge_date) ||
          parseDateInput(baja.FECHA_BAJA) ||
          parseDateInput(baja.FECHA) ||
          parseDateInput(baja.BAJA) ||
          parseDateInput(baja.fecha);

        return {
          ...baja,
          _fechaBaja: fechaBaja,
        };
      })
      .filter(
        (baja) =>
          baja._fechaBaja &&
          baja._fechaBaja >= startDate &&
          baja._fechaBaja <= endDate,
      );

    if (bajasFiltradas.length === 0) {
      return res.status(404).json({
        message: "No se encontraron bajas entre las fechas indicadas.",
      });
    }

    const plantillaById = new Map();
    const plantillaByCurp = new Map();
    const plantillaByRfc = new Map();
    const plantillaByNumEmp = new Map();

    (plantilla || []).forEach((emp) => {
      if (emp._id) plantillaById.set(String(emp._id), emp);
      if (emp.CURP) plantillaByCurp.set(String(emp.CURP).toUpperCase(), emp);
      if (emp.RFC) plantillaByRfc.set(String(emp.RFC).toUpperCase(), emp);
      if (emp.NUMEMP) plantillaByNumEmp.set(String(emp.NUMEMP), emp);
    });

    const buscarEnPlantilla = (baja) => {
      const posiblesIds = [
        baja._idEmployee,
        baja.ID_EMPLOYEE,
        baja.id_employee,
        baja.ID_PLANTILLA,
        baja.id_plantilla,
      ]
        .filter(Boolean)
        .map((v) => String(v));

      for (const id of posiblesIds) {
        if (plantillaById.has(id)) return plantillaById.get(id);
      }

      if (baja.CURP) {
        const emp = plantillaByCurp.get(String(baja.CURP).toUpperCase());
        if (emp) return emp;
      }

      if (baja.RFC) {
        const emp = plantillaByRfc.get(String(baja.RFC).toUpperCase());
        if (emp) return emp;
      }

      if (baja.NUMEMP) {
        const emp = plantillaByNumEmp.get(String(baja.NUMEMP));
        if (emp) return emp;
      }

      return null;
    };

    const rows = bajasFiltradas
      .map((baja) => {
        const empleadoPlantilla = buscarEnPlantilla(baja) || {};

        const nombreBaja =
          baja.NOMBRE ||
          `${baja.APE_PAT || ""} ${baja.APE_MAT || ""} ${baja.NOMBRES || ""}`.trim();

        const nombrePlantilla =
          `${empleadoPlantilla.APE_PAT || ""} ${empleadoPlantilla.APE_MAT || ""} ${empleadoPlantilla.NOMBRES || ""}`.trim();

        return {
          FECHA_BAJA: baja._fechaBaja,
          FECHA_KEY: formatDateKey(baja._fechaBaja),
          FECHA_LABEL: formatDateDisplay(baja._fechaBaja),
          FECHA_MES_KEY: formatMonthKey(baja._fechaBaja),
          FECHA_MES_LABEL: formatMonthDisplay(baja._fechaBaja),
          AREA:
            empleadoPlantilla.ADSCRIPCION ||
            baja.AREA ||
            baja.ADSCRIPCION ||
            baja.AREA_RESP ||
            "",
          NOMBRE: nombrePlantilla || nombreBaja || "",
          TIPONOM: empleadoPlantilla.TIPONOM || baja.TIPONOM || "",
          CLAVECAT: empleadoPlantilla.CLAVECAT || baja.CLAVECAT || "",
          NOMCATE: empleadoPlantilla.NOMCATE || baja.NOMCATE || "",
          INGRESO: formatDateDisplay(
            empleadoPlantilla.FECHA_INGRESO ||
            baja.INGRESO ||
            baja.FECHA_INGRESO ||
            baja._fechaBaja,
          ),
          CELULAR:
            empleadoPlantilla.TEL_PERSONAL ||
            empleadoPlantilla.CELULAR ||
            baja.CELULAR ||
            "",
        };
      })
      .sort((a, b) => {
        const dateA = a.FECHA_BAJA ? a.FECHA_BAJA.getTime() : 0;
        const dateB = b.FECHA_BAJA ? b.FECHA_BAJA.getTime() : 0;
        if (dateA !== dateB) return dateA - dateB;

        const areaCompare = String(a.AREA || "").localeCompare(
          String(b.AREA || ""),
          "es",
        );
        if (areaCompare !== 0) return areaCompare;

        return String(a.NOMBRE || "").localeCompare(
          String(b.NOMBRE || ""),
          "es",
        );
      });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("BAJAS");
    worksheet.views = [{ state: "frozen", ySplit: 2 }];

    worksheet.columns = [
      { header: "AREA", key: "AREA", width: 48 },
      { header: "NOMBRE", key: "NOMBRE", width: 34 },
      { header: "TIPONOM", key: "TIPONOM", width: 12 },
      { header: "CLAVECAT", key: "CLAVECAT", width: 14 },
      { header: "NOMCATE", key: "NOMCATE", width: 26 },
      { header: "INGRESO", key: "INGRESO", width: 14 },
      { header: "CELULAR", key: "CELULAR", width: 16 },
    ];

    let currentMes = null;

    rows.forEach((item) => {
      if (item.FECHA_MES_KEY !== currentMes) {
        if (currentMes !== null) worksheet.addRow([]);
        currentMes = item.FECHA_MES_KEY;

        const fechaRow = worksheet.addRow([item.FECHA_MES_LABEL]);
        worksheet.mergeCells(`A${fechaRow.number}:G${fechaRow.number}`);
        fechaRow.getCell(1).font = { bold: true };
        fechaRow.getCell(1).alignment = { horizontal: "left" };

        const headerRow = worksheet.addRow([
          "AREA",
          "NOMBRE",
          "TIPONOM",
          "CLAVECAT",
          "NOMCATE",
          "INGRESO",
          "CELULAR",
        ]);
        headerRow.eachCell((cell) => {
          cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF6C6E6D" },
          };
          cell.alignment = { vertical: "middle", horizontal: "left" };
          cell.border = {
            top: { style: "thin", color: { argb: "FF000000" } },
            left: { style: "thin", color: { argb: "FF000000" } },
            bottom: { style: "thin", color: { argb: "FF000000" } },
            right: { style: "thin", color: { argb: "FF000000" } },
          };
        });
      }

      worksheet.addRow({
        AREA: item.AREA,
        NOMBRE: item.NOMBRE,
        TIPONOM: item.TIPONOM,
        CLAVECAT: item.CLAVECAT,
        NOMCATE: item.NOMCATE,
        INGRESO: item.INGRESO,
        CELULAR: item.CELULAR,
      });
    });

    const filename = `BAJAS_${moment(startDate).format("YYYY-MM-DD")}_${moment(
      endDate,
    ).format("YYYY-MM-DD")}_${moment().format("YYYYMMDD_HHmmss")}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error en getBajasBetweenDates:", error);
    res.status(500).json({
      message: "Error al generar el reporte de bajas.",
      error: error.message,
    });
  }
};

reportesPersonalController.getPlantillaReportArea = async (req, res) => {
  try {
    const { ADSCRIPCION, CLAVE, SUBNIVELES } = req.body;
    let claveParaQuery = CLAVE;
    const include104 = CLAVE === 102 || CLAVE === '102';
    let claves = [];
    let adscripcionDisplay = "";
    let nombreServidorSaliente = "";
    const toTitleCase = (text) => {
      if (!text || typeof text !== 'string') return '';

      // Separar texto respetando lo que esté entre comillas
      const parts = text.split(/(".*?")/);

      return parts
        .map((part) => {
          // Si está entre comillas, no modificar
          if (part.startsWith('"') && part.endsWith('"')) {
            return part;
          }

          // Procesar normalmente
          return part
            .toLowerCase()
            .split(' ')
            .map((word, idx) => {
              if (!word) return '';

              const smallWords = ['de', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'por', 'para', 'con', 'del', 'al'];

              if (idx > 0 && smallWords.includes(word)) {
                return word;
              }

              return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
        })
        .join('');
    };

    if (ADSCRIPCION !== 'TODAS') {

      const adscripciones = await querysql(
        `WITH RECURSIVE jerarquia AS ( SELECT id_adscripcion, nombre, clave, parent_id FROM adscripciones WHERE clave = ${claveParaQuery} UNION ALL SELECT a.id_adscripcion, a.nombre, a.clave, a.parent_id FROM adscripciones a INNER JOIN jerarquia j ON a.parent_id = j.id_adscripcion ) SELECT * FROM jerarquia;`
      );
      claves = adscripciones.map(a => a.clave);

      // Si la clave solicitada es 102, incluir también 104 en la lista de claves
      if (include104 && !claves.includes(104)) {
        claves.push(104);
      }

      const ancestros = await querysql(
        `
    WITH RECURSIVE padres AS (
      SELECT id_adscripcion, nombre, clave, parent_id, 0 AS nivel
      FROM adscripciones
      WHERE clave = ?
      UNION ALL
      SELECT a.id_adscripcion, a.nombre, a.clave, a.parent_id, padres.nivel + 1
      FROM adscripciones a
      JOIN padres ON padres.parent_id = a.id_adscripcion
    )
    SELECT * FROM padres ORDER BY nivel DESC;
    `,
        [claveParaQuery]
      );

      const nombres = ancestros
        .filter(item => String(item.clave) !== String(claveParaQuery))
        .filter(item => item.parent_id !== null)
        .map(item => item.nombre);

      adscripcionDisplay = nombres.join('. ');

    } else {
      const adscripciones = await querysql(`SELECT clave FROM adscripciones;`);
      claves = adscripciones.map(a => a.clave);
    }

    const employees = await query("PLANTILLA");

    if (!employees || employees.length === 0) {
      return res
        .status(202)
        .json({ message: "No hay empleados con los filtros especificados" });
    }

    let empleadosFiltrados = employees;

    if (CLAVE) {
      let claveArray = SUBNIVELES
        ? claves.map(c => Number(c)) // 🔥 usa toda la jerarquía
        : (Array.isArray(CLAVE) ? CLAVE : [CLAVE]).map(c => Number(c));

      if (claveArray.includes(102)) {
        claveArray = [...new Set([...claveArray, 104])];
      }

      empleadosFiltrados = employees.filter((emp) => {

        // 🔍 claves donde está asignado (ASIG_LAB)
        const clavesAsignadas = (emp.STATUS_EMPLEADO || [])
          .filter(se => se.STATUS === "ASIG_LAB")
          .map(se => Number(se.CLAVE))
          .filter(c => !isNaN(c));

        // 🔥 CASO 1: Tiene asignación → SOLO usar esas
        if (clavesAsignadas.length > 0) {
          return clavesAsignadas.some(c => claveArray.includes(c));
        }

        // 🔥 CASO 2: No tiene asignación → usar clave base
        return claveArray.includes(Number(emp.CLAVE));
      });

      empleadosFiltrados = empleadosFiltrados.map((emp) => {

        const asignaciones = (emp.STATUS_EMPLEADO || [])
          .filter(se => se.STATUS === "ASIG_LAB");

        const clavesAsignadas = asignaciones
          .map(se => Number(se.CLAVE))
          .filter(c => !isNaN(c));

        // 🔥 Si tiene asignación válida
        if (clavesAsignadas.length > 0) {

          const asignacionValida = asignaciones.find(se =>
            claveArray.includes(Number(se.CLAVE))
          );

          if (asignacionValida) {
            return {
              ...emp,

              // ✅ CLAVE correcta
              CLAVE: Number(asignacionValida.CLAVE),

              // ✅ ADSCRIPCIÓN correcta (la asignada)
              ADSCRIPCION: asignacionValida.LUGAR_COMISIONADO || emp.ADSCRIPCION
            };
          }
        }

        // 🔥 Si NO tiene asignación
        return {
          ...emp,
          CLAVE: Number(emp.CLAVE),
          ADSCRIPCION: emp.ADSCRIPCION
        };
      });
    }

    // Entre vacantes de FMM/MMS, mantener solo la de mayor nivel
    const activos = empleadosFiltrados.filter(emp => emp.status === 1);
    const vacantes = empleadosFiltrados.filter(emp => emp.status !== 1);

    if (vacantes.length > 1) {
      const vacanteMayorNivel = vacantes
        .filter(emp => ['FMM', 'MMS'].includes(emp.TIPONOM))
        .sort((a, b) => {
          const nivelA = parseInt(String(a.NIVEL).match(/\d+/)?.[0] || 0);
          const nivelB = parseInt(String(b.NIVEL).match(/\d+/)?.[0] || 0);
          return nivelB - nivelA;
        })[0];

      // Obtener el nombre del servidor saliente de la vacante de mayor nivel
      if (vacanteMayorNivel) {
        const bajasDelEmpleado = await query("BAJAS", {
          id_employee: String(vacanteMayorNivel._id),
        });

        if (Array.isArray(bajasDelEmpleado) && bajasDelEmpleado.length > 0) {
          const baja = bajasDelEmpleado[0];

          nombreServidorSaliente = `C. ${baja.NOMBRES || ""} ${baja.APE_PAT || ""} ${baja.APE_MAT || ""}`.trim();
        }
      }
      empleadosFiltrados = [...activos, ...vacantes];
    } else if (vacantes.length === 1) {
      if (['FMM', 'MMS'].includes(vacantes[0].TIPONOM)) {
        const bajasDelEmpleado = await query("BAJAS", {
          id_employee: String(vacantes[0]._id),
        });

        if (Array.isArray(bajasDelEmpleado) && bajasDelEmpleado.length > 0) {
          const baja = bajasDelEmpleado[0];

          nombreServidorSaliente = `C. ${baja.NOMBRES || ""} ${baja.APE_PAT || ""} ${baja.APE_MAT || ""}`.trim();
        }
      } else {
        nombreServidorSaliente = "";
      }
      empleadosFiltrados = [...activos, vacantes[0]];
    }

    const ExcelJS = require("exceljs");
    const moment = require("moment");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("PLANTILLA");
    worksheet.pageSetup = {
      orientation: "landscape",
      paperSize: 1,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.75,
        bottom: 0.75,
        header: 0.3,
        footer: 0.3,
      },
      printTitlesRow: "1:18",
    };

    const path = require('path');

    // Imagen izquierda
    const imageId1 = workbook.addImage({
      filename: path.join(__dirname, '../../assets/img/logo_secretaria_honestidad.png'),
      extension: 'png'
    });

    worksheet.addImage(imageId1, {
      tl: { col: 0, row: 0 },
      ext: { width: 400, height: 65 }
    });

    // Imagen derecha
    const imageId2 = workbook.addImage({
      filename: path.join(__dirname, '../../assets/img/header_logo_secretaria_honestidad.jpg'),
      extension: 'jpg'
    });

    worksheet.addImage(imageId2, {
      tl: { col: 8, row: 0 },
      ext: { width: 479, height: 20 }
    });

    worksheet.columns = [
      { header: "Nombre", key: "NOMBRE", width: 50 },
      { header: "Categoría", key: "NOMCATE", width: 30 },
      { header: "Si", key: "COMISION_SI", width: 11 },
      { header: "No", key: "COMISION_NO", width: 11 },
      { header: "Área a la que esta comisionado", key: "LUGAR_COMISIONADO", width: 15 },
      { header: "Periodo de Ausencia o Comisión", key: "PERIODO", width: 15 },
      { header: "Percepción mensual", key: "PERCEPCION", width: 15 },
      { header: "Sueldo Base", key: "SUELDO_BASE", width: 12 },
      { header: "Observaciones", key: "ADSCRIPCION", width: 65 },
    ];

    worksheet.spliceRows(1, 0, [], []);

    worksheet.mergeCells('A3:I3');
    const fechaReporte = req.body.FECHA_BACKUP
      ? moment(req.body.FECHA_BACKUP, 'YYYY-MM-DD').locale('es')
      : moment().locale('es');
    worksheet.getCell('A3').value = 'Fecha: ' + fechaReporte.format('D [de] MMMM [del] YYYY');
    worksheet.getCell('A3').alignment = { horizontal: 'right', vertical: 'middle' };

    worksheet.mergeCells('A5:I5');
    worksheet.getCell('A5').value = 'RECURSOS HUMANOS';
    worksheet.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A5').font = { bold: true };

    worksheet.mergeCells('D6:F6');
    worksheet.getCell('D6').value = 'Plantilla actualizada del personal';
    worksheet.getCell('D6').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('D6').font = { bold: true };

    worksheet.mergeCells('H6:I6');
    worksheet.getCell('H6').value = 'FOMATO: ER-F3-RH01';
    worksheet.getCell('H6').alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell('H6').font = { bold: true };

    worksheet.mergeCells('H7:I8');
    worksheet.getCell('H7').value = 'Hoja: 1 de 1';
    worksheet.getCell('H7').alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell('H7').font = { bold: true };

    worksheet.mergeCells('H9:I9');
    worksheet.getCell('H9').value = 'Anexo Tres (3)';
    worksheet.getCell('H9').alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell('H9').font = { bold: true };

    worksheet.mergeCells('H10:I10');
    worksheet.getCell('H10').value = 'Recursos Humanos';
    worksheet.getCell('H10').alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell('H10').font = { bold: true };

    worksheet.mergeCells('H11:I11');
    worksheet.getCell('H11').value = 'Plantilla actualizada del personal';
    worksheet.getCell('H11').alignment = { horizontal: 'right', vertical: 'middle' };
    worksheet.getCell('H11').font = { bold: true };

    worksheet.getCell('A12').value = 'Órgano Público:';
    worksheet.getCell('A12').alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getCell('A12').font = { bold: true };

    worksheet.getCell('B12').value = 'Secretaría de Finanzas del Poder Ejecutivo del Gobierno del Estado de Oaxaca';
    worksheet.getCell('B12').alignment = { horizontal: 'left', vertical: 'middle' };

    worksheet.getCell('A14').value = 'Área Administrativa:';
    worksheet.getCell('A14').alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getCell('A14').font = { bold: true };

    worksheet.getCell('B14').value = toTitleCase(adscripcionDisplay);
    worksheet.getCell('B14').alignment = { horizontal: 'left', vertical: 'middle' };

    worksheet.mergeCells('A16:A17');
    worksheet.mergeCells('B16:B17');
    worksheet.mergeCells('C16:D16');
    worksheet.mergeCells('E16:E17');
    worksheet.mergeCells('F16:F17');
    worksheet.mergeCells('G16:G17');
    worksheet.mergeCells('H16:H17');
    worksheet.mergeCells('I16:I17');

    worksheet.getCell('A16').value = 'Nombre';
    worksheet.getCell('B16').value = 'Categoría';
    worksheet.getCell('C16').value = 'Licencia, permiso, comisión o incapacidad';
    worksheet.getCell('E16').value = 'Área a la que esta comisionado';
    worksheet.getCell('F16').value = 'Periodo de Ausencia o Comisión';
    worksheet.getCell('G16').value = 'Percepción mensual';
    worksheet.getCell('H16').value = 'Sueldo Base';
    worksheet.getCell('I16').value = 'Observaciones';
    worksheet.getCell('C17').value = 'Si';
    worksheet.getCell('D17').value = 'No';

    if (ADSCRIPCION && ADSCRIPCION !== 'TODAS') {
      const adscripFriendly = toTitleCase(ADSCRIPCION);
      const infoRow = worksheet.addRow([`Área de Adscripción: ${adscripFriendly}`]);
      worksheet.mergeCells(`A${infoRow.number}:I${infoRow.number}`);

      const cell = worksheet.getCell(`A${infoRow.number}`);

      // separar texto
      const prefix = 'Área de Adscripción: ';
      const value = adscripFriendly; // mantiene mayúsculas/minúsculas
      const fullText = prefix + value;

      cell.value = fullText;
      cell.alignment = { horizontal: 'left', vertical: 'middle' };

      // ExcelJS no admite rich text en una célula merge directamente muy bien,
      // se usa "richText" si estás en versión compatible:
      cell.value = {
        richText: [
          { text: prefix, font: { bold: true, italic: false, name: 'Arial', size: 10 } },
          { text: value, font: { bold: false, italic: true, name: 'Arial', size: 10 } },
        ],
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };

      // fallback si no soporta richText:
      if (!cell.value || !cell.value.richText) {
        cell.font = { name: 'Arial', size: 10, italic: true };
      }
    }

    worksheet.getRow(15).height = 35;
    worksheet.getRow(16).height = 35;

    const headerCells = [
      'A16', 'B16', 'C16', 'E16', 'F16', 'G16', 'H16', 'I16', 'C17', 'D17',
    ];
    headerCells.forEach((cell) => {
      const c = worksheet.getCell(cell);
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
      c.font = { bold: true, size: 10 };
      c.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    // Obtener jerarquía de adscripciones
    const jerarquia = await querysql(`
  WITH RECURSIVE jerarquia AS (
    SELECT 
      id_adscripcion,
      nombre,
      clave,
      parent_id,
      CAST(LPAD(clave, 5, '0') AS CHAR(100)) AS path
    FROM adscripciones
    WHERE parent_id IS NULL
    
    UNION ALL
    
    SELECT 
      a.id_adscripcion,
      a.nombre,
      a.clave,
      a.parent_id,
      CONCAT(j.path, '-', LPAD(a.clave, 5, '0'))
    FROM adscripciones a
    INNER JOIN jerarquia j 
      ON a.parent_id = j.id_adscripcion
  )
  SELECT id_adscripcion, nombre, clave, parent_id, path FROM jerarquia ORDER BY path
`);

    // Crear mapa de orden jerárquico
    const pathMap = new Map();
    jerarquia.forEach(item => {
      pathMap.set(item.clave, item.path);  // ← Mapear por item.clave
    });

    // Agrupar empleados por condición laboral (Base / Contrato / Otros)
    const groupedEmployees = {
      BASE: [],
      NOMBRAMIENTO: [],
      MANDOS_MEDIOS: [],
      CONTRATO_CONFIANZA: [],
      CONTRATO_CONTRATO: [],
    };

    const toCondition = (tipo) => {
      const code = String(tipo || '').toUpperCase();
      if (code === 'M51' || code === 'F51') return 'BASE';
      if (code === 'FCO' || code === '511') return 'NOMBRAMIENTO';
      if (code === 'FCT' || code === 'CCT') return 'CONTRATO_CONFIANZA';
      if (code === 'F53' || code === 'M53') return 'CONTRATO_CONTRATO';
      if (code === 'FMM' || code === 'MMS') return 'MANDOS_MEDIOS';
    };

    for (const item of empleadosFiltrados) {
      const condition = toCondition(item.TIPONOM);
      if (!condition) {
        console.warn('TIPONOM no reconocido en getPlantillaReportArea:', item.TIPONOM, item.NUMPLA);
        continue;
      }
      groupedEmployees[condition].push(item);
    }


    const sections = [
      { key: 'BASE', title: 'Plaza por condición laboral: Base' },
      { key: 'NOMBRAMIENTO', title: 'Plaza por condición laboral: Nombramiento Confianza' },
      { key: 'CONTRATO_CONFIANZA', title: 'Plaza por condición laboral: Contrato Confianza' },
      { key: 'CONTRATO_CONTRATO', title: 'Plaza por condición laboral: Contrato Contrato' },
      { key: 'MANDOS_MEDIOS', title: 'Plaza por condición laboral: Mandos Medios y Superiores' },
    ];

    Object.keys(groupedEmployees).forEach(key => {
      groupedEmployees[key].sort((a, b) => {
        const pathA = pathMap.get(a.CLAVE) || '';
        const pathB = pathMap.get(b.CLAVE) || '';
        return pathA.localeCompare(pathB);
      });
    });
    // ==========================
    // 🔹 1. CARGAR CATÁLOGOS
    // ==========================
    const [
      catalogoBase,
      catalogoContrato,
      catalogoMandos,
      isrTable,
      quinBase,
      quinConfianza,
      quinMandos,
      segVida,
      subsidioISR
    ] = await Promise.all([
      querysql(`SELECT * FROM catalogo_base`),
      querysql(`SELECT * FROM catalogo_contrato`),
      querysql(`SELECT * FROM catalogo_mandosmedios`),
      querysql(`SELECT * FROM catalogo_isr`),
      querysql(`SELECT * FROM quin_base`),
      querysql(`SELECT * FROM quin_confianza`),
      querysql(`SELECT * FROM quin_mandosmedios`),
      querysql(`SELECT * FROM seg_vida`),
      querysql(`SELECT * FROM subsidio_isr WHERE id = 1`)
    ]);

    // ==========================
    // 🔹 2. CREAR MAPS
    // ==========================
    const baseMap = new Map();
    catalogoBase.forEach(x => baseMap.set(String(x.nivel), x));

    const contratoMap = new Map();
    catalogoContrato.forEach(x => contratoMap.set(String(x.nivel), x));

    const mandosMap = new Map();
    catalogoMandos.forEach(x => mandosMap.set(String(x.nivel), x));

    const quinBaseMap = new Map();
    quinBase.forEach(x => quinBaseMap.set(String(x.NIVEL), x));

    const quinConfianzaMap = new Map();
    quinConfianza.forEach(x => quinConfianzaMap.set(String(x.nivel), x));

    const quinMandosMap = new Map();
    quinMandos.forEach(x => quinMandosMap.set(String(x.nivel), x));

    const segVidaMap = new Map();
    segVida.forEach(x => segVidaMap.set(String(x.nivel), x));


    // ==========================
    // 🔹 4. PROCESAR EMPLEADO
    // ==========================
    async function procesarNomina(employee) {
      let percepciones = {};
      let deducciones = {};

      const cubreLicencia = await query("LICENCIAS", {
        id_employee: employee._id,
        status: 1,
      });

      employee.CUBRIENDO_LICENCIA = cubreLicencia && cubreLicencia.length > 0;

      const nivel = String(employee.NIVEL);
      const tipo = employee.TIPONOM;

      switch (tipo) {

        // ======================
        // 🔸 BASE
        // ======================
        case "M51":
        case "F51":

          // ✅ CLONAR objeto para evitar mutación global
          percepciones = { ...baseMap.get(nivel) };
          if (!percepciones) break;

          const dataGasadmi = await query("PERSONAL_GASADMI", {
            id_employee: new ObjectId(employee._id),
          });

          if (dataGasadmi.length > 0) {
            percepciones.gasadmi = dataGasadmi[0].gasadmi;
          }

          if (employee.NUM_HIJOS && employee.NUM_HIJOS > 0) {
            percepciones.guarderia = (Number(employee.NUM_HIJOS) * Number(percepciones.guarderia)).toFixed(2);
          } else {
            delete percepciones.guarderia;
          }

          // ✅ ELIMINAR cualquier quinquenio previo
          Object.keys(percepciones).forEach(key => {
            if (key.startsWith("QUINQUENIOS")) {
              delete percepciones[key];
            }
          });

          // ✅ AGREGAR SOLO EL QUINQUENIO CORRECTO
          if (employee.NUMQUIN > 0) {
            const quinquenio = await querysql(
              `SELECT quin_${employee.NUMQUIN} FROM quin_base WHERE NIVEL = ?`,
              [employee.NIVEL]
            );

            if (
              quinquenio &&
              quinquenio[0] &&
              quinquenio[0][`quin_${employee.NUMQUIN}`] != null
            ) {
              percepciones[`QUINQUENIOS: ${employee.NUMQUIN}`] =
                quinquenio[0][`quin_${employee.NUMQUIN}`];
            }
          }

          const sueldoBase = parseFloat(percepciones.sueldo_base);

          // Determinar si la quincena actual es de 16 días (segunda quincena de mes con 31 días) para aunmentar el día de ajuste
          // const now = new Date();
          // const day = now.getDate();
          // const month = now.getMonth() + 1;
          // const isSegundaQuincena16Dias = day > 15 && [1, 3, 5, 7, 8, 10, 12].includes(month);

          let sueldoGravableB;
          // if (isSegundaQuincena16Dias) {
          //   const diaAjuste = percepciones.sueldo_base / 30;
          //   percepciones.dia_ajuste = diaAjuste.toFixed(2);
          // }

          const quinquenioBase = Object.entries(percepciones)
            .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

          sueldoGravableB = (
            parseFloat(percepciones.sueldo_base) +
            parseFloat(percepciones.despensa) +
            parseFloat(percepciones.act_cul_dep) +
            parseFloat(percepciones.api_base) +
            parseFloat(percepciones.psm) +
            parseFloat(percepciones.gasadmi ? percepciones.gasadmi : 0) +
            parseFloat(quinquenioBase) +
            parseFloat(percepciones.guarderia ? percepciones.guarderia : 0)
          ).toFixed(2);

          const isrDataB = await querysql(
            "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
            [sueldoGravableB, sueldoGravableB]
          );

          const isrObjectB = isrDataB[0];

          const isrBrutoB =
            ((sueldoGravableB - parseFloat(isrObjectB.limite_inf)) *
              parseFloat(isrObjectB.porcentajeliminf)) /
            100 +
            parseFloat(isrObjectB.cuota_fija);

          const subsidioDataB = await querysql(
            "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
            [sueldoGravableB, sueldoGravableB]
          );

          const subsidioB =
            subsidioDataB && subsidioDataB.length > 0
              ? parseFloat(subsidioDataB[0].subsidio)
              : 0;

          let isrFinal = isrBrutoB - subsidioB;
          if (isrFinal < 0) isrFinal = 0;

          const isrRedondeado = (Math.round(isrFinal * 10) / 10).toFixed(2);
          deducciones.ISR = isrRedondeado;

          if (!employee.CUBRIENDO_LICENCIA && employee.FECHA_NOMBRAMIENTO) {
            const FONDO_PENSIONES_BASE = (sueldoBase * 0.09).toFixed(2);
            deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_BASE * 10) / 10).toFixed(2);
          }
          if (!employee.CUBRIENDO_LICENCIA && employee.SINDICATO?.CUOTA_SINDICAL === true) {
            const CUOTA_SINDICAL_BASE = (sueldoBase * 0.01).toFixed(2);
            deducciones.CUOTA_SINDICAL = (Math.round(CUOTA_SINDICAL_BASE * 10) / 10).toFixed(2);
          }

          const IMSS_BASE = (sueldoBase * 0.041219).toFixed(2);
          deducciones.IMSS = (Math.round(IMSS_BASE * 10) / 10).toFixed(2);

          break;

        // ======================
        // 🔸 CONTRATO
        // ======================
        case "FCT":
        case "CCT":
        case "F53":
        case "M53":

          percepciones = { ...contratoMap.get(nivel) };
          if (!percepciones) break;

          estimuloReal = await query("PERSONAL_ESTIMULO", {
            id_employee: new ObjectId(employee._id),
          });

          percepciones.estimulo = estimuloReal && estimuloReal.length > 0 ? estimuloReal[0].estimulo : percepciones.estimulo;

          // ✅ ELIMINAR cualquier quinquenio previo
          Object.keys(percepciones).forEach(key => {
            if (key.startsWith("QUINQUENIOS")) {
              delete percepciones[key];
            }
          });

          // ✅ AGREGAR SOLO EL QUINQUENIO CORRECTO
          if (employee.NUMQUIN > 0) {
            const quinquenio = await querysql(
              `SELECT quin_${employee.NUMQUIN} FROM quin_confianza WHERE NIVEL = ?`,
              [employee.NIVEL]
            );

            if (
              quinquenio &&
              quinquenio[0] &&
              quinquenio[0][`quin_${employee.NUMQUIN}`] != null
            ) {
              percepciones[`QUINQUENIOS: ${employee.NUMQUIN}`] =
                quinquenio[0][`quin_${employee.NUMQUIN}`];
            }
          }

          const quinquenioCC = Object.entries(percepciones)
            .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

          const sueldoGravableCC = (
            parseFloat(percepciones.sueldo_base) +
            parseFloat(percepciones.canasta_basica) +
            parseFloat(percepciones.psm) +
            parseFloat(percepciones.estimulo) +
            parseFloat(percepciones.api_contrato) +
            parseFloat(quinquenioCC)
          ).toFixed(2);

          const isrDataCC = await querysql(
            "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
            [sueldoGravableCC, sueldoGravableCC]
          );

          const isrObjectCC = isrDataCC[0];

          const isrBrutoCC =
            ((sueldoGravableCC - parseFloat(isrObjectCC.limite_inf)) *
              parseFloat(isrObjectCC.porcentajeliminf)) /
            100 +
            parseFloat(isrObjectCC.cuota_fija);

          const subsidioDataCC = await querysql(
            "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
            [sueldoGravableCC, sueldoGravableCC]
          );

          const subsidioCC =
            subsidioDataCC && subsidioDataCC.length > 0
              ? parseFloat(subsidioDataCC[0].subsidio)
              : 0;

          let isrFinalCC = isrBrutoCC - subsidioCC;
          if (isrFinalCC < 0) isrFinalCC = 0;

          deducciones.ISR = (Math.round(isrFinalCC * 10) / 10).toFixed(2);

          if (employee.FECHA_NOMBRAMIENTO) {
            const FONDO_PENSIONES_CC = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
            deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_CC * 10) / 10).toFixed(2);
          }

          const IMSS_CC = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
          deducciones.IMSS = (Math.round(IMSS_CC * 10) / 10).toFixed(2);

          break;

        case "FCO":
        case "511":

          percepciones = { ...contratoMap.get(nivel) };
          if (!percepciones) break;

          estimuloReal = await query("PERSONAL_ESTIMULO", {
            id_employee: new ObjectId(employee._id),
          });

          percepciones.estimulo = estimuloReal && estimuloReal.length > 0 ? estimuloReal[0].estimulo : percepciones.estimulo;

          // ✅ ELIMINAR cualquier quinquenio previo
          Object.keys(percepciones).forEach(key => {
            if (key.startsWith("QUINQUENIOS")) {
              delete percepciones[key];
            }
          });

          // ✅ AGREGAR SOLO EL QUINQUENIO CORRECTO
          if (employee.NUMQUIN > 0) {
            const quinquenio = await querysql(
              `SELECT quin_${employee.NUMQUIN} FROM quin_confianza WHERE NIVEL = ?`,
              [employee.NIVEL]
            );

            if (
              quinquenio &&
              quinquenio[0] &&
              quinquenio[0][`quin_${employee.NUMQUIN}`] != null
            ) {
              percepciones[`QUINQUENIOS: ${employee.NUMQUIN}`] =
                quinquenio[0][`quin_${employee.NUMQUIN}`];
            }
          }

          const quinquenioCN = Object.entries(percepciones)
            .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

          const sueldoGravableCN = (
            parseFloat(percepciones.sueldo_base) +
            parseFloat(percepciones.canasta_basica) +
            parseFloat(percepciones.psm) +
            parseFloat(percepciones.estimulo) +
            parseFloat(percepciones.api_contrato) +
            parseFloat(quinquenioCN)
          ).toFixed(2);


          const isrDataCN = await querysql(
            "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
            [sueldoGravableCN, sueldoGravableCN]
          );

          const isrObjectCN = isrDataCN[0];

          const isrBrutoCN =
            ((sueldoGravableCN - parseFloat(isrObjectCN.limite_inf)) *
              parseFloat(isrObjectCN.porcentajeliminf)) /
            100 +
            parseFloat(isrObjectCN.cuota_fija);

          const subsidioDataCN = await querysql(
            "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
            [sueldoGravableCN, sueldoGravableCN]
          );

          const subsidioCN =
            subsidioDataCN && subsidioDataCN.length > 0
              ? parseFloat(subsidioDataCN[0].subsidio)
              : 0;

          let isrFinalCN = isrBrutoCN - subsidioCN;
          if (isrFinalCN < 0) isrFinalCN = 0;

          deducciones.ISR = (Math.round(isrFinalCN * 10) / 10).toFixed(2);

          if (employee.FECHA_NOMBRAMIENTO) {
            const FONDO_PENSIONES_CN = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
            deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_CN * 10) / 10).toFixed(2);
          }

          if (employee.SINDICATO?.CUOTA_SINDICAL === true) {
            const CUOTA_SINDICAL_CN = (parseFloat(percepciones.sueldo_base) * 0.01).toFixed(2);
            deducciones.CUOTA_SINDICAL = (Math.round(CUOTA_SINDICAL_CN * 10) / 10).toFixed(2);
          }

          const IMSS_CN = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
          deducciones.IMSS = (Math.round(IMSS_CN * 10) / 10).toFixed(2);

          break;

        // ======================
        // 🔸 MANDOS MEDIOS
        // ======================
        case "FMM":
        case "MMS":

          percepciones = { ...mandosMap.get(nivel) };
          if (!percepciones) break;

          // ✅ ELIMINAR cualquier quinquenio previo
          Object.keys(percepciones).forEach(key => {
            if (key.startsWith("QUINQUENIOS")) {
              delete percepciones[key];
            }
          });

          // ✅ AGREGAR SOLO EL QUINQUENIO CORRECTO
          if (employee.NUMQUIN > 0) {
            const quinquenio = await querysql(
              `SELECT quin_${employee.NUMQUIN} FROM quin_mandosmedios WHERE NIVEL = ?`,
              [employee.NIVEL]
            );

            if (
              quinquenio &&
              quinquenio[0] &&
              quinquenio[0][`quin_${employee.NUMQUIN}`] != null
            ) {
              percepciones[`QUINQUENIOS: ${employee.NUMQUIN}`] =
                quinquenio[0][`quin_${employee.NUMQUIN}`];
            }
          }

          const quinquenioMms = Object.entries(percepciones)
            .find(([key]) => key.startsWith("QUINQUENIOS"))?.[1] || 0;

          const sueldoGravableMM = (
            parseFloat(percepciones.sueldo_base) +
            parseFloat(percepciones.psm) +
            parseFloat(percepciones.comp_fija_garan) +
            parseFloat(percepciones.api_mms) +
            parseFloat(quinquenioMms)
          ).toFixed(2);

          const isrDataMM = await querysql(
            "SELECT * FROM catalogo_isr WHERE ? > limite_inf AND ? < limite_sup",
            [sueldoGravableMM, sueldoGravableMM]
          );

          const isrObjectMM = isrDataMM[0];

          const isrBrutoMM =
            ((sueldoGravableMM - parseFloat(isrObjectMM.limite_inf)) *
              parseFloat(isrObjectMM.porcentajeliminf)) /
            100 +
            parseFloat(isrObjectMM.cuota_fija);

          const subsidioDataMM = await querysql(
            "SELECT subsidio FROM subsidio_isr WHERE ? > lim_inf AND ? < lim_sup",
            [sueldoGravableMM, sueldoGravableMM]
          );

          const subsidioMM =
            subsidioDataMM && subsidioDataMM.length > 0
              ? parseFloat(subsidioDataMM[0].subsidio)
              : 0;

          let isrFinalMM = isrBrutoMM - subsidioMM;
          if (isrFinalMM < 0) isrFinalMM = 0;

          deducciones.ISR = (Math.round(isrFinalMM * 10) / 10).toFixed(2);

          const IMSS_MMS = (parseFloat(percepciones.sueldo_base) * 0.041219).toFixed(2);
          deducciones.IMSS = (Math.round(IMSS_MMS * 10) / 10).toFixed(2);

          const CAT_SEGURO = await querysql(
            "SELECT * FROM seg_vida WHERE nivel = ?",
            [employee.NIVEL],
          );

          const SEGURO_VIDA_MMS = parseFloat(CAT_SEGURO[0].seg_vida).toFixed(2);
          deducciones.SEGURO_VIDA = (Math.round(SEGURO_VIDA_MMS * 10) / 10).toFixed(2);

          if (employee.FECHA_NOMBRAMIENTO) {
            const FONDO_PENSIONES_MMS = (parseFloat(percepciones.sueldo_base) * 0.09).toFixed(2);
            deducciones.FONDO_PENSIONES = (Math.round(FONDO_PENSIONES_MMS * 10) / 10).toFixed(2);
          }

          delete percepciones.isr_rdl;
          delete percepciones.rdl;

          break;

        default:
          throw new Error("Tipo de nómina no reconocido");
      }

      return { percepciones, deducciones };
    }

    // Progreso granular por empleado, solo para el flujo retroactivo (ya
    // conoce este evento por el switch/backdrop del frontend). El reporte en
    // vivo no lo necesita porque ya es rápido.
    const ioProgreso = req.body.FECHA_BACKUP ? req.app.get("io") : null;
    const usernameProgreso = req.user?.username;
    const totalEmpleadosProgreso = empleadosFiltrados.length;
    let empleadosProcesados = 0;

    function emitirProgresoNomina() {
      if (!ioProgreso || !usernameProgreso) return;
      empleadosProcesados++;
      const esUltimo = empleadosProcesados === totalEmpleadosProgreso;
      if (empleadosProcesados % 5 !== 0 && !esUltimo) return;
      const porcentaje = totalEmpleadosProgreso
        ? Math.round((empleadosProcesados / totalEmpleadosProgreso) * 100)
        : 0;
      ioProgreso.to(`USER_${usernameProgreso}`).emit("reporte-retroactivo-progreso", {
        mensaje: `Generando reporte: ${empleadosProcesados}/${totalEmpleadosProgreso} empleados`,
        status: "en_progreso",
        porcentaje,
        timestamp: new Date().toISOString(),
      });
    }

    for (const section of sections) {
      const group = groupedEmployees[section.key];

      const rowHeader = worksheet.addRow([section.title]);
      worksheet.mergeCells(`A${rowHeader.number}:I${rowHeader.number}`);
      const headerCell = worksheet.getCell(`A${rowHeader.number}`);
      headerCell.font = { bold: true };
      rowHeader.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      });

      // Si no hay empleados, agregar fila de "Sin personal"
      if (!group || group.length === 0) {
        const rowEmpty = worksheet.addRow(['Sin personal en esta modalidad']);

        // Aplicar bordes a cada celda de A a I
        for (let col = 1; col <= 9; col++) {
          const cell = rowEmpty.getCell(col);
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
          cell.alignment = { vertical: 'middle' };
        }

        // Mergear después de aplicar bordes
        const emptyCell = worksheet.getCell(`A${rowEmpty.number}`);
        emptyCell.font = { size: 10 };
        emptyCell.alignment = { vertical: 'middle' };

        continue;
      }

      // Empleados de esta adscripción
      for (const emp of group) {
        const { percepciones, deducciones } = await procesarNomina(emp);
        emitirProgresoNomina();

        const sumarPercepciones = (obj) => {
          return Object.entries(obj || {}).reduce((acc, [key, val]) => {
            if (['nivel', 'id'].includes(key)) return acc;
            const num = Number(val);
            return acc + (isNaN(num) ? 0 : num);
          }, 0);
        };

        const sumarDeducciones = (obj) => {
          return Object.values(obj || {}).reduce((acc, val) => {
            const num = parseFloat(val);
            return acc + (isNaN(num) ? 0 : num);
          }, 0);
        };

        const totalPercepciones = sumarPercepciones(percepciones);
        const totalDeducciones = sumarDeducciones(deducciones);
        const percepcionNeta = totalPercepciones - totalDeducciones;

        const row = worksheet.addRow({
          NOMBRE:
            emp.status !== 1
              ? 'V A C A N T E'
              : `${emp.APE_PAT || ''} ${emp.APE_MAT || ''} ${emp.NOMBRES || ''}`.trim(),
          NOMCATE: emp.NOMCATE || '',
          COMISION_SI: emp.STATUS_EMPLEADO?.some(s => s.STATUS === "COM_SDCL" || s.STATUS === "COM_LAB") ? 'X' : '',
          COMISION_NO: !emp.STATUS_EMPLEADO?.some(s => s.STATUS === "COM_SDCL" || s.STATUS === "COM_LAB") ? 'X' : '',
          LUGAR_COMISIONADO: emp.STATUS_EMPLEADO?.find(s => s.STATUS === "COM_SDCL" || s.STATUS === "COM_LAB")?.LUGAR_COMISIONADO || "",
          PERIODO: (() => {
            const comision = emp.STATUS_EMPLEADO?.find(s => s.STATUS === "COM_SDCL" || s.STATUS === "COM_LAB");

            if (!comision?.DESDE && !comision?.HASTA) return "";

            const formatearFecha = fecha => {
              if (!fecha) return "";

              const [anio, mes, dia] = fecha.split("-");
              return `${dia}${mes}${anio}`;
            };

            const desde = formatearFecha(comision.DESDE);
            const hasta = formatearFecha(comision.HASTA);

            if (desde && hasta) return `${desde} AL ${hasta}`;
            if (desde) return desde;
            if (hasta) return hasta;

            return "";
          })(),
          PERCEPCION: parseFloat(percepcionNeta),
          SUELDO_BASE: parseFloat(percepciones?.sueldo_base || 0),
          ADSCRIPCION: SUBNIVELES === true ? emp?.ADSCRIPCION : ''
        });

        row.getCell('PERCEPCION').numFmt = '#,##0.00';
        row.getCell('SUELDO_BASE').numFmt = '#,##0.00';

        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
          if (cell.col === 3 || cell.col === 4) {
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          } else {
            cell.alignment = { vertical: 'middle', wrapText: true };
          }
        });
      }
    }

    // 1) fila de separación (opcional)
    worksheet.addRow([]);
    worksheet.addRow([]);

    // 2) fila de cierre / firmas
    const rowFirma = worksheet.addRow([
      'ELABORÓ', // A
      '',        // B
      'ENTREGA', // C
      '',        // D
      '',        // E
      '',        // F
      '',        // G
      '',        // H
      'RECIBE',  // I
    ]);

    // Unir C-D-E
    worksheet.mergeCells(
      `C${rowFirma.number}:E${rowFirma.number}`
    );

    // Estilos
    worksheet.getCell(`A${rowFirma.number}`).font = { bold: true };
    worksheet.getCell(`C${rowFirma.number}`).font = { bold: true };
    worksheet.getCell(`I${rowFirma.number}`).font = { bold: true };

    worksheet.getCell(`A${rowFirma.number}`).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell(`C${rowFirma.number}`).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    worksheet.getCell(`I${rowFirma.number}`).alignment = {
      horizontal: 'left',
      vertical: 'middle',
    };

    // 1) fila de separación (opcional)
    worksheet.addRow([]);

    // 2) fila de cierre / firmas
    const rowLineaFirma = worksheet.addRow([
      '____________________________________________', // A
      '',        // B
      '____________________________________________', // C
      '',        // D
      '',        // E
      '',        // F
      '',        // G
      '',        // H
      '____________________________________________',  // I
    ]);

    // Unir C-D-E
    worksheet.mergeCells(
      `C${rowLineaFirma.number}:E${rowLineaFirma.number}`
    );

    // 2) fila de cierre / firmas
    const rowNombreFirma = worksheet.addRow([
      'L.A. LAURA CONCEPCION MARTÍNEZ GUTIÉRREZ', // A
      '',        // B
      `${nombreServidorSaliente}`, // C
      '',        // D
      '',        // E
      '',        // F
      '',        // G
      '',        // H
      '',  // I
    ]);

    worksheet.mergeCells(
      `C${rowNombreFirma.number}:E${rowNombreFirma.number}`
    );

    // 2) fila de cierre / firmas
    const rowPuestoFirma = worksheet.addRow([
      'JEFA DEL DEPTO. DE RECURSOS HUMANOS', // A
      '',        // B
      'SERVIDOR PÚBLICO SALIENTE', // C
      '',        // D
      '',        // E
      '',        // F
      '',        // G
      '',        // H
      'SERVIDOR PÚBLICO ENTRANTE',  // I
    ]);

    worksheet.mergeCells(
      `C${rowPuestoFirma.number}:E${rowPuestoFirma.number}`
    );

    const imageIdBottom = workbook.addImage({
      filename: path.join(__dirname, '../../assets/img/footer_logo_secretaria_honestidad.png'),
      extension: 'png',
    });

    // Ubicación: columna I estilo "derecha", fila después de las firmas
    const bottomRow = rowLineaFirma.number + 3; // 2 filas de separación
    worksheet.addImage(imageIdBottom, {
      tl: { col: 8, row: bottomRow },
      ext: { width: 478, height: 20 }
    });

    worksheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = {
          ...cell.font, // 👈 conserva bold, etc.
          name: 'Arial',
          size: 10,
        };
      });
    });

    const fechaStr = moment().format('YYYY-MM-DD_HH-mm-ss');
    const fileName = `PLANTILLA_${fechaStr}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    const lastRow = worksheet.rowCount;
    worksheet.pageSetup.printArea = `A1:I${lastRow}`;
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error al generar el archivo Excel:', error.message);
    res.status(500).json({ message: 'Error al generar el archivo Excel.' });
  }
};

reportesPersonalController.getReportVacationsArea = async (req, res) => {
  try {
    const { ADSCRIPCION, CLAVE, SUBNIVELES } = req.body;
    let claveParaQuery = CLAVE;
    const include104 = CLAVE === 102 || CLAVE === '102';
    let claves = [];
    const toTitleCase = (text) => {
      if (!text || typeof text !== 'string') return '';

      // Separar texto respetando lo que esté entre comillas
      const parts = text.split(/(".*?")/);

      return parts
        .map((part) => {
          // Si está entre comillas, no modificar
          if (part.startsWith('"') && part.endsWith('"')) {
            return part;
          }

          // Procesar normalmente
          return part
            .toLowerCase()
            .split(' ')
            .map((word, idx) => {
              if (!word) return '';

              const smallWords = ['de', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'a', 'por', 'para', 'con', 'del', 'al'];

              if (idx > 0 && smallWords.includes(word)) {
                return word;
              }

              return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
        })
        .join('');
    };

    if (ADSCRIPCION !== 'TODAS') {

      const adscripciones = await querysql(
        `WITH RECURSIVE jerarquia AS ( SELECT id_adscripcion, nombre, clave, parent_id FROM adscripciones WHERE clave = ${claveParaQuery} UNION ALL SELECT a.id_adscripcion, a.nombre, a.clave, a.parent_id FROM adscripciones a INNER JOIN jerarquia j ON a.parent_id = j.id_adscripcion ) SELECT * FROM jerarquia;`
      );
      claves = adscripciones.map(a => a.clave);

      // Si la clave solicitada es 102, incluir también 104 en la lista de claves
      if (include104 && !claves.includes(104)) {
        claves.push(104);
      }

      const ancestros = await querysql(
        `
      WITH RECURSIVE padres AS (
        SELECT id_adscripcion, nombre, clave, parent_id, 0 AS nivel
        FROM adscripciones
        WHERE clave = ?
        UNION ALL
        SELECT a.id_adscripcion, a.nombre, a.clave, a.parent_id, padres.nivel + 1
        FROM adscripciones a
        JOIN padres ON padres.parent_id = a.id_adscripcion
      )
      SELECT * FROM padres ORDER BY nivel DESC;
      `,
        [claveParaQuery]
      );

      const nombres = ancestros
        .filter(item => String(item.clave) !== String(claveParaQuery))
        .filter(item => item.parent_id !== null)
        .map(item => item.nombre);

      adscripcionDisplay = nombres.join('. ');

    } else {
      const adscripciones = await querysql(`SELECT clave FROM adscripciones;`);
      claves = adscripciones.map(a => a.clave);
    }

    const employees = await query("PLANTILLA", { status: 1 });

    if (!employees || employees.length === 0) {
      return res
        .status(202)
        .json({ message: "No hay empleados con los filtros especificados" });
    }

    let empleadosFiltrados = employees;

    if (CLAVE) {
      let claveArray = SUBNIVELES
        ? claves.map(c => Number(c)) // 🔥 usa toda la jerarquía
        : (Array.isArray(CLAVE) ? CLAVE : [CLAVE]).map(c => Number(c));

      if (claveArray.includes(102)) {
        claveArray = [...new Set([...claveArray, 104])];
      }

      empleadosFiltrados = employees.filter((emp) => {

        // 🔍 claves donde está asignado (ASIG_LAB)
        const clavesAsignadas = (emp.STATUS_EMPLEADO || [])
          .filter(se => se.STATUS === "ASIG_LAB")
          .map(se => Number(se.CLAVE))
          .filter(c => !isNaN(c));

        // 🔥 CASO 1: Tiene asignación → SOLO usar esas
        if (clavesAsignadas.length > 0) {
          return clavesAsignadas.some(c => claveArray.includes(c));
        }

        // 🔥 CASO 2: No tiene asignación → usar clave base
        return claveArray.includes(Number(emp.CLAVE));
      });

      empleadosFiltrados = empleadosFiltrados.map((emp) => {

        const asignaciones = (emp.STATUS_EMPLEADO || [])
          .filter(se => se.STATUS === "ASIG_LAB");

        const clavesAsignadas = asignaciones
          .map(se => Number(se.CLAVE))
          .filter(c => !isNaN(c));

        // 🔥 Si tiene asignación válida
        if (clavesAsignadas.length > 0) {

          const asignacionValida = asignaciones.find(se =>
            claveArray.includes(Number(se.CLAVE))
          );

          if (asignacionValida) {
            return {
              ...emp,

              // ✅ CLAVE correcta
              CLAVE: Number(asignacionValida.CLAVE),

              // ✅ ADSCRIPCIÓN correcta (la asignada)
              ADSCRIPCION: asignacionValida.LUGAR_COMISIONADO || emp.ADSCRIPCION
            };
          }
        }

        // 🔥 Si NO tiene asignación
        return {
          ...emp,
          CLAVE: Number(emp.CLAVE),
          ADSCRIPCION: emp.ADSCRIPCION
        };
      });
    }

    const ExcelJS = require("exceljs");
    const moment = require("moment");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("PLANTILLA");
    worksheet.pageSetup = {
      orientation: "landscape",
      paperSize: 1,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.75,
        bottom: 0.75,
        header: 0.3,
        footer: 0.3,
      },
      printTitlesRow: "1:18",
    };

    const path = require('path');

    // Imagen izquierda
    const imageId1 = workbook.addImage({
      filename: path.join(__dirname, '../../assets/img/logo-sefin.png'),
      extension: 'png'
    });

    worksheet.addImage(imageId1, {
      tl: { col: 0, row: 0 },
      ext: { width: 400, height: 65 }
    });

    // Imagen derecha
    const imageId2 = workbook.addImage({
      filename: path.join(__dirname, '../../assets/img/header_logo_secretaria_honestidad.jpg'),
      extension: 'jpg'
    });

    worksheet.addImage(imageId2, {
      tl: { col: 8, row: 0 },
      ext: { width: 479, height: 20 }
    });

    worksheet.columns = [
      { header: "Nombre", key: "NOMBRE", width: 50 },
      { header: "Categoría", key: "NOMCATE", width: 30 },
      { header: "1", key: "PERIODO1", width: 7 },
      { header: "2", key: "PERIODO2", width: 7 },
      { header: "3", key: "PERIODO3", width: 7 },
      { header: "4", key: "PERIODO4", width: 7 },
      { header: "Días", key: "DIAS", width: 11 },
      { header: "Fechas", key: "FECHA", width: 60 },
      { header: "Observaciones", key: "ADSCRIPCION", width: 65 },
    ];

    worksheet.spliceRows(1, 0, [], []);

    worksheet.mergeCells('A3:I3');
    worksheet.getCell('A3').value = 'Fecha: ' + moment().locale('es').format('D [de] MMMM [del] YYYY');
    worksheet.getCell('A3').alignment = { horizontal: 'right', vertical: 'middle' };

    worksheet.mergeCells('A5:I5');
    worksheet.getCell('A5').value = 'GOBIERNO DEL ESTADO DE OAXACA';
    worksheet.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A5').font = { bold: true };

    worksheet.mergeCells('A6:I6');
    worksheet.getCell('A6').value = 'SECRETARÍA DE FINANZAS';
    worksheet.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A6').font = { bold: true };

    worksheet.mergeCells('A7:I7');
    worksheet.getCell('A7').value = 'DEPARTAMENTO DE RECURSOS HUMANOS';
    worksheet.getCell('A7').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A7').font = { bold: true };

    worksheet.mergeCells('A8:I8');
    worksheet.getCell('A8').value = 'LISTA DE PERSONAL CON SU PERIODO VACACIONAL';
    worksheet.getCell('A8').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A8').font = { bold: true };

    worksheet.getCell('A10').value = 'Órgano Público:';
    worksheet.getCell('A10').alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getCell('A10').font = { bold: true };

    worksheet.getCell('B10').value = 'Secretaría de Finanzas del Poder Ejecutivo del Gobierno del Estado de Oaxaca';
    worksheet.getCell('B10').alignment = { horizontal: 'left', vertical: 'middle' };

    worksheet.getCell('A12').value = 'Área Administrativa:';
    worksheet.getCell('A12').alignment = { horizontal: 'left', vertical: 'middle' };
    worksheet.getCell('A12').font = { bold: true };

    worksheet.getCell('B12').value = toTitleCase(adscripcionDisplay);
    worksheet.getCell('B12').alignment = { horizontal: 'left', vertical: 'middle' };

    worksheet.mergeCells('A14:A15');
    worksheet.mergeCells('B14:B15');
    worksheet.mergeCells('C14:F14');
    worksheet.mergeCells('G14:G15');
    worksheet.mergeCells('H14:H15');
    worksheet.mergeCells('I14:I15');

    worksheet.getCell('A14').value = 'Nombre';
    worksheet.getCell('B14').value = 'Categoría';
    worksheet.getCell('C14').value = 'Períodos';
    worksheet.getCell('C15').value = '1';
    worksheet.getCell('D15').value = '2';
    worksheet.getCell('E15').value = '3';
    worksheet.getCell('F15').value = '4';
    worksheet.getCell('G14').value = 'Días';
    worksheet.getCell('H14').value = 'Fechas';
    worksheet.getCell('I14').value = 'Observaciones';

    if (ADSCRIPCION && ADSCRIPCION !== 'TODAS') {
      const adscripFriendly = toTitleCase(ADSCRIPCION);
      const infoRow = worksheet.addRow([`Área de Adscripción: ${adscripFriendly}`]);
      worksheet.mergeCells(`A${infoRow.number}:I${infoRow.number}`);

      const cell = worksheet.getCell(`A${infoRow.number}`);

      // separar texto
      const prefix = 'Área de Adscripción: ';
      const value = adscripFriendly; // mantiene mayúsculas/minúsculas
      const fullText = prefix + value;

      cell.value = fullText;
      cell.alignment = { horizontal: 'left', vertical: 'middle' };

      // ExcelJS no admite rich text en una célula merge directamente muy bien,
      // se usa "richText" si estás en versión compatible:
      cell.value = {
        richText: [
          { text: prefix, font: { bold: true, italic: false, name: 'Arial', size: 10 } },
          { text: value, font: { bold: false, italic: true, name: 'Arial', size: 10 } },
        ],
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };

      // fallback si no soporta richText:
      if (!cell.value || !cell.value.richText) {
        cell.font = { name: 'Arial', size: 10, italic: true };
      }
    }

    worksheet.getRow(14).height = 35;
    worksheet.getRow(15).height = 25;

    const headerCells = [
      'A14', 'B14', 'C14', 'G14', 'H14', 'I14', 'C15', 'D15', 'E15', 'F15'
    ];
    headerCells.forEach((cell) => {
      const c = worksheet.getCell(cell);
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
      c.font = { bold: true, size: 10 };
      c.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    // Obtener jerarquía de adscripciones
    const jerarquia = await querysql(`
      WITH RECURSIVE jerarquia AS (
        SELECT 
          id_adscripcion,
          nombre,
          clave,
          parent_id,
          CAST(LPAD(clave, 5, '0') AS CHAR(100)) AS path
        FROM adscripciones
        WHERE parent_id IS NULL
        
        UNION ALL
        
        SELECT 
          a.id_adscripcion,
          a.nombre,
          a.clave,
          a.parent_id,
          CONCAT(j.path, '-', LPAD(a.clave, 5, '0'))
        FROM adscripciones a
        INNER JOIN jerarquia j 
          ON a.parent_id = j.id_adscripcion
      )
      SELECT id_adscripcion, nombre, clave, parent_id, path FROM jerarquia ORDER BY path
    `);

    // Crear mapa de orden jerárquico
    const pathMap = new Map();
    jerarquia.forEach(item => {
      pathMap.set(item.clave, item.path);  // ← Mapear por item.clave
    });

    // Agrupar empleados por condición laboral (Base / Contrato / Otros)
    const groupedEmployees = {
      BASE: [],
      NOMBRAMIENTO: [],
      MANDOS_MEDIOS: [],
      CONTRATO_CONFIANZA: [],
      CONTRATO_CONTRATO: [],
    };

    const toCondition = (tipo) => {
      const code = String(tipo || '').toUpperCase();
      if (code === 'M51' || code === 'F51') return 'BASE';
      if (code === 'FCO' || code === '511') return 'NOMBRAMIENTO';
      if (code === 'FCT' || code === 'CCT') return 'CONTRATO_CONFIANZA';
      if (code === 'F53' || code === 'M53') return 'CONTRATO_CONTRATO';
      if (code === 'FMM' || code === 'MMS') return 'MANDOS_MEDIOS';
    };

    for (const item of empleadosFiltrados) {
      const condition = toCondition(item.TIPONOM);
      if (!condition) {
        console.warn('TIPONOM no reconocido en getPlantillaReportArea:', item.TIPONOM, item.NUMPLA);
        continue;
      }
      groupedEmployees[condition].push(item);
    }

    const sections = [
      { key: 'BASE', title: 'Plaza por condición laboral: Base' },
      { key: 'NOMBRAMIENTO', title: 'Plaza por condición laboral: Nombramiento Confianza' },
      { key: 'CONTRATO_CONFIANZA', title: 'Plaza por condición laboral: Contrato Confianza' },
      { key: 'CONTRATO_CONTRATO', title: 'Plaza por condición laboral: Contrato Contrato' },
      { key: 'MANDOS_MEDIOS', title: 'Plaza por condición laboral: Mandos Medios y Superiores' },
    ];

    Object.keys(groupedEmployees).forEach(key => {
      groupedEmployees[key].sort((a, b) => {
        const pathA = pathMap.get(a.CLAVE) || '';
        const pathB = pathMap.get(b.CLAVE) || '';
        return pathA.localeCompare(pathB);
      });
    });

    for (const section of sections) {
      const group = groupedEmployees[section.key];

      const rowHeader = worksheet.addRow([section.title]);
      worksheet.mergeCells(`A${rowHeader.number}:I${rowHeader.number}`);
      const headerCell = worksheet.getCell(`A${rowHeader.number}`);
      headerCell.font = { bold: true };
      rowHeader.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      });

      // Si no hay empleados, agregar fila de "Sin personal"
      if (!group || group.length === 0) {
        const rowEmpty = worksheet.addRow(['Sin personal en esta modalidad']);

        // Aplicar bordes a cada celda de A a H
        for (let col = 1; col <= 8; col++) {
          const cell = rowEmpty.getCell(col);
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
          cell.alignment = { vertical: 'middle' };
        }

        // Mergear después de aplicar bordes
        const emptyCell = worksheet.getCell(`A${rowEmpty.number}`);
        emptyCell.font = { size: 10 };
        emptyCell.alignment = { vertical: 'middle' };

        continue;
      }

      // Empleados de esta adscripción
      for (const emp of group) {

        const formatearFecha = (value) => {
          if (!value) return "";
          const fecha = moment(value);
          return fecha.isValid()
            ? fecha.locale("es").format("D [DE] MMMM [DEL] YYYY").toUpperCase()
            : "";
        };

        const formatearRangoFechas = (fechas) => {
          const inicio = fechas?.FECHA_INICIO;
          const fin = fechas?.FECHA_FIN;

          const textoInicio = formatearFecha(inicio);
          const textoFin = formatearFecha(fin);

          if (textoInicio && textoFin) return `DEL ${textoInicio} AL ${textoFin}`;
          if (textoInicio) return `DEL ${textoInicio}`;
          if (textoFin) return `AL ${textoFin}`;
          return "SIN DERECHO A VACACIONES";
        };

        const row = worksheet.addRow({
          NOMBRE: `${emp.APE_PAT || ''} ${emp.APE_MAT || ''} ${emp.NOMBRES || ''}`.trim(),
          NOMCATE: emp.NOMCATE || '',
          PERIODO1: `${emp.VACACIONES?.PERIODO === 1 ? 'X' : ''}`,
          PERIODO2: `${emp.VACACIONES?.PERIODO === 2 ? 'X' : ''}`,
          PERIODO3: `${emp.VACACIONES?.PERIODO === 3 ? 'X' : ''}`,
          PERIODO4: `${emp.VACACIONES?.PERIODO === 4 ? 'X' : ''}`,
          DIAS: Number(emp.VACACIONES?.DIAS || 0),
          FECHA: emp.TIPONOM !== 'FMM' && emp.TIPONOM !== 'MMS' ? formatearRangoFechas(emp.VACACIONES?.FECHAS) : '',
          ADSCRIPCION: SUBNIVELES === true ? emp?.ADSCRIPCION : '',
        });

        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
          if (cell.col === 3 || cell.col === 4 || cell.col === 5 || cell.col === 6 || cell.col === 7) {
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          } else {
            cell.alignment = { vertical: 'middle', wrapText: true };
          }
        });
      }
    }

    worksheet.eachRow({ includeEmpty: true }, (row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = {
          ...cell.font,
          name: 'Arial',
          size: 10,
        };
      });
    });

    const fechaStr = moment().format('YYYY-MM-DD_HH-mm-ss');
    const fileName = `PLANTILLA_${fechaStr}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

    const lastRow = worksheet.rowCount;
    worksheet.pageSetup.printArea = `A1:I${lastRow}`;
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error al generar el archivo Excel:', error.message);
    res.status(500).json({ message: 'Error al generar el archivo Excel.' });
  }
};

reportesPersonalController.getDifferencesBetweenPayroll = async (req, res) => {
  const user = req.user;
  const currentDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/Mexico_City",
  });

  try {
    if (!req.file) {
      return res.status(400).json({ message: "Debes seleccionar un archivo Excel." });
    }

    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.worksheets[0];

    if (!worksheet || worksheet.rowCount < 1) {
      return res.status(400).json({ message: "El archivo Excel no contiene información." });
    }

    // Normalizar valores para realizar comparaciones
    const normalizar = (valor) => {
      if (valor === null || valor === undefined) return "";

      return String(valor).trim().toUpperCase();
    };

    // Obtener los encabezados de la primera fila
    const encabezados = {};

    worksheet.getRow(1).eachCell((cell, colNumber) => {
      encabezados[normalizar(cell.value)] = colNumber;
    });

    // Aceptar NUP o NUE como encabezado
    const columnaRFC = encabezados.RFC;
    const columnaNUP = encabezados.NUP;
    const columnaCLAVE = encabezados.CLAVE;
    const columnaNOMCATE = encabezados.DESCRI;

    if (!columnaRFC || !columnaNUP || !columnaCLAVE) {
      return res.status(400).json({
        message:
          "El Excel debe contener los encabezados RFC, NUP o NUE y CLAVE en la primera fila.",
      });
    }

    // Leer las filas del Excel
    const filasExcel = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const rfc = normalizar(row.getCell(columnaRFC).value);

      // Ignorar filas sin RFC
      if (!rfc) return;

      const columnaNombre = encabezados.NOMBRE;

      filasExcel.push({
        filaExcel: rowNumber,
        nombre: columnaNombre
          ? String(row.getCell(columnaNombre).text || "").trim()
          : "",
        rfc,
        nupExcel: normalizar(row.getCell(columnaNUP).value),
        claveExcel: normalizar(row.getCell(columnaCLAVE).value),
        nomcateExcel: normalizar(row.getCell(columnaNOMCATE).value),
      });
    });

    if (filasExcel.length === 0) {
      return res.status(400).json({
        message: "No se encontraron filas con RFC en el Excel.",
      });
    }

    const rfcs = [...new Set(filasExcel.map((fila) => fila.rfc))];

    // Buscar empleados en MongoDB mediante tu función query
    const empleadosBD = await query("PLANTILLA", {
      RFC: {
        $in: rfcs,
      },
      status: 1
    });

    // Agrupar resultados por RFC para detectar duplicados
    const empleadosPorRFC = new Map();

    for (const empleado of empleadosBD || []) {
      const rfc = normalizar(empleado.RFC);

      if (!empleadosPorRFC.has(rfc)) {
        empleadosPorRFC.set(rfc, []);
      }

      empleadosPorRFC.get(rfc).push(empleado);
    }

    const resultados = [];

    for (const fila of filasExcel) {
      const coincidencias = empleadosPorRFC.get(fila.rfc) || [];

      // RFC no encontrado en la base de datos
      if (coincidencias.length === 0) {
        resultados.push({
          ...fila,
          estado: "NO_ENCONTRADO",
        });

        continue;
      }

      const empleado = coincidencias[0];

      const numplaBD = normalizar(empleado.NUMPLA);
      const clavecatBD = normalizar(empleado.CLAVECAT);
      const nomcateBD = normalizar(empleado.NOMCATE);

      const diferencias = [];

      if (fila.nupExcel !== numplaBD) {
        diferencias.push("NUMPLA");
      }

      if (fila.claveExcel !== clavecatBD) {
        diferencias.push("CLAVECAT");
      }

      // Solo devolver empleados que tengan diferencias
      if (diferencias.length > 0) {
        resultados.push({
          ...fila,
          numplaBD,
          clavecatBD,
          nomcateBD,
          estado: "CON_DIFERENCIAS",
        });
      }
    }

    const resultadosDiferencias = resultados.filter(
      (resultado) => resultado.estado === "CON_DIFERENCIAS"
    );

    const resultadosNoEncontrados = resultados.filter(
      (resultado) => resultado.estado === "NO_ENCONTRADO"
    );

    const workbookResultado = new ExcelJS.Workbook();

    workbookResultado.creator = "SIRH";
    workbookResultado.created = new Date();

    const worksheetResultado =
      workbookResultado.addWorksheet("Diferencias");

    const worksheetNoEncontrados =
      workbookResultado.addWorksheet("No encontrados");

    const configurarEncabezados = (hoja, tipo = "diferencias") => {
      if (tipo === "diferencias") {
        hoja.columns = [
          { key: "nombre" },
          { key: "rfc" },
          { key: "numplaBD" },
          { key: "clavecatBD" },
          { key: "nomcateBD" },
          { key: "nupExcel" },
          { key: "claveExcel" },
          { key: "nomcateExcel" },
        ];

        hoja.mergeCells("A1:A2");
        hoja.getCell("A1").value = "NOMBRE";

        hoja.mergeCells("B1:B2");
        hoja.getCell("B1").value = "RFC";

        hoja.mergeCells("C1:E1");
        hoja.getCell("C1").value = "SIRH";

        hoja.mergeCells("F1:H1");
        hoja.getCell("F1").value = "NÓMINA";

        hoja.getCell("C2").value = "NUMPLA";
        hoja.getCell("D2").value = "CLAVECAT";
        hoja.getCell("E2").value = "NOMCATE";
        hoja.getCell("F2").value = "NUMPLA";
        hoja.getCell("G2").value = "CLAVECAT";
        hoja.getCell("H2").value = "NOMCATE";

        ["C1", "C2", "D2", "E2"].forEach((celda) => {
          hoja.getCell(celda).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF9D2449" },
          };
        });

        ["F1", "F2", "G2", "H2"].forEach((celda) => {
          hoja.getCell(celda).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FF6C6E6D" },
          };
        });

        hoja.autoFilter = { from: "A2", to: "B2" };
      } else {
        // SOLO para No encontrados: 2 columnas
        hoja.columns = [
          { key: "nombre" },
          { key: "rfc" },
        ];

        hoja.getCell("A1").value = "NOMBRE";
        hoja.getCell("B1").value = "RFC";

        hoja.autoFilter = { from: "A1", to: "B1" };
      }

      // Formato común de encabezados
      const filasEncabezado = tipo === "diferencias" ? [1, 2] : [1];
      filasEncabezado.forEach((numeroFila) => {
        hoja.getRow(numeroFila).eachCell((cell) => {
          cell.font = {
            name: "Arial",
            size: 10,
            bold: true,
          };

          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
            wrapText: false,
          };

          cell.border = {
            top: { style: "thin", color: { argb: "FF000000" } },
            left: { style: "thin", color: { argb: "FF000000" } },
            bottom: { style: "thin", color: { argb: "FF000000" } },
            right: { style: "thin", color: { argb: "FF000000" } },
          };
        });
      });

      if (tipo === "diferencias") {
        ["C1", "D1", "E1", "F1", "G1", "H1", "C2", "D2", "E2", "F2", "G2", "H2"].forEach((celda) => {
          hoja.getCell(celda).font = {
            name: "Arial",
            size: 10,
            bold: true,
            color: { argb: "FFFFFFFF" },
          };
        });
      }

      hoja.views = [{
        state: "frozen",
        ySplit: tipo === "diferencias" ? 2 : 1,
      }];
    };

    configurarEncabezados(worksheetResultado);
    configurarEncabezados(worksheetNoEncontrados, "noEncontrados");

    // Empleados con diferencias o RFC duplicado
    for (const resultado of resultadosDiferencias) {
      worksheetResultado.addRow({
        nombre: resultado.nombre,
        rfc: resultado.rfc,
        numplaBD: resultado.numplaBD,
        clavecatBD: resultado.clavecatBD,
        nomcateBD: resultado.nomcateBD,
        nupExcel: resultado.nupExcel,
        claveExcel: resultado.claveExcel,
        nomcateExcel: resultado.nomcateExcel,
      });
    }

    // Empleados cuyo RFC no fue encontrado
    for (const resultado of resultadosNoEncontrados) {
      worksheetNoEncontrados.addRow({
        nombre: resultado.nombre,
        rfc: resultado.rfc
      });
    }

    const formatearFilas = (hoja, filasEncabezado = 2) => {
      hoja.eachRow((row, rowNumber) => {
        if (rowNumber <= filasEncabezado) return;

        row.eachCell((cell) => {
          cell.font = {
            name: "Arial",
            size: 10,
          };

          cell.border = {
            top: { style: "thin", color: { argb: "FF000000" } },
            left: { style: "thin", color: { argb: "FF000000" } },
            bottom: { style: "thin", color: { argb: "FF000000" } },
            right: { style: "thin", color: { argb: "FF000000" } },
          };
        });
      });
    };

    formatearFilas(worksheetResultado, 2);
    formatearFilas(worksheetNoEncontrados, 1);

    // Configurar descarga del archivo
    const fechaStr = moment().format("YYYY-MM-DD_HH-mm-ss");

    const fileName = `DIFERENCIAS_NOMINA_${fechaStr}.xlsx`;

    res.setHeader(
      "X-Cambios-Encontrados",
      String(resultadosDiferencias.length)
    );
    res.setHeader(
      "X-Personas-No-Encontradas",
      String(resultadosNoEncontrados.length)
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Disposition, X-Cambios-Encontrados, X-Personas-No-Encontradas"
    );

    await workbookResultado.xlsx.write(res);

    const userAction = {
      username: user.username,
      module: "PSL",
      action: `COMPARÓ EL EXCEL DE NÓMINA CON LA PLANTILLA ACTUAL`,
      timestamp: currentDateTime,
    };

    await insertOne("USER_ACTIONS", userAction);

    return res.end();

  } catch (error) {
    console.error(
      "Error al comparar el Excel con PLANTILLA:",
      error
    );

    if (!res.headersSent) {
      return res.status(500).json({
        message: "Error al comparar el Excel con la base de datos.",
      });
    }

    return res.end();
  }
}

reportesPersonalController.getPlantillaModuleRecepcionEcon = async (req, res) => {

  try {

    const plantilla = await query("PLANTILLA", { status: 1 });

    if (!plantilla || plantilla.length === 0) {
      return res.status(404).json({ message: "No hay registros de plantilla." });
    }

    // Crea el libro y la hoja
    const ExcelJS = require("exceljs");
    const moment = require("moment");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("PLANTILLA");

    const columnas = [
      { header: "NUMEMP", key: "NUMEMP" },
      { header: "NUMPLA", key: "NUMPLA" },
      { header: "NOMBRE", key: "NOMBRE_COMPLETO" },
      { header: "CLAVE", key: "CLAVE" },
      { header: "AREA", key: "ADSCRIPCION" },
      { header: "CLAVE_FISICAMENTE", key: "CLAVE_FISICAMENTE" },
      { header: "AREA_FISICAMENTE", key: "ADSCRIPCION_FISICAMENTE" },
      { header: "PROYECTO", key: "PROYECTO" },
      { header: "TIPONOM", key: "TIPONOM" },
      { header: "MOD_ANTE", key: "MOD_ANTE" },
      { header: "CLAVECAT", key: "CLAVECAT" },
      { header: "NOMCATE", key: "NOMCATE" },
      { header: "NIVEL", key: "NIVEL" },
      { header: "INGRESO", key: "FECHA_INGRESO" },
      { header: "CURP", key: "CURP" },
      { header: "RFC", key: "RFC" },
      { header: "AFILIACION", key: "AFILIACI" },
    ];

    worksheet.columns = columnas;
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = "A1:Q1";

    // Agrega los datos
    for (const item of plantilla) {
      const fila = {
        ...item,
        NOMBRE_COMPLETO: `${item.APE_PAT || ""} ${item.APE_MAT || ""} ${item.NOMBRES || ""}`.trim(),
        CLAVE_FISICAMENTE: item.STATUS_EMPLEADO?.find(s => s.STATUS === "ASIG_LAB")?.CLAVE || "",
        ADSCRIPCION_FISICAMENTE: item.STATUS_EMPLEADO?.find(s => s.STATUS === "ASIG_LAB")?.LUGAR_COMISIONADO || "",
      };

      worksheet.addRow(fila);
    };

    worksheet.getRow(1).font = { bold: true };

    // Genera el archivo y responde para descarga
    const fileName = `PLANTILLA.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error al generar el archivo Excel:", error.message);
    res.status(500).json({ message: "Error al generar el archivo Excel." });
  }
};
module.exports = reportesPersonalController;
