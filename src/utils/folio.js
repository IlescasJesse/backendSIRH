// Folio y código de verificación para documentos del Portal de Documentos
// Digitales (ver spec en memoria "project-portal-documentos-digitales").
// Formato de folio: SEFIN-<TIPO>-<AÑO>-<6 dígitos>-<DV>
// El código de verificación (8 caracteres) se muestra una sola vez al
// solicitante y solo se guarda su hash (sha256) en BD, igual que las
// contraseñas temporales de EMPLEADOS_ACCESO.
const crypto = require("crypto");

const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para evitar confusión

function digitoVerificador(consecutivo) {
  // DV simple mod 10 sobre el consecutivo, suficiente para detectar
  // errores de captura al verificar por folio a mano.
  const suma = String(consecutivo)
    .split("")
    .reduce((acc, d) => acc + Number(d), 0);
  return suma % 10;
}

function generarFolio(tipoDocumento, consecutivo, anio = new Date().getFullYear()) {
  const consecutivoStr = String(consecutivo).padStart(6, "0");
  const dv = digitoVerificador(consecutivoStr);
  return `SEFIN-${tipoDocumento}-${anio}-${consecutivoStr}-${dv}`;
}

function generarCodigoVerificacion(longitud = 8) {
  let codigo = "";
  const bytes = crypto.randomBytes(longitud);
  for (let i = 0; i < longitud; i++) {
    codigo += ALFABETO_CODIGO[bytes[i] % ALFABETO_CODIGO.length];
  }
  return codigo;
}

function hashCodigoVerificacion(codigo) {
  return crypto.createHash("sha256").update(codigo).digest("hex");
}

module.exports = {
  generarFolio,
  generarCodigoVerificacion,
  hashCodigoVerificacion,
};
