# Changelog

Versiones generadas automáticamente al hacer push (ver VERSIONADO.md). Las entradas anteriores al versionado automático (hasta la primera versión de abajo) son un resumen.

## v2.3.1 — 2026-10-16 · ARREGLO

- Correción de error al consultar el perfil unificado de los empleados de nombramiento tanto central como foráneo — Isidro Noé Salvador Jiménez (`7283921`)

## v2.3.0 — 2026-10-16 · MENOR

- Agregar función para comparar el excel de nómina con la información de la BD y encontrar las diferencias que existan para generar un excel con dicha información — Isidro Noé Salvador Jiménez (`7f5d1ef`)

## v2.2.0 — 2026-10-15 · MENOR

- Agregar función para la impresión de la ficha técnica del empleado — Isidro Noé Salvador Jiménez (`53c6a6d`)

## v2.1.2 — 2026-10-12 · ARREGLO

- Cambios para generar el reporte perzonalizado de acuerdo a nuevos filtros y mostrar ciertos campos en el excel generado — Isidro Noé Salvador Jiménez (`8ae9372`)

## v2.1.1 — 2026-10-12

- Restaurar `/api/personal/getEmployees` para la sincronización de SIAST, protegida con el permiso `SVC-SIAST` (también en `/getinternalInformation`) — Jesse Ilescas (`aa738cd`)

## v2.1.0 — 2026-10-12

- Portal de Documentos Digitales: constancias CAD/CNI, firmantes, destinatarios, delegaciones sindicales, perfil de firmante y verificación pública por folio — Jesse Ilescas
- Login con Cloudflare Turnstile opcional (`TURNSTILE_ACTIVO`) y modo sin internet; `JWT_SECRET` obligatorio; CORS acepta `FRONTEND_URL` — Jesse Ilescas
- Respaldos: rutas configurables de mysqldump/mongodump y no se borran respaldos si uno falla; `GET /api/version` — Jesse Ilescas

## v2.0.0 — 2026-10-08 (en producción hasta el 2026-10-12)

Resumen desde v1.0.0 (detalle completo en `git log v1.0.0..v2.0.0`):

- Migración al servidor dev-finanzas (julio 2026) e implementación de seguridad por permisos en todas las rutas (septiembre 2026) — Isidro Noé Salvador Jiménez, Jesse Ilescas
- Usuarios de incidencias pueden ver permisos extraordinarios (TEC-SIS-0011); número exterior con `#`; baja inmediata cuando la fecha ya pasó — Isidro Noé Salvador Jiménez
- Reporte de plantilla por área retroactivo desde respaldos diarios — Jesse Ilescas
- Reportes de personal con vacaciones, vacantes con propuestas pendientes y permisos extraordinarios — Isidro Noé Salvador Jiménez
- Cálculo de vacaciones e ISR, cuota sindical, tarjetas y gafetes de comisionados, historial de plazas — Isidro Noé Salvador Jiménez

## v1.0.0 — 2024-12-27

- Primer back de SIRH en servidor: consulta, altas, bajas y plazas — Jesse Ilescas, Isidro Noé Salvador Jiménez
