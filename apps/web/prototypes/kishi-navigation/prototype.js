'use strict';

const layouts = ['A', 'B', 'C'];
const layoutNames = { A: 'Repository first', B: 'Human attention first', C: 'Conversation first' };
const repositories = [
  { id: 'atlas', name: 'Atlas', slug: 'example/atlas' },
  { id: 'docs', name: 'Studio docs', slug: 'example/studio-docs' },
];
const workItems = [
  { id: 'invites', repo: 'atlas', parent: null, issue: 214, title: 'Invite the team', type: 'Feature', mode: 'HITL', state: 'Waiting for human', attempt: 1 },
  { id: 'policy', repo: 'atlas', parent: 'invites', issue: 215, title: 'Invitation policy', type: 'Grilling', mode: 'HITL', state: 'Waiting for human', attempt: 1 },
  { id: 'email', repo: 'atlas', parent: 'invites', issue: 216, title: 'Password setup email', type: 'Build', mode: 'AFK', state: 'Running', attempt: 2 },
  { id: 'revoke', repo: 'atlas', parent: 'invites', issue: 217, title: 'Revocation browser QA', type: 'QA', mode: 'AFK', state: 'Waiting for human', attempt: 1 },
  { id: 'reconnect', repo: 'atlas', parent: null, issue: 208, title: 'Keep the conversation after reconnect', type: 'Bug', mode: 'AFK', state: 'Interrupted', attempt: 2 },
  { id: 'credentials', repo: 'atlas', parent: null, issue: 201, title: 'Repository model assignments', type: 'Feature', mode: 'AFK', state: 'Model unavailable', attempt: 1 },
  { id: 'guide', repo: 'docs', parent: null, issue: 88, title: 'Publish the onboarding guide', type: 'Feature', mode: 'HITL', state: 'Waiting for human', attempt: 1 },
  { id: 'links', repo: 'docs', parent: 'guide', issue: 89, title: 'Check setup links', type: 'Research', mode: 'AFK', state: 'Complete', attempt: 1 },
];
const initialVariant = new URL(location.href).searchParams.get('variant');
const users = [
  { id: 'anh', name: 'Anh Tran', email: 'anh@example.test', role: 'Administrator', repos: ['atlas', 'docs'], invitation: 'Active', disabled: false },
  { id: 'minh', name: 'Minh Nguyen', email: 'minh@example.test', role: 'Member', repos: ['atlas'], invitation: 'Active', disabled: false },
  { id: 'linh', name: 'Linh Le', email: 'linh@example.test', role: 'Member', repos: ['docs'], invitation: 'Send failed', disabled: false },
];
const modelConfigurations = [
  { id: 'team', name: 'DeepSeek chat / Team account', model: 'deepseek-chat', provider: 'DeepSeek', credential: 'Team account', available: true },
  { id: 'atlas-key', name: 'DeepSeek chat / Atlas owner', model: 'deepseek-chat', provider: 'DeepSeek', credential: 'Atlas owner', available: true },
  { id: 'review-key', name: 'DeepSeek reasoner / Review account', model: 'deepseek-reasoner', provider: 'DeepSeek', credential: 'Review account', available: true },
];
const skillCatalog = ['wayfinder', 'grill-with-docs', 'to-spec', 'to-tickets', 'tdd', 'code-review', 'wait-what'];
const globalSettings = { plan: 'team', build: 'team', reviewers: ['review-key'], aggregator: 'team', qa: 'team', autoMerge: true, finalAck: false, fixCycles: 2, skills: [...skillCatalog] };
const state = {
  variant: layouts.includes(initialVariant) ? initialVariant : 'A',
  repo: 'atlas', selected: 'policy', showAfk: true, role: 'admin', screen: 'work',
  messages: {}, audits: {}, drafts: {}, user: 'linh', clock: 42, sequence: 300,
  overrides: { atlas: { build: 'atlas-key' }, docs: {} }, assignments: { atlas: ['team', 'atlas-key', 'review-key'], docs: ['team', 'review-key'] },
};
for (const item of workItems) {
  item.issueStatus = 'Open';
  item.issueAvailable = true;
  item.startedBy = item.repo === 'atlas' ? 'minh' : 'anh';
}
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const selectedItem = () => workItems.find(item => item.id === state.selected);
const repository = repoId => repositories.find(repo => repo.id === repoId);
const needsHuman = item => item.state === 'Waiting for human';
const visibleItem = item => state.showAfk || item.mode === 'HITL' || needsHuman(item);
const actor = () => state.role === 'admin' ? 'Anh Tran' : 'Minh Nguyen';
const currentUser = () => users.find(user => user.id === (state.role === 'admin' ? 'anh' : 'minh'));
const assignedRepositories = () => currentUser().disabled ? [] : repositories.filter(repo => state.role === 'admin' || currentUser().repos.includes(repo.id));
const settingsFor = repoId => ({ ...globalSettings, ...state.overrides[repoId] });
const modelName = modelId => modelConfigurations.find(model => model.id === modelId)?.name || 'Removed configuration';
const conversationKey = item => item.id;
const activeRun = item => ['Running', 'Waiting for human', 'Reconciling', 'Cancelling', 'Pausing'].includes(item.state);

function record(item, action, outcome, by = actor()) {
  const time = new Date(Date.UTC(2026, 8, 9, 9, state.clock++)).toISOString().slice(11, 19);
  (state.audits[item.id] ||= []).push({ actor: by, action, outcome, time, attempt: item.attempt });
  return time;
}

