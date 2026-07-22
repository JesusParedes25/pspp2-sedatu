/**
 * ARCHIVO: minio.js
 * PROPÓSITO: Cliente MinIO compartido — extraído de evidencias.controller.js
 *            para que otros controllers (actividad) puedan reusar la MISMA
 *            lógica de subida sin duplicar la inicialización del cliente.
 */
const { Client: MinioClient } = require('minio');

const minioClient = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_USER,
  secretKey: process.env.MINIO_PASSWORD,
});

const BUCKET = process.env.MINIO_BUCKET || 'pspp-evidencias';

module.exports = { minioClient, BUCKET };
