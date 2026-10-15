/**
 * ARCHIVO: transferir-administracion.test.js
 * PROPÓSITO: Transferencia de administración de un proyecto — decisión de
 *            producto en docs/modelo-permisos.md: solo un superadmin puede
 *            hacerla (el propio administrador cediéndola queda para una
 *            versión posterior).
 *
 *            Dos niveles:
 * miembros.queries.js::transferirAdministracion — la transacción real y
 * sus 4 validaciones (destinatario aceptado, no externo, proyecto con
 * administrador, no es ya el mismo administrador). El controller
 * (transferirAdministracionProyecto) se prueba aparte, en
 * transferir-administracion-controller.test.js — mockear
 * miembros.queries.js en el mismo archivo que lo importa sin mock
 * complica más de lo que ahorra.
 *
 * Ejecutar: npm test
 */
const PROYECTO = '00000000-0000-0000-0000-00000000a001';
const ACTOR = '00000000-0000-0000-0000-00000000a002';     // administracion_proyecto actual
const ACTOR_2 = '00000000-0000-0000-0000-00000000a003';   // segundo administrador (riesgo conocido, sin constraint)
const DESTINO = '00000000-0000-0000-0000-00000000a004';   // responsable, aceptado, interno
const EXTERNO = '00000000-0000-0000-0000-00000000a005';   // aceptado, pero perfil externo
const PENDIENTE = '00000000-0000-0000-0000-00000000a006'; // invitado, no aceptado todavía
const SIN_RELACION = '00000000-0000-0000-0000-00000000a007';

function crearClienteMock(miembros) {
  const query = jest.fn(async (sql) => {
    const texto = sql.trim();
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(texto)) return {};
    if (/FROM proyecto_usuarios pu\s+JOIN usuarios u/.test(sql)) {
      // La llamada real pasa [proyectoId, idUsuario] — se resuelve desde
      // el segundo argumento de client.query, leído aparte por el mock
      // de arriba (jest ya nos da los params en el segundo argumento).
      return query.mock.calls.length ? resolverDestino(sql, query.mock.calls.at(-1)) : { rows: [] };
    }
    if (/SELECT id_usuario FROM proyecto_usuarios/.test(sql)) {
      const actuales = miembros.filter(m => m.rol === 'administracion_proyecto' && m.estado === 'aceptada');
      return { rows: actuales.map(a => ({ id_usuario: a.id_usuario })) };
    }
    if (/UPDATE proyecto_usuarios SET rol = 'responsable'/.test(sql)) return {};
    if (/UPDATE proyecto_usuarios SET rol = 'administracion_proyecto'/.test(sql)) return {};
    throw new Error(`Consulta no mockeada: ${sql}`);
  });

  function resolverDestino(_sql, ultimaLlamada) {
    const [, params] = ultimaLlamada;
    const idUsuario = params[1];
    const fila = miembros.find(m => m.id_usuario === idUsuario);
    return { rows: fila ? [{ estado: fila.estado, perfil: fila.perfil, nombre_completo: fila.nombre_completo }] : [] };
  }

  return { query, release: jest.fn() };
}

jest.mock('../db/pool', () => ({ connect: jest.fn(), query: jest.fn() }));
const pool = require('../db/pool');
const { transferirAdministracion } = require('../db/queries/miembros.queries');

