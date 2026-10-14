# Modelo de permisos de PSPP v2.0

> **Este documento corresponde al commit `5cb65e6626e0684e3c2ef7063eba1d2458be415e`
> (2026-10-13) + los 3 fixes de Fase 2 / Paso 0 descritos en la sección 6.**
> Regenerado por completo (no es un parche del documento anterior), porque
> la versión previa describía el modelo PRE-Fase-1: el CHECK de 2 valores
> de `proyecto_usuarios.rol`, el CHECK de 3 valores con `'invitado'` de
> `nodo_miembros.rol`, y funciones de autorización escritas como cadenas
> de OR hechas a mano — arquitectura que la migración 079 y la reescritura
> de `funcion-efectiva.js`/`autorizacion.js` ya reemplazaron por completo,
> aunque este archivo seguía sin decirlo. Si quien lea esto más adelante
> encuentra código que ya no coincide con lo descrito aquí, el código
> manda — y toca regenerar este documento otra vez, no parchearlo.

## 0. Resumen ejecutivo

PSPP tiene **dos preguntas de permisos independientes**, y este documento
es sobre la primera:

1. **¿Qué puede HACER un usuario sobre un proyecto/nodo que ya ve?**
   (editar, capturar avance, invitar, eliminar) — resuelto por una sola
   función, `funcionEfectiva` (`backend/src/utils/funcion-efectiva.js`),
   comparada contra un mínimo por `backend/src/utils/autorizacion.js`.
   **Esto es lo que cubre este documento.**
2. **¿Qué proyectos/nodos puede VER un usuario entre TODOS los que
   existen?** ("alcance de lectura por perfil" — superadmin/ejecutivo/
   direccion/enlace/externo). Hoy la visibilidad dentro de SEDATU es
   deliberadamente total (`puedeVerProyecto`, sección 5) salvo para
   `externo`; la regla final de "qué agregados/listados cruzados debe
   ver cada perfil" (Tablero, Cartera, API pública, etc.) es una decisión
   de producto todavía pendiente — ver sección 7. **No está resuelto por
   este documento ni por el código descrito aquí.**

La arquitectura de la pregunta 1 es una **escalera única de 4 peldaños**
(`lectura < captura < responsable < administracion_proyecto`), resuelta
en un solo lugar por **7 vías** que pueden otorgarla (superadmin, creador,
invitación directa, ser responsable de un nodo, herencia del padre, rol a
nivel proyecto, bono de DG para ejecutivo). Cada función con nombre en
`autorizacion.js` es, sin excepción, una comparación de esa escalera
contra un mínimo — no queda ninguna cadena de `if/OR` suelta decidiendo
permisos por su cuenta.

## 1. Los roles de `usuarios.rol`

Migración 034. Cinco valores, CHECK `('superadmin', 'ejecutivo',
'direccion', 'enlace', 'externo')`. Es el único rol **global** del
usuario — no dice nada por sí solo sobre un proyecto concreto, salvo dos
excepciones explícitas en el código:

- `superadmin` → `administracion_proyecto` sobre CUALQUIER proyecto, sin
  condición (`funcion-efectiva.js:86`).
- `ejecutivo` → `responsable` (nunca `administracion_proyecto`) sobre
  CUALQUIER proyecto cuya `id_dg_lider` coincida con su propio `id_dg`
  (el "bono de DG", `funcion-efectiva.js:111-118`) — null-safe en ambos
  lados, un `id_dg` nulo nunca hace match.

`direccion` y `enlace` no tienen ningún bono automático — su función
depende enteramente de estar invitados (`proyecto_usuarios`/
`nodo_miembros`) o de ser `id_creador`/`id_responsable` directo. `externo`
tampoco tiene bono, y además es el único rol al que `puedeVerProyecto`
(sección 5) le exige un peldaño explícito para poder ver un proyecto.