function modelAllowed(repoId, modelId) {
  return !!modelConfigurations.find(model => model.id === modelId && model.available) && (state.assignments[repoId] || []).includes(modelId);
}

function statusLabel(value) {
  const tone = value === 'Waiting for human' ? 'waiting' : value === 'Running' ? 'running' : value === 'Complete' ? 'done' : 'stopped';
  return `<span class="status ${tone}">${escapeHtml(value)}</span>`;
}

function workRow(item, child = false, showRepo = false) {
  return `<button type="button" class="work-row ${child ? 'child' : ''} ${state.selected === item.id ? 'selected' : ''}" data-item="${item.id}" aria-pressed="${state.selected === item.id}">
    <span class="title">${escapeHtml(item.title)}</span>
    <span class="row-meta">${showRepo ? `<span>${repository(item.repo).name}</span>` : ''}<span>#${item.issue}</span><span>${item.type}</span><span>${item.mode}</span>${statusLabel(item.state)}</span>
  </button>`;
}

function backlogTree() {
  return workItems.filter(item => item.repo === state.repo && !item.parent).map(parent => {
    const children = workItems.filter(item => item.parent === parent.id && visibleItem(item));
    if (!visibleItem(parent) && !children.length) return '';
    return `<section class="request-group">${workRow(parent)}${children.map(child => workRow(child, true)).join('')}</section>`;
  }).join('') || '<p class="empty">No work matches this view.</p>';
}

function afkToggle() {
  return `<label><input type="checkbox" data-afk ${state.showAfk ? 'checked' : ''}>Show AFK</label>`;
}

function brand() {
  return '<span class="brand"><img src="../../public/favicon.svg" alt="">Kishi</span>';
}

function roleSelect() {
  return `<select aria-label="Preview role" data-role><option value="admin" ${state.role === 'admin' ? 'selected' : ''}>Administrator preview</option><option value="member" ${state.role === 'member' ? 'selected' : ''}>Member preview</option></select>`;
}

function sidebar() {
  return `<aside class="rail">${brand()}<div class="rail-group"><span class="rail-label">Assigned repositories</span>${assignedRepositories().map(repo => `<button type="button" class="${state.repo === repo.id ? 'active' : ''}" data-repo="${repo.id}">${escapeHtml(repo.name)}</button>`).join('')}${state.role === 'admin' ? '<button type="button" data-action="connect">Connect repository</button>' : ''}</div>
    <div class="rail-group"><button type="button" data-screen="work">Backlog</button><button type="button" data-screen="repo-settings">Repository settings</button>${state.role === 'admin' ? '<button type="button" data-screen="users">Users</button><button type="button" data-screen="global-settings">Global settings</button>' : ''}</div>
    <div class="rail-footer"><small>Application restarted<br>Today, 09:12</small><small>Browser connected, 09:41</small>${roleSelect()}</div></aside>`;
}

function topNav() {
  return `<header class="top-nav">${brand()}<select aria-label="Repository" data-repo-select>${assignedRepositories().map(repo => `<option value="${repo.id}" ${state.repo === repo.id ? 'selected' : ''}>${escapeHtml(repo.name)}</option>`).join('')}</select><button type="button" data-screen="work">Backlog</button><button type="button" data-action="new">New request</button><span class="spacer"></span><button type="button" data-screen="repo-settings">Repository settings</button>${state.role === 'admin' ? '<button type="button" data-screen="users">Users</button><button type="button" data-screen="global-settings">Global settings</button>' : ''}${roleSelect()}<button type="button" class="restart-status" data-action="runtime" title="Application and browser connection status">Restarted 09:12</button></header>`;
}

function workHeader() {
  return `<div class="backlog-heading"><div><small>${repository(state.repo).slug}</small><h1>Backlog</h1></div><div class="actions"><button type="button" class="primary" data-action="new">New request</button><button type="button" class="outline" data-action="attach">Attach issue</button></div></div><div class="filter-row"><span>Newest requests first</span>${afkToggle()}</div>`;
}

function mainMessage(item) {
  if (item.summaryUncertain) return '<p>The GitHub summary write did not return a confirmed result. It may already have succeeded.</p><p>The linked issue is preserved. I must check the result before trying another write or reporting completion.</p>';
  if (item.route) return `<p>Your ${escapeHtml(item.type.toLowerCase())} request is ready to start with <strong>${escapeHtml(item.route)}</strong>.</p><p>${escapeHtml(item.description || 'The selected issue is attached. No work has started.')}</p>`;
  if (item.id === 'policy') return '<p>The reviewers disagree about repository assignment. One expects members to need GitHub access; the other follows the team invitation policy.</p><p>My recommendation is to let the Kishi assignment grant access independently. Should I ask the builder to use that policy?</p>';
  if (item.id === 'revoke') return '<p>QA needs to run a Docker command to verify revocation. The command is paused for an administrator permission grant.</p><p>No additional permission has been granted.</p>';
  if (item.state === 'Interrupted') return '<p>The application restarted during browser QA. This conversation is intact. No work has resumed.</p><p>I need to reconcile the last GitHub write before continuing.</p>';
  if (item.state === 'Model unavailable') return '<p>The selected building model configuration is no longer available to this repository. The next model call is paused.</p><p>An administrator must correct the assignment. No other model or account has been selected.</p>';
  if (item.id === 'email') return '<p>The builder is updating the invitation email flow. One reviewer returned findings; the second reviewer has not returned a result.</p><p>Review is incomplete. QA has not started.</p>';
  return '<p>The current draft is ready for your input. We can discuss the changes here before the next step.</p>';
}

