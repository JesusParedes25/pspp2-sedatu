/**
 * ARCHIVO: server.js
 * PROPÓSITO: Punto de entrada del backend. Configura Express, middlewares
 *            globales y levanta el servidor HTTP.
 *
 * MINI-CLASE: Express Application
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
const morgan = require('morgan');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { ejecutarMigraciones } = require('./db/migrate');
const ejecutarSeeders = require('./db/seeders/index');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares globales ──────────────────────────────────────
// Permitir peticiones desde el frontend (diferente puerto en desarrollo)
app.use(cors());

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

// ─── Inicializar BD y levantar servidor ──────────────────────
async function iniciar() {
  try {
    await ejecutarMigraciones();
    await ejecutarSeeders();
  } catch (err) {
    console.error('✗ Error inicializando la base de datos:', err.message);
    process.exit(1);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ PSPP Backend corriendo en puerto ${PORT}`);
    console.log(`  Entorno: ${process.env.NODE_ENV || 'development'}`);
  });
}

iniciar();

module.exports = app;
