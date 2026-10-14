# Modelo de permisos de PSPP v2.0

> **Este documento corresponde al commit `3a03938a24b8e882f9a6cb3d0d721897b590c661`
> (2026-10-14, Fase 3 — cuarto ajuste al estado de consulta: fondo
> `gray-200`, lápiz de pertenencia, retiro completo del tema oscuro,
> lienzo gris del panel) + un quinto ajuste — fondo = permiso, barra de
> acento = selección sin cruce, y el token `gray-150` (un paso más claro
> que `gray-200`) como fondo por defecto de una fila/panel bloqueado —,
> descrito en este mismo PR (sección 11.2 y 11.4).**
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

### 11.2 El árbol — el apagado vive en el fondo, no en el texto

**Ronda 1→2**: atenuaba el texto (opacidad 0.65 + oscurecer el color
base a `gray-900` para que, ya mezclado, siguiera pasando 4.5:1).
Verificado en producción con un usuario real (`enlace`, 2 de 15 etapas
asignadas): el candado aparecía exactamente donde debía, pero el
apagado era imperceptible — oscurecer el color y luego atenuarlo con
opacidad se cancelan casi por completo entre sí.

**Ronda 2→3**: el apagado se mueve al FONDO del renglón (`bg-gray-50`),
el nombre y el porcentaje regresan a sus colores normales. Verificado
otra vez en producción: `gray-50` es casi blanco, el bloqueo sigue sin
percibirse.

**Ronda 3→4 (actual)**: fondo `bg-gray-200` para una fila bloqueada
(`permisos.puedeEditarNodo(tipo, id)` es `false`) — separación de
1.238:1 contra el blanco del panel, más del doble que `gray-50`
(1.045:1). El nombre se queda en `text-gray-700`, su color normal de
siempre — pero **el porcentaje sube de `text-gray-500` (el tenue de
antes) a `text-gray-700` (el color primario, el mismo del nombre)**:
el problema de contraste de las rondas anteriores (el porcentaje caía
bajo 4.5:1 con cualquier fondo lo bastante oscuro para percibirse)
nunca fue el fondo — era que `gray-500` es un tono débil que cualquier
fondo no-blanco tumba. Con el porcentaje ya en su color primario, el
fondo puede ser tan oscuro como se necesite sin volver a calibrar nada
contra 4.5:1 en este bloque — ver medición abajo. En una fila
*asignada* el porcentaje se queda en `gray-500`, su tono de siempre: no
forma parte de la marca "es mío", que ya dan el nombre en negrita y el
lápiz (ver más abajo).

**Marca positiva de pertenencia**: antes, una fila asignada solo se
distinguía por semi-negrita + ausencia de candado — encontrar una
ausencia exige revisar renglón por renglón. Ahora la misma columna
donde vive el candado tiene un segundo estado: un ícono de lápiz
(`Pencil`, color `text-guinda-600`, el acento institucional) cuando
`permisos.puedeEditarNodo(tipo, id)` es `true`. Candado y lápiz son
mutuamente excluyentes y siempre presentes — la columna nunca queda
vacía, así que "¿esto es mío?" se lee de un vistazo por presencia, no
por ausencia. Tres señales distinguen una fila asignada: fondo blanco,
nombre en semi-negrita, y el lápiz (antes: candado).

**Conflicto resuelto (ronda 4, superado en ronda 5 — ver abajo)**: el
árbol ya usaba una barra de acento a la izquierda para marcar el nodo
*seleccionado* (navegación). Se decidió dejarla exclusiva de ese
significado — "asignado" se señala solo por las tres vías del párrafo
anterior, nunca por una barra — para que "estoy viendo este nodo" y
"este nodo es mío" no compitan por la misma señal. En esta ronda,
selección y bloqueo seguían resolviéndose por prioridad: si el nodo
seleccionado también estaba bloqueado, ganaba el resaltado de selección
(el lavado rosado) sobre el lavado gris, aunque el candado seguía
presente.

