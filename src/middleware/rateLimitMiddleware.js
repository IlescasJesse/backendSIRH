const rateLimit = require("express-rate-limit");

const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Demasiados intentos. Intenta nuevamente más tarde.",
    },
});

module.exports = {
    loginLimiter,
};