# Modelo de permisos de PSPP v2.0

> **Este documento corresponde al commit `f999d93dd7a30479d3631fae483197816e8d201a`
> (2026-10-13) + los 3 fixes de Fase 2 / Paso 0 (sección 6) + Fase 2 / Paso 1,
> Bloques A y B (sección 7), descritos en este mismo PR.**
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
   direccion/enlace/externo). La REGLA ya está decidida (sección 5):
   lectura total entre perfiles internos sobre cualquier proyecto,
   `externo` solo ve lo que le invitaron, y las vistas personalizadas
   (Tablero, dashboard, mapas, Mis actividades) se quedan acotadas a
   participación aparte de esa regla general. Lo que sigue en marcha es
   **aplicar** esa regla ya decidida en cada endpoint — Fase 2/Paso 1
   (sección 7) cerró el grueso de la lectura estructural (etapas,
   acciones, riesgos, indicadores, comentarios, bloqueos, evidencias,
   actividad) y el directorio de usuarios; dashboard, mapas y el filtro
   libre `?id_dg=` quedan para el siguiente paso — ver sección 8.

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
| `exigirResolverBloqueo(param)` | SELECT `entidad_tipo,entidad_id,id_creador` de `bloqueos` por `id`; permite si es el creador O `puedeCapturarEn` en la entidad | `PUT /bloqueos/:id/resolver` (ver sección 6.1) |
| `exigirEdicionDeNodoEnCuerpo()` | `req.body.{tipo_nodo,id_nodo}` (nombres propios de `actividad.controller.js`, distintos de `entidad_tipo`/`entidad_id`) | `POST /actividad` (ver sección 6.2) |

Patrón "leer abierto, escribir cerrado": comentar/adjuntar/reportar un
riesgo/bloqueo/entrada de actividad es **participar**, no mirar — por eso
solo las rutas de escritura llevan una de estas factories; `GET` de
comentarios/riesgos/evidencias/bloqueos sigue sin restricción de captura
(la visibilidad dentro de SEDATU es total entre internos, sección 5) —
solo exige poder VER el proyecto, vía `utils/alcance-lectura.js`
(sección 7.1), no poder editarlo.

## 5. El modelo de alcance de lectura (decidido, Fase 2 / Paso 1)

**Regla general**: cualquier perfil interno (`superadmin`, `ejecutivo`,
`direccion`, `enlace`) puede abrir cualquier proyecto y leer su estructura,
avance, documentos, comentarios, riesgos y bitácora — participe o no en
él. Lo que distingue a quien participa de quien no es poder **actuar**
(capturar avance, editar la ficha, resolver un bloqueo...), nunca poder
**ver**. Donde un usuario no participa, ve todo igual, solo sin los
botones de edición. `externo` es la única excepción real: solo ve los
proyectos a los que fue invitado — fuera de ahí no ve nada, ni la
estructura.

```js
async function puedeVerProyecto(usuario, idProyecto, db) {
  if (usuario.rol !== 'externo') return true;
  return tienePeldanoProyecto(usuario, idProyecto, 'lectura', db);
}
```

Esto **no** es un alias de `tienePeldanoProyecto(..., 'lectura')` a
propósito: un `enlace` sin ninguna fila en `proyecto_usuarios`/
`nodo_miembros` igual ve cualquier proyecto, solo no puede editarlo —
`lectura` como peldaño de la escalera (sección 2) solo tiene efecto real
para `externo`.

**Las únicas excepciones a "lectura total entre internos" son las vistas
personalizadas** — pantallas que agregan a propósito "lo tuyo", no "todo":
Tablero, dashboard, mapas de Territorio, Mis actividades. Ahí sí se acota
a participación (hoy vía `backend/src/utils/alcanceProyectos.js`, sección
8), con una excepción propia: `direccion` suma también los proyectos de
su DG líder aunque no participe en ellos directamente. La sección
**Proyectos con el filtro "Todos"**, en cambio, es una vista estructural
(no personalizada) y queda abierta a cualquier perfil interno, igual que
cualquier otra lectura de proyecto.

### 5.1 Dónde se aplica cada cosa

| Qué | Regla | Dónde |
|---|---|---|
| Estructura/avance/documentos/comentarios/riesgos/bitácora de un proyecto | Lectura total entre internos, `externo` solo si invitado | `puedeVerProyecto` + `utils/alcance-lectura.js` (sección 7) |
| Tablero, dashboard, mapas, Mis actividades | Acotado a participación (+ bono de DG para `direccion`) | `utils/alcanceProyectos.js` (sección 8, sin tocar en este PR) |
| Proyectos → filtro "Todos" | Abierto a cualquier interno | ya así, sin cambios |
| Directorio de usuarios (nombre/cargo/correo/DG/teléfono) | Campos por perfil + alcance por perfil | sección 7.3 (Bloque B) |

En la práctica, antes de la Fase 2, `puedeVerProyecto` se invocaba en muy
pocos lugares del código real (`carteras.controller.js::agregarProyectos`,
y la suite de tests) — la Fase 2/Paso 1 (sección 7) es lo que la conectó,
vía middleware, a la lectura estructural de un proyecto.