function session() {
  const item = selectedItem();
  if (!item) return '<main class="session"><div class="empty"><h1>No requests yet</h1><p>This repository has no attached work.</p><button type="button" class="primary" data-action="new">New request</button></div></main>';
  const parent = workItems.find(candidate => candidate.id === item.parent);
  const settings = settingsFor(item.repo);
  const additionalMessages = (state.messages[conversationKey(item)] || []).map(message => `<article class="message human"><div class="byline"><span class="avatar">${escapeHtml(message.actor.split(' ').map(part => part[0]).join(''))}</span><strong>${escapeHtml(message.actor)}</strong><small>${message.time}</small></div><p>${escapeHtml(message.text)}</p></article>`).join('');
  return `<main class="session" aria-label="Main session"><header class="session-heading"><div class="breadcrumb">${escapeHtml(repository(item.repo).name)}<span>/</span>${parent ? `<button type="button" data-item="${parent.id}">${escapeHtml(parent.title)}</button><span>/</span>` : ''}${item.type}<span>${item.mode}</span></div><div class="topline"><h1>${escapeHtml(item.title)}</h1>${statusLabel(item.state)}</div><div class="issue-pin"><button type="button" data-action="issue">&#8599; ${escapeHtml(repository(item.repo).slug)}#${item.issue}</button><span>${item.issueAvailable ? item.issueStatus : `Unavailable / last known ${item.issueStatus.toLowerCase()}`}</span><span>${item.issueAvailable ? 'Checked on session open, 09:41' : 'Cached at 09:41; current status unknown'}</span><button type="button" data-action="audit">Audit log</button></div></header>
    <div class="thread"><article class="message human"><div class="byline"><span class="avatar">MN</span><strong>Minh Nguyen</strong><small>09:35</small></div><p>${item.id === 'policy' ? 'Please bring the reviewers\' conclusions back here before applying the fix.' : `Please work on ${escapeHtml(item.title.toLowerCase())}.`}</p></article><article class="message"><div class="byline"><span class="avatar">K</span><strong>Kishi</strong><small>Main session</small><small>09:40 / Team account</small></div>${mainMessage(item)}</article>${sessionNotices(item)}${additionalMessages}</div>
    <form class="composer" id="message-form"><label for="message" class="muted">Reply in the main session</label><textarea id="message" name="message" required placeholder="Write a response...">${escapeHtml(state.drafts[conversationKey(item)] || '')}</textarea><div class="composer-bottom"><span class="muted">${actor()}<br>Next call: ${escapeHtml(modelName(settings.aggregator))}<br>Enabled skills: ${settings.skills.length}</span><button class="primary" type="submit">Send</button></div></form></main>`;
}

function sessionNotices(item) {
  let notices = '';
  if (!item.issueAvailable) notices += '<div class="callout error"><strong>Linked issue unavailable</strong><p>The link and conversation are retained. Work needing GitHub verification is paused.</p><button type="button" class="outline" data-action="recheck-issue">Check again</button></div>';
  if (item.summaryUncertain) notices += '<div class="callout error"><strong>Summary write unconfirmed</strong><p>No retry or completion report until the existing write is reconciled.</p><button type="button" class="outline" data-action="reconcile">Reconcile write</button></div>';
  if (needsHuman(item)) notices += `<div class="callout"><strong>${item.id === 'revoke' && !item.permissionUsed ? 'Administrator permission needed' : 'Waiting for your response'}</strong>${item.id === 'revoke' && !item.permissionUsed ? `<p><code>docker compose run --rm browser-qa</code></p><p>Repository: ${escapeHtml(repository(item.repo).slug)}<br>Reason: verify access revocation in the isolated repository environment.</p><p>This grant applies to this command and attempt only.</p><button type="button" class="outline" data-action="grant" ${state.role !== 'admin' ? 'disabled' : ''}>Allow this action</button><button type="button" data-action="deny" ${state.role !== 'admin' ? 'disabled' : ''}>Deny</button>${state.role !== 'admin' ? '<p>Only an administrator can grant this permission.</p>' : ''}` : ''}</div>`;
  if (['Cancelling', 'Pausing'].includes(item.state)) notices += '<div class="callout error"><strong>Stopping; one subprocess is still running</strong><p>Kishi will report when it has stopped. A chat response does not prove a process has exited.</p></div>';
  if (item.state === 'Interrupted') notices += '<div class="callout error"><strong>Interrupted at 09:12</strong><p>Application restart: today, 09:12. Browser reconnected: 09:41. No work resumed.</p><p>Kishi will discuss recovery in this conversation before resuming work.</p></div>';
  if (item.state === 'Model unavailable' || !modelAllowed(item.repo, settingsFor(item.repo).aggregator)) notices += '<div class="callout error"><strong>Model call paused</strong><p>The selected configuration is unavailable or not assigned to this repository. No account fallback.</p><button type="button" class="outline" data-screen="repo-settings">Repository settings</button></div>';
  return notices;
}

