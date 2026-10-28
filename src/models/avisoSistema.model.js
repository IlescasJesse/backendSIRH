const mongoose = require("mongoose");

// Avisos globales que se lanzan desde el monitor (dev-finanzas) y se muestran
// a todos los usuarios de SIRH: mantenimiento, nueva versión o avisos generales.
const AvisoSistemaSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: ["mantenimiento", "version", "info", "alerta"],
      required: true,
    },
    nivel: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
    },
    titulo: { type: String, required: true, maxlength: 120 },
    mensaje: { type: String, required: true, maxlength: 2000 },
    version: { type: String, maxlength: 30 }, // solo para tipo "version"

    // Ventana de vigencia. Para mantenimiento, "inicio" es cuando empieza el
    // bloqueo y "fin" la hora estimada de regreso.
    inicio: { type: Date, default: Date.now },
    fin: { type: Date, default: null },

    // Solo mantenimiento: si es true, la API responde 503 mientras esté vigente.
    bloquear: { type: Boolean, default: false },

    activo: { type: Boolean, default: true },
    creadoPor: { type: String, default: "monitor" },
    retiradoEn: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false, collection: "AVISOS_SISTEMA" }
);

AvisoSistemaSchema.index({ activo: 1, tipo: 1 });

module.exports = mongoose.model("AvisoSistema", AvisoSistemaSchema);
