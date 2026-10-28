// Estatus laboral "LISTA DE ASISTENCIA": la persona registra su asistencia en
// lista en lugar de checar. Conserva su número de tarjeta (se busca, reporta y
// genera incidencias igual); lo único que cambia es que no se imprime su tarjeta.
const LISTA_ASIST = "LISTA_ASIST";
const ETIQUETA_LISTA_ASIST = "LISTA DE ASISTENCIA";

// Estatus que ya excluyen la tarjeta: no se combinan con LISTA_ASIST.
const NO_COMBINABLES = ["EXIMA", "COM_LAB"];

function listaStatus(statusEmpleado) {
  if (Array.isArray(statusEmpleado)) return statusEmpleado.filter(Boolean);
  return statusEmpleado ? [statusEmpleado] : [];
}

function tieneListaAsistencia(statusEmpleado) {
  return listaStatus(statusEmpleado).some((s) => s?.STATUS === LISTA_ASIST);
}

// Devuelve el mensaje de error si la combinación no es válida, o null.
function validarListaAsistencia(statusEmpleado) {
  const estatus = listaStatus(statusEmpleado);
  const lista = estatus.find((s) => s?.STATUS === LISTA_ASIST);
  if (!lista) return null;

  if (estatus.some((s) => NO_COMBINABLES.includes(s?.STATUS))) {
    return "LISTA DE ASISTENCIA no se puede combinar con EXIMA ni con COMISIÓN LABORAL";
  }
  if (!lista.DESDE) {
    return "La fecha DESDE es obligatoria para LISTA DE ASISTENCIA";
  }
  return null;
}

module.exports = { LISTA_ASIST, ETIQUETA_LISTA_ASIST, tieneListaAsistencia, validarListaAsistencia };
