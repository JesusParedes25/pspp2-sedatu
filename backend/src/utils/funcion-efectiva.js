/**
 * ARCHIVO: funcion-efectiva.js
 * PROPÓSITO: Resolver, en un solo lugar, qué puede hacer un usuario sobre
 *            un proyecto o un nodo (etapa/acción/tarea) — la escalera
 *            única de función (docs/modelo-permisos.md).
 *
 * MINI-CLASE: por qué una sola función y no una cadena de OR por facultad
 * ─────────────────────────────────────────────────────────────────
 * Antes de esto, cada facultad (editar, eliminar, capturar, invitar)
 * resolvía su propia cadena de condiciones en utils/autorizacion.js, cada
 * una con su propio criterio de cuándo cuenta la DG, cuándo cuenta ser
 * creador, etc. — de ahí salían las inconsistencias documentadas en
 * docs/modelo-permisos.md sección 6. Aquí se resuelve UNA sola pregunta,
 * "¿qué peldaño tiene esta persona sobre este elemento, y por qué vía?",
 * y autorizacion.js solo compara ese peldaño contra un mínimo.
 *
 * LA ESCALERA (de menor a mayor, cada una incluye las de abajo)
 *   lectura      -> ver el elemento y sus descendientes
 *   captura      -> + avance, riesgos, documentos, indicadores, territorio, comentar
 *   responsable  -> + editar ficha, crear/eliminar hijos, invitar
 *   administracion_proyecto -> todo lo anterior en TODO el proyecto, + ficha
 *                    del proyecto y eliminarlo. NUNCA existe a nivel nodo.
 *
 * LAS VÍAS (todas se evalúan, gana la más alta — nunca se restan entre sí)
 *   superadmin         -> administracion_proyecto, sin condición
 *   creador             -> administracion_proyecto del proyecto que creó
 *   invitacion          -> el rol aceptado en nodo_miembros/proyecto_usuarios de ESE elemento
 *   responsable_de_nodo -> ser id_responsable directo del nodo (columna de etapas/acciones/tareas)
 *   herencia             -> lo que resuelva un ascendiente (etapa > acción > subacción > tarea)
 *   proyecto             -> el rol aceptado a nivel de todo el proyecto
 *   ejecutivo_dg         -> responsable (nunca administracion_proyecto) si
 *                           usuario.rol==='ejecutivo' y su DG es la misma
 *                           que proyectos.id_dg_lider — ninguno de los dos
 *                           lados puede ser null para que cuente.
 * ─────────────────────────────────────────────────────────────────
 */
const pool = require('../db/pool');

const PELDANOS = ['lectura', 'captura', 'responsable', 'administracion_proyecto'];

function indice(peldano) {
  return peldano ? PELDANOS.indexOf(peldano) : -1;
}

// Entre dos candidatos (o null), el de peldaño más alto. En empate, gana
// el primero — así los llamadores pueden poner primero la vía más
// específica/explícita (p.ej. una invitación directa) para que le gane a
// una vía genérica (p.ej. el bono de DG) cuando dan el mismo peldaño.
function masAlto(a, b) {
  if (!a) return b;
  if (!b) return a;
  return indice(a.peldano) >= indice(b.peldano) ? a : b;
}

function alcanza(candidato, minimo) {
  return !!candidato && indice(candidato.peldano) >= indice(minimo);
}

// Administración del proyecto no existe a nivel de nodo (regla explícita
// del modelo) — al aplicar una función de alcance-proyecto a un nodo
// puntual, el techo es 'responsable'.
function topeNodo(candidato) {
  if (!candidato) return candidato;
  if (candidato.peldano === 'administracion_proyecto') {
    return { peldano: 'responsable', via: candidato.via };
  }
  return candidato;
}

// Una vez que un candidato viene de un ascendiente, lo que importa para
// quien pregunta es que "lo heredó", no el detalle de cómo lo tenía el
// ascendiente mismo (invitación directa o ser su responsable de nodo) —
// las vías ya genéricas (superadmin, creador, proyecto, ejecutivo_dg) se
// dejan tal cual, porque esas no son "de un nodo en particular".
function comoHeredado(candidato) {
  if (!candidato) return candidato;
  if (candidato.via === 'invitacion' || candidato.via === 'responsable_de_nodo' || candidato.via === 'herencia') {
    return { peldano: candidato.peldano, via: 'herencia' };
  }
  return candidato;
}

