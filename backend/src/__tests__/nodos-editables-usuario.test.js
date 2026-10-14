/**
 * ARCHIVO: nodos-editables-usuario.test.js
 * PROPÓSITO: Fase 3 del modelo de permisos (docs/modelo-permisos.md,
 *            "estado de consulta en la interfaz") — `nodosEditablesUsuario`
 *            dejó de reimplementar la escalera a mano y pasó a delegar en
 *            `funcionEfectivaPorLotes` (ver cabecera de permisos.queries.js).
 *            Esta suite prueba el resultado de esa delegación, no la
 *            escalera en sí (eso ya lo cubre funcion-efectiva.test.js) —
 *            en particular el caso que motivó el cambio: un usuario
 *            asignado a una acción pero NO a la etapa que la contiene
 *            debe ver la acción editable y la etapa NO, sin que uno
 *            contamine al otro.
 *
 * No se mockea funcion-efectiva.js — se usa su implementación real, para
 * que esta suite sea la prueba de que ambas capas (el candado de Fase 3 y
 * el rechazo real de escritura) comparten exactamente la misma fuente.
 * Solo se mockea ../db/pool.
 *
 * Ejecutar: npm test
 */

const UUID_PROYECTO = '00000000-0000-0000-0000-000000000003';
const UUID_ETAPA = '00000000-0000-0000-0000-000000000004';
const UUID_ACCION = '00000000-0000-0000-0000-000000000005';
const UUID_TAREA = '00000000-0000-0000-0000-000000000007';
const UUID_USUARIO = '00000000-0000-0000-0000-0000000000aa';

let fixture;

const mockQuery = jest.fn(async (sql) => {
  if (sql.includes('FROM proyectos')) return { rows: fixture.proyecto ? [fixture.proyecto] : [] };
  if (sql.includes('FROM proyecto_usuarios')) return { rows: [] };
  if (sql.includes('FROM tareas')) return { rows: fixture.tareas || [] };
  if (sql.includes('FROM acciones')) return { rows: fixture.acciones || [] };
  if (sql.includes('FROM etapas')) return { rows: fixture.etapas || [] };
  if (sql.includes('FROM nodo_miembros')) return { rows: fixture.nodoMiembros || [] };
  throw new Error(`Consulta no mockeada: ${sql}`);
});

jest.mock('../db/pool', () => ({ query: (...args) => mockQuery(...args) }));

const { nodosEditablesUsuario } = require('../db/queries/permisos.queries');

beforeEach(() => {
  jest.clearAllMocks();
  fixture = {
    proyecto: { id_creador: null, id_dg_lider: null },
    etapas: [{ id: UUID_ETAPA, id_responsable: null }],
    acciones: [{ id: UUID_ACCION, id_responsable: null, id_accion_padre: null, id_etapa: UUID_ETAPA, id_proyecto: null }],
    tareas: [{ id: UUID_TAREA, id_responsable: null, id_accion: UUID_ACCION }],
    nodoMiembros: [],
  };
});

test('sin usuario o sin proyecto: listas vacías, sin tocar la base', async () => {
  expect(await nodosEditablesUsuario(null, { id: UUID_USUARIO, rol: 'enlace' })).toEqual({ etapa: [], accion: [], tarea: [] });
  expect(await nodosEditablesUsuario(UUID_PROYECTO, null)).toEqual({ etapa: [], accion: [], tarea: [] });
  expect(mockQuery).not.toHaveBeenCalled();
});

test('sin ninguna asignación: las tres listas vienen vacías', async () => {
  const r = await nodosEditablesUsuario(UUID_PROYECTO, { id: UUID_USUARIO, rol: 'enlace' });
  expect(r).toEqual({ etapa: [], accion: [], tarea: [] });
});

// El caso explícito de la especificación de Fase 3: participa en la
// acción, no en la etapa que la contiene.
test('invitado solo a la acción: la acción y su tarea quedan editables, la etapa que la contiene NO', async () => {
  fixture.nodoMiembros = [{ tipo_nodo: 'accion', id_nodo: UUID_ACCION, rol: 'captura' }];
  const r = await nodosEditablesUsuario(UUID_PROYECTO, { id: UUID_USUARIO, rol: 'enlace' });

  expect(r.accion).toEqual([UUID_ACCION]);
  expect(r.tarea).toEqual([UUID_TAREA]); // hereda de la acción
  expect(r.etapa).toEqual([]); // la herencia nunca sube del hijo al padre
});

test('invitado a la etapa: etapa, su acción y su tarea quedan editables (herencia hacia abajo)', async () => {
  fixture.nodoMiembros = [{ tipo_nodo: 'etapa', id_nodo: UUID_ETAPA, rol: 'captura' }];
  const r = await nodosEditablesUsuario(UUID_PROYECTO, { id: UUID_USUARIO, rol: 'enlace' });

  expect(r.etapa).toEqual([UUID_ETAPA]);
  expect(r.accion).toEqual([UUID_ACCION]);
  expect(r.tarea).toEqual([UUID_TAREA]);
});

test('rol de nodo "lectura" no cuenta como editable (el mismo criterio que antes de este cambio)', async () => {
  fixture.nodoMiembros = [{ tipo_nodo: 'accion', id_nodo: UUID_ACCION, rol: 'lectura' }];
  const r = await nodosEditablesUsuario(UUID_PROYECTO, { id: UUID_USUARIO, rol: 'enlace' });

  expect(r.accion).toEqual([]);
  expect(r.tarea).toEqual([]);
});

test('id_responsable directo de la acción cuenta igual que una invitación', async () => {
  fixture.acciones = [{ ...fixture.acciones[0], id_responsable: UUID_USUARIO }];
  const r = await nodosEditablesUsuario(UUID_PROYECTO, { id: UUID_USUARIO, rol: 'enlace' });

  expect(r.accion).toEqual([UUID_ACCION]);
  expect(r.tarea).toEqual([UUID_TAREA]);
  expect(r.etapa).toEqual([]);
});

test('ejecutivo de la misma DG del proyecto: toda la etapa suelta editable, vía el bono de DG (no una fila de nodo_miembros)', async () => {
  fixture.proyecto = { id_creador: null, id_dg_lider: 'dg-1' };
  const r = await nodosEditablesUsuario(UUID_PROYECTO, { id: UUID_USUARIO, rol: 'ejecutivo', id_dg: 'dg-1' });

  expect(r.etapa).toEqual([UUID_ETAPA]);
  expect(r.accion).toEqual([UUID_ACCION]);
  expect(r.tarea).toEqual([UUID_TAREA]);
});
