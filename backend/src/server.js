/**
 * ARCHIVO: server.js
 * PROPÓSITO: Punto de entrada del backend. Configura Express, middlewares
 *            globales y levanta el servidor HTTP.
 *
 * NOTA TÉCNICA: Express Application
 * ─────────────────────────────────────────────────────────────────
 * Express es un framework minimalista para Node.js que maneja peticiones
 * HTTP. app.use() registra middlewares que se ejecutan en orden para
 * cada petición. Primero pasan por cors (permisos de origen), luego
 * morgan (logging), luego express.json (parsear body), y finalmente
 * llegan a las rutas. Si ninguna ruta coincide, el errorHandler
 * captura el error y devuelve JSON consistente.
 * ─────────────────────────────────────────────────────────────────
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { ejecutarMigraciones } = require('./db/migrate');
const ejecutarSeeders = require('./db/seeders/index');
const asegurarSuperAdmin = require('./db/seeders/00_superadmin');
const asegurarEstructura = require('./db/seeders/00_estructura');
const asegurarProgramas = require('./db/seeders/00_programas');
const asegurarCatalogoIndicadoresV1 = require('./db/seeders/00_catalogo_indicadores_v1_sedatu');
const { iniciarPurgaAutomatica } = require('./utils/purgarProyectos');
const { iniciarAlertasAutomaticas } = require('./utils/alertasVencimiento');
const { verificarDirectorioSubidas, iniciarBarridoTemporales, DIRECTORIO_TEMPORAL } = require('./middleware/subidaArchivo.middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares globales ──────────────────────────────────────
// Encabezados HTTP de seguridad (X-Content-Type-Options, X-Frame-Options,
// etc). CSP desactivado por ahora: el frontend carga teselas de mapa
// (Leaflet) y llama a EmailJS desde el navegador — activar CSP sin
// mapear esos dominios primero rompería el mapa y el envío de correos
// para los usuarios actuales. Queda como mejora de una fase posterior.
app.use(helmet({ contentSecurityPolicy: false }));

// Permitir peticiones solo desde el frontend real (FRONTEND_URL). En
// producción, Nginx sirve frontend y backend en el mismo dominio, así
// que esto no afecta al tráfico normal de los usuarios — solo bloquea
// que OTROS sitios llamen a esta API desde el navegador de alguien.
// Sin Origin (Postman, scripts, server-to-server) siempre se permite,
// igual que antes.
//
// Se compara contra el ORIGEN de FRONTEND_URL (esquema + host + puerto),
// no contra la URL completa: el header Origin nunca trae ruta. Con el
// frontend en la raíz del dominio (https://pspp.geobint.com) da lo mismo,
// pero servido bajo un subdirectorio (https://sistemas.sedatu.gob.mx/pspp)
// la comparación literal rechazaba todo POST/PUT/DELETE del propio
// frontend, porque esos sí mandan Origin aun siendo del mismo sitio.
// FRONTEND_URL conserva la ruta para lo demás (ligas de activación).
const urlFrontend = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
let origenPermitido = urlFrontend;
try { origenPermitido = new URL(urlFrontend).origin; } catch { /* valor no es URL: se compara tal cual, como antes */ }
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === origenPermitido) {
      return callback(null, true);
    }
    console.warn(`✗ CORS bloqueado para origen: ${origin} (permitido: ${origenPermitido})`);
    return callback(new Error('No permitido por CORS'));
  },
  // Sin esto, un origen cross-origin recibe el archivo pero el navegador
  // le esconde el header a JS por especificación CORS (solo expone un
  // set fijo que no incluye Content-Disposition) — la descarga funciona
  // pero el nombre de archivo que arma el servidor se pierde. En
  // producción frontend y API comparten origen vía Nginx y esto no se
  // nota; se declara de todos modos para cualquier despliegue donde no
  // sea así.
  exposedHeaders: ['Content-Disposition'],
}));

// Logging de cada petición HTTP en consola (método, URL, status, tiempo)
app.use(morgan('dev'));

// Parsear body JSON de las peticiones POST/PUT (límite 10mb para evidencias metadata)
app.use(express.json({ limit: '10mb' }));

// Parsear form-urlencoded (formularios tradicionales)
app.use(express.urlencoded({ extended: true }));