`requiereRol([...])` (`backend/src/middleware/roles.middleware.js`) es un
segundo mecanismo, independiente de la escalera: rutas de administración
pura (p. ej. `PUT /catalogo-indicadores/:id`, `PATCH /:id/activo`) se
protegen con `requiereRol(['superadmin'])` directo sobre `usuarios.rol`,
sin pasar por `funcionEfectiva` — no hay elemento (proyecto/nodo) sobre el
que calcular una escalera, es una facultad de plataforma, no de un
proyecto en particular.

## 2. La escalera: `backend/src/utils/funcion-efectiva.js`

```
lectura      -> ver el elemento y sus descendientes
captura      -> + avance, riesgos, documentos, indicadores, territorio, comentar, bloqueos, actividad
responsable  -> + editar ficha, crear/eliminar hijos, invitar, resolver bloqueos de otros
administracion_proyecto -> todo lo anterior en TODO el proyecto, + ficha del proyecto y eliminarlo
                           (NUNCA existe a nivel nodo — ver topeNodo())
```

Cada peldaño incluye las facultades del anterior (`PELDANOS` + `indice()` +
`alcanza()`, comparación por índice, nunca por nombre exacto).

### 2.1 Las 7 vías (todas se evalúan; gana la más alta, nunca se restan entre sí)

| Vía | Dónde se resuelve | Qué otorga |
|---|---|---|
| `superadmin` | `usuarios.rol === 'superadmin'` | `administracion_proyecto`, sin condición |
| `creador` | `proyectos.id_creador === usuario.id` | `administracion_proyecto` del proyecto que creó |
| `invitacion` | `nodo_miembros`/`proyecto_usuarios`, fila `estado='aceptada'` del elemento exacto | el `rol` aceptado de esa fila |
| `responsable_de_nodo` | `etapas\|acciones\|tareas.id_responsable === usuario.id` | `responsable` directo sobre ese nodo |
| `herencia` | resultado de un ascendiente (etapa > acción > subacción > tarea), re-etiquetado | lo que haya resuelto el ascendiente |
| `proyecto` | `proyecto_usuarios`, fila aceptada a nivel de TODO el proyecto | el `rol` aceptado, aplicado al proyecto completo y a todos sus nodos |
| `ejecutivo_dg` | `usuario.rol==='ejecutivo'` + mismo `id_dg` que `proyectos.id_dg_lider` | `responsable` (nunca más alto) |

`masAlto(a, b)` resuelve el empate: en igualdad de peldaño gana el primer
argumento — por eso los llamadores siempre ordenan la vía más específica
primero (p. ej. una invitación directa antes que el bono de DG).

`topeNodo()` baja `administracion_proyecto` a `responsable` al aplicar una
vía de alcance-proyecto sobre un nodo puntual — ese peldaño estructuralmente
no existe fuera del proyecto completo.

`comoHeredado()` re-etiqueta cualquier vía que venga de un ascendiente
como `'herencia'`, para que quien pregunta sepa "lo heredé", sin que le
importe si el ascendiente lo tenía por invitación directa o por ser su
responsable de nodo.

### 2.2 Puntos de entrada

- `funcionEfectivaEnProyecto(usuario, idProyecto, db)`.
- `funcionEfectivaEnNodo(usuario, tipoNodo, idNodo, db)` — recursivo hacia
  el padre (acción → su etapa o su acción padre; tarea → su acción) hasta
  llegar al proyecto.
- `funcionEfectiva(usuario, { tipo, id }, db)` — despachador genérico.
- `funcionEfectivaPorLotes(usuario, idProyecto, db)` — la función efectiva
  de un usuario sobre TODOS los nodos de un proyecto en un puñado de
  consultas fijas (no una por nodo), con recursión memoizada en memoria;
  la usa la Fase 3 (Seguimiento) para pintar el árbol completo de una vez.

## 3. `backend/src/utils/autorizacion.js` — las funciones con nombre

Cada una compara la escalera contra un mínimo. Tabla completa:

