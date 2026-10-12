/**
 * ARCHIVO: funcion-efectiva.test.js
 * PROPÓSITO: Fase 1 del modelo de permisos (docs/modelo-permisos.md) —
 *            pruebas del corazón de la fase: funcionEfectiva() resuelve
 *            el peldaño más alto por todas las vías, y
 *            funcionEfectivaPorLotes() hace lo mismo para todo un árbol
 *            sin una consulta por nodo.
 *
 * Mock de pool.query por contenido de la consulta (no por orden de
 * llamada) — necesario porque funcionEfectivaEnNodo es recursiva y el
 * orden exacto de SELECTs varía según la profundidad del árbol.
 *
 * Ejecutar: npm test
 */

const UUID_CREADOR = '00000000-0000-0000-0000-000000000001';
const UUID_OTRO = '00000000-0000-0000-0000-000000000002';
const UUID_PROYECTO = '00000000-0000-0000-0000-000000000003';
const UUID_DG_A = '00000000-0000-0000-0000-00000000000a';
const UUID_DG_B = '00000000-0000-0000-0000-00000000000b';
const UUID_ETAPA = '00000000-0000-0000-0000-000000000004';
const UUID_ACCION = '00000000-0000-0000-0000-000000000005';
const UUID_ACCION_HIJA = '00000000-0000-0000-0000-000000000006';
const UUID_TAREA = '00000000-0000-0000-0000-000000000007';

// fixture mutable: cada test ajusta solo lo que necesita
let fixture;

function fixtureBase() {
  return {
    proyecto: { id_creador: UUID_CREADOR, id_dg_lider: UUID_DG_A },
    proyectoUsuarioRol: null, // rol aceptado del usuario a nivel proyecto, o null
    etapa: { id_responsable: null, id_proyecto: UUID_PROYECTO },
    accion: { id_responsable: null, id_accion_padre: null, id_etapa: UUID_ETAPA, id_proyecto: null },
    tarea: { id_responsable: null, id_accion: UUID_ACCION },
    nodoMiembroRol: null, // rol aceptado del usuario en el nodo que se consulte
  };
}

const mockQuery = jest.fn(async (sql) => {
  if (sql.includes('FROM proyectos')) {
    return { rows: fixture.proyecto ? [fixture.proyecto] : [] };
  }
  if (sql.includes('FROM proyecto_usuarios')) {
    return { rows: fixture.proyectoUsuarioRol ? [{ rol: fixture.proyectoUsuarioRol }] : [] };
  }
  if (sql.includes('FROM tareas')) {
    return { rows: fixture.tarea ? [fixture.tarea] : [] };
  }
  if (sql.includes('FROM acciones')) {
    return { rows: fixture.accion ? [fixture.accion] : [] };
  }
  if (sql.includes('FROM etapas')) {
    return { rows: fixture.etapa ? [fixture.etapa] : [] };
  }
  if (sql.includes('FROM nodo_miembros')) {
    return { rows: fixture.nodoMiembroRol ? [{ rol: fixture.nodoMiembroRol }] : [] };
  }
  throw new Error(`Consulta no mockeada: ${sql}`);
});

jest.mock('../db/pool', () => ({ query: (...args) => mockQuery(...args) }));

const {
  funcionEfectiva,
  funcionEfectivaPorLotes,
  alcanza,
  masAlto,
} = require('../utils/funcion-efectiva');

beforeEach(() => {
  mockQuery.mockClear();
  fixture = fixtureBase();
});

