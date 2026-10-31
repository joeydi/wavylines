import { test, expect } from '@playwright/test';

// Generated test image, never read from the user's files.
async function imageFixture(page: import('@playwright/test').Page, transparent = false) {
  const base64 = await page.evaluate(transparent => {
    const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    if (!transparent) { ctx.fillStyle = '#ff795f'; ctx.fillRect(0,0,8,16); ctx.fillStyle = '#163945'; ctx.fillRect(8,0,8,16); }
    return canvas.toDataURL('image/png').split(',')[1];
  }, transparent);
  return { name: 'Test sunset.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

test('palette edit, save, reload, export/import, duplicate and delete', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Palettes', exact: true }).click();
  await page.getByRole('button', { name: 'New palette' }).click();
  await page.getByLabel('Palette name').fill('My ocean');
  await page.getByLabel('Background top hex', { exact: true }).fill('#112233');
  await page.getByLabel('Background top hex', { exact: true }).press('Tab');
  await page.getByLabel('Multi-color', { exact: true }).check();
  await page.getByRole('button', { name: 'Add color' }).first().click();
  await expect(page.getByLabel('Line color 3 hex', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Move line color 3 up' }).click();
  await page.getByRole('button', { name: 'Save palette', exact: true }).click();
  await expect(page.getByRole('button', { name: 'My ocean', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('#palette-name')).toHaveText('My ocean');
  await page.getByRole('button', { name: 'Palettes', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadPromise; const path = await download.path();
  expect(download.suggestedFilename()).toBe('wavy-lines-palettes.json');
  await page.locator('#import-file').setInputFiles(path!);
  await expect(page.locator('#custom-count')).toHaveText('2');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await page.getByLabel('Palette name').fill('Ocean copy');
  await page.getByRole('button', { name: 'Save palette', exact: true }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete palette', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ocean copy', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('built-in editing and image preview cancel restore the previous palette', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Palettes', exact: true }).click();
  await page.getByRole('button', { name: 'Soft sunset', exact: true }).click();
  await page.getByRole('button', { name: 'Edit / rename' }).click();
  await page.getByLabel('Palette name').fill('An edit');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('#palette-name')).toHaveText('Soft sunset');
  await page.locator('#image-file').setInputFiles(await imageFixture(page));
  await expect(page.locator('#extracted-colors')).toBeVisible();
  await expect(page.getByLabel('Palette name')).toHaveValue('Test sunset');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('#palette-name')).toHaveText('Soft sunset');
  await page.locator('#image-file').setInputFiles(await imageFixture(page, true));
  await expect(page.locator('#palette-notice')).toContainText('transparent');
  await expect(page.locator('#palette-name')).toHaveText('Soft sunset');
  await page.locator('#image-file').setInputFiles(await imageFixture(page));
  await expect(page.locator('#extracted-colors')).toBeVisible();
  await page.getByLabel('Multi-color', { exact: true }).check();
  await page.getByRole('button', { name: 'Save palette', exact: true }).click();
  await page.reload(); await expect(page.locator('#palette-name')).toHaveText('Test sunset');
});

test('storage failures and malformed imports keep the library usable', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.goto('/'); await page.getByRole('button', { name: 'Palettes', exact: true }).click();
  await page.getByRole('button', { name: 'New palette' }).click(); await page.getByLabel('Palette name').fill('Unsaved to disk');
  await page.getByRole('button', { name: 'Save palette', exact: true }).click();
  await expect(page.locator('#palette-notice')).toContainText('storage');
  await expect(page.getByRole('button', { name: 'Unsaved to disk', exact: true })).toBeVisible();
  await page.locator('#import-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(page.locator('#palette-notice')).toContainText('valid JSON');
});

test('GPU rendering stops while paused or motion is zero; context loss restores', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    (window as unknown as { drawCalls: number }).drawCalls = 0;
    const original = WebGL2RenderingContext.prototype.drawArrays;
    WebGL2RenderingContext.prototype.drawArrays = function(...args) { (window as unknown as { drawCalls: number }).drawCalls++; return original.apply(this, args); };
  });
  await page.goto('/');
  await expect(page.locator('#renderer-status')).toBeHidden();
  await expect.poll(() => page.evaluate(() => (window as unknown as { drawCalls: number }).drawCalls)).toBeGreaterThan(10);
  await page.getByRole('button', { name: 'Play animation' }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  const hidden = await page.evaluate(() => (window as unknown as { drawCalls: number }).drawCalls);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { drawCalls: number }).drawCalls)).toBe(hidden);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { drawCalls: number }).drawCalls)).toBeGreaterThan(hidden);
  await page.getByRole('button', { name: 'Pause animation' }).click();
  await page.waitForTimeout(700);
  const count = await page.evaluate(() => (window as unknown as { drawCalls: number }).drawCalls);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as unknown as { drawCalls: number }).drawCalls)).toBe(count);
  await page.getByRole('button', { name: 'Play animation' }).click();
  await page.locator('#intensity').fill('0'); await page.waitForTimeout(700);
  const still = await page.evaluate(() => (window as unknown as { drawCalls: number }).drawCalls);
  await page.waitForTimeout(200); expect(await page.evaluate(() => (window as unknown as { drawCalls: number }).drawCalls)).toBe(still);
  await page.evaluate(() => {
    const gl = document.querySelector('canvas')!.getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context')!;
    (window as unknown as { restoreGraphics: () => void }).restoreGraphics = () => extension.restoreContext();
    extension.loseContext();
  });
  await expect(page.locator('#renderer-status')).toContainText('recovers');
  await page.evaluate(() => (window as unknown as { restoreGraphics: () => void }).restoreGraphics());
  await expect(page.locator('#renderer-status')).toBeHidden();
  expect(await page.evaluate(() => document.querySelector('canvas')!.getContext('webgl2')!.getError())).toBe(0);
  expect(errors).toEqual([]);
});