## 6. Fase 2, Paso 0 — tres bugs de escritura cerrados (no cambios de modelo)

Los tres puntos de esta sección son controles que ya existían en el resto
del sistema para el mismo tipo de operación y que, en estos tres sitios
puntuales, simplemente faltaban — no son decisiones de alcance nuevas.

### 6.1 Bloqueos

`PUT /bloqueos/:id/resolver` no verificaba nada: cualquier usuario
autenticado podía resolver cualquier bloqueo de cualquier proyecto. Ahora
exige ser quien lo creó, o tener `captura`-o-superior en la entidad
bloqueada (`exigirResolverBloqueo`, sección 4) — sin cambios desde este
Paso 0. `GET /bloqueos` y `GET /bloqueos/activo` tampoco filtraban nada
en ese momento — este Paso 0 les puso el mismo criterio de captura, pero
Fase 2/Paso 1 (sección 7.1) lo corrigió a visibilidad total entre
internos, el criterio correcto según el modelo de alcance ya decidido
(sección 5). Se deja esta nota histórica porque documenta por qué existió
ese criterio intermedio, no porque siga vigente.

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

## 7. Fase 2, Paso 1 — alcance de lectura para `externo` + directorio de usuarios

### 7.1 Bloque A — `backend/src/utils/alcance-lectura.js`

Mismo motivo que el Paso 0 (sección 6): esto no cambia el modelo, lo
**aplica** donde faltaba conectarlo. Reusa `puedeVerProyecto` sin tocarla
— como esa función ya devuelve `true` sin condición para cualquier
interno, conectarla a un endpoint que antes no verificaba nada **no
cambia absolutamente nada para ningún usuario interno**; solo cierra el
caso `externo`. La prueba de regresión de `alcance-lectura.test.js`
(un `enlace` sin participar sigue pasando siempre) es la que lo garantiza
hacia adelante.

Igual que `permisos.middleware.js` del lado de escritura, cada endpoint
identifica su proyecto por un camino distinto — así que primero se
resuelve "¿de qué proyecto es esto?" y después se aplica siempre
`puedeVerProyecto`:

| Factory | Cómo resuelve el proyecto | Aplicada en |
|---|---|---|
| `exigirVisibilidadProyecto(param)` | `req.params[param]` es el proyecto | `GET /proyectos/:id/{evidencias,riesgos,indicadores,indicadores/todos,indicadores/resumen,miembros,panorama}` |
| `exigirVisibilidadNodo(tipoNodo, param)` | `obtenerProyectoIdDeNodo` (reusada de `autorizacion.js`) | `GET /etapas/:id`, `/acciones/:id`, evidencias/documentos/aportaciones por nodo |
| `exigirVisibilidadNodoEnParams()` | tipo+id vienen en la propia ruta (`/actividad/:tipo_nodo/:id_nodo`); tipo inválido deja pasar para que el controller dé su 400 | `GET /actividad/:tipo_nodo/:id_nodo` |
| `exigirVisibilidadDeEntidadEnQuery()` | `req.query.{entidad_tipo,entidad_id}`; sin ellos deja pasar (400 del controller) | `GET /comentarios`, `GET /bloqueos`, `GET /bloqueos/activo` |
| `exigirVisibilidadRiesgo(param)` | SELECT `entidad_tipo,entidad_id` de `riesgos` | `GET /riesgos/:id`, `GET /riesgos/:id/evidencias` |
| `exigirVisibilidadIndicador(param)` | `indicadores.id_proyecto`, columna propia | `GET /indicadores/:id`, `GET /indicadores/:id/aportaciones` |
| `exigirVisibilidadEvidencia(param)` | SELECT `id_etapa,id_accion,id_subaccion,id_riesgo` de `evidencias` | `GET /evidencias/:id/descargar` |
| `exigirVisibilidadActividadPorId(param)` | `actividad.id_proyecto`, columna propia (migración 039) | `GET /actividad/:id/descargar` |
| `exigirSoloInternos()` | sin proyecto que resolver — las plantillas de importación son por DG, no por proyecto; replica el mismo criterio interno/externo de `puedeVerProyecto` sin exigirle un `idProyecto` | `GET /plantillas-importacion/:id` |

**Cambio de criterio en `GET /bloqueos` y `GET /bloqueos/activo`**: el
Paso 0 (sección 6.1) les había puesto `captura`-o-superior (un criterio
de escritura) razonando que un bloqueo es "información más cercana a
detalle interno que a un comentario neutro". El modelo de alcance ya
decidido (sección 5) corrige ese criterio: un bloqueo es parte de la
bitácora del nodo, con la misma visibilidad total entre internos que
cualquier otro dato de proyecto — así que estos dos GET pasan a
`exigirVisibilidadDeEntidadEnQuery` (visibilidad), y solo
`PUT /bloqueos/:id/resolver` (una acción, no una lectura) conserva el
criterio de captura-o-creador del Paso 0, sin cambios.