**Peso relativo, revisado (ronda 4)**: con el fondo de la fila cargando
significado propio (blanco=asignada, gris=bloqueada), el lavado de
selección (`bg-guinda-50/70` + barra) competía de más con esa señal —
la selección es un estado pasajero, la pertenencia es permanente, y en
pantalla pesaba al revés. El lavado se suaviza de `/70` a `/40`
(`bg-guinda-50/40`); la barra y el color del texto seleccionado
(`text-guinda-700 font-semibold`) no cambian. Con esto, una fila
seleccionada deja ver el fondo que tiene debajo (blanco o gris) en vez
de taparlo con un rosa fuerte.

**Ronda 4→5 — fondo = permiso, barra de acento = selección, sin cruce
nunca**: reportado en producción el defecto exacto que dejaba abierta
la prioridad de la ronda 4 — al seleccionar una etapa bloqueada, el
lavado rosado de la selección reemplazaba el lavado gris y la fila se
pintaba como si el usuario tuviera permiso, tres píxeles a la izquierda
de un candado que decía lo contrario. La prioridad "seleccionado >
bloqueado > asignado" de la ronda 4 permitía justo esa combinación. Se
retira esa prioridad: `fondoFila` decide el color **solo** por
`esConsulta` (el estado de permiso); `esSeleccionado` únicamente agrega
`border-l-guinda-600` — nunca cambia qué color de fondo corresponde.
Igual que `colorNombre`: ahora decide primero por `esConsulta`, así que
una fila bloqueada se queda en `text-gray-700` sin importar si está
seleccionada (antes, seleccionada, se volvía `text-guinda-700
font-semibold` — la misma marca de "esto es mío" que el candado, al
lado, contradecía).

Una fila bloqueada *y* seleccionada no puede quedar con exactamente el
mismo gris que una bloqueada sin seleccionar — perdería la única señal
de "aquí estás parado" si la barra de 3px no bastara por sí sola en
algún caso de uso. Se reutiliza `bg-gray-200` (el valor que esta misma
ronda retira como fondo *por defecto* de una fila bloqueada, ver más
abajo) para ese único caso — ya estaba calibrado y medido desde la
ronda 4, un escalón más oscuro que el `bg-gray-150` nuevo, y nunca el
rosado. Resultado: dos señales independientes, sin cruce — el fondo
dice "esto es tuyo o no", la barra dice "estás aquí", y ninguna de las
dos pisa a la otra en ningún estado posible (asignada/bloqueada ×
seleccionada/no seleccionada, las 4 combinaciones).

**El gris por defecto de una fila bloqueada, un paso más claro**: a
pedido explícito del usuario, `bg-gray-200` (el valor de la ronda 4)
baja un escalón **pequeño**, no completo — en vez de saltar a
`gray-100` (que ya se había probado y descartado en la ronda 2→3, ver
arriba), se define `gray-150` como token con nombre en
`tailwind.config.cjs` (`theme.extend.colors.gray.150`, no un valor
suelto en una clase — cae fuera de la escala por defecto de Tailwind):
el punto medio exacto entre `gray-100` (`#F3F4F6`) y `gray-200`
(`#E5E7EB`), **`#ECEEF1`**. Separación medida contra el blanco del
panel: **1.167:1** — más que `gray-100` (1.101:1) y menos que
`gray-200` (1.238:1), justo el escalón intermedio pedido, con el mismo
criterio de "debe seguir distinguiéndose claramente del blanco" ya
usado en rondas anteriores (sigue siendo casi 3 veces la separación de
`gray-50`, 1.045:1, el valor que se descartó por imperceptible en la
ronda 2→3).

El contraste de texto no era el problema de este cambio (aclarar el
fondo solo lo mejora), pero se confirma con la misma medición de
siempre: `text-gray-700` (nombre/porcentaje) contra `gray-150` sube a
**8.84:1** (antes 8.33:1 contra `gray-200`); el candado
(`text-gray-900` al 65% de opacidad) contra `gray-150` sube a
**5.19:1** (antes 5.06:1 contra `gray-200`) — ambos con más margen
sobre el mínimo de 4.5:1 que antes, nunca menos.

