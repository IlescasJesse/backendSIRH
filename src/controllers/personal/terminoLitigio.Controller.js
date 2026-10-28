const { ObjectId } = require("mongodb");
const { query, updateOne, insertOne } = require("../../config/mongo");
const { querysql } = require("../../config/mysql");

// Toda plaza con clave de adscripción 105 está reservada por litigio.
const CLAVE_LITIGIO = 105;
const FILTRO_CLAVE_LITIGIO = { $in: [CLAVE_LITIGIO, String(CLAVE_LITIGIO)] };

const terminoLitigioController = {};

function enLitigio(empleado) {
  return Number(empleado?.CLAVE) === CLAVE_LITIGIO;
}

function nombreCompleto(e) {
  return [e.NOMBRES, e.APE_PAT, e.APE_MAT].filter(Boolean).join(" ");
}

function ahoraMx() {
  return new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
}

async function buscarEmpleado(id) {
  if (!ObjectId.isValid(id)) return null;
  const [empleado] = await query("PLANTILLA", { _id: new ObjectId(id) });
  return empleado || null;
}

// Adscripción que tenía el empleado antes de pasar a la clave 105, según HSY_AREAS.
async function sugerenciaPrevia(idEmpleado) {
  const movimientos = await query("HSY_AREAS", {
    id_employee: new ObjectId(idEmpleado),
    CLAVE: FILTRO_CLAVE_LITIGIO,
  });
  const ultimo = movimientos
    .filter((m) => m.last_clave !== undefined && Number(m.last_clave) !== CLAVE_LITIGIO)
    .sort((a, b) => b._id.getTimestamp() - a._id.getTimestamp())[0];
  if (!ultimo) return null;

  const [adsc] = await querysql("SELECT nombre FROM adscripciones WHERE clave = ? LIMIT 1", [
    ultimo.last_clave,
  ]);
  return {
    ADSCRIPCION: adsc?.nombre || ultimo.last_adscripcion || "",
    CLAVE: ultimo.last_clave,
    AREA_RESP: ultimo.last_area_resp || null,
  };
}

// Último ocupante titular registrado en PLAZAS (a quien se reincorpora tras el litigio).
async function ocupanteAnterior(numpla) {
  if (numpla === undefined || numpla === null) return null;
  const [plaza] = await query("PLAZAS", { NUMPLA: numpla });
  const titulares = (plaza?.previousOcuppants || []).filter((o) => o.OWNER === true);
  const ultimo = titulares[titulares.length - 1];
  if (!ultimo) return null;
  return { ...separarNombreNota(ultimo.NOMBRE), MOTIVO_BAJA: ultimo.MOTIVO_BAJA || null };
}

// En el sistema anterior se pegaban notas al nombre con un punto
// ("PEREZ CRUZ SANDRA TERESA.NO RECIBIO OFIC"). Se corta en el primer "." cuya
// palabra anterior tenga 3+ letras, para no romper abreviaturas como "MA. DEL CARMEN".
// Solo es una sugerencia: el dato guardado no se modifica y el front deja editarlo.
function separarNombreNota(original) {
  const texto = String(original || "").trim();
  const corte = /[A-ZÁÉÍÓÚÜÑ]{3,}\./i.exec(texto);
  if (!corte) return { NOMBRE: texto, NOTA: null, ORIGINAL: texto };
  const fin = corte.index + corte[0].length - 1;
  const nota = texto.slice(fin + 1).trim();
  return { NOMBRE: texto.slice(0, fin).trim(), NOTA: nota || null, ORIGINAL: texto };
}

// FECHA_TERMINO "YYYY-MM-DD" válida y no futura (hora de México).
function validarFecha(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const fecha = new Date(`${valor}T12:00:00-06:00`);
  if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) return null;
  const hoyMx = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  return valor <= hoyMx ? fecha : null;
}

// GET /api/personal/terminoLitigio/:id — datos para precargar el diálogo.
terminoLitigioController.getTerminoLitigio = async (req, res) => {
  try {
    const empleado = await buscarEmpleado(req.params.id);
    if (!empleado) return res.status(404).json({ message: "Empleado no encontrado" });

    const elegible = enLitigio(empleado);
    res.json({
      elegible,
      message: elegible
        ? "La plaza está en litigio (clave 105) y puede reactivarse."
        : `La plaza no está en litigio: su clave actual es ${empleado.CLAVE ?? "sin clave"}.`,
      claveActual: empleado.CLAVE ?? null,
      adscripcionActual: empleado.ADSCRIPCION ?? null,
      vacante: empleado.status === 2,
      // Solo aplica a plazas vacantes (las 105 heredadas de la migración).
      ocupanteAnterior: empleado.status === 2 ? await ocupanteAnterior(empleado.NUMPLA) : null,
      sugerencia: elegible ? await sugerenciaPrevia(empleado._id) : null,
    });
  } catch (error) {
    console.error("Error consultando término de litigio:", error);
    res.status(500).json({ message: "Error al consultar la información de litigio" });
  }
};

