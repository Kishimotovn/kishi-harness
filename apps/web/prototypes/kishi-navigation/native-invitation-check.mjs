import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { build } from 'vite';

const hostSource = await readFile(new URL('./native-models.js', import.meta.url), 'utf8');
let catalogHandler;
let catalogCleanup;
let catalogDisposed = false;
let skillSnapshot = { complete: true, skills: [{ name: 'installed-skill', description: 'private metadata' }] };
let skillFailure = false;
const hostPlugin = new Function('harness', hostSource + '\nreturn createNativeModelCatalogPrototype();')({
  handle(name, handler) {
    assert.equal(name, 'model-catalog');
    catalogHandler = handler;
    return () => { catalogDisposed = true; };
  },
});
hostPlugin.apply({
  effect(register) { catalogCleanup = register(); },
  get(name) {
    assert.equal(name, 'skills');
    return { async snapshot() {
      if (skillFailure) throw new Error('private skill failure');
      return skillSnapshot;
    } };
  },
  llm: {
    listProviders() { return [{ id: 'first', name: 'First provider' }, { id: 'second', name: 'Second provider' }, { id: 'broken', name: 'Unavailable provider' }]; },
    async listModels(provider) {
      if (provider === 'broken') throw new Error('private error detail');
      return [{ id: 'same-model', name: 'Configured model' }];
    },
    listConfigurableProviders() { return [{ settingsNs: 'models' }, { settingsNs: 'models' }]; },
  },
});
try {
  const catalog = await catalogHandler();
  assert.deepEqual(catalog.models.map(model => model.id), [JSON.stringify(['first', 'same-model']), JSON.stringify(['second', 'same-model'])]);
  assert.deepEqual(catalog.namespaces, ['models']);
  assert.deepEqual(catalog.errors, ['Model catalog unavailable: Unavailable provider']);
  assert.deepEqual(catalog.skills, [{ name: 'installed-skill' }]);
  assert.deepEqual(catalog.skillErrors, []);
  assert.equal(JSON.stringify(catalog).includes('private error detail'), false);
  skillSnapshot = { ...skillSnapshot, complete: false };
  const incomplete = await catalogHandler();
  assert.deepEqual(incomplete.skills, []);
  assert.deepEqual(incomplete.skillErrors, ['Skill discovery is incomplete.']);
  skillFailure = true;
  const failed = await catalogHandler();
  assert.deepEqual(failed.skills, []);
  assert.deepEqual(failed.skillErrors, ['Installed skills are unavailable.']);
} finally {
  catalogCleanup();
}
assert.equal(catalogDisposed, true);

