/**
 * ARCHIVO: autorizacion.test.js
 * PROPÓSITO: Fase 1 del modelo de permisos (docs/modelo-permisos.md) —
 *            confirma que cada función con nombre de autorizacion.js
 *            compara contra el peldaño mínimo correcto de la tabla
 *            aprobada, delegando siempre en funcion-efectiva.js (nunca
 *            una cadena de OR propia).
 *
 * Ejecutar: npm test
 */

const UUID_1 = '00000000-0000-0000-0000-000000000001';
const USUARIO = { id: UUID_1, rol: 'enlace' };

const mockFuncionEfectivaEnProyecto = jest.fn();
const mockFuncionEfectivaEnNodo = jest.fn();
const mockResolverElementoPadre = jest.fn();

jest.mock('../utils/funcion-efectiva', () => {
  const real = jest.requireActual('../utils/funcion-efectiva');
  return {
    ...real,
    funcionEfectivaEnProyecto: (...a) => mockFuncionEfectivaEnProyecto(...a),
    funcionEfectivaEnNodo: (...a) => mockFuncionEfectivaEnNodo(...a),
    resolverElementoPadre: (...a) => mockResolverElementoPadre(...a),
  };
});

const autorizacion = require('../utils/autorizacion');

beforeEach(() => {
  mockFuncionEfectivaEnProyecto.mockReset();
  mockFuncionEfectivaEnNodo.mockReset();
  mockResolverElementoPadre.mockReset();
});

