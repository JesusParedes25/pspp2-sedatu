# Modelo de permisos de PSPP v2.0

> **Este documento corresponde al commit `4855a8e2f2b775411aff4e98192123a8fe8f830f`
> (2026-10-15, Fase 4, parte A — la matriz de capacidades completa,
> sección 13) + Fase 4, parte B — transferencia de administración de
> proyecto exclusiva de superadmin, correo de aviso de asignación a
> usuarios ya existentes, y confirmación de que el candado de `GET
> /proyectos/:id/exportar` de la parte A sigue en pie — descrito en este
> mismo PR (sección 15).**
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
   cambiar el modelo. La Fase 4/parte A (sección 13) no cambia el modelo
   tampoco — levanta la matriz de capacidades y cierra tres huecos de
   implementación (lectura para interno, alcance de solicitudes,
   exportar). Lo que queda pendiente está en la sección 14.

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

## 13. Fase 4, parte A — qué se puede asignar y quién lo resuelve

Hasta aquí este documento describe QUIÉN tiene qué peldaño. Esta sección
es la otra mitad: QUÉ permite hacer cada peldaño exactamente, acción por
acción — la matriz de capacidades que le sirvió de base al rediseño del
desplegable de función (13.5) y a los tres cierres de huecos de
13.2-13.4. Es la tabla más consultada de todo este documento — si algo
de aquí deja de coincidir con el código, regenerar esta sección primero.

### 13.1 La matriz de capacidades