describe('funcionEfectiva — nivel proyecto', () => {
  test('superadmin: administracion_proyecto, sin tocar la base', async () => {
    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'superadmin' }, { tipo: 'proyecto', id: UUID_PROYECTO });
    expect(r).toEqual({ peldano: 'administracion_proyecto', via: 'superadmin' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('creador: administracion_proyecto', async () => {
    const r = await funcionEfectiva({ id: UUID_CREADOR, rol: 'enlace' }, { tipo: 'proyecto', id: UUID_PROYECTO });
    expect(r).toEqual({ peldano: 'administracion_proyecto', via: 'creador' });
  });

  test('un extraño sin ninguna vía: null', async () => {
    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'enlace' }, { tipo: 'proyecto', id: UUID_PROYECTO });
    expect(r).toBeNull();
  });

  test('invitación aceptada a nivel proyecto: ese peldaño, vía "proyecto"', async () => {
    fixture.proyectoUsuarioRol = 'captura';
    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'enlace' }, { tipo: 'proyecto', id: UUID_PROYECTO });
    expect(r).toEqual({ peldano: 'captura', via: 'proyecto' });
  });

  test('invitación pendiente no concede nada (la query ya filtra estado=aceptada, se simula sin fila)', async () => {
    fixture.proyectoUsuarioRol = null; // una invitación 'pendiente' no aparece en esta consulta
    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'enlace' }, { tipo: 'proyecto', id: UUID_PROYECTO });
    expect(r).toBeNull();
  });

  test('ejecutivo de OTRA DG: no escribe (sin ninguna vía)', async () => {
    const r = await funcionEfectiva(
      { id: UUID_OTRO, rol: 'ejecutivo', id_dg: UUID_DG_B },
      { tipo: 'proyecto', id: UUID_PROYECTO }
    );
    expect(r).toBeNull();
    expect(alcanza(r, 'captura')).toBe(false);
  });

  test('ejecutivo de la MISMA DG: responsable, nunca administracion_proyecto', async () => {
    const r = await funcionEfectiva(
      { id: UUID_OTRO, rol: 'ejecutivo', id_dg: UUID_DG_A },
      { tipo: 'proyecto', id: UUID_PROYECTO }
    );
    expect(r).toEqual({ peldano: 'responsable', via: 'ejecutivo_dg' });
    expect(alcanza(r, 'administracion_proyecto')).toBe(false);
    expect(alcanza(r, 'responsable')).toBe(true);
  });

  test('ejecutivo sin id_dg (null) nunca hace match, aunque el proyecto tampoco tenga id_dg_lider', async () => {
    fixture.proyecto.id_dg_lider = null;
    const r = await funcionEfectiva(
      { id: UUID_OTRO, rol: 'ejecutivo', id_dg: null },
      { tipo: 'proyecto', id: UUID_PROYECTO }
    );
    expect(r).toBeNull();
  });

  test('precedencia: invitación a nivel proyecto (responsable) le gana al bono de ejecutivo_dg en empate', async () => {
    fixture.proyectoUsuarioRol = 'responsable';
    const r = await funcionEfectiva(
      { id: UUID_OTRO, rol: 'ejecutivo', id_dg: UUID_DG_A },
      { tipo: 'proyecto', id: UUID_PROYECTO }
    );
    expect(r).toEqual({ peldano: 'responsable', via: 'proyecto' });
  });

  test('precedencia: gana el peldaño más alto entre varias vías (proyecto=captura vs ejecutivo_dg=responsable)', async () => {
    fixture.proyectoUsuarioRol = 'captura';
    const r = await funcionEfectiva(
      { id: UUID_OTRO, rol: 'ejecutivo', id_dg: UUID_DG_A },
      { tipo: 'proyecto', id: UUID_PROYECTO }
    );
    expect(r).toEqual({ peldano: 'responsable', via: 'ejecutivo_dg' });
  });
});