// ─── Rutas de la API ───────────────────────────────────────────
app.use('/api/v1', routes);

// ─── Ruta de salud para Docker healthcheck ─────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', servicio: 'PSPP Backend', timestamp: new Date().toISOString() });
});

// ─── Manejo centralizado de errores ────────────────────────────
app.use(errorHandler);

// Ver servidor.requestTimeout en iniciar(). Inválido o vacío → 3600.
const TIEMPO_MAXIMO_PETICION_SEGUNDOS = (() => {
  const n = Number.parseInt(process.env.TIEMPO_MAXIMO_PETICION_SEGUNDOS, 10);
  return Number.isFinite(n) && n > 0 ? n : 3600;
})();

// ─── Inicializar BD y levantar servidor ──────────────────────
async function iniciar() {
  try {
    verificarDirectorioSubidas();
    // Borra temporales que haya dejado un proceso anterior muerto a la
    // fuerza, y repite cada hora (ver subidaArchivo.middleware.js).
    iniciarBarridoTemporales();
  } catch (err) {
    console.error(`✗ No se pudo preparar el directorio temporal de subidas (${DIRECTORIO_TEMPORAL}):`, err.message);
    process.exit(1);
  }

  try {
    await ejecutarMigraciones();
    await asegurarSuperAdmin();
    // Los catálogos institucionales corren siempre, producción incluida:
    // no son datos de demostración sino las listas reales que la
    // plataforma necesita —la estructura de SEDATU para dar de alta
    // usuarios y asignar áreas, los Pp del Ramo 15 para vincular un
    // proyecto a su programa, y el catálogo de indicadores oficial de
    // la secretaría. Todos AGREGAN lo que falte y nunca reescriben lo
    // que ya está capturado. El catálogo de indicadores, a diferencia
    // de los otros dos, es un LOTE versionado (ver
    // catalogo-indicadores-lote.js) — un Excel nuevo de otra dirección
    // general se agrega como una línea nueva aquí, sin tocar esta.
    await asegurarEstructura();
    await asegurarProgramas();
    await asegurarCatalogoIndicadoresV1();
    // CRÍTICO: los seeders insertan/actualizan usuarios de demo (contraseña
    // conocida "demo2026") y proyectos de ejemplo con ON CONFLICT DO UPDATE.
    // Antes esto corría en CADA arranque sin importar el entorno — en
    // producción, cualquier reinicio del contenedor (crash, redeploy;
    // docker-compose.prod.yml usa `restart: always`) volvía a sembrar esas
    // cuentas y proyectos falsos sobre la base de datos real. Las
    // migraciones sí deben correr siempre (mantienen el esquema al día);
    // los seeders NUNCA deben correr solos en producción.
    if (process.env.NODE_ENV !== 'production') {
      await ejecutarSeeders();
    } else {
      console.log('  Entorno de producción: seeders omitidos (solo migraciones).');
    }
  } catch (err) {
    console.error('✗ Error inicializando la base de datos:', err.message);
    process.exit(1);
  }

  iniciarPurgaAutomatica();
  iniciarAlertasAutomaticas();

  const servidor = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ PSPP Backend corriendo en puerto ${PORT}`);
    console.log(`  Entorno: ${process.env.NODE_ENV || 'development'}`);
  });

  // Tiempo máximo para RECIBIR una petición completa (cabeceras + cuerpo).
  // Node 18+ trae 300 s por omisión y corta con 408 después. Con nginx en
  // modo `proxy_request_buffering off` (deploy/nginx/pspp.conf y el nginx
  // institucional de SEDATU) el cuerpo llega al ritmo del usuario, así que
  // una subida de 200 MB por un enlace lento rebasaba esos 300 s y moría
  // aquí aunque todo lo demás de la cadena la aceptara. Se alinea con el
  // tope de transferencia del frontend (VITE_TIEMPO_MAXIMO_TRANSFERENCIA_MS,
  // 60 min). Las cabeceras siguen limitadas a 60 s (headersTimeout), que
  // es lo que protege contra conexiones que nunca terminan de presentarse.
  servidor.requestTimeout = TIEMPO_MAXIMO_PETICION_SEGUNDOS * 1000;

}

iniciar();

module.exports = app;
