import { test, expect } from '@playwright/test';

test('keyboard focus stays inside the open Settings panel', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).first().click();
  const panel = page.getByRole('dialog', { name: 'Settings' });
  const close = panel.getByRole('button', { name: 'Close settings' });
  const reset = panel.getByRole('button', { name: 'Reset to defaults' });
  await expect(close).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(reset).toBeFocused();

  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  await panel.getByRole('heading', { name: 'Settings' }).click();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open settings' }).first()).toBeFocused();
});

test('disabled notification controls are skipped in tab order while reminders are off', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open settings' }).first().click();
  const panel = page.getByRole('dialog', { name: 'Settings' });
  const master = panel.locator('#settings-notify');
  const subControls = [
    panel.locator('#settings-notify-blocks'),
    panel.locator('#settings-notify-lead'),
    panel.locator('#settings-notify-due'),
    panel.locator('#settings-notify-due-time'),
    panel.locator('#settings-notify-timer'),
    panel.getByRole('button', { name: 'Send a test reminder' }),
  ];
  const nextControl = panel.getByRole('group', { name: 'Timer style' }).getByRole('button').first();

  await expect(master).not.toBeChecked();
  for (const control of subControls) {
    await expect(control).toBeDisabled();
  }

  await master.focus();
  await page.keyboard.press('Tab');
  await expect(nextControl).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(master).toBeFocused();

  // Turning reminders on re-enables all sub-controls and restores them to tab order
  await page.keyboard.press('Space');
  await expect(master).toBeChecked();
  for (const control of subControls) {
    await expect(control).toBeEnabled();
  }

  await master.focus();
  await page.keyboard.press('Tab');
  await expect(panel.locator('#settings-notify-blocks')).toBeFocused();
});