| Función | Mínimo | A qué protege |
|---|---|---|
| `puedeEditarContenidoProyecto({usuario, idProyecto})` | `captura` | avance/riesgos/documentos/indicadores/territorio/comentarios a nivel proyecto |
| `puedeEditarNodo({usuario, tipoNodo, idNodo})` | `captura` | lo mismo, a nivel etapa/acción/tarea |
| `puedeGestionarParticipantes({usuario, idProyecto})` | `responsable` | invitar/cambiar rol/retirar miembros del proyecto completo |
| `puedeGestionarParticipantesNodo({usuario, tipoNodo, idNodo})` | `responsable` | lo mismo, a nivel de un nodo puntual |
| `puedeGestionarNodo({usuario, tipoNodo, idNodo})` | `responsable` **EN EL PADRE** del nodo (`resolverAccesoPadreDeNodo`), no en el nodo mismo | eliminar el nodo, o crear/eliminar un hijo en él |
| `puedeEditarProyecto` / `puedeGestionarProyecto` | `administracion_proyecto` | ficha del proyecto, eliminarlo |
| `minimoParaPatchNodo(body)` | `responsable` si el body trae algún campo de `CAMPOS_FICHA_NODO`¹, si no `captura` | PATCH combinado de avance+ficha en `/etapas\|acciones\|tareas/:id` |
| `puedeVerProyecto(usuario, idProyecto)` | ver sección 5 | — |
| `tienePeldanoProyecto` / `tienePeldanoNodo(usuario, tipo, id, minimo)` | el que se pida | primitivas genéricas, usadas directo por middleware cuando no hay una función con nombre que calce |

¹ `CAMPOS_FICHA_NODO = ['nombre', 'descripcion', 'tipo', 'id_responsable',
'prioridad', 'fecha_inicio', 'fecha_limite', 'instrumento',
'escala_territorial', 'instancia_responsable', 'enlace_responsable',
'semaforo', 'observaciones']`.

`resolverAccesoProyecto`/`resolverAccesoNodo`/`resolverAccesoPadreDeNodo`
devuelven además `{ via, peldano }`, no solo `permitido` — lo usa la
bitácora para anotar, por ejemplo, que una acción se hizo "por el perfil
de ejecutivo de DGOTU" en vez de por una invitación real.

## 4. `backend/src/middleware/permisos.middleware.js` — el gate en la capa de rutas

Se resuelve en rutas, no dentro de cada controller: son ~20 endpoints
repartidos en varios controllers, y meter un `if` en cada uno multiplica
las oportunidades de olvidarlo. El núcleo es una sola función:

```js
puedeCapturarEn(usuario, entidadTipo, entidadId)
// entidadTipo en minúsculas vía TIPO_A_NODO = { etapa, accion, subaccion: 'accion', tarea }
// 'proyecto' -> puedeEditarContenidoProyecto; cualquier otro -> puedeEditarNodo
```

A partir de `puedeCapturarEn` se construyen las factories — cada una
resuelve "¿a qué entidad pertenece esto?" por su propio camino, y después
aplica el mismo criterio:

| Factory | Cómo resuelve la entidad | Usada en |
|---|---|---|
| `exigirEdicionNodo(tipoNodo, param)` | `req.params[param]` es directamente el nodo | PUT/PATCH de etapas/acciones/tareas |
| `exigirEdicionProyecto(param)` | `req.params[param]` es el proyecto | crear etapa, importar estructura |
| `exigirResponsableNodo` / `exigirResponsableProyecto` | igual, mínimo `responsable` | crear/eliminar hijos |
| `exigirEdicionDeEntidadEnCuerpo()` | `req.body.{entidad_tipo,entidad_id}` | `POST /comentarios`, `POST /riesgos` |
| `exigirEdicionResuelta(resolver)` | fábrica genérica: `resolver(req)` devuelve `{tipo,id}` o `null` | base de las siguientes |
| `exigirEdicionComentario` / `exigirEdicionRiesgo` | SELECT `entidad_tipo,entidad_id` de la fila por su `id` | responder comentario, editar riesgo |
| `exigirEdicionEvidencia` | SELECT de `evidencias` (etapa/acción/subacción/riesgo) | editar evidencia |
| `exigirEdicionIndicador` | SELECT `id_proyecto` de `indicadores` | editar indicador (siempre a nivel proyecto) |
| `exigirEdicionAportacion` / `exigirEdicionAportacionNueva` | SELECT de `indicador_aportaciones`/body | aportaciones a un indicador |
| `exigirEdicionDeEntidadEnQuery()` | `req.query.{entidad_tipo,entidad_id}` | `GET /bloqueos`, `GET /bloqueos/activo` (ver sección 6.1) |
| `exigirResolverBloqueo(param)` | SELECT `entidad_tipo,entidad_id,id_creador` de `bloqueos` por `id`; permite si es el creador O `puedeCapturarEn` en la entidad | `PUT /bloqueos/:id/resolver` (ver sección 6.1) |
| `exigirEdicionDeNodoEnCuerpo()` | `req.body.{tipo_nodo,id_nodo}` (nombres propios de `actividad.controller.js`, distintos de `entidad_tipo`/`entidad_id`) | `POST /actividad` (ver sección 6.2) |

Patrón "leer abierto, escribir cerrado": comentar/adjuntar/reportar un
riesgo/bloqueo/entrada de actividad es **participar**, no mirar — por eso
solo las rutas de escritura llevan una de estas factories; `GET` de
comentarios/riesgos/evidencias sigue sin restricción (la visibilidad
dentro de SEDATU es total, sección 5). La única excepción deliberada son
`GET /bloqueos` y `GET /bloqueos/activo` (sección 6.1): un bloqueo expone
motivo y quién lo creó, información más cercana a "detalle interno del
nodo" que a un comentario neutro.

## 5. ¿Quién puede VER un proyecto?

```js
async function puedeVerProyecto(usuario, idProyecto, db) {
  if (usuario.rol !== 'externo') return true;
  return tienePeldanoProyecto(usuario, idProyecto, 'lectura', db);
}
```

Dentro de SEDATU la visibilidad ya es total — cualquier `superadmin`,
`ejecutivo`, `direccion` o `enlace` puede ver cualquier proyecto, tenga o
no una fila de membresía, sin importar su peldaño en la escalera (`lectura`
como peldaño solo tiene efecto real para `externo`). Esto **no** es un
alias de `tienePeldanoProyecto(..., 'lectura')` a propósito: un `enlace`
sin ninguna fila en `proyecto_usuarios`/`nodo_miembros` igual ve cualquier
proyecto, solo no puede editarlo.

En la práctica esta función se invoca en muy pocos lugares del código real
(`carteras.controller.js::agregarProyectos`, y la suite de tests) — la
mayoría de las pantallas de agregado (Tablero, mapas, Indicadores "míos")
no pasan por aquí, sino por `backend/src/utils/alcanceProyectos.js`
(sección 7).

## 6. Fase 2, Paso 0 — tres bugs de escritura cerrados (no cambios de modelo)

Los tres puntos de esta sección son controles que ya existían en el resto
del sistema para el mismo tipo de operación y que, en estos tres sitios
puntuales, simplemente faltaban — no son decisiones de alcance nuevas.

### 6.1 Bloqueos

`PUT /bloqueos/:id/resolver` no verificaba nada: cualquier usuario
autenticado podía resolver cualquier bloqueo de cualquier proyecto. Ahora
exige ser quien lo creó, o tener `captura`-o-superior en la entidad
bloqueada (`exigirResolverBloqueo`, sección 4). `GET /bloqueos` y
`GET /bloqueos/activo` tampoco filtraban — ahora exigen el mismo
`captura`-o-superior vía `exigirEdicionDeEntidadEnQuery` (un bloqueo
expone motivo y creador, no es información neutra como un comentario).

