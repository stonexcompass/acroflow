/* ============================================================================
 * AcroFlow — application logic (no frameworks, no build step)
 * ----------------------------------------------------------------------------
 * Plain vanilla JS. Screens are rendered as HTML strings into #view based on
 * the URL hash (a tiny "router"). All user data lives in `state` and is
 * persisted through the StorageAdapter (`DB`) defined below.
 *
 * >>> THE STORAGE SEAM (for future Supabase sync) <<<
 * Everything that touches persistence goes through `DB`, which today is the
 * localStorage adapter. To add cloud sync later, write a new adapter object
 * with THE SAME method signatures (all async) and swap one line:
 *
 *     let DB = LocalAdapter;   →→→   let DB = SupabaseAdapter;
 *
 * Required adapter interface (documented in README.md too):
 *     adapter.load()            -> Promise<state|null>
 *     adapter.save(state)       -> Promise<void>
 *     adapter.clear()           -> Promise<void>
 *     adapter.exportJSON(state) -> string        (sync is fine)
 *     adapter.importJSON(text)  -> state object  (throws on invalid)
 *
 * App code always `await`s DB calls, so a network-backed adapter drops in
 * with zero changes to the screens. localStorage stays the working store
 * for v1 so the app is fully usable offline before sync is wired up.
 * ========================================================================== */
'use strict';

/* ---------------- constants ---------------- */
const LEVELS = ['unstarted', 'learning', 'drilling', 'solid', 'teach'];
const LEVEL_LABEL = {
  unstarted: 'Unstarted', learning: 'Learning', drilling: 'Drilling',
  solid: 'Solid', teach: 'Can teach'
};
const ROLES = ['base', 'flyer', 'spotter'];
const ROLE_LABEL = { base: 'Base', flyer: 'Flyer', spotter: 'Spotter' };
const APP_VERSION = '1.0.0';

/* ---------------- StorageAdapter (localStorage for v1) ---------------- */
const DB_KEY = 'acroflow.v1';

const LocalAdapter = {
  name: 'localStorage',

  /** Load persisted state, or null when nothing is stored yet. */
  async load() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('AcroFlow: could not read localStorage:', err);
      return null;
    }
  },

  /** Persist the whole state object. */
  async save(state) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('AcroFlow: could not write localStorage:', err);
      toast('Could not save — storage may be full.');
    }
  },

  /** Remove everything (used by Reset). */
  async clear() {
    try { localStorage.removeItem(DB_KEY); }
    catch (err) { console.warn('AcroFlow: could not clear localStorage:', err); }
  },

  /** Serialize state for the Export download. */
  exportJSON(state) {
    return JSON.stringify(state, null, 2);
  },

  /**
   * Parse + minimally validate an imported JSON string.
   * Throws an Error with a human-readable message when invalid.
   */
  importJSON(text) {
    let data;
    try { data = JSON.parse(text); }
    catch (err) { throw new Error('That file is not valid JSON.'); }
    if (!data || typeof data !== 'object') throw new Error('That file is not valid JSON.');
    if (typeof data.progress !== 'object' || data.progress === null) throw new Error('Missing "progress" in import file.');
    if (!Array.isArray(data.practiceLogs)) throw new Error('Missing "practiceLogs" in import file.');
    if (typeof data.settings !== 'object' || data.settings === null) throw new Error('Missing "settings" in import file.');
    if (!Array.isArray(data.flows)) data.flows = [];
    if (typeof data.partnerProgress !== 'object' || data.partnerProgress === null) data.partnerProgress = {};
    return data;
  }
};

/* Swap this one line for a Supabase adapter later — same signatures. */
let DB = LocalAdapter;

/* ---------------- state ---------------- */
function freshState() {
  return {
    version: window.SEED.version,
    settings: { name: '', primaryRoles: ['base', 'flyer'] },
    progress: {},          // { skillId: { base:'drilling', flyer:'solid', ... } } (sparse: only non-'unstarted' stored)
    partnerProgress: {},   // same shape, for the Jam partner profile on this device
    flows: [],              // user-created flows (seed flows live in data.js)
    practiceLogs: []        // [{ id, date, partner, role, skills:[], confidence, notes }]
  };
}

let state = freshState();

async function persist() {
  try { await DB.save(state); }
  catch (err) { console.warn('AcroFlow: persist failed:', err); }
}

/* ---------------- skill graph lookups ---------------- */
const byId = new Map();        // skillId -> {kind:'pose'|'transition', ...record}
window.SEED.poses.forEach(p => byId.set(p.id, Object.assign({ kind: 'pose' }, p)));
window.SEED.transitions.forEach(t => byId.set(t.id, Object.assign({ kind: 'transition' }, t)));

const pairToTrans = new Map(); // "fromId→toId" -> transitionId
window.SEED.transitions.forEach(t => pairToTrans.set(t.from + '→' + t.to, t.id));

function skillName(id) {
  const s = byId.get(id);
  return s ? s.name : id;
}

function allFlows() {
  return window.SEED.flows.concat(state.flows);
}

function getFlow(id) {
  return allFlows().find(f => f.id === id) || null;
}

/** Aligned [from,to,transitionId|null] links for a flow's steps. */
function flowLinks(flow) {
  const out = [];
  for (let i = 0; i + 1 < flow.steps.length; i++) {
    const from = flow.steps[i], to = flow.steps[i + 1];
    const tid = (flow.transitions && flow.transitions[i]) || pairToTrans.get(from + '→' + to) || null;
    out.push({ from, to, tid });
  }
  return out;
}

/* ---------------- progress helpers ---------------- */
function rank(level) { return LEVELS.indexOf(level); }