| # | Acción | lectura | captura | responsable | admin_proyecto | Dónde se decide |
|---|---|:-:|:-:|:-:|:-:|---|
| 1 | Registrar avance en un nodo | No | **Sí** | Sí | Sí | `PATCH /etapas\|acciones\|tareas/:id` sin middleware de ruta (`etapas.routes.js:24`, `acciones.routes.js:21`, `tareas.routes.js:13`) → el controller llama `minimoParaPatchNodo(body)` (`autorizacion.js:171-174`): si el payload no trae ningún campo de `CAMPOS_FICHA_NODO` (líneas 163-169), basta `captura`. |
| 2 | Cambiar el estatus de un nodo | No | **Sí** | Sí | Sí | Mismo mecanismo (`estado` no es campo de ficha) **o** `PUT /estado` → `estado.controller.js::tienePermisoCambiarEstado` (líneas 42-49): `captura` para nodos, `administracion_proyecto` si `entidad_tipo==='Proyecto'`. |
| 3 | Subir documentos / adjuntar ligas | No | **Sí** | Sí | Sí | `routes/index.js` (POST de evidencias) → `exigirEdicionNodo(tipo)` → `puedeEditarNodo` (`autorizacion.js:114-116`), mínimo `captura`. |
| 4 | Escribir comentarios | No | **Sí** | Sí | Sí | `comentarios.routes.js` (crear, responder) → `exigirEdicionDeEntidadEnCuerpo`/`exigirEdicionComentario` → `puedeCapturarEn` (`permisos.middleware.js:125-134`) → `captura`. |
| 5 | Crear, editar y cerrar riesgos | No | **Sí** | Sí | Sí | `riesgos.routes.js` (crear/actualizar/eliminar) — "cerrar" es el mismo PUT con `estado` — vía `puedeCapturarEn` → `captura`. |
| 6 | Capturar aportaciones de indicadores | No | **Sí** | Sí | Sí | `POST /indicadores/:id/aportaciones` → `exigirEdicionAportacionNueva()`; `PATCH\|DELETE /aportaciones/:id` → `exigirEdicionAportacion()` (`permisos.middleware.js:206-231`) → `captura` en el nodo/proyecto dueño. |
| 7 | Crear acciones y tareas hijas | No | No | **Sí, EN EL PADRE** | Sí | `exigirResponsableNodo`/`exigirResponsableProyecto` (`permisos.middleware.js:80-104`), mínimo `responsable` — en el padre conceptual del nodo nuevo, no en el nodo mismo. |
| 8 | Editar nombre / descripción / fechas límite del nodo | No | No | **Sí** | Sí | Mismo `PATCH .../:id`, con algún campo de `CAMPOS_FICHA_NODO` presente → `minimoParaPatchNodo` devuelve `responsable`. |
| 9 | Eliminar un nodo | No | No | **Sí, EN EL PADRE** | Sí | `puedeGestionarNodo` (`autorizacion.js:134-137`) → `resolverAccesoPadreDeNodo`, llamado dentro de `etapas.controller.js:146`, `acciones.controller.js:168`, `tareas.controller.js:94`. |
| 10 | Invitar personas al nodo o al proyecto | No | No | **Sí** | Sí | Proyecto: `miembros.controller.js::agregarMiembro`/`crearInvitacion` (líneas 141, 216) → `resolverAccesoProyecto(...,'responsable')`. Nodo: `nodo-miembros.controller.js::agregar` (línea 165) → `puedeGestionarParticipantesNodo` — basta ser responsable de ESE nodo, no de su padre. |
| 11 | Cambiar la función de otra persona | No | No | **Sí** | Sí | Mismo endpoint que invitar (upsert de rol, `miembros.queries.js::agregarMiembro`) a nivel proyecto; `PUT .../miembros-nodo/:userId` → `nodo-miembros.controller.js::actualizar` (línea 221) a nivel nodo. |
| 12 | Quitar a alguien del equipo | depende | depende | Sí | Sí | Quitarse a sí mismo: siempre permitido, sin peldaño, salvo ser el único `administracion_proyecto` (freno `ULTIMO_RESPONSABLE`). Quitar a otro: `responsable`, misma función que la fila 11. |
| 13 | Resolver bloqueos | depende | Sí | Sí | Sí | `exigirResolverBloqueo` (`permisos.middleware.js:249-263`): el creador del bloqueo siempre puede, sin peldaño; si no, `captura`-o-superior en la entidad. |
| 14 | Resolver solicitudes de participación | No | No | **Sí, EN EL NODO O EL PROYECTO AL QUE SE REFIERE** | Sí | `solicitudes.controller.js::responder` (líneas 255-260): si `solicitud.id_nodo` existe, `puedeGestionarParticipantesNodo` en ESE nodo; si no, `puedeGestionarParticipantes` en el proyecto. Corregido en 13.3 — antes siempre evaluaba contra el proyecto completo. |
| 15 | Exportar | Sí¹ | Sí | Sí | Sí | `GET /proyectos/:id/exportar` → `exigirVisibilidadProyecto()` (`routes/index.js:133`, corregido en 13.4). |
| 16 | Editar la configuración del proyecto | No | No | No | **Sí** | `proyectos.controller.js::actualizar` (línea 219) → `puedeEditarProyecto` → `administracion_proyecto`. |
| 17 | Transferir la administración del proyecto | — | — | — | — | **No existe ningún endpoint.** `carteras.controller.js:84-87` lo confirma al documentar el equivalente de cartera: "mismo criterio que reasignar al administrador de un proyecto, que hoy tampoco tiene una vía de autoservicio." Ningún `UPDATE` en `proyectos.queries.js` toca `id_creador`. Queda para la parte B de esta fase. |

¹ Exportar no pasa por la escalera — es una forma de VER, y la
visibilidad (sección 5) es total entre internos sin importar el
peldaño. `exigirVisibilidadProyecto()` solo exige el peldaño `lectura`
para `externo` (vía `puedeVerProyecto`); cualquier interno exporta sin
ninguna condición, igual que ve cualquier proyecto.

### 13.2 Tres preguntas resueltas con la matriz

**¿Por nodo, por proyecto, o por los dos?** Por los dos, pero la
herencia solo corre hacia ABAJO: `funcionEfectivaEnNodo` (líneas
169-202) resuelve un nodo como el máximo entre lo que ese nodo otorga
directamente y lo que heredaría de su padre (`comoHeredado`, líneas
75-81); nunca al revés — ser `captura` de una acción no da nada en la
etapa que la contiene ni en el proyecto. `masAlto()` (líneas 45-53)
nunca resta: una vía más alta nunca es cancelada por una más baja.

**`invitadoSoloParaExternos` (ahora `rechazoLecturaParaInterno`):**
seguía viva solo a nivel nodo antes de esta ronda — se podía rodear por
los otros dos caminos. Cerrado en 13.3.

