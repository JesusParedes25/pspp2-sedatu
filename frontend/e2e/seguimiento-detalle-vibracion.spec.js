/**
 * ARCHIVO: seguimiento-detalle-vibracion.spec.js
 * PROPÓSITO: Regresión del bug reportado en producción — "al bajar el
 *            scroll hasta el fondo en Detalle de Seguimiento, la pantalla
 *            vibra verticalmente, muy rápido, en bucle" (solo con el árbol
 *            izquierdo contraído).
 *
 * MINI-CLASE: la causa real (no era CSS/flexbox)
 * ─────────────────────────────────────────────────────────────────
 * Investigado primero por descarte: sin ResizeObserver en todo el
 * frontend, el único IntersectionObserver (histéresis del header
 * compacto) apunta a un sentinel cerca del TOPE de la página — estable
 * una vez scrolleado al fondo, no puede ser la causa de una vibración ahí.
 * Barridos automatizados de ancho/alto con scroll real al fondo tampoco
 * reprodujeron nada contra el backend de dev — porque el dev corre en el
 * mismo host, con latencia casi nula.
 *
 * La causa real apareció al analizar un video de producción frame a
 * frame: `PestanasDetalle.jsx` pasaba un arrow function NUEVO como
 * `onContador` a cada pestaña con contador (Documentos/Indicadores/
 * Riesgos/Equipo) en cada render — y esas pestañas traen `onContador` en
 * las dependencias de su propio `useCallback` de carga. El resultado es
 * una tormenta de refetch en cascada: la primera vez que CUALQUIERA de
 * las 4 pestañas reporta su conteo real (de `undefined` a un número),
 * `PestanasDetalle` se vuelve a renderizar, lo que crea un `onContador`
 * nuevo para las CUATRO, lo que dispara su refetch de nuevo, lo que
 * eventualmente vuelve a cambiar algún conteo... 3-4 ciclos típicamente,
 * cada uno colapsando momentáneamente el contenido de la pestaña activa a
 * "Cargando…" y restaurándolo. Con el árbol izquierdo contraído (columna
 * corta) esos ciclos de altura empujan la altura total de la página por
 * encima y por debajo del alto del viewport varias veces seguidas — de
 * ahí la "vibración" del scroll. Con el árbol expandido la columna
 * izquierda ya es más alta que el viewport por sí sola, así que la misma
 * cascada no cambia la altura total visible y pasa inadvertida — coincide
 * exactamente con la condición de reproducción que reportó el usuario.
 *
 * En dev, contra el backend local (latencia ~1ms), toda la cascada se
 * resuelve dentro de un único ciclo de React antes de que un humano (o un
 * `waitForTimeout` típico) note nada. Por eso esta prueba intercepta las
 * rutas de API para agregar latencia artificial escalonada por endpoint
 * — la condición real que expuso el bug en producción (VPS real, sin
 * bind-mount, con round-trip real) — y sin esa latencia el bug no se
 * reproduce ni aquí ni en producción con una red muy rápida.
 *
 * El fix (PestanasDetalle.jsx) envuelve `onContador` de cada pestaña en
 * `useCallback` con una referencia estable — rompe la cascada en su
 * origen sin tocar ningún componente hijo.
 *
 * Nota sobre los umbrales de abajo (≤2, no exactamente 1): `index.jsx`
 * monta `<PanelDetalle key={seleccion.id}>` — remonta a propósito al
 * cambiar de nodo (para no arrastrar estado de edición de un nodo a
 * otro), y `React.StrictMode` (activo en dev, `main.jsx`) duplica a
 * propósito el primer efecto de cada montaje para ayudar a detectar
 * efectos secundarios — así que un único fetch "real" puede verse como 2
 * en dev, nunca en producción (StrictMode no corre ahí). El fix elimina
 * la cascada (que en el código sin arreglar producía 5+ rondas,
 * escalonadas en el tiempo); el doblado de StrictMode es una sola
 * repetición casi simultánea, inofensiva y aceptada aquí a propósito.
 * ─────────────────────────────────────────────────────────────────
 */