function sessionAudit(item) {
  return `<div class="section-heading"><h2>Session audit log</h2><small>Actor / time / action / outcome</small></div>${[...(state.audits[item.id] || [])].reverse().map(entry => `<article class="audit-row"><div><strong>${escapeHtml(entry.actor)}</strong><small>${entry.time}</small></div><p>${escapeHtml(entry.action)}</p><small>${escapeHtml(entry.outcome)}</small></article>`).join('')}<article class="audit-row"><div><strong>Kishi</strong><small>09:40:00</small></div><p>Asked for a human response</p><small>Waiting in main session</small></article><article class="audit-row"><div><strong>Minh Nguyen</strong><small>09:35:00</small></div><p>Sent a message</p><small>Accepted</small></article>`;
}

function variantA() {
  return `<div class="workspace-a">${sidebar()}<section class="backlog" aria-label="Repository backlog">${workHeader()}${backlogTree()}</section>${session()}</div>`;
}

function variantB() {
  const groups = [['Waiting for human', item => needsHuman(item)], ['Needs recovery', item => ['Interrupted', 'Model unavailable'].includes(item.state)], ['Background work', item => !needsHuman(item) && !['Interrupted', 'Model unavailable'].includes(item.state)]];
  return `${topNav()}<div class="workspace-b"><section class="attention" aria-label="Team attention queue"><div class="attention-head"><h1>Needs attention</h1>${afkToggle()}</div><small>All assigned repositories</small><div class="actions"><button type="button" data-action="work-picker">Repository backlog</button><button type="button" data-action="attach">Attach issue</button></div>${groups.map(([title, predicate]) => `<section class="attention-group"><h2>${title}</h2>${workItems.filter(item => assignedRepositories().some(repo => repo.id === item.repo) && predicate(item) && visibleItem(item)).map(item => workRow(item, false, true)).join('') || '<p class="empty">No work in this group.</p>'}</section>`).join('')}</section>${session()}</div>`;
}

function variantC() {
  const item = selectedItem();
  if (!item) return `${topNav()}${session()}`;
  return `${topNav()}<div class="workspace-c"><div class="context-strip"><div><small>${repository(item.repo).name} / ${item.type} #${item.issue}</small><p><strong>${escapeHtml(item.title)}</strong></p></div><button type="button" class="outline" data-action="work-picker">Work items</button></div>${session()}</div>`;
}

function render() {
  const allowed = assignedRepositories();
  if (!allowed.some(repo => repo.id === state.repo) && allowed.length) { state.repo = allowed[0].id; state.selected = workItems.find(item => item.repo === state.repo)?.id; }
  if (state.role !== 'admin' && ['global-settings', 'users', 'user-detail'].includes(state.screen)) state.screen = 'work';
  app.innerHTML = !allowed.length ? `${topNav()}<main class="empty"><h1>${currentUser().disabled ? 'Account disabled' : 'No repository access'}</h1><p>An administrator must restore access before this account can continue.</p></main>` : state.screen !== 'work' ? settingsShell() : state.variant === 'A' ? variantA() : state.variant === 'B' ? variantB() : variantC();
  document.querySelector('#variant-label').textContent = `${state.variant} / ${layoutNames[state.variant]}`;
}

function settingsShell() {
  const content = state.screen === 'users' ? usersPage() : state.screen === 'user-detail' ? userDetails() : settingsPage();
  return state.variant === 'A' ? `<div class="management-shell">${sidebar()}${content}</div>` : `${topNav()}${content}`;
}

