# SIRH — Backend

API de SIRH (Node/Express + MongoDB `SIRH2026` + MySQL `sirh`).

- Rama de producción: `main` (GitHub `IlescasJesse/backendSIRH`).
- Deploy: monitor (`Documents/ssh_vps`) → `deploy.sh pull sirh-backend` en dev-finanzas (`/var/www/sirh-backend`, pm2 `backendSIRH`). Hace `git reset --hard`; `.env` y `pdfs/` viven solo en el servidor.
- No versionar: `.env`, `pdfs/` (documentos generados), respaldos, `.claude/`.
- SIAST consume `/api/personal/getEmployees` y `/getinternalInformation` con la cuenta `SIAST-SERVICE` (permiso `SVC-SIAST`).

## Commits y versionado

Sigue `VERSIONADO.md` al crear commits:

- Sin etiqueta = ARREGLO (correcciones y ajustes pequeños).
- `[nueva]` = MENOR (funcionalidad nueva dentro de un módulo existente).
- `[modulo]` = MAYOR (módulo nuevo o cambio que integra/modifica 3+ pantallas).
- Mensaje en español: `[etiqueta] Verbo + qué + dónde (TICKET)`, un tema por commit.
- La versión la sube la CI al hacer push (`scripts/release.mjs`): nunca cambies la versión a mano ni edites `CHANGELOG.md`. Corre `git pull --rebase` antes de `git push`.
