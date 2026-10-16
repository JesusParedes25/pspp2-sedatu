/**
 * ARCHIVO: agenda-dueno-mas-cercano.test.js
 * PROPÓSITO: acciones.queries.js::obtenerAccionesAgenda — la regla del
 *            "dueño más cercano" (docs/modelo-permisos.md, sección 16):
 *            un nodo aparece en la lista de su dueño más cercano en el
 *            árbol, subiendo desde el nodo hasta el primer nivel con
 *            asignación directa; si ninguno tiene, el dueño de respaldo
 *            es quien administra el proyecto completo. Los 5 casos
 *            pedidos explícitamente, uno por test.
 *
 * Fixture compartido: Proyecto P (creador = ADMIN).
 *   Etapa A (EA)  — delegada a ANA (nodo_miembros, responsable)
 *     Acción A1 (AA1) — delegada a BETO (nodo_miembros, responsable)
 *       Tarea T1 (bajo A1, sin asignación propia)
 *     Acción A2 (AA2) — sin asignación propia (hereda de Etapa A → Ana)
 *   Etapa B (EB)  — SIN ninguna asignación en todo su árbol
 *     Acción B1 (AB1) — sin asignación propia (hereda de Etapa B → proyecto → ADMIN)
 *   Etapa C (EC)  — asignada DIRECTO a dos personas a la vez (X vía
 *                   id_responsable, Y vía nodo_miembros) — sin hijos.
 *
 * NOTA SOBRE LAS FECHAS DEL FIXTURE (regresión real, ver commit que
 * agregó este comentario): `pg` devuelve las columnas DATE/TIMESTAMP
 * como objetos `Date`, nunca como cadenas — solo se vuelven cadena ISO
 * después de pasar por `res.json()` (`Date.prototype.toJSON`), fuera
 * de esta función. La primera versión de este archivo usaba cadenas
 * ('2026-01-10') en el fixture, y los 6 tests pasaron en verde aunque
 * `obtenerAccionesAgenda` ordenaba con `localeCompare` — un método que
 * SÍ existe en String pero NO en Date, y que tronaba con un 500 real
 * en cuanto `/agenda` corría contra la base de verdad. Por eso TODAS
 * las fechas de este fixture son objetos `new Date(...)`, no cadenas
 * — para que esta clase de bug (asumir un tipo que `pg` no entrega)
 * la atrape la prueba, no producción.
 *
 * Ejecutar: npm test
 */
const PROYECTO = '00000000-0000-0000-0000-00000000f001';
const ADMIN = '00000000-0000-0000-0000-00000000f002';
const ANA = '00000000-0000-0000-0000-00000000f003';
const BETO = '00000000-0000-0000-0000-00000000f004';
const X = '00000000-0000-0000-0000-00000000f005';
const Y = '00000000-0000-0000-0000-00000000f006';

const EA = '00000000-0000-0000-0000-00000000f010';
const EB = '00000000-0000-0000-0000-00000000f011';
const EC = '00000000-0000-0000-0000-00000000f012';
const AA1 = '00000000-0000-0000-0000-00000000f020';
const AA2 = '00000000-0000-0000-0000-00000000f021';
const AB1 = '00000000-0000-0000-0000-00000000f022';
const T1 = '00000000-0000-0000-0000-00000000f030';

jest.mock('../db/pool', () => ({ query: jest.fn() }));
const pool = require('../db/pool');
const { obtenerAccionesAgenda } = require('../db/queries/acciones.queries');

let fixture;