// ─── Proyecto ───────────────────────────────────────────────────
async function funcionEfectivaEnProyecto(usuario, idProyecto, db) {
  if (!usuario || !idProyecto) return null;
  if (usuario.rol === 'superadmin') return { peldano: 'administracion_proyecto', via: 'superadmin' };

  const conn = db || pool;
  const { rows } = await conn.query(
    'SELECT id_creador, id_dg_lider FROM proyectos WHERE id = $1', [idProyecto]
  );
  const proyecto = rows[0];
  if (!proyecto) return null;

  if (proyecto.id_creador && usuario.id === proyecto.id_creador) {
    return { peldano: 'administracion_proyecto', via: 'creador' };
  }

  let candidato = null;

  const { rows: filaMiembro } = await conn.query(
    `SELECT rol FROM proyecto_usuarios WHERE id_proyecto = $1 AND id_usuario = $2 AND estado = 'aceptada'`,
    [idProyecto, usuario.id]
  );
  if (filaMiembro[0]) {
    candidato = masAlto(candidato, { peldano: filaMiembro[0].rol, via: 'proyecto' });
  }

  // DG, con null-safety explícito en ambos lados: un id_dg nulo nunca
  // "hace match" contra un id_dg_lider nulo ni contra nada.
  if (
    usuario.rol === 'ejecutivo' &&
    usuario.id_dg != null &&
    proyecto.id_dg_lider != null &&
    usuario.id_dg === proyecto.id_dg_lider
  ) {
    candidato = masAlto(candidato, { peldano: 'responsable', via: 'ejecutivo_dg' });
  }

  return candidato;
}

// ─── Nodo (etapa / accion / subaccion / tarea) ───────────────────
const TABLA_NODO = { etapa: 'etapas', accion: 'acciones', tarea: 'tareas' };

// Datos mínimos de un nodo para resolver su función: quién es su
// id_responsable directo, y cómo subir al siguiente nivel (otro nodo
// padre, o directo al proyecto).
async function datosNodo(tipoNodo, idNodo, conn) {
  if (tipoNodo === 'tarea') {
    const { rows } = await conn.query(
      'SELECT id_responsable, id_accion FROM tareas WHERE id = $1', [idNodo]
    );
    if (!rows[0]) return null;
    return { idResponsable: rows[0].id_responsable, tipoPadre: 'accion', idPadre: rows[0].id_accion, idProyecto: null };
  }
  if (tipoNodo === 'accion') {
    const { rows } = await conn.query(
      'SELECT id_responsable, id_accion_padre, id_etapa, id_proyecto FROM acciones WHERE id = $1', [idNodo]
    );
    const r = rows[0];
    if (!r) return null;
    if (r.id_accion_padre) return { idResponsable: r.id_responsable, tipoPadre: 'accion', idPadre: r.id_accion_padre, idProyecto: null };
    if (r.id_etapa) return { idResponsable: r.id_responsable, tipoPadre: 'etapa', idPadre: r.id_etapa, idProyecto: null };
    return { idResponsable: r.id_responsable, tipoPadre: null, idPadre: null, idProyecto: r.id_proyecto };
  }
  // etapa
  const { rows } = await conn.query(
    'SELECT id_responsable, id_proyecto FROM etapas WHERE id = $1', [idNodo]
  );
  if (!rows[0]) return null;
  return { idResponsable: rows[0].id_responsable, tipoPadre: null, idPadre: null, idProyecto: rows[0].id_proyecto };
}

// El elemento sobre el que hay que evaluar la facultad de "eliminar este
// nodo" o "crear un hijo aquí": no es el nodo mismo, es su padre
// conceptual (otra acción, su etapa dueña, o el proyecto si es un nodo de
// primer nivel) — ver docs/modelo-permisos.md, "crear/eliminar un hijo
// exige responsable EN EL PADRE, no en el hijo".
async function resolverElementoPadre(tipoNodo, idNodo, db) {
  const conn = db || pool;
  const nodo = await datosNodo(tipoNodo, idNodo, conn);
  if (!nodo) return null;
  if (nodo.idPadre) return { tipo: nodo.tipoPadre, id: nodo.idPadre };
  if (nodo.idProyecto) return { tipo: 'proyecto', id: nodo.idProyecto };
  return null;
}