function settingsPage() {
  const global = state.screen === 'global-settings';
  const settings = global ? globalSettings : settingsFor(state.repo);
  const disabled = state.role !== 'admin' ? 'disabled' : '';
  const source = key => global ? 'Global default' : Object.hasOwn(state.overrides[state.repo] || {}, key) ? 'Repository override' : 'Inherited from global';
  const reset = key => !global && state.role === 'admin' ? `<button type="button" data-reset="${key}" aria-label="Reset ${key}" ${Object.hasOwn(state.overrides[state.repo] || {}, key) ? '' : 'disabled'}>Reset</button>` : '';
  const options = selected => modelConfigurations.map(model => `<option value="${model.id}" ${selected === model.id ? 'selected' : ''} ${!model.available || (!global && !(state.assignments[state.repo] || []).includes(model.id)) ? 'disabled' : ''}>${escapeHtml(model.name)}${!model.available ? ' (unavailable)' : !global && !(state.assignments[state.repo] || []).includes(model.id) ? ' (not assigned)' : ''}</option>`).join('');
  return `<main class="management"><header class="management-heading"><div><div class="breadcrumb"><button type="button" data-screen="work">Back to work</button><span>/</span>${global ? 'Team' : escapeHtml(repository(state.repo).name)}</div><h1>${global ? 'Global settings' : 'Repository settings'}</h1><small>${state.role === 'admin' ? 'Administrator' : 'Read-only / managed by an administrator'}</small></div></header>
    <section class="settings-section"><h2>Models</h2>${[['plan', 'Planning'], ['build', 'Building'], ['aggregator', 'Aggregator'], ['qa', 'QA']].map(([key, title]) => `<div class="setting-row"><div><label for="setting-${key}">${title}</label><small>${source(key)}</small></div><div class="setting-control"><select id="setting-${key}" data-setting="${key}" ${disabled}>${options(settings[key])}</select>${reset(key)}</div></div>`).join('')}
    <div class="setting-row"><div><strong>Reviewers</strong><small>${source('reviewers')}</small></div><div class="setting-control vertical">${modelConfigurations.map(model => `<label><input type="checkbox" data-reviewer="${model.id}" ${settings.reviewers.includes(model.id) ? 'checked' : ''} ${disabled || (!model.available || (!global && !(state.assignments[state.repo] || []).includes(model.id)) ? 'disabled' : '')}>${escapeHtml(model.name)}</label>`).join('')}${reset('reviewers')}</div></div></section>
    <section class="settings-section"><h2>Workflow</h2>${[['autoMerge', 'Auto-merge'], ['finalAck', 'Confirm final feature close']].map(([key, title]) => `<div class="setting-row"><div><label for="setting-${key}">${title}</label><small>${source(key)}</small></div><div class="setting-control"><input id="setting-${key}" type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''} ${disabled}>${reset(key)}</div></div>`).join('')}<div class="setting-row"><div><label for="setting-fixCycles">Unsuccessful review cycles before asking the human</label><small>${source('fixCycles')} / prompt guidance</small></div><div class="setting-control"><input id="setting-fixCycles" type="number" min="1" max="10" data-setting="fixCycles" value="${settings.fixCycles}" ${disabled}>${reset('fixCycles')}</div></div></section>
    <section class="settings-section"><div class="section-heading"><div><h2>Enabled skills</h2><small>${source('skills')}</small></div>${reset('skills')}</div><div class="skill-list">${skillCatalog.map(skill => `<label><input type="checkbox" data-skill="${escapeHtml(skill)}" ${settings.skills.includes(skill) ? 'checked' : ''} ${disabled}>${escapeHtml(skill)}</label>`).join('')}</div>${global && state.role === 'admin' ? '<div class="actions"><button type="button" class="outline" data-action="install-skill">Install skill</button><button type="button" data-action="upgrade-skills">Upgrade installed skills</button></div>' : ''}</section>
    ${global ? `<section class="settings-section"><div class="section-heading"><h2>Model configurations</h2><button type="button" class="outline" data-action="add-model">Add configuration</button></div>${modelConfigurations.map(model => `<div class="setting-row"><div><strong>${escapeHtml(model.name)}</strong><small>${escapeHtml(model.provider)} / ${escapeHtml(model.model)} / ${model.available ? 'credential stored' : 'credential removed'}</small></div><button type="button" class="danger" data-remove-model="${model.id}" ${!model.available ? 'disabled' : ''}>Remove credential</button></div>`).join('')}</section>` : `<section class="settings-section"><h2>Assigned model configurations</h2>${modelConfigurations.map(model => `<div class="setting-row"><label><input type="checkbox" data-assignment="${model.id}" ${(state.assignments[state.repo] || []).includes(model.id) ? 'checked' : ''} ${disabled}>${escapeHtml(model.name)}</label><small>${model.available ? 'Available' : 'Credential removed'}</small></div>`).join('')}</section><section class="settings-section"><div class="section-heading"><h2>Repository environment</h2>${state.role === 'admin' ? '<button type="button" class="outline" data-action="environment">Edit environment</button>' : ''}</div><div class="setting-row"><strong>Runtime</strong><span>Linux / isolated repository environment</span></div><div class="setting-row"><strong>Application/test variables</strong><span>DATABASE_URL, TEST_USER_PASSWORD</span></div><div class="setting-row"><strong>Shell state</strong><span>Separate per session</span></div></section>`}
    <footer class="settings-footer"><span>Next calls use the current model assignments and enabled skills.</span><span>Earlier session messages remain unchanged.</span></footer></main>`;
}

function usersPage() {
  return `<main class="management"><header class="management-heading"><div><div class="breadcrumb"><button type="button" data-screen="work">Back to work</button><span>/</span>Team</div><h1>Users</h1></div><button type="button" class="primary" data-action="invite">Invite member</button></header><div class="users-list">${users.map(user => `<button type="button" class="user-row" data-user="${user.id}"><span class="avatar">${escapeHtml(user.name.split(' ').map(part => part[0]).join(''))}</span><span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.email)}</small></span><span>${user.role}</span><span class="${user.invitation === 'Send failed' || user.disabled ? 'error-text' : 'muted'}">${user.disabled ? 'Disabled' : user.invitation}</span><small>${user.repos.length} repositories</small></button>`).join('')}</div></main>`;
}

function userDetails() {
  const user = users.find(person => person.id === state.user);
  return `<main class="management"><header class="management-heading"><div><div class="breadcrumb"><button type="button" data-screen="users">Users</button><span>/</span>User details</div><h1>${escapeHtml(user.name)}</h1><small>${escapeHtml(user.email)} / ${user.role}</small></div><button type="button" class="danger" data-disable-user="${user.id}" ${user.id === 'anh' ? 'disabled' : ''}>${user.disabled ? 'Enable account' : 'Disable account'}</button></header><section class="settings-section"><div class="section-heading"><h2>Invitation</h2>${user.invitation !== 'Active' ? '<button type="button" class="outline" data-action="resend">Resend invitation</button>' : ''}</div><p>${user.disabled ? 'Account disabled' : user.invitation === 'Active' ? 'First login completed' : 'No first login yet'}</p>${user.invitation === 'Send failed' ? '<div class="callout error"><strong>Password-setup email failed</strong><p>The account and repository assignments exist. Resending uses the same account.</p></div>' : user.invitation !== 'Active' ? '<p class="muted">Password-setup email sent.</p>' : ''}</section><section class="settings-section"><h2>Repository assignments</h2><form id="assign-user" class="form-stack">${repositories.map(repo => `<label><input type="checkbox" name="repo" value="${repo.id}" ${user.repos.includes(repo.id) ? 'checked' : ''} ${user.id === 'anh' ? 'disabled' : ''}>${escapeHtml(repo.name)}</label>`).join('')}<div><button type="submit" class="primary" ${user.id === 'anh' ? 'disabled' : ''}>Save assignments</button></div></form></section></main>`;
}