**¿Más de un responsable en el mismo nodo?** Sí, sin límite —
`nodo_miembros` (`033_nodo_miembros.sql:14`) solo tiene `UNIQUE(tipo_nodo,
id_nodo, id_usuario)`, una fila por persona, no una por nodo. Si una
etapa y una de sus acciones tienen cada una su propio responsable,
ninguno manda sobre el otro: ambos llegan a `responsable` en la acción
(uno directo, el otro heredado) y conviven sin conflicto — el modelo es
de unión de capacidades, nunca de "el de más abajo/arriba gana".
Hallazgo relacionado, fuera de alcance de este PR: `administracion_proyecto`
no tiene un índice único que impida un segundo administrador del
proyecto — `esUnicoAdministrador` (`miembros.queries.js:110-116`) solo
bloquea QUITARLE el rol al único administrador, nunca bloquea
AGREGARLE ese mismo rol a una segunda persona. Es una regla de diseño
(migración 079), no una restricción de esquema — tocar esto con datos
reales en producción merece su propia migración y su propio respaldo,
no se cambia en este PR.

### 13.3 Commit 2 — cerrar los tres caminos hacia `rol = 'lectura'` para un interno

`rechazoLecturaParaInterno` (nueva, `backend/src/utils/validar-funcion-lectura.js`)
reemplaza la función local `invitadoSoloParaExternos` que solo vivía en
`nodo-miembros.controller.js` — misma lógica, ahora reusada desde los
tres caminos que pueden terminar en `rol='lectura'` (nodo_miembros o
proyecto_usuarios):

1. `nodo-miembros.controller.js::agregar`/`actualizar` (líneas 165-170,
   221-225) — ya la tenía, ahora importa la versión compartida en vez
   de una copia local.
2. `miembros.controller.js::agregarMiembro`/`crearInvitacion` (líneas
   141-151, 216-221) — hueco real cerrado: `POST /proyectos/:id/miembros`
   y `/invitaciones` aceptaban `rol:'lectura'` para un interno sin
   rechazarlo (la UI lo escondía, el servidor no — el `CHECK` de
   `proyecto_usuarios.rol`, migración 079, sí admite ese valor).
3. `solicitudes.controller.js::crear` (línea 99) — hueco real cerrado:
   una solicitud de nodo con `funcion:'lectura'` de un usuario interno
   se creaba igual y, al aceptarse, insertaba la fila en `nodo_miembros`
   sin pasar nunca por la validación (`FUNCIONES_NODO` ya incluye
   `'lectura'`, línea 31, y nada más la filtraba por perfil). Se
   rechaza al CREAR la solicitud (no al aceptarla) — así nunca puede
   existir una solicitud pendiente con una combinación que el servidor
   terminaría rechazando de todos modos.

### 13.4 Commit 3 — una solicitud la resuelve quien gestiona participantes en SU nodo, no siempre en el proyecto completo

**Antes**: `solicitudes.controller.js::responder` evaluaba siempre
`puedeGestionarParticipantes({idProyecto})`, sin importar si la
solicitud era de una etapa puntual — un responsable de una sola etapa
no podía resolver (ni ver en su bandeja) las solicitudes de su propia
etapa.

**Ahora** (líneas 255-260): si `solicitud.id_nodo` existe, se evalúa
`puedeGestionarParticipantesNodo` en ese nodo exacto — el mismo
criterio que ya usa `nodo-miembros.controller.js` para una invitación
directa; si no, sigue evaluándose contra el proyecto completo, sin
cambio. `pendientesQuePuedeResolver` (`solicitudes.queries.js:257-290`,
la bandeja de Notificaciones) se reescribió para llamar exactamente las
mismas dos funciones por cada solicitud candidata, en vez de replicar
la condición a mano en SQL mirando solo `proyecto_usuarios` — por
construcción, lo que aparece en la bandeja es ahora exactamente lo que
`responder()` va a aceptar; antes podían desincronizarse (y de hecho lo
estaban, ver el hallazgo de abajo).