function getLevel(skillId, role, profile) {
  const bag = profile === 'partner' ? state.partnerProgress : state.progress;
  const entry = bag[skillId];
  return (entry && entry[role]) || 'unstarted';
}

function setLevel(skillId, role, level, profile) {
  const bag = profile === 'partner' ? state.partnerProgress : state.progress;
  if (level === 'unstarted') {
    if (bag[skillId]) {
      delete bag[skillId][role];
      if (Object.keys(bag[skillId]).length === 0) delete bag[skillId];
    }
  } else {
    if (!bag[skillId]) bag[skillId] = {};
    bag[skillId][role] = level;
  }
  persist();
}

/** True when every one of `roles` is at least `min` for this skill/profile. */
function atLeast(skillId, roles, min, profile) {
  const need = rank(min);
  return roles.every(r => rank(getLevel(skillId, r, profile || 'you')) >= need);
}

/* ---------------- small view helpers ---------------- */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function diffPips(d) {
  let h = '<span class="diff" title="Difficulty ' + d + '/5">';
  for (let i = 1; i <= 5; i++) h += '<span class="pip' + (i <= d ? ' on' : '') + '"></span>';
  return h + '</span>';
}

/** Three dots showing per-role status for the visible roles (filled = drilling+). */
function roleDots(skillId, roles, profile) {
  let h = '<span class="dots">';
  roles.forEach(r => {
    const on = rank(getLevel(skillId, r, profile)) >= rank('drilling');
    h += '<span class="dot' + (on ? ' on' : '') + '" title="' + ROLE_LABEL[r] + ': ' + LEVEL_LABEL[getLevel(skillId, r, profile)] + '"></span>';
  });
  return h + '</span>';
}

/** Per-role progress stepper. `compact` renders smaller buttons for lists. */
function stepper(skillId, profile) {
  let h = '';
  ROLES.forEach(role => {
    const cur = getLevel(skillId, role, profile);
    h += '<div class="role-label">' + ROLE_LABEL[role] + '</div><div class="stepper" role="group" aria-label="' + esc(skillName(skillId)) + ' as ' + ROLE_LABEL[role] + '">';
    LEVELS.forEach(lv => {
      const cls = lv === cur ? 'on' : (rank(lv) < rank(cur) ? 'lit' : '');
      h += '<button type="button" class="' + cls + '" onclick="App.setLevel(\'' + skillId + '\',\'' + role + '\',\'' + lv + '\',\'' + profile + '\')" aria-pressed="' + (lv === cur) + '">' + LEVEL_LABEL[lv] + '</button>';
    });
    h += '</div>';
  });
  return h;
}

function safetyBox(safety) {
  if (!safety) return '';
  const risk = safety.risk || 'low';
  let h = '<div class="safety risk-' + risk + '"><strong>Risk: ' + esc(risk) + '</strong>';
  if (safety.spotterRequired) h += ' &nbsp;·&nbsp; 🛟 <strong>Spotter required</strong>';
  if (safety.notes) h += '<div>' + esc(safety.notes) + '</div>';
  return h + '</div>';
}

function tutorialList(tuts) {
  if (!tuts || !tuts.length) return '<p class="muted">No tutorials linked yet — ask your community for a good one.</p>';
  let h = '';
  tuts.forEach(t => {
    h += '<a class="tut" href="' + esc(t.url) + '" target="_blank" rel="noopener">' +
      '<div class="tut-title">▶ ' + esc(t.title) + '</div>' +
      (t.creator ? '<div class="tut-creator">' + esc(t.creator) + '</div>' : '') + '</a>';
  });
  return h;
}

function prereqChips(ids, label) {
  if (!ids || !ids.length) return '';
  let h = '<div><span class="muted small">' + label + ': </span>';
  ids.forEach(id => {
    const s = byId.get(id);
    if (s) h += '<a class="pill" href="#/skill/' + id + '">' + esc(s.name) + '</a>';
  });
  return h + '</div>';
}

/* ---------------- router ---------------- */
const TITLES = {
  library: 'Skill library', discover: 'What should I learn next?',
  builder: 'Flow builder', jam: 'Jam with a partner',
  log: 'Practice log', data: 'Data & settings'
};

