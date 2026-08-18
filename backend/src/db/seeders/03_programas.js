/**
 * ARCHIVO: 03_programas.js
 * PROPÓSITO: Sembrar los programas presupuestarios del Ramo 15 en las
 *            bases de desarrollo, dejándolas idénticas a la lista
 *            canónica aunque alguien las haya editado probando.
 *
 * DÓNDE VIVE LA LISTA: en `00_programas.js`, junto con la función que la
 * inserta. Ese archivo corre en TODOS los entornos (producción incluida)
 * porque los programas presupuestarios no son datos de demostración: son
 * el catálogo real que alimenta el desplegable "Programa presupuestario"
 * al crear un proyecto. Este seeder solo agrega el matiz de desarrollo —
 * `actualizar: true`, que además de insertar los que falten reescribe
 * los existentes. En producción eso nunca pasa: ahí solo se insertan las
 * claves ausentes, para no pisar correcciones hechas a mano.
 *
 * Se conserva como paso 3 del orden de seeders para que `--base` y la
 * salida por consola sigan describiendo lo mismo que antes.
 */
const asegurarProgramas = require('./00_programas');

async function seedProgramas() {
  return asegurarProgramas({ actualizar: true });
}

module.exports = seedProgramas;