async function funcionEfectivaEnNodo(usuario, tipoNodo, idNodo, db) {
  if (!usuario || !idNodo || !TABLA_NODO[tipoNodo]) return null;
  const conn = db || pool;

  if (usuario.rol === 'superadmin') return { peldano: 'responsable', via: 'superadmin' };

  const nodo = await datosNodo(tipoNodo, idNodo, conn);
  if (!nodo) return null;

  let candidato = null;

  if (nodo.idResponsable && usuario.id === nodo.idResponsable) {
    candidato = masAlto(candidato, { peldano: 'responsable', via: 'responsable_de_nodo' });
  }

  const { rows: filaMiembro } = await conn.query(
    `SELECT rol FROM nodo_miembros
     WHERE tipo_nodo = $1 AND id_nodo = $2 AND id_usuario = $3 AND estado = 'aceptada'`,
    [tipoNodo, idNodo, usuario.id]
  );
  if (filaMiembro[0]) {
    candidato = masAlto(candidato, { peldano: filaMiembro[0].rol, via: 'invitacion' });
  }

  if (nodo.idPadre) {
    const delPadre = await funcionEfectivaEnNodo(usuario, nodo.tipoPadre, nodo.idPadre, conn);
    candidato = masAlto(candidato, comoHeredado(delPadre));
  } else if (nodo.idProyecto) {
    const delProyecto = await funcionEfectivaEnProyecto(usuario, nodo.idProyecto, conn);
    candidato = masAlto(candidato, topeNodo(delProyecto));
  }

  return candidato;
}

// ─── Punto de entrada único ───────────────────────────────────────
// elemento = { tipo: 'proyecto', id } | { tipo: 'etapa'|'accion'|'tarea', id }
async function funcionEfectiva(usuario, elemento, db) {
  if (!elemento) return null;
  if (elemento.tipo === 'proyecto') return funcionEfectivaEnProyecto(usuario, elemento.id, db);
  return funcionEfectivaEnNodo(usuario, elemento.tipo, elemento.id, db);
}