function snapshot() {
  return { variant: state.variant, screen: state.screen, member: actor(), repository: state.repo, workItem: selectedItem(), showAfk: state.showAfk, settings: settingsFor(state.repo), modelAssignments: state.assignments[state.repo], messages: state.messages, audit: state.audits };
}

function showDialog(title, body) {
  dialog.innerHTML = `<div class="dialog-heading"><h2>${escapeHtml(title)}</h2><button type="button" data-close aria-label="Close dialog">&#215;</button></div><div class="dialog-body">${body}</div>`;
  dialog.showModal();
}

function notify(text) {
  const notice = document.querySelector('#notice');
  notice.textContent = text;
  notice.classList.add('visible');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => notice.classList.remove('visible'), 4500);
}

function cycleVariant(direction) {
  state.variant = layouts[(layouts.indexOf(state.variant) + direction + layouts.length) % layouts.length];
  const url = new URL(location.href);
  url.searchParams.set('variant', state.variant);
  history.replaceState(null, '', url);
  render();
  console.info('Prototype state', snapshot());
}

function chooseRepo(repoId) {
  if (!assignedRepositories().some(repo => repo.id === repoId)) return;
  state.repo = repoId;
  state.selected = workItems.find(item => item.repo === repoId)?.id;
  state.screen = 'work';
  render();
}

function editSetting(key, value) {
  if (state.role !== 'admin') return;
  if (state.screen === 'global-settings') globalSettings[key] = value;
  else (state.overrides[state.repo] ||= {})[key] = value;
  render();
  notify('Sample setting saved. The next simulated call uses this value.');
}

