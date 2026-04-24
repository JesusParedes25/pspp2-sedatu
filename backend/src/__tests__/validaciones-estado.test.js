/**
 * ARCHIVO: validaciones-estado.test.js
 * PROPÓSITO: Tests de integración para el módulo compartido de validaciones
 *            de estado. Usa mocks del pool de PostgreSQL para verificar
 *            lógica de transiciones, cascadas, bloqueos y auditoría.
 *
 * Ejecutar: npm test
 */

// ── Mock del pool de PostgreSQL ─────────────────────────────────
const mockQuery = jest.fn();
jest.mock('../db/pool', () => ({
  query: (...args) => mockQuery(...args)
}));

const {
  ESTADOS_VALIDOS,
  cambiarEstado,
  validarCompletitud,
  crearBloqueo,
  cerrarBloqueoActivo,
  validarReactivacion,
  registrarAuditoria,
  contarDescendientes,
  obtenerEntidad,
  tipoRealAccion
} = require('../utils/validaciones-estado');

// ── Helpers para construir respuestas mock ──────────────────────
const mockRows = (rows) => ({ rows });
const mockCount = (n) => ({ rows: [{ count: String(n) }] });
const UUID_1 = '00000000-0000-0000-0000-000000000001';
const UUID_2 = '00000000-0000-0000-0000-000000000002';
const UUID_USR = '00000000-0000-0000-0000-00000000000a';
const UUID_AUD = '00000000-0000-0000-0000-00000000000b';

beforeEach(() => {
  mockQuery.mockReset();
});

// ═════════════════════════════════════════════════════════════════
// 1. CATÁLOGO DE ESTADOS
// ═════════════════════════════════════════════════════════════════
describe('Catálogo de estados', () => {
  test('contiene exactamente 5 estados válidos', () => {
    expect(ESTADOS_VALIDOS).toEqual([
      'Pendiente', 'En_proceso', 'Bloqueada', 'Completada', 'Cancelada'
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════
// 2. obtenerEntidad
// ═════════════════════════════════════════════════════════════════
describe('obtenerEntidad', () => {
  test('retorna la fila cuando existe', async () => {
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_1, estado: 'Pendiente' }]));
    const result = await obtenerEntidad('Proyecto', UUID_1);
    expect(result).toEqual({ id: UUID_1, estado: 'Pendiente' });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM proyectos'),
      [UUID_1]
    );
  });

  test('lanza 404 si no existe', async () => {
    mockQuery.mockResolvedValueOnce(mockRows([]));
    await expect(obtenerEntidad('Proyecto', UUID_1))
      .rejects.toThrow('no encontrado');
  });

  test('lanza 400 para tipo no soportado', async () => {
    await expect(obtenerEntidad('Inventado', UUID_1))
      .rejects.toThrow('no soportado');
  });
});

// ═════════════════════════════════════════════════════════════════
// 3. tipoRealAccion
// ═════════════════════════════════════════════════════════════════
describe('tipoRealAccion', () => {
  test('retorna Subaccion cuando tiene id_accion_padre', () => {
    expect(tipoRealAccion({ id_accion_padre: UUID_2 })).toBe('Subaccion');
  });

  test('retorna Accion cuando NO tiene id_accion_padre', () => {
    expect(tipoRealAccion({ id_accion_padre: null })).toBe('Accion');
  });
});

// ═════════════════════════════════════════════════════════════════
// 4. cambiarEstado — validaciones básicas
// ═════════════════════════════════════════════════════════════════
describe('cambiarEstado — validaciones', () => {
  test('rechaza estado inválido', async () => {
    await expect(
      cambiarEstado('Proyecto', UUID_1, 'Inventado', { idUsuario: UUID_USR })
    ).rejects.toThrow('no válido');
  });

  test('rechaza sin idUsuario', async () => {
    await expect(
      cambiarEstado('Proyecto', UUID_1, 'En_proceso', {})
    ).rejects.toThrow('idUsuario es requerido');
  });

  test('rechaza si ya está en el mismo estado', async () => {
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_1, estado: 'Pendiente' }]));
    await expect(
      cambiarEstado('Proyecto', UUID_1, 'Pendiente', { idUsuario: UUID_USR })
    ).rejects.toThrow('ya está en estado');
  });
});