// POST /api/personal/terminoLitigio — reactiva una plaza en clave 105.
// Mongo es standalone (sin transacciones): se valida todo antes de escribir y la
// primera escritura (PLANTILLA filtrada por CLAVE 105) decide; si no aplica, no se escribe nada.
terminoLitigioController.terminoLitigio = async (req, res) => {
  const { _id, NUMPLA, FECHA_TERMINO, ADSCRIPCION, CLAVE, AREA_RESP, OBSERVACIONES, OFICIO, REINCORPORAR, NOMBRE_REINCORPORA } =
    req.body || {};
  const { user } = req;

  try {
    const empleado = await buscarEmpleado(_id);
    if (!empleado) return res.status(404).json({ message: "Empleado no encontrado" });

    if (NUMPLA !== undefined && NUMPLA !== null && NUMPLA !== "" && Number(NUMPLA) !== Number(empleado.NUMPLA)) {
      return res.status(400).json({ message: "El número de plaza no corresponde al empleado" });
    }
    if (!enLitigio(empleado)) {
      return res.status(409).json({
        message: `La plaza ya no está en litigio: su clave actual es ${empleado.CLAVE ?? "sin clave"}.`,
      });
    }

    const fecha = validarFecha(FECHA_TERMINO);
    if (!fecha) {
      return res.status(400).json({ message: "La fecha de término es inválida o es una fecha futura" });
    }

    const adscripcion = typeof ADSCRIPCION === "string" ? ADSCRIPCION.trim() : "";
    if (!adscripcion) return res.status(400).json({ message: "La adscripción es obligatoria" });
    if (AREA_RESP === undefined || AREA_RESP === null || AREA_RESP === "") {
      return res.status(400).json({ message: "El área responsable es obligatoria" });
    }

    if (CLAVE === undefined || CLAVE === null || CLAVE === "" || Number.isNaN(Number(CLAVE))) {
      return res.status(400).json({ message: "La clave de adscripción es obligatoria" });
    }
    if (Number(CLAVE) === CLAVE_LITIGIO) {
      return res.status(400).json({ message: "La nueva clave no puede ser la 105 (litigio)" });
    }
    const [adscDb] = await querysql("SELECT clave FROM adscripciones WHERE clave = ? LIMIT 1", [CLAVE]);
    if (!adscDb) return res.status(400).json({ message: "La clave de adscripción no existe" });

    const observaciones = typeof OBSERVACIONES === "string" ? OBSERVACIONES.trim() : "";
    if (observaciones.length < 10 || observaciones.length > 500) {
      return res.status(400).json({ message: "Las observaciones deben tener entre 10 y 500 caracteres" });
    }
    const oficio = typeof OFICIO === "string" ? OFICIO.trim() : "";
    if (oficio.length > 100) {
      return res.status(400).json({ message: "El número de oficio no puede pasar de 100 caracteres" });
    }

    // REINCORPORAR: la plaza se libera para dar de alta de nuevo al ocupante anterior
    // (la alta se hace después con el flujo normal de propuesta/alta).
    if (REINCORPORAR !== undefined && typeof REINCORPORAR !== "boolean") {
      return res.status(400).json({ message: "REINCORPORAR debe ser verdadero o falso" });
    }
    let reincorpora = null;
    if (REINCORPORAR === true) {
      if (empleado.status !== 2) {
        return res.status(400).json({ message: "Solo se puede reincorporar al ocupante anterior si la plaza está vacante" });
      }
      reincorpora = await ocupanteAnterior(empleado.NUMPLA);
      if (!reincorpora) {
        return res.status(400).json({ message: "La plaza no tiene un ocupante anterior registrado para reincorporar" });
      }
      const nombreCapturado = typeof NOMBRE_REINCORPORA === "string" ? NOMBRE_REINCORPORA.trim() : "";
      if (nombreCapturado.length > 120) {
        return res.status(400).json({ message: "El nombre de quien se reincorpora no puede pasar de 120 caracteres" });
      }
      if (nombreCapturado) reincorpora.NOMBRE = nombreCapturado;
    }

    // Mismo tipo que ya tenía el campo en la plantilla (número o texto).
    const claveNueva = typeof empleado.CLAVE === "string" ? String(CLAVE) : Number(CLAVE);
    const currentDateTime = ahoraMx();
    const registro = {
      TIPO: "TERMINO",
      FECHA_TERMINO: fecha,
      CLAVE_ANTERIOR: empleado.CLAVE,
      ADSCRIPCION_ANTERIOR: empleado.ADSCRIPCION ?? null,
      AREA_RESP_ANTERIOR: empleado.AREA_RESP ?? null,
      CLAVE_NUEVA: claveNueva,
      ADSCRIPCION_NUEVA: adscripcion,
      AREA_RESP_NUEVA: AREA_RESP,
      OBSERVACIONES: observaciones,
      OFICIO: oficio || null,
      REINCORPORA: reincorpora?.NOMBRE || null,
      CAPTURADO_POR: user.username,
      CAPTURADO_EN: new Date(),
    };

    const resultado = await updateOne(
      "PLANTILLA",
      { _id: empleado._id, CLAVE: FILTRO_CLAVE_LITIGIO },
      {
        $set: { ADSCRIPCION: adscripcion, AREA_RESP, CLAVE: claveNueva },
        $push: { HISTORIAL_LITIGIO: registro },
      },
    );
    if (resultado.matchedCount === 0) {
      return res.status(409).json({ message: "La plaza ya no está en litigio (otro usuario la modificó)." });
    }

    const fechaTxt = FECHA_TERMINO.split("-").reverse().join("/");
    const nombre = nombreCompleto(empleado);

    if (empleado.NUMPLA !== undefined && empleado.NUMPLA !== null) {
      await updateOne(
        "PLAZAS",
        { NUMPLA: empleado.NUMPLA },
        { $set: { DEPARTAMENTO: adscripcion }, $push: { HISTORIAL_LITIGIO: registro } },
      );
    }

    await insertOne("HSY_AREAS", {
      tipo: "TERMINO_LITIGIO",
      ADSCRIPCION: adscripcion,
      AREA_RESP,
      CLAVE: claveNueva,
      FECHA_TERMINO: fecha,
      OBSERVACIONES: observaciones,
      OFICIO: oficio || null,
      REINCORPORA: reincorpora?.NOMBRE || null,
      currentDateTime,
      last_adscripcion: registro.ADSCRIPCION_ANTERIOR,
      last_clave: registro.CLAVE_ANTERIOR,
      last_area_resp: registro.AREA_RESP_ANTERIOR,
      id_employee: empleado._id,
      username: user.username,
    });

    if (empleado.ID_BITACORA) {
      await updateOne(
        "BITACORA",
        { _id: new ObjectId(String(empleado.ID_BITACORA)) },
        {
          $push: {
            personal: {
              _id: new ObjectId(),
              autor: user.username,
              comentario:
                `TÉRMINO DE LITIGIO ${fechaTxt}: PASA DE CLAVE ${registro.CLAVE_ANTERIOR} (${registro.ADSCRIPCION_ANTERIOR || ""}) ` +
                `A CLAVE ${claveNueva} (${adscripcion})${oficio ? `. OFICIO: ${oficio}` : ""}` +
                `${reincorpora ? `. SE LIBERA PARA REINCORPORAR A: ${reincorpora.NOMBRE}` : ""}. ${observaciones}`,
              fecha: currentDateTime,
            },
          },
        },
      );
    }

    await insertOne("USER_ACTIONS", {
      username: user.username,
      module: "PSL-TL",
      action: `REGISTRÓ TÉRMINO DE LITIGIO (${fechaTxt}) DE LA PLAZA ${empleado.NUMPLA ?? ""} DEL EMPLEADO "${nombre}"`,
      timestamp: currentDateTime,
    });

    res.status(200).json({
      message: reincorpora
        ? `Término de litigio registrado. Continúa con la propuesta de alta de ${reincorpora.NOMBRE} en la plaza ${empleado.NUMPLA}.`
        : "Término de litigio registrado correctamente",
      _id: empleado._id,
      reincorpora: reincorpora ? { NUMPLA: empleado.NUMPLA, NOMBRE: reincorpora.NOMBRE } : null,
    });
  } catch (error) {
    console.error("Error registrando término de litigio:", error);
    res.status(500).json({ message: "Error al registrar el término de litigio" });
  }
};