beforeEach(() => {
  jest.clearAllMocks();
  fixture = {
    proyectoIdsRelevantes: [PROYECTO],
    proyecto: { id: PROYECTO, nombre: 'Proyecto de prueba', id_creador: ADMIN },
    adminsFilas: [],
    etapas: [
      { id: EA, nombre: 'Etapa A', estado: 'Pendiente', semaforo: 'verde', semaforo_override: false, avance_actual: 0, fecha_inicio: null, fecha_fin: new Date('2026-01-10'), id_responsable: null, id_proyecto: PROYECTO, prioridad: 'Media', estatus_cualitativo: null },
      { id: EB, nombre: 'Etapa B', estado: 'Pendiente', semaforo: 'verde', semaforo_override: false, avance_actual: 0, fecha_inicio: null, fecha_fin: new Date('2026-02-10'), id_responsable: null, id_proyecto: PROYECTO, prioridad: 'Media', estatus_cualitativo: null },
      { id: EC, nombre: 'Etapa C', estado: 'Pendiente', semaforo: 'verde', semaforo_override: false, avance_actual: 0, fecha_inicio: null, fecha_fin: new Date('2026-03-10'), id_responsable: X, id_proyecto: PROYECTO, prioridad: 'Media', estatus_cualitativo: null },
    ],
    acciones: [
      { id: AA1, nombre: 'Acción A1', estado: 'Pendiente', semaforo: 'verde', semaforo_override: false, avance_actual: 0, fecha_inicio: null, fecha_fin: new Date('2026-01-05'), id_responsable: null, id_accion_padre: null, id_etapa: EA, id_proyecto: PROYECTO, prioridad: 'Media', estatus_cualitativo: null },
      { id: AA2, nombre: 'Acción A2', estado: 'Pendiente', semaforo: 'verde', semaforo_override: false, avance_actual: 0, fecha_inicio: null, fecha_fin: new Date('2026-01-06'), id_responsable: null, id_accion_padre: null, id_etapa: EA, id_proyecto: PROYECTO, prioridad: 'Media', estatus_cualitativo: null },
      { id: AB1, nombre: 'Acción B1', estado: 'Pendiente', semaforo: 'verde', semaforo_override: false, avance_actual: 0, fecha_inicio: null, fecha_fin: new Date('2026-02-05'), id_responsable: null, id_accion_padre: null, id_etapa: EB, id_proyecto: PROYECTO, prioridad: 'Media', estatus_cualitativo: null },
    ],
    tareas: [
      { id: T1, nombre: 'Tarea T1', estado: 'Pendiente', semaforo: 'verde', semaforo_override: false, avance_actual: 0, fecha_inicio: null, fecha_fin: new Date('2026-01-04'), id_responsable: null, id_accion: AA1, id_proyecto: PROYECTO },
    ],
    nodoMiembros: [
      { tipo_nodo: 'etapa', id_nodo: EA, id_usuario: ANA, rol: 'responsable' },
      { tipo_nodo: 'accion', id_nodo: AA1, id_usuario: BETO, rol: 'responsable' },
      { tipo_nodo: 'etapa', id_nodo: EC, id_usuario: Y, rol: 'captura' },
    ],
    usuariosResp: [{ id: X, nombre_completo: 'Persona X' }],
  };

  pool.query.mockImplementation((sql) => {
    if (/SELECT DISTINCT p\.id/.test(sql)) {
      return Promise.resolve({ rows: fixture.proyectoIdsRelevantes.map(id => ({ id })) });
    }
    if (/FROM proyectos WHERE id = ANY/.test(sql)) return Promise.resolve({ rows: [fixture.proyecto] });
    if (/FROM proyecto_usuarios\s+WHERE id_proyecto = ANY/.test(sql)) return Promise.resolve({ rows: fixture.adminsFilas });
    if (/FROM etapas WHERE id_proyecto = ANY/.test(sql)) return Promise.resolve({ rows: fixture.etapas });
    if (/FROM acciones WHERE id_proyecto = ANY/.test(sql)) return Promise.resolve({ rows: fixture.acciones });
    if (/FROM tareas t JOIN acciones a/.test(sql)) return Promise.resolve({ rows: fixture.tareas });
    if (/FROM nodo_miembros/.test(sql)) return Promise.resolve({ rows: fixture.nodoMiembros });
    if (/FROM usuarios WHERE id = ANY/.test(sql)) return Promise.resolve({ rows: fixture.usuariosResp });
    throw new Error(`Consulta no mockeada: ${sql}`);
  });
});