// ═════════════════════════════════════════════════════════════════
// 5. cambiarEstado — transición simple (Pendiente → En_proceso)
// ═════════════════════════════════════════════════════════════════
describe('cambiarEstado — transición simple', () => {
  test('Pendiente → En_proceso funciona', async () => {
    // obtenerEntidad
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_1, estado: 'Pendiente' }]));
    // UPDATE estado
    mockQuery.mockResolvedValueOnce(mockRows([]));
    // registrarAuditoria INSERT RETURNING id
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_AUD }]));

    const result = await cambiarEstado('Proyecto', UUID_1, 'En_proceso', {
      idUsuario: UUID_USR
    });

    expect(result.estadoAnterior).toBe('Pendiente');
    expect(result.estadoNuevo).toBe('En_proceso');
    expect(result.auditoria_id).toBe(UUID_AUD);
  });
});

// ═════════════════════════════════════════════════════════════════
// 6. cambiarEstado — Bloqueada requiere motivo
// ═════════════════════════════════════════════════════════════════
describe('cambiarEstado — bloqueo', () => {
  test('rechaza Bloqueada sin motivo', async () => {
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_1, estado: 'En_proceso' }]));
    await expect(
      cambiarEstado('Accion', UUID_1, 'Bloqueada', { idUsuario: UUID_USR })
    ).rejects.toThrow('motivo de bloqueo es obligatorio');
  });

  test('acepta Bloqueada con motivo', async () => {
    // obtenerEntidad
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_1, estado: 'En_proceso' }]));
    // crearBloqueo INSERT
    mockQuery.mockResolvedValueOnce(mockRows([]));
    // UPDATE estado
    mockQuery.mockResolvedValueOnce(mockRows([]));
    // registrarAuditoria
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_AUD }]));

    const result = await cambiarEstado('Accion', UUID_1, 'Bloqueada', {
      idUsuario: UUID_USR,
      motivoBloqueo: 'Falta presupuesto'
    });

    expect(result.estadoNuevo).toBe('Bloqueada');
    // Verify INSERT INTO bloqueos was called
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bloqueos'),
      expect.arrayContaining(['Accion', UUID_1, 'Falta presupuesto'])
    );
  });
});

// ═════════════════════════════════════════════════════════════════
// 7. cambiarEstado — desbloqueo cierra bloqueo activo
// ═════════════════════════════════════════════════════════════════
describe('cambiarEstado — desbloqueo', () => {
  test('cierra bloqueo activo al salir de Bloqueada', async () => {
    // obtenerEntidad
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_1, estado: 'Bloqueada' }]));
    // cerrarBloqueoActivo UPDATE
    mockQuery.mockResolvedValueOnce(mockRows([]));
    // UPDATE estado
    mockQuery.mockResolvedValueOnce(mockRows([]));
    // registrarAuditoria
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_AUD }]));

    await cambiarEstado('Etapa', UUID_1, 'En_proceso', {
      idUsuario: UUID_USR,
      notaResolucion: 'Presupuesto aprobado'
    });

    // Verify UPDATE bloqueos was called with nota
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE bloqueos'),
      expect.arrayContaining(['Presupuesto aprobado', UUID_USR, 'Etapa', UUID_1])
    );
  });
});

// ═════════════════════════════════════════════════════════════════
// 8. validarCompletitud
// ═════════════════════════════════════════════════════════════════
describe('validarCompletitud', () => {
  test('retorna válido si no hay hijos', async () => {
    const result = await validarCompletitud('Subaccion', UUID_1);
    expect(result.valido).toBe(true);
  });

  test('retorna válido si todos los hijos están Completada/Cancelada', async () => {
    // Etapa tiene hijos tipo Accion
    mockQuery.mockResolvedValueOnce(mockRows([])); // no hay pendientes
    const result = await validarCompletitud('Etapa', UUID_1);
    expect(result.valido).toBe(true);
  });

  test('retorna inválido si hay hijos pendientes', async () => {
    mockQuery.mockResolvedValueOnce(mockRows([
      { id: UUID_2, nombre: 'Acción X', estado: 'En_proceso' }
    ]));
    const result = await validarCompletitud('Etapa', UUID_1);
    expect(result.valido).toBe(false);
    expect(result.hijosNoCumplidos).toHaveLength(1);
    expect(result.hijosNoCumplidos[0].nombre).toBe('Acción X');
  });
});

