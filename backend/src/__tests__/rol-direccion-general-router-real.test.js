/**
 * ARCHIVO: rol-direccion-general-router-real.test.js
 * PROPÓSITO: paso 15 DGTIC — rol nuevo 'direccion_general', un nivel
 *            arriba de 'direccion' en la jerarquía institucional (una
 *            Dirección General contiene varias Direcciones de Área).
 *            Alcance: todos los proyectos de TODAS las áreas de su DG,
 *            en dos frentes distintos:
 *
 *   1. Vistas personalizadas (Tablero/Mapa/Mis indicadores/Documentos,
 *      utils/alcanceProyectos.js) — se prueba contra
 *      GET /inicio/filtros/proyectos, el endpoint más simple que expone
 *      directamente el resultado de alcanceProyectosUsuario (lista
 *      liviana {id,nombre}), sin el resto de GET /inicio (vencidos,
 *      riesgos, mapa, indicadores...) de por medio.
 *   2. Contenido de trabajo (comentarios/documentos/riesgos, paso 14
 *      DGTIC) — se prueba contra los mismos endpoints de participación
 *      real que ya cubre participacion-contenido-trabajo-router-real.test.js,
 *      con la cuenta nueva.
 *
 * Mismo método real-router que pasos 13/14: servidor Express real,
 * petición HTTP real con `fetch`, solo se mockean `db/pool`,
 * `utils/minio.js` y `verificarToken` (lee X-Test-Usuario).
 *
 * LO QUE ESTE ARCHIVO NO PRUEBA, A PROPÓSITO: el contraste "direccion de
 * un área NO alcanza los proyectos de otra área de su misma DG" — ese
 * acotamiento de 'direccion' (de nivel Dirección General a nivel
 * Dirección de Área) es un cambio aparte, pendiente de que el usuario
 * confirme el impacto en cuentas reales antes de implementarlo (ver
 * docs/modelo-permisos.md sección 9.1 y la nota en alcanceProyectos.js).
 * Hoy 'direccion' sigue viendo por DG completa, así que afirmar esa
 * separación aquí sería afirmar algo que el código todavía no hace.
 * Ver el test.todo al final.
 *
 * Ejecutar: npm test (el archivo aislado CUELGA en este entorno, ver
 * nota de paso 13 — correr siempre la suite completa sin filtro).
 */
const express = require('express');

jest.mock('../db/pool', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../utils/minio.js', () => ({
  minioClient: { bucketExists: jest.fn().mockResolvedValue(true), makeBucket: jest.fn() },
  BUCKET: 'test', PREFIJO: '', almacen: {}, claveFisica: (k) => k,
  normalizarPrefijo: () => '', esObjetoInexistente: () => false,
}));
jest.mock('../middleware/auth.middleware.js', () => ({
  verificarToken: (req, res, next) => {
    const cabecera = req.headers['x-test-usuario'];
    req.usuario = cabecera ? JSON.parse(cabecera) : { id: 'sin-cabecera', rol: 'externo' };
    next();
  },
  verificarTokenSesion: jest.fn(),
  autenticarArchivo: () => (req, res, next) => next(),
}));

const pool = require('../db/pool');
const errorHandler = require('../middleware/errorHandler');

const DGA = '00000000-0000-0000-0000-0000000000d1';
const DGB = '00000000-0000-0000-0000-0000000000d2';

const PROYECTO_A1 = { id: '00000000-0000-0000-0000-0000000000a1', nombre: 'Proyecto Area A1', dg: DGA };
const PROYECTO_A2 = { id: '00000000-0000-0000-0000-0000000000a2', nombre: 'Proyecto Area A2', dg: DGA };
const PROYECTO_B1 = { id: '00000000-0000-0000-0000-0000000000b1', nombre: 'Proyecto DGB 1', dg: DGB };
const TODOS_LOS_PROYECTOS = [PROYECTO_A1, PROYECTO_A2, PROYECTO_B1];

const DG_LIDER_POR_PROYECTO = Object.fromEntries(TODOS_LOS_PROYECTOS.map((p) => [p.id, p.dg]));
const PROYECTOS_POR_DG = { [DGA]: [PROYECTO_A1, PROYECTO_A2], [DGB]: [PROYECTO_B1] };

const DIRECCION_GENERAL_DGA = { id: 'u-dg-general-a', rol: 'direccion_general', id_dg: DGA };
const DIRECCION_GENERAL_DGB = { id: 'u-dg-general-b', rol: 'direccion_general', id_dg: DGB };
const ENLACE_AJENO = { id: 'u-enlace-ajeno', rol: 'enlace' };