**El bono de DG de `direccion`** (poder resolver solicitudes de
proyectos que lidera su DG) nunca fue parte de la escalera general —
`funcion-efectiva.js` solo le da ese bono a `ejecutivo`. Es una
extensión deliberada, exclusiva de solicitudes, que ya vivía en
`pendientesQuePuedeResolver` desde antes de esta ronda; se replicó
también dentro de `responder()` (`porBonoDireccion`, líneas 255-257)
para que ambos lugares queden de acuerdo — **sin este PR, un director
veía la solicitud en su bandeja por este bono y, al intentar
aceptarla, se topaba con un 403**: el mismo defecto "visible pero no
resoluble" que esta ronda vino a cerrar para el caso nodo/proyecto,
descubierto también aquí.

**Hallazgo nuevo, misma familia de bug**: el SQL anterior de
`pendientesQuePuedeResolver` trataba a CUALQUIER `ejecutivo` como
capaz de resolver CUALQUIER solicitud (`$2 IN ('superadmin','ejecutivo')`,
sin mirar su DG) — pero `funcionEfectivaEnProyecto` nunca le dio ese
bono incondicional, solo cuando su DG coincide con la del proyecto
(líneas 111-118). Un ejecutivo de una DG distinta ya veía la solicitud
en su bandeja y ya se topaba con el mismo 403 al intentar resolverla,
desde antes de esta ronda. Al reescribir la función para reusar
`puedeGestionarParticipantes`/`Nodo` en vez de la condición SQL
duplicada, este segundo caso se cerró de paso, sin tocarlo a propósito
— un ejecutivo ahora solo ve en su bandeja lo que de verdad puede
resolver, igual que ya corregía el caso de `direccion`.

Quienes ya podían resolver todo de verdad (no solo verlo en la
bandeja) siguen pudiendo: `superadmin` (incondicional, dentro de la
propia `funcionEfectivaEnNodo`/`EnProyecto`), `ejecutivo`/`direccion`
con el DG correcto, y cualquier `responsable`/`administracion_proyecto`
del proyecto completo (vía herencia hacia los nodos, sección 13.2).

### 13.5 Commit 4 — `GET /proyectos/:id/exportar` sin candado de visibilidad

Último hueco del audit de Fase 2/Paso 1: a diferencia del resto de la
lectura estructural de un proyecto, exportar no exigía ni siquiera el
peldaño `lectura` que `exigirVisibilidadProyecto()` aplica a `externo`
— cualquier usuario autenticado, sin relación con el proyecto, podía
descargar su estructura completa en Excel/CSV. Se le aplicó el mismo
mecanismo que protege el resto (`routes/index.js:133`); cero cambio
para cualquier interno.

**Dos piezas que salieron del mismo audit y se dejaron fuera de este
PR, con su motivo:**
- `PUT /etapas|acciones|tareas/:id` sigue con un gate más débil
  (`captura`, vía `exigirEdicionNodo`) que su `PATCH` equivalente
  (`responsable`, vía `minimoParaPatchNodo`) para la misma operación
  (reemplazar la ficha completa). Confirmado que ningún componente del
  frontend lo llama — pero una ronda anterior de esta misma sesión
  reescribió a propósito `actualizarAccionCampos`/`actualizarEtapa`
  (el SET dinámico que corrige la pérdida de `instancia_responsable`/
  `observaciones`) asumiendo que ese PUT sigue siendo una vía de API
  externa válida, no código muerto a borrar. Esa decisión previa pesa
  más que "nadie lo usa hoy desde la UI" — se deja igual, reportado
  aquí en vez de borrado o corregido sin preguntar.
- Que `administracion_proyecto` no tenga un candado de esquema contra
  un segundo administrador (sección 13.2) — anotado como riesgo
  conocido, no corregido: cambiar eso con datos reales en producción
  necesita su propia migración, su propio respaldo, y no es parte del
  pedido de esta ronda.

### 13.6 Commit 1 — el desplegable de función, con descripciones