describe('facultades de proyecto — peldaño mínimo correcto', () => {
  test('puedeEditarContenidoProyecto exige captura', async () => {
    mockFuncionEfectivaEnProyecto.mockResolvedValueOnce({ peldano: 'captura', via: 'proyecto' });
    expect(await autorizacion.puedeEditarContenidoProyecto({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(true);

    mockFuncionEfectivaEnProyecto.mockResolvedValueOnce({ peldano: 'lectura', via: 'proyecto' });
    expect(await autorizacion.puedeEditarContenidoProyecto({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(false);
  });

  test('puedeGestionarParticipantes exige responsable (no basta con captura)', async () => {
    mockFuncionEfectivaEnProyecto.mockResolvedValueOnce({ peldano: 'captura', via: 'proyecto' });
    expect(await autorizacion.puedeGestionarParticipantes({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(false);

    mockFuncionEfectivaEnProyecto.mockResolvedValueOnce({ peldano: 'responsable', via: 'proyecto' });
    expect(await autorizacion.puedeGestionarParticipantes({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(true);
  });

  test('puedeEditarProyecto y puedeGestionarProyecto exigen administracion_proyecto (no basta con responsable)', async () => {
    mockFuncionEfectivaEnProyecto.mockResolvedValueOnce({ peldano: 'responsable', via: 'ejecutivo_dg' });
    expect(await autorizacion.puedeEditarProyecto({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(false);

    mockFuncionEfectivaEnProyecto.mockResolvedValueOnce({ peldano: 'administracion_proyecto', via: 'creador' });
    expect(await autorizacion.puedeEditarProyecto({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(true);

    mockFuncionEfectivaEnProyecto.mockResolvedValueOnce({ peldano: 'responsable', via: 'ejecutivo_dg' });
    expect(await autorizacion.puedeGestionarProyecto({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(false);
  });

  test('un ejecutivo de la misma DG (responsable) puede editar contenido y gestionar participantes, pero no eliminar/editar ficha', async () => {
    mockFuncionEfectivaEnProyecto.mockResolvedValue({ peldano: 'responsable', via: 'ejecutivo_dg' });
    expect(await autorizacion.puedeEditarContenidoProyecto({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(true);
    expect(await autorizacion.puedeGestionarParticipantes({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(true);
    expect(await autorizacion.puedeGestionarProyecto({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(false);
    expect(await autorizacion.puedeEditarProyecto({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(false);
  });

  test('un ejecutivo de OTRA DG no escribe nada (funcionEfectiva devuelve null)', async () => {
    mockFuncionEfectivaEnProyecto.mockResolvedValue(null);
    expect(await autorizacion.puedeEditarContenidoProyecto({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(false);
    expect(await autorizacion.puedeGestionarParticipantes({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(false);
    expect(await autorizacion.puedeEditarProyecto({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(false);
    expect(await autorizacion.puedeGestionarProyecto({ usuario: USUARIO, idProyecto: UUID_1 })).toBe(false);
  });

  test('sin usuario o sin idProyecto, siempre false sin tocar funcionEfectiva', async () => {
    expect(await autorizacion.puedeEditarContenidoProyecto({ usuario: null, idProyecto: UUID_1 })).toBe(false);
    expect(await autorizacion.puedeGestionarProyecto({ usuario: USUARIO, idProyecto: null })).toBe(false);
    expect(mockFuncionEfectivaEnProyecto).not.toHaveBeenCalled();
  });
});

describe('facultades de nodo — peldaño mínimo correcto', () => {
  test('puedeEditarNodo exige captura', async () => {
    mockFuncionEfectivaEnNodo.mockResolvedValueOnce({ peldano: 'captura', via: 'invitacion' });
    expect(await autorizacion.puedeEditarNodo({ usuario: USUARIO, tipoNodo: 'etapa', idNodo: UUID_1 })).toBe(true);

    mockFuncionEfectivaEnNodo.mockResolvedValueOnce(null);
    expect(await autorizacion.puedeEditarNodo({ usuario: USUARIO, tipoNodo: 'etapa', idNodo: UUID_1 })).toBe(false);
  });

  test('puedeGestionarParticipantesNodo exige responsable en el nodo', async () => {
    mockFuncionEfectivaEnNodo.mockResolvedValueOnce({ peldano: 'captura', via: 'invitacion' });
    expect(await autorizacion.puedeGestionarParticipantesNodo({ usuario: USUARIO, tipoNodo: 'etapa', idNodo: UUID_1 })).toBe(false);

    mockFuncionEfectivaEnNodo.mockResolvedValueOnce({ peldano: 'responsable', via: 'invitacion' });
    expect(await autorizacion.puedeGestionarParticipantesNodo({ usuario: USUARIO, tipoNodo: 'etapa', idNodo: UUID_1 })).toBe(true);
  });
});

describe('puedeGestionarNodo (eliminar / crear hijo) — evalúa el PADRE, no el nodo', () => {
  test('eliminar una acción exige responsable en la ETAPA (su padre), no en la acción misma', async () => {
    mockResolverElementoPadre.mockResolvedValueOnce({ tipo: 'etapa', id: 'etapa-1' });
    mockFuncionEfectivaEnNodo.mockResolvedValueOnce({ peldano: 'responsable', via: 'invitacion' });

    const permitido = await autorizacion.puedeGestionarNodo({ usuario: USUARIO, tipoNodo: 'accion', idNodo: UUID_1 });

    expect(permitido).toBe(true);
    expect(mockResolverElementoPadre).toHaveBeenCalledWith('accion', UUID_1, undefined);
    expect(mockFuncionEfectivaEnNodo).toHaveBeenCalledWith(USUARIO, 'etapa', 'etapa-1', undefined);
  });

  test('ser solo "captura" en la etapa padre NO alcanza para eliminar la acción', async () => {
    mockResolverElementoPadre.mockResolvedValueOnce({ tipo: 'etapa', id: 'etapa-1' });
    mockFuncionEfectivaEnNodo.mockResolvedValueOnce({ peldano: 'captura', via: 'invitacion' });

    expect(await autorizacion.puedeGestionarNodo({ usuario: USUARIO, tipoNodo: 'accion', idNodo: UUID_1 })).toBe(false);
  });

  test('eliminar una etapa de primer nivel exige responsable A NIVEL PROYECTO (su padre es el proyecto)', async () => {
    mockResolverElementoPadre.mockResolvedValueOnce({ tipo: 'proyecto', id: 'proyecto-1' });
    mockFuncionEfectivaEnProyecto.mockResolvedValueOnce({ peldano: 'responsable', via: 'ejecutivo_dg' });

    const permitido = await autorizacion.puedeGestionarNodo({ usuario: USUARIO, tipoNodo: 'etapa', idNodo: UUID_1 });

    expect(permitido).toBe(true);
    expect(mockFuncionEfectivaEnProyecto).toHaveBeenCalledWith(USUARIO, 'proyecto-1', undefined);
  });

  test('sin padre resoluble, siempre false', async () => {
    mockResolverElementoPadre.mockResolvedValueOnce(null);
    expect(await autorizacion.puedeGestionarNodo({ usuario: USUARIO, tipoNodo: 'etapa', idNodo: UUID_1 })).toBe(false);
  });
});

describe('resolverAccesoProyecto / resolverAccesoNodo — devuelven la vía para la bitácora', () => {
  test('propaga peldano y via sin transformarlos', async () => {
    mockFuncionEfectivaEnProyecto.mockResolvedValueOnce({ peldano: 'responsable', via: 'ejecutivo_dg' });
    const r = await autorizacion.resolverAccesoProyecto(USUARIO, UUID_1, 'responsable');
    expect(r).toEqual({ permitido: true, via: 'ejecutivo_dg', peldano: 'responsable' });
  });

  test('sin ninguna vía, via es null y permitido es false', async () => {
    mockFuncionEfectivaEnProyecto.mockResolvedValueOnce(null);
    const r = await autorizacion.resolverAccesoProyecto(USUARIO, UUID_1, 'captura');
    expect(r).toEqual({ permitido: false, via: null, peldano: null });
  });
});