**Medido**:

| Elemento | Ronda 4 (`gray-700`/candado sobre `gray-200`) | Ronda 5 (sobre `gray-150`, el nuevo valor por defecto) |
|---|---|---|
| Separación del fondo bloqueado contra blanco | 1.238:1 | **1.167:1** |
| Nombre (`text-gray-700`) | 8.33:1 | **8.84:1** |
| Porcentaje, bloqueada (`text-gray-700`, subido) | 8.33:1 | **8.84:1** |
| Candado (`text-gray-900` @ 65% opacidad) | 5.06:1 | **5.19:1** |
| Porcentaje, si se hubiera dejado en `gray-500` (referencia, descartado desde la ronda 4) | 3.90:1 — fallaría | 4.16:1 — seguiría fallando |

Una fila bloqueada *seleccionada* se queda en `bg-gray-200` (no en
`gray-150`, ver arriba) — sus números de contraste de texto son
exactamente los de la columna "Ronda 4" de esta tabla, sin cambios.

El punto del semáforo y la etiqueta de estado (`"Vencida"`,
`"Bloqueada"`, etc.) siguen con la atenuación leve (`opacity-[0.72]`)
de la ronda anterior, sin cambios — no son texto de lectura continua,
no se calibran contra 4.5:1 (instrucción explícita). El candado
conserva su tratamiento (`text-gray-900 opacity-[0.65]`, 5.52:1 contra
blanco) — es el único ícono que se lee igual que una palabra.

**No se tocó `SemaforoDot.jsx`/`COLORES_SEMAFORO`** — es la única
fuente de verdad visual del semáforo en toda la plataforma (Detalle,
Diagrama, Cronograma, Agenda); envolverlo en una lógica de atenuación
distinta solo para filas de consulta hubiera sido la misma clase de
duplicación que motivó 11.1.

**Sin tema oscuro**: una ronda anterior agregó clases `dark:`
calibradas pero inertes (`darkMode: 'class'` en `tailwind.config.cjs`,
sin interruptor real que las activara) para un eventual tema oscuro.
Decisión del usuario: la plataforma no va a tener tema oscuro —
retiradas por completo, y revertido `tailwind.config.cjs` a como
estaba (sin la clave `darkMode`). Verificado con `git grep dark: ` contra
el commit inmediatamente anterior a Fase 3 (`c71dba2`): **cero**
resultados en todo `frontend/` — ninguna otra pantalla tenía clases
`dark:` antes de este trabajo, así que retirarlas no apaga nada que
existiera en otro lugar. La única detección de tema del repositorio,
`frontend/src/utils/carrilesEventos.js` (marcadores de la línea de
tiempo, `matchMedia` en JavaScript puro, no la variante `dark:` de
Tailwind), no se tocó y no se vio afectada en ningún momento por este
vaivén.

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

**El lienzo del panel va gris, igual que la fila — el contenido nunca
cambia de color (ronda 4, fondo actualizado en ronda 5).**
`PanelDetalle.jsx` aplica al contenedor scrolleable completo, cuando
`permisos.esSoloLectura`, el mismo `bg-gray-150` que usa el árbol para
una fila bloqueada *sin seleccionar* (sección 11.2) — en la ronda 4 era
`bg-gray-200`, bajado un escalón en la ronda 5 junto con el resto de
esta funcionalidad. El panel no tiene un concepto de "selección" propio
(siempre muestra el nodo actualmente elegido, no hay un segundo estado
que distinguir) — así que, a diferencia del árbol, no necesita el
escalón más oscuro (`bg-gray-200`) que ahí sí hace falta para una fila
bloqueada *y* seleccionada a la vez. El encabezado, la banda, la tira
de datos y las pestañas se asientan sobre ese fondo sin tocar su propio
color de texto, mismo criterio ya validado en 11.2: el apagado vive en
la superficie, nunca en el contenido. Las "subsuperficies" que ya eran
blancas (las tablas de `PestanaDocumentos.jsx`, `PestanaIndicadores.jsx`,
`PestanaRiesgos.jsx`) ganaron un `bg-white` explícito — antes eran
blancas solo porque el panel detrás lo era; sin ese `bg-white` propio,
se habrían vuelto grises al heredar el nuevo fondo, justo lo que el
usuario pidió evitar ("para que el contenido respire").