function action(name) {
  const item = selectedItem();
  if (name === 'audit' && item) return showDialog('Audit log', sessionAudit(item));
  if (name === 'work-picker') return showDialog('Repository backlog', `${workHeader()}${backlogTree()}`);
  if (name === 'runtime') return showDialog('Application status', '<dl class="detail-list"><dt>Application restart</dt><dd>Today, 09:12</dd><dt>Browser reconnect</dt><dd>Today, 09:41</dd><dt>Recovery</dt><dd>Interrupted work awaits explicit resume</dd></dl>');
  if (name === 'new') return showDialog('New request', `<form id="new-request" class="form-stack"><label for="request-title">Title</label><input id="request-title" name="title" required maxlength="160"><label for="request-kind">Type</label><select id="request-kind" name="kind"><option>Feature</option><option>Bug</option></select><fieldset><legend>Start with</legend><label><input type="radio" name="route" value="wayfinder" checked>Wayfinder</label><label><input type="radio" name="route" value="grill-with-docs">Grill with docs</label></fieldset><label for="request-description">Request</label><textarea id="request-description" name="description" required></textarea><button type="submit" class="primary">Create request</button></form>`);
  if (name === 'attach') { if (dialog.open) dialog.close(); return showDialog('Attach existing issue', `<form id="attach-issue" class="form-stack"><label for="issue-url">GitHub issue URL</label><input id="issue-url" name="url" type="url" required placeholder="https://github.com/${escapeHtml(repository(state.repo).slug)}/issues/300"><p class="muted">${escapeHtml(repository(state.repo).slug)}</p><p id="attach-error" class="error-text" role="alert"></p><button type="submit" class="primary">Attach without starting</button></form>`); }
  if (name === 'connect' && state.role === 'admin') return showDialog('Connect repository', '<form id="connect-repo" class="form-stack"><p>GitHub App: Kishi / installed repositories</p><label><input type="radio" name="repository" value="console" checked>example/mobile-console</label><button type="submit" class="primary">Connect selected</button></form>');
  if (name === 'invite' && state.role === 'admin') return showDialog('Invite member', `<form id="invite-member" class="form-stack"><label for="invite-name">Name</label><input id="invite-name" name="name" required><label for="invite-email">Email</label><input id="invite-email" name="email" type="email" required><fieldset><legend>Repository assignments</legend>${repositories.map(repo => `<label><input type="checkbox" name="repo" value="${repo.id}">${escapeHtml(repo.name)}</label>`).join('')}</fieldset><p id="invite-error" class="error-text" role="alert"></p><button type="submit" class="primary">Create account and send invitation</button></form>`);
  if (name === 'resend' && state.role === 'admin') { users.find(user => user.id === state.user).invitation = 'Invited'; render(); return notify('Sample invitation resent. The existing account and assignments were kept.'); }
  if (name === 'install-skill' && state.role === 'admin') return showDialog('Install skill', '<form id="install-skill" class="form-stack"><label for="skill-name">Skill name</label><input id="skill-name" name="name" required pattern="[a-z0-9-]+"><button type="submit" class="primary">Install</button></form>');
  if (name === 'upgrade-skills' && state.role === 'admin') return notify('Sample catalog refreshed. Earlier loaded instructions remain in session history.');
  if (name === 'add-model' && state.role === 'admin') return showDialog('Add model configuration', '<form id="add-model" class="form-stack"><label for="model-name">Configuration name</label><input id="model-name" name="name" required><label for="model-id">Model</label><select id="model-id" name="model"><option>deepseek-chat</option><option>deepseek-reasoner</option></select><label for="model-credential">Credential label</label><input id="model-credential" name="credential" required><label for="mock-key">API key</label><input id="mock-key" type="password" disabled placeholder="Not collected in this prototype"><button type="submit" class="primary">Add configuration</button></form>');
  if (name === 'environment' && state.role === 'admin') return showDialog('Repository environment', '<dl class="detail-list"><dt>Runtime</dt><dd>Linux / sandbox enabled</dd><dt>Application/test credentials</dt><dd>DATABASE_URL, TEST_USER_PASSWORD</dd><dt>Shell state</dt><dd>Separate per session</dd><dt>Service credentials</dt><dd>Not supplied to repository code</dd></dl><label for="environment-value">Secret values</label><input id="environment-value" disabled placeholder="Not collected in this prototype">');
  if (!item) return;
  if (name === 'issue') return showDialog('Linked issue', `<dl class="detail-list"><dt>Issue</dt><dd>${escapeHtml(repository(item.repo).slug)}#${item.issue}</dd><dt>Status</dt><dd>${item.issueAvailable ? item.issueStatus : `Unavailable / cached ${item.issueStatus}`}</dd><dt>Source</dt><dd>Sample issue. No GitHub request was made.</dd></dl>`);
  if (name === 'recheck-issue' || name === 'reconcile') { item.issueAvailable = true; item.summaryUncertain = false; record(item, name === 'reconcile' ? 'Reconciled GitHub summary write' : 'Checked linked issue', 'Confirmed existing result; no duplicate write', 'Kishi'); render(); return notify('Sample result confirmed. Work has not resumed.'); }
  if (name === 'grant' || name === 'deny') {
    if (state.role !== 'admin') return;
    item.permissionUsed = true;
    item.state = name === 'grant' ? 'Running' : 'Paused';
    record(item, name === 'grant' ? 'Granted one action' : 'Denied permission', `docker compose run --rm browser-qa / ${repository(item.repo).slug} / Attempt ${item.attempt}`);
    render();
    return notify('Sample permission recorded. No command was executed.');
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-close')) return dialog.close();
  if (button.id === 'previous-variant') return cycleVariant(-1);
  if (button.id === 'next-variant') return cycleVariant(1);
  if (button.id === 'reset-demo') return location.reload();
  if (button.id === 'inspect-state') return showDialog('Prototype state', `<pre>${escapeHtml(JSON.stringify(snapshot(), null, 2))}</pre>`);
  if (button.dataset.item) {
    state.selected = button.dataset.item;
    state.repo = selectedItem().repo;
    state.screen = 'work';
    if (dialog.open) dialog.close();
    return render();
  }
  if (button.dataset.repo) return chooseRepo(button.dataset.repo);
  if (button.dataset.screen) { state.screen = button.dataset.screen; return render(); }
  if (button.dataset.reset && state.role === 'admin') { delete state.overrides[state.repo][button.dataset.reset]; render(); return notify('Repository override removed. The global value is effective again.'); }
  if (button.dataset.user && state.role === 'admin') { state.user = button.dataset.user; state.screen = 'user-detail'; return render(); }
  if (button.dataset.removeModel && state.role === 'admin') { modelConfigurations.find(model => model.id === button.dataset.removeModel).available = false; render(); return notify('Sample credential removed. Future calls using it will pause.'); }
  if (button.dataset.disableUser && state.role === 'admin') {
    const user = users.find(person => person.id === button.dataset.disableUser);
    user.disabled = !user.disabled;
    if (user.disabled) for (const item of workItems.filter(work => work.startedBy === user.id && activeRun(work))) { item.state = 'Cancelling'; record(item, `Revoked ${user.name}'s access`, 'Cancellation requested; still-running process is visible'); }
    render();
    return notify(user.disabled ? 'Sample access revoked. Earlier audit attribution is retained.' : 'Sample access restored. Work has not resumed.');
  }
  if (button.dataset.action) action(button.dataset.action);
});