**Deliberadamente fuera de este PR** (mismo criterio: no se nombraron en
el Paso 1/2 de este trabajo, se reportan en vez de tocarse): los listados
de riesgos por nodo (`/etapas|acciones|subacciones|tareas/:id/riesgos`),
`/etapas/:id/indicadores`, y `/proyectos/:id/panorama-rapido` tienen el
mismo hueco de visibilidad hoy — ver sección 8.

### 7.2 Bloque A, Paso 2 — lectura a nivel proyecto

`/proyectos/:id/evidencias|riesgos|indicadores(/todos|/resumen)` quedan
con `exigirVisibilidadProyecto()`. "Aportaciones" y "documentos" no
tienen una ruta literal `/proyectos/:id/...` — se interpretaron como sus
listados por nodo ya existentes (`/etapas|acciones|tareas/:id/aportaciones`,
`/etapas|acciones|tareas/:id/documentos`), que son la única superficie de
lectura real para esas dos categorías.

### 7.3 Bloque B — directorio de usuarios

**Campos por perfil**: nombre, cargo, correo y DG — visibles para todos.
Teléfono — reservado para `superadmin`/`ejecutivo`/`direccion`, **pero
la tabla `usuarios` no tiene ninguna columna de teléfono hoy** (verificado
contra todas las migraciones) — no hay nada que filtrar todavía, y no se
creó ninguna migración para esto: queda pendiente de una decisión aparte
(sección 8). Verificado también que no hay ningún otro campo sensible
(`password_hash`, tokens de activación/recuperación) saliendo por ningún
endpoint que devuelva usuarios — ninguno de los SELECT reales usa `u.*`
ni equivalente, todos listan columnas explícitas.

**Alcance por perfil** (a quiénes devuelve cada endpoint) — esto sí se
implementó, independiente de la pieza de teléfono:
- Cualquier perfil interno recibe el directorio completo, sin cambio —
  lo necesitan para invitar gente.
- `externo` nunca recibe el directorio completo: solo a quienes ya
  comparten con él al menos un proyecto (`proyecto_usuarios`, ambos
  lados `estado='aceptada'`) — `catalogosQueries.obtenerUsuariosCoparticipantes`,
  rama nueva en `catalogos.controller.js::obtenerUsuarios`, sin tocar la
  rama interna.
- `GET /proyectos/:id/miembros` y `GET /proyectos/:id/panorama`
  (participantes del proyecto) se protegen con `exigirVisibilidadProyecto()`
  — para `externo`, solo alcanzable si ya es él mismo miembro de ESE
  proyecto, lo que automáticamente limita a "los demás participantes de
  un proyecto al que fue invitado", exactamente la regla pedida.

## 8. Qué queda pendiente (decisiones de producto y endpoints sin migrar)

- **Dashboard, mapas de Territorio y el filtro libre `?id_dg=`**: mismo
  hueco de visibilidad que cerró el Bloque A, pero deliberadamente fuera
  de este Paso 1 — cambian comportamiento visible de una vista agregada,
  a medir por separado en el siguiente paso.
- **Listados de riesgos por nodo, `/etapas/:id/indicadores`,
  `/proyectos/:id/panorama-rapido`**: mismo hueco de visibilidad
  (`externo` sin filtrar) que el resto de la lectura estructural, no
  nombrados en el Paso 1/2 de este PR — pendientes de una ronda futura.
- **Teléfono en el directorio de usuarios**: columna que no existe hoy en
  `usuarios` — pendiente de decidir si se agrega (y entonces aplicar el
  filtro de campo por perfil ya diseñado en 7.3) antes de construir nada.
- **Alcance de lectura en vistas personalizadas** (Tablero, mapas,
  Indicadores "míos", API pública, Cartera): resuelto de forma parcial y
  ya parcialmente unificado por `backend/src/utils/alcanceProyectos.js`
  (`alcanceProyectosUsuario`/`alcanceProyectosUsuarioONull`/
  `resolverProyectoIdsFiltro`), cuyo propio encabezado documenta que ya
  consolidó dos de tres implementaciones divergentes que existían antes,
  dejó caer a propósito el bono de DG que tenía `direccion` en una de
  ellas (la inconsistencia, no una regla a preservar) — el bono de DG
  para `direccion` SÍ es una regla a preservar según el modelo ya decidido
  (sección 5), así que `alcanceProyectos.js` necesita revisarse contra
  esa regla antes de darlo por cerrado.
- **Administrador de cartera**: patrón ya implementado para proyectos
  (`administracion_proyecto`, sección 2) — el equivalente a nivel cartera
  existe en `carteras.controller.js` pero no es parte de la escalera de
  `funcion-efectiva.js` (es una facultad de cartera, no de proyecto/nodo);
  no documentado en detalle aquí porque este archivo es sobre la escalera
  proyecto/nodo.
- **Exportar / eliminar nodo** (huecos 3.1/3.3 de una ronda anterior): el
  gate mínimo de lectura en exportación, y la confirmación con conteo al
  eliminar un nodo con descendientes, quedaron pendientes de otra ronda —
  no tocados por este documento ni por el Paso 0/1.