**Medido** (texto principal y secundario del panel contra `bg-gray-150`,
el fondo actual — el contraste solo mejora al aclarar el fondo, así que
estos números no eran el riesgo de este cambio, pero se confirman
igual): el título del nodo (`text-gray-900`) mide **15.26:1** (antes
14.33:1 contra `gray-200`); la descripción (`text-gray-600`) mide
**6.50:1** (antes 6.10:1) — ambos con más margen sobre el mínimo de
4.5:1 que antes. Dos tonos más tenues que también aparecen en el
panel, preexistentes y fuera de alcance de ambas rondas, quedan
señalados aparte: `text-gray-500` (chips/contadores) sube a 4.16:1
contra `gray-150` (antes 3.90:1 contra `gray-200`) —sigue sin alcanzar
4.5:1, aunque más cerca— y `text-gray-400` (leyendas como "Calculado
desde sus acciones.") sube a 2.18:1 (antes 2.05:1) —sigue sin alcanzar
el mínimo gráfico de 3:1, que ya fallaba contra blanco puro (2.54:1)
antes de la ronda 4—. Ninguno de los dos es el texto "principal" ni
"secundario" que se pidió medir en ninguna de las dos rondas; siguen
documentados aquí como hallazgo, sin tocarse.

Las pestañas de contenido (Actividad, Documentos, Indicadores,
Territorio, Riesgos, Equipo y permisos) se leen completas sin importar
si el usuario participa: ninguna de ellas esconde contenido de lectura
por `esSoloLectura`, solo ocultan o deshabilitan sus propios controles
de escritura (confirmado archivo por archivo: `PestanaDocumentos.jsx`,
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
- **Tema oscuro**: decisión de producto, no pendiente — la plataforma
  no va a tener tema oscuro. Una ronda intermedia había agregado clases
  `dark:` calibradas (pero inertes) al árbol de Detalle; se retiraron
  por completo en la ronda siguiente (sección 11.2), junto con el
  cambio de `darkMode` en `tailwind.config.cjs` que las volvía
  inertes — el archivo queda exactamente como estaba antes de Fase 3.

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
- **`GET /proyectos/:id/imagen` sin autenticar** (sección 11.6) — fuera
  de este PR por decisión explícita, no por descuido.
- **`COLORES_SEMAFORO.gris` no pasa 3:1 contra blanco ni a opacidad
  plena, y la paleta del semáforo (particularmente verde vs. ámbar)
  nunca se validó contra deficiencias de visión de color** (sección
  11.2) — preexistente a este PR, que solo lo hizo más visible al
  intentar atenuar el punto.
- **`text-gray-500` (chips/contadores del panel) y `text-gray-400`
  (leyendas como "Calculado desde sus acciones.") no pasan 4.5:1 contra
  el fondo `bg-gray-150` del panel bloqueado** (4.16:1 y 2.18:1 — ambos
  mejoraron respecto a `gray-200`, 3.90:1 y 2.05:1, pero ninguno cruzó
  el mínimo — sección 11.4) — `gray-400` ya fallaba incluso el mínimo
  gráfico de 3:1 contra blanco puro (2.54:1) antes de este PR. No se pidió medir
  ni corregir estos dos tonos en esta ronda (solo texto "principal" y
  "secundario"); quedan anotados para una revisión de paleta aparte.
