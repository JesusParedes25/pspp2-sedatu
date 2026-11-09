/**
 * ARCHIVO: subidaArchivo.middleware.js
 * PROPÓSITO: Multer compartido para las rutas que suben un archivo a MinIO.
 *            Lo guarda en un temporal en disco mientras llega, en vez de en
 *            memoria, y GARANTIZA que ese temporal se borre pase lo que
 *            pase con la petición.
 *
 * NOTA TÉCNICA: por qué diskStorage y no memoryStorage
 * ─────────────────────────────────────────────────────────────────
 * Con memoryStorage, multer guarda el archivo completo en un Buffer en
 * RAM antes de que el controller vea la petición. Con el límite de hoy
 * (200 MB) y varias subidas al mismo tiempo, eso puede agotar la
 * memoria del proceso backend completo, no solo la subida que lo causó.
 * Con disco, multer escribe el archivo a un temporal conforme llega; el
 * controller le entrega a MinIO un stream de lectura de ese temporal en
 * vez de un buffer, así que la memoria que usa una subida no crece con
 * el tamaño del archivo.
 *
 * NOTA TÉCNICA: por qué la limpieza no puede vivir solo en el controller
 * ─────────────────────────────────────────────────────────────────
 * Antes el temporal se borraba en el `finally` de cada controller. Eso
 * deja dos huecos, los dos reproducidos antes de este cambio:
 *   1. Un middleware posterior a multer rechaza la petición (p. ej. el
 *      403 de exigirEdicionDeNodoEnCuerpo en POST /actividad, que tiene
 *      que ir después de multer porque lee el cuerpo multipart). El
 *      controller nunca corre y su finally tampoco.
 *   2. El cliente corta la conexión a media subida. multer 1.x no se
 *      entera (busboy nunca recibe el final del cuerpo), nunca llama a
 *      next() ni borra el parcial, y el archivo a medio escribir se queda
 *      en disco para siempre.
 * Ahora:
 *   - El almacenamiento es propio (no multer.diskStorage) y anota cada
 *     temporal en la petición en cuanto lo CREA, no cuando termina, así
 *     que también se conoce la ruta de un parcial.
 *   - `upload.single()` ata la limpieza al evento 'close' de la respuesta,
 *     que Node emite siempre: al terminar de responder (éxito o error,
 *     llegue o no al controller) y cuando se cae la conexión. La limpieza
 *     cierra el flujo de escritura si sigue abierto y borra el archivo.
 *   - Al arrancar y cada hora se barren los huérfanos que hubiera dejado
 *     un proceso muerto a la fuerza (kill -9, OOM, corte de luz), que es
 *     el único caso que ningún evento puede atrapar.
 * El finally de cada controller se queda como segunda red: la limpieza
 * es idempotente.
 * ─────────────────────────────────────────────────────────────────
 */
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const multer = require('multer');

const DIRECTORIO_TEMPORAL = process.env.UPLOAD_TMP_DIR || path.join(os.tmpdir(), 'pspp-uploads');
const TAMANO_MAXIMO_MB = Number(process.env.UPLOAD_MAX_SIZE_MB) || 200;
const TAMANO_MAXIMO_BYTES = TAMANO_MAXIMO_MB * 1024 * 1024;

// Nombre de cada temporal: prefijo fijo + 32 hex. El barrido de huérfanos
// solo toca archivos con esta forma, nunca otra cosa que alguien haya
// dejado en el mismo directorio.
const PREFIJO_TEMPORAL = 'pspp-subida-';
const PATRON_TEMPORAL = /^pspp-subida-[0-9a-f]{32}$/;

const TEMPORALES = Symbol('temporalesSubida');

function temporalesDe(req) {
  if (!req[TEMPORALES]) req[TEMPORALES] = new Map(); // ruta → WriteStream
  return req[TEMPORALES];
}

async function borrarSiExiste(ruta) {
  try {
    await fsp.unlink(ruta);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`✗ No se pudo borrar el archivo temporal ${ruta}:`, err.message);
    }
  }
}