// ═════════════════════════════════════════════════════════════════
// 9. cambiarEstado — Completada rechaza hijos pendientes
// ═════════════════════════════════════════════════════════════════
describe('cambiarEstado — completitud', () => {
  test('rechaza Completada si hay hijos sin completar', async () => {
    // obtenerEntidad
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_1, estado: 'En_proceso' }]));
    // validarCompletitud query (hijos tipo Accion con filtro)
    mockQuery.mockResolvedValueOnce(mockRows([
      { id: UUID_2, nombre: 'Sub X', estado: 'Pendiente' }
    ]));

    await expect(
      cambiarEstado('Etapa', UUID_1, 'Completada', { idUsuario: UUID_USR })
    ).rejects.toThrow('hijos sin completar');
  });
});

// ═════════════════════════════════════════════════════════════════
// 10. cambiarEstado — cascada de cancelación
// ═════════════════════════════════════════════════════════════════
describe('cambiarEstado — cascada cancelación', () => {
  test('cancela descendientes al cancelar una etapa', async () => {
    // obtenerEntidad (etapa)
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_1, estado: 'En_proceso' }]));
    // UPDATE estado etapa
    mockQuery.mockResolvedValueOnce(mockRows([]));
    // registrarAuditoria raíz
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_AUD }]));
    // cascadaCancelacion: obtener hijos Accion
    mockQuery.mockResolvedValueOnce(mockRows([
      { id: UUID_2, nombre: 'Acción hija', estado: 'Pendiente' }
    ]));
    // UPDATE acciones batch
    mockQuery.mockResolvedValueOnce(mockRows([]));
    // UPDATE bloqueos batch
    mockQuery.mockResolvedValueOnce(mockRows([]));
    // registrarAuditoria del hijo
    mockQuery.mockResolvedValueOnce(mockRows([{ id: 'aud-hijo' }]));
    // cascada recursiva del hijo (Accion → Subaccion): obtener subacciones
    mockQuery.mockResolvedValueOnce(mockRows([])); // sin subacciones

    const result = await cambiarEstado('Etapa', UUID_1, 'Cancelada', {
      idUsuario: UUID_USR
    });

    expect(result.estadoNuevo).toBe('Cancelada');

    // Verify batch UPDATE acciones SET estado = 'Cancelada'
    const updateCall = mockQuery.mock.calls.find(call =>
      typeof call[0] === 'string' &&
      call[0].includes("SET estado = 'Cancelada'") &&
      call[0].includes('ANY')
    );
    expect(updateCall).toBeDefined();

    // Verify auditoría del hijo tiene id_evento_origen
    const auditCall = mockQuery.mock.calls.find(call =>
      typeof call[0] === 'string' &&
      call[0].includes('INSERT INTO auditoria') &&
      call[1] && call[1][5] === UUID_AUD // id_evento_origen
    );
    expect(auditCall).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════
// 11. validarReactivacion
// ═════════════════════════════════════════════════════════════════
describe('validarReactivacion', () => {
  test('permite reactivar si padre no está cancelado', async () => {
    // obtenerEntidad del padre (Etapa)
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_2, estado: 'En_proceso' }]));
    // No debería lanzar
    await expect(
      validarReactivacion('Accion', { id_etapa: UUID_2, id_proyecto: null }, undefined)
    ).resolves.not.toThrow();
  });

  test('rechaza reactivación si padre está cancelado', async () => {
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_2, estado: 'Cancelada' }]));
    await expect(
      validarReactivacion('Accion', { id_etapa: UUID_2, id_proyecto: null }, undefined)
    ).rejects.toThrow('padre está cancelado');
  });

  test('permite reactivar proyecto (raíz, sin padre)', async () => {
    await expect(
      validarReactivacion('Proyecto', { id: UUID_1 }, undefined)
    ).resolves.not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════
// 12. crearBloqueo — unicidad
// ═════════════════════════════════════════════════════════════════
describe('crearBloqueo', () => {
  test('crea bloqueo exitosamente', async () => {
    mockQuery.mockResolvedValueOnce(mockRows([]));
    await expect(
      crearBloqueo('Accion', UUID_1, 'Motivo test', UUID_USR)
    ).resolves.not.toThrow();
  });

  test('lanza 409 si ya existe bloqueo activo (unique_violation)', async () => {
    const err = new Error('unique_violation');
    err.code = '23505';
    mockQuery.mockRejectedValueOnce(err);
    await expect(
      crearBloqueo('Accion', UUID_1, 'Otro motivo', UUID_USR)
    ).rejects.toThrow('Ya existe un bloqueo activo');
  });
});

// ═════════════════════════════════════════════════════════════════
// 13. registrarAuditoria
// ═════════════════════════════════════════════════════════════════
describe('registrarAuditoria', () => {
  test('inserta fila con id_evento_origen y retorna UUID', async () => {
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_AUD }]));
    const id = await registrarAuditoria(
      'acciones', UUID_1, 'Pendiente', 'En_proceso', UUID_USR, null
    );
    expect(id).toBe(UUID_AUD);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO auditoria'),
      expect.arrayContaining(['acciones', UUID_1, 'Pendiente', 'En_proceso', UUID_USR, null])
    );
  });

  test('pasa id_evento_origen en cascadas', async () => {
    const origenId = 'origen-uuid';
    mockQuery.mockResolvedValueOnce(mockRows([{ id: 'nuevo-id' }]));
    await registrarAuditoria(
      'acciones', UUID_2, 'En_proceso', 'Cancelada', UUID_USR, origenId
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('id_evento_origen'),
      expect.arrayContaining([origenId])
    );
  });
});