import { test, expect } from '@playwright/test';

const CORREO = process.env.PSPP_E2E_CORREO || 'jesus.paredes@sedatu.gob.mx';
const PASSWORD = process.env.PSPP_E2E_PASSWORD || 'demo2026';

async function login(page) {
  await page.goto('/');
  await page.locator('input[type="email"]').fill(CORREO);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('input[type="email"]')).toBeHidden({ timeout: 10000 });
}

async function irAlPrimerProyecto(page) {
  await page.goto('/proyectos?vista=todos');
  const primerProyecto = page.locator('main a[href^="/proyectos/"]:not([href="/proyectos/nuevo"])').first();
  await expect(primerProyecto).toBeVisible({ timeout: 10000 });
  await primerProyecto.click();
  await page.waitForURL(/\/proyectos\/[^/]+$/, { timeout: 10000 });
}

// Latencia artificial ESCALONADA por endpoint — sin esto el bug no se
// reproduce (ver mini-clase de cabecera): las 4 pestañas con contador
// arrancan su fetch casi al mismo tiempo, y si las 4 respuestas llegan
// dentro del mismo tick de React (como en dev, latencia ~0), React las
// agrupa en un solo render y la cascada nunca se dispara. Un delay fijo
// y distinto por endpoint garantiza 4 resoluciones en 4 ticks separados
// — la condición real de una red con round-trip de verdad — sin
// depender de aleatoriedad (nada de Math.random: debe ser reproducible).
function conLatenciaEscalonada(page) {
  const DELAY_POR_RUTA = [
    [/\/documentos(\?|$)/, 120],
    [/\/aportaciones(\?|$)/, 180],
    [/\/riesgos(\?|$)/, 240],
    [/\/miembros-nodo(\?|$)/, 300],
  ];
  return page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const match = DELAY_POR_RUTA.find(([re]) => re.test(url.pathname));
    await new Promise(r => setTimeout(r, match ? match[1] : 30));
    await route.continue();
  });
}