document.addEventListener('change', event => {
  if (event.target.hasAttribute('data-afk')) { state.showAfk = event.target.checked; render(); if (dialog.open) dialog.querySelector('.dialog-body').innerHTML = `${workHeader()}${backlogTree()}`; }
  if (event.target.hasAttribute('data-role')) { state.role = event.target.value; render(); }
  if (event.target.hasAttribute('data-repo-select')) chooseRepo(event.target.value);
  if (event.target.dataset.setting) {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.type === 'number' ? Number(event.target.value) : event.target.value;
    if (event.target.type === 'number' && !event.target.checkValidity()) return;
    editSetting(event.target.dataset.setting, value);
  }
  if (event.target.dataset.reviewer) {
    const selected = [...app.querySelectorAll('[data-reviewer]:checked')].map(input => input.dataset.reviewer);
    if (!selected.length) { render(); return notify('Select at least one reviewer model.'); }
    editSetting('reviewers', selected);
  }
  if (event.target.dataset.skill) editSetting('skills', [...app.querySelectorAll('[data-skill]:checked')].map(input => input.dataset.skill));
  if (event.target.dataset.assignment && state.role === 'admin') { state.assignments[state.repo] = [...app.querySelectorAll('[data-assignment]:checked')].map(input => input.dataset.assignment); render(); notify('Sample repository assignments updated. No model fallback.'); }
  if (event.target.id === 'scenario') {
    const scenario = event.target.value;
    state.selected = scenario === 'missing-review' ? 'email' : scenario === 'interrupted' || scenario === 'cancelling' ? 'reconnect' : scenario === 'model' ? 'credentials' : 'policy';
    state.repo = 'atlas'; state.screen = 'work'; state.showAfk = true;
    const item = selectedItem();
    item.issueAvailable = scenario !== 'unavailable';
    item.issueStatus = scenario === 'closed' ? 'Closed' : 'Open';
    item.summaryUncertain = scenario === 'uncertain';
    if (scenario === 'interrupted') item.state = 'Interrupted';
    if (scenario === 'cancelling') item.state = 'Cancelling';
    if (scenario === 'model') { item.state = 'Model unavailable'; state.assignments.atlas = state.assignments.atlas.filter(model => model !== settingsFor('atlas').build); }
    render();
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'message') state.drafts[conversationKey(selectedItem())] = event.target.value;
});

document.addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.target);
  if (event.target.id === 'message-form') {
    const text = data.get('message').trim();
    if (!text) return;
    const item = selectedItem();
    const time = record(item, 'Sent a message', 'Accepted; no workflow confirmation inferred by the prototype');
    (state.messages[conversationKey(item)] ||= []).push({ actor: actor(), time, text });
    delete state.drafts[conversationKey(item)];
    render();
    return notify('Sample reply recorded. LLM interpretation is not simulated.');
  }
  if (event.target.id === 'new-request' || event.target.id === 'attach-issue') {
    let issue = ++state.sequence;
    let title = data.get('title')?.trim();
    const attach = event.target.id === 'attach-issue';
    if (attach) {
      const url = new URL(data.get('url'));
      const parts = url.pathname.split('/').filter(Boolean);
      issue = Number(parts[3]);
      if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || parts.length !== 4 || parts[2] !== 'issues' || parts.slice(0, 2).join('/') !== repository(state.repo).slug || !Number.isSafeInteger(issue) || issue <= 0) { document.querySelector('#attach-error').textContent = 'Use an issue URL from this connected repository.'; return; }
      const existing = workItems.find(item => item.repo === state.repo && item.issue === issue);
      if (existing) { state.selected = existing.id; dialog.close(); render(); return notify('Existing work item opened. No duplicate was created.'); }
      title = `Attached issue #${issue}`;
    }
    const item = { id: `request-${state.sequence}`, repo: state.repo, parent: null, issue, title, type: data.get('kind') || 'Feature', mode: 'HITL', state: 'Ready', attempt: 1, issueStatus: 'Open', issueAvailable: true, route: attach ? 'Selected issue' : data.get('route'), description: data.get('description'), startedBy: currentUser().id };
    workItems.unshift(item); state.selected = item.id; state.screen = 'work';
    record(item, attach ? 'Attached existing issue' : 'Created request', 'Sample work item; no external issue write and no run started');
  }
  if (event.target.id === 'invite-member' && state.role === 'admin') {
    const email = data.get('email').trim().toLowerCase();
    if (users.some(user => user.email === email)) { document.querySelector('#invite-error').textContent = 'This account already exists. Use Resend invitation from User details.'; return; }
    const user = { id: `member-${++state.sequence}`, name: data.get('name').trim(), email, role: 'Member', repos: data.getAll('repo'), invitation: 'Invited', disabled: false };
    users.push(user); state.user = user.id; state.screen = 'user-detail';
  }
  if (event.target.id === 'assign-user' && state.role === 'admin') {
    const user = users.find(person => person.id === state.user);
    const nextRepos = data.getAll('repo');
    for (const item of workItems.filter(work => work.startedBy === user.id && user.repos.includes(work.repo) && !nextRepos.includes(work.repo) && activeRun(work))) { item.state = 'Cancelling'; record(item, `Removed ${user.name}'s repository access`, 'Cancellation requested; still-running process is visible'); }
    user.repos = nextRepos;
  }
  if (event.target.id === 'connect-repo' && state.role === 'admin' && !repositories.some(repo => repo.id === 'console')) { repositories.push({ id: 'console', name: 'Mobile console', slug: 'example/mobile-console' }); state.assignments.console = []; state.overrides.console = {}; }
  if (event.target.id === 'install-skill' && state.role === 'admin') { const name = data.get('name').trim(); if (!skillCatalog.includes(name)) skillCatalog.push(name); }
  if (event.target.id === 'add-model' && state.role === 'admin') modelConfigurations.push({ id: `model-${++state.sequence}`, name: data.get('name').trim(), model: data.get('model'), provider: 'DeepSeek', credential: data.get('credential').trim(), available: true });
  if (dialog.open) dialog.close();
  render();
  notify('Sample change saved in this tab only. No external action was taken.');
});

document.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, select, [contenteditable]') || dialog.open) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    cycleVariant(event.key === 'ArrowLeft' ? -1 : 1);
  }
});

render();