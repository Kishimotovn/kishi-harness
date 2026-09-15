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
        const sectionLabels = new Map();
        let updateEntries = () => {};
        const slots = {
          inject(_name, register) { return register(); },
          register(options, component) {
            const id = options.id ?? options.key ?? options.name;
            if (id === 'kishi-activity-prototype') throw new Error('Audit presentation belongs inline, not in an Activity popup');
            entries.set(id, component);
            if (options.name === 'settings.section') sectionLabels.set(id, options.label);
            updateEntries();
            return () => { entries.delete(id); updateEntries(); };
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
        const workspace = { startSession() { document.getElementById('request-result').textContent = 'Native conversation opened'; } };
        const services = { slots, uiWorkspace: workspace };
        createNativeNavigationPrototype().apply({ get(name) { return services[name]; }, effect(register) { register(); } });
        function Check() {
          const [section, setSection] = React.useState('kishi-users-prototype');
          const [, setRevision] = React.useState(0);
          React.useEffect(() => {
            updateEntries = () => setRevision(revision => revision + 1);
            return () => { updateEntries = () => {}; };
          }, []);
          const nativeModel = entries.get('conversation.input.model');
          return React.createElement(React.Fragment, null,
            React.createElement('select', { 'aria-label': 'Check section', value: section, onChange: event => setSection(event.target.value) },
              ['kishi-users-prototype', 'kishi-global-prototype', 'kishi-repository-prototype', 'models', 'plugins', 'agent-presets'].map(id => React.createElement('option', { key: id, value: id }, sectionLabels.get(id) ?? id))),
            React.createElement('details', null, React.createElement('summary', null, 'Sample work navigation'), React.createElement(entries.get('sidebar.workspaces'), { wide: true })),
            React.createElement('p', { id: 'request-result', role: 'status' }),
            React.createElement('section', { 'aria-label': 'Native General settings' },
              ['language', 'appearance', 'font-size', 'permission', 'transcript-view', 'composer-enter'].map(id => entries.has(id)
                ? React.createElement(entries.get(id), { key: id })
                : React.createElement('button', { key: id }, 'Native ' + id))),
            nativeModel ? React.createElement(nativeModel) : React.createElement('button', null, 'Native model selector'),
            entries.has('conversation.input.plan') ? React.createElement(entries.get('conversation.input.plan')) : React.createElement('button', null, 'Native permission selector'),
            entries.has('cordis-panel') ? React.createElement(entries.get('cordis-panel')) : React.createElement('button', null, 'Native plugin manager'),
            entries.has('sidebar.settings') ? React.createElement(entries.get('sidebar.settings'), { wide: true }) : React.createElement('button', null, 'Native settings'),
            entries.has('open-document') ? React.createElement(entries.get('open-document')) : React.createElement('button', null, 'Native configuration file'),
            React.createElement(entries.get('self')),
            section === 'kishi-global-prototype' && entries.has('model-settings') && React.createElement(entries.get('model-settings'), { provider: { provider: 'dedicated', displayName: 'Second configuration' }, configured: true }),
            entries.has(section) ? React.createElement(entries.get(section)) : React.createElement('button', null, 'Native ' + section + ' administration'));
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

  const atlasAssignment = details.getByRole('checkbox', { name: 'Atlas', exact: true });
  const saveAssignments = details.getByRole('button', { name: 'Save changes', exact: true });
  const discardAssignments = details.getByRole('button', { name: 'Discard', exact: true });
  await atlasAssignment.check();
  assert.equal(await saveAssignments.isEnabled(), true);
  await discardAssignments.click();
  assert.equal(await atlasAssignment.isChecked(), false);
  await atlasAssignment.check();
  await saveAssignments.click();
  await users.getByRole('button', { name: 'Minh Nguyen', exact: true }).click();
  await users.getByRole('button', { name: 'another.member@example.test', exact: true }).click();
  assert.equal(await atlasAssignment.isChecked(), true);
  await details.getByRole('button', { name: 'Disable access', exact: true }).click();
  await details.getByRole('button', { name: 'Keep access', exact: true }).click();
  assert.equal(await details.getByText('Access enabled', { exact: true }).isVisible(), true);
  await details.getByRole('button', { name: 'Disable access', exact: true }).click();
  await details.getByRole('button', { name: 'Confirm disable access', exact: true }).click();
  assert.equal(await details.getByText('Access disabled', { exact: true }).isVisible(), true);
  assert.equal(await details.getByRole('button', { name: 'Resend invitation', exact: true }).isEnabled(), false);
  assert.equal(await users.getByRole('button').count(), 4);
  assert.equal(await atlasAssignment.isChecked(), true);
  await details.getByRole('button', { name: 'Re-enable access', exact: true }).click();
  assert.equal(await details.getByText('Access enabled', { exact: true }).isVisible(), true);
  assert.equal(await atlasAssignment.isChecked(), true);
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
  assert.deepEqual((await section.locator('option').allTextContents()).slice(0, 3), ['Users', 'Global', 'Repositories']);
  assert.equal(await page.getByRole('button', { name: 'Native language', exact: true }).count(), 0);
  const planning = page.getByRole('combobox', { name: 'Planning', exact: true });
  const autoMerge = page.getByRole('checkbox', { name: 'Auto-merge', exact: true });
  const save = page.getByRole('button', { name: 'Save changes', exact: true });
  const discard = page.getByRole('button', { name: 'Discard', exact: true });
  const reset = page.getByRole('button', { name: 'Reset auto-merge', exact: true });
  const firstModel = JSON.stringify(['general', 'alpha']);
  const secondModel = JSON.stringify(['dedicated', 'alpha']);
  await section.selectOption('kishi-global-prototype');
  await save.waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('heading', { name: 'New Session defaults', exact: true }).isVisible(), true);
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
  assert.equal(await navigation.getByRole('button', { name: 'Picker', exact: true }).count(), 0);
  await navigation.getByRole('button', { name: 'New request', exact: true }).click();
  await page.getByText('Native conversation opened', { exact: true }).waitFor();
  assert.equal(await navigation.getByRole('textbox', { name: 'Request title', exact: true }).count(), 0);
  await navigation.locator('[data-knp-work="invites"]').click();
  assert.equal(await navigation.locator('[data-knp-work="invites"]').getAttribute('aria-pressed'), 'true');
  await navigation.locator('.knp-field select').selectOption('docs');
  assert.equal(await navigation.locator('[data-knp-work="guide"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('button', { name: 'Native model selector', exact: true }).count(), 1);
  await navigation.locator('.knp-footer select').selectOption('member');
  assert.equal(await navigation.locator('[data-knp-work="guide"]').count(), 0);
  assert.equal(await navigation.locator('[data-knp-work="policy"]').getAttribute('aria-pressed'), 'true');
  for (const label of ['Native permission selector', 'Native plugin manager', 'Native configuration file']) assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Native settings', exact: true }).count(), 1);
  assert.deepEqual(await page.getByRole('region', { name: 'Native General settings', exact: true }).getByRole('button').allTextContents(), ['Native appearance', 'Native font-size']);
  await section.selectOption('kishi-repository-prototype');
  await page.getByRole('heading', { name: 'Atlas settings', exact: true }).waitFor();
  assert.equal(await planning.isDisabled(), true);
  assert.equal(await autoMerge.isDisabled(), true);
  assert.equal(await reviewers.getByRole('checkbox', { disabled: false }).count(), 0);
  assert.equal(await skills.getByRole('checkbox', { disabled: false }).count(), 0);
  assert.equal(await save.count(), 0);
  assert.equal(await discard.count(), 0);
  assert.deepEqual(await page.locator('.knp-settings').getByRole('combobox', { name: 'Repository', exact: true }).locator('option').allTextContents(), ['Atlas']);
  for (const settingsSection of ['kishi-global-prototype', 'kishi-users-prototype', 'models', 'plugins', 'agent-presets']) {
    await section.selectOption(settingsSection);
    await page.getByText('Administrator access required', { exact: true }).waitFor();
    assert.equal(await planning.count(), 0);
    assert.equal(await reviewers.count(), 0);
    assert.equal(await skills.count(), 0);
    assert.equal(await save.count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Native model selector', exact: true }).count(), 0);
  }
  await navigation.locator('.knp-footer select').selectOption('admin');
  await section.selectOption('kishi-repository-prototype');
  assert.equal(await page.getByRole('button', { name: 'Native model selector', exact: true }).count(), 1);
  for (const label of ['Native permission selector', 'Native plugin manager', 'Native settings', 'Native configuration file']) assert.equal(await page.getByRole('button', { name: label, exact: true }).count(), 1);
  assert.equal(await page.locator('.knp-personal').count(), 0);
  assert.deepEqual(await page.getByRole('region', { name: 'Native General settings', exact: true }).getByRole('button').allTextContents(), ['Native appearance', 'Native font-size', 'Native permission', 'Native transcript-view', 'Native composer-enter']);
  const settingsRepository = page.locator('.knp-settings').getByRole('combobox', { name: 'Repository', exact: true });
  assert.deepEqual(await settingsRepository.locator('option').allTextContents(), ['Atlas', 'Studio docs']);
  const atlasAutoMerge = await autoMerge.isChecked();
  await autoMerge.setChecked(!atlasAutoMerge);
  await settingsRepository.selectOption('docs');
  await page.getByRole('heading', { name: 'Studio docs settings', exact: true }).waitFor();
  assert.equal(await save.isEnabled(), false);
  const docsAutoMerge = await autoMerge.isChecked();
  await autoMerge.setChecked(!docsAutoMerge);
  await settingsRepository.selectOption('atlas');
  assert.equal(await autoMerge.isChecked(), !atlasAutoMerge);
  await save.click();
  await settingsRepository.selectOption('docs');
  assert.equal(await autoMerge.isChecked(), !docsAutoMerge);
  assert.equal(await save.isEnabled(), true);
  await discard.click();
  assert.equal(await autoMerge.isChecked(), docsAutoMerge);
  await settingsRepository.selectOption('atlas');
  assert.equal(await autoMerge.isChecked(), !atlasAutoMerge);
  assert.equal(await save.isEnabled(), false);
  const savedAutoMerge = await autoMerge.isChecked();
  await autoMerge.setChecked(!savedAutoMerge);
  await navigation.locator('.knp-footer select').selectOption('member');
  assert.equal(await autoMerge.isChecked(), savedAutoMerge);
  assert.equal(await autoMerge.isDisabled(), true);
  assert.equal(await save.count(), 0);
  await navigation.locator('.knp-footer select').selectOption('admin');
  assert.equal(await autoMerge.isChecked(), !savedAutoMerge);
  await discard.click();
  assert.equal(await autoMerge.isChecked(), savedAutoMerge);
  const presentation = page.getByRole('figure', { name: 'Conversation presentation sample', exact: true });
  const previewLink = presentation.getByRole('link', { name: 'Open preview', exact: true });
  assert.equal(await previewLink.getAttribute('target'), '_blank');
  assert.equal(await previewLink.getAttribute('rel'), 'noopener noreferrer');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const responseBounds = await presentation.locator('.knp-sample-response p').boundingBox();
    const attributionBounds = await presentation.locator('.knp-sample-attribution').boundingBox();
    assert.ok(responseBounds && attributionBounds);
    assert.ok(attributionBounds.y >= responseBounds.y + responseBounds.height);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await presentation.screenshot({ path: join(screenshots, `presentation-${width}.png`) });
  }
  let previewRequests = 0;
  await page.context().route('https://atlas-215.preview.example.test/', route => {
    previewRequests++;
    assert.equal(route.request().headers().referer, undefined);
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><title>Sample application</title></head><body>Sample application</body></html>' });
  });
  const [previewPage] = await Promise.all([page.waitForEvent('popup'), previewLink.click()]);
  await previewPage.waitForLoadState('domcontentloaded');
  assert.equal(await previewPage.title(), 'Sample application');
  assert.equal(await previewPage.evaluate(() => window.opener === null), true);
  assert.equal(previewRequests, 1);
  await previewPage.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log('PASS: invitations, staged repository settings, member read-only saved values, English-only native settings, role controls, attribution footer, isolated new-tab link, desktop/mobile width, no external network requests.');
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser.close();
}
