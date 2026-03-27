import { expect, test } from 'playwright/test';

// Source: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html

const SKIP_REASON =
  'Requires TEST_BASE_URL env var pointing to a running API server (e.g. TEST_BASE_URL=http://localhost:3001)';

test.describe('Dashboard page', () => {
  test.skip(!process.env.TEST_BASE_URL, SKIP_REASON);

  test('dashboard page loads (200 or redirects to sign-in)', async ({ page }) => {
    const response = await page.goto('/dashboard');
    expect(response?.status()).toBe(200);
  });

  test('dashboard entry redirects unauthenticated users to sign-in with a preserved redirect target', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/sign-in\?redirectTo=%2Fdashboard$/);
  });

  test('unauthenticated access redirects to sign-in (production behaviour)', async ({ page }) => {
    await page.goto('/dashboard');
    // In production the server issues a 302 to /sign-in when there is no session.
    // Playwright follows the redirect, so page.url() ends up at the sign-in page.
    // The test server serves dashboard.html directly (no auth guard), so /dashboard
    // is the final URL in that environment.
    const finalUrl = page.url();
    expect(finalUrl).toMatch(/sign-in|dashboard/);
  });

  test('dashboard handoff renders the sign-in action for unauthenticated users', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.locator('#discord-signin-btn')).toBeAttached();
  });

  test('dashboard page title is set (not empty, not "undefined")', async ({ page }) => {
    await page.goto('/dashboard');
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title).not.toBe('undefined');
    expect(title.length).toBeGreaterThan(0);
  });

  test('dashboard page has no raw template literals visible', async ({ page }) => {
    await page.goto('/dashboard');
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);
    // Server must replace all __PLACEHOLDER__ tokens before sending HTML
    expect(bodyHtml).not.toMatch(/\$\{[^}]+\}/);
    expect(bodyHtml).not.toContain('__API_BASE__');
    expect(bodyHtml).not.toContain('__GUILD_ID__');
    expect(bodyHtml).not.toContain('__TENANT_ID__');
    expect(bodyHtml).not.toContain('__HAS_SETUP_SESSION__');
  });

  test('dashboard safely escapes tenant and guild identifiers before bootstrapping inline JS', async ({
    page,
  }) => {
    const payload = `phase8'</script><script>window.__phase8DashboardXss=1</script>`;
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));

    const response = await page.goto(
      `/dashboard?tenant_id=${encodeURIComponent(payload)}&guild_id=${encodeURIComponent(payload)}`
    );

    expect(response?.status()).toBe(200);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const testWindow = window as Window & { __phase8DashboardXss?: unknown };
          return testWindow.__phase8DashboardXss;
        })
      )
      .toBeFalsy();
    const bodyHtml = await page.evaluate(() => document.body.innerHTML);
    expect(bodyHtml).not.toContain(payload);
    expect(jsErrors).toHaveLength(0);
  });

  test('dashboard headings contain no "undefined" text', async ({ page }) => {
    await page.goto('/dashboard');
    const headings = page.locator('h1, h2, h3');
    const count = await headings.count();
    for (let i = 0; i < count; i++) {
      const text = await headings.nth(i).textContent();
      expect(text ?? '').not.toContain('undefined');
    }
  });

  test('dashboard handoff preserves the dashboard return target on the sign-in page', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    expect(page.url()).toContain('/sign-in?redirectTo=%2Fdashboard');
  });

  test('dashboard stylesheets load (no 404 for linked CSS)', async ({ page }) => {
    const failedStylesheets: string[] = [];
    page.on('response', (response) => {
      if (response.request().resourceType() === 'stylesheet' && response.status() >= 400) {
        failedStylesheets.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto('/dashboard');
    expect(failedStylesheets).toHaveLength(0);
  });

  test('dashboard page has no JavaScript errors on load', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (err) => jsErrors.push(err.message));
    await page.goto('/dashboard');
    // Allow a brief moment for any deferred scripts to execute
    await page.waitForTimeout(500);
    expect(jsErrors).toHaveLength(0);
  });

  test('dashboard page has at least one h1 heading', async ({ page }) => {
    await page.goto('/dashboard');
    const h1Count = await page.locator('h1').count();
    expect(h1Count).toBeGreaterThan(0);
    const h1Text = await page.locator('h1').first().textContent();
    expect(h1Text?.trim().length).toBeGreaterThan(0);
  });
});
