import { test as setup, expect } from '@playwright/test';

const authFile = '.auth/user.json';

setup('authenticate', async ({ page }) => {
  const user = process.env.TEST_USER;
  const pass = process.env.TEST_PASS;
  if (!user || !pass) throw new Error('TEST_USER / TEST_PASS missing — fill them in .env');

  // Login lives on the main site; it redirects to the app subdomain (BASE_URL) and sets a
  // `.elementsenergies.com` cookie that the subdomain accepts.
  await page.goto(process.env.LOGIN_URL ?? 'https://elementsenergies.com/login');

  // Labels are <label for="username|password">. The regex avoids matching the "Show password" button.
  await page.getByLabel(/^username$/i).fill(user);
  await page.getByLabel(/^password$/i).fill(pass);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // TODO: tighten to the real post-login path once confirmed (e.g. '**/dashboard').
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
  await expect(page.getByLabel(/^password$/i)).toHaveCount(0);
  console.log('Post-login URL:', page.url());

  // The app opens on a profile picker until one is chosen. Choosing sets the `yamaha_profile_id`
  // cookie, which is saved below, so tests open straight on the page instead of the picker.
  const profileName = process.env.TEST_PROFILE ?? 'Yamaha 1';
  const profile = page.getByRole('button', { name: new RegExp(`^${profileName}\\b`) }).first();
  await profile.waitFor({ timeout: 30_000 });
  await profile.click();
  await expect
    .poll(async () => (await page.context().cookies()).some((c) => c.name === 'yamaha_profile_id'), { timeout: 15_000 })
    .toBe(true);

  await page.context().storageState({ path: authFile });
});
