import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const output = await mkdtemp(join(tmpdir(), 'kishi-navigation-evidence-'));
const entry = new URL('./index.html', import.meta.url);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  const externalRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) externalRequests.push(request.url()); });
  page.setDefaultTimeout(5000);
  await page.goto(entry.href);

  await page.getByRole('checkbox', { name: 'Show AFK', exact: true }).uncheck();
  assert.equal(await page.locator('.work-row[data-item="email"]').count(), 0);
  assert.ok(await page.locator('.work-row[data-item="revoke"]').isVisible());
  await page.getByRole('textbox', { name: 'Reply in the main session' }).fill('Keep this draft');
  for (const variant of ['B', 'C', 'A']) {
    await page.getByRole('button', { name: 'Next layout', exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get('variant'), variant);
    assert.equal(await page.getByRole('textbox', { name: 'Reply in the main session' }).inputValue(), 'Keep this draft');
    assert.ok(await page.getByRole('heading', { name: 'Invitation policy', exact: true }).isVisible());
  }
  await page.getByRole('textbox', { name: 'Reply in the main session' }).press('ArrowRight');
  assert.equal(new URL(page.url()).searchParams.get('variant'), 'A');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Audit log', exact: true }).click();
  assert.ok(await page.getByText('Accepted; no workflow confirmation inferred by the prototype', { exact: true }).isVisible());
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();

  await page.getByRole('button', { name: 'Repository settings', exact: true }).first().click();
  await page.getByLabel('Auto-merge', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Global settings', exact: true }).click();
  await page.getByRole('button', { name: 'Repository settings', exact: true }).first().click();
  assert.equal(await page.getByLabel('Auto-merge', { exact: true }).isChecked(), false);
  await page.getByRole('button', { name: 'Reset autoMerge', exact: true }).click();
  assert.equal(await page.getByLabel('Auto-merge', { exact: true }).isChecked(), true);
  await page.getByLabel('Aggregator', { exact: true }).selectOption('atlas-key');
  await page.locator('[data-skill="wayfinder"]').uncheck();
  await page.getByRole('button', { name: 'Back to work', exact: true }).click();
  assert.ok(await page.getByText('Next call: DeepSeek chat / Atlas owner', { exact: false }).isVisible());
  assert.ok(await page.getByText('Enabled skills: 6', { exact: false }).isVisible());

  await page.getByRole('combobox', { name: 'Preview role' }).selectOption('member');
  assert.equal(await page.getByRole('button', { name: 'Studio docs', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Users', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Repository settings', exact: true }).first().click();
  assert.equal(await page.locator('[data-setting]:enabled, [data-reviewer]:enabled, [data-skill]:enabled, [data-assignment]:enabled').count(), 0);
  await page.getByRole('combobox', { name: 'Preview role' }).selectOption('admin');
  await page.getByRole('button', { name: 'Users', exact: true }).click();
  await page.locator('[data-user="linh"]').click();
  assert.ok(await page.getByText('Password-setup email failed', { exact: true }).isVisible());
  await page.locator('#assign-user input[value="atlas"]').check();
  await page.getByRole('button', { name: 'Save assignments', exact: true }).click();
  await page.getByRole('button', { name: 'Resend invitation', exact: true }).click();
  assert.ok(await page.getByText('Password-setup email sent.', { exact: true }).isVisible());
  assert.ok(await page.locator('#assign-user input[value="atlas"]').isChecked());

  await page.getByRole('button', { name: 'Backlog', exact: true }).click();
  await page.getByRole('button', { name: 'Attach issue', exact: true }).click();
  await page.getByLabel('GitHub issue URL', { exact: true }).fill('https://github.com/example/studio-docs/issues/215');
  await page.getByRole('button', { name: 'Attach without starting', exact: true }).click();
  assert.ok(await page.getByText('Use an issue URL from this connected repository.', { exact: true }).isVisible());
  await page.getByLabel('GitHub issue URL', { exact: true }).fill('https://github.com/example/atlas/issues/215');
  await page.getByRole('button', { name: 'Attach without starting', exact: true }).click();
  assert.equal(await page.locator('.work-row[data-item="policy"]').count(), 1);
  await page.getByRole('button', { name: 'Attach issue', exact: true }).click();
  await page.getByLabel('GitHub issue URL', { exact: true }).fill('https://github.com/example/atlas/issues/999');
  await page.getByRole('button', { name: 'Attach without starting', exact: true }).click();
  assert.ok(await page.getByRole('heading', { name: 'Attached issue #999', exact: true }).isVisible());
  assert.ok(await page.locator('.session-heading .status').getByText('Ready', { exact: true }).isVisible());

  await page.locator('#scenario').selectOption('cancelling');
  assert.ok(await page.getByText('Stopping; one subprocess is still running', { exact: true }).isVisible());
  assert.ok(await page.getByRole('textbox', { name: 'Reply in the main session' }).isVisible());
  await page.locator('#scenario').selectOption('model');
  assert.ok(await page.locator('.session-heading .status').getByText('Model unavailable', { exact: true }).isVisible());
  await page.locator('#scenario').selectOption('closed');
  assert.ok(await page.locator('.issue-pin').getByText('Closed', { exact: true }).isVisible());
  assert.ok(await page.locator('.session-heading .status').getByText('Waiting for human', { exact: true }).isVisible());
  await page.locator('#scenario').selectOption('unavailable');
  assert.ok(await page.getByText('Cached at 09:41; current status unknown', { exact: true }).isVisible());
  await page.locator('#scenario').selectOption('uncertain');
  assert.ok(await page.getByText('Summary write unconfirmed', { exact: true }).isVisible());

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const variant of ['A', 'B', 'C']) {
      entry.searchParams.set('variant', variant);
      await page.goto(entry.href);
      const geometry = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
      assert.equal(geometry.width, width);
      assert.ok(geometry.content <= width, `${variant} overflows at ${width}px`);
      assert.ok(await page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)));
      assert.equal(await page.getByRole('button', { name: /^(Subagents|Attempts|Continue|Retry|Pause|Cancel)$/ }).count(), 0);
      assert.equal(await page.locator('[data-tab], [data-attempt]').count(), 0);
      await page.getByRole('button', { name: 'Next layout', exact: true }).click();
      await page.getByRole('button', { name: 'Previous layout', exact: true }).click();
      if (width === 1440 || width === 390) await page.screenshot({ path: join(output, `${variant}-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Repository settings', exact: true }).first().click();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${variant} settings overflow at ${width}px`);
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(externalRequests, []);
  console.log('PASS: navigation, drafts, AFK visibility, audit, settings, member access, invitations, attachment, conversational status, no custom run panels, 12 viewport/layout combinations.');
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
}
