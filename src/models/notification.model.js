const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
    {
        title: String,
        message: String,
        username: String,    // quién generó la notificación
        module: String,        // PSL, VACACIONES…
        rol: [String],       // ['ADMIN', 'RH']
        permissions: [String], // ['PSL-EI', 'VACACIONES-APROBAR']
        userTarget: String,    // username específico (opcional)

        readBy: [String],      // usuarios que ya la leyeron

        // campos legibles con formato solicitado
        fecha: String, // DD/MM/AAAA
        hora: String   // HH:MM a.m. / p.m. (ej. "14:01 p.m.")
    },
    { timestamps: false, versionKey: false }
);

// Helper para formatear fecha y hora
function formatFechaHora(date = new Date()) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, "0"); // mantiene formato 24h como pidió
    const min = String(date.getMinutes()).padStart(2, "0");
    const suffix = date.getHours() < 12 ? "a.m." : "p.m.";
    return {
        fecha: `${dd}/${mm}/${yyyy}`,
        hora: `${hh}:${min} ${suffix}`,
    };
}

// Guardar fecha/hora formateada al crear (si no existen)
NotificationSchema.pre("save", function (next) {
    if (!this.fecha || !this.hora) {
        const { fecha, hora } = formatFechaHora(new Date());
        this.fecha = fecha;
        this.hora = hora;
    }
    next();
});

// También actualizar campos en operaciones findOneAndUpdate
NotificationSchema.pre("findOneAndUpdate", function (next) {
    const { fecha, hora } = formatFechaHora(new Date());
    this._update = this._update || {};
    this._update.fecha = fecha;
    this._update.hora = hora;
    next();
});

module.exports = mongoose.model("Notification", NotificationSchema);