const MIEMBROS_BASE = [
  { id_usuario: ACTOR, rol: 'administracion_proyecto', estado: 'aceptada', perfil: 'enlace', nombre_completo: 'Actor Admin' },
  { id_usuario: DESTINO, rol: 'responsable', estado: 'aceptada', perfil: 'enlace', nombre_completo: 'Destino Persona' },
  { id_usuario: EXTERNO, rol: 'lectura', estado: 'aceptada', perfil: 'externo', nombre_completo: 'Externo Persona' },
  { id_usuario: PENDIENTE, rol: 'captura', estado: 'pendiente', perfil: 'enlace', nombre_completo: 'Pendiente Persona' },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('transferirAdministracion — transacción real', () => {
  test('transfiere correctamente: nuevo administrador queda con administracion_proyecto, el saliente queda responsable', async () => {
    const cliente = crearClienteMock(MIEMBROS_BASE);
    pool.connect.mockResolvedValue(cliente);

    const resultado = await transferirAdministracion(PROYECTO, DESTINO);

    expect(resultado.administradoresAnteriores).toEqual([ACTOR]);
    expect(resultado.nuevoAdministrador).toBe(DESTINO);
    expect(resultado.nombreNuevoAdministrador).toBe('Destino Persona');

    const llamadas = cliente.query.mock.calls.map(c => c[0].trim());
    expect(llamadas).toContain('COMMIT');
    expect(llamadas).not.toContain('ROLLBACK');
    expect(llamadas.some(sql => sql.includes("SET rol = 'responsable'"))).toBe(true);
    expect(llamadas.some(sql => sql.includes("SET rol = 'administracion_proyecto'"))).toBe(true);
  });

  test('rechaza si el destinatario no es miembro aceptado del proyecto (pendiente)', async () => {
    const cliente = crearClienteMock(MIEMBROS_BASE);
    pool.connect.mockResolvedValue(cliente);

    await expect(transferirAdministracion(PROYECTO, PENDIENTE)).rejects.toMatchObject({
      statusCode: 400, codigo: 'DESTINATARIO_NO_MIEMBRO',
    });
    expect(cliente.query.mock.calls.map(c => c[0].trim())).toContain('ROLLBACK');
  });

  test('rechaza si el destinatario no tiene ninguna relación con el proyecto', async () => {
    const cliente = crearClienteMock(MIEMBROS_BASE);
    pool.connect.mockResolvedValue(cliente);

    await expect(transferirAdministracion(PROYECTO, SIN_RELACION)).rejects.toMatchObject({
      statusCode: 400, codigo: 'DESTINATARIO_NO_MIEMBRO',
    });
  });

  test('rechaza si el destinatario es externo, aunque esté aceptado', async () => {
    const cliente = crearClienteMock(MIEMBROS_BASE);
    pool.connect.mockResolvedValue(cliente);

    await expect(transferirAdministracion(PROYECTO, EXTERNO)).rejects.toMatchObject({
      statusCode: 400, codigo: 'DESTINATARIO_EXTERNO',
    });
    expect(cliente.query.mock.calls.map(c => c[0].trim())).toContain('ROLLBACK');
  });

  test('rechaza si el proyecto no tiene administrador actual', async () => {
    const sinAdmin = MIEMBROS_BASE.filter(m => m.id_usuario !== ACTOR);
    const cliente = crearClienteMock(sinAdmin);
    pool.connect.mockResolvedValue(cliente);

    await expect(transferirAdministracion(PROYECTO, DESTINO)).rejects.toMatchObject({
      statusCode: 409, codigo: 'SIN_ADMINISTRADOR',
    });
  });

  test('rechaza si el destinatario ya es el administrador actual', async () => {
    const cliente = crearClienteMock(MIEMBROS_BASE);
    pool.connect.mockResolvedValue(cliente);

    await expect(transferirAdministracion(PROYECTO, ACTOR)).rejects.toMatchObject({
      statusCode: 400, codigo: 'MISMO_ADMINISTRADOR',
    });
  });

  test('si por el riesgo ya conocido (sin constraint de BD) hubiera dos administradores, degrada a los DOS, no solo a uno', async () => {
    const conDosAdmins = [
      ...MIEMBROS_BASE,
      { id_usuario: ACTOR_2, rol: 'administracion_proyecto', estado: 'aceptada', perfil: 'enlace', nombre_completo: 'Segundo Admin' },
    ];
    const cliente = crearClienteMock(conDosAdmins);
    pool.connect.mockResolvedValue(cliente);

    const resultado = await transferirAdministracion(PROYECTO, DESTINO);

    expect(resultado.administradoresAnteriores.sort()).toEqual([ACTOR, ACTOR_2].sort());
  });
});