// Motor de almacenamiento de multer (interfaz _handleFile/_removeFile).
// Igual que diskStorage, salvo que registra la ruta en la petición antes de
// escribir el primer byte.
function crearAlmacenTemporal(directorio = DIRECTORIO_TEMPORAL) {
  return {
    _handleFile(req, file, cb) {
      const nombre = PREFIJO_TEMPORAL + crypto.randomBytes(16).toString('hex');
      const ruta = path.join(directorio, nombre);
      // 'wx': nunca reutilizar un archivo existente; 0600: solo el proceso.
      const salida = fs.createWriteStream(ruta, { flags: 'wx', mode: 0o600 });
      temporalesDe(req).set(ruta, salida);

      let terminado = false;
      const fin = (err, info) => {
        if (terminado) return;
        terminado = true;
        cb(err, info);
      };
      salida.on('error', fin);
      file.stream.on('error', (err) => { salida.destroy(); fin(err); });
      salida.on('finish', () => fin(null, {
        destination: directorio,
        filename: nombre,
        path: ruta,
        size: salida.bytesWritten,
      }));
      file.stream.pipe(salida);
    },
    _removeFile(req, file, cb) {
      borrarSiExiste(file.path).then(() => cb(null), cb);
    },
  };
}

const multerSubida = multer({
  storage: crearAlmacenTemporal(),
  limits: { fileSize: TAMANO_MAXIMO_BYTES },
});

// Borra los temporales de una subida pase lo que pase: éxito, error de
// MinIO, rechazo de permisos, o petición interrumpida a la mitad. No truena
// si el archivo ya no está (p. ej. se llamó dos veces: una desde el 'close'
// de la respuesta y otra desde el finally del controller) ni si la petición
// nunca trajo un archivo.
async function limpiarArchivoTemporal(req) {
  if (!req) return;
  const rutas = new Set();
  const registrados = req[TEMPORALES];
  if (registrados) {
    for (const [ruta, salida] of registrados) {
      // Parcial de una subida cortada: cerrar el descriptor antes de borrar.
      if (!salida.closed && !salida.destroyed) salida.destroy();
      rutas.add(ruta);
    }
    registrados.clear();
  }
  if (req.file?.path) rutas.add(req.file.path);
  await Promise.all([...rutas].map(borrarSiExiste));
}

// Misma firma que multer: upload.single('campo'). Las rutas no cambian.
const upload = {
  single(campo) {
    const procesar = multerSubida.single(campo);
    return function subidaConLimpieza(req, res, next) {
      res.once('close', () => { limpiarArchivoTemporal(req); });
      procesar(req, res, next);
    };
  },
};

// Borra temporales con más de `antiguedadMs` sin modificarse. Un temporal
// vivo se modifica conforme llega el archivo, y después solo dura lo que
// tarda la subida a MinIO, así que nada legítimo pasa horas sin tocarse.
async function purgarTemporalesHuerfanos(antiguedadMs, directorio = DIRECTORIO_TEMPORAL) {
  let entradas;
  try {
    entradas = await fsp.readdir(directorio);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`✗ No se pudo revisar ${directorio}:`, err.message);
    return 0;
  }
  const limite = Date.now() - antiguedadMs;
  let borrados = 0;
  for (const nombre of entradas) {
    if (!PATRON_TEMPORAL.test(nombre)) continue;
    const ruta = path.join(directorio, nombre);
    try {
      const st = await fsp.stat(ruta);
      if (st.isFile() && st.mtimeMs <= limite) {
        await borrarSiExiste(ruta);
        borrados += 1;
      }
    } catch { /* desapareció entre readdir y stat: nada que hacer */ }
  }
  return borrados;
}

const UNA_HORA = 60 * 60 * 1000;

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

// Barrido al arrancar (lo que dejó el proceso anterior) y luego cada hora.
// Al arrancar basta con 10 minutos de antigüedad: el proceso que pudo
// haberlos estado usando ya no existe. El barrido periódico usa 6 horas
// para no tocar nunca una subida en curso, por lenta que sea.
function iniciarBarridoTemporales(directorio = DIRECTORIO_TEMPORAL) {
  purgarTemporalesHuerfanos(10 * 60 * 1000, directorio).then((n) => {
    if (n) console.log(`✓ ${n} archivo(s) temporal(es) huérfano(s) borrado(s) de ${directorio}`);
  });
  const t = setInterval(() => { purgarTemporalesHuerfanos(6 * UNA_HORA, directorio); }, UNA_HORA);
  t.unref();
  return t;
}

module.exports = {
  upload,
  limpiarArchivoTemporal,
  verificarDirectorioSubidas,
  purgarTemporalesHuerfanos,
  iniciarBarridoTemporales,
  crearAlmacenTemporal,
  DIRECTORIO_TEMPORAL,
  TAMANO_MAXIMO_BYTES,
};