describe('funcionEfectiva — nivel nodo y herencia', () => {
  test('superadmin en un nodo: responsable (el tope de nodo), sin tocar la base', async () => {
    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'superadmin' }, { tipo: 'etapa', id: UUID_ETAPA });
    expect(r).toEqual({ peldano: 'responsable', via: 'superadmin' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('id_responsable directo de la etapa: responsable, vía responsable_de_nodo', async () => {
    fixture.etapa.id_responsable = UUID_OTRO;
    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'enlace' }, { tipo: 'etapa', id: UUID_ETAPA });
    expect(r).toEqual({ peldano: 'responsable', via: 'responsable_de_nodo' });
  });

  test('invitación aceptada directo en la etapa: ese peldaño, vía invitacion', async () => {
    fixture.nodoMiembroRol = 'captura';
    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'enlace' }, { tipo: 'etapa', id: UUID_ETAPA });
    expect(r).toEqual({ peldano: 'captura', via: 'invitacion' });
  });

  test('herencia: función en la etapa aplica a una acción hija (sin asignación propia en la acción)', async () => {
    fixture.etapa.id_responsable = UUID_OTRO;
    fixture.accion.id_etapa = UUID_ETAPA;
    fixture.accion.id_accion_padre = null;
    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'enlace' }, { tipo: 'accion', id: UUID_ACCION });
    expect(r).toEqual({ peldano: 'responsable', via: 'herencia' });
  });

  test('herencia: baja hasta una tarea (etapa -> accion -> tarea)', async () => {
    fixture.etapa.id_responsable = UUID_OTRO;
    fixture.accion.id_etapa = UUID_ETAPA;
    fixture.tarea.id_accion = UUID_ACCION;
    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'enlace' }, { tipo: 'tarea', id: UUID_TAREA });
    expect(r).toEqual({ peldano: 'responsable', via: 'herencia' });
  });

  test('una invitación pendiente en el nodo no concede nada (la query de nodo_miembros ya filtra aceptada)', async () => {
    fixture.nodoMiembroRol = null;
    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'enlace' }, { tipo: 'etapa', id: UUID_ETAPA });
    expect(r).toBeNull();
  });

  test('precedencia en nodo: la asignación directa (mayor) le gana a lo heredado del proyecto (menor)', async () => {
    fixture.nodoMiembroRol = 'responsable';
    fixture.proyectoUsuarioRol = 'captura';
    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'enlace' }, { tipo: 'etapa', id: UUID_ETAPA });
    expect(r).toEqual({ peldano: 'responsable', via: 'invitacion' });
  });

  test('sin asignación directa ni heredada, cae al nivel proyecto (capado a responsable como techo de nodo)', async () => {
    fixture.proyectoUsuarioRol = 'administracion_proyecto'; // ej. el creador vía fila de proyecto_usuarios (caso raro, igual se topa)
    fixture.proyecto.id_creador = UUID_OTRO;
    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'enlace' }, { tipo: 'etapa', id: UUID_ETAPA });
    // Como es el creador, la vía real es 'creador' (más fuerte, resuelta antes de mirar proyecto_usuarios).
    expect(r).toEqual({ peldano: 'responsable', via: 'creador' });
  });

  test('ejecutivo de la misma DG también alcanza un nodo suelto del proyecto (capado a responsable)', async () => {
    const r = await funcionEfectiva(
      { id: UUID_OTRO, rol: 'ejecutivo', id_dg: UUID_DG_A },
      { tipo: 'etapa', id: UUID_ETAPA }
    );
    expect(r).toEqual({ peldano: 'responsable', via: 'ejecutivo_dg' });
  });

  test('herencia de subacción a subacción (varios niveles de id_accion_padre)', async () => {
    // UUID_ACCION_HIJA cuelga de UUID_ACCION, que a su vez cuelga de la etapa.
    fixture.etapa.id_responsable = UUID_OTRO;
    fixture.accion.id_etapa = UUID_ETAPA;
    fixture.accion.id_accion_padre = null;

    const mockQueryAnidado = jest.fn(async (sql, params) => {
      if (sql.includes('FROM proyectos')) return { rows: [fixture.proyecto] };
      if (sql.includes('FROM proyecto_usuarios')) return { rows: [] };
      if (sql.includes('FROM nodo_miembros')) return { rows: [] };
      if (sql.includes('FROM acciones')) {
        const id = params[0];
        if (id === UUID_ACCION_HIJA) return { rows: [{ id_responsable: null, id_accion_padre: UUID_ACCION, id_etapa: null, id_proyecto: null }] };
        if (id === UUID_ACCION) return { rows: [fixture.accion] };
        return { rows: [] };
      }
      if (sql.includes('FROM etapas')) return { rows: [fixture.etapa] };
      throw new Error(`Consulta no mockeada: ${sql}`);
    });
    mockQuery.mockImplementation(mockQueryAnidado);

    const r = await funcionEfectiva({ id: UUID_OTRO, rol: 'enlace' }, { tipo: 'accion', id: UUID_ACCION_HIJA });
    expect(r).toEqual({ peldano: 'responsable', via: 'herencia' });
  });
});