const source = await readFile(new URL('./native-client.js', import.meta.url), 'utf8');
const themeStyles = await Promise.all(['base.css', 'design-platform.css', 'gradient-shadow-text.css'].map(file => readFile(new URL('../../../../packages/client/ui-theme/src/styles/' + file, import.meta.url), 'utf8')));
const entry = '\0native-invitation-check';
const output = await build({
  configFile: false,
  root: fileURLToPath(new URL('../../', import.meta.url)),
  logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'native-invitation-check',
    resolveId(id) { if (id === entry) return entry; },
    load(id) {
      if (id !== entry) return;
      return `
        import * as React from 'react';
        import { createRoot } from 'react-dom/client';
        const entries = new Map();
        const slots = {
          inject(_name, register) { return register(); },
          register(options, component) {
            const id = options.id ?? options.key ?? options.name;
            if (id === 'kishi-activity-prototype') throw new Error('Audit presentation belongs inline, not in an Activity popup');
            entries.set(id, component);
            return () => entries.delete(id);
          },
        };
        const host = { async call(method) {
          if (method !== 'model-catalog') throw new Error('Unexpected RPC');
          return {
            models: [
              { id: JSON.stringify(['general', 'alpha']), provider: 'general', providerName: 'Primary configuration', name: 'Configured Alpha' },
              { id: JSON.stringify(['dedicated', 'alpha']), provider: 'dedicated', providerName: 'Second configuration', name: 'Configured Alpha' },
            ],
            namespaces: ['model-settings'], errors: [],
            skills: [{ name: 'planning-skill' }, { name: 'review-skill' }], skillErrors: [],
          };
        } };
        const styles = { insert(css) {
          const style = document.createElement('style');
          style.textContent = css;
          document.head.append(style);
          return () => style.remove();
        } };
        ${source}
        createNativeNavigationPrototype().apply({ get() { return slots; }, effect(register) { register(); } });
        function Check() {
          const [section, setSection] = React.useState('kishi-users-prototype');
          return React.createElement(React.Fragment, null,
            React.createElement('select', { 'aria-label': 'Check section', value: section, onChange: event => setSection(event.target.value) },
              ['kishi-users-prototype', 'kishi-global-prototype', 'kishi-repository-prototype'].map(id => React.createElement('option', { key: id, value: id }, id))),
            React.createElement('details', null, React.createElement('summary', null, 'Sample work navigation'), React.createElement(entries.get('sidebar.workspaces'), { wide: true })),
            section === 'kishi-global-prototype' && entries.has('model-settings') && React.createElement(entries.get('model-settings'), { provider: { provider: 'dedicated', displayName: 'Second configuration' }, configured: true }),
            React.createElement(entries.get(section)));
        }
        createRoot(document.getElementById('root')).render(React.createElement(Check));
      `;
    },
  }],
  build: { write: false, minify: false, rollupOptions: { input: entry, output: { format: 'iife' } } },
});
const bundle = (Array.isArray(output) ? output[0] : output).output.find(chunk => chunk.type === 'chunk');
assert.ok(bundle);
const screenshots = await mkdtemp(join(tmpdir(), 'kishi-invitation-evidence-'));
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const requests = [];
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
  await page.setContent('<html lang="en"><body><main id="root"></main></body></html>');
  await page.addStyleTag({ content: themeStyles.join('\n') + '\nbody { font-family: var(--dsw-font-family); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }' });
  await page.addScriptTag({ content: bundle.code });
  const users = page.getByRole('group', { name: 'Sample users', exact: true });
  const form = page.getByRole('form', { name: 'Invite user', exact: true });
  const details = page.getByRole('region', { name: 'User Details', exact: true });
  const failure = page.getByRole('checkbox', { name: 'Simulate email failure', exact: true });
  await users.waitFor({ state: 'visible' });
  assert.equal(await users.getByRole('button').count(), 2);

  await failure.check();
  await page.getByRole('button', { name: 'Invite user', exact: true }).click();
  const email = form.getByRole('textbox', { name: 'Email address', exact: true });
  await email.fill('not-an-email');
  await form.getByRole('button', { name: 'Send invitation', exact: true }).click();
  assert.equal(await email.evaluate(input => input.validity.valid), false);
  assert.equal(await users.getByRole('button').count(), 2);
  await email.fill('new.member@example.test');
  await form.getByRole('checkbox', { name: 'Atlas', exact: true }).check();
  await form.getByRole('button', { name: 'Send invitation', exact: true }).click();
  await details.getByText('Password-setup email failed', { exact: true }).waitFor();
  assert.equal(await users.getByRole('button').count(), 3);
  assert.equal(await details.getByRole('checkbox', { name: 'Atlas', exact: true }).isChecked(), true);
  assert.equal(await details.getByRole('checkbox', { name: 'Studio docs', exact: true }).isChecked(), false);
  await details.getByRole('button', { name: 'Resend invitation', exact: true }).click();
  assert.equal(await users.getByRole('button').count(), 3);
  assert.equal(await details.getByText('Password-setup email failed', { exact: true }).isVisible(), true);
  await failure.uncheck();
  await details.getByRole('button', { name: 'Resend invitation', exact: true }).click();
  await details.getByText('Invitation sent / no first login', { exact: true }).waitFor();
  assert.equal(await users.getByRole('button').count(), 3);
  assert.equal(await details.getByRole('checkbox', { name: 'Atlas', exact: true }).isChecked(), true);

  await page.getByRole('button', { name: 'Invite user', exact: true }).click();
  await email.fill('NEW.MEMBER@example.test');
  await form.getByRole('button', { name: 'Send invitation', exact: true }).click();
  await form.getByRole('alert').waitFor();
  assert.equal(await users.getByRole('button').count(), 3);
  await email.fill('another.member@example.test');
  await form.getByRole('checkbox', { name: 'Studio docs', exact: true }).check();
  await form.getByRole('button', { name: 'Send invitation', exact: true }).click();
  await details.getByText('Invitation sent / no first login', { exact: true }).waitFor();
  assert.equal(await users.getByRole('button').count(), 4);
  assert.equal(await details.getByRole('checkbox', { name: 'Studio docs', exact: true }).isChecked(), true);

  await page.getByRole('button', { name: 'Invite user', exact: true }).click();
  await email.fill('pending.member@example.test');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await form.getByRole('button', { name: 'Send invitation', exact: true }).isVisible(), true);
    await page.locator('.knp-settings').screenshot({ path: join(screenshots, `invite-${width}.png`) });
  }

  const section = page.getByRole('combobox', { name: 'Check section', exact: true });
  const planning = page.getByRole('combobox', { name: 'Planning', exact: true });
  const autoMerge = page.getByRole('checkbox', { name: 'Auto-merge', exact: true });
  const save = page.getByRole('button', { name: 'Save changes', exact: true });
  const discard = page.getByRole('button', { name: 'Discard', exact: true });
  const reset = page.getByRole('button', { name: 'Reset auto-merge', exact: true });
  const firstModel = JSON.stringify(['general', 'alpha']);
  const secondModel = JSON.stringify(['dedicated', 'alpha']);
  await section.selectOption('kishi-global-prototype');
  await save.waitFor({ state: 'visible' });
  assert.equal(await save.isEnabled(), false);
  const reviewers = page.getByRole('group', { name: 'Reviewers', exact: true });
  const primaryReviewer = reviewers.getByRole('checkbox', { name: 'Configured Alpha (Primary configuration)', exact: true });
  const secondReviewer = reviewers.getByRole('checkbox', { name: 'Configured Alpha (Second configuration)', exact: true });
  const skills = page.getByRole('group', { name: 'Enabled skills', exact: true });
  const planningSkill = skills.getByRole('checkbox', { name: 'planning-skill', exact: true });
  const reviewSkill = skills.getByRole('checkbox', { name: 'review-skill', exact: true });
  const finalAck = page.getByRole('checkbox', { name: 'Final-closure acknowledgement', exact: true });
  const cycleLimit = page.getByRole('spinbutton', { name: 'Unsuccessful fix/review cycles before asking', exact: true });
  await reviewers.waitFor({ state: 'visible' });
  assert.equal(await finalAck.isChecked(), false);
  assert.equal(await cycleLimit.inputValue(), '2');
  await primaryReviewer.check();
  await planning.selectOption(firstModel);
  await save.click();
  await secondReviewer.check();
  await planningSkill.check();
  await finalAck.check();
  await cycleLimit.fill('3');
  await section.selectOption('kishi-repository-prototype');
  assert.equal(await primaryReviewer.isChecked(), true);
  assert.equal(await secondReviewer.isChecked(), false);
  assert.equal(await planningSkill.isChecked(), false);
  assert.equal(await finalAck.isChecked(), false);
  assert.equal(await cycleLimit.inputValue(), '2');
  await section.selectOption('kishi-global-prototype');
  await save.click();
  await section.selectOption('kishi-repository-prototype');
  assert.equal(await secondReviewer.isChecked(), true);
  assert.equal(await planningSkill.isChecked(), true);
  assert.equal(await finalAck.isChecked(), true);
  assert.equal(await cycleLimit.inputValue(), '3');
  await secondReviewer.uncheck();
  await planningSkill.uncheck();
  await reviewSkill.check();
  await finalAck.uncheck();
  await cycleLimit.fill('4');
  await save.click();
  await section.selectOption('kishi-global-prototype');
  await reviewSkill.check();
  await cycleLimit.fill('5');
  await save.click();
  await section.selectOption('kishi-repository-prototype');
  assert.equal(await primaryReviewer.isChecked(), true);
  assert.equal(await secondReviewer.isChecked(), false);
  assert.equal(await planningSkill.isChecked(), false);
  assert.equal(await reviewSkill.isChecked(), true);
  assert.equal(await finalAck.isChecked(), false);
  assert.equal(await cycleLimit.inputValue(), '4');
  for (const name of ['reviewers', 'skills', 'final-closure acknowledgement', 'cycle limit']) await page.getByRole('button', { name: 'Reset ' + name, exact: true }).click();
  assert.equal(await secondReviewer.isChecked(), true);
  await discard.click();
  assert.equal(await secondReviewer.isChecked(), false);
  for (const name of ['reviewers', 'skills', 'final-closure acknowledgement', 'cycle limit']) await page.getByRole('button', { name: 'Reset ' + name, exact: true }).click();
  await save.click();
  assert.equal(await cycleLimit.inputValue(), '5');
  await cycleLimit.fill('0');
  assert.equal(await save.isEnabled(), false);
  await cycleLimit.fill('1.5');
  assert.equal(await save.isEnabled(), false);
  await discard.click();
  await section.selectOption('kishi-global-prototype');
  await secondReviewer.uncheck();
  await save.click();
  await primaryReviewer.uncheck();
  assert.equal(await save.isEnabled(), false);
  await discard.click();
  await planning.selectOption(secondModel);
  await autoMerge.uncheck();
  await section.selectOption('kishi-repository-prototype');
  assert.equal(await planning.inputValue(), firstModel);
  assert.equal(await autoMerge.isChecked(), true);
  await autoMerge.uncheck();
  await section.selectOption('kishi-global-prototype');
  assert.equal(await planning.inputValue(), secondModel);
  await discard.click();
  assert.equal(await planning.inputValue(), firstModel);
  assert.equal(await autoMerge.isChecked(), true);
  assert.equal(await save.isEnabled(), false);
  await planning.selectOption(secondModel);
  await save.click();
  await section.selectOption('kishi-repository-prototype');
  assert.equal(await planning.inputValue(), secondModel);
  assert.equal(await autoMerge.isChecked(), false);
  assert.equal(await save.isEnabled(), true);
  await save.click();
  assert.equal(await save.isEnabled(), false);
  await section.selectOption('kishi-global-prototype');
  await autoMerge.uncheck();
  await save.click();
  await autoMerge.check();
  await save.click();
  await section.selectOption('kishi-repository-prototype');
  assert.equal(await autoMerge.isChecked(), false);
  await reset.click();
  assert.equal(await autoMerge.isChecked(), true);
  assert.equal(await save.isEnabled(), true);
  await discard.click();
  assert.equal(await autoMerge.isChecked(), false);
  assert.equal(await reset.isEnabled(), true);
  await reset.click();
  await save.click();
  assert.equal(await reset.isEnabled(), false);
  await section.selectOption('kishi-global-prototype');
  await autoMerge.uncheck();
  await save.click();
  await section.selectOption('kishi-repository-prototype');
  assert.equal(await autoMerge.isChecked(), false);
  assert.equal(await reset.isEnabled(), false);
  await autoMerge.check();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await save.isVisible(), true);
    await page.locator('.knp-settings').screenshot({ path: join(screenshots, `settings-${width}.png`) });
  }
  await discard.click();
  await section.selectOption('kishi-global-prototype');
  const availability = page.getByRole('group', { name: 'Repository availability for Second configuration', exact: true });
  await availability.getByRole('checkbox', { name: 'All repositories', exact: true }).uncheck();
  await availability.getByRole('checkbox', { name: 'Studio docs', exact: true }).check();
  await availability.getByRole('button', { name: 'Save availability', exact: true }).click();
  assert.equal(await planning.inputValue(), secondModel);
  assert.equal(await planning.locator('option:checked').textContent(), 'Unavailable model');
  assert.equal(await planning.locator('option:not([disabled])').count(), 1);
  await planning.selectOption(firstModel);
  await save.click();
  await section.selectOption('kishi-repository-prototype');
  assert.equal(await planning.inputValue(), firstModel);
  for (const role of ['Planning', 'Building', 'Aggregator', 'QA']) {
    const choices = await page.getByRole('combobox', { name: role, exact: true }).locator('option:not([disabled])').evaluateAll(options => options.map(option => ({ value: option.value, label: option.textContent })));
    assert.deepEqual(choices, [{ value: firstModel, label: 'Configured Alpha (Primary configuration)' }]);
  }
  assert.equal(await reviewers.getByRole('checkbox').count(), 1);
  await section.selectOption('kishi-global-prototype');
  await availability.getByRole('checkbox', { name: 'Studio docs', exact: true }).uncheck();
  await availability.getByRole('checkbox', { name: 'Atlas', exact: true }).check();
  await availability.getByRole('button', { name: 'Save availability', exact: true }).click();
  assert.equal(await planning.locator('option:not([disabled])').count(), 1);
  await section.selectOption('kishi-repository-prototype');
  assert.deepEqual(await planning.locator('option:not([disabled])').evaluateAll(options => options.map(option => option.value)), [firstModel, secondModel]);
  assert.equal(await page.locator('.knp-activity').count(), 0);
  assert.equal(await page.getByRole('region', { name: 'Activity history', exact: true }).count(), 0);
  await page.getByText('Sample work navigation', { exact: true }).click();
  const navigation = page.locator('.knp-browser');
  await navigation.locator('[data-knp-work="invites"]').click();
  assert.equal(await navigation.locator('[data-knp-work="invites"]').getAttribute('aria-pressed'), 'true');
  await navigation.locator('.knp-field select').selectOption('docs');
  assert.equal(await navigation.locator('[data-knp-work="guide"]').getAttribute('aria-pressed'), 'true');
  await navigation.locator('.knp-footer select').selectOption('member');
  assert.equal(await navigation.locator('[data-knp-work="guide"]').count(), 0);
  assert.equal(await navigation.locator('[data-knp-work="policy"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log('PASS: invitations, staged settings, model filtering, sample navigation, no Activity popup, desktop/mobile width, no network requests.');
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser.close();
}
