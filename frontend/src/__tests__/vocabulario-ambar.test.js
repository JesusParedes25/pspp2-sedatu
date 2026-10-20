/**
 * ARCHIVO: vocabulario-ambar.test.js
 * PROPÓSITO: "Cierre del modelo de urgencia" — guarda barata contra que
 *            la palabra "ámbar" (con o sin acento, cualquier
 *            capitalización) reaparezca en un texto VISIBLE del
 *            frontend. El valor interno del catálogo (`'ambar'`, siempre
 *            minúscula y sin acento en este código — comparaciones,
 *            `value="ambar"` de un <option>, la llave de un objeto) NO
 *            es texto visible y se excluye a propósito; cualquier otra
 *            forma de la palabra (en un literal de cadena, ya sea una
 *            oración completa o la palabra sola con mayúscula/acento)
 *            sí se cuenta como visible y hace fallar la prueba.
 *
 * MINI-CLASE: por qué un escaneo de texto y no solo pruebas de render
 * ─────────────────────────────────────────────────────────────────
 * Esta regla puede reaparecer en CUALQUIER archivo nuevo que alguien
 * escriba después (un export a PDF, un tooltip, una leyenda) sin que
 * nadie se acuerde de este PR. Una prueba de render fija solo los
 * componentes que ya conocemos hoy; un escaneo del código fuente cubre
 * también los que todavía no existen.
 * ─────────────────────────────────────────────────────────────────
 */
import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');
const EXCLUIR_DIRS = new Set(['__tests__', 'node_modules']);
const EXTENSIONES = new Set(['.js', '.jsx']);

function listarArchivos(dir) {
  let archivos = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      if (EXCLUIR_DIRS.has(entrada.name)) continue;
      archivos = archivos.concat(listarArchivos(path.join(dir, entrada.name)));
    } else if (EXTENSIONES.has(path.extname(entrada.name))) {
      archivos.push(path.join(dir, entrada.name));
    }
  }
  return archivos;
}

// Quita comentarios de línea y de bloque — no son texto visible, y sin
// esto los propios comentarios que EXPLICAN esta regla (incluyendo los
// de SemaforoDot.jsx) harían fallar la prueba que los rodea.
function sinComentarios(codigo) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

// Extrae el contenido de cada literal de cadena ('...', "...", `...`) —
// aproximado (no es un parser de JS completo) pero suficiente para este
// código: no hay comillas escapadas atípicas en los textos de la UI.
// En un template literal, lo interpolado (`${...}`) no es texto fijo —
// puede traer el NOMBRE de una variable (p. ej. `${ambares.length}`) que
// contiene la palabra como identificador de JS, no como texto visible;
// se quita antes de buscar, para no marcar eso como un falso positivo.
function literalesDeCadena(codigo) {
  const literales = [];
  const regex = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = regex.exec(codigo))) {
    const contenido = m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, '');
    literales.push(contenido);
  }
  return literales;
}

function sinAcentos(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// El único uso legítimo de la palabra en código es el valor interno del
// catálogo: exactamente "ambar", minúscula, sin acento, nada más en la
// cadena (comparaciones `=== 'ambar'`, `value="ambar"`, etc.) — nunca
// aparece así por accidente en una oración o etiqueta real.
function esValorInternoDelCatalogo(literalOriginal) {
  return literalOriginal === 'ambar';
}

function contieneAmbarVisible(literalOriginal) {
  if (esValorInternoDelCatalogo(literalOriginal)) return false;
  return sinAcentos(literalOriginal).toLowerCase().includes('ambar');
}

describe('Vocabulario: "ámbar" no debe aparecer en ningún texto visible del frontend', () => {
  const archivos = listarArchivos(SRC);
  expect(archivos.length).toBeGreaterThan(50); // guarda contra un escaneo vacío por un path roto

  test.each(archivos)('%s', (archivo) => {
    const codigo = sinComentarios(fs.readFileSync(archivo, 'utf8'));
    const ofensores = literalesDeCadena(codigo).filter(contieneAmbarVisible);
    expect(ofensores).toEqual([]);
  });
});