`frontend/src/components/common/SelectorFuncion.jsx` (nuevo) reemplaza
los `<select>` nativos de `GestorUsuariosProyecto.jsx` (equipo del
proyecto) y `SeccionMiembrosNodo.jsx` (miembros de nodo) — cuatro sitios
en total (invitar/reasignar × proyecto/nodo). Un `<option>` nativo no
admite más que texto de una línea, así que es un listbox propio: cada
opción muestra su nombre (los que la plataforma ya usa — "Colaborador"
para `captura`, "Invitado" para `lectura` — no se renombraron a
"Captura"/"Lectura" literal, ver nota) y una línea de qué hace, visible
en cuanto el panel se abre, sin hover.

**Nota sobre los nombres**: el pedido original decía que el control
muestra hoy el nombre técnico "Captura" — el código real mostraba
"Colaborador" (y "Invitado" para `lectura`), nombres ya pensados para
ser accesibles. Se mantuvieron esos nombres ya establecidos (cambiarlos
al término técnico habría ido en sentido contrario al propio objetivo
del commit) y se agregó la descripción debajo de cada uno.

**Texto de cada opción** (el sustantivo cambia según dónde se asigne —
"esta etapa"/"esta acción"/"esta tarea"/"todo el proyecto",
`sustantivoAsignacion()` en el mismo archivo):
- *Colaborador* (`captura`): "Registra avances, sube documentos,
  comenta y da seguimiento a riesgos e indicadores en {sustantivo}."
- *Responsable* (`responsable`): "Todo lo de Colaborador, y además
  crea acciones y tareas, cambia nombres y fechas límite, e invita,
  retira o cambia la función de otras personas en {sustantivo}." — se
  agregó "o cambia la función de otras personas" sobre el texto
  propuesto: la matriz (fila 11) ya distingue esa como una capacidad
  propia de `responsable`, y el texto original solo mencionaba
  invitar/retirar.
- *Invitado* (`lectura`): "Puede ver {sustantivo} sin capturar nada. Es
  la única forma de que una persona externa tenga acceso." — solo se
  ofrece cuando `mostrarLectura` es `true`, decidido por el padre según
  el PERFIL (`usuarios.rol`) de la persona seleccionada, nunca dentro
  del propio selector.

`administracion_proyecto` nunca aparece en este desplegable — no se
asigna aquí, se transfiere (fila 17 de la matriz, sin vía de
autoservicio todavía).

**Efecto colateral necesario, no cosmético**: ninguna de las dos
consultas que alimentan estos dos archivos (`panorama.controller.js::obtenerTodosParticipantes`,
usada por `GestorUsuariosProyecto.jsx`; `nodo-miembros.queries.js::listarMiembros`,
usada por `SeccionMiembrosNodo.jsx`) exponía el PERFIL de un miembro YA
agregado — solo su FUNCIÓN en ese proyecto/nodo. Sin el perfil, el
desplegable de reasignación no podía saber si ofrecer "Invitado" al
cambiarle la función a alguien que ya participa. Se agregó `u.rol AS
perfil` a ambas consultas (columna nueva, de solo lectura, sin cambio
de escritura) — de paso corrige un bug latente real en
`SeccionMiembrosNodo.jsx`: antes de esta ronda, `funcionesPara(m)`
comparaba `m.rol` (la FUNCIÓN del miembro: captura/responsable/lectura)
contra `'externo'`, un valor que ese campo nunca tiene — así que el
`<select>` de reasignación de un miembro ya agregado jamás ofrecía
"Invitado", ni siquiera para alguien que de verdad era externo.

## 14. Qué queda pendiente (decisiones de producto y endpoints sin migrar)

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
- **Eliminar nodo, confirmación con conteo** (hueco 3.3 de una ronda
  anterior): la confirmación con conteo de descendientes al eliminar un
  nodo sigue pendiente — es una pieza de UX, no de permisos (el gate de
  permiso en sí, "responsable en el padre", ya está cerrado, fila 9 de
  la matriz en 13.1). El gate mínimo de lectura en exportación (hueco
  3.1) se cerró en la Fase 4/parte A, sección 13.5.
- **`PUT /etapas|acciones|tareas/:id` con un gate más débil que su
  `PATCH` equivalente** (sección 13.5) — confirmado sin caller en el
  frontend, pero deliberadamente no se tocó: una ronda anterior ya
  decidió mantenerlo vivo para un consumidor de API externo hipotético.
