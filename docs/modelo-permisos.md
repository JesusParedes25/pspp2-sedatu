# Modelo de permisos de PSPP v2.0

> **Este documento corresponde al commit `c7807cd0c3079aeb43fc5a41b75da6ae28bf0b06`
> (2026-10-13) + Fase 2 / Paso 0 (sección 6) + Fase 2 / Paso 1 (sección 7) +
> Fase 2 / Paso 2 (sección 9) + Fase 3, estado de consulta en la interfaz
> (sección 11), descritos en este mismo PR.**
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
   (Tablero, dashboard, mapas, Mis indicadores, Documentos) se quedan
   acotadas a participación + el bono de DG de `direccion` (sección 9.1)
   — excepto Mis actividades/Agenda, que son trabajo propio y nunca
   llevan ese bono. Fase 2/Paso 1 (sección 7) cerró el grueso de la
   lectura estructural y el directorio de usuarios; Fase 2/Paso 2
   (sección 9) cerró el bono de DG y conectó dashboard/mapas agregados
   al alcance real, retirando el `?id_dg=` libre; Fase 3 (sección 11)
   mostró ese cálculo en la interfaz (candado, banda de consulta) sin
   cambiar el modelo. Lo que queda pendiente está en la sección 12.

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
Tablero, dashboard, mapas de Territorio, Mis indicadores, Documentos. Ahí
sí se acota a participación (`backend/src/utils/alcanceProyectos.js`,
sección 9.1), con una excepción propia: `direccion` suma también los
proyectos de su DG líder aunque no participe en ellos directamente (el
bono de DG). **Mis actividades y Agenda son la excepción a la excepción**:
son trabajo propio de la persona (asignaciones directas), nunca llevan el
bono — un director no hereda ahí los pendientes de los enlaces de su DG
(sección 9.1). La sección **Proyectos con el filtro "Todos"**, en cambio,
es una vista estructural (no personalizada) y queda abierta a cualquier
perfil interno, igual que cualquier otra lectura de proyecto.

### 5.1 Dónde se aplica cada cosa

| Qué | Regla | Dónde |
|---|---|---|
| Estructura/avance/documentos/comentarios/riesgos/bitácora de un proyecto | Lectura total entre internos, `externo` solo si invitado | `puedeVerProyecto` + `utils/alcance-lectura.js` (sección 7) |
| Tablero, dashboard, mapas, Mis indicadores, Documentos | Acotado a participación + bono de DG para `direccion` | `utils/alcanceProyectos.js` (sección 9.1) |
| Mis actividades, Agenda | Acotado a asignación directa — SIN el bono de DG | `acciones.queries.js::obtenerAccionesAgenda` (sección 9.1) |
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

## 9. Fase 2, Paso 2 — bono de DG + Grupo 2 + Grupo 3

Este paso conecta las vistas personalizadas (Tablero, dashboard, mapas
agregados, Mis indicadores, Documentos) al alcance real del usuario, y
cierra la definición del bono de DG que `alcanceProyectos.js` dejaba sin
resolver desde Fase 1 (sección 8, punto ya retirado de la lista de
pendientes). "Personalizada" distingue estas vistas de las estructurales
del Paso 1 (sección 7): ahí el usuario pide UN proyecto/nodo concreto;
aquí pide un agregado de "lo que me toca" entre TODOS los proyectos.

### 9.1 El bono de DG — definición exacta

Un usuario `direccion` recibe la **unión de exactamente dos conjuntos**,
calculada por `alcanceProyectosUsuario`/`alcanceProyectosUsuarioONull`
(`backend/src/utils/alcanceProyectos.js`):

1. Los proyectos donde participa — igual que cualquier otro perfil
   (`miembrosQueries.obtenerProyectosUsuario`).
2. Los proyectos cuya dirección general dueña es la suya
   (`proyectos.id_dg_lider = usuario.id_dg`), participe o no.

**Nada más.** Deliberadamente **NO** incluye proyectos de otra DG por el
solo hecho de que un enlace de su propia dirección participe ahí —
eso se consideró y se descartó por costo/complejidad; si se pide en el
futuro, es otro PR. La resolución compara `proyectos.id_dg_lider` contra
`usuario.id_dg` directamente — **nunca** cruzando `proyecto_usuarios` ni
`nodo_miembros` para rastrear membresías de terceros (la prueba que fija
esto, `alcanceProyectos.test.js`, verifica que el SQL del lado de DG no
referencia ninguna de esas dos tablas). `direccion` sin `id_dg` no recibe
bono (cae a solo participación, sin error). `superadmin`/`ejecutivo` ven
todo, sin tocar membresía. `enlace`/`externo` nunca llevan bono.

