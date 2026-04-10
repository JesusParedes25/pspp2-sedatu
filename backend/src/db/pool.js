/**
 * ARCHIVO: pool.js
 * PROPÓSITO: Gestiona el pool de conexiones a PostgreSQL para toda la app.
 *
 * MINI-CLASE: Pool de conexiones (node-postgres)
 * ─────────────────────────────────────────────────────────────────
 * Abrir una conexión nueva a PostgreSQL por cada petición HTTP cuesta
 * ~50ms solo en el handshake. Un pool mantiene N conexiones abiertas
 * y las reutiliza. pg.Pool gestiona esto automáticamente: cuando
 * llama pool.query(), toma una conexión libre, ejecuta el query,
 * y la devuelve al pool. "max: 10" limita a 10 conexiones simultáneas,
 * suficiente para un servidor institucional con uso moderado.
 * ─────────────────────────────────────────────────────────────────
 */
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', () => console.log('✓ PostgreSQL conectado'));
pool.on('error', (err) => console.error('✗ Error en pool PostgreSQL:', err.message));

module.exports = pool;