- **`administracion_proyecto` sin candado de esquema contra un segundo
  administrador** (sección 13.2) — riesgo conocido, no corregido: es
  una regla de diseño (migración 079), no una restricción de base de
  datos; cambiarla con datos reales en producción merece su propia
  migración y su propio respaldo. `transferirAdministracion` (sección
  15.1) se defiende de este riesgo sin corregirlo: si alguna vez
  hubiera dos administradores a la vez, los degrada a los DOS a
  `responsable` antes de promover al nuevo, en vez de asumir que existe
  exactamente uno.
- **Transferencia de administración por el propio administrador**
  (sección 15.1) — fuera de alcance por decisión explícita, no por
  descuido: hoy solo un superadmin puede transferirla. Un administrador
  cediéndola por su cuenta queda para una versión posterior.
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

## 15. Fase 4, parte B — transferencia de administración + correo de aviso de asignación

### 15.1 Transferencia de administración — exclusiva de superadmin

Decisión de producto tomada por tiempo (recorte deliberado de alcance,
no un olvido): únicamente un `superadmin` puede transferir
`administracion_proyecto` de un proyecto. El propio administrador
cediéndola por su cuenta queda pendiente para una versión posterior —
ver sección 14.

**Dónde vive**: `AdminCatalogos.jsx`, nuevo tab "Transferir
administración" (`TabTransferenciaAdmin.jsx`) — dentro de la zona de
administración, ya blindada con `router.use(requiereRol(['superadmin']))`
en `admin.routes.js`. No se agregó nada en Configuración del proyecto:
ahí ningún usuario normal tendría permiso de usarlo, sería un botón que
solo frustra.

**Backend**: `PATCH /admin/proyectos/:id/administrador`
(`admin.routes.js`) → `miembros.controller.js::transferirAdministracionProyecto`
→ `miembros.queries.js::transferirAdministracion`, una sola
transacción (`BEGIN`/`COMMIT`/`ROLLBACK`, filas bloqueadas con `FOR
UPDATE`):

| Validación | Código | HTTP |
|---|---|---|
| Destinatario no es miembro aceptado del proyecto | `DESTINATARIO_NO_MIEMBRO` | 400 |
| Destinatario es perfil `externo` | `DESTINATARIO_EXTERNO` | 400 |
| El proyecto no tiene ningún administrador actual | `SIN_ADMINISTRADOR` | 409 |
| El destinatario ya es administrador | `MISMO_ADMINISTRADOR` | 400 |

El proyecto nunca queda sin administrador por construcción: la función
primero degrada a `responsable` a TODOS los que tuvieran hoy
`administracion_proyecto` con estado `aceptada` (no solo "el" único que
debería haber, ver el riesgo ya documentado en la sección 14 sobre la
falta de candado de esquema) y recién después promueve al nuevo — así
que, si alguna vez hubiera dos administradores a la vez, la
transferencia los corrige a los dos sin más intervención, aunque no
corrige la causa (eso sigue pendiente, es cambio de esquema). El
administrador saliente **no se elimina** del proyecto, queda como
`responsable`.

Tras la transacción: `registrarActividad` (tipo `miembro`,
`entidad_tipo: 'Proyecto'`) en la bitácora del proyecto, y
`crearNotificacion` (tipo `PermisoNuevo` — ya estaba en el CHECK de
`notificaciones.tipo` desde la migración 060, nunca usado hasta ahora)
a cada administrador saliente y al nuevo.

**Pruebas**: `backend/src/__tests__/transferir-administracion.test.js`
(la transacción real contra un `pool.connect()` mockeado — las 4
validaciones, el happy path, y el caso de dos administradores
existentes) y `transferir-administracion-controller.test.js` (el
controller: 400 sin `id_usuario`, happy path con bitácora+2
notificaciones, y que un error tipado de la query se reenvía a
`next(err)` sin que el controller lo intercepte).

### 15.2 Correo de aviso a quien ya tiene cuenta