describe('funcionEfectivaPorLotes — todo el árbol de un proyecto de una vez', () => {
  // Árbol: etapa E (sin asignación propia) -> accion A (invitado 'responsable') -> tarea T (sin asignación propia, hereda de A).
  // El usuario es 'enlace' sin ninguna fila a nivel proyecto -> sin el bono de ejecutivo_dg.
  function mockLotes() {
    return jest.fn(async (sql, params) => {
      if (sql.includes('FROM proyectos')) {
        return { rows: [{ id_creador: UUID_CREADOR, id_dg_lider: UUID_DG_A }] };
      }
      if (sql.includes('FROM proyecto_usuarios')) return { rows: [] };
      // Importa el orden: la consulta recursiva de acciones trae "FROM
      // etapas" dentro de una subconsulta, así que acciones/tareas se
      // revisan primero para no confundirla con la consulta de etapas.
      if (sql.includes('FROM tareas')) return { rows: [{ id: UUID_TAREA, id_responsable: null, id_accion: UUID_ACCION }] };
      if (sql.includes('FROM acciones')) {
        return { rows: [{ id: UUID_ACCION, id_responsable: null, id_accion_padre: null, id_etapa: UUID_ETAPA, id_proyecto: null }] };
      }
      if (sql.includes('FROM etapas')) return { rows: [{ id: UUID_ETAPA, id_responsable: null }] };
      if (sql.includes('FROM nodo_miembros')) {
        return { rows: [{ tipo_nodo: 'accion', id_nodo: UUID_ACCION, rol: 'responsable' }] };
      }
      throw new Error(`Consulta no mockeada: ${sql} / ${JSON.stringify(params)}`);
    });
  }

  test('propaga la invitación de la acción hacia su tarea, y no toca la etapa hermana sin relación', async () => {
    mockQuery.mockImplementation(mockLotes());
    const r = await funcionEfectivaPorLotes({ id: UUID_OTRO, rol: 'enlace' }, UUID_PROYECTO);

    expect(r.etapa[UUID_ETAPA]).toBeNull(); // sin asignación propia ni heredada (el usuario no es miembro del proyecto)
    expect(r.accion[UUID_ACCION]).toEqual({ peldano: 'responsable', via: 'invitacion' });
    expect(r.tarea[UUID_TAREA]).toEqual({ peldano: 'responsable', via: 'herencia' });
  });

  test('superadmin: responsable en todos los nodos, sin consultar nodo_miembros/proyecto_usuarios', async () => {
    const mock = mockLotes();
    mockQuery.mockImplementation(mock);
    const r = await funcionEfectivaPorLotes({ id: UUID_OTRO, rol: 'superadmin' }, UUID_PROYECTO);

    expect(r.etapa[UUID_ETAPA]).toEqual({ peldano: 'responsable', via: 'superadmin' });
    expect(r.accion[UUID_ACCION]).toEqual({ peldano: 'responsable', via: 'superadmin' });
    expect(r.tarea[UUID_TAREA]).toEqual({ peldano: 'responsable', via: 'superadmin' });
    const llamadas = mockQuery.mock.calls.map(c => c[0]);
    expect(llamadas.some(sql => sql.includes('FROM nodo_miembros'))).toBe(false);
    expect(llamadas.some(sql => sql.includes('FROM proyecto_usuarios'))).toBe(false);
  });

  test('ejecutivo de la misma DG: responsable en toda la etapa suelta (bono de DG, capado a responsable)', async () => {
    mockQuery.mockImplementation(mockLotes());
    const r = await funcionEfectivaPorLotes({ id: UUID_OTRO, rol: 'ejecutivo', id_dg: UUID_DG_A }, UUID_PROYECTO);
    expect(r.etapa[UUID_ETAPA]).toEqual({ peldano: 'responsable', via: 'ejecutivo_dg' });
  });
});

describe('masAlto / alcanza', () => {
  test('masAlto devuelve el de peldaño mayor', () => {
    const r = masAlto({ peldano: 'captura', via: 'a' }, { peldano: 'responsable', via: 'b' });
    expect(r).toEqual({ peldano: 'responsable', via: 'b' });
  });
  test('masAlto en empate devuelve el primero', () => {
    const r = masAlto({ peldano: 'captura', via: 'a' }, { peldano: 'captura', via: 'b' });
    expect(r.via).toBe('a');
  });
  test('alcanza(null, cualquier) es siempre false', () => {
    expect(alcanza(null, 'lectura')).toBe(false);
  });
});