function currentRoute() {
  const h = location.hash || '#/library';
  const mSkill = h.match(/^#\/skill\/([A-Za-z0-9_]+)$/);
  if (mSkill) return { name: 'skill', id: mSkill[1] };
  const mFlow = h.match(/^#\/flow\/([A-Za-z0-9_]+)$/);
  if (mFlow) return { name: 'flow', id: mFlow[1] };
  const name = (h.match(/^#\/(\w+)/) || [])[1];
  return { name: ['library', 'discover', 'builder', 'jam', 'log', 'data'].includes(name) ? name : 'library' };
}

function render() {
  const r = currentRoute();
  const view = document.getElementById('view');
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === r.name ||
      (r.name === 'skill' && t.dataset.tab === 'library') ||
      (r.name === 'flow' && t.dataset.tab === 'builder')));
  document.getElementById('header-sub').textContent = TITLES[r.name] || '';
  window.scrollTo(0, 0);
  if (r.name === 'library') renderLibrary(view);
  else if (r.name === 'skill') renderSkillDetail(view, r.id);
  else if (r.name === 'flow') renderFlowDetail(view, r.id);
  else if (r.name === 'discover') renderDiscover(view);
  else if (r.name === 'builder') renderBuilder(view);
  else if (r.name === 'jam') renderJam(view);
  else if (r.name === 'log') renderLog(view);
  else if (r.name === 'data') renderData(view);
}

/* ---------------- Library ---------------- */
let libQuery = '', libType = 'all', libDiff = 0, libLevel = 'all';
let libProfile = 'you'; // 'you' | 'partner'

function libFiltered() {
  const q = libQuery.trim().toLowerCase();
  const roles = state.settings.primaryRoles.length ? state.settings.primaryRoles : ROLES;
  return Array.from(byId.values()).filter(s => {
    if (libType !== 'all' && s.kind !== libType) return false;
    if (libDiff && s.difficulty !== libDiff) return false;
    if (q) {
      const hay = (s.name + ' ' + (s.aliases || []).join(' ')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (libLevel !== 'all') {
      // "overall" = weakest primary role — honest about where you stand
      const worst = Math.min.apply(null, roles.map(r => rank(getLevel(s.id, r, libProfile))));
      if (LEVELS[worst] !== libLevel) return false;
    }
    return true;
  }).sort((a, b) => (a.difficulty - b.difficulty) || a.name.localeCompare(b.name));
}

function renderLibrary(view) {
  const roles = state.settings.primaryRoles.length ? state.settings.primaryRoles : ROLES;
  let h = '<h1>Library</h1>';
  h += '<div class="segmented" role="tablist" aria-label="Whose progress">' +
    '<button type="button" class="' + (libProfile === 'you' ? 'on' : '') + '" onclick="App.setProfile(\'you\')">You</button>' +
    '<button type="button" class="' + (libProfile === 'partner' ? 'on' : '') + '" onclick="App.setProfile(\'partner\')">Partner</button></div>';
  if (libProfile === 'partner') {
    h += '<p class="hint">Editing your jam partner\'s skills — this profile lives on this device. Tap any skill to set their per-role levels.</p>';
  }
  h += '<div class="toolbar"><input type="search" id="lib-q" placeholder="Search poses & transitions…" value="' + esc(libQuery) + '" oninput="App.libSearch(this.value)" aria-label="Search skills"></div>';
  h += '<div class="chip-row" role="group" aria-label="Type filter">' +
    chip('all', libType, 'All') + chip('pose', libType, 'Poses') + chip('transition', libType, 'Transitions') + '</div>';
  h += '<div class="chip-row" role="group" aria-label="Difficulty filter">' +
    '<button type="button" class="chip' + (libDiff === 0 ? ' on' : '') + '" onclick="App.libDiff(0)">Any ★</button>';
  for (let d = 1; d <= 5; d++) h += '<button type="button" class="chip' + (libDiff === d ? ' on' : '') + '" onclick="App.libDiff(' + d + ')">' + d + '★</button>';
  h += '</div>';
  h += '<div class="chip-row" role="group" aria-label="Progress filter">' +
    '<button type="button" class="chip' + (libLevel === 'all' ? ' on' : '') + '" onclick="App.libLevel(\'all\')">Any status</button>';
  LEVELS.forEach(lv => { h += '<button type="button" class="chip' + (libLevel === lv ? ' on' : '') + '" onclick="App.libLevel(\'' + lv + '\')">' + LEVEL_LABEL[lv] + '</button>'; });
  h += '</div>';
  h += '<div id="lib-list"></div>';
  view.innerHTML = h;
  updateLibraryList();

  function chip(val, cur, label) {
    return '<button type="button" class="chip' + (cur === val ? ' on' : '') + '" onclick="App.libType(\'' + val + '\')">' + label + '</button>';
  }
}

function updateLibraryList() {
  const el = document.getElementById('lib-list');
  if (!el) return;
  const roles = state.settings.primaryRoles.length ? state.settings.primaryRoles : ROLES;
  const items = libFiltered();
  if (!items.length) {
    el.innerHTML = '<div class="empty"><span class="big">🔍</span>No skills match those filters.<br>Try clearing the search.</div>';
    return;
  }
  let h = '<p class="muted small">' + items.length + ' skill' + (items.length === 1 ? '' : 's') + '</p>';
  items.forEach(s => {
    h += '<a class="skill-item" href="#/skill/' + s.id + '">' +
      '<div class="skill-top"><span class="skill-kind' + (s.kind === 'transition' ? ' transition' : '') + '">' + (s.kind === 'pose' ? 'Pose' : 'Transition') + '</span>' +
      '<span class="skill-name">' + esc(s.name) + '</span>' + roleDots(s.id, roles, libProfile) + '</div>' +
      '<div class="skill-meta">' + diffPips(s.difficulty) +
      (s.kind === 'transition' ? ' &nbsp;' + esc(skillName(s.from)) + ' → ' + esc(skillName(s.to)) : '') + '</div></a>';
  });
  el.innerHTML = h;
}

/* ---------------- Skill detail ---------------- */
function renderSkillDetail(view, id) {
  const s = byId.get(id);
  if (!s) { view.innerHTML = '<a class="back" href="#/library">← Library</a><div class="empty">Unknown skill.</div>'; return; }
  const roles = state.settings.primaryRoles.length ? state.settings.primaryRoles : ROLES;

  let h = '<a class="back" href="#/library">← Library</a>';
  h += '<div class="detail-head"><span class="skill-kind' + (s.kind === 'transition' ? ' transition' : '') + '">' + (s.kind === 'pose' ? 'Pose' : 'Transition') + '</span>';
  h += '<h1>' + esc(s.name) + '</h1>';
  if (s.aliases && s.aliases.length) h += '<div class="aliases">also called: ' + esc(s.aliases.join(', ')) + '</div></div>';
  else h += '</div>';
  h += '<div class="row wrap"><span class="pill">' + esc(disciplineLabel(s.discipline)) + '</span>' + diffPips(s.difficulty) + '<span class="pill grey">' + s.difficulty + '/5 difficulty</span></div>';
  if (s.kind === 'transition') {
    h += '<p><a class="pill" href="#/skill/' + s.from + '">' + esc(skillName(s.from)) + '</a> <span aria-hidden="true">→</span> <a class="pill" href="#/skill/' + s.to + '">' + esc(skillName(s.to)) + '</a></p>';
  }
  if (s.description) h += '<p>' + esc(s.description) + '</p>';
  h += safetyBox(s.safety);
  h += prereqChips(s.prereqPoses, 'Needs poses') + prereqChips(s.prereqTransitions, 'Needs transitions');

  // Where this skill appears: flows containing the pose, or transitions touching it
  const usedIn = allFlows().filter(f => f.steps.includes(id));
  if (usedIn.length) {
    h += '<h3>Used in flows</h3><div class="row wrap">';
    usedIn.forEach(f => { h += '<a class="pill green" href="#/flow/' + f.id + '">' + esc(f.name) + (f.washingMachine ? ' 🌀' : '') + '</a>'; });
    h += '</div>';
  }

  h += '<h2>Your progress</h2>';
  h += '<div class="segmented"><button type="button" class="' + (libProfile === 'you' ? 'on' : '') + '" onclick="App.setProfile(\'you\',true)">You</button>' +
    '<button type="button" class="' + (libProfile === 'partner' ? 'on' : '') + '" onclick="App.setProfile(\'partner\',true)">Partner</button></div>';
  h += '<div class="card">' + stepper(id, libProfile) + '</div>';
  h += '<p class="hint">Poses and transitions are tracked separately, per role — knowing Bird and Throne doesn\'t mean you know Bird → Throne.</p>';

  h += '<h2>Tutorials</h2><div class="card">' + tutorialList(s.tutorials) + '</div>';
  view.innerHTML = h;
}

function disciplineLabel(d) {
  return { lbase: 'L-base', icarian: 'Icarian', standing: 'Standing', dancelift: 'Dance lifts' }[d] || d || 'Acro';
}

/* ---------------- Discover ("What next?") ---------------- */
function renderDiscover(view) {
  const roles = state.settings.primaryRoles.length ? state.settings.primaryRoles : ROLES;
  const roleNames = roles.map(r => ROLE_LABEL[r]).join(' + ');

  let h = '<h1>What next?</h1>';
  h += '<p class="muted">Based on your <strong>' + esc(roleNames) + '</strong> progress (change primary roles in 💾 Data).</p>';

  // --- Ready to learn: transitions whose endpoints are drilling+, transition not solid ---
  const ready = window.SEED.transitions.filter(t =>
    atLeast(t.from, roles, 'drilling') && atLeast(t.to, roles, 'drilling') && !atLeast(t.id, roles, 'solid')
  ).sort((a, b) => (a.difficulty - b.difficulty) || a.name.localeCompare(b.name));

  h += '<h2>🎯 Ready to learn</h2>';
  h += '<p class="muted small">Both poses are drilling or better, but the transition itself isn\'t solid yet.</p>';
  if (!ready.length) {
    h += '<div class="empty"><span class="big">🌱</span>Nothing queued up. Mark some poses as <strong>drilling</strong> in the Library and transitions will appear here.</div>';
  } else {
    ready.forEach(t => {
      h += '<a class="skill-item" href="#/skill/' + t.id + '"><div class="skill-top">' +
        '<span class="skill-kind transition">Transition</span><span class="skill-name">' + esc(t.name) + '</span>' + roleDots(t.id, roles, 'you') + '</div>' +
        '<div class="skill-meta">' + diffPips(t.difficulty) + ' &nbsp;needs: ' +
        roles.map(r => ROLE_LABEL[r] + ' ' + LEVEL_LABEL[getLevel(t.id, r, 'you')]).join(' · ') + '</div></a>';
    });
  }

  // --- Almost unlocked: washing machines missing only 1–2 solid transitions ---
  h += '<h2>🌀 Almost unlocked</h2>';
  h += '<p class="muted small">Washing machines where all but one or two transitions are solid.</p>';
  const machines = [];
  allFlows().forEach(f => {
    if (!f.washingMachine || f.steps.length < 2) return;
    const links = flowLinks(f);
    const missing = links.filter(l => !(l.tid && atLeast(l.tid, roles, 'solid', 'you')));
    if (missing.length >= 1 && missing.length <= 2) machines.push({ f, links, missing });
  });

  if (!machines.length) {
    h += '<div class="empty"><span class="big">🌀</span>No machines are close yet. Get transitions to <strong>solid</strong> and they\'ll show up here with exactly what\'s missing.</div>';
  } else {
    machines.forEach(({ f, links, missing }) => {
      h += '<a class="skill-item" href="#/flow/' + f.id + '"><div class="skill-top">' +
        '<span class="skill-name">' + esc(f.name) + '</span><span class="pill amber">' + missing.length + ' to go</span></div>' +
        '<div class="skill-meta">' + (links.length - missing.length) + '/' + links.length + ' transitions solid &nbsp;·&nbsp; missing: ' +
        esc(missing.map(m => (m.tid ? skillName(m.tid) : skillName(m.from) + ' → ' + skillName(m.to) + ' (?)')).join(', ')) + '</div></a>';
    });
  }
  view.innerHTML = h;
}

/* ---------------- Flow Builder ---------------- */
let draftSteps = [];   // pose ids, in order
let builderQuery = '';

function renderBuilder(view) {
  const q = builderQuery.trim().toLowerCase();
  const poses = window.SEED.poses
    .filter(p => !q || (p.name + ' ' + (p.aliases || []).join(' ')).toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  let h = '<h1>Flow builder</h1>';
  h += '<p class="muted">Tap poses to append them. We\'ll resolve each link to a known transition — <strong>?</strong> means nobody has named that link yet.</p>';

  // draft sequence
  h += '<div class="card"><h3 style="margin-top:0">Your sequence</h3><div id="draft-seq">';
  h += draftSeqHTML();
  h += '</div>';
  h += '<label class="field" for="flow-name">Flow name</label>';
  h += '<input type="text" id="flow-name" placeholder="e.g. My Sunday jam flow" maxlength="60">';
  h += '<div class="row wrap" style="margin-top:10px">';
  h += '<button type="button" class="btn" onclick="App.saveFlow()" ' + (draftSteps.length < 2 ? 'disabled' : '') + '>Save flow</button>';
  h += '<button type="button" class="btn ghost" onclick="App.clearDraft()">Clear</button></div></div>';

  // pose picker
  h += '<label class="field" for="builder-q">Add a pose</label>';
  h += '<input type="search" id="builder-q" placeholder="Search poses…" value="' + esc(builderQuery) + '" oninput="App.builderSearch(this.value)">';
  h += '<div class="chip-row" id="pose-pick">';
  poses.forEach(p => {
    h += '<button type="button" class="chip pose-pick" onclick="App.addPose(\'' + p.id + '\')">' + esc(p.name) + '</button>';
  });
  h += '</div>';
  if (!poses.length) h += '<p class="muted">No poses match.</p>';

  // saved flows
  h += '<h2>Saved flows</h2>';
  const flows = allFlows();
  flows.forEach(f => {
    h += '<a class="skill-item" href="#/flow/' + f.id + '"><div class="skill-top">' +
      '<span class="skill-name">' + esc(f.name) + '</span>' +
      (f.washingMachine ? '<span class="pill green">🌀 washing machine</span>' : '<span class="pill grey">flow</span>') +
      (f.origin === 'user' ? '<span class="pill">yours</span>' : '') + '</div>' +
      '<div class="skill-meta">' + (f.steps.length ? f.steps.length + ' poses' : 'sequence not recorded yet') + '</div></a>';
  });
  view.innerHTML = h;
}

function draftSeqHTML() {
  if (!draftSteps.length) return '<p class="muted">Nothing yet — tap poses below to start building.</p>';
  let h = '<div class="seq">';
  draftSteps.forEach((pid, i) => {
    h += '<div class="row"><div class="seq-node grow">' + (i + 1) + '. ' + esc(skillName(pid)) + '</div>' +
      '<button type="button" class="btn ghost small-btn" onclick="App.removeStep(' + i + ')" aria-label="Remove step ' + (i + 1) + '">✕</button></div>';
    if (i + 1 < draftSteps.length) {
      const to = draftSteps[i + 1];
      const tid = pairToTrans.get(pid + '→' + to);
      if (tid) h += '<div class="seq-link"><span class="arrow">↓</span><span>' + esc(skillName(tid)) + '</span></div>';
      else h += '<div class="seq-link unknown"><span class="arrow">?</span><span>unknown transition: ' + esc(skillName(pid)) + ' → ' + esc(skillName(to)) + '</span></div>';
    }
  });
  h += '</div>';
  if (draftSteps.length > 1 && draftSteps[0] === draftSteps[draftSteps.length - 1]) {
    h += '<div class="celebrate">🎉 That\'s a washing machine!<br><span style="font-weight:400;font-size:.9rem">It starts and ends in the same pose — loop it forever.</span></div>';
  }
  return h;
}

/* ---------------- Flow detail ---------------- */
function renderFlowDetail(view, id) {
  const f = getFlow(id);
  if (!f) { view.innerHTML = '<a class="back" href="#/builder">← Builder</a><div class="empty">Unknown flow.</div>'; return; }
  const roles = state.settings.primaryRoles.length ? state.settings.primaryRoles : ROLES;

  let h = '<a class="back" href="#/builder">← Builder</a>';
  h += '<h1>' + esc(f.name) + '</h1>';
  h += '<div class="row wrap">' +
    (f.washingMachine ? '<span class="pill green">🌀 washing machine</span>' : '<span class="pill grey">flow</span>') +
    '<span class="pill">' + (f.origin === 'user' ? 'created by you' : 'seed library') + '</span></div>';
  if (f.note) h += '<p class="muted">' + esc(f.note) + '</p>';

  if (!f.steps.length) {
    h += '<div class="empty"><span class="big">🌀</span>Sequence not recorded yet.<br>Learn it, then rebuild it in the Flow Builder to track it properly.</div>';
  } else {
    h += '<div class="seq">';
    f.steps.forEach((pid, i) => {
      const s = byId.get(pid);
      h += '<a class="seq-node" style="display:block;text-decoration:none;color:inherit" href="#/skill/' + pid + '">' + (i + 1) + '. ' + esc(s ? s.name : pid) + ' ' + roleDots(pid, roles, 'you') + '</a>';
      if (i + 1 < f.steps.length) {
        const to = f.steps[i + 1];
        const tid = (f.transitions && f.transitions[i]) || pairToTrans.get(pid + '→' + to);
        if (tid) {
          const t = byId.get(tid);
          h += '<a class="seq-link" style="text-decoration:none" href="#/skill/' + tid + '"><span class="arrow">↓</span><span>' + esc(t ? t.name : tid) + '</span> ' + roleDots(tid, roles, 'you') + '</a>';
        } else {
          h += '<div class="seq-link unknown"><span class="arrow">?</span><span>unknown transition: ' + esc(skillName(pid)) + ' → ' + esc(skillName(to)) + '</span></div>';
        }
      }
    });
    h += '</div>';
  }

  h += '<h2>Tutorials</h2><div class="card">' + tutorialList(f.tutorials) + '</div>';
  if (f.origin === 'user') {
    h += '<button type="button" class="btn danger" onclick="App.deleteFlow(\'' + f.id + '\')">Delete this flow</button>';
  }
  view.innerHTML = h;
}

/* ---------------- Jam (compare two profiles) ---------------- */
let jamRoles = null; // null → default to settings.primaryRoles on first render

function renderJam(view) {
  if (!jamRoles) jamRoles = state.settings.primaryRoles.length ? state.settings.primaryRoles.slice() : ['base', 'flyer'];
  const roles = jamRoles;

  let h = '<h1>Jam 🤝</h1>';
  h += '<p class="muted">Compare <strong>You</strong> with your <strong>Partner</strong> profile (edit theirs in 📚 Library → Partner). A skill counts when it\'s <strong>drilling</strong> or better.</p>';
  h += '<div class="chip-row" role="group" aria-label="Roles to compare">';
  ROLES.forEach(r => {
    h += '<button type="button" class="chip' + (roles.includes(r) ? ' on' : '') + '" onclick="App.toggleJamRole(\'' + r + '\')">' + ROLE_LABEL[r] + '</button>';
  });
  h += '</div>';
  if (!roles.length) {
    view.innerHTML = h + '<div class="empty"><span class="big">🤝</span>Pick at least one role to compare.</div>';
    return;
  }

  // --- overlap stats ---
  const skills = Array.from(byId.values());
  h += '<div class="card"><h3 style="margin-top:0">Overlap</h3>';
  roles.forEach(r => {
    const youN = skills.filter(s => rank(getLevel(s.id, r, 'you')) >= rank('drilling')).length;
    const pN = skills.filter(s => rank(getLevel(s.id, r, 'partner')) >= rank('drilling')).length;
    const both = skills.filter(s => rank(getLevel(s.id, r, 'you')) >= rank('drilling') && rank(getLevel(s.id, r, 'partner')) >= rank('drilling')).length;
    h += '<div class="row space-between"><span><strong>' + ROLE_LABEL[r] + '</strong></span>' +
      '<span class="small">you ' + youN + ' · partner ' + pN + ' · <span class="pill green">both ' + both + '</span></span></div>';
  });
  h += '<p class="hint">Set partner levels in 📚 Library → Partner tab (or tap a skill above via Library).</p></div>';

  // --- flows you can both do ---
  const doable = [], oneAway = [];
  allFlows().forEach(f => {
    if (f.steps.length < 2) return;
    const links = flowLinks(f);
    if (links.some(l => !l.tid)) return; // unknown link = can't confirm
    const skillIds = f.steps.concat(links.map(l => l.tid));
    const blockers = skillIds.filter(id =>
      !(atLeast(id, roles, 'drilling', 'you') && atLeast(id, roles, 'drilling', 'partner')));
    const uniq = Array.from(new Set(blockers));
    if (!uniq.length) doable.push(f);
    else if (uniq.length === 1) oneAway.push({ f, id: uniq[0] });
  });

  h += '<h2>✅ You can both do</h2>';
  if (!doable.length) h += '<div class="empty"><span class="big">🤸</span>No shared flows yet.<br>Build overlap by drilling shared basics.</div>';
  doable.forEach(f => {
    h += '<a class="skill-item" href="#/flow/' + f.id + '"><div class="skill-top"><span class="skill-name">' + esc(f.name) + '</span>' +
      (f.washingMachine ? '<span class="pill green">🌀</span>' : '') + '</div>' +
      '<div class="skill-meta">' + f.steps.length + ' poses, every link drilling+ for both of you</div></a>';
  });

  h += '<h2>🔑 One skill away</h2>';
  if (!oneAway.length) h += '<p class="muted">No flows are exactly one skill away right now.</p>';
  oneAway.forEach(({ f, id }) => {
    const youNeed = !atLeast(id, roles, 'drilling', 'you');
    const pNeed = !atLeast(id, roles, 'drilling', 'partner');
    const who = youNeed && pNeed ? 'both of you need' : (youNeed ? 'you need' : 'your partner needs');
    h += '<a class="skill-item" href="#/skill/' + id + '"><div class="skill-top"><span class="skill-name">' + esc(f.name) + '</span></div>' +
      '<div class="skill-meta">unlock it: ' + who + ' <strong>' + esc(skillName(id)) + '</strong> to drilling</div></a>';
  });

  view.innerHTML = h;
}

/* ---------------- Practice log ---------------- */
let logConfidence = 3;

function localToday() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function renderLog(view) {
  const logs = state.practiceLogs.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.id > a.id ? 1 : -1));
  const touched = new Set();
  logs.forEach(l => (l.skills || []).forEach(s => touched.add(s)));
  const avg = logs.length ? (logs.reduce((s, l) => s + (l.confidence || 0), 0) / logs.length) : 0;

  let h = '<h1>Practice log</h1>';
  h += '<div class="row wrap"><span class="pill">' + logs.length + ' sessions</span>' +
    '<span class="pill">' + touched.size + ' skills touched</span>' +
    (logs.length ? '<span class="pill green">avg confidence ' + avg.toFixed(1) + '/5</span>' : '') + '</div>';

  // --- add form ---
  h += '<div class="card"><h3 style="margin-top:0">Log a session</h3>';
  h += '<label class="field" for="log-date">Date</label><input type="date" id="log-date" value="' + localToday() + '">';
  h += '<label class="field" for="log-partner">Partner</label><input type="text" id="log-partner" placeholder="Who did you jam with?" maxlength="60">';
  h += '<label class="field" for="log-role">Your role</label><select id="log-role">' +
    ROLES.map(r => '<option value="' + r + '">' + ROLE_LABEL[r] + '</option>').join('') + '</select>';
  h += '<div class="role-label">Confidence</div><div class="segmented" id="log-conf">' +
    [1, 2, 3, 4, 5].map(n => '<button type="button" class="' + (n === logConfidence ? 'on' : '') + '" onclick="App.setConfidence(' + n + ')">' + n + '</button>').join('') + '</div>';

  h += '<div class="role-label">Skills drilled</div>';
  h += '<div class="check-grid">';
  window.SEED.poses.forEach(p => {
    h += '<label class="check"><input type="checkbox" name="log-skill" value="' + p.id + '"> ' + esc(p.name) + '</label>';
  });
  h += '</div><div class="check-grid">';
  window.SEED.transitions.forEach(t => {
    h += '<label class="check"><input type="checkbox" name="log-skill" value="' + t.id + '"> ' + esc(t.name) + '</label>';
  });
  h += '</div>';
  h += '<label class="field" for="log-notes">Notes</label><textarea id="log-notes" placeholder="What worked? What needs work?"></textarea>';
  h += '<div style="margin-top:10px"><button type="button" class="btn" onclick="App.saveLog()">Save session</button></div></div>';

  // --- history ---
  h += '<h2>History</h2>';
  if (!logs.length) h += '<div class="empty"><span class="big">📝</span>No sessions yet.<br>Log your first jam above.</div>';
  logs.forEach(l => {
    h += '<div class="card"><div class="row space-between"><strong>' + esc(l.date || '') + '</strong>' +
      '<button type="button" class="btn ghost small-btn" onclick="App.deleteLog(\'' + l.id + '\')">Delete</button></div>';
    h += '<div class="small muted">' + (l.partner ? esc(l.partner) + ' · ' : '') + ROLE_LABEL[l.role] + (l.confidence ? ' · confidence ' + l.confidence + '/5' : '') + '</div>';
    if (l.skills && l.skills.length) {
      h += '<div style="margin-top:6px">' + l.skills.map(id => '<span class="pill grey">' + esc(skillName(id)) + '</span>').join('') + '</div>';
    }
    if (l.notes) h += '<p class="small">' + esc(l.notes) + '</p>';
    h += '</div>';
  });
  view.innerHTML = h;
}

/* ---------------- Data & settings ---------------- */
function renderData(view) {
  const s = state.settings;
  let h = '<h1>Data & settings</h1>';

  h += '<div class="card"><h3 style="margin-top:0">Profile</h3>';
  h += '<label class="field" for="set-name">Your name</label>';
  h += '<input type="text" id="set-name" value="' + esc(s.name) + '" placeholder="e.g. Alex" maxlength="40">';
  h += '<div class="role-label">Primary roles (used by Discover & Jam)</div><div class="check-grid">';
  ROLES.forEach(r => {
    const on = (s.primaryRoles || []).includes(r);
    h += '<label class="check' + (on ? ' on' : '') + '"><input type="checkbox" name="set-role" value="' + r + '"' + (on ? ' checked' : '') + '> ' + ROLE_LABEL[r] + '</label>';
  });
  h += '</div><div style="margin-top:10px"><button type="button" class="btn" onclick="App.saveSettings()">Save settings</button></div></div>';

  // Cloud sync card — present only when supabase-adapter.js is loaded.
  if (window.AcFlowsync) h += window.AcFlowsync.syncCardHTML();

  h += '<div class="card"><h3 style="margin-top:0">Backup</h3>';
  h += '<p class="muted small">Your data lives in this browser (localStorage). Export a backup before switching devices.</p>';
  h += '<div class="row wrap"><button type="button" class="btn secondary" onclick="App.exportData()">⬇ Export JSON</button>';
  h += '<button type="button" class="btn secondary" onclick="document.getElementById(\'import-file\').click()">⬆ Import JSON</button></div>';
  h += '<input type="file" id="import-file" accept="application/json,.json" style="display:none" onchange="App.importData(this)"></div>';

  h += '<div class="card"><h3 style="margin-top:0">Danger zone</h3>';
  h += '<button type="button" class="btn danger" onclick="App.resetAll()">Reset all data</button>';
  h += '<p class="hint">Clears progress, logs, flows and settings on this device. The seed library is rebuilt automatically.</p></div>';

  h += '<div class="card"><h3 style="margin-top:0">About</h3>';
  h += '<p class="small muted">AcroFlow v' + APP_VERSION + ' · seed library v' + esc(window.SEED.version) +
    ' · ' + window.SEED.poses.length + ' poses · ' + window.SEED.transitions.length + ' transitions · ' +
    window.SEED.flows.filter(f => f.washingMachine).length + ' washing machines.<br>' +
    'Storage: ' + esc(DB.name) + ' (offline-first).</p>' +
    '<p class="small muted">' + (window.AcFlowsync ? esc(window.AcFlowsync.statusShort()) : 'Cloud sync: see README.') + '</p></div>';

  view.innerHTML = h;
}

/* ---------------- App actions (wired from inline onclick handlers) ---------------- */
window.App = {
  /* navigation re-render */
  rerender() { render(); },

  /* cloud-sync hooks — the sync actions themselves are attached by
   * supabase-adapter.js when it loads; these two are adapter-agnostic. */
  applySyncedState(merged) { state = merged; render(); },
  notify(m) { toast(m); },

  /* library */
  libSearch(v) { libQuery = v; updateLibraryList(); },
  libType(v) { libType = v; render(); },
  libDiff(v) { libDiff = v; render(); },
  libLevel(v) { libLevel = v; render(); },
  setProfile(p, stay) {
    libProfile = p;
    render();
    if (stay) window.scrollTo(0, 0);
  },

  /* skill detail */
  setLevel(skillId, role, level, profile) {
    setLevel(skillId, role, level, profile || 'you');
    render(); // refresh dots/steppers
  },

  /* builder */
  builderSearch(v) {
    builderQuery = v;
    // re-render only the pose chips, keep the draft + name input intact
    const q = v.trim().toLowerCase();
    const poses = window.SEED.poses
      .filter(p => !q || (p.name + ' ' + (p.aliases || []).join(' ')).toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    const el = document.getElementById('pose-pick');
    if (el) el.innerHTML = poses.map(p =>
      '<button type="button" class="chip pose-pick" onclick="App.addPose(\'' + p.id + '\')">' + esc(p.name) + '</button>').join('');
  },
  addPose(id) {
    draftSteps.push(id);
    const el = document.getElementById('draft-seq');
    if (el) el.innerHTML = draftSeqHTML();
    const btn = document.querySelector('#view .btn:not(.ghost)');
    if (btn) btn.disabled = draftSteps.length < 2;
  },
  removeStep(i) {
    draftSteps.splice(i, 1);
    render();
  },
  clearDraft() { draftSteps = []; render(); },
  saveFlow() {
    const nameEl = document.getElementById('flow-name');
    const name = (nameEl.value || '').trim();
    if (draftSteps.length < 2) { toast('Add at least 2 poses first.'); return; }
    if (!name) { toast('Give your flow a name first.'); nameEl.focus(); return; }
    const tids = [];
    for (let i = 0; i + 1 < draftSteps.length; i++) {
      tids.push(pairToTrans.get(draftSteps[i] + '→' + draftSteps[i + 1]) || null);
    }
    const flow = {
      id: 'u_' + Date.now().toString(36),
      name,
      steps: draftSteps.slice(),
      transitions: tids,
      washingMachine: draftSteps.length > 1 && draftSteps[0] === draftSteps[draftSteps.length - 1],
      origin: 'user',
      note: '',
      tutorials: []
    };
    state.flows.push(flow);
    persist();
    draftSteps = [];
    toast(flow.washingMachine ? '🌀 Saved as a washing machine!' : 'Flow saved!');
    location.hash = '#/flow/' + flow.id;
  },
  deleteFlow(id) {
    if (!confirm('Delete this flow?')) return;
    state.flows = state.flows.filter(f => f.id !== id);
    persist();
    location.hash = '#/builder';
  },

  /* jam */
  toggleJamRole(r) {
    if (jamRoles.includes(r)) {
      if (jamRoles.length > 1) jamRoles = jamRoles.filter(x => x !== r);
    } else jamRoles.push(r);
    render();
  },

  /* log */
  setConfidence(n) {
    logConfidence = n;
    document.querySelectorAll('#log-conf button').forEach((b, i) => b.classList.toggle('on', i + 1 === n));
  },
  saveLog() {
    const date = document.getElementById('log-date').value || localToday();
    const partner = document.getElementById('log-partner').value.trim();
    const role = document.getElementById('log-role').value;
    const notes = document.getElementById('log-notes').value.trim();
    const skills = Array.from(document.querySelectorAll('input[name="log-skill"]:checked')).map(c => c.value);
    state.practiceLogs.push({
      id: 'l_' + Date.now().toString(36),
      date, partner, role, skills,
      confidence: logConfidence, notes
    });
    persist();
    logConfidence = 3;
    toast('Session logged! 🎉');
    render();
  },
  deleteLog(id) {
    if (!confirm('Delete this session?')) return;
    state.practiceLogs = state.practiceLogs.filter(l => l.id !== id);
    persist();
    render();
  },

  /* data */
  saveSettings() {
    const name = document.getElementById('set-name').value.trim();
    const roles = Array.from(document.querySelectorAll('input[name="set-role"]:checked')).map(c => c.value);
    if (!roles.length) { toast('Pick at least one primary role.'); return; }
    state.settings.name = name;
    state.settings.primaryRoles = roles;
    persist();
    toast('Settings saved.');
    render();
  },
  exportData() {
    const blob = new Blob([DB.exportJSON(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'acroflow-backup-' + localToday() + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Backup downloaded.');
  },
  importData(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = DB.importJSON(reader.result);
        data.version = window.SEED.version;
        state = data;
        persist();
        toast('Backup imported!');
        render();
      } catch (err) {
        toast('Import failed: ' + err.message);
      }
      input.value = '';
    };
    reader.readAsText(file);
  },
  async resetAll() {
    if (!confirm('Delete ALL AcroFlow data on this device (progress, logs, flows, settings)?')) return;
    await DB.clear();
    location.reload();
  }
};

/* ---------------- init ---------------- */
async function init() {
  // Optional Supabase adapter (supabase-adapter.js, loaded after this file):
  // when the user has configured a project URL + key in the Data tab,
  // pickAdapter() returns the cloud adapter. Otherwise DB stays LocalAdapter
  // and the app behaves exactly as before (offline-first localStorage).
  if (window.AcFlowsync && typeof window.AcFlowsync.pickAdapter === 'function') {
    const alt = window.AcFlowsync.pickAdapter(LocalAdapter);
    if (alt) DB = alt;
  }
  const stored = await DB.load();
  if (stored) {
    // Merge over a fresh state so new fields always exist; seed version wins.
    state = Object.assign(freshState(), stored);
    state.version = window.SEED.version;
    if (!Array.isArray(state.flows)) state.flows = [];
    if (!Array.isArray(state.practiceLogs)) state.practiceLogs = [];
  }
  window.addEventListener('hashchange', render);
  render();
}

init();
