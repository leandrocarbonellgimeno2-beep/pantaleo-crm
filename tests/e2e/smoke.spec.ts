/**
 * Smoke tests E2E — Playwright
 *
 * Para activar:
 *   npm install -D @playwright/test
 *   npx playwright install chromium
 *   npx playwright test tests/e2e/
 *
 * Variables de entorno necesarias (.env.test.local):
 *   E2E_BASE_URL=http://localhost:3000
 *   E2E_USER_EMAIL=test@example.com
 *   E2E_USER_PASSWORD=supersecret
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

test.describe('Smoke — Happy Path', () => {
  test('login y acceso al dashboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('[name="email"]', process.env.E2E_USER_EMAIL ?? '');
    await page.fill('[name="password"]', process.env.E2E_USER_PASSWORD ?? '');
    await page.click('[type="submit"]');
    await page.waitForURL(`${BASE_URL}/`, { timeout: 10_000 });
    await expect(page).toHaveURL(`${BASE_URL}/`);
  });

  test('listado de immobili carga sin error', async ({ page }) => {
    // Asume que el test de login ya dejó la sesión activa.
    // En CI usar storageState para reutilizar cookies.
    const res = await page.goto(`${BASE_URL}/immobili`);
    expect(res?.status()).toBe(200);
    // Espera a que al menos una card de inmueble sea visible
    await expect(page.locator('[data-testid="property-card"]').first()).toBeVisible({ timeout: 15_000 });
  });

  test('API /api/immobili responde 200', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/immobili?limit=1`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });
});

// ── Estructura para futuros tests ────────────────────────────────────────────
// tests/e2e/
//   smoke.spec.ts          ← este archivo
//   documenti.spec.ts      ← crear documento, verificar Storage
//   immobili.spec.ts       ← crear/editar/eliminar inmueble
//   clienti.spec.ts        ← ciclo completo de cliente