test('reduced motion, keyboard dialogs and responsive layout', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
  await expect(page.getByRole('button', { name: 'Play animation' })).toBeVisible();
  await page.getByRole('button', { name: 'Palettes', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /Palettes/ })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.locator('#palette-drawer')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Palettes', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Tweaks', exact: true }).click();
  await expect(page.getByText('Curve Count', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.setViewportSize({ width: 844, height: 390 });
  await page.getByRole('button', { name: 'Palettes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close palettes' })).toBeVisible();
});

test('drag and drop creates an editable palette without uploading the image', async ({ page }) => {
  const external: string[] = [];
  const origin = new URL(test.info().project.use.baseURL!).origin;
  page.on('request', request => { if (!request.url().startsWith(origin + '/') && !request.url().startsWith('blob:') && !request.url().startsWith('data:')) external.push(request.url()); });
  await page.goto('/');
  const fixture = await imageFixture(page);
  const dataTransfer = await page.evaluateHandle(({ bytes, name, type }) => {
    const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(bytes)], name, { type })); return transfer;
  }, { bytes: [...fixture.buffer], name: fixture.name, type: fixture.mimeType });
  await page.locator('body').dispatchEvent('dragenter', { dataTransfer });
  await expect(page.locator('#drop-overlay')).toBeVisible();
  await page.locator('body').dispatchEvent('drop', { dataTransfer });
  await expect(page.locator('#extracted-colors')).toBeVisible();
  await page.getByLabel('Palette name').fill('Dropped colors');
  await page.getByRole('button', { name: 'Save palette', exact: true }).click();
  await page.reload(); await expect(page.locator('#palette-name')).toHaveText('Dropped colors');
  expect(external).toEqual([]);
});

test('unsupported and unreadable images preserve the selected palette', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Palettes', exact: true }).click();
  await page.locator('#image-file').setInputFiles({ name: 'image.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(page.locator('#palette-notice')).toContainText('JPEG, PNG, or WebP');
  await page.locator('#image-file').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken') });
  await expect(page.locator('#palette-notice')).toContainText('could not be read');
  await expect(page.locator('#palette-name')).toHaveText('Tidal');
});

test('DialKit and the toolbar share intensity and reset tuning', async ({ page }) => {
  await page.goto('/'); await page.locator('#intensity').fill('125');
  await page.getByRole('button', { name: 'Tweaks', exact: true }).click();
  const intensity = page.getByRole('slider', { name: 'Intensity', exact: true });
  await expect(intensity).toHaveAttribute('aria-valuenow', '1.25');
  await intensity.press('Home');
  await expect(page.locator('#intensity')).toHaveValue('0');
  await page.getByRole('button', { name: 'Reset tuning', exact: true }).click();
  await expect(page.locator('#intensity')).toHaveValue('100');
});

test('missing WebGL2 still allows palette creation and saving', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: function(this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      return type === 'webgl2' ? null : Reflect.apply(original, this, [type, ...args]);
    } });
  });
  await page.goto('/'); await expect(page.locator('#renderer-status')).toContainText('WebGL2 is unavailable');
  await page.getByRole('button', { name: 'Palettes', exact: true }).click();
  await page.getByRole('button', { name: 'New palette' }).click(); await page.getByLabel('Palette name').fill('Still colorful');
  await page.getByRole('button', { name: 'Save palette', exact: true }).click(); await page.reload();
  await expect(page.locator('#palette-name')).toHaveText('Still colorful');
});
