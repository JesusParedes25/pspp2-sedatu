/**
 * ARCHIVO: minio.js
 * PROPÓSITO: Único punto de acceso al almacén de objetos (MinIO o
 *            cualquier endpoint S3-compatible). Todo el backend pasa por
 *            aquí para escribir, leer, copiar y borrar objetos, de modo
 *            que reglas transversales (hoy: el prefijo por ambiente) se
 *            apliquen en un solo lugar y no dependan de que cada
 *            controller se acuerde.
 *
 * NOTA TÉCNICA: MINIO_PREFIX y la clave "lógica" de un objeto
 * ─────────────────────────────────────────────────────────────────
 * La DGTIC asigna un solo bucket por proyecto y separa QA de producción
 * con un prefijo dentro de ese bucket. La base de datos (ruta_minio,
 * archivo_url, imagen_url) guarda siempre la clave LÓGICA, sin prefijo:
 * "evidencias/acciones/<id>/<archivo>". El prefijo se antepone aquí, en
 * el momento de hablar con el almacén, y nunca se persiste. Así:
 *   - con MINIO_PREFIX vacío o ausente la clave física es idéntica a la
 *     lógica, byte por byte, y lo ya almacenado se sigue encontrando;
 *   - un respaldo de la base de QA restaurado en producción (o al revés)
 *     sigue funcionando sin reescribir ninguna fila, porque las filas no
 *     saben en qué ambiente viven.
 * Por eso ningún controller debe llamar a `minioClient` directo: el
 * cliente crudo no conoce el prefijo. Se exporta solo para el arranque
 * (bucketExists/makeBucket), que opera sobre el bucket, no sobre claves.
 * ─────────────────────────────────────────────────────────────────
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

// "qa", "/qa", "qa/", " qa// " → "qa/". Vacío o ausente → "" (sin prefijo).
// Se rechaza ".." para que un valor mal escrito no pueda apuntar fuera del
// espacio asignado a este ambiente.
function normalizarPrefijo(valor) {
  const limpio = String(valor || '').trim().replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  if (!limpio) return '';
  if (limpio.split('/').includes('..')) {
    throw new Error(`MINIO_PREFIX inválido ("${valor}"): no puede contener "..".`);
  }
  return `${limpio}/`;
}

const PREFIJO = normalizarPrefijo(process.env.MINIO_PREFIX);

// Clave lógica (la que está en la BD) → clave física en el bucket.
function claveFisica(claveLogica, prefijo = PREFIJO) {
  if (!claveLogica) throw new Error('Clave de objeto vacía');
  return `${prefijo}${String(claveLogica).replace(/^\/+/, '')}`;
}

// Errores del SDK que significan "ese objeto no existe en el almacén".
// statObject (HEAD) no trae cuerpo, así que el SDK no puede leer el código
// S3 y reporta 'NotFound'; getObject sí lo trae y reporta 'NoSuchKey'.
function esObjetoInexistente(err) {
  return !!err && (err.code === 'NoSuchKey' || err.code === 'NotFound' || err.code === 'NoSuchObject');
}

const almacen = {
  putObject: (clave, cuerpo, tamano, metadatos) =>
    minioClient.putObject(BUCKET, claveFisica(clave), cuerpo, tamano, metadatos),
  statObject: (clave) => minioClient.statObject(BUCKET, claveFisica(clave)),
  getObject: (clave) => minioClient.getObject(BUCKET, claveFisica(clave)),
  // length 0 = "hasta el final" (convención del SDK).
  getPartialObject: (clave, inicio, longitud) =>
    minioClient.getPartialObject(BUCKET, claveFisica(clave), inicio, longitud),
  removeObject: (clave) => minioClient.removeObject(BUCKET, claveFisica(clave)),
  // Origen y destino dentro del mismo bucket y del mismo ambiente.
  copyObject: (claveDestino, claveOrigen) =>
    minioClient.copyObject(BUCKET, claveFisica(claveDestino), `/${BUCKET}/${claveFisica(claveOrigen)}`),
};

module.exports = {
  minioClient,
  BUCKET,
  PREFIJO,
  almacen,
  claveFisica,
  normalizarPrefijo,
  esObjetoInexistente,
};
