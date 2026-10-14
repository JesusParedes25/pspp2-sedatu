/**
 * ARCHIVO: fase3-estado-consulta.spec.js
 * PROPÓSITO: Fase 3 del modelo de permisos (docs/modelo-permisos.md,
 *            sección 11) — el candado del árbol y la banda del panel
 *            deben aparecer EXACTAMENTE donde `permisos.esSoloLectura`
 *            es `true` para ese nodo (la misma fuente que ya usa el
 *            servidor para rechazar la escritura, ver sección 11.1), y
 *            en ningún otro lugar.
 *
 * Requiere el stack de dev corriendo (ver playwright.config.js) con un
 * proyecto real donde el usuario de prueba participe en al menos una
 * acción pero NO en la etapa que la contiene (el caso de la sección
 * 11.5) — los selectores de abajo asumen esa condición de datos; ajustar
 * CORREO/PASSWORD/el nombre del proyecto a un escenario real antes de
 * correrla. No se pudo ejecutar en el sandbox de esta sesión (el daemon
 * de Docker no tenía acceso al registro de imágenes) — queda lista para
 * correr contra un stack de dev real.
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

test.describe('Fase 3 — estado de consulta en el árbol de Detalle', () => {
  test('un nodo sin captura muestra candado + atenuación; uno con captura, ninguno de los dos', async ({ page }) => {
    await login(page);
    // Navegar a un proyecto real donde el usuario no participe en al
    // menos una etapa — ajustar a un caso conocido del dev/seed actual.
    await page.goto('/proyectos');
    await page.getByRole('link', { name: /ver proyecto|detalle/i }).first().click();
    await page.getByRole('link', { name: /seguimiento/i }).click();

    const filaConCandado = page.locator('[role="treeitem"]').filter({ has: page.locator('svg[aria-label="Sin permiso de edición en este elemento"]') });
    const filaSinCandado = page.locator('[role="treeitem"]').filter({ hasNot: page.locator('svg[aria-label="Sin permiso de edición en este elemento"]') });

    await expect(filaConCandado.first()).toBeVisible();
    await expect(filaSinCandado.first()).toBeVisible();

    // El punto del semáforo de una fila con candado NO debe llevar la
    // misma clase de opacidad que el nombre/porcentaje de esa fila —
    // queda a opacidad plena a propósito (sección 11.2).
    const primeraConCandado = filaConCandado.first();
    const punto = primeraConCandado.locator('span.rounded-full').first();
    await expect(punto).not.toHaveClass(/opacity-/);
  });

  test('caso mixto: la etapa sin participación lleva candado, su acción con invitación directa no', async ({ page }) => {
    await login(page);
    // Este test asume el escenario de datos de la sección 11.5 —
    // sustituir por un proyecto/etapa/acción reales del dev/seed donde
    // se conozca de antemano esta combinación exacta.
    test.skip(true, 'Requiere un proyecto de dev con el escenario de datos exacto (etapa sin participación, acción hija con invitación directa) — completar el selector al correr contra un stack real.');
  });
});

test.describe('Fase 3 — el panel de detalle no se atenúa, y la banda reemplaza (no deshabilita) los botones', () => {
  test('un nodo sin captura muestra la banda de consulta y "Solicitar participar", sin "Registrar avance"/"Más acciones"', async ({ page }) => {
    await login(page);
    await page.goto('/proyectos');
    await page.getByRole('link', { name: /ver proyecto|detalle/i }).first().click();
    await page.getByRole('link', { name: /seguimiento/i }).click();

    const filaConCandado = page.locator('[role="treeitem"]').filter({ has: page.locator('svg[aria-label="Sin permiso de edición en este elemento"]') }).first();
    await filaConCandado.click();

    await expect(page.getByText(/est[aá]s en modo consulta/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /registrar avance/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /más acciones/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /solicitar participar/i })).toBeVisible();

    // El chip "Consulta" vive junto a los demás chips del encabezado.
    await expect(page.getByText('Consulta', { exact: true })).toBeVisible();

    // El panel (no el árbol) debe quedar a opacidad plena.
    const panel = page.locator('text=Estás en modo consulta').locator('xpath=ancestor::div[contains(@class,"flex-1")][1]');
    await expect(panel).not.toHaveClass(/opacity-/);

    // El contenido de lectura (pestañas) sigue completo.
    for (const pestana of ['Actividad', 'Documentos', 'Indicadores', 'Territorio', 'Riesgos']) {
      await expect(page.getByRole('button', { name: pestana })).toBeVisible();
    }
  });

  test('un nodo con captura sigue mostrando "Registrar avance"/"Más acciones", sin banda', async ({ page }) => {
    await login(page);
    await page.goto('/proyectos');
    await page.getByRole('link', { name: /ver proyecto|detalle/i }).first().click();
    await page.getByRole('link', { name: /seguimiento/i }).click();

    const filaSinCandado = page.locator('[role="treeitem"]').filter({ hasNot: page.locator('svg[aria-label="Sin permiso de edición en este elemento"]') }).first();
    await filaSinCandado.click();

    await expect(page.getByRole('button', { name: /registrar avance/i })).toBeVisible();
    await expect(page.getByText(/est[aá]s en modo consulta/i)).toHaveCount(0);
  });
});
