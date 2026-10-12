# Criterio de commits y versionado — SIRH y SIAST

Aplica a los 3 repositorios:

| Sistema | Repositorio | Rama de producción | Versión actual |
|---|---|---|---|
| SIRH back | github.com/IlescasJesse/backendSIRH | `main` | v2.1.1 |
| SIRH front | gitlab.com/sirhsystem1/sirh-ng | `dev` | v2.1.0 |
| SIAST | github.com/IlescasJesse/SIAST | `main` | v1.0.0 |

La versión se sube **sola** al hacer `git push` a la rama de producción, según la etiqueta del mensaje del commit. Nadie cambia la versión a mano.

---

## 1. Qué número sube: `MAYOR.MENOR.ARREGLO`

| Tipo | Etiqueta en el commit | Ejemplo de versión | Cuándo usarla |
|---|---|---|---|
| **ARREGLO** | *(ninguna — es el valor por defecto)* | 2.1.1 → 2.1.**2** | Corrección de un error, ajuste visual, texto, validación, cálculo mal hecho, cambio pequeño en algo que ya existe |
| **MENOR** | `[nueva]` | 2.1.x → 2.**2**.0 | Funcionalidad nueva **dentro de un módulo que ya existe**: un reporte nuevo, un botón o filtro nuevo, un campo nuevo, un nuevo tipo de permiso o justificante |
| **MAYOR** | `[modulo]` | 2.x.x → **3**.0.0 | **Módulo nuevo** (menú/sección nueva del sistema) o un cambio que **integra o modifica varias pantallas a la vez** (por ejemplo, un flujo nuevo que toca alta + perfil + reportes, o un cambio de seguridad que afecta todo el sistema) |

Si en un mismo push hay varios commits, gana el más alto: un `[modulo]` + tres arreglos = versión MAYOR.

### ¿Dudas entre dos?

- ¿Corrige algo que ya debía funcionar? → **ARREGLO** (sin etiqueta).
- ¿El usuario puede hacer algo que antes no podía, en una pantalla que ya existe? → **MENOR** `[nueva]`.
- ¿Aparece una sección nueva en el menú, o el cambio toca 3 o más pantallas distintas? → **MAYOR** `[modulo]`.

---

## 2. Cómo escribir el mensaje del commit

El mensaje es lo que queda en el `CHANGELOG.md` y lo que leen los demás. Formato:

```
[etiqueta] Verbo + qué cambió + dónde (TICKET)
```

- **Empieza con verbo**: Corregir, Agregar, Mostrar, Quitar, Permitir, Cambiar, Optimizar.
- **Di qué y dónde**, no "cambios", "ajustes" o "varios".
- **Ticket al final** si lo hay: `(TEC-SIS-0012)`.
- **Un tema por commit**. Si arreglaste dos cosas distintas, haz dos commits.
- En español, sin punto final, máximo ~100 caracteres en la primera línea.

### Ejemplos

| ✅ Bien | ❌ Mal |
|---|---|
| `Corregir cálculo de días de vacaciones con periodos cruzados` | `cambios` |
| `Mostrar fecha de ingreso en el perfil de incidencias (TEC-SIS-0010)` | `ajustes perfil` |
| `[nueva] Reporte de licencias por área en Excel` | `reporte nuevo` |
| `[nueva] Filtro por quincena en permisos extraordinarios` | `Cambios para que se pueda filtrar` |
| `[modulo] Portal de documentos digitales: constancias CAD y CNI` | `[modulo] arreglo de un texto` |
| `[modulo] Unificar alta, perfil y bajas con el nuevo flujo de plazas` | `varios cambios` |

---

## 3. Flujo de trabajo diario

```bash
# 1. Antes de empezar y antes de cada push (OBLIGATORIO)
git pull --rebase

# 2. Revisar qué cambió
git status

# 3. Agregar archivos (nunca .env, PDFs generados, backups ni .claude/)
git add <archivos>

# 4. Commit con el criterio de arriba
git commit -m "[nueva] Reporte de licencias por área en Excel"

# 5. Subir
git push
```

Si el push sale **rejected**: `git pull --rebase` y otra vez `git push`. Pasa porque el bot de versionado agregó su commit después del último push.

Al hacer push a la rama de producción, en menos de un minuto:

1. Se calcula la versión nueva según las etiquetas.
2. Se agrega la entrada al `CHANGELOG.md` (fecha, versión, commits y autor).
3. Se actualiza la versión del login y de los `package.json`.
4. Se crea el commit `chore(release): vX.Y.Z` y el tag `vX.Y.Z` (autor: bot).

---

## 4. Deploy

Igual que siempre: **monitor → check → pull** del sistema correspondiente. Después del deploy, el login muestra la versión nueva (abajo, en gris).

---

## 5. Reglas

- **No editar la versión a mano** (`package.json`, `version.ts`, `version.js`) ni el `CHANGELOG.md`: lo hace el bot.
- **No borrar ni mover tags** `vX.Y.Z`.
- **No subir** `.env`, `environment.ts`, PDFs generados (`pdfs/`), respaldos ni carpetas `.claude/`.
- **Varios push el mismo día = varias versiones.** Es normal. Si se quieren menos versiones, juntar cambios y hacer un solo push.
- Los commits `chore(release): ...` son del bot; no se modifican ni se revierten a mano.
