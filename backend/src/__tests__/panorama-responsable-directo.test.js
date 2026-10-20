/**
 * ARCHIVO: panorama-responsable-directo.test.js
 * PROPÓSITO: Bloque 2.6 (modal de captura) — elegir "Responsable" al crear
 *            una etapa/acción/tarea escribe solo la columna id_responsable
 *            de ese nodo, no una fila en nodo_miembros. Antes de esta
 *            ronda, obtenerTodosParticipantes (el dato detrás de
 *            Configuración > Equipo y permisos) solo leía proyecto_usuarios
 *            y nodo_miembros, así que ese responsable directo nunca
 *            aparecía ahí, aunque funcion-efectiva.js ya le diera el
 *            peldaño 'responsable' sobre ese nodo (vía 'responsable_de_nodo').
 *            Mismo hecho, dos lugares, uno de ellos mudo — exactamente la
 *            clase de incoherencia que rondas previas ya venían cerrando.
 *
 * La consulta SQL en sí (con sus UNION ALL y NOT EXISTS) se validó aparte
 * contra una instancia real de Postgres 16 con datos de prueba — este test
 * no puede ejecutar SQL de verdad (pool.query está mockeado, como en el
 * resto de la suite), así que cubre dos cosas: que la nueva rama de
 * responsable-directo sigue presente en el texto de la consulta (guarda de
 * regresión) y que la función devuelve las filas tal cual las entrega la
 * base de datos.
 *
 * Ejecutar: npm test
 */
jest.mock('../db/pool', () => ({ query: jest.fn() }));

const pool = require('../db/pool');
const { obtenerTodosParticipantes } = require('../controllers/panorama.controller');

beforeEach(() => { jest.clearAllMocks(); });

describe('obtenerTodosParticipantes — responsable directo sin nodo_miembros', () => {
  it('la consulta incluye las tres ramas de responsable directo (etapa/acción/tarea) con NOT EXISTS contra nodo_miembros', async () => {
    let sqlCapturado = null;
    pool.query.mockImplementation((sql) => {
      sqlCapturado = sql;
      return Promise.resolve({ rows: [] });
    });

    await obtenerTodosParticipantes('proyecto-1');

    expect(sqlCapturado).toMatch(/FROM etapas e\s+WHERE e\.id_proyecto = \$1 AND e\.id_responsable IS NOT NULL/);
    expect(sqlCapturado).toMatch(/FROM acciones a\s+WHERE a\.id_proyecto = \$1 AND a\.id_responsable IS NOT NULL/);
    expect(sqlCapturado).toMatch(/FROM tareas t\s+JOIN acciones a3/);
    // Las tres ramas nuevas deben excluir a quien ya tiene una fila
    // explícita en nodo_miembros para ese mismo nodo, para no competir
    // con una participación que el administrador ya gestiona a mano.
    expect(sqlCapturado.match(/NOT EXISTS \(/g)?.length).toBe(3);
  });

  it('devuelve al responsable directo de una acción como participante con rol "responsable"', async () => {
    pool.query.mockResolvedValue({
      rows: [{
        id_usuario: 'u1', nombre_completo: 'Juan Pérez', correo: 'juan@sedatu.gob.mx',
        cargo: 'Director', usuario_activo: true, perfil: 'direccion',
        dg_siglas: null, da_siglas: null,
        rol: 'responsable', alcance: 'accion', nodo_nombre: 'Acción con responsable directo',
        nodo_tipo: 'accion', nodo_id: 'accion-1', estado: 'aceptada',
      }],
    });

    const miembros = await obtenerTodosParticipantes('proyecto-1');

    expect(miembros).toHaveLength(1);
    expect(miembros[0]).toMatchObject({
      nombre_completo: 'Juan Pérez', rol: 'responsable', alcance: 'accion',
      nodo_tipo: 'accion', nodo_nombre: 'Acción con responsable directo',
    });
  });
});
