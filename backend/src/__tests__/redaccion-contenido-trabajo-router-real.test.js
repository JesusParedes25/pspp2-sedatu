/**
 * ARCHIVO: redaccion-contenido-trabajo-router-real.test.js
 * PROPÓSITO: paso 14 DGTIC — los siete endpoints que mezclan seguimiento
 *            (abierto a cualquier interno) con contenido de trabajo
 *            (comentarios/documentos-evidencias/riesgos) NO se bloquean
 *            para quien no participa: se redacta solo el campo de
 *            contenido, dentro de la misma respuesta 200 (ver
 *            utils/redaccion-contenido-trabajo.js y
 *            docs/modelo-permisos.md 5.1).
 *
 *   - GET /proyectos/:id/stats
 *   - GET /proyectos/:id/portada-resumen
 *   - GET /proyectos/:id/actividad-reciente
 *   - GET /proyectos/:id/bitacora
 *   - GET /proyectos/:id/panorama
 *   - GET /proyectos/:id/panorama-rapido
 *   - GET /actividad/:tipo_nodo/:id_nodo   (hallazgo adicional, fuera de
 *     los 6 originales — mezcla avance con comentario/archivo/riesgo
 *     para CUALQUIER tipo de nodo, no solo tareas)
 *
 * Mismo método real-router que paso 13 y el resto de este paso: se monta
 * el router real sobre un servidor Express real y se hacen peticiones
 * `fetch` reales. A diferencia de los archivos de solo-403 de este mismo
 * paso, aquí TODAS las peticiones deben salir 200 — lo que cambia entre
 * cuentas es el CONTENIDO del cuerpo, nunca el código de estado (por
 * diseño: redactar, no bloquear). Por eso cada caso afirma explícitamente
 * que el campo de contenido viene presente (participa) o null/ausente
 * (no participa) — una prueba que solo mirara el status no probaría nada
 * aquí.
 *
 * Ejecutar: npm test (el archivo aislado CUELGA en este entorno, ver nota
 * de paso 13 — correr siempre la suite completa sin filtro).
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

const PROYECTO_A = '00000000-0000-0000-0000-0000000000a1';
const ETAPA_A = '00000000-0000-0000-0000-0000000000a2';

const PARTICIPA = { id: 'u-participa', rol: 'enlace' };
const NO_PARTICIPA = { id: 'u-ajeno', rol: 'enlace' };

const TEXTO_COMENTARIO = 'Texto sensible del comentario de prueba';
const NOMBRE_ARCHIVO = 'oficio-sensible.pdf';
const TITULO_RIESGO = 'Titulo sensible del riesgo';
const DESCRIPCION_RIESGO = 'Descripcion sensible del riesgo';

function mockPool() {
  pool.query.mockImplementation((sql, params) => {
    // ── Resolución de participación (funcion-efectiva.js / autorizacion.js) ──
    if (/FROM proyectos WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_creador: null, id_dg_lider: null }] });
    }
    if (/FROM proyecto_usuarios WHERE id_proyecto = \$1 AND id_usuario = \$2/.test(sql)) {
      const [, idUsuario] = params;
      return Promise.resolve({ rows: idUsuario === PARTICIPA.id ? [{ rol: 'lectura' }] : [] });
    }
    if (/FROM nodo_miembros/.test(sql)) return Promise.resolve({ rows: [] });
    if (/FROM etapas WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A, id_responsable: null }] });
    }
    if (/FROM acciones WHERE id = \$1/.test(sql)) {
      return Promise.resolve({ rows: [{ id_proyecto: PROYECTO_A, id_etapa: null, id_accion_padre: null, id_responsable: null }] });
    }

    // ── Fila "proyecto" cruda, para los controllers que la piden directo ──
    if (sql.includes('FROM proyectos p')) {
      return Promise.resolve({ rows: [{ id: PROYECTO_A, porcentaje_calculado: 50, deleted_at: null }] });
    }

    // ── proyectos.stats.queries.js::obtenerActividadReciente ──
    if (sql.includes("'comentario' AS tipo")) {
      return Promise.resolve({
        rows: [
          { tipo: 'comentario', created_at: new Date(), actor: 'Fulano', actor_dg: 'DGX', descripcion: TEXTO_COMENTARIO, entidad_tipo: 'Proyecto', entidad_id: PROYECTO_A },
          { tipo: 'evidencia', created_at: new Date(), actor: 'Fulano', actor_dg: 'DGX', descripcion: NOMBRE_ARCHIVO, entidad_tipo: 'Evidencia', entidad_id: 'ev-1' },
        ],
      });
    }

    // ── proyectos.stats.queries.js::obtenerRiesgosDetalle ──
    if (sql.includes('AS etiqueta') && sql.includes('FROM riesgos r')) {
      return Promise.resolve({
        rows: [{ id: 'r-1', titulo: TITULO_RIESGO, nivel: 'Alto', estado: 'Abierto', descripcion: DESCRIPCION_RIESGO, entidad_tipo: 'Proyecto', entidad_id: PROYECTO_A, etiqueta: 'Mi Proyecto' }],
      });
    }

    // ── inicio.queries.js::obtenerActividadReciente (actividad_log, multi-proyecto) ──
    if (sql.includes('indicador_nombre')) {
      return Promise.resolve({
        rows: [{ id: 'al-1', tipo: 'comentario', titulo: 'Comentario publicado', descripcion: TEXTO_COMENTARIO, entidad_tipo: 'Etapa', entidad_id: ETAPA_A, metadata: {}, created_at: new Date(), proyecto_id: PROYECTO_A, proyecto_nombre: 'Mi Proyecto', dg_siglas: 'DGX', actor: 'Fulano', actor_id: 'u-1', tipo_nodo: 'etapa', etapa_nombre: 'Etapa 1' }],
      });
    }

    // ── bitacora.queries.js::obtenerBitacoraProyecto ──
    if (sql.includes('FROM todo')) {
      if (sql.includes('COUNT(*)::int AS total FROM todo')) {
        return Promise.resolve({ rows: [{ total: 1 }] });
      }
      return Promise.resolve({
        rows: [{ id: 'b-1', categoria: 'comentario', titulo: 'Comentario', contenido: TEXTO_COMENTARIO, autor_id: 'u-1', autor_nombre: 'Fulano', created_at: new Date(), nodo_tipo: 'etapa', nodo_id: ETAPA_A, nodo_nombre: 'Etapa 1', metadata: {} }],
      });
    }

    // ── actividad.queries.js::obtenerActividadNodo ──
    if (sql.includes("'comentario'::text AS tipo_evento")) {
      return Promise.resolve({ rows: [{ id: 'n-1', tipo_evento: 'comentario', contenido: TEXTO_COMENTARIO, archivo_url: null, archivo_nombre: null, metadata: {}, created_at: new Date(), autor_nombre: 'Fulano' }] });
    }
    if (sql.includes("'archivo'::text AS tipo_evento")) {
      return Promise.resolve({ rows: [{ id: 'n-2', tipo_evento: 'archivo', contenido: NOMBRE_ARCHIVO, archivo_url: 'ruta/al/archivo.pdf', archivo_nombre: NOMBRE_ARCHIVO, metadata: {}, created_at: new Date(), autor_nombre: 'Fulano' }] });
    }
    if (sql.includes("'riesgo'::text AS tipo_evento")) {
      return Promise.resolve({ rows: [{ id: 'n-3', tipo_evento: 'riesgo', contenido: DESCRIPCION_RIESGO, archivo_url: null, archivo_nombre: null, metadata: { nivel: 'Alto', estado: 'Abierto' }, created_at: new Date(), autor_nombre: 'Fulano' }] });
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

describe('GET /proyectos/:id/stats', () => {
  const ruta = `/proyectos/${PROYECTO_A}/stats`;

  test('participa: ve el texto del comentario y el detalle del riesgo', async () => {
    const { status, cuerpo } = await pedir(ruta, PARTICIPA);
    expect(status).toBe(200);
    const comentario = cuerpo.datos.actividad.find((a) => a.tipo === 'comentario');
    expect(comentario.descripcion).toBe(TEXTO_COMENTARIO);
    expect(cuerpo.datos.riesgos_detalle[0].titulo).toBe(TITULO_RIESGO);
    expect(cuerpo.datos.riesgos_detalle[0].descripcion).toBe(DESCRIPCION_RIESGO);
    // Seguimiento (no es contenido de trabajo): se queda, aunque no participe.
    expect(cuerpo.datos.riesgos_detalle[0].nivel).toBe('Alto');
  });

  test('no participa: 200, pero el comentario y el riesgo vienen sin contenido', async () => {
    const { status, cuerpo } = await pedir(ruta, NO_PARTICIPA);
    expect(status).toBe(200);
    const comentario = cuerpo.datos.actividad.find((a) => a.tipo === 'comentario');
    expect(comentario.descripcion).toBeNull();
    expect(cuerpo.datos.riesgos_detalle[0].titulo).toBeNull();
    expect(cuerpo.datos.riesgos_detalle[0].descripcion).toBeNull();
    expect(cuerpo.datos.riesgos_detalle[0].nivel).toBe('Alto');
  });
});

describe('GET /proyectos/:id/portada-resumen', () => {
  const ruta = `/proyectos/${PROYECTO_A}/portada-resumen`;

  test('participa: ultimo_movimiento trae el texto', async () => {
    const { status, cuerpo } = await pedir(ruta, PARTICIPA);
    expect(status).toBe(200);
    expect(cuerpo.datos.ultimo_movimiento.descripcion).toBe(TEXTO_COMENTARIO);
  });

  test('no participa: ultimo_movimiento sin texto', async () => {
    const { status, cuerpo } = await pedir(ruta, NO_PARTICIPA);
    expect(status).toBe(200);
    expect(cuerpo.datos.ultimo_movimiento.descripcion).toBeNull();
  });
});

describe('GET /proyectos/:id/actividad-reciente', () => {
  const ruta = `/proyectos/${PROYECTO_A}/actividad-reciente`;

  test('participa: ve el texto del comentario', async () => {
    const { status, cuerpo } = await pedir(ruta, PARTICIPA);
    expect(status).toBe(200);
    expect(cuerpo.datos[0].descripcion).toBe(TEXTO_COMENTARIO);
  });

  test('no participa: comentario sin texto', async () => {
    const { status, cuerpo } = await pedir(ruta, NO_PARTICIPA);
    expect(status).toBe(200);
    expect(cuerpo.datos[0].descripcion).toBeNull();
  });
});

describe('GET /proyectos/:id/bitacora', () => {
  const ruta = `/proyectos/${PROYECTO_A}/bitacora`;

  test('participa: ve el contenido del renglón de comentario', async () => {
    const { status, cuerpo } = await pedir(ruta, PARTICIPA);
    expect(status).toBe(200);
    expect(cuerpo.datos[0].contenido).toBe(TEXTO_COMENTARIO);
  });

  test('no participa: renglón sin contenido, pero con titulo/autor/fecha', async () => {
    const { status, cuerpo } = await pedir(ruta, NO_PARTICIPA);
    expect(status).toBe(200);
    expect(cuerpo.datos[0].contenido).toBeNull();
    expect(cuerpo.datos[0].titulo).toBe('Comentario');
    expect(cuerpo.datos[0].autor_nombre).toBe('Fulano');
  });
});

describe('GET /proyectos/:id/panorama', () => {
  const ruta = `/proyectos/${PROYECTO_A}/panorama`;

  test('participa: ve riesgos y actividad con contenido', async () => {
    const { status, cuerpo } = await pedir(ruta, PARTICIPA);
    expect(status).toBe(200);
    expect(cuerpo.datos.riesgos[0].titulo).toBe(TITULO_RIESGO);
    const comentario = cuerpo.datos.actividad.find((a) => a.tipo === 'comentario');
    expect(comentario.descripcion).toBe(TEXTO_COMENTARIO);
  });

  test('no participa: riesgos y actividad sin contenido', async () => {
    const { status, cuerpo } = await pedir(ruta, NO_PARTICIPA);
    expect(status).toBe(200);
    expect(cuerpo.datos.riesgos[0].titulo).toBeNull();
    const comentario = cuerpo.datos.actividad.find((a) => a.tipo === 'comentario');
    expect(comentario.descripcion).toBeNull();
  });
});

describe('GET /proyectos/:id/panorama-rapido', () => {
  const ruta = `/proyectos/${PROYECTO_A}/panorama-rapido`;

  test('participa: ve el texto de la actividad', async () => {
    const { status, cuerpo } = await pedir(ruta, PARTICIPA);
    expect(status).toBe(200);
    expect(cuerpo.datos.actividad[0].descripcion).toBe(TEXTO_COMENTARIO);
  });

  test('no participa: actividad sin texto', async () => {
    const { status, cuerpo } = await pedir(ruta, NO_PARTICIPA);
    expect(status).toBe(200);
    expect(cuerpo.datos.actividad[0].descripcion).toBeNull();
  });
});

describe('GET /actividad/:tipo_nodo/:id_nodo (hallazgo adicional, no estaba en los 6 originales)', () => {
  const ruta = `/actividad/etapa/${ETAPA_A}`;

  test('participa: ve comentario, archivo (con nombre y liga) y riesgo', async () => {
    const { status, cuerpo } = await pedir(ruta, PARTICIPA);
    expect(status).toBe(200);
    const comentario = cuerpo.datos.find((e) => e.tipo_evento === 'comentario');
    const archivo = cuerpo.datos.find((e) => e.tipo_evento === 'archivo');
    const riesgo = cuerpo.datos.find((e) => e.tipo_evento === 'riesgo');
    expect(comentario.contenido).toBe(TEXTO_COMENTARIO);
    expect(archivo.contenido).toBe(NOMBRE_ARCHIVO);
    expect(archivo.archivo_url).toBe('ruta/al/archivo.pdf');
    expect(archivo.archivo_nombre).toBe(NOMBRE_ARCHIVO);
    expect(riesgo.contenido).toBe(DESCRIPCION_RIESGO);
  });

  test('no participa: comentario/archivo/riesgo sin contenido ni liga de archivo', async () => {
    const { status, cuerpo } = await pedir(ruta, NO_PARTICIPA);
    expect(status).toBe(200);
    const comentario = cuerpo.datos.find((e) => e.tipo_evento === 'comentario');
    const archivo = cuerpo.datos.find((e) => e.tipo_evento === 'archivo');
    const riesgo = cuerpo.datos.find((e) => e.tipo_evento === 'riesgo');
    expect(comentario.contenido).toBeNull();
    expect(archivo.contenido).toBeNull();
    expect(archivo.archivo_url).toBeNull();
    expect(archivo.archivo_nombre).toBeNull();
    expect(riesgo.contenido).toBeNull();
  });
});
