/**
 * ARCHIVO: portada-atajos.spec.js
 * PROPÓSITO: Regresión del bug reportado en producción — "el primer clic
 *            en los atajos de las fichas de la Portada no hace nada, hay
 *            que hacer clic dos veces", reproducido también al cambiar de
 *            apartado en la subnavegación de Configuración.
 *
 * MINI-CLASE: por qué este archivo no "reproduce" el bug
 * ─────────────────────────────────────────────────────────────────
 * Se investigó a fondo antes de escribir esto: clic normal, clic con
 * coordenadas crudas (sin el auto-wait de estabilidad de Playwright),
 * con latencia de red simulada (900ms) para forzar el salto "Cargando…"
 * → contenido real a mitad de la interacción, con seguimiento de
 * identidad del nodo DOM (confirmado: ningún remount en los primeros 2s
 * tras montar la Portada) y con emulación táctil de Chromium — ninguna
 * de esas variantes reprodujo el bug contra el backend de dev. La
 * hipótesis con más respaldo (no confirmable aquí: este entorno no tiene
 * motor WebKit) es el comportamiento de "fantasma de :hover" de iOS/
 * WebKit en tablets — el primer toque sobre un elemento con estilos
 * :hover simula el hover (como lo haría un mouse) y solo el segundo
 * toque dispara el click real. Encaja con los tres síntomas reportados
 * (atajos tipo <Link>, botones de subnav — ambos con hover:-algo) y con
 * que el usuario confirmó tablets como parte del público objetivo de
 * esta plataforma. Se aplicó `touch-action: manipulation` a los
 * elementos interactivos (index.css) como mitigación estándar para esta
 * clase de bug — sin motor WebKit a mano para confirmar que lo resuelve
 * del todo.
 *
 * Esta prueba deja la regresión de clic único con MOUSE (lo que si se
 * puede verificar aquí) para que una reaparición real de "hace falta
 * doble clic" en el flujo normal de escritorio la atrape.
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
  // Tras login, App.jsx deja de renderizar el formulario — basta con
  // esperar a que desaparezca para saber que la sesión quedó activa.
  await expect(page.locator('input[type="email"]')).toBeHidden({ timeout: 10000 });
}

async function irAlPrimerProyecto(page) {
  // ?vista=todos: el modo por defecto de /proyectos es "Carteras de
  // proyectos" (agrupado), vacío en un entorno de dev sin carteras
  // creadas — el listado plano con las tarjetas reales vive en este
  // modo explícito.
  await page.goto('/proyectos?vista=todos');
  // Excluye "/proyectos/nuevo" (el botón de alta, mismo prefijo de href)
  // — solo interesan tarjetas de proyectos reales.
  const primerProyecto = page.locator('main a[href^="/proyectos/"]:not([href="/proyectos/nuevo"])').first();
  await expect(primerProyecto).toBeVisible({ timeout: 10000 });
  await primerProyecto.click();
  await page.waitForURL(/\/proyectos\/[^/]+$/, { timeout: 10000 });
}

test.describe('Portada del proyecto — un solo clic navega', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await irAlPrimerProyecto(page);
  });

  test('"Ver lo vencido" navega con un solo clic y aplica el filtro', async ({ page }) => {
    await page.getByRole('link', { name: 'Ver lo vencido' }).click();
    await expect(page).toHaveURL(/\/seguimiento/);
    // El filtro de vencidas debe quedar aplicado y visible (checkbox
    // marcado + badge de "1 filtro activo"), no solo navegar al árbol
    // completo sin filtrar.
    await expect(page.getByLabel('Solo vencidas')).toBeChecked({ timeout: 5000 });
  });

  test('"Registrar avance" navega con un solo clic y pide elegir un nodo', async ({ page }) => {
    await page.getByRole('link', { name: 'Registrar avance' }).click();
    await expect(page).toHaveURL(/\/seguimiento/);
    await expect(page.getByText('¿A qué elemento quieres registrarle avance?')).toBeVisible({ timeout: 5000 });
  });

  test('"Importar desde Excel" navega con un solo clic y abre el wizard', async ({ page }) => {
    await page.getByRole('link', { name: 'Importar desde Excel' }).click();
    await expect(page).toHaveURL(/\/seguimiento/);
    await expect(page.getByText('Importar estructura')).toBeVisible({ timeout: 5000 });
  });

  test('"Invitar persona" navega con un solo clic y abre el modal', async ({ page }) => {
    await page.getByRole('link', { name: 'Invitar persona' }).click();
    await expect(page).toHaveURL(/\/configuracion/);
    await expect(page.getByText('Invitar a participar')).toBeVisible({ timeout: 5000 });
  });

  test('"Registrar riesgo" navega con un solo clic y abre el modal', async ({ page }) => {
    await page.getByRole('link', { name: 'Registrar riesgo' }).click();
    await expect(page).toHaveURL(/\/riesgos/);
    await expect(page.getByText('Nuevo riesgo')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Configuración — un solo clic cambia de apartado', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await irAlPrimerProyecto(page);
    await page.goto(page.url() + '/configuracion');
  });

  test('cambiar a "Datos generales" con un solo clic muestra su contenido', async ({ page }) => {
    const nav = page.locator('nav[aria-label="Apartados de configuración"]');
    await nav.getByRole('button', { name: 'Datos generales' }).click();
    await expect(page.getByRole('heading', { name: 'Datos generales' })).toBeVisible({ timeout: 5000 });
  });

  test('cambiar a "Plantilla y estructura" con un solo clic muestra su contenido', async ({ page }) => {
    const nav = page.locator('nav[aria-label="Apartados de configuración"]');
    await nav.getByRole('button', { name: 'Plantilla y estructura' }).click();
    await expect(page.getByRole('heading', { name: 'Plantilla y estructura' })).toBeVisible({ timeout: 5000 });
  });
});
