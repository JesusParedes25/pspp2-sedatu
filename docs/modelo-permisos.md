# Modelo de permisos de PSPP v2.0 — inventario con evidencia

> Documento de referencia, leído directamente del código a octubre de
> 2026. Cada afirmación cita archivo y línea. Donde algo no está
> implementado, se dice explícitamente — no se describe la intención
> de diseño como si fuera el comportamiento real.
>
> Rama: `claude/claude-code-orientation-1361da`.

## 0. Resumen ejecutivo (para quien solo lee esto)

- Hay **tres niveles de rol** independientes: perfil institucional
  (`usuarios.rol`), función de proyecto (`proyecto_usuarios.rol`) y
  función de nodo (`nodo_miembros.rol`). No se combinan con una
  jerarquía única: cada facultad concreta (editar, eliminar, invitar,
  capturar) tiene su propia regla de OR entre varias vías.
- La única fuente de verdad en el backend es
  `backend/src/utils/autorizacion.js`. Casi todo lo demás pasa por ahí,
  directamente o a través de `backend/src/middleware/permisos.middleware.js`.
- El hallazgo más importante de la auditoría: el rol de nodo
  `'invitado'` **no restringe nada hoy**. Una persona invitada como
  "invitado" a una etapa puede editar esa etapa exactamente igual que
  un "responsable" o un "colaborador" — el código nunca lee la columna
  `rol` de `nodo_miembros` para decidir si puede capturar, solo si
  `estado = 'aceptada'`.
- Hay dos endpoints con huecos de autorización confirmados:
  `POST /proyectos/:id/imagen` (sin ningún chequeo) y
  `POST /proyectos` crear (sin el bloqueo a `rol = 'externo'` que sí
  tiene su endpoint hermano `duplicar`).
- Hay tres implementaciones independientes de "a qué proyectos tiene
  acceso este usuario" (Tablero, Evidencias, Territorio) que no
  coinciden entre sí para el rol `'direccion'`.
- Hay código muerto real: la columna `usuarios.rol_global`, la función
  `miembros.queries.js::tieneAcceso`, y toda la tabla
  `proyecto_invitaciones` con sus 3 funciones de controller
  (`listarInvitaciones`, `aceptarInvitacion`, `cancelarInvitacion`) —
  implementadas de punta a punta en el backend, sin ningún llamador en
  el frontend más allá de su propio wrapper de API.

---

## 1. Los tres niveles de rol

### 1.1 `usuarios.rol` — perfil institucional

Valores válidos, CHECK actual (`backend/src/db/migrations/034_roles.sql:27-29`):

```sql
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('superadmin', 'ejecutivo', 'direccion', 'enlace', 'externo'));
```

Este es el esquema vigente desde la migración 034 (renombró un esquema
anterior en mayúsculas: `Ejecutivo`/`Directivo`/`Responsable`/`Operativo`
→ `ejecutivo`/`direccion`/`enlace` — `034_roles.sql:10-12`). No hay
jerarquía entre estos cinco valores a nivel de columna; la jerarquía
real (quién manda sobre qué) vive en `autorizacion.js`, descrita en la
sección 4.

Qué otorga cada uno, con evidencia:

- **`superadmin`** — sin límites. `puedeGestionarProyecto` retorna
  `true` para cualquier proyecto sin más condición
  (`backend/src/utils/autorizacion.js:65`). Administra catálogos
  institucionales, papelera de proyectos (30 días, restaurar/purgar),
  configuración del sistema. Es el único rol que puede editar entradas
  del catálogo de indicadores (`requiereRol(['superadmin'])` en
  `backend/src/routes/catalogo-indicadores.routes.js:33-34`).
- **`ejecutivo`** — alcance de SECRETARÍA completa para ver y para
  gestionar participantes, pero NO para editar/eliminar fuera de su
  propia DG. `puedeGestionarParticipantes` le da `true` incondicional
  (`autorizacion.js:123`); `puedeGestionarProyecto`/`puedeEditarProyecto`
  solo si además `usuario.id_dg === proyecto.id_dg_lider`, es creador,
  o es responsable de proyecto (`autorizacion.js:74`). En Tablero/Inicio
  ve TODOS los proyectos no cancelados sin necesidad de ser miembro de
  ninguno (`alcanceProyectosUsuario`, `backend/src/utils/alcanceProyectos.js:24-31`).