**Mis actividades y Agenda son la excepción a la excepción** (ya anotado
en la sección 5): `acciones.controller.js::agenda` resuelve siempre por
el id propio del usuario, nunca por `id_dg` — un director no hereda ahí
los pendientes de los enlaces de su DG.

### 9.2 Grupo 1 — ya conectados, ganan el bono sin cambio de código propio

Estos endpoints ya llamaban a `alcanceProyectosUsuario`/`ONull` antes de
este paso — al implementar el bono dentro de esa única función
compartida, lo ganan automáticamente: `GET /inicio`,
`/inicio/filtros/proyectos`, `/inicio/filtros/carteras`,
`GET /inicio/mapa`, `/inicio/mapa/zm`,
`GET /geo/territorio/estado/:cve_ent/detalle`, `/municipios-actividad`,
`/geo/territorio/zm/:gid/detalle`, `GET /indicadores/mios` ("Mis
indicadores"), `GET /evidencias` (listado, "Documentos"). Decisión de
producto confirmada: un director ve en estos lugares los indicadores y
documentos de los proyectos de su DG, igual que el resto del Grupo 1.

### 9.3 Grupo 2 — conectados por primera vez a `alcanceProyectosUsuarioONull`

`GET /dashboard` (+ sus 4 queries agregadas, incluyendo
`obtenerAvancePorDG`, que antes de este paso no recibía ningún filtro),
`GET /mapa/resumen-estados`, `GET /mapa/estado/:id`. Antes de este paso
no filtraban nada — cualquier interno veía el agregado completo sin
acotar. **Confirmado por rastreo exhaustivo de imports en
`frontend/src`: ninguno de los tres tiene consumidor real hoy**
(`frontend/src/api/dashboard.js` y `frontend/src/api/mapa.js` no se
importan desde ninguna pantalla — la pantalla real de Territorio usa
`/inicio/mapa`, `/geo/territorio/estado/:cve_ent/detalle` y
`/municipios-actividad`, ya Grupo 1). Se protegen igual que si tuvieran
consumidor (defensa en profundidad), y quedan documentados aquí como
**endpoints sin uso conocido en el frontend** — la reducción de alcance
para `enlace`/`direccion` existe a nivel API pero hoy es invisible en
pantalla.

### 9.4 Grupo 3 — reclasificados al tratamiento del Paso 1, no al del Grupo 1/2

`GET /proyectos/:id/mapa-territorial`, `/proyectos/:id/cobertura`,
`/proyectos/:id/cobertura-detallada`, `GET /cobertura/:tipo/:id`. Pese a
que el pedido original los agrupaba junto al resto de este paso, son
estructuralmente un solo proyecto/nodo, no un agregado "todos los que
puedo ver" — mismo patrón que `etapas/:id` en el Paso 1. Reclasificados
(con aprobación explícita) a `exigirVisibilidadProyecto()` /
`exigirVisibilidadEntidadEnParams()` (nueva factory, mismo archivo
`alcance-lectura.js`) — **cero cambio visible para cualquier interno**,
igual que el resto del Paso 1.

### 9.5 `?id_dg=` — intersección estricta, no una ampliación libre

En los 3 endpoints del Grupo 2 y los 2 de Geografía donde el parámetro
de conveniencia `?id_dg=` ya existía libre, pasa a combinarse con el
alcance real mediante `AND` en la misma consulta SQL, nunca `OR`: una DG
que no está en el alcance del usuario no amplía nada, simplemente no
aporta filas — nunca un error, nunca el alcance completo sin filtrar.
`alcanceProyectoIds === null` (superadmin/ejecutivo) sigue dejando que
`id_dg` filtre solo, como ya hacía.

## 11. Fase 3 — estado de consulta en la interfaz

Presentación, no lógica de permisos: el backend ya calcula desde la Fase
1 (sección 2) quién puede hacer qué — este paso solo lo muestra. La
regla de arranque es que el candado y la banda explicativa de abajo
salen **siempre** de `permisos.puedeEditarNodo(tipo, id)` /
`permisos.esSoloLectura` — nunca de un cálculo propio de un componente
de presentación.

### 11.1 Fuente única: `nodosEditablesUsuario` delegó en `funcionEfectivaPorLotes`

Antes de este paso, `GET /proyectos/:id/mis-permisos`
(`proyectos.controller.js::misPermisos`) ya devolvía `nodos_editables`
por nodo (`{etapa:[],accion:[],tarea:[]}`, expandido hacia abajo), pero
`permisos.queries.js::nodosEditablesUsuario` lo calculaba con su propio
SQL (asignación directa + un `while` de herencia) — un segundo cálculo
de lo mismo que ya resolvía `funcionEfectivaPorLotes`
(`utils/funcion-efectiva.js`, construida en Fase 1 explícitamente para
esto, con su propio test, nunca conectada a ningún controller hasta
ahora). Daban el mismo resultado por construcción, pero eran dos
implementaciones independientes de la misma pregunta — el mismo patrón
que ya costó inconsistencias en otros módulos de esta plataforma. Este
paso retira el SQL propio: `nodosEditablesUsuario(proyectoId, usuario)`
ahora llama a `funcionEfectivaPorLotes(usuario, proyectoId)` y filtra
`alcanza(candidato, 'captura')` — mismo contrato de salida de
`mis-permisos`, cero cambio visible, pero el candado del árbol sale de
la MISMA función que usa `autorizacion.js` para aceptar o rechazar una
escritura real, no de una copia. El controller pasa ahora el objeto
`usuario` completo (antes solo `usuario.id`) porque
`funcionEfectivaPorLotes` necesita `rol`/`id_dg` para el bono de DG.

En el frontend, `usePermisos.js::permisosDeNodo` (líneas 184-220) ya
hacía exactamente lo que este paso necesitaba mostrar — `esSoloLectura`
por nodo, ya conectado en `NodoCard.jsx`, `PropiedadesElemento.jsx`,
`FichaNodo.jsx`, `PanelDetalle.jsx` y `VistaDiagrama/PanelDrawer.jsx`.
Lo único que faltaba era la presentación en el árbol de "Detalle"
(`NodoArbol.jsx`, que no recibía `permisos` en absoluto) y el panel de
acciones (`FilaAcciones.jsx`, que ya deshabilitaba sus controles con el
criterio correcto, pero sin quitarlos).

### 11.2 El árbol — candado + atenuación por elemento, no una sola opacidad de fila

Un nodo donde `permisos.puedeEditarNodo(tipo, id)` es `false`
(`NodoArbol.jsx`) lleva un candado (ícono `Lock`, con
`aria-label="Sin permiso de edición en este elemento"`) entre el nombre
y el porcentaje, y la fila se atenúa. **Medido, no supuesto** (WCAG
1.4.3, mínimo 4.5:1 para texto): aplicar `opacity: 0.65` a la fila
completa sobre su fondo real (`bg-white`) deja el nombre
(`text-gray-700`) en 3.79:1 y el porcentaje (`text-gray-500`) en
2.52:1 — ambos por debajo del mínimo. La solución (decidida con el
usuario): el atenuado se aplica **por elemento**, no con una sola
opacidad de contenedor, y cada elemento de texto/ícono parte del tono
MÁS FUERTE que ya usa esta pantalla (`text-gray-900`, el mismo del
título del nodo en `EncabezadoDetalle.jsx`) en vez de su tono normal —
`gray-900` mezclado al 65% mide **5.52:1**, con margen sobre el
mínimo. Nombre, porcentaje y candado comparten esa misma clase
(`text-gray-900 opacity-[0.65]`); dentro de una fila de consulta se
leen con un peso parecido entre sí a propósito — la jerarquía que
importa en esta pantalla es "mis ramas vs. las que no son mías", y esa
la da la atenuación de la fila, no el peso relativo del porcentaje.

**El punto del semáforo queda sin atenuar.** Se midió si existía una
opacidad entre 0.80 y 1.00 (en pasos de 0.05) que dejara pasar los
cuatro colores de `COLORES_SEMAFORO` el mínimo gráfico de 3:1 contra el
fondo de la fila — ninguna lo logra: **gris (`#94a3b8`) ya falla
incluso a opacidad plena (2.56:1, sin ningún atenuado)**, y verde/ámbar
caen por debajo de 3:1 entre 0.90 y 0.95. Oscurecer la base del punto
para forzar el contraste (probado: verde/ámbar/rojo/gris a tonos
`-800`) sí pasa 3:1 los cuatro, pero **empeora la distinguibilidad
entre ellos** — sus luminancias quedan más parecidas entre sí que hoy
(rojo vs. gris cae a 1.01:1). Por eso el punto se queda a opacidad
plena dentro de una fila atenuada — es "lo primero que la gente lee
del árbol" y necesita conservar su fuerza — y `SemaforoDot.jsx`/
`COLORES_SEMAFORO` no se tocan: es la única fuente de verdad visual del
semáforo en toda la plataforma (Detalle, Diagrama, Cronograma, Agenda),
y una paleta distinta solo para filas de consulta hubiera sido la
misma clase de duplicación que motivó 11.1.

**Hallazgos aparte, preexistentes a este PR, no resueltos aquí:**
- `COLORES_SEMAFORO.gris` (`#94a3b8`) no pasa el mínimo gráfico de 3:1
  contra fondo blanco **a opacidad plena** (2.56:1) — un problema de la
  paleta en sí, no de la atenuación de Fase 3.
- La paleta del semáforo nunca se validó contra deficiencias de visión
  de color. Verde vs. ámbar es el par de menor contraste de luminancia
  entre sí (1.03:1 a opacidad plena) — ambos siguen separándose por
  matiz para visión de color típica, pero no hay evidencia en este
  repositorio de que se haya probado contra deuteranopia/protanopia,
  que es justo donde ese par (y verde/rojo) arriesgan confundirse.

### 11.3 El encabezado — chip "Consulta"

`EncabezadoDetalle.jsx` agrega un chip `Consulta` (ícono `Lock`) junto
a los que ya existen (tipo de nodo, estado, número de hijos) cuando
`permisos.esSoloLectura` — mismo booleano por nodo que ya controla ahí
mismo si el nombre/descripción son editables.

### 11.4 El panel de acciones — banda en vez de botones apagados

`PanelDetalle.jsx` reemplaza `FilaAcciones` (Registrar avance/Agregar
hijo/Más acciones) por `BandaConsulta.jsx` cuando `permisos.esSoloLectura`
es `true` — los botones se QUITAN, no se deshabilitan (uno apagado
invita a un clic que nunca responde). La banda explica el estado y
monta `BotonSolicitarParticipar.jsx` (existente desde antes de esta
sesión, sin cambios) con `nodo={{tipo, id, nombre}}` — la misma
instancia que ya vive en `GestorUsuariosProyecto.jsx` y
`SeccionMiembrosNodo.jsx`, ahora también aquí.

**El panel de detalle en sí no se atenúa** — solo el árbol. Las
pestañas de contenido (Actividad, Documentos, Indicadores, Territorio,
Riesgos, Equipo y permisos) se leen completas sin importar si el
usuario participa: ninguna de ellas esconde contenido de lectura por
`esSoloLectura`, solo ocultan o deshabilitan sus propios controles de
escritura (confirmado archivo por archivo: `PestanaDocumentos.jsx`,
`PestanaIndicadores.jsx`, `PestanaRiesgos.jsx`, `PestanaTerritorio.jsx`,
`TiraDatos.jsx`) — es la decisión de producto que distingue este estado
del de un `externo`.

### 11.5 El caso de herencia mixta

Un usuario invitado a una acción pero no a la etapa que la contiene: la
etapa queda con candado y atenuada, la acción no — probado en
`nodos-editables-usuario.test.js` contra la implementación real de
`funcionEfectivaPorLotes` (sin mocks de la escalera, solo de `pool`).
La herencia de la escalera solo corre hacia abajo (de ascendiente a
descendiente) — una asignación en un nodo nunca sube a su padre.

### 11.6 Fuera de alcance de este PR (decisiones explícitas)

- **`GET /proyectos/:id/imagen`**: sigue respondiendo sin pasar por
  `verificarToken` — la razón del comentario en `routes/index.js` es
  real (un `<img src>` nunca envía el header `Authorization`; el JWT
  vive en `localStorage`, nunca en una cookie), así que moverlo tal
  cual rompería el 100% de las portadas, no solo las de quien no tiene
  permiso. Cerrar el hueco real (cualquiera, sin sesión, puede pedir la
  imagen de cualquier proyecto por id) necesita un mecanismo nuevo
  (token también por query string, o reescribir a `fetch`+blob) — con
  el usuario, se decidió dejarlo fuera de este PR.
- **Tema oscuro**: no se tocó. La plataforma es monotema claro hoy (sin
  ninguna clase `dark:` ni `darkMode` en Tailwind) — la única excepción
  es `frontend/src/utils/carrilesEventos.js` (marcadores de la línea de
  tiempo), que sí reacciona a `prefers-color-scheme` con su propia
  paleta, acotada a esos marcadores — no existe ningún fondo/texto de
  superficie "oscuro" para el árbol o el panel de Detalle contra el
  cual medir.

## 12. Qué queda pendiente (decisiones de producto y endpoints sin migrar)

- **Listados de riesgos por nodo, `/etapas/:id/indicadores`,
  `/proyectos/:id/panorama-rapido`**: mismo hueco de visibilidad
  (`externo` sin filtrar) que el resto de la lectura estructural, no
  nombrados en el Paso 1/2 de este PR — pendientes de una ronda futura.
- **Teléfono en el directorio de usuarios**: columna que no existe hoy en
  `usuarios` — pendiente de decidir si se agrega (y entonces aplicar el
  filtro de campo por perfil ya diseñado en 7.3) antes de construir nada.
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
- **`GET /proyectos/:id/imagen` sin autenticar** y el **tema oscuro
  inexistente** (sección 11.6) — fuera de este PR por decisión
  explícita, no por descuido.
- **`COLORES_SEMAFORO.gris` no pasa 3:1 contra blanco ni a opacidad
  plena, y la paleta del semáforo (particularmente verde vs. ámbar)
  nunca se validó contra deficiencias de visión de color** (sección
  11.2) — preexistente a este PR, que solo lo hizo más visible al
  intentar atenuar el punto.