// ─── Versión por lotes: toda la función efectiva de un usuario sobre
// TODOS los nodos de un proyecto, en un puñado de consultas (no una por
// nodo) — la necesita la Fase 3 para pintar el árbol completo de una vez.
// No es literalmente "una sola consulta SQL": carga en bloque las tablas
// (etapas/acciones/tareas/nodo_miembros del proyecto) y resuelve la
// herencia en memoria con recursión memoizada — el costo real es un
// puñado de SELECTs fijo, no N llamadas a la base por nodo.
async function funcionEfectivaPorLotes(usuario, idProyecto, db) {
  const conn = db || pool;
  const vacio = { proyecto: null, etapa: {}, accion: {}, tarea: {} };
  if (!usuario || !idProyecto) return vacio;

  const base = await funcionEfectivaEnProyecto(usuario, idProyecto, conn);

  if (usuario.rol === 'superadmin') {
    const todosLosNodos = await cargarNodosProyecto(idProyecto, conn);
    const resultado = { proyecto: base, etapa: {}, accion: {}, tarea: {} };
    for (const e of todosLosNodos.etapas) resultado.etapa[e.id] = { peldano: 'responsable', via: 'superadmin' };
    for (const a of todosLosNodos.acciones) resultado.accion[a.id] = { peldano: 'responsable', via: 'superadmin' };
    for (const t of todosLosNodos.tareas) resultado.tarea[t.id] = { peldano: 'responsable', via: 'superadmin' };
    return resultado;
  }

  const { etapas, acciones, tareas } = await cargarNodosProyecto(idProyecto, conn);

  // Mapa de asignaciones directas (nodo_miembros aceptadas de este usuario,
  // para cualquier nodo de este proyecto) en una sola consulta.
  const idsEtapa = etapas.map(e => e.id);
  const idsAccion = acciones.map(a => a.id);
  const idsTarea = tareas.map(t => t.id);
  const { rows: miembros } = await conn.query(
    `SELECT tipo_nodo, id_nodo, rol FROM nodo_miembros
     WHERE id_usuario = $1 AND estado = 'aceptada' AND (
       (tipo_nodo = 'etapa'  AND id_nodo = ANY($2::uuid[])) OR
       (tipo_nodo = 'accion' AND id_nodo = ANY($3::uuid[])) OR
       (tipo_nodo = 'tarea'  AND id_nodo = ANY($4::uuid[]))
     )`,
    [usuario.id, idsEtapa, idsAccion, idsTarea]
  );
  const miembroPorNodo = new Map(miembros.map(m => [`${m.tipo_nodo}:${m.id_nodo}`, m.rol]));

  const porId = {
    etapa: new Map(etapas.map(e => [e.id, e])),
    accion: new Map(acciones.map(a => [a.id, a])),
    tarea: new Map(tareas.map(t => [t.id, t])),
  };

  const memo = { etapa: new Map(), accion: new Map(), tarea: new Map() };

  function directoDe(tipo, nodo) {
    let candidato = null;
    if (nodo.id_responsable && usuario.id === nodo.id_responsable) {
      candidato = masAlto(candidato, { peldano: 'responsable', via: 'responsable_de_nodo' });
    }
    const rol = miembroPorNodo.get(`${tipo}:${nodo.id}`);
    if (rol) candidato = masAlto(candidato, { peldano: rol, via: 'invitacion' });
    return candidato;
  }

  function resolverEtapa(id) {
    if (memo.etapa.has(id)) return memo.etapa.get(id);
    const nodo = porId.etapa.get(id);
    if (!nodo) return null;
    const resultado = masAlto(directoDe('etapa', nodo), topeNodo(base));
    memo.etapa.set(id, resultado);
    return resultado;
  }

  function resolverAccion(id) {
    if (memo.accion.has(id)) return memo.accion.get(id);
    const nodo = porId.accion.get(id);
    if (!nodo) return null;
    let delPadre;
    if (nodo.id_accion_padre) delPadre = comoHeredado(resolverAccion(nodo.id_accion_padre));
    else if (nodo.id_etapa) delPadre = comoHeredado(resolverEtapa(nodo.id_etapa));
    else delPadre = topeNodo(base);
    const resultado = masAlto(directoDe('accion', nodo), delPadre);
    memo.accion.set(id, resultado);
    return resultado;
  }

  function resolverTarea(id) {
    if (memo.tarea.has(id)) return memo.tarea.get(id);
    const nodo = porId.tarea.get(id);
    if (!nodo) return null;
    const delPadre = comoHeredado(resolverAccion(nodo.id_accion));
    const resultado = masAlto(directoDe('tarea', nodo), delPadre);
    memo.tarea.set(id, resultado);
    return resultado;
  }

  const resultado = { proyecto: base, etapa: {}, accion: {}, tarea: {} };
  for (const e of etapas) resultado.etapa[e.id] = resolverEtapa(e.id);
  for (const a of acciones) resultado.accion[a.id] = resolverAccion(a.id);
  for (const t of tareas) resultado.tarea[t.id] = resolverTarea(t.id);
  return resultado;
}

async function cargarNodosProyecto(idProyecto, conn) {
  // Recursivo de verdad (no un join de 2 niveles fijos): una subacción
  // puede colgar de otra subacción cualquier número de veces.
  const [{ rows: etapas }, { rows: acciones }] = await Promise.all([
    conn.query('SELECT id, id_responsable FROM etapas WHERE id_proyecto = $1', [idProyecto]),
    conn.query(
      `WITH RECURSIVE arbol AS (
         SELECT id, id_responsable, id_accion_padre, id_etapa, id_proyecto
         FROM acciones
         WHERE id_proyecto = $1 OR id_etapa IN (SELECT id FROM etapas WHERE id_proyecto = $1)
         UNION ALL
         SELECT a.id, a.id_responsable, a.id_accion_padre, a.id_etapa, a.id_proyecto
         FROM acciones a
         JOIN arbol ON a.id_accion_padre = arbol.id
       )
       SELECT DISTINCT id, id_responsable, id_accion_padre, id_etapa, id_proyecto FROM arbol`,
      [idProyecto]
    ),
  ]);
  const idsAccion = acciones.map(a => a.id);
  const { rows: tareas } = idsAccion.length
    ? await conn.query('SELECT id, id_responsable, id_accion FROM tareas WHERE id_accion = ANY($1::uuid[])', [idsAccion])
    : { rows: [] };
  return { etapas, acciones, tareas };
}

module.exports = {
  PELDANOS,
  indice,
  masAlto,
  alcanza,
  topeNodo,
  funcionEfectiva,
  funcionEfectivaEnProyecto,
  funcionEfectivaEnNodo,
  funcionEfectivaPorLotes,
  resolverElementoPadre,
};