test.describe('Detalle de Seguimiento — sin tormenta de refetch al abrir una pestaña con contador', () => {
  test.beforeEach(async ({ page }) => {
    await conLatenciaEscalonada(page);
    await login(page);
    await irAlPrimerProyecto(page);
  });

  // Las 6 subpestañas (Actividad/Documentos/Indicadores/Territorio/Riesgos/
  // Equipo) están SIEMPRE montadas (ocultas con CSS, no desmontadas — ver
  // PestanasDetalle.jsx), así que la tormenta de refetch de las 4 con
  // contador ocurre en segundo plano apenas se selecciona un nodo,
  // mientras "Actividad" (la pestaña activa por defecto) es la única
  // visible — termina en bien menos de un segundo, antes de que un clic
  // posterior a otra pestaña pueda observarla. Para verla hace falta que
  // la pestaña con contador YA esté activa cuando se selecciona el nodo
  // — exactamente el flujo real: el usuario ya estaba en "Documentos"/
  // "Indicadores" y cambia de nodo en el árbol sin salir de esa pestaña
  // (tal como en el video de producción que expuso este bug).
  async function seleccionarNodo(page, indice) {
    const nodo = page.locator('[role="treeitem"]').nth(indice);
    await expect(nodo).toBeVisible({ timeout: 10000 });
    await nodo.click();
  }

  test('cambiar de nodo con "Documentos" ya activa solo dispara una carga, no una cascada', async ({ page }) => {
    await page.goto(page.url() + '/seguimiento');

    // Árbol contraído (estado por defecto al navegar directo a /seguimiento
    // sin ?nodo=) — mismo requisito de reproducción que reportó el usuario.
    await seleccionarNodo(page, 0);

    const tabDocumentos = page.getByRole('main').getByRole('button', { name: /^Documentos/ });
    await expect(tabDocumentos).toBeVisible({ timeout: 10000 });
    await tabDocumentos.click();
    await expect(page.getByText('Cargando documentos...')).toBeHidden({ timeout: 10000 });

    // Contar peticiones reales a /documentos (no el texto "Cargando…",
    // que puede parpadear más rápido de lo que un polling por intervalos
    // alcanza a ver) — más directo y sin carreras: con la tormenta de
    // refetch (sin el fix: 5+ rondas, escalonadas ~60ms entre sí, ver
    // mini-clase de cabecera) cambiar de nodo dispara muchas más de 2
    // peticiones a ese endpoint.
    let peticionesDocumentos = 0;
    page.on('request', req => {
      if (/\/documentos(\?|$)/.test(new URL(req.url()).pathname)) peticionesDocumentos++;
    });

    // Cambiar a un SEGUNDO nodo del árbol con Documentos ya activa — es
    // la selección la que dispara el montaje/fetch de las 4 pestañas con
    // contador, no el clic de pestaña en sí.
    await seleccionarNodo(page, 1);
    await expect(page.getByText('Cargando documentos...')).toBeHidden({ timeout: 10000 });
    // Margen para que una eventual cascada en curso termine de dispararse.
    await page.waitForTimeout(1500);

    // ≤2, no exactamente 1 — ver nota de cabecera sobre StrictMode.
    expect(peticionesDocumentos, 'cambiar de nodo no debe disparar una cascada de cargas de Documentos').toBeLessThanOrEqual(2);
  });

  test('la altura del documento no oscila al cambiar de nodo con "Indicadores" ya activa (árbol contraído)', async ({ page }) => {
    await page.goto(page.url() + '/seguimiento');

    await seleccionarNodo(page, 0);

    const tabIndicadores = page.getByRole('main').getByRole('button', { name: /^Indicadores/ });
    await expect(tabIndicadores).toBeVisible({ timeout: 10000 });
    await tabIndicadores.click();
    await expect(page.getByText('Cargando indicadores...')).toBeHidden({ timeout: 10000 });

    // Muestrear document.documentElement.scrollHeight cada 30ms mientras
    // se cambia a un segundo nodo — antes del fix esto oscilaba entre
    // varios valores (colapsa a "Cargando…" y se restaura, repetidas
    // veces, mientras la tormenta de refetch se resuelve).
    const alturas = [];
    const limite = Date.now() + 2500;
    const muestreo = (async () => {
      while (Date.now() < limite) {
        alturas.push(await page.evaluate(() => document.documentElement.scrollHeight));
        await page.waitForTimeout(30);
      }
    })();
    await seleccionarNodo(page, 1);
    await muestreo;

    // ≤3 (estable, más a lo sumo un par de pasos de asentamiento), no
    // exactamente 1 — ver nota de cabecera sobre StrictMode. Con más
    // pestañas ahora escuchando `altaSolicitada` (atajos de "Más
    // acciones"), el asentamiento post-StrictMode a veces cae en 2 pasos
    // monótonos (ej. 972→994→1040) y a veces en 1 (972→1040) según en
    // qué instante exacto caiga cada muestreo de 30ms. Sin el fix esto
    // mostraba muchos más valores, alternando hacia arriba y abajo
    // repetidamente durante toda la ventana de observación.
    const alturasUnicas = new Set(alturas);
    expect(
      alturasUnicas.size,
      `la altura del documento no debe oscilar en varias rondas al cambiar de nodo (valores vistos: ${[...alturasUnicas].join(', ')})`
    ).toBeLessThanOrEqual(3);

    // Chequeo más directo y robusto que el conteo de arriba: la "cola"
    // del muestreo (mucho después de cualquier asentamiento legítimo de
    // StrictMode) debe ser un único valor constante. Esto es lo que de
    // verdad distingue "se asienta rápido y para" (válido) de "sigue
    // oscilando durante toda la ventana" (el bug) — y no depende de
    // cuántos pasos de asentamiento sean legítimos en el futuro.
    const cola = alturas.slice(-20);
    expect(
      new Set(cola).size,
      `la altura debe quedar perfectamente estable al final de la ventana de observación (cola vista: ${[...new Set(cola)].join(', ')})`
    ).toBe(1);
  });
});
