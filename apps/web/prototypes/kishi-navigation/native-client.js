function createNativeNavigationPrototype() {
  const node = React.createElement;
  const repos = [{ id: 'atlas', name: 'Atlas', slug: 'example/atlas' }, { id: 'docs', name: 'Studio docs', slug: 'example/studio-docs' }];
  const modelRoles = ['planning', 'building', 'aggregator', 'qa'];
  let refreshModels;
  let state = {
    variant: 0, repo: 'atlas', selected: 'policy', showAfk: false, picker: false, creating: false,
    role: 'admin', query: '', notice: '', sequence: 300,
    global: { planning: '', building: '', aggregator: '', qa: '', reviewers: [], skills: [], autoMerge: true, finalClosureAck: false, cycleLimit: 2 },
    overrides: { atlas: {}, docs: {} },
    settingsDrafts: {},
    modelCatalog: { status: 'loading', models: [], errors: [], skills: [], skillErrors: [] },
    modelAccess: {}, modelAccessDrafts: {},
    people: [{ id: 'minh', name: 'Minh Nguyen', email: 'minh@example.test', repos: ['atlas'], invited: true }, { id: 'linh', name: 'Linh Le', email: 'linh@example.test', repos: ['docs'], invited: false }],
    person: 'linh', emailFails: false,
    items: [
      { id: 'invites', repo: 'atlas', parent: null, title: 'Invite the team', issue: 214, type: 'Feature', mode: 'HITL', status: 'Waiting for human' },
      { id: 'policy', repo: 'atlas', parent: 'invites', title: 'Invitation policy', issue: 215, type: 'Grilling', mode: 'HITL', status: 'Waiting for human' },
      { id: 'email', repo: 'atlas', parent: 'invites', title: 'Password setup email', issue: 216, type: 'Build', mode: 'AFK', status: 'Running' },
      { id: 'qa', repo: 'atlas', parent: 'invites', title: 'Revocation browser QA', issue: 217, type: 'QA', mode: 'AFK', status: 'Waiting for human' },
      { id: 'reconnect', repo: 'atlas', parent: null, title: 'Keep the conversation after reconnect', issue: 208, type: 'Bug', mode: 'AFK', status: 'Interrupted' },
      { id: 'guide', repo: 'docs', parent: null, title: 'Publish the onboarding guide', issue: 88, type: 'Feature', mode: 'HITL', status: 'Waiting for human' },
    ],
  };
  let listeners = [];
  function update(patch) {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener(state));
    console.log('Kishi prototype', { variant: state.variant, repository: state.repo, selected: state.selected, showAfk: state.showAfk, role: state.role });
  }
  function usePrototype() {
    const [current, setCurrent] = React.useState(state);
    React.useEffect(() => {
      listeners.push(setCurrent);
      setCurrent(state);
      return () => { listeners = listeners.filter(listener => listener !== setCurrent); };
    }, []);
    return current;
  }
  function command(label, action, props = {}) {
    return node('button', { type: 'button', onClick: action, ...props }, label);
  }
  function visible(item, current) {
    return (current.role === 'admin' || item.repo === 'atlas')
      && (current.showAfk || item.mode === 'HITL' || item.status === 'Waiting for human')
      && item.title.toLowerCase().includes(current.query.toLowerCase());
  }
  function WorkRow({ item, child = false }) {
    const current = usePrototype();
    return node('button', {
      type: 'button', className: 'knp-work' + (child ? ' knp-child' : ''),
      'aria-pressed': current.selected === item.id, 'data-knp-work': item.id,
      onClick: () => update({ selected: item.id, repo: item.repo, picker: false, notice: '' }),
    }, node('strong', null, item.title),
    node('small', null, item.issue ? '#' + item.issue : 'Not attached', ' / ', item.type, ' / ', item.mode),
    node('span', { className: 'knp-status', 'data-state': item.status }, item.status));
  }
  function Backlog({ current }) {
    return node('div', { className: 'knp-tree' }, current.items.filter(item => item.repo === current.repo && item.parent === null).map(parent => {
      const children = current.items.filter(item => item.parent === parent.id && visible(item, current));
      if (!visible(parent, current) && children.length === 0) return null;
      return node('section', { className: 'knp-request', key: parent.id }, node(WorkRow, { item: parent }), children.map(item => node(WorkRow, { key: item.id, item, child: true })));
    }));
  }
  function Attention({ current }) {
    const waiting = current.items.filter(item => visible(item, current) && item.status === 'Waiting for human');
    const background = current.items.filter(item => visible(item, current) && item.status !== 'Waiting for human');
    return node('div', null,
      node('h3', null, 'Waiting for human'), waiting.map(item => node('section', { className: 'knp-request', key: item.id },
        node('small', { className: 'knp-repo-caption' }, repos.find(repo => repo.id === item.repo).name), node(WorkRow, { item }))),
      current.showAfk && node('h3', null, 'Other work'), background.map(item => node(WorkRow, { key: item.id, item })));
  }
  function Picker({ current }) {
    const selected = current.items.find(item => item.id === current.selected);
    return node('div', { className: 'knp-focus' }, node('small', null, 'Selected work'), node('h3', null, selected.title),
      node('p', { className: 'knp-status', 'data-state': selected.status }, selected.status),
      command(current.picker ? 'Close work list' : 'Choose work item', () => update({ picker: !current.picker }), { className: 'knp-outline' }),
      current.picker && node(Backlog, { current }));
  }
  function NewRequest() {
    const [title, setTitle] = React.useState('');
    const [route, setRoute] = React.useState('Wayfinder');
    return node('form', { className: 'knp-form', onSubmit: event => {
      event.preventDefault();
      if (!title.trim()) return;
      const id = 'sample-' + state.sequence;
      update({ items: [{ id, title: title.trim(), repo: state.repo, parent: null, issue: null, type: route, mode: 'HITL', status: 'Ready' }, ...state.items], selected: id, creating: false, sequence: state.sequence + 1, notice: 'Sample request created. No issue or session was created.' });
    } }, node('label', null, 'Request title', node('input', { value: title, required: true, maxLength: 160, onChange: event => setTitle(event.target.value) })),
    node('label', null, 'Start with', node('select', { value: route, onChange: event => setRoute(event.target.value) }, ['Wayfinder', 'Grill with docs'].map(value => node('option', { key: value }, value)))),
    node('div', { className: 'knp-actions' }, node('button', { type: 'submit', className: 'knp-outline' }, 'Create sample'), command('Dismiss', () => update({ creating: false }))));
  }
  function BrowserRegion(props) {
    const current = usePrototype();
    const availableRepos = repos.filter(repo => current.role === 'admin' || repo.id === 'atlas');
    if (!props.wide) return command('Work', props.expandSidebar, { title: 'Open prototype backlog', className: 'knp-rail' });
    return node('section', { className: 'knp-browser knp', 'aria-label': 'Kishi navigation prototype' },
      node('div', { className: 'knp-heading' }, node('h2', null, 'Kishi'), node('small', null, 'Prototype / sample data')),
      node('div', { className: 'knp-variants', role: 'group', 'aria-label': 'Navigation variant' }, ['Backlog', 'Attention', 'Picker'].map((title, index) => command(title, () => update({ variant: index, picker: false }), { key: title, 'aria-pressed': current.variant === index }))),
      node('label', { className: 'knp-field' }, 'Repository', node('select', { value: current.repo, onChange: event => {
        const repo = event.target.value;
        update({ repo, selected: current.items.find(item => item.repo === repo).id, query: '' });
      } }, availableRepos.map(repo => node('option', { key: repo.id, value: repo.id }, repo.name)))),
      node('div', { className: 'knp-actions' }, command('New request', () => update({ creating: !current.creating }), { className: 'knp-outline' }), node('label', { className: 'knp-check' }, node('input', { type: 'checkbox', checked: current.showAfk, onChange: event => update({ showAfk: event.target.checked }) }), 'Show AFK')),
      current.creating && node(NewRequest),
      current.variant !== 2 && node('input', { className: 'knp-search', 'aria-label': 'Find sample work', placeholder: 'Find work...', value: current.query, onChange: event => update({ query: event.target.value }) }),
      node('div', { className: 'knp-list' }, current.variant === 0 ? node(Backlog, { current }) : current.variant === 1 ? node(Attention, { current }) : node(Picker, { current })),
      node('div', { className: 'knp-footer' }, node('small', null, current.variant === 1 ? 'All assigned repositories' : 'Newest requests first'),
        node('label', null, 'Preview role', node('select', { value: current.role, onChange: event => update({ role: event.target.value, repo: 'atlas', selected: 'policy' }) }, node('option', { value: 'admin' }, 'Administrator'), node('option', { value: 'member' }, 'Member')))),
      current.notice && node('p', { role: 'status', className: 'knp-notice' }, current.notice));
  }
  function WorkContext() {
    const current = usePrototype();
    const item = current.items.find(work => work.id === current.selected);
    return node('details', { className: 'knp-context knp' }, node('summary', { title: 'Sample work context' }, repos.find(repo => repo.id === item.repo).name + ' / ' + (item.issue ? '#' + item.issue : 'New request')),
      node('div', null, node('strong', null, item.title), node('small', null, item.type + ' / ' + item.mode), node('p', { className: 'knp-status', 'data-state': item.status }, item.status), node('small', null, 'Sample selection; native conversation unchanged.')));
  }
  function Settings({ global = false }) {
    const current = usePrototype();
    React.useEffect(() => { void refreshModels(); }, []);
    const disabled = current.role !== 'admin';
    const scope = global ? 'global' : current.repo;
    const saved = global ? current.global : current.overrides[current.repo];
    const draft = disabled ? {} : current.settingsDrafts[scope] ?? {};
    const overrides = { ...saved };
    for (const [key, value] of Object.entries(draft)) {
      if (value === undefined) delete overrides[key];
      else overrides[key] = value;
    }
    const values = global ? overrides : { ...current.global, ...overrides };
    const dirty = Object.keys(draft).length > 0;
    const models = current.modelCatalog.models.filter(model => {
      const assigned = current.modelAccess[model.provider];
      return assigned === undefined || assigned === null || (!global && assigned.includes(current.repo));
    });
    const unavailable = [...modelRoles.map(key => values[key]), ...values.reviewers].some(id => id && !models.some(model => model.id === id));
    const missingSkills = values.skills.filter(name => !current.modelCatalog.skills.some(skill => skill.name === name));
    const catalogReady = current.modelCatalog.status === 'ready';
    const invalidCycles = !Number.isSafeInteger(values.cycleLimit) || values.cycleLimit < 1;
    const invalid = unavailable || values.reviewers.length === 0 || invalidCycles || missingSkills.length > 0 || current.modelCatalog.skillErrors.length > 0;
    function change(key, value) {
      if (disabled) return;
      const next = { ...draft };
      const previous = saved[key];
      const unchanged = Array.isArray(value) && Array.isArray(previous)
        ? value.length === previous.length && value.every((item, index) => item === previous[index])
        : value === previous;
      if (unchanged) delete next[key];
      else next[key] = value;
      update({ settingsDrafts: { ...current.settingsDrafts, [scope]: next } });
    }
    function finish(save) {
      if (disabled || !dirty || (save && (!catalogReady || invalid))) return;
      const settingsDrafts = { ...current.settingsDrafts };
      delete settingsDrafts[scope];
      if (!save) update({ settingsDrafts });
      else if (global) update({ settingsDrafts, global: overrides });
      else update({ settingsDrafts, overrides: { ...current.overrides, [current.repo]: overrides } });
    }
    return node('section', { className: 'knp-settings knp' }, node('h2', null, global ? 'Global defaults' : repos.find(repo => repo.id === current.repo).name + ' settings'), node('p', { className: 'knp-muted' }, 'Prototype / ' + (disabled ? 'Read-only' : 'Administrator')),
      modelRoles.map(key => node('div', { className: 'knp-setting', key }, node('label', null, key === 'qa' ? 'QA' : key[0].toUpperCase() + key.slice(1), node('select', { value: values[key], disabled: disabled || !catalogReady || models.length === 0, onChange: event => change(key, event.target.value) },
        node('option', { value: '', disabled: true }, !catalogReady ? 'Loading models...' : models.length === 0 ? 'No configured models available' : 'Choose model'),
        values[key] && !models.some(model => model.id === values[key]) && node('option', { value: values[key], disabled: true }, 'Unavailable model'),
        models.map(model => node('option', { key: model.id, value: model.id }, model.name + ' (' + model.providerName + ')')))),
        node('small', null, global ? 'Global default' : Object.hasOwn(overrides, key) ? 'Repository override' : 'Inherited'), !global && command('Reset', () => change(key, undefined), { disabled: disabled || !Object.hasOwn(overrides, key), 'aria-label': 'Reset ' + key }))),
      current.modelCatalog.errors.map(error => node('p', { key: error, role: 'alert', className: 'knp-status', 'data-state': 'Interrupted' }, error)),
      unavailable && node('p', { role: 'alert', className: 'knp-status', 'data-state': 'Interrupted' }, 'A selected model is unavailable for this scope.'),
      command('Refresh', () => { void refreshModels(); }, { disabled: current.modelCatalog.status === 'loading' }),
      node('fieldset', { className: 'knp-settings-list', 'aria-label': 'Reviewers' }, node('legend', null, 'Reviewers'),
        node('div', { className: 'knp-actions' }, node('small', null, global ? 'Global default' : Object.hasOwn(overrides, 'reviewers') ? 'Repository override' : 'Inherited'), !global && command('Reset', () => change('reviewers', undefined), { disabled: disabled || !Object.hasOwn(overrides, 'reviewers'), 'aria-label': 'Reset reviewers' })),
        models.map(model => node('label', { className: 'knp-check', key: model.id }, node('input', { type: 'checkbox', checked: values.reviewers.includes(model.id), disabled: disabled || !catalogReady, onChange: event => change('reviewers', event.target.checked ? [...values.reviewers, model.id] : values.reviewers.filter(id => id !== model.id)) }), model.name + ' (' + model.providerName + ')')),
        values.reviewers.filter(id => !models.some(model => model.id === id)).map((id, index) => node('label', { className: 'knp-check', key: id }, node('input', { type: 'checkbox', checked: true, disabled, onChange: () => change('reviewers', values.reviewers.filter(value => value !== id)) }), 'Unavailable reviewer ' + (index + 1))),
        values.reviewers.length === 0 && node('p', { className: 'knp-status', 'data-state': 'Interrupted' }, 'Select at least one reviewer.')),
      node('fieldset', { className: 'knp-settings-list', 'aria-label': 'Enabled skills' }, node('legend', null, 'Enabled skills'),
        node('div', { className: 'knp-actions' }, node('small', null, global ? 'Global default' : Object.hasOwn(overrides, 'skills') ? 'Repository override' : 'Inherited'), !global && command('Reset', () => change('skills', undefined), { disabled: disabled || !Object.hasOwn(overrides, 'skills'), 'aria-label': 'Reset skills' })),
        current.modelCatalog.skills.map(skill => node('label', { className: 'knp-check', key: skill.name }, node('input', { type: 'checkbox', checked: values.skills.includes(skill.name), disabled: disabled || !catalogReady, onChange: event => change('skills', event.target.checked ? [...values.skills, skill.name] : values.skills.filter(name => name !== skill.name)) }), skill.name)),
        missingSkills.map(name => node('label', { className: 'knp-check', key: name }, node('input', { type: 'checkbox', checked: true, disabled, onChange: () => change('skills', values.skills.filter(value => value !== name)) }), name + ' (unavailable)')),
        catalogReady && current.modelCatalog.skills.length === 0 && node('p', { className: 'knp-status' }, 'No installed skills available.'),
        current.modelCatalog.skillErrors.map(error => node('p', { key: error, role: 'alert', className: 'knp-status', 'data-state': 'Interrupted' }, error))),
      node('h3', null, 'Workflow'),
      node('div', { className: 'knp-setting' }, node('label', { className: 'knp-check' }, node('input', { type: 'checkbox', checked: values.autoMerge, disabled, onChange: event => change('autoMerge', event.target.checked) }), 'Auto-merge'), node('small', null, global ? 'Global default' : Object.hasOwn(overrides, 'autoMerge') ? 'Repository override' : 'Inherited'), !global && command('Reset', () => change('autoMerge', undefined), { disabled: disabled || !Object.hasOwn(overrides, 'autoMerge'), 'aria-label': 'Reset auto-merge' })),
      node('div', { className: 'knp-setting' }, node('label', { className: 'knp-check' }, node('input', { type: 'checkbox', checked: values.finalClosureAck, disabled, onChange: event => change('finalClosureAck', event.target.checked) }), 'Final-closure acknowledgement'), node('small', null, global ? 'Global default' : Object.hasOwn(overrides, 'finalClosureAck') ? 'Repository override' : 'Inherited'), !global && command('Reset', () => change('finalClosureAck', undefined), { disabled: disabled || !Object.hasOwn(overrides, 'finalClosureAck'), 'aria-label': 'Reset final-closure acknowledgement' })),
      node('div', { className: 'knp-setting' }, node('label', null, 'Unsuccessful fix/review cycles before asking', node('input', { type: 'number', min: 1, step: 1, value: values.cycleLimit, disabled, 'aria-invalid': invalidCycles, onChange: event => change('cycleLimit', event.target.value === '' ? '' : Number(event.target.value)) })), node('small', null, global ? 'Global default' : Object.hasOwn(overrides, 'cycleLimit') ? 'Repository override' : 'Inherited'), !global && command('Reset', () => change('cycleLimit', undefined), { disabled: disabled || !Object.hasOwn(overrides, 'cycleLimit'), 'aria-label': 'Reset cycle limit' })),
      invalidCycles && node('p', { role: 'alert', className: 'knp-status', 'data-state': 'Interrupted' }, 'Enter a whole number of at least 1.'),
      !disabled && node('div', { className: 'knp-actions knp-save' }, command('Save changes', () => finish(true), { className: 'knp-outline', disabled: !dirty || !catalogReady || invalid }), command('Discard', () => finish(false), { disabled: !dirty }), node('small', { role: 'status' }, dirty ? 'Unsaved changes' : 'Saved')),
      node('small', null, 'Sample configuration only. Native DSH settings are unchanged.'));
  }
  function ModelAccess({ provider, configured }) {
    const current = usePrototype();
    if (!configured || current.role !== 'admin') return null;
    const id = provider.provider;
    const saved = current.modelAccess[id] ?? null;
    const dirty = Object.hasOwn(current.modelAccessDrafts, id);
    const assigned = dirty ? current.modelAccessDrafts[id] : saved;
    function stage(next) {
      const drafts = { ...current.modelAccessDrafts };
      const unchanged = next === saved || (next !== null && saved !== null && next.length === saved.length && next.every(repo => saved.includes(repo)));
      if (unchanged) delete drafts[id];
      else drafts[id] = next;
      update({ modelAccessDrafts: drafts });
    }
    function finish(save) {
      const drafts = { ...current.modelAccessDrafts };
      delete drafts[id];
      update({ modelAccessDrafts: drafts, modelAccess: save ? { ...current.modelAccess, [id]: assigned } : current.modelAccess });
    }
    return node('fieldset', { className: 'knp knp-model-access', 'aria-label': 'Repository availability for ' + provider.displayName },
      node('legend', null, 'Repository availability'), node('small', null, 'Prototype / sample assignments'),
      node('label', { className: 'knp-check' }, node('input', { type: 'checkbox', checked: assigned === null, onChange: event => stage(event.target.checked ? null : []) }), 'All repositories'),
      assigned !== null && repos.map(repo => node('label', { className: 'knp-check', key: repo.id }, node('input', { type: 'checkbox', checked: assigned.includes(repo.id), onChange: event => stage(event.target.checked ? [...assigned, repo.id] : assigned.filter(value => value !== repo.id)) }), repo.name)),
      node('div', { className: 'knp-actions' }, command('Save availability', () => finish(true), { className: 'knp-outline', disabled: !dirty }), command('Discard availability', () => finish(false), { disabled: !dirty })));
  }
  function InviteUser({ close }) {
    const [email, setEmail] = React.useState('');
    const [assigned, setAssigned] = React.useState([]);
    const [error, setError] = React.useState('');
    return node('form', { className: 'knp-form knp-invite', 'aria-label': 'Invite user', onSubmit: event => {
      event.preventDefault();
      const address = email.trim().toLowerCase();
      if (!address || state.role !== 'admin') return;
      if (state.people.some(user => user.email.toLowerCase() === address)) {
        setError('An account with this email already exists. Open User Details to resend its invitation.');
        return;
      }
      const id = 'sample-user-' + state.sequence;
      update({ people: [...state.people, { id, name: address, email: address, repos: assigned, invited: !state.emailFails }], person: id, sequence: state.sequence + 1 });
      close();
    } }, node('h3', null, 'Invite user'),
    node('label', { htmlFor: 'knp-invite-email' }, 'Email address', node('input', { id: 'knp-invite-email', type: 'email', required: true, maxLength: 254, autoComplete: 'email', autoFocus: true, value: email, onChange: event => { setEmail(event.target.value); setError(''); } })),
    node('fieldset', null, node('legend', null, 'Repository assignments'), repos.map(repo => node('label', { className: 'knp-check', key: repo.id }, node('input', { type: 'checkbox', checked: assigned.includes(repo.id), onChange: event => setAssigned(event.target.checked ? [...assigned, repo.id] : assigned.filter(id => id !== repo.id)) }), repo.name))),
    error && node('p', { role: 'alert', className: 'knp-status', 'data-state': 'Interrupted' }, error),
    node('div', { className: 'knp-actions' }, node('button', { type: 'submit', className: 'knp-outline' }, 'Send invitation'), command('Dismiss', close)));
  }
  function People() {
    const current = usePrototype();
    const [inviting, setInviting] = React.useState(false);
    if (current.role !== 'admin') return node('p', { className: 'knp-settings knp' }, 'Administrator access required');
    const person = current.people.find(user => user.id === current.person);
    function change(patch) { update({ people: current.people.map(user => user.id === person.id ? { ...user, ...patch } : user) }); }
    return node('section', { className: 'knp-settings knp' }, node('div', { className: 'knp-actions' }, node('h2', null, 'Users'), !inviting && command('Invite user', () => setInviting(true), { className: 'knp-outline' })), node('p', { className: 'knp-muted' }, 'Prototype / sample accounts'),
      node('label', { className: 'knp-check' }, node('input', { type: 'checkbox', checked: current.emailFails, onChange: event => update({ emailFails: event.target.checked }) }), 'Simulate email failure'),
      node('div', { className: 'knp-actions knp-user-list', role: 'group', 'aria-label': 'Sample users' }, current.people.map(user => command(user.name, () => { setInviting(false); update({ person: user.id }); }, { key: user.id, 'data-knp-user': user.id, 'aria-pressed': !inviting && user.id === person.id }))),
      inviting ? node(InviteUser, { close: () => setInviting(false) }) : node('section', { className: 'knp-user', 'aria-label': 'User Details' }, node('h3', null, person.name), node('p', null, person.email), node('p', { role: 'status', className: 'knp-status', 'data-state': person.invited ? 'Ready' : 'Interrupted' }, person.invited ? 'Invitation sent / no first login' : 'Password-setup email failed'), command('Resend invitation', () => change({ invited: !state.emailFails }), { className: 'knp-outline' }),
        node('h3', null, 'Repository assignments'), repos.map(repo => node('label', { className: 'knp-check', key: repo.id }, node('input', { type: 'checkbox', checked: person.repos.includes(repo.id), onChange: event => change({ repos: event.target.checked ? [...person.repos, repo.id] : person.repos.filter(id => id !== repo.id) }) }), repo.name))),
      node('small', null, 'No email is sent and no account is created.'));
  }
  return {
    name: 'kishi-native-navigation-prototype',
    apply(ctx) {
      const slots = ctx.get('slots');
      if (!slots) throw new Error('Native DSH slots are unavailable');
      ctx.effect(() => {
        let active = true;
        let generation = 0;
        const registrations = new Map();
        refreshModels = async () => {
          if (!active) return;
          const request = ++generation;
          update({ modelCatalog: { ...state.modelCatalog, status: 'loading' } });
          try {
            const catalog = await host.call('model-catalog');
            if (!active || request !== generation) return;
            for (const [namespace, dispose] of registrations) {
              if (!catalog.namespaces.includes(namespace)) { dispose(); registrations.delete(namespace); }
            }
            for (const namespace of catalog.namespaces) {
              if (!registrations.has(namespace)) registrations.set(namespace, slots.inject('settings.models.provider-card', () => slots.register({ name: 'settings.models.provider-card', key: namespace }, ModelAccess)));
            }
            update({ modelCatalog: { status: 'ready', models: catalog.models, errors: catalog.errors, skills: catalog.skills, skillErrors: catalog.skillErrors } });
          } catch {
            if (active && request === generation) update({ modelCatalog: { status: 'error', models: [], errors: ['Configured models are unavailable.'], skills: [], skillErrors: ['Installed skills are unavailable.'] } });
          }
        };
        void refreshModels();
        return () => { active = false; for (const dispose of registrations.values()) dispose(); };
      }, 'kishi-prototype.models');
      ctx.effect(() => styles.insert(`
        .knp { font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); letter-spacing: 0; }
        .knp * { box-sizing: border-box; letter-spacing: 0; }
        .knp button,.knp input,.knp select { font: inherit; color: inherit; }
        .knp button { cursor: pointer; border: 1px solid transparent; border-radius: 6px; padding: 6px 9px; background: transparent; min-height: 30px; }
        .knp button:hover,.knp button[aria-pressed=true] { background: var(--dsw-alias-bg-layer-2); }
        .knp button:disabled { opacity: .5; cursor: not-allowed; }
        .knp :focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
        .knp input:not([type=checkbox]),.knp select { width: 100%; min-width: 0; padding: 7px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-base); }
        .knp input[type=checkbox] { width: 15px; height: 15px; margin: 0; accent-color: var(--dsw-alias-brand-primary); }
        .knp small,.knp-muted { color: var(--dsw-alias-label-secondary); font-size: 11px; }
        .knp h2 { font-size: 17px; margin: 0; }
        .knp h3 { font-size: 13px; margin: 14px 0 8px; }
        .knp-browser { display: flex; flex-direction: column; min-height: 0; height: 100%; gap: 12px; padding: 8px 12px 12px; }
        .knp-heading { display: grid; gap: 3px; }
        .knp-variants { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; padding: 2px; }
        .knp-variants button { padding: 5px 1px; font-size: 11px; }
        .knp-field,.knp-form label:not(.knp-check) { display: grid; gap: 5px; font-size: 12px; }
        .knp-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .knp .knp-outline { border-color: var(--dsw-alias-border-l2); border-radius: 18px; }
        .knp-check { display: flex; gap: 7px; align-items: center; min-height: 28px; font-size: 12px; }
        .knp-list { flex: 1; min-height: 0; overflow: auto; }
        .knp .knp-work { width: 100%; text-align: left; padding: 9px 8px; display: grid; gap: 4px; border-radius: 6px; overflow-wrap: anywhere; }
        .knp-work strong { font-size: 12px; line-height: 1.5; font-weight: 550; }
        .knp .knp-child { margin-left: 12px; width: calc(100% - 12px); border-left: 1px solid var(--dsw-alias-border-l2); border-radius: 0 6px 6px 0; }
        .knp-request { padding: 6px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
        .knp-status { font-size: 11px; margin: 2px 0; color: var(--dsw-alias-label-secondary); }
        .knp-status[data-state="Waiting for human"] { color: var(--dsw-alias-state-warn-primary); }
        .knp-status[data-state="Running"] { color: var(--dsw-alias-brand-primary); }
        .knp-status[data-state="Interrupted"] { color: var(--dsw-alias-state-error-primary); }
        .knp-repo-caption { padding: 0 8px; }
        .knp-footer { display: grid; gap: 8px; border-top: 1px solid var(--dsw-alias-border-l1); padding-top: 10px; }
        .knp-footer label { display: flex; gap: 8px; align-items: center; font-size: 11px; }
        .knp-footer select { flex: 1; width: 0; font-size: 11px; }
        .knp-form { display: grid; gap: 9px; padding: 10px 0; }
        .knp-invite { max-width: 440px; }
        .knp-invite fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
        .knp-invite legend { margin-bottom: 6px; }
        .knp-user-list button { max-width: 100%; overflow-wrap: anywhere; }
        .knp-notice { font-size: 11px; line-height: 1.5; margin: 0; }
        .knp-context { position: relative; font-size: 12px; max-width: 150px; }
        .knp-context summary { cursor: pointer; overflow-wrap: anywhere; }
        .knp-context > div { position: absolute; z-index: 20; right: 0; top: 26px; display: grid; gap: 7px; width: 240px; max-width: 70vw; padding: 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 6px; background: var(--dsw-alias-bg-overlay); box-shadow: 0 4px 14px #0002; }
        .knp-settings { padding: 12px 0; width: 100%; }
        .knp-settings-list { border: 0; border-top: 1px solid var(--dsw-alias-border-l1); margin: 16px 0; padding: 12px 0; min-width: 0; }
        .knp-settings-list legend { font-size: 13px; font-weight: 550; }
        .knp-settings-list .knp-check { overflow-wrap: anywhere; }
        .knp-settings-list input[type=checkbox] { flex-shrink: 0; }
        .knp-model-access { border: 0; border-top: 1px solid var(--dsw-alias-border-l1); min-width: 0; margin: 12px 0 0; padding: 12px 0; }
        .knp-model-access legend { font-size: 13px; font-weight: 550; }
        .knp-setting { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; padding: 15px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
        .knp-setting > label:not(.knp-check) { display: grid; gap: 7px; flex: 1; min-width: 180px; }
        .knp-setting small { margin-left: auto; }
        .knp-save { padding: 14px 0; }
        .knp-user { border-top: 1px solid var(--dsw-alias-border-l1); margin-top: 18px; padding-top: 10px; overflow-wrap: anywhere; }
        .knp-user p { margin: 10px 0; }
        .knp-user small { display: block; margin-top: 15px; }
        @media (max-width: 600px) { .knp-context { max-width: 110px; font-size: 11px; } }
      `), 'kishi-prototype.styles');
      slots.inject('sidebar.workspaces', () => slots.register({ name: 'sidebar.workspaces', priority: 1 }, BrowserRegion));
      slots.inject('conversation.session.header.utilities', () => slots.register({ name: 'conversation.session.header.utilities', id: 'kishi-sample-context', order: -20 }, WorkContext));
      slots.inject('settings.section', () => [
        slots.register({ name: 'settings.section', id: 'kishi-global-prototype', label: 'Kishi global', order: 50 }, () => node(Settings, { global: true })),
        slots.register({ name: 'settings.section', id: 'kishi-repository-prototype', label: 'Kishi repository', order: 51 }, () => node(Settings)),
        slots.register({ name: 'settings.section', id: 'kishi-users-prototype', label: 'Kishi users', order: 52 }, People),
      ]);
    },
  };
}
