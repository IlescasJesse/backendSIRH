# Instrucciones para GitHub Copilot

## Mensajes de commit

Cuando generes un mensaje de commit (botón ✨ en Control de código fuente de VS Code) o hagas un commit, sigue el criterio de versionado del equipo (`VERSIONADO.md`):

- La etiqueta al inicio del mensaje decide qué número de versión sube:
  - **Sin etiqueta** = ARREGLO: corrección de errores, ajustes visuales, textos, validaciones o cálculos en algo que ya existe.
  - **`[nueva]`** = MENOR: funcionalidad nueva dentro de un módulo existente (un reporte, filtro, botón, campo o tipo de trámite nuevo).
  - **`[modulo]`** = MAYOR: módulo nuevo (sección nueva del menú) o cambio que integra o modifica 3 o más pantallas.
- Formato: `[etiqueta] Verbo + qué cambió + dónde (TICKET)`.
  - En español, empieza con verbo (Corregir, Agregar, Mostrar, Quitar, Permitir, Cambiar, Optimizar).
  - Una sola línea de máximo ~100 caracteres, sin punto final.
  - Ticket al final si existe, por ejemplo `(TEC-SIS-0012)`.
  - Nunca mensajes genéricos como "cambios", "ajustes" o "varios".
- Un tema por commit; si hay cambios de temas distintos, sugiere separarlos.

Ejemplos:
- `Corregir cálculo de días de vacaciones con periodos cruzados`
- `[nueva] Reporte de licencias por área en Excel`
- `[modulo] Portal de documentos digitales: constancias CAD y CNI`

## Reglas del repositorio

- No cambies la versión a mano (`package.json`, `version.ts`, `version.js`) ni edites `CHANGELOG.md`: lo hace el bot de versionado al hacer push.
- No agregues al commit `.env`, `environment.ts`, PDFs generados (`pdfs/`), respaldos ni carpetas `.claude/`.
- Antes de `git push`, corre `git pull --rebase`.