function mockPool() {
  pool.query.mockImplementation((sql, params) => {
    // ── funcion-efectiva.js::funcionEfectivaEnProyecto — fila del proyecto ──
    if (/FROM proyectos WHERE id = \$1/.test(sql)) {
      const [id] = params;
      return Promise.resolve({ rows: [{ id_creador: null, id_dg_lider: DG_LIDER_POR_PROYECTO[id] || null }] });
    }
    if (/FROM proyecto_usuarios WHERE id_proyecto = \$1 AND id_usuario = \$2/.test(sql)) {
      return Promise.resolve({ rows: [] }); // nadie participa de verdad en estas pruebas
    }
    // ── alcanceProyectos.js::proyectosDeLaDG (el bono de DG) ──
    if (sql.includes('id_dg_lider = $1')) {
      const [idDg] = params;
      return Promise.resolve({ rows: (PROYECTOS_POR_DG[idDg] || []).map((p) => ({ id: p.id })) });
    }
    // ── inicio.controller.js::obtenerProyectosFiltro — fila final {id,nombre} ──
    if (sql.includes('SELECT id, nombre FROM proyectos') && sql.includes('id = ANY($1)')) {
      const [ids] = params;
      return Promise.resolve({ rows: TODOS_LOS_PROYECTOS.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id, nombre: p.nombre })) });
    }
    // ── miembrosQueries.obtenerProyectosUsuario (participación real — ninguna aquí) ──
    if (sql.includes('FROM proyectos p') && sql.includes('p.deleted_at IS NULL') && sql.includes('EXISTS')) {
      return Promise.resolve({ rows: [] });
    }
    return Promise.resolve({ rows: [] });
  });
  pool.connect.mockResolvedValue({ query: pool.query, release: jest.fn() });
}

let servidor, base;
let consoleErrorSpy;
beforeAll(() => { consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(() => consoleErrorSpy.mockRestore());

function levantar(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve({ servidor: s, base: `http://127.0.0.1:${s.address().port}/api/v1` }));
  });
}

beforeAll(async () => {
  const routes = require('../routes/index.js');
  const app = express();
  app.use(express.json());
  app.use('/api/v1', routes);
  app.use(errorHandler);
  ({ servidor, base } = await levantar(app));
});

afterAll(() => new Promise((resolve) => servidor.close(resolve)));
beforeEach(() => { jest.clearAllMocks(); mockPool(); });

async function pedir(ruta, usuario) {
  const r = await fetch(`${base}${ruta}`, { headers: { 'X-Test-Usuario': JSON.stringify(usuario) } });
  const texto = await r.text();
  return { status: r.status, cuerpo: texto ? JSON.parse(texto) : null };
}

describe('GET /inicio/filtros/proyectos — alcance de direccion_general (Tablero/Mapa/Mis indicadores)', () => {
  test('direccion_general de DGA ve los proyectos de TODAS las áreas de su DG (A1 y A2), no los de DGB', async () => {
    const { status, cuerpo } = await pedir('/inicio/filtros/proyectos', DIRECCION_GENERAL_DGA);
    expect(status).toBe(200);
    const ids = cuerpo.datos.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([PROYECTO_A1.id, PROYECTO_A2.id]));
    expect(ids).not.toContain(PROYECTO_B1.id);
  });

  test('direccion_general de DGB solo ve el proyecto de DGB, no los de DGA', async () => {
    const { status, cuerpo } = await pedir('/inicio/filtros/proyectos', DIRECCION_GENERAL_DGB);
    expect(status).toBe(200);
    const ids = cuerpo.datos.map((p) => p.id);
    expect(ids).toEqual([PROYECTO_B1.id]);
  });

  test('un enlace ajeno, sin participación ni bono de DG, no ve ninguno de los tres', async () => {
    const { status, cuerpo } = await pedir('/inicio/filtros/proyectos', ENLACE_AJENO);
    expect(status).toBe(200);
    expect(cuerpo.datos).toEqual([]);
  });
});

describe('Contenido de trabajo (paso 14) — direccion_general participa vía el bono de su DG', () => {
  test.each([
    { ruta: `/proyectos/${PROYECTO_A1.id}/riesgos` },
    { ruta: `/proyectos/${PROYECTO_A2.id}/riesgos` },
    { ruta: `/proyectos/${PROYECTO_A1.id}/evidencias` },
    { ruta: `/comentarios?entidad_tipo=Proyecto&entidad_id=${PROYECTO_A1.id}` },
  ])('direccion_general de DGA en $ruta: no 403 (participa vía direccion_general_dg)', async ({ ruta }) => {
    const { status } = await pedir(ruta, DIRECCION_GENERAL_DGA);
    expect(status).not.toBe(403);
  });

  test.each([
    { ruta: `/proyectos/${PROYECTO_A1.id}/riesgos` },
    { ruta: `/proyectos/${PROYECTO_A2.id}/riesgos` },
    { ruta: `/proyectos/${PROYECTO_A1.id}/evidencias` },
    { ruta: `/comentarios?entidad_tipo=Proyecto&entidad_id=${PROYECTO_A1.id}` },
  ])('direccion_general de DGB en $ruta (proyecto de DGA): 403 SIN_PARTICIPACION', async ({ ruta }) => {
    const { status, cuerpo } = await pedir(ruta, DIRECCION_GENERAL_DGB);
    expect(status).toBe(403);
    expect(cuerpo.codigo).toBe('SIN_PARTICIPACION');
  });
});

// Pendiente de CAMBIO 1 (acotar 'direccion' de nivel DG a nivel Dirección
// de Área) — una vez implementado y con el impacto confirmado, esta
// prueba demuestra que una 'direccion' de un área NO alcanza los
// proyectos de otra área de su misma DG, y que 'direccion_general' de
// esa misma DG SÍ alcanza los dos. Hoy 'direccion' todavía ve por DG
// completa, así que no se afirma aquí algo que el código no hace.
test.todo("CAMBIO 1 pendiente: 'direccion' de un área no alcanza los proyectos de otra área de su misma DG; 'direccion_general' de esa DG sí alcanza los dos");