**Contexto**: ya existía `enviarCorreoInvitacion` (en
`AdminCatalogos.jsx`) para avisarle a un usuario NUEVO que se le creó
una cuenta. Faltaba la segunda plantilla: avisarle a alguien que YA
TIENE CUENTA que fue asignado como responsable/colaborador de un
proyecto o de un nodo.

**Mecanismo, idéntico al ya existente** (EmailJS corre en el
navegador — `@emailjs/browser` — nunca desde el backend): nuevo helper
compartido `frontend/src/utils/correoAsignacion.js::enviarCorreoAsignacion`,
que lee las credenciales de `configuracion_sistema` vía `GET
/admin/config/publico` (público, sin autenticación — igual que el
camino de invitación). Nueva clave `emailjs_template_id_asignacion`
(migración `081_emailjs_template_asignacion.sql`, `ON CONFLICT DO
NOTHING`, mismo patrón que `041_recuperar_contrasena.sql`), agregada al
arreglo `claves` de `admin.controller.js::obtenerConfigPublico` y a un
campo nuevo en `TabConfiguracion` (`AdminCatalogos.jsx`) — **el id del
template lo crea el superadmin en EmailJS y lo pega ahí; nunca se
escribe en el código**. Si la clave queda vacía, `enviarCorreoAsignacion`
devuelve `{enviado:false, motivo:'sin_configuracion'}` sin lanzar — la
asignación ya se guardó antes de intentar el correo, así que nunca se
bloquea por esto.

**Variables que debe aceptar el template en EmailJS** (documentadas
también en el propio archivo): `to_name`, `to_email`,
`nombre_quien_asigna`, `destino`, `funcion`, `notificaciones_link`. El
contenido, en ese orden, dice quién lo asignó, a qué proyecto o a qué
parte, con qué función, y trae un botón/enlace a `/notificaciones` para
aceptar o rechazar.

**Disparada en los 3 puntos donde hoy se asigna a alguien que ya tiene
cuenta**:
1. Invitación al proyecto y a un nodo desde Configuración → Equipo y
   permisos — ambas comparten un solo call site,
   `GestorUsuariosProyecto.jsx::ModalInvitar::handleInvitar` (el mismo
   modal cubre las dos según `alcance`).
2. Invitación a un nodo desde la pestaña Equipo de Seguimiento
   (`SeccionMiembrosNodo.jsx::confirmarAgregar`) — un call site
   DISTINTO del anterior, mismo efecto. Este componente no recibe el
   nombre del proyecto como prop de ninguno de sus dos padres
   (`NodoCard.jsx`, `PestanasDetalle.jsx`), así que lo pide por su
   cuenta vía `obtenerProyecto(idProyecto)` solo cuando hace falta
   mandar el correo (patrón "self-contenido" ya usado en este archivo).
3. Aceptación de una solicitud de participación
   (`SolicitudesPorResolver.jsx::responder`), solo cuando
   `respuesta === 'aceptar'` — declinar no asigna nada que avisar.

**Un 4to camino existe y se dejó fuera a propósito** (reportado según
lo pedido, no silenciado): `handleCambiarRol`
(`GestorUsuariosProyecto.jsx`, alcance proyecto) y `cambiarRol`
(`SeccionMiembrosNodo.jsx`, alcance nodo) reasignan la función de
alguien que YA ESTÁ ACEPTADO, sin pasar por invitar/aceptar — es un
cambio inmediato (vía `agregarMiembro`/`actualizarRolNodo`, un UPSERT),
no una invitación pendiente. El llamado a la acción del correo
("acepta o rechaza desde tus notificaciones") no tendría sentido ahí:
no hay nada pendiente que aceptar o rechazar, el cambio ya se aplicó.
No se le agregó el correo a este camino.

### 15.3 Verificación pedida: `GET /proyectos/:id/exportar`

Confirmado por lectura directa: `backend/src/routes/index.js` sigue con
`router.get('/proyectos/:id/exportar', exigirVisibilidadProyecto(),
exportarController.exportarProyecto);` — el candado cerrado en la Fase
4/parte A (sección 13.5) sigue en pie, nada lo tocó en esta ronda.
Cubierto por `backend/src/__tests__/exportar-visibilidad.test.js` (de
esa misma parte A), sin cambios.