// ═════════════════════════════════════════════════════════════════
// 14. contarDescendientes
// ═════════════════════════════════════════════════════════════════
describe('contarDescendientes', () => {
  test('conteo para Proyecto retorna etapas, acciones, subacciones', async () => {
    mockQuery
      .mockResolvedValueOnce(mockCount(3))  // etapas
      .mockResolvedValueOnce(mockCount(10)) // acciones
      .mockResolvedValueOnce(mockCount(5)); // subacciones

    const result = await contarDescendientes('Proyecto', UUID_1);
    expect(result).toEqual({ etapas: 3, acciones: 10, subacciones: 5 });
  });

  test('conteo para Etapa retorna acciones y subacciones', async () => {
    mockQuery
      .mockResolvedValueOnce(mockCount(4))  // acciones
      .mockResolvedValueOnce(mockCount(2)); // subacciones

    const result = await contarDescendientes('Etapa', UUID_1);
    expect(result).toEqual({ etapas: 0, acciones: 4, subacciones: 2 });
  });

  test('conteo para Accion retorna solo subacciones', async () => {
    mockQuery.mockResolvedValueOnce(mockCount(7));

    const result = await contarDescendientes('Accion', UUID_1);
    expect(result).toEqual({ etapas: 0, acciones: 0, subacciones: 7 });
  });

  test('conteo para Subaccion retorna todo en cero', async () => {
    const result = await contarDescendientes('Subaccion', UUID_1);
    expect(result).toEqual({ etapas: 0, acciones: 0, subacciones: 0 });
  });
});

// ═════════════════════════════════════════════════════════════════
// 15. cambiarEstado — reactivación desde Cancelada
// ═════════════════════════════════════════════════════════════════
describe('cambiarEstado — reactivación', () => {
  test('permite reactivar acción si padre etapa no está cancelado', async () => {
    // obtenerEntidad (accion cancelada)
    mockQuery.mockResolvedValueOnce(mockRows([{
      id: UUID_1, estado: 'Cancelada',
      id_etapa: UUID_2, id_proyecto: null, id_accion_padre: null
    }]));
    // validarReactivacion: obtenerEntidad del padre (etapa)
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_2, estado: 'En_proceso' }]));
    // UPDATE estado
    mockQuery.mockResolvedValueOnce(mockRows([]));
    // registrarAuditoria
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_AUD }]));

    const result = await cambiarEstado('Accion', UUID_1, 'Pendiente', {
      idUsuario: UUID_USR
    });
    expect(result.estadoAnterior).toBe('Cancelada');
    expect(result.estadoNuevo).toBe('Pendiente');
  });

  test('rechaza reactivación si padre está cancelado', async () => {
    // obtenerEntidad (subaccion cancelada)
    mockQuery.mockResolvedValueOnce(mockRows([{
      id: UUID_1, estado: 'Cancelada',
      id_accion_padre: UUID_2
    }]));
    // validarReactivacion: obtenerEntidad del padre (accion)
    mockQuery.mockResolvedValueOnce(mockRows([{ id: UUID_2, estado: 'Cancelada' }]));

    await expect(
      cambiarEstado('Subaccion', UUID_1, 'Pendiente', { idUsuario: UUID_USR })
    ).rejects.toThrow('padre está cancelado');
  });
});
