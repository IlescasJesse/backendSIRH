// Verificación de Cloudflare Turnstile para el login (src/controllers/personal/login.Controller.js).
// Secret Key SOLO en .env (CLOUDFLARE_TURNSTILE_SECRET_KEY), nunca en el repo.
const ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Nunca loguear ni devolver la Secret Key ni el cuerpo completo de la
// respuesta de Cloudflare al front — solo se expone un booleano.
async function verificarTurnstile(token, remoteip) {
  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.error("CLOUDFLARE_TURNSTILE_SECRET_KEY no está definido en el .env");
    return { success: false };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set("remoteip", remoteip);

  try {
    const respuesta = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await respuesta.json();

    if (!data.success) {
      // Solo en el log del servidor — los error-codes de Cloudflare nunca
      // se mandan al front (ver login.Controller.js).
      console.warn("Turnstile rechazó el token:", data["error-codes"]);
    }

    return { success: !!data.success };
  } catch (error) {
    console.error("Error verificando Turnstile:", error.message);
    return { success: false };
  }
}

module.exports = { verificarTurnstile };