- **`direccion`** — manda sobre los proyectos liderados por su propia
  DG (editar, capturar, gestionar participantes), pero NO los puede
  eliminar salvo que además sea su creador o su responsable de
  proyecto (`puedeEditarProyecto` lo incluye en la línea 99-104 de
  `autorizacion.js`; `puedeGestionarProyecto`, usada para eliminar, NO
  lo incluye — solo superadmin/creador/ejecutivo-de-su-DG/responsable,
  líneas 63-78). Para VER proyectos fuera de su DG en Tablero, depende
  de si está escrito como miembro — no tiene el mismo "ve todo" que
  ejecutivo (ver sección 3, inconsistencia de alcance).
- **`enlace`** — "captura y da seguimiento a los proyectos en los que
  participa" (comentario de cabecera de `usePermisos.js:13-14`). Sin
  ninguna vía institucional de alcance amplio: solo lo que gana por ser
  creador, responsable de proyecto, o miembro aceptado de
  proyecto/nodo.
- **`externo`** — mismo alcance que `enlace` en captura (participa
  solo en lo asignado), pero con dos restricciones adicionales
  explícitas en el código: no puede crear proyectos
  (`proyectos.controller.js::duplicar`, líneas 147-153 — bloqueo
  presente ahí, ausente en `crear`, ver hallazgo 6.2) y es la única
  categoría de usuario a la que tiene sentido asignar el rol de nodo
  `'invitado'` (`nodo-miembros.controller.js::invitadoSoloParaExternos`,
  líneas 136-142).

Dato muerto relacionado: existe también una columna `usuarios.rol_global`
(`backend/src/db/migrations/032_rol_global_y_miembros_demo.sql:7`),
agregada en un intento anterior y nunca usada por ningún código actual
— ver hallazgo 6.1.

### 1.2 `proyecto_usuarios.rol` — función en UN proyecto

CHECK actual (`backend/src/db/migrations/030_proyecto_usuarios.sql:12,29`):

```sql
rol VARCHAR(20) NOT NULL CHECK (rol IN ('responsable','colaborador'))
```

Solo dos valores — no existe un tercer valor de solo-lectura a nivel
de proyecto completo (a diferencia del nivel de nodo, que sí tiene
`'invitado'`).

- **`responsable`** — además de capturar, hereda las facultades de
  `puedeGestionarProyecto` (`autorizacion.js:76-77`: si
  `obtenerRolUsuario` devuelve `'responsable'`, puede gestionar/eliminar)
  y de `puedeEditarProyecto` (vía la misma cadena, porque
  `puedeEditarProyecto` llama primero a `puedeGestionarProyecto`,
  `autorizacion.js:97`). Un proyecto no puede quedarse sin al menos un
  responsable aceptado — `esUnicoResponsable`
  (`backend/src/db/queries/miembros.queries.js:104-113`) bloquea
  quitar, degradar o auto-retirar al último.
- **`colaborador`** — solo capturar
  (`puedeEditarContenidoProyecto`, vía la vía 2 de la línea 150-151:
  "estar en proyecto_usuarios, sea como responsable o colaborador").
  No gestiona participantes, no edita la ficha general, no elimina.

Solo cuenta si `estado = 'aceptada'` —
`obtenerRolUsuario` (`miembros.queries.js:126-133`) filtra por eso
explícitamente, con el comentario: *"Solo cuenta si aceptó: una
invitación pendiente o rechazada no da permisos"*.

### 1.3 `nodo_miembros.rol` — función en UNA etapa/acción/tarea

CHECK actual (`backend/src/db/migrations/033_nodo_miembros.sql:10-11`):

```sql
rol TEXT NOT NULL DEFAULT 'colaborador'
  CHECK (rol IN ('responsable', 'colaborador', 'invitado'))
```

- **`responsable`** / **`colaborador`** — en la práctica, **el código
  no distingue entre estos dos valores para decidir capacidad de
  edición**. `esMiembroDelNodo` (`autorizacion.js:162-173`) solo
  verifica `estado = 'aceptada'`, nunca lee `rol`. La distinción
  responsable/colaborador a nivel de nodo hoy es puramente descriptiva
  (aparece en pantalla, en notificaciones) — no activa ni desactiva
  ninguna facultad.
- **`invitado`** — **ver hallazgo central, sección 6.1**: pese a la
  intención documentada en el propio código ("ver sin capturar",
  `nodo-miembros.controller.js:131-135`), hoy otorga exactamente las
  mismas capacidades de captura que responsable/colaborador, por la
  misma razón: `esMiembroDelNodo` no lee `rol`. Lo único que de verdad
  distingue a `'invitado'` hoy es QUIÉN puede recibirlo: solo un
  usuario con `usuarios.rol = 'externo'`
  (`invitadoSoloParaExternos`, `nodo-miembros.controller.js:136-142`,
  aplicado en `agregar` línea 177-180 y en `actualizar` línea 233-236).