### 6.2 Actividad

`POST /actividad` (el stream unificado de comentario/archivo/riesgo por
nodo) no tenía ningún middleware — se le aplicó el mismo criterio
"leer abierto, escribir cerrado" que ya declara `comentarios.routes.js`,
vía `exigirEdicionDeNodoEnCuerpo` (sección 4). Esta factory es distinta de
`exigirEdicionDeEntidadEnCuerpo` porque `actividad.controller.js` nombra
sus campos `tipo_nodo`/`id_nodo`, no `entidad_tipo`/`entidad_id` — ambas
factories comparten el mismo núcleo, `puedeCapturarEn`.

### 6.3 Plantillas de importación

`PUT`/`DELETE /plantillas-importacion/:id` solo bloqueaban tocar la
plantilla predeterminada del sistema (`es_predeterminada`) — cualquier
usuario autenticado podía editar o borrar la plantilla de cualquier otra
Dirección General. Ahora exige ser de la **misma DG** que la plantilla
(`plantillas_importacion.id_dg`), o `superadmin`
(`plantillas.controller.js::actualizar/eliminar`, chequeo inline — no se
construyó una factory nueva de `permisos.middleware.js` porque "misma DG
que esta fila" no es parte del grafo proyecto/nodo que las demás
factories recorren). Lectura (`GET /:id`, `/listar`, `/descargar`) no
cambió — `listar()` ya scoping correctamente por `id_dg` desde antes.

### 6.4 Deliberadamente fuera de esta ronda

`GET /proyectos/:id/imagen` sigue registrada antes de `verificarToken` —
investigado y confirmado que es deliberado: el backend reescribe
`imagen_url` literalmente a esa ruta
(`proyectos.controller.js::listar/obtener`) y el frontend la consume como
`<img src={proyecto.imagen_url}>` (`TarjetaProyecto.jsx`, `Inicio.jsx`,
`ModalEditarProyecto.jsx`), sin `?token=` en ningún punto — un `<img>` no
puede mandar el header `Authorization`. Moverla sin más rompería las
portadas de proyecto en toda la app; queda pendiente de una decisión de
producto (threadear `?token=` en los consumidores, o algo distinto) antes
de tocarla.

## 7. Qué queda pendiente (decisiones de producto, no bugs)

- **Alcance de lectura por perfil** (la "pregunta 2" de la sección 0):
  qué ve cada perfil en los agregados cruzados de proyectos — Tablero,
  mapas de Territorio, Indicadores "míos", API pública, Cartera. Hoy
  resuelto de forma parcial y ya parcialmente unificada por
  `backend/src/utils/alcanceProyectos.js` (`alcanceProyectosUsuario`/
  `alcanceProyectosUsuarioONull`/`resolverProyectoIdsFiltro`), cuyo propio
  encabezado documenta que ya consolidó dos de tres implementaciones
  divergentes que existían antes, dejó caer a propósito el bono de DG que
  tenía `direccion` en una de ellas (la inconsistencia, no una regla a
  preservar), y defiere explícitamente la decisión final de reglas por
  perfil. Hay además endpoints de agregado sin ningún filtro de alcance
  hoy, documentados aparte (no en este archivo) a la espera de esa
  decisión de producto.
- **Administrador de cartera**: patrón ya implementado para proyectos
  (`administracion_proyecto`, sección 2) — el equivalente a nivel cartera
  existe en `carteras.controller.js` pero no es parte de la escalera de
  `funcion-efectiva.js` (es una facultad de cartera, no de proyecto/nodo);
  no documentado en detalle aquí porque este archivo es sobre la escalera
  proyecto/nodo.
- **Exportar / eliminar nodo** (huecos 3.1/3.3 de una ronda anterior): el
  gate mínimo de lectura en exportación, y la confirmación con conteo al
  eliminar un nodo con descendientes, quedaron pendientes de otra ronda —
  no tocados por este documento ni por el Paso 0.