function idsDe(items) { return items.map(i => i.id).sort(); }

test('1. Persona asignada a una etapa, sin asignaciones en sus hijos: ve la etapa y todas sus acciones y tareas', async () => {
  const { items } = await obtenerAccionesAgenda(ANA);
  // Ana ve Etapa A completa salvo A1 (delegada aparte a Beto) y su tarea.
  expect(idsDe(items)).toEqual([AA2, EA].sort());
  expect(items.find(i => i.id === EA).mi_rol).toBe('responsable');
  expect(items.find(i => i.id === AA2).mi_rol).toBe('responsable');
});

test('2. Administrador que delegó la Etapa A: no ve la Etapa A ni nada que cuelgue de ella, pero sí ve las etapas que no delegó', async () => {
  const { items, hayPartesDelegadas } = await obtenerAccionesAgenda(ADMIN);
  const ids = idsDe(items);
  expect(ids).not.toContain(EA);
  expect(ids).not.toContain(AA1);
  expect(ids).not.toContain(AA2);
  expect(ids).not.toContain(T1);
  // Etapa B (sin ninguna delegación) sí le toca, como coordinador —
  // junto con su acción B1.
  expect(ids).toEqual(expect.arrayContaining([EB, AB1]));
  expect(items.find(i => i.id === EB).mi_rol).toBe('coordinador');
  expect(hayPartesDelegadas).toBe(true);
});

test('3. Delegación anidada: Beto ve A1 y su tarea; Ana ve el resto de la Etapa A pero no A1; el administrador no ve nada de la Etapa A', async () => {
  const [beto, ana, admin] = await Promise.all([
    obtenerAccionesAgenda(BETO),
    obtenerAccionesAgenda(ANA),
    obtenerAccionesAgenda(ADMIN),
  ]);

  expect(idsDe(beto.items)).toEqual([AA1, T1].sort());
  expect(beto.items.find(i => i.id === T1).mi_rol).toBe('responsable');

  expect(idsDe(ana.items)).toEqual([AA2, EA].sort());
  expect(idsDe(ana.items)).not.toContain(AA1);
  expect(idsDe(ana.items)).not.toContain(T1);

  expect(idsDe(admin.items)).not.toContain(EA);
  expect(idsDe(admin.items)).not.toContain(AA1);
  expect(idsDe(admin.items)).not.toContain(AA2);
  expect(idsDe(admin.items)).not.toContain(T1);
});

test('4. Dos personas asignadas al mismo nodo (Etapa C: X por id_responsable, Y por nodo_miembros): aparece en las listas de ambas', async () => {
  const [x, y] = await Promise.all([obtenerAccionesAgenda(X), obtenerAccionesAgenda(Y)]);
  expect(idsDe(x.items)).toContain(EC);
  expect(idsDe(y.items)).toContain(EC);
  expect(x.items.find(i => i.id === EC).mi_rol).toBe('responsable');
  expect(y.items.find(i => i.id === EC).mi_rol).toBe('captura');
});

test('5. Ningún nodo queda fuera de todas las listas: todo nodo resuelve a alguien (Ana, Beto o el administrador)', async () => {
  const [ana, beto, admin] = await Promise.all([
    obtenerAccionesAgenda(ANA),
    obtenerAccionesAgenda(BETO),
    obtenerAccionesAgenda(ADMIN),
  ]);
  const todosLosIds = [EA, EB, AA1, AA2, AB1, T1];
  const cubiertos = new Set([...idsDe(ana.items), ...idsDe(beto.items), ...idsDe(admin.items)]);
  for (const id of todosLosIds) expect(cubiertos.has(id)).toBe(true);
});

test('responsable_nombre sigue saliendo de la columna id_responsable del propio nodo (Etapa C)', async () => {
  const { items } = await obtenerAccionesAgenda(X);
  const etapaC = items.find(i => i.id === EC);
  expect(etapaC.responsable_id).toBe(X);
  expect(etapaC.responsable_nombre).toBe('Persona X');
});
