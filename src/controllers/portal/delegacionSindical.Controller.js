// Vista "por Delegación Sindical" del Portal de Documentos Digitales: los
// delegados sindicales piden en bloque las cédulas/constancias de su gente,
// RH sigue siendo quien las expide. Reutiliza el mismo dato que ya captura
// PSL-CE (`PLANTILLA.SINDICATO`) — no requiere nada nuevo en el modelo.
const { query } = require("../../config/mongo");
const { querysql } = require("../../config/mysql");

const delegacionSindicalController = {};

// Un empleado afiliado sin `SINDICATO.DELEGACION` (o con una captura basura
// tipo "SIN DELEGADO" en vez de una clave real) cae aquí, para que RH lo
// pueda ubicar y no quede escondido. Ver memoria
// project_constancias_adscripcion_especial / project_portal_documentos_digitales
// — status real del dato confirmado 2026-09-28.
const SIN_DELEGACION = "SIN_DELEGACION";

// GET /api/portal-admin/delegaciones — catálogo de delegaciones sindicales
// (MySQL) + cuántos afiliados de base tiene cada una en PLANTILLA, para
// poblar el selector sin que el front tenga que pedir los dos por separado.
delegacionSindicalController.listarDelegaciones = async (req, res) => {
  try {
    const [delegaciones, conteos] = await Promise.all([
      querysql("SELECT delegacion, delegado FROM delegaciones ORDER BY delegacion"),
      query("PLANTILLA", {
        status: 1,
        TIPONOM: { $in: ["F51", "M51"] },
        "SINDICATO.AFILIADO": true,
      }),
    ]);

    const porClave = {};
    let huerfanos = 0;
    for (const emp of conteos) {
      const clave = (emp.SINDICATO?.DELEGACION || "").trim();
      const esValida = clave && clave.toUpperCase() !== "SIN DELEGADO";
      if (esValida) {
        porClave[clave] = (porClave[clave] || 0) + 1;
      } else {
        huerfanos++;
      }
    }

    const resultado = delegaciones.map((d) => ({
      delegacion: d.delegacion,
      delegado: d.delegado,
      total: porClave[d.delegacion] || 0,
    }));

    resultado.push({
      delegacion: SIN_DELEGACION,
      delegado: null,
      total: huerfanos,
    });

    res.status(200).json(resultado);
  } catch (error) {
    console.error("Error listando delegaciones sindicales:", error);
    res.status(500).json({ message: "Error al obtener las delegaciones" });
  }
};

// GET /api/portal-admin/delegaciones/:delegacion/empleados — empleados de
// base, afiliados y activos de esa delegación. `:delegacion` puede ser una
// clave real ("3E101") o el sentinel SIN_DELEGACION para los huérfanos.
delegacionSindicalController.getEmpleadosPorDelegacion = async (req, res) => {
  const { delegacion } = req.params;

  try {
    const criteriosBase = {
      status: 1,
      TIPONOM: { $in: ["F51", "M51"] },
      "SINDICATO.AFILIADO": true,
    };

    const criteria =
      delegacion === SIN_DELEGACION
        ? {
            ...criteriosBase,
            $or: [
              { "SINDICATO.DELEGACION": { $exists: false } },
              { "SINDICATO.DELEGACION": null },
              { "SINDICATO.DELEGACION": "" },
              { "SINDICATO.DELEGACION": { $regex: /^SIN DELEGADO$/i } },
            ],
          }
        : { ...criteriosBase, "SINDICATO.DELEGACION": delegacion };

    const empleados = await query("PLANTILLA", criteria);
    res.status(200).json(empleados);
  } catch (error) {
    console.error("Error obteniendo empleados por delegación:", error);
    res.status(500).json({ message: "Error al obtener los empleados de la delegación" });
  }
};

module.exports = delegacionSindicalController;
