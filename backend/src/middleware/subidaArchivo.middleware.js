/**
 * ARCHIVO: subidaArchivo.middleware.js
 * PROPÓSITO: Multer compartido para las rutas que suben un archivo a MinIO.
 *            Lo guarda en un temporal en disco mientras llega, en vez de en
 *            memoria, y expone el helper para borrar ese temporal después,
 *            sin importar cómo terminó la petición.
 *
 * NOTA TÉCNICA: por qué diskStorage y no memoryStorage
 * ─────────────────────────────────────────────────────────────────
 * Con memoryStorage, multer guarda el archivo completo en un Buffer en
 * RAM antes de que el controller vea la petición. Con el límite de hoy
 * (200 MB) y varias subidas al mismo tiempo, eso puede agotar la
 * memoria del proceso backend completo, no solo la subida que lo causó.
 * Con diskStorage, multer escribe el archivo a un temporal en disco
 * conforme llega; el controller le entrega a MinIO un stream de
 * lectura de ese temporal en vez de un buffer, así que la memoria que
 * usa una subida no crece con el tamaño del archivo.
 * ─────────────────────────────────────────────────────────────────
 */
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const multer = require('multer');

const DIRECTORIO_TEMPORAL = process.env.UPLOAD_TMP_DIR || path.join(os.tmpdir(), 'pspp-uploads');
const TAMANO_MAXIMO_MB = Number(process.env.UPLOAD_MAX_SIZE_MB) || 200;
const TAMANO_MAXIMO_BYTES = TAMANO_MAXIMO_MB * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({ destination: DIRECTORIO_TEMPORAL }),
  limits: { fileSize: TAMANO_MAXIMO_BYTES },
});

// Se llama una sola vez al arrancar el backend (ver server.js): crea el
// directorio si falta y confirma que de verdad se puede escribir ahí,
// para fallar con un mensaje claro al inicio en vez de que la primera
// subida de alguien truene con un error oscuro de multer.
function verificarDirectorioSubidas(directorio = DIRECTORIO_TEMPORAL) {
  fs.mkdirSync(directorio, { recursive: true });
  const prueba = path.join(directorio, `.prueba-escritura-${process.pid}`);
  fs.writeFileSync(prueba, 'ok');
  fs.unlinkSync(prueba);
}

// Borra el archivo temporal de una subida pase lo que pase: éxito,
// error de MinIO, o petición interrumpida a la mitad. No truena si el
// archivo ya no está (p. ej. se intentó borrar dos veces) ni si la
// petición nunca trajo un archivo.
async function limpiarArchivoTemporal(req) {
  const ruta = req.file?.path;
  if (!ruta) return;
  try {
    await fsp.unlink(ruta);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`✗ No se pudo borrar el archivo temporal ${ruta}:`, err.message);
    }
  }
}

module.exports = {
  upload,
  limpiarArchivoTemporal,
  verificarDirectorioSubidas,
  DIRECTORIO_TEMPORAL,
  TAMANO_MAXIMO_BYTES,
};
