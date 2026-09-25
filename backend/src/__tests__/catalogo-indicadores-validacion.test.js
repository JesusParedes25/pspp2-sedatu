/**
 * ARCHIVO: catalogo-indicadores-validacion.test.js
 * PROPÓSITO: Tests de la validación de servidor para los metadatos de
 *            importación institucional del catálogo de indicadores
 *            (instrumento, codigo_linea_accion, area_sugerida) — antes
 *            solo existía el CHECK de la migración 073 en la base de
 *            datos, que para un VARCHAR fuera de longitud ni siquiera
 *            devolvía un 400 claro (caía al 500 genérico).
 *
 * Ejecutar: npm test
 */

const mockQuery = jest.fn();
jest.mock('../db/pool', () => ({
  query: (...args) => mockQuery(...args)
}));

const {
  crear,
  actualizar,
  validarMetadatosInstitucionales,
  INSTRUMENTOS_VALIDOS,
} = require('../db/queries/catalogo-indicadores.queries');

const UUID_1 = '00000000-0000-0000-0000-000000000001';

beforeEach(() => {
  mockQuery.mockReset();
});

// ═════════════════════════════════════════════════════════════════
// validarMetadatosInstitucionales() — validación pura, sin DB
// ═════════════════════════════════════════════════════════════════
describe('validarMetadatosInstitucionales', () => {
  test('rechaza un instrumento que no es ninguno de los 3 válidos', () => {
    expect(() => validarMetadatosInstitucionales({ instrumento: 'Instrumento inventado' }))
      .toThrow(/Instrumento inválido/);
  });

  test('el error de instrumento inválido trae statusCode 400 y codigo INSTRUMENTO_INVALIDO', () => {
    try {
      validarMetadatosInstitucionales({ instrumento: 'no existe' });
      throw new Error('no debió llegar aquí');
    } catch (err) {
      expect(err.statusCode).toBe(400);
      expect(err.codigo).toBe('INSTRUMENTO_INVALIDO');
    }
  });

  test.each(INSTRUMENTOS_VALIDOS)('acepta el instrumento válido "%s"', (instrumento) => {
    expect(() => validarMetadatosInstitucionales({ instrumento })).not.toThrow();
  });

  test('instrumento vacío o ausente no truena (es opcional)', () => {
    expect(() => validarMetadatosInstitucionales({})).not.toThrow();
    expect(() => validarMetadatosInstitucionales({ instrumento: '' })).not.toThrow();
    expect(() => validarMetadatosInstitucionales({ instrumento: null })).not.toThrow();
  });

  test('rechaza codigo_linea_accion de más de 15 caracteres', () => {
    const largo = '1.2.3.4.5.6.7.8.9'; // 17 caracteres
    expect(largo.length).toBeGreaterThan(15);
    try {
      validarMetadatosInstitucionales({ codigo_linea_accion: largo });
      throw new Error('no debió llegar aquí');
    } catch (err) {
      expect(err.statusCode).toBe(400);
      expect(err.codigo).toBe('CODIGO_LINEA_ACCION_LARGO');
    }
  });

  test('acepta codigo_linea_accion dentro del límite de 15 caracteres', () => {
    expect(() => validarMetadatosInstitucionales({ codigo_linea_accion: '4.5.1' })).not.toThrow();
  });

  test('rechaza area_sugerida de más de 120 caracteres', () => {
    const largo = 'A'.repeat(121);
    try {
      validarMetadatosInstitucionales({ area_sugerida: largo });
      throw new Error('no debió llegar aquí');
    } catch (err) {
      expect(err.statusCode).toBe(400);
      expect(err.codigo).toBe('AREA_SUGERIDA_LARGA');
    }
  });

  test('acepta area_sugerida dentro del límite de 120 caracteres, incluida la concatenación con "; "', () => {
    const dentroDelLimite = 'DGOTU; DGPV; RAN'.repeat(3).slice(0, 120);
    expect(() => validarMetadatosInstitucionales({ area_sugerida: dentroDelLimite })).not.toThrow();
  });

  test('caso feliz: los 3 campos válidos a la vez no truenan', () => {
    expect(() => validarMetadatosInstitucionales({
      instrumento: 'PSEDATU 2025-2030',
      codigo_linea_accion: '1.1.1',
      area_sugerida: 'DGOTU; DGPV',
    })).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════
// crear() — la validación corre ANTES de tocar la base de datos
// ═════════════════════════════════════════════════════════════════
describe('crear() — validación de servidor', () => {
  test('instrumento inválido: rechaza sin llegar a consultar la base', async () => {
    await expect(crear({ nombre: 'Un indicador', instrumento: 'Instrumento inventado' }))
      .rejects.toMatchObject({ statusCode: 400, codigo: 'INSTRUMENTO_INVALIDO' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('codigo_linea_accion fuera de longitud: rechaza sin llegar a consultar la base', async () => {
    await expect(crear({ nombre: 'Un indicador', codigo_linea_accion: '1.2.3.4.5.6.7.8.9' }))
      .rejects.toMatchObject({ statusCode: 400, codigo: 'CODIGO_LINEA_ACCION_LARGO' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('area_sugerida fuera de longitud: rechaza sin llegar a consultar la base', async () => {
    await expect(crear({ nombre: 'Un indicador', area_sugerida: 'A'.repeat(200) }))
      .rejects.toMatchObject({ statusCode: 400, codigo: 'AREA_SUGERIDA_LARGA' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('caso feliz: datos válidos llegan hasta el INSERT', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // chequeo de nombre repetido: nada
      .mockResolvedValueOnce({ rows: [] }) // claveDisponible: clave libre
      .mockResolvedValueOnce({ rows: [{ id: UUID_1, nombre: 'Un indicador nuevo' }] }); // INSERT

    const resultado = await crear({
      nombre: 'Un indicador nuevo',
      instrumento: 'PSEDATU 2025-2030',
      codigo_linea_accion: '1.1.1',
      area_sugerida: 'DGOTU',
    }, UUID_1);

    expect(resultado).toEqual({ id: UUID_1, nombre: 'Un indicador nuevo' });
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});

// ═════════════════════════════════════════════════════════════════
// actualizar() — misma validación, mismo criterio
// ═════════════════════════════════════════════════════════════════
describe('actualizar() — validación de servidor', () => {
  test('instrumento inválido: rechaza sin llegar a consultar la base', async () => {
    await expect(actualizar(UUID_1, { instrumento: 'Instrumento inventado' }))
      .rejects.toMatchObject({ statusCode: 400, codigo: 'INSTRUMENTO_INVALIDO' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('codigo_linea_accion fuera de longitud: rechaza sin llegar a consultar la base', async () => {
    await expect(actualizar(UUID_1, { codigo_linea_accion: '1.2.3.4.5.6.7.8.9' }))
      .rejects.toMatchObject({ statusCode: 400, codigo: 'CODIGO_LINEA_ACCION_LARGO' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('area_sugerida fuera de longitud: rechaza sin llegar a consultar la base', async () => {
    await expect(actualizar(UUID_1, { area_sugerida: 'A'.repeat(200) }))
      .rejects.toMatchObject({ statusCode: 400, codigo: 'AREA_SUGERIDA_LARGA' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  test('caso feliz: datos válidos llegan hasta el UPDATE', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: UUID_1, nombre: 'Actualizado', instrumento: 'PSEDATU 2025-2030' }] }); // UPDATE ... RETURNING *

    const resultado = await actualizar(UUID_1, {
      instrumento: 'PSEDATU 2025-2030',
      codigo_linea_accion: '2.3.4',
      area_sugerida: 'RAN',
    });

    expect(resultado.id).toBe(UUID_1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