// POST /api/personal/ponerEnLitigio — pasa la plaza a clave 105. Si está ocupada,
// la persona sigue ligada a su plaza (no hay baja); se guarda la clave, adscripción
// y área anteriores para que el término las sugiera al regresarla.
terminoLitigioController.ponerEnLitigio = async (req, res) => {
  const { _id, FECHA_INICIO, OBSERVACIONES, OFICIO } = req.body || {};
  const { user } = req;

  try {
    const empleado = await buscarEmpleado(_id);
    if (!empleado) return res.status(404).json({ message: "Empleado no encontrado" });
    if (enLitigio(empleado)) {
      return res.status(409).json({ message: "La plaza ya está en litigio (clave 105)." });
    }

    const fecha = validarFecha(FECHA_INICIO);
    if (!fecha) {
      return res.status(400).json({ message: "La fecha de inicio es inválida o es una fecha futura" });
    }
    const observaciones = typeof OBSERVACIONES === "string" ? OBSERVACIONES.trim() : "";
    if (observaciones.length < 10 || observaciones.length > 500) {
      return res.status(400).json({ message: "Las observaciones deben tener entre 10 y 500 caracteres" });
    }
    const oficio = typeof OFICIO === "string" ? OFICIO.trim() : "";
    if (oficio.length > 100) {
      return res.status(400).json({ message: "El número de oficio no puede pasar de 100 caracteres" });
    }

    const claveLitigio = typeof empleado.CLAVE === "string" ? String(CLAVE_LITIGIO) : CLAVE_LITIGIO;
    const currentDateTime = ahoraMx();
    const registro = {
      TIPO: "INICIO",
      FECHA_INICIO: fecha,
      CLAVE_ANTERIOR: empleado.CLAVE ?? null,
      ADSCRIPCION_ANTERIOR: empleado.ADSCRIPCION ?? null,
      AREA_RESP_ANTERIOR: empleado.AREA_RESP ?? null,
      PLAZA_OCUPADA: empleado.status === 1,
      OBSERVACIONES: observaciones,
      OFICIO: oficio || null,
      CAPTURADO_POR: user.username,
      CAPTURADO_EN: new Date(),
    };

    // El filtro por la clave actual evita aplicarlo dos veces si dos usuarios lo hacen a la vez.
    const resultado = await updateOne(
      "PLANTILLA",
      { _id: empleado._id, CLAVE: empleado.CLAVE ?? null },
      { $set: { CLAVE: claveLitigio }, $push: { HISTORIAL_LITIGIO: registro } },
    );
    if (resultado.matchedCount === 0) {
      return res.status(409).json({ message: "La plaza cambió mientras se capturaba; vuelve a intentarlo." });
    }

    const fechaTxt = FECHA_INICIO.split("-").reverse().join("/");

    if (empleado.NUMPLA !== undefined && empleado.NUMPLA !== null) {
      await updateOne("PLAZAS", { NUMPLA: empleado.NUMPLA }, { $push: { HISTORIAL_LITIGIO: registro } });
    }

    await insertOne("HSY_AREAS", {
      tipo: "INICIO_LITIGIO",
      ADSCRIPCION: empleado.ADSCRIPCION ?? null,
      AREA_RESP: empleado.AREA_RESP ?? null,
      CLAVE: claveLitigio,
      FECHA_INICIO: fecha,
      OBSERVACIONES: observaciones,
      OFICIO: oficio || null,
      currentDateTime,
      last_adscripcion: registro.ADSCRIPCION_ANTERIOR,
      last_clave: registro.CLAVE_ANTERIOR,
      last_area_resp: registro.AREA_RESP_ANTERIOR,
      id_employee: empleado._id,
      username: user.username,
    });

    if (empleado.ID_BITACORA) {
      await updateOne(
        "BITACORA",
        { _id: new ObjectId(String(empleado.ID_BITACORA)) },
        {
          $push: {
            personal: {
              _id: new ObjectId(),
              autor: user.username,
              comentario:
                `INICIO DE LITIGIO ${fechaTxt}: PASA DE CLAVE ${registro.CLAVE_ANTERIOR ?? "SIN CLAVE"} ` +
                `(${registro.ADSCRIPCION_ANTERIOR || ""}) A CLAVE ${CLAVE_LITIGIO}` +
                `${oficio ? `. OFICIO: ${oficio}` : ""}. ${observaciones}`,
              fecha: currentDateTime,
            },
          },
        },
      );
    }

    const quien = empleado.status === 1 ? ` DEL EMPLEADO "${nombreCompleto(empleado)}"` : " (VACANTE)";
    await insertOne("USER_ACTIONS", {
      username: user.username,
      module: "PSL-TL",
      action: `PUSO EN LITIGIO (${fechaTxt}) LA PLAZA ${empleado.NUMPLA ?? ""}${quien}`,
      timestamp: currentDateTime,
    });

    res.status(200).json({ message: "La plaza quedó en litigio (clave 105)", _id: empleado._id });
  } catch (error) {
    console.error("Error poniendo plaza en litigio:", error);
    res.status(500).json({ message: "Error al poner la plaza en litigio" });
  }
};

module.exports = terminoLitigioController;
