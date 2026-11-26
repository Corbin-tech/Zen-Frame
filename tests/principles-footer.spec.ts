import { test, expect } from '@playwright/test';

test('principles page footer navigation, feedback dialog, and accessibility font override work', async ({ page }) => {
  await page.goto('/principles');

  await expect(page).toHaveTitle('Calm design principles — Zen Frame');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /Five calm design principles behind Zen Frame/,
  );

  const principlesLink = page.locator('footer a[href="/principles"]');
  await expect(principlesLink).toHaveAttribute('aria-current', 'page');

  // Closing CTA opens Feedback directly on /principles
  await page.getByRole('button', { name: 'Tell us what would help most' }).click();
  const dialog = page.getByRole('dialog', { name: 'Send feedback' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Footer Send feedback button also opens Feedback on /principles
  await page.locator('footer').getByRole('button', { name: 'Send feedback' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Accessibility font override yields .editorial Newsreader heading to user font
  const heading = page.locator('#principles-heading');
  const defaultFont = await heading.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(defaultFont.toLowerCase()).toContain('newsreader');

  await page.evaluate(() => {
    document.documentElement.dataset.font = 'lexend';
  });
  const overriddenFont = await heading.evaluate((el) => getComputedStyle(el).fontFamily);
  expect(overriddenFont.toLowerCase()).toContain('lexend');

  // Clicking a footer area link on /principles navigates to / and opens that area's first view
  await page.locator('footer').getByRole('link', { name: 'Library' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('button[data-area="library"]')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('button[data-tab="taskmanager"]')).toHaveAttribute('aria-current', 'page');
});
