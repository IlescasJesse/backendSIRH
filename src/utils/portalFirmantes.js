// Firmantes de los documentos del Portal.
//
// Catálogo FIRMANTES (personas que pueden firmar) + configuración de quién es
// el titular y quién el suplente (CONFIG_PORTAL, _id "firma"). El titular
// siempre aparece en su bloque de firma; cuando está ausente se agrega la
// leyenda "Por ausencia y con fundamento en el artículo 128…" con el suplente,
// que es quien realmente suscribe.
const { query } = require("../config/mongo");
const { ObjectId } = require("mongodb");

const COLECCION_FIRMANTES = "FIRMANTES";
const COLECCION_CONFIG = "CONFIG_PORTAL";
const ID_CONFIG = "firma";

// Error de configuración de firmantes que impide expedir (se responde 422).
class ErrorConfiguracionFirma extends Error {
  constructor(message) {
    super(message);
    this.status = 422;
  }
}

async function obtenerConfiguracion() {
  const [config] = await query(COLECCION_CONFIG, { _id: ID_CONFIG });
  return {
    titularId: config?.titularId || null,
    suplenteId: config?.suplenteId || null,
    titularAusente: Boolean(config?.titularAusente),
  };
}

async function cargarFirmante(id, etiqueta) {
  if (!id) return null;
  const [firmante] = await query(COLECCION_FIRMANTES, { _id: new ObjectId(String(id)) });
  if (!firmante || !firmante.activo) {
    throw new ErrorConfiguracionFirma(
      `El firmante ${etiqueta} configurado ya no existe o está inactivo; actualiza la configuración de firmantes`
    );
  }
  return firmante;
}

// titularAusente (opcional): fuerza la situación para esta expedición; si no
// se manda, se usa la de la configuración.
async function resolverFirmantes({ titularAusente } = {}) {
  const config = await obtenerConfiguracion();
  const ausente = typeof titularAusente === "boolean" ? titularAusente : config.titularAusente;

  const titular = await cargarFirmante(config.titularId, "titular");
  if (!titular) {
    throw new ErrorConfiguracionFirma("No hay firmante titular configurado; configúralo antes de expedir documentos");
  }

  let suplente = null;
  if (ausente) {
    suplente = await cargarFirmante(config.suplenteId, "suplente");
    if (!suplente) {
      throw new ErrorConfiguracionFirma(
        "El titular está ausente pero no hay firmante suplente configurado; configúralo antes de expedir documentos"
      );
    }
  }

  return { titular, suplente, suplencia: ausente };
}

module.exports = {
  COLECCION_FIRMANTES,
  COLECCION_CONFIG,
  ID_CONFIG,
  ErrorConfiguracionFirma,
  obtenerConfiguracion,
  resolverFirmantes,
};