Al igual que a nivel de proyecto, solo cuenta con `estado = 'aceptada'`
(`autorizacion.js:169`, `nodo-miembros.queries.js:168`).

---

## 2. Cómo se combinan los tres niveles

**No hay una jerarquía única "si hay conflicto, gana X".** Cada
facultad (gestionar, editar, editar contenido/capturar, gestionar
participantes) es una función independiente en `autorizacion.js`, y
cada una resuelve su propio OR de vías. No existe ningún punto del
código que compare "rol de proyecto vs. rol de nodo" y decida un
ganador — porque nunca se excluyen: todas las vías que aplican SUMAN
acceso, ninguna resta.

El orden real, función por función (es un árbol de "cualquiera de
estas basta", no una prioridad descendente):

- **`puedeGestionarProyecto`** (`autorizacion.js:63-78`) — ¿puede
  eliminar o gestionar lo irreversible?
  1. `usuario.rol === 'superadmin'` → sí, sin más.
  2. `usuario.id === proyecto.id_creador` → sí.
  3. `usuario.rol === 'ejecutivo'` Y `usuario.id_dg` coincide con
     `proyecto.id_dg_lider` → sí.
  4. `proyecto_usuarios.rol === 'responsable'` (aceptado) → sí.
  5. Si ninguna aplica → no. (`direccion` NO está en esta lista —
     por diseño: puede editar pero no eliminar, ver más abajo.)
- **`puedeEditarProyecto`** (`autorizacion.js:94-108`) — ¿puede editar
  la ficha?
  1. Todo lo que ya cubre `puedeGestionarProyecto` → sí.
  2. Si no, y `usuario.rol === 'direccion'` Y `usuario.id_dg` coincide
     con `proyecto.id_dg_lider` → sí.
  3. Si no → no.
- **`puedeGestionarParticipantes`** (`autorizacion.js:121-125`) — ¿puede
  invitar/retirar/cambiar de función a alguien del proyecto?
  1. `usuario.rol === 'ejecutivo'` → sí, incondicional, **sin
     necesitar ser de la misma DG** (es la única facultad de alcance
     total que `ejecutivo` conserva).
  2. Si no, delega a `puedeEditarProyecto` (creador, responsable,
     superadmin, direccion-de-la-misma-DG).
- **`puedeEditarContenidoProyecto`** (`autorizacion.js:146-152`) — ¿puede
  capturar (crear etapas, mover avances) en el proyecto completo?
  1. Todo lo que cubre `puedeEditarProyecto` → sí.
  2. Si no, ¿tiene CUALQUIER fila aceptada en `proyecto_usuarios`
     (responsable o colaborador)? → sí.
  3. Si no → no. **Pertenecer a la DG que lidera el proyecto, sin
     estar invitado, NO alcanza** — comentario explícito en
     `autorizacion.js:138-145`: antes sí alcanzaba y se corrigió a
     propósito.
- **`puedeEditarNodo`** (`autorizacion.js:201-208`) — ¿puede capturar
  en ESTE nodo puntual?
  1. ¿Puede capturar en todo el proyecto (`puedeEditarContenidoProyecto`)?
     → sí, sin mirar el nodo.
  2. Si no, ¿es responsable/colaborador/invitado ACEPTADO de este nodo
     o de alguno de sus ascendientes (etapa → acción padre → acción
     raíz)? (`esMiembroDelNodoOAscendiente`, líneas 177-197) → sí.
  3. Si no → no.

**¿Un perfil institucional alto da acceso a proyectos donde la persona
no es miembro?** Sí, pero solo dos perfiles y bajo condiciones
exactas:

- `superadmin` — siempre, para gestionar/editar/capturar/eliminar
  cualquier proyecto.
- `ejecutivo` — para gestionar participantes, siempre (sin condición
  de DG); para editar/capturar/eliminar, SOLO si
  `usuario.id_dg === proyecto.id_dg_lider` (y además necesita tener
  `id_dg` capturado — un ejecutivo sin DG asignada no gana nada por
  esta vía, comentario explícito en `autorizacion.js:56-59`).
- `direccion` — para editar/capturar, SOLO si
  `usuario.id_dg === proyecto.id_dg_lider`. Para eliminar, NUNCA por
  esta sola vía (tendría que ser además creador o responsable).
- `enlace`/`externo` — ninguno: sin ser creador/responsable/colaborador/
  miembro de nodo, cero acceso de edición. (Para VER el proyecto, la
  visibilidad es total para cualquier rol autenticado — ver sección 5,
  fila "ver el proyecto".)

**Ver (leer) nunca entra en este árbol.** `listar`/`obtenerPorId`
(`proyectos.controller.js:43-116`) no aplican ningún filtro de
permiso — visibilidad total deliberada, confirmada por el comentario
de `listar` línea 61-64 ("no es un control de acceso: la visibilidad
sigue siendo total"). Lo que cambia por rol es solo CUÁLES proyectos
aparecen agregados en pantallas como Tablero (ver sección 3), no si un
proyecto puntual es visible al entrar por su URL directa.

---

## 3. El recorte por DG y Dirección de Área

**Qué roles usan el recorte por DG, y contra qué campo exactamente**:
solo `ejecutivo` y `direccion`, y solo contra
`proyectos.id_dg_lider` comparado contra `usuario.id_dg` (JWT, ver
sección de JWT abajo) — nunca contra ninguna otra tabla de DGs del
proyecto. El recorte aparece en 3 funciones de `autorizacion.js`:
`puedeGestionarProyecto:74`, `puedeEditarProyecto:99-104`, y por
herencia en `puedeEditarContenidoProyecto`/`puedeEditarNodo`.

**Qué papel juega `id_direccion_area`**: ninguno. Se decodifica del
JWT (`auth.middleware.js:44`: `id_direccion_area: decoded.id_direccion_area`)
y se transporta en `req.usuario`, pero **ningún archivo de autorización
lo lee para decidir una capacidad** — confirmado por búsqueda en todo
`backend/src/utils/autorizacion.js`, `permisos.middleware.js`,
`alcanceProyectos.js`, `evidencias.controller.js` y `geo.controller.js`:
ninguno contiene `id_direccion_area`. Dirección de Área es hoy un dato
exclusivamente informativo/de catálogo (aparece en fichas de
etapa/acción vía `instancia_responsable`, un campo de texto no
relacionado con permisos), nunca un criterio de alcance.

**Hallazgo: el recorte NO es el mismo en los tres agregados cruzados
de proyectos que existen hoy** (ampliado con evidencia en 6.3, aquí
solo la mecánica):

| Resolver | `superadmin`/`ejecutivo` | `direccion` | resto |
|---|---|---|---|
| `alcanceProyectos.js::alcanceProyectosUsuario` (Tablero/Inicio, líneas 23-34) | todos los no-cancelados | **solo los que ya es miembro** (`obtenerProyectosUsuario`) — SIN bonus de DG | solo miembro |
| `evidencias.controller.js::resolverProyectoIdsAcceso` (líneas 25-32) | todos (`null`) | **todos los de su DG líder**, aunque no sea miembro de ninguno | solo miembro |
| `geo.controller.js::resolverProyectoIds` (líneas 107-110) | todos (`null`) | **solo los que ya es miembro** — SIN bonus de DG | solo miembro |

Es decir: un usuario `direccion` que NO está escrito como miembro de
ningún proyecto de su propia DG hoy **ve** el agregado de evidencias
de toda su DG, pero **no ve** esos mismos proyectos en el Tablero ni
en el drill-down de Territorio. El propio código de
`alcanceProyectos.js` ya documenta que es intencional que sean "dos
contratos distintos, no se tocan ni se unifican" (líneas 14-17) — pero
eso describe por qué no se unificaron técnicamente, no si el resultado
visible al usuario es coherente. Ver 6.3.

---

## 4. La tabla de funciones de `autorizacion.js`

Archivo completo: `backend/src/utils/autorizacion.js` (236 líneas, 10
funciones: 8 exportadas, 2 helpers internos).

- `obtenerProyectoIdDeNodo(tipoNodo, idNodo, db)` (líneas 27-47) → resuelve
  recursivamente el `id_proyecto` dueño de una etapa, acción/subacción
  o tarea, subiendo por `id_etapa`/`id_accion_padre`/`id_accion` según
  el tipo.
- `puedeGestionarProyecto({usuario, idProyecto}, db)` (líneas 63-78) →
  true si superadmin, o creador del proyecto, o ejecutivo de la misma
  DG que lidera el proyecto, o responsable aceptado en
  `proyecto_usuarios`.
- `puedeEditarProyecto({usuario, idProyecto}, db)` (líneas 94-108) →
  true si `puedeGestionarProyecto`, o si es `direccion` de la misma DG
  que lidera el proyecto.
- `puedeGestionarParticipantes({usuario, idProyecto}, db)` (líneas
  121-125) → true si es `ejecutivo` (sin condición de DG), o si
  `puedeEditarProyecto`.
- `puedeEditarContenidoProyecto({usuario, idProyecto}, db)` (líneas
  146-152) → true si `puedeEditarProyecto`, o si tiene cualquier fila
  aceptada en `proyecto_usuarios` (responsable o colaborador).
- `esMiembroDelNodo({usuario, tipoNodo, idNodo}, conn)` (líneas
  162-173, NO exportada) → true si es `id_responsable` directo del
  nodo, o tiene fila aceptada en `nodo_miembros` para ESE nodo exacto
  (sin importar el valor de `rol`).
- `esMiembroDelNodoOAscendiente({usuario, tipoNodo, idNodo}, conn)`
  (líneas 177-197, NO exportada) → true si `esMiembroDelNodo` en este
  nodo, o recursivamente en algún ascendiente (tarea→acción,
  acción-hija→acción-padre, acción-raíz→etapa).
- `puedeEditarNodo({usuario, tipoNodo, idNodo}, db)` (líneas 201-208) →
  true si `puedeEditarContenidoProyecto` del proyecto dueño, o
  `esMiembroDelNodoOAscendiente` de este nodo.
- `puedeGestionarNodo({usuario, tipoNodo, idNodo}, db)` (líneas
  212-216) → resuelve el proyecto dueño y delega a
  `puedeGestionarProyecto` (eliminar un nodo exige la misma facultad
  que eliminar el proyecto — no hay una vía de "soy responsable solo
  de este nodo" para borrarlo).
- `puedeGestionarParticipantesNodo({usuario, tipoNodo, idNodo}, db)`
  (líneas 220-224) → resuelve el proyecto dueño y delega a
  `puedeGestionarParticipantes`.

---

## 5. La matriz de acciones

Leyenda: **Sí** = permitido sin condición adicional para ese rol.
**No** = nunca permitido para ese rol por esa vía.
**Depende** = condición exacta anotada.

| Acción | superadmin | ejecutivo | direccion (misma DG) | responsable de proyecto | colaborador de proyecto | responsable/colaborador de nodo | invitado de nodo | enlace/externo sin ninguna asignación |
|---|---|---|---|---|---|---|---|---|
| Crear proyecto | Sí | Sí | Sí | — | — | — | — | Depende: `externo` **no bloqueado hoy** (hallazgo 6.2) |
| Ver un proyecto (por URL directa) | Sí | Sí | Sí | Sí | Sí | Sí | Sí | **Sí — visibilidad total, sin excepción** |
| Editar ficha del proyecto | Sí | Depende: solo su DG líder | Sí (es la vía que lo habilita) | Sí | No | No | No | No |
| Eliminar proyecto | Sí | Depende: solo su DG líder | **No** (a menos que sea también creador/responsable) | Sí | No | No | No | No |
| Crear etapa / acción (a nivel proyecto) | Sí | Depende: su DG líder | Depende: su DG líder | Sí | Sí | — | — | No |
| Editar etapa / acción puntual | Sí | Depende: su DG líder, o vía nodo | Depende: su DG líder, o vía nodo | Sí | Sí | **Sí (rol no importa, ver 6.1)** | **Sí hoy (debería ser No, ver 6.1)** | No |
| Eliminar etapa / acción | Sí | Depende: su DG líder | **No** (misma regla que eliminar proyecto) | Sí | No | No | No | No |
| Registrar avance | Igual que "editar etapa/acción" | | | | | | | |
| Reportar riesgo | Igual que "editar etapa/acción" (vía `exigirEdicionDeEntidadEnCuerpo`, `permisos.middleware.js:98-111`) | | | | | | | |
| Adjuntar documento | Igual que "editar etapa/acción" (vía `exigirEdicionEvidencia`, `permisos.middleware.js:141-156`) | | | | | | | |
| Vincular indicador — **definir/editar la meta del indicador** | Sí | Depende: su DG líder | Depende: su DG líder | Sí | Sí | No (es del proyecto, no del nodo — `exigirEdicionIndicador`, `permisos.middleware.js:160-163`) | No | No |
| Vincular indicador — **que un nodo aporte** (`indicador_aportaciones`) | Sí | Depende | Depende | Sí | Sí | Sí (rol no importa) | Sí hoy (debería ser No) | No |
| Invitar a un nodo (etapa/acción/tarea) | Sí | Sí | Depende: su DG líder, o responsable/colaborador de ese nodo | Sí | No (a menos que además sea responsable/colaborador de ese nodo específico) | Depende: requiere `puedeGestionarParticipantesNodo`, no basta con ser miembro del nodo | No | No |
| Invitar al proyecto completo | Sí | Sí (sin condición de DG) | Depende: su DG líder | Sí | No | — | — | No |
| Cambiar permisos de otros (rol de un miembro) | Sí | Sí | Depende: su DG líder | Sí | No | No (solo quien gestiona participantes del nodo) | No | No |
| Importar Excel (crear estructura masiva) | Sí | Depende: su DG líder | Depende: su DG líder | Sí | Sí | — | — | No — mismo gate que capturar (`rechazarSiNoPuedeCapturar`, `importar.controller.js`) |
| Exportar | Sí | Sí | Sí | Sí | Sí | Sí | Sí | **Sí — sin restricción, mismo criterio que ver** (`exportar.controller.js`, comentario de cabecera explícito) |
| Ver el proyecto (repetido para contraste) | Sí | Sí | Sí | Sí | Sí | Sí | Sí | Sí |

Notas de lectura de la matriz:

- La fila "editar etapa/acción puntual" para `responsable/colaborador/invitado de nodo` es la fila donde vive el hallazgo central (6.1): la columna `rol` de `nodo_miembros` no se consulta — las tres celdas deberían leerse distintas y hoy son idénticas.
- "Importar Excel" y "capturar" comparten exactamente la misma puerta
  (`puedeEditarContenidoProyecto` vía `rechazarSiNoPuedeCapturar`,
  confirmado en `importar.controller.js`) — no hay un permiso de
  importación separado.
- "Exportar" es deliberadamente abierto a cualquier usuario autenticado,
  igual que "ver" — confirmado por el comentario de cabecera de
  `backend/src/controllers/exportar.controller.js`.

---

## 6. Lo que está mal o inconsistente

### 6.1 Roles que existen en BD/UI pero no cambian comportamiento

- **`nodo_miembros.rol = 'invitado'`** — el hallazgo principal de esta
  auditoría. `esMiembroDelNodo` (`autorizacion.js:162-173`) decide
  acceso de edición únicamente por `estado = 'aceptada'`; nunca
  compara `rol`. Un `'invitado'` aceptado edita el nodo exactamente
  igual que un `'responsable'` o `'colaborador'` aceptados. La
  intención de diseño está documentada en el propio código
  (`nodo-miembros.controller.js:131-135`: *"la función 'invitado' —ver
  sin capturar— existe para personas ajenas a la Secretaría"*), pero
  el enforcement correspondiente nunca se implementó. Lo único
  restringido hoy sobre `'invitado'` es quién puede recibirlo
  (`invitadoSoloParaExternos`), no qué puede hacer una vez aceptada la
  invitación.
- **`usuarios.rol_global`** — columna agregada en
  `032_rol_global_y_miembros_demo.sql:7`, poblada ahí mismo para unos
  correos específicos (líneas 10-18), y nunca leída por ningún archivo
  de autorización, controller o query actual (confirmado por búsqueda
  en todo `backend/src/`). El rol real y vigente es `usuarios.rol`
  (renombrado en la migración 034, posterior a la 032). Candidata a
  retirarse en una migración futura — no se toca en esta auditoría
  (instrucción explícita: solo inventariar).
- **`miembros.queries.js::tieneAcceso(proyectoId, usuario)`** (líneas
  139-149) — función completa, correctamente escrita, exportada
  (línea 298), pero sin ningún llamador en todo el backend (confirmado
  por búsqueda de `tieneAcceso(` fuera de su propia definición y
  export). La verificación real de acceso para edición pasa por
  `autorizacion.js`, no por esta función.
- **La tabla `proyecto_invitaciones` y su flujo por token** — existe
  de punta a punta en el backend: tabla (`030_proyecto_usuarios.sql`),
  queries `crearInvitacion`/`listarInvitaciones`/`aceptarInvitacion`/
  `cancelarInvitacion` (`miembros.queries.js:153-230`), controllers
  (`miembros.controller.js:218-246`), rutas
  (`GET/POST /proyectos/:id/invitaciones`, `POST /invitaciones/:token/aceptar`,
  `DELETE /invitaciones/:id` — `backend/src/routes/index.js:286-289`),
  y wrappers de API en el frontend
  (`frontend/src/api/miembros.js:18,28,33`). **Confirmado por grep en
  todo `frontend/src`: `listarInvitaciones`, `aceptarInvitacion` y
  `cancelarInvitacion` no tienen ningún llamador fuera de su propia
  definición en el archivo de API.** El flujo real de invitación que
  usa la interfaz (`GestorUsuariosProyecto.jsx:23,115,434`) es
  `crearInvitacion` apuntando a `POST /proyectos/:id/invitaciones`
  (`miembros.controller.js:190-215`), que agrega al usuario
  DIRECTAMENTE a `proyecto_usuarios` en estado `pendiente` — un
  mecanismo totalmente distinto, sin token, sin correo, que nunca
  toca la tabla `proyecto_invitaciones`. Es decir: hay dos sistemas de
  invitación a nivel de proyecto construidos en paralelo, y solo uno
  está vivo. El otro (con token, pensado para invitar por correo a
  alguien posiblemente sin cuenta aún) es código completo y huérfano.

### 6.2 Chequeos hechos solo en el frontend, no en el backend

- **`POST /proyectos` (crear proyecto)** — `proyectos.controller.js::crear`
  (líneas 119-139) no verifica `req.usuario.rol` en absoluto. Su
  endpoint hermano, `duplicar` (líneas 145-153), SÍ bloquea
  explícitamente `rol === 'externo'` antes de proceder. El frontend
  oculta el botón de crear para `externo`
  (`usePermisosGlobales`, `frontend/src/hooks/usePermisos.js:56`:
  `puedeCrearProyecto: rol !== 'externo'`), pero un usuario `externo`
  que llame `POST /proyectos` directo con su sesión válida sí puede
  crear un proyecto hoy. No hay ninguna otra ruta protegida a nivel de
  middleware para este endpoint (confirmado en
  `backend/src/routes/proyectos.routes.js`: el único `requiereRol` del
  archivo protege las rutas de papelera, no `POST /`).
- **`POST /proyectos/:id/imagen` (subir imagen de portada)** —
  `proyectos.controller.js::subirImagen` (líneas 354-379) no tiene
  ningún chequeo de permiso, ni inline ni de middleware (confirmado:
  no aparece en la lista de rutas protegidas de
  `proyectos.routes.js`, y la función no llama a ninguna de las
  funciones de `autorizacion.js`). Cualquier usuario autenticado puede
  reemplazar la imagen de portada de cualquier proyecto llamando al
  endpoint directo, sin pasar por la UI (que sí la oculta a quien no
  puede editar la ficha).
- El resto de los endpoints de escritura sobre proyectos/nodos
  (actualizar, eliminar, los 15 endpoints que cubre
  `permisos.middleware.js`, comentarios, riesgos, evidencias,
  indicadores, aportaciones, miembros de proyecto y de nodo) SÍ están
  protegidos en el servidor — confirmado archivo por archivo durante
  esta auditoría. Estos dos son los únicos huecos reales encontrados.

### 6.3 La misma decisión resuelta en dos lugares distintos, con lógica distinta

Documentado con mecánica completa en la sección 3. Resumen del
problema: **"¿a qué proyectos tiene acceso un usuario `direccion` que
no es miembro de ninguno de ellos?"** tiene tres respuestas distintas
hoy, según qué pantalla se pregunte:

- Tablero/Inicio (`alcanceProyectos.js:23-34`) → ninguno (solo ve los
  que ya es miembro).
- Evidencias (`evidencias.controller.js:25-32`) → todos los de su DG
  líder.
- Territorio (`geo.controller.js:107-110`) → ninguno (igual que
  Tablero).

El propio código de `alcanceProyectos.js` (líneas 14-17) ya documenta
que Territorio y Tablero son "dos contratos distintos" a propósito —
pero esa nota no contempla que el de Evidencias sea un tercer
contrato, con un comportamiento de negocio opuesto (SÍ otorga el
bono de DG) al de los otros dos. No hay evidencia de que esta
diferencia haya sido una decisión de producto explícita — tiene más
forma de deriva: cada módulo se construyó por separado y nadie volvió
a unificarlos.

Caso adicional, mismo tipo de problema pero de estilo, no de lógica
divergente: `DELETE /etapas/:id`, `DELETE /acciones/:id` no usan
`permisos.middleware.js` como el resto de las rutas de nodos — el
propio archivo de rutas trae un comentario anotando "verifica adentro"
(`etapas.routes.js`, `acciones.routes.js`, `tareas.routes.js`), y en
efecto `puedeGestionarNodo` se llama inline dentro del controller en
vez de como middleware de ruta. El resultado final es el mismo
permiso, solo que un lector que solo mire el archivo de rutas (como sí
puede hacerlo para el resto de los endpoints, ver el comentario de
cabecera de `permisos.middleware.js:19-21`) no lo detecta ahí — tiene
que entrar al controller.

### 6.4 Textos de interfaz que describen un permiso que el código no aplica

- **"Ver sin capturar" (`'invitado'`)** — es el caso más importante,
  ya cubierto en 6.1: la UI y los comentarios del propio backend
  describen una restricción de solo-lectura que el enforcement real no
  aplica.
- **`roles.middleware.js`** (líneas 5-13) — el comentario de cabecera
  del archivo describe explícitamente una jerarquía de 4 roles
  ("Ejecutivo > Directivo > Responsable > Operativo") que **no
  corresponde al esquema vigente** (`superadmin`/`ejecutivo`/
  `direccion`/`enlace`/`externo`, migración 034, posterior a cuando se
  escribió ese comentario). La función real, `requiereRol` (líneas
  17-38), tampoco implementa ninguna jerarquía — es una whitelist
  plana (`rolesPermitidos.includes(req.usuario.rol)`), así que ni
  siquiera el comportamiento real coincide con lo que el comentario
  describe. Es documentación obsoleta, no una divergencia de
  comportamiento con impacto de seguridad (el uso real de este
  middleware en rutas, confirmado, se limita a proteger la papelera de
  proyectos y endpoints de administración con listas explícitas, no
  con la jerarquía descrita).

---

## 7. Qué falta (lista de producto, sin implementar)

- **Enforcement real de `'invitado'` como solo-lectura a nivel de
  nodo.** Es el hueco de mayor impacto encontrado — sin esto, el rol
  no cumple su propósito declarado para colaboración con otras
  dependencias.
- **Revalidación de rol/DG sin depender de un nuevo login.** El JWT
  (`auth.middleware.js:39-46`) congela `rol`/`id_dg` al momento de
  iniciar sesión; un cambio de rol o de DG hecho por un superadmin no
  tiene efecto hasta que la persona vuelva a iniciar sesión — en una
  plataforma institucional donde los cambios de puesto son frecuentes,
  esto puede dejar a alguien con permisos viejos (de más o de menos)
  durante un tiempo indefinido.
- **Unificar los tres resolvers de alcance** (Tablero/Evidencias/
  Territorio) detrás de una sola función con una sola regla para
  `direccion`, o documentar explícitamente por qué deben diferir —
  hoy la diferencia no está justificada en ningún lado, solo
  constatada por el código.
- **Un permiso de solo-lectura explícito para quien tiene un riesgo
  asignado fuera de su alcance normal.** Hoy, `id_responsable` de un
  riesgo puede ser cualquier usuario de la plataforma sin requerir que
  sea miembro del proyecto/nodo (`ModalRiesgo.jsx`, selector sin
  filtrar por proyecto) — la persona puede responder al riesgo
  (`responderAsignacion`, verificado seguro contra su propio id), pero
  no tiene ninguna vía de acceso de lectura al nodo completo donde
  vive ese riesgo para entender el contexto antes de responder.
- **Bitácora de cambios de permiso en sí mismos** (quién le cambió el
  rol a quién, cuándo) a nivel de proyecto — existe para nodo
  (`registrarActividadEquipoNodo`, `nodo-miembros.controller.js:45-56`,
  agrega/actualiza/elimina), pero no hay un registro equivalente en
  `miembros.controller.js` para cambios de rol a nivel de proyecto
  completo (`agregarMiembro`/`eliminarMiembro` registran actividad
  genérica de "miembro agregado/eliminado", pero no un cambio de rol
  de alguien que ya era miembro).
- **Retirar o reactivar el flujo de `proyecto_invitaciones`
  (hallazgo 6.1).** Como está hoy, es código completo y sin uso real:
  `POST /invitaciones/:token/aceptar` sigue exigiendo una sesión válida
  (`verificarToken` se aplica a todas las rutas salvo `/auth/login`,
  comentario de cabecera de `backend/src/routes/index.js:12`), pero
  cualquier usuario autenticado que obtenga o adivine el token puede
  aceptar esa invitación para sí mismo — no se verificó a fondo si el
  token es suficientemente largo/impredecible para considerarse
  seguro por diseño, precisamente porque nadie lo usa. Mantener vivo
  un segundo sistema de invitación sin revisión periódica es riesgo de
  mantenimiento, no solo código muerto inofensivo.
