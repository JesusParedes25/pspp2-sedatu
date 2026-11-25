// @vitest-environment jsdom
/**
 * ARCHIVO: generarReportePDF.test.js
 * PROPÓSITO: paso 17 DGTIC, PARTE C — jspdf se sube de 2.x a 4.x (y
 *            jspdf-autotable de 3.x a 5.x) para cerrar la vulnerabilidad
 *            de dompurify. Esta suite ejercita la función REAL
 *            (generarReportePDF), sin reimplementar su lógica, con los
 *            únicos dos mocks que tienen sentido en la frontera de red
 *            (client.get, evidenciasApi, fetch del logo) — jsPDF y
 *            jspdf-autotable corren de verdad, para que un cambio de
 *            versión que rompa alguna llamada (addImage, splitTextToSize,
 *            autoTable(doc, {...}), output/save) se note aquí.
 *
 * No hay forma de "leer" el texto del PDF resultante sin una librería de
 * parseo aparte, así que las aserciones se quedan en lo verificable sin
 * una: que no lance, que genere el número de páginas esperado (ver nota
 * en generarReportePDF.js — el rótulo "Pág. X/Y" ya traía un conteo
 * desincronizado de las páginas reales desde antes de este cambio; no es
 * parte de esta ronda, así que aquí se cuenta contra el número real de
 * páginas, no contra ese rótulo), que el documento sea un PDF válido de
 * tamaño razonable, y que las variantes con datos vacíos/sin logo/sin
 * indicadores no rompan nada.
 *
 * jsPDF.prototype no tiene `save` (jsPDF lo cierra sobre estado interno
 * privado y lo asigna a cada instancia en el constructor, no en el
 * prototype) — no hay nada que espiar ahí. En vez de eso se mockea el
 * módulo 'jspdf' completo con una subclase que solo sobreescribe `save`
 * para capturar la instancia real en vez de disparar la descarga del
 * navegador (que jsdom no implementa por completo — ni
 * URL.createObjectURL ni el click del <a>). Todo lo demás (el
 * constructor, autoTable, addImage, splitTextToSize...) corre tal cual
 * en la librería real.
 *
 * Ejecutar: npm test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generarReportePDF } from '../generarReportePDF';

vi.mock('../../api/client', () => ({ default: { get: vi.fn() } }));
vi.mock('../../api/evidencias', () => ({ obtenerEvidenciasProyecto: vi.fn() }));

let capturedDoc = null;
let capturedFilename = null;

vi.mock('jspdf', async () => {
  const actual = await vi.importActual('jspdf');
  class CapturingJsPDF extends actual.jsPDF {
    constructor(...args) {
      super(...args);
      // jsPDF asigna `save` como propiedad propia de la instancia dentro
      // de SU constructor (cierra sobre estado privado, no vive en el
      // prototype) — un `save` definido en esta subclase quedaría tapado
      // por esa asignación. Por eso se reasigna aquí, DESPUÉS de
      // super(...), para que sí gane.
      this.save = (filename) => {
        capturedDoc = this;
        capturedFilename = filename;
        return this;
      };
    }
  }
  return { ...actual, jsPDF: CapturingJsPDF, default: CapturingJsPDF };
});

import client from '../../api/client';
import * as evidenciasApi from '../../api/evidencias';

// 1x1 PNG transparente real — válido como dataURL de verdad para
// doc.addImage, no un string inventado.
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function pngBlob() {
  const bytes = Uint8Array.from(atob(PNG_1X1_BASE64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

const PROYECTO = {
  nombre: 'Proyecto de prueba — Reporte PDF',
  dg_lider_siglas: 'DGOT',
  dg_lider_nombre: 'Dirección General de Ordenamiento Territorial',
  tipo: 'infraestructura_social',
  estado: 'En_proceso',
  programa_clave: 'U123',
  fecha_inicio: '2026-01-15',
  fecha_limite: '2026-12-31',
  porcentaje_calculado: 42.5,
  semaforo: 'ambar',
  descripcion: 'Descripción de prueba, suficientemente larga para forzar el salto de línea del recuadro de descripción de la portada y validar que splitTextToSize sigue funcionando igual tras el cambio de versión de jsPDF.',
};

const ETAPAS = [
  {
    id: 'e1', nombre: 'Etapa 1: Planeación', estado: 'Terminado', semaforo_efectivo: 'verde',
    avance_actual: 100, responsable_nombre: 'Ana Pérez', fecha_inicio: '2026-01-01', fecha_limite: '2026-02-01',
    acciones: [
      {
        id: 'a1', nombre: 'Acción 1.1', estado: 'Terminado', semaforo_efectivo: 'verde',
        avance_actual: 100, responsable_nombre: 'Carlos Ruiz', fecha_inicio: '2026-01-01', fecha_limite: '2026-01-20',
        tareas: [
          { id: 't1', nombre: 'Tarea 1.1.1', estado: 'Terminado', semaforo_efectivo: 'verde', avance_actual: 100, responsable_nombre: 'Luis Gómez', fecha_limite: '2026-01-15' },
        ],
      },
    ],
  },
  {
    id: 'e2', nombre: 'Etapa 2: Ejecución', estado: 'En_proceso', semaforo_efectivo: 'rojo',
    avance_actual: 30, responsable_nombre: 'Marta Díaz', fecha_inicio: '2026-02-01', fecha_limite: '2026-06-30',
    acciones: [
      {
        id: 'a2', nombre: 'Acción 2.1, con un nombre bastante largo para probar el truncado de celdas de la tabla de estructura',
        estado: 'Pendiente', semaforo_efectivo: 'rojo',
        avance_actual: 0, responsable_nombre: null, fecha_inicio: '2026-02-01', fecha_limite: '2026-03-01',
        tareas: [],
      },
    ],
  },
];

const MIEMBROS = [
  { nombre_completo: 'Ana Pérez', correo: 'ana@sedatu.gob.mx', rol: 'administracion_proyecto', dg_siglas: 'DGOT', cargo: 'Directora de Área' },
  { nombre_completo: 'Carlos Ruiz', correo: 'carlos@sedatu.gob.mx', rol: 'responsable', dg_siglas: 'DGOT', cargo: 'Enlace' },
];

const RIESGOS = [
  { titulo: 'Riesgo de atraso por temporada de lluvias', nivel: 'Alto', estado: 'Abierto', probabilidad: 'Media', impacto: 'Alto', responsable_nombre: 'Ana Pérez', etapa_nombre: 'Etapa 2: Ejecución' },
];

const EVIDENCIAS = [
  { categoria: 'Fotografías', nombre_original: 'avance_obra.jpg', notas: 'Avance de obra a la fecha', autor_nombre: 'Carlos Ruiz', created_at: '2026-03-01', etapa_nombre: 'Etapa 2: Ejecución' },
  { categoria: 'Fotografías', nombre_original: 'avance_obra2.jpg', notas: null, autor_nombre: 'Carlos Ruiz', created_at: '2026-03-10', etapa_nombre: 'Etapa 2: Ejecución' },
  { categoria: 'Documentos oficiales', nombre_original: 'oficio_autorizacion.pdf', notas: 'Oficio de autorización', autor_nombre: 'Ana Pérez', created_at: '2026-01-10', etapa_nombre: 'Etapa 1: Planeación' },
];

const INDICADORES = [
  { nombre: 'Viviendas intervenidas', tipo: 'cuantitativo', meta_global: 500, valor_actual: 150, etiqueta_unidad: 'viviendas', etapa_nombre: 'Etapa 2: Ejecución' },
];

// Páginas reales que genera la función (independientes del rótulo
// "Pág. X/Y", ver nota de cabecera): portada (1, sin addPage) + resumen +
// equipo + estructura + pendientes + bloqueados + terminados + riesgos +
// evidencias (8 con addPage) = 9; +1 si hay indicadores.
const PAGINAS_SIN_INDICADORES = 9;
const PAGINAS_CON_INDICADORES = 10;

function mockRespuestasCompletas({ etapas = ETAPAS, miembros = MIEMBROS, riesgos = RIESGOS, evidencias = EVIDENCIAS, indicadores = INDICADORES } = {}) {
  client.get.mockImplementation((url) => {
    if (url.includes('/arbol')) return Promise.resolve({ data: { datos: etapas } });
    if (url.includes('/miembros')) return Promise.resolve({ data: { datos: miembros } });
    if (url.includes('/riesgos')) return Promise.resolve({ data: { datos: riesgos } });
    if (url.includes('/indicadores/todos')) return Promise.resolve({ data: { datos: indicadores } });
    return Promise.reject(new Error(`URL no mockeada: ${url}`));
  });
  evidenciasApi.obtenerEvidenciasProyecto.mockResolvedValue({ datos: evidencias });
}

beforeEach(() => {
  vi.clearAllMocks();
  capturedDoc = null;
  capturedFilename = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generarReportePDF — con jsPDF/jspdf-autotable reales (solo se mockea la red)', () => {
  it('genera el PDF completo (con logo, con indicadores) sin lanzar, con el número de páginas esperado', async () => {
    mockRespuestasCompletas();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(pngBlob()) }));

    await expect(generarReportePDF('proy-1', PROYECTO)).resolves.toBeUndefined();

    expect(capturedDoc).not.toBeNull();
    expect(capturedDoc.internal.getNumberOfPages()).toBe(PAGINAS_CON_INDICADORES);

    const datauri = capturedDoc.output('datauristring');
    expect(datauri.startsWith('data:application/pdf')).toBe(true);

    const buffer = capturedDoc.output('arraybuffer');
    // Sanity: un PDF de 10 páginas con tablas no es trivialmente chico —
    // un valor muy pequeño indicaría un documento vacío/corrupto.
    expect(buffer.byteLength).toBeGreaterThan(3000);

    expect(capturedFilename).toMatch(/^Reporte_.*\.pdf$/);
  });

  it('genera el PDF sin indicadores (una página menos) cuando el proyecto no tiene indicadores', async () => {
    mockRespuestasCompletas({ indicadores: [] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(pngBlob()) }));

    await generarReportePDF('proy-2', PROYECTO);

    expect(capturedDoc.internal.getNumberOfPages()).toBe(PAGINAS_SIN_INDICADORES);
  });

  it('sigue generando el PDF (sin logo) cuando falla la carga de /sedatu-logo.png', async () => {
    mockRespuestasCompletas();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('404')));

    await expect(generarReportePDF('proy-3', PROYECTO)).resolves.toBeUndefined();
    expect(capturedDoc.internal.getNumberOfPages()).toBe(PAGINAS_CON_INDICADORES);
  });

  it('sigue generando el PDF con colecciones vacías (sin estructura, miembros, riesgos ni evidencias)', async () => {
    mockRespuestasCompletas({ etapas: [], miembros: [], riesgos: [], evidencias: [], indicadores: [] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(pngBlob()) }));

    await expect(generarReportePDF('proy-4', { ...PROYECTO, descripcion: null })).resolves.toBeUndefined();
    expect(capturedDoc.internal.getNumberOfPages()).toBe(PAGINAS_SIN_INDICADORES);
  });

  it('si una de las peticiones falla (Promise.allSettled), igual genera el PDF con lo demás disponible', async () => {
    client.get.mockImplementation((url) => {
      if (url.includes('/arbol')) return Promise.resolve({ data: { datos: ETAPAS } });
      if (url.includes('/miembros')) return Promise.reject(new Error('500'));
      if (url.includes('/riesgos')) return Promise.resolve({ data: { datos: RIESGOS } });
      if (url.includes('/indicadores/todos')) return Promise.resolve({ data: { datos: INDICADORES } });
      return Promise.reject(new Error(`URL no mockeada: ${url}`));
    });
    evidenciasApi.obtenerEvidenciasProyecto.mockResolvedValue({ datos: EVIDENCIAS });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(pngBlob()) }));

    await expect(generarReportePDF('proy-5', PROYECTO)).resolves.toBeUndefined();
    expect(capturedDoc.internal.getNumberOfPages()).toBe(PAGINAS_CON_INDICADORES);
  });
});
