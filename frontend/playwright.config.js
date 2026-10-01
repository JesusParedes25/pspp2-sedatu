/**
 * ARCHIVO: playwright.config.js
 * PROPÓSITO: Configuración mínima para e2e/ — por ahora cubre solo la
 *            regresión del bug de "primer clic muerto" en los atajos de
 *            la Portada y la subnavegación de Configuración (reportado
 *            en producción; no reproducido con Playwright en dev — ver
 *            el comentario de cabecera de e2e/portada-atajos.spec.js).
 *
 * Requiere el stack de dev corriendo (`npm run dev` en frontend/ y
 * backend/, con datos sembrados) — no levanta servidores por su cuenta
 * (`webServer` queda sin usar a propósito: este repo ya tiene su propio
 * flujo de arranque vía Docker/`npm run dev`, duplicarlo aquí solo
 * agregaría una segunda forma de hacer lo mismo).
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.PSPP_E2E_BASE_URL || 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
