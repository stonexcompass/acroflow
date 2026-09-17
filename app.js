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
    // Backfill flow training/goal lists for exports from older versions.
    if (!Array.isArray(data.settings.trainingFlowIds)) data.settings.trainingFlowIds = [];
    if (!Array.isArray(data.settings.goalFlowIds)) data.settings.goalFlowIds = [];
    return data;
  }
};

/* Swap this one line for a Supabase adapter later — same signatures. */
let DB = LocalAdapter;

/* ---------------- state ---------------- */
function freshState() {
  return {
    version: window.SEED.version,
    settings: { name: '', primaryRoles: ['base', 'flyer'], trainingFlowIds: [], goalFlowIds: [] },
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

/* ---------------- custom poses & transitions (user-added) ---------------- */
// User-added poses/transitions live in state.settings.meta.customSkills:
// [{id, kind:'pose'|'transition', name, aliases:[], difficulty 1-5,
//   description, from?, to?, tutorials:[], origin:'user'}]
// Zero SQL, zero adapter changes: settings.meta already round-trips opaquely
// through profiles.meta, and change detection picks up edits automatically.
// Seed data is never mutated — customs are layered on top at registration.
const registeredCustomIds = new Set();

function customSkills() {
  const m = state.settings.meta;
  const a = (m && typeof m === 'object' && !Array.isArray(m)) ? m.customSkills : null;
  return Array.isArray(a) ? a.filter(x => x && typeof x === 'object' && x.id && x.kind) : [];
}

/** Every pose: seed + user-added. */
function allPoses() {
  return window.SEED.poses.concat(customSkills().filter(s => s.kind === 'pose'));
}
/** Every transition: seed + user-added. */
function allTransitions() {
  return window.SEED.transitions.concat(customSkills().filter(s => s.kind === 'transition'));
}

function rand4() {
  return Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
}

/** 'u-p-<slug>-<rand4>' / 'u-t-<slug>-<rand4>'; rand regenerated on collision. */
function customSkillId(kind, name) {
  let id, guard = 0;
  do {
    id = 'u-' + kind[0] + '-' + slugify(name) + '-' + rand4();
    guard++;
  } while (byId.has(id) && guard < 20);
  return id;
}

function ensureMeta() {
  let m = state.settings.meta;
  if (!m || typeof m !== 'object' || Array.isArray(m)) m = state.settings.meta = {};
  return m;
}

/** Rebuild byId/pairToTrans from seed + customSkills. Idempotent. */
function registerCustomSkills() {
  registeredCustomIds.forEach(id => {
    byId.delete(id);
    Array.from(pairToTrans.keys()).forEach(k => { if (pairToTrans.get(k) === id) pairToTrans.delete(k); });
  });
  registeredCustomIds.clear();
  customSkills().forEach(s => {
    if (byId.has(s.id)) return;
    byId.set(s.id, Object.assign({ origin: 'user' }, s));
    registeredCustomIds.add(s.id);
    if (s.kind === 'transition' && s.from && s.to) {
      pairToTrans.set(s.from + '→' + s.to, s.id);
    }
  });
}

/** Push a new custom skill into storage and the registry. */
function addCustomSkill(skill) {
  const m = ensureMeta();
  if (!Array.isArray(m.customSkills)) m.customSkills = [];
  m.customSkills.push(skill);
  registerCustomSkills();
  persist();
}

/* ---------------- arrow-forgiving text ---------------- */
// Transition names display with → (painful to type on mobile). normArrow
// canonicalizes '→', '>' and ' to ' so search and parsing accept any of them.

/** Lowercase; '→'/'>' become ' to '; whitespace collapsed. */
function normArrow(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/[→>]/g, ' to ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve typed pose text against pose names + aliases (case-insensitive). */
function resolvePoseName(txt) {
  const nt = normArrow(txt);
  if (!nt) return null;
  const poses = allPoses();
  for (const p of poses) { if (normArrow(p.name) === nt) return p.id; }
  for (const p of poses) {
    if ((p.aliases || []).some(a => normArrow(a) === nt)) return p.id;
  }
  return null;
}

/**
 * Parse "Bird to Throne" / "Bird > Throne" / "Bird → Throne".
 * Splits on the LAST separator, so "Foot to Hand to Bird" resolves
 * from="Foot to Hand", to="Bird". Returns {from, to} pose ids or {error}.
 */
function parseTransitionInput(text) {
  const t = (text || '').trim();
  if (!t) return { error: 'Type a transition like "Bird to Throne".' };
  let idx = -1, len = 0, sep = '';
  const ia = t.lastIndexOf('→');
  if (ia > idx) { idx = ia; len = 1; sep = '→'; }
  const ig = t.lastIndexOf('>');
  if (ig > idx) { idx = ig; len = 1; sep = '>'; }
  const re = /\s+to\s+/gi;
  let m, lastTo = -1, lastToLen = 0;
  while ((m = re.exec(t)) !== null) { lastTo = m.index; lastToLen = m[0].length; }
  if (lastTo > idx) { idx = lastTo; len = lastToLen; sep = 'to'; }
  if (idx < 0) return { error: 'Put "to", ">" or "→" between two poses, e.g. "Bird to Throne".' };
  const fromTxt = t.slice(0, idx).trim();
  const toTxt = t.slice(idx + len).trim();
  if (!fromTxt) return { error: 'Missing the starting pose before "' + sep + '".' };
  if (!toTxt) return { error: 'Missing the ending pose after "' + sep + '".' };
  const fromId = resolvePoseName(fromTxt);
  if (!fromId) return { error: 'Couldn\'t find a pose called "' + fromTxt + '".' };
  const toId = resolvePoseName(toTxt);
  if (!toId) return { error: 'Couldn\'t find a pose called "' + toTxt + '".' };
  return { from: fromId, to: toId };
}

/** YouTube search URL for finding a tutorial; includes the typed name when present. */
function skillYtSearchUrl(name) {
  const q = (((name || '').trim() ? (name || '').trim() + ' ' : '') + 'acro yoga tutorial').trim();
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
}

/**
 * Attach a tutorial from an optional YouTube URL. Never blocks the save:
 * a bad URL or offline lookup just yields no tutorial.
 */
async function attachTutorial(url, fallbackName) {
  const u = (url || '').trim();
  const vid = parseYouTubeId(u);
  if (!vid) return [];
  let meta = null;
  try { meta = await oembedLookup(u); } catch (e) { meta = null; }
  return [{
    title: (meta && meta.title) || fallbackName || 'YouTube tutorial',
    url: u, videoId: vid, creator: (meta && meta.author_name) || 'YouTube'
  }];
}

function skillName(id) {
  const s = byId.get(id);
  if (s) return s.name;
  const f = getFlow(id); // practice logs can reference flows too
  return f ? f.name : id;
}

function allFlows() {
  return window.SEED.flows.concat(state.flows);
}

/* ---------------- Log tab type-ahead helpers (pure; see validate-logskills.cjs) ---------------- */

/** 'pose'|'transition'|'flow'|'wm'|null for any loggable element id. */
function skillKind(id) {
  const s = byId.get(id);
  if (s) return s.kind; // 'pose' | 'transition'
  const f = getFlow(id);
  if (f) return f.washingMachine ? 'wm' : 'flow';
  return null;
}

function skillKindLabel(kind) {
  if (kind === 'pose') return 'Pose';
  if (kind === 'transition') return 'Transition';
  if (kind === 'wm') return '🌀 washing machine';
  if (kind === 'flow') return 'Flow';
  return 'Skill';
}

/** Search corpus for the log type-ahead: every pose, transition, flow, washing machine (incl. user-added). */
function logSkillCorpus() {
  const out = [];
  allPoses().forEach(p => out.push({ id: p.id, name: p.name, kind: 'pose' }));
  allTransitions().forEach(t => out.push({ id: t.id, name: t.name, kind: 'transition' }));
  allFlows().forEach(f => out.push({ id: f.id, name: f.name, kind: f.washingMachine ? 'wm' : 'flow' }));
  return out;
}

/**
 * Case-insensitive substring search; starts-with matches rank first, then
 * alphabetical. Capped at 8. Arrow-forgiving: "bird to throne" matches
 * "Bird → Throne" via normArrow as well as the raw name.
 */
function logSkillSearch(q) {
  q = (q || '').trim().toLowerCase();
  if (!q) return [];
  const nq = normArrow(q);
  const starts = [], contains = [];
  logSkillCorpus().forEach(e => {
    const n = (e.name || '').toLowerCase();
    const nn = normArrow(e.name || '');
    const isStart = n.indexOf(q) === 0 || nn.indexOf(nq) === 0;
    const isHit = isStart || n.indexOf(q) !== -1 || nn.indexOf(nq) !== -1;
    if (isStart) starts.push(e);
    else if (isHit) contains.push(e);
  });
  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  starts.sort(byName); contains.sort(byName);
  return starts.concat(contains).slice(0, 8);
}

/** Deduplicated add / removal for the module-level logSelected id array. */
function logSelectedAdd(arr, id) {
  if (id && arr.indexOf(id) === -1) arr.push(id);
  return arr;
}
function logSelectedRemove(arr, id) {
  return arr.filter(x => x !== id);
}

/** Removable chip HTML for one selected element. */
function logSkillChipHtml(id) {
  const label = skillKindLabel(skillKind(id));
  return '<span class="chip log-chip"><span class="log-chip-name">' + esc(skillName(id)) + '</span>' +
    '<span class="kind">' + esc(label) + '</span>' +
    '<button type="button" class="chip-x" aria-label="Remove ' + esc(skillName(id)) + '" ' +
    'onclick="App.logSkillRemove(\'' + id + '\')">✕</button></span>';
}

/** One suggestion row in the type-ahead dropdown. */
function logSkillSuggestionHtml(e) {
  return '<button type="button" class="combo-item" onclick="App.logSkillAdd(\'' + e.id + '\')">' +
    '<span>' + esc(e.name) + '</span><span class="kind">' + esc(skillKindLabel(e.kind)) + '</span></button>';
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

/* ---------------- flow training & goal helpers ---------------- */

/** Unique component skill ids of a flow: poses + known transitions. */
function flowComponents(flow) {
  const poses = [], transitions = [];
  const seen = new Set();
  flow.steps.forEach(id => { if (!seen.has('p' + id)) { seen.add('p' + id); poses.push(id); } });
  flowLinks(flow).forEach(l => {
    if (l.tid && !seen.has('t' + l.tid)) { seen.add('t' + l.tid); transitions.push(l.tid); }
  });
  return { poses, transitions };
}

/** Difficulty of a flow: hardest known component; 3 when nothing is known. */
function flowDifficulty(flow) {
  const { poses, transitions } = flowComponents(flow);
  let max = 0;
  poses.concat(transitions).forEach(id => {
    const s = byId.get(id);
    if (s && s.difficulty > max) max = s.difficulty;
  });
  return max || 3;
}

/** True when the flow's sequence comes from a trusted written source. */
function flowVerified(flow) {
  return flow.steps.length > 0 && !(flow.note || '').toLowerCase().includes('unverified');
}

function isTraining(flowId) {
  return state.settings.trainingFlowIds.includes(flowId);
}

function isGoal(flowId) {
  return state.settings.goalFlowIds.includes(flowId);
}

/** Remove dangling references (deleted flows) and keep goal ⊆ training. */
function pruneFlowLists() {
  const ok = id => !!getFlow(id);
  state.settings.trainingFlowIds = state.settings.trainingFlowIds.filter(ok);
  state.settings.goalFlowIds = state.settings.goalFlowIds.filter(id => ok(id) && isTraining(id));
}

/** Fraction (0..1) of a flow's unique components at/above min for roles/profile. */
function flowReadiness(flow, roles, min, profile) {
  const { poses, transitions } = flowComponents(flow);
  const comps = poses.concat(transitions);
  if (!comps.length) return null; // sequence unknown — can't measure
  const ready = comps.filter(id => atLeast(id, roles, min, profile || 'you')).length;
  return { pct: ready / comps.length, ready, total: comps.length };
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

function ytThumb(t) {
  // YouTube thumbnail for a tutorial entry; null for non-YouTube links.
  return (t && t.videoId) ? 'https://i.ytimg.com/vi/' + t.videoId + '/hqdefault.jpg' : null;
}

function skillThumb(s) {
  // First YouTube tutorial on the skill, for list rows.
  const t = (s.tutorials || []).find(x => x.videoId);
  return t ? ytThumb(t) : null;
}

/** True when a flow is an unfinished draft (added from a video, steps not mapped yet). */
function isDraftFlow(f) {
  return !!f && !!f.incomplete;
}

/**
 * Extract an 11-char YouTube video id from common URL shapes:
 * youtube.com/watch?v=…, youtu.be/…, youtube.com/shorts/…, /embed/…, /live/…
 * Returns null for anything else.
 */
function parseYouTubeId(url) {
  const u = (url || '').trim();
  const m = u.match(/(?:youtube\.com\/(?:watch\?[^#\s]*v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return m ? m[1] : null;
}

function slugify(s) {
  return ((s || 'flow').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)) || 'flow';
}

/**
 * YouTube oEmbed lookup for a video page URL → {title, author_name} or null.
 * Never throws and never blocks: resolves null when fetch is unavailable,
 * the request fails, or it takes longer than ~6s (offline).
 */
function oembedLookup(pageUrl) {
  return new Promise((resolve) => {
    if (typeof fetch !== 'function') { resolve(null); return; }
    let done = false;
    const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => finish(null), 6000);
    fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(pageUrl) + '&format=json')
      .then(r => (r && r.ok) ? r.json() : null)
      .then(j => finish(j && j.title ? j : null))
      .catch(() => finish(null));
  });
}

function tutorialList(tuts) {
  if (!tuts || !tuts.length) return '<p class="muted">No tutorials linked yet — ask your community for a good one.</p>';
  let h = '';
  tuts.forEach(t => {
    const thumb = ytThumb(t);
    h += '<a class="tut' + (thumb ? ' has-thumb' : '') + '" href="' + esc(t.url) + '" target="_blank" rel="noopener">' +
      (thumb ? '<img class="tut-thumb" src="' + esc(thumb) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
      '<div class="tut-body"><div class="tut-title">▶ ' + esc(t.title) + '</div>' +
      (t.creator ? '<div class="tut-creator">' + esc(t.creator) + '</div>' : '') + '</div></a>';
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
  library: 'Skill library', discover: 'Practice',
  builder: 'Flow builder', jam: 'Jam with a partner',
  log: 'Practice log', data: 'Data & settings'
};

function currentRoute() {
  const h = location.hash || '#/discover';
  const mSkill = h.match(/^#\/skill\/([A-Za-z0-9_-]+)$/);
  if (mSkill) return { name: 'skill', id: mSkill[1] };
  const mFlow = h.match(/^#\/flow\/([A-Za-z0-9_-]+)$/);
  if (mFlow) return { name: 'flow', id: mFlow[1] };
  const name = (h.match(/^#\/(\w+)/) || [])[1];
  return { name: ['library', 'discover', 'builder', 'jam', 'log', 'data'].includes(name) ? name : 'library' };
}

function render() {
  flushNotes(); // never lose a note being typed when the view re-renders
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
let ytFormOpen = false; // "add flow from YouTube" form visibility

function libFiltered() {
  const q = libQuery.trim().toLowerCase();
  const roles = state.settings.primaryRoles.length ? state.settings.primaryRoles : ROLES;
  return Array.from(byId.values()).filter(s => {
    if (libType !== 'all' && s.kind !== libType) return false;
    if (libDiff && s.difficulty !== libDiff) return false;
    if (q) {
      const hay = (s.name + ' ' + (s.aliases || []).join(' ')).toLowerCase();
      // arrow-forgiving: "bird to throne" / "bird > throne" match "Bird → Throne"
      if (!hay.includes(q) && !normArrow(hay).includes(normArrow(q))) return false;
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
  h += '<div class="toolbar"><input type="search" id="lib-q" placeholder="Search poses, transitions & flows…" value="' + esc(libQuery) + '" oninput="App.libSearch(this.value)" aria-label="Search library"></div>';
  h += '<div class="chip-row" role="group" aria-label="Type filter">' +
    chip('all', libType, 'All') + chip('pose', libType, 'Poses') + chip('transition', libType, 'Transitions') + chip('flow', libType, '🌀 Flows') + '</div>';
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
  if (libType === 'flow') { updateFlowList(el); return; }
  const roles = state.settings.primaryRoles.length ? state.settings.primaryRoles : ROLES;
  const items = libFiltered();
  let h = '<div class="row wrap" style="margin-bottom:6px">';
  if (libType === 'pose' || libType === 'all') h += '<button type="button" class="btn small" onclick="App.togglePoseForm()">＋ Add pose</button>';
  if (libType === 'transition' || libType === 'all') h += '<button type="button" class="btn small" onclick="App.toggleTransForm()">＋ Add transition</button>';
  h += '</div>';
  if (poseFormOpen) h += poseFormHtml();
  if (transFormOpen) h += transFormHtml();
  if (!items.length) {
    el.innerHTML = h + '<div class="empty"><span class="big">🔍</span>No skills match those filters.<br>Try clearing the search.</div>';
    return;
  }
  h += '<p class="muted small">' + items.length + ' skill' + (items.length === 1 ? '' : 's') + '</p>';
  items.forEach(s => {
    const th = skillThumb(s);
    h += '<a class="skill-item' + (th ? ' has-thumb' : '') + '" href="#/skill/' + s.id + '">' +
      (th ? '<img class="skill-thumb" src="' + esc(th) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">' : '') +
      '<div class="skill-main"><div class="skill-top"><span class="skill-kind' + (s.kind === 'transition' ? ' transition' : '') + '">' + (s.kind === 'pose' ? 'Pose' : 'Transition') + '</span>' +
      '<span class="skill-name">' + esc(s.name) + '</span>' + noteMark(noteKey(s.kind, s.id)) + roleDots(s.id, roles, libProfile) + '</div>' +
      '<div class="skill-meta">' + diffPips(s.difficulty) +
      (s.kind === 'transition' ? ' &nbsp;' + esc(skillName(s.from)) + ' → ' + esc(skillName(s.to)) : '') + '</div></div></a>';
  });
  el.innerHTML = h;
}

/* ---------------- Flow library cards (flows as first-class citizens) ---------------- */

function libFlows() {
  const q = libQuery.trim().toLowerCase();
  const roles = state.settings.primaryRoles.length ? state.settings.primaryRoles : ROLES;
  return allFlows().filter(f => {
    if (libDiff && flowDifficulty(f) !== libDiff) return false;
    if (q && !(f.name.toLowerCase().includes(q) || (f.note || '').toLowerCase().includes(q))) return false;
    if (libLevel !== 'all') {
      // "overall" = weakest primary role on the flow itself
      const worst = Math.min.apply(null, roles.map(r => rank(getLevel(f.id, r, libProfile))));
      if (LEVELS[worst] !== libLevel) return false;
    }
    return true;
  }).sort((a, b) =>
    (isGoal(b.id) - isGoal(a.id)) || (isTraining(b.id) - isTraining(a.id)) ||
    (flowDifficulty(b) - flowDifficulty(a)) || a.name.localeCompare(b.name));
}

function flowCard(f, roles) {
  const th = skillThumb(f); // flows reuse the first tutorial thumbnail
  const goal = isGoal(f.id), tr = isTraining(f.id);
  const draft = isDraftFlow(f);
  let h = '<div class="skill-item flow-card' + (th ? ' has-thumb' : '') + (draft ? ' incomplete' : '') + '">' +
    (th ? '<a href="#/flow/' + f.id + '"><img class="skill-thumb" src="' + esc(th) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'"></a>' : '') +
    '<div class="skill-main"><div class="skill-top">' +
    '<a class="skill-name" href="#/flow/' + f.id + '">' + esc(f.name) + '</a>' + noteMark(noteKey('flow', f.id)) + roleDots(f.id, roles, libProfile) + '</div>' +
    '<div class="skill-meta">' +
    (f.washingMachine ? '🌀 washing machine · ' : 'flow · ') +
    (draft ? '<span class="pill amber">🧩 Needs steps</span> ' :
      (f.steps.length ? f.steps.length + ' poses · ' : 'sequence not recorded · ')) +
    (goal ? '⭐ goal · ' : '') + (tr ? '✓ in training' : 'not in training') +
    ((flowVerified(f) || draft) ? '' : ' · <span class="muted">unverified</span>') +
    '</div>' +
    (draft ? '<button type="button" class="btn small" style="margin-top:8px" onclick="App.editFlowInBuilder(\'' + f.id + '\')">🧩 Add steps in Builder</button>' : '') +
    '</div>' +
    '<div class="skill-side">' + diffPips(flowDifficulty(f)) +
    '<button type="button" class="btn small' + (tr ? ' ghost' : '') + '" onclick="App.toggleTraining(\'' + f.id + '\')">' + (tr ? '✓ Training' : '+ Training') + '</button>' +
    '<button type="button" class="icon-btn" title="' + (goal ? 'Remove goal' : 'Star as goal') + '" aria-pressed="' + goal + '" onclick="App.toggleGoal(\'' + f.id + '\')">' + (goal ? '⭐' : '☆') + '</button>' +
    '</div></div>';
  return h;
}

function ytFormHtml() {
  return '<div class="card"><h3 style="margin-top:0">📼 Add a flow from YouTube</h3>' +
    '<p class="muted small">Paste a video link (a tutorial you found, a Jacob Brown breakdown…). ' +
    'We\'ll save it as an <strong>unfinished draft</strong> — you map its steps in the Builder afterwards.</p>' +
    '<label class="field" for="yt-url">YouTube URL</label>' +
    '<input type="text" id="yt-url" inputmode="url" autocomplete="off" placeholder="https://www.youtube.com/watch?v=…">' +
    '<label class="field" for="yt-name">Name (optional — uses the video title when blank)</label>' +
    '<input type="text" id="yt-name" maxlength="60" placeholder="e.g. Reverse Star Tumbler">' +
    '<label class="check" style="margin-top:10px"><input type="checkbox" id="yt-wm" checked> Washing machine</label>' +
    '<div class="row wrap" style="margin-top:10px">' +
    '<button type="button" class="btn" onclick="App.submitYouTubeFlow()">Add flow</button>' +
    '<button type="button" class="btn ghost" onclick="App.toggleYtForm()">Cancel</button></div></div>';
}

function updateFlowList(el) {
  const roles = state.settings.primaryRoles.length ? state.settings.primaryRoles : ROLES;
  const items = libFlows();
  let h = '<div class="row wrap" style="margin-bottom:6px">' +
    '<button type="button" class="btn small" onclick="App.toggleYtForm()">＋ Add from YouTube</button></div>';
  if (ytFormOpen) h += ytFormHtml();
  if (!items.length) {
    el.innerHTML = h + '<div class="empty"><span class="big">🌀</span>No flows match those filters.<br>Try clearing the search.</div>';
    return;
  }
  h += '<p class="muted small">' + items.length + ' flow' + (items.length === 1 ? '' : 's') +
    ' · ⭐ goals and ✓ training first</p>';
  h += '<p class="hint">Tap a flow to drill its sequence. <strong>+ Training</strong> adds it to your active training set; <strong>☆</strong> stars it as a goal.</p>';
  items.forEach(f => { h += flowCard(f, roles); });
  el.innerHTML = h;
}

/* ---------------- add pose / transition forms ---------------- */
let poseFormOpen = false, transFormOpen = false;
let poseFormDiff = 3, transFormDiff = 3; // difficulty segmented state per form

function diffSegInner(cur, form) {
  let h = '';
  for (let d = 1; d <= 5; d++) {
    h += '<button type="button" class="' + (d === cur ? 'on' : '') + '" onclick="App.customSkillDiff(' + d + ',\'' + form + '\')">' + d + '</button>';
  }
  return h;
}

/** YouTube attach block shared by both add forms (curation hint included). */
function ytAttachHtml(form, name) {
  return '<label class="field" for="cs-yt-' + form + '">YouTube URL (optional)</label>' +
    '<input type="text" id="cs-yt-' + form + '" inputmode="url" autocomplete="off" placeholder="https://www.youtube.com/watch?v=…">' +
    '<div style="margin-top:6px"><a id="cs-yt-link-' + form + '" href="' + skillYtSearchUrl(name) + '" target="_blank" rel="noopener">🔍 Search YouTube for ' + (name ? '“' + esc(name) + '” tutorial' : 'a tutorial') + ' ↗</a></div>' +
    '<p class="hint">Tutorial curation: prefer a video that teaches just this skill — not one where it\'s buried in a long flow. A bad or offline URL just saves without a video; the save is never blocked.</p>';
}

function poseFormHtml() {
  return '<div class="card"><h3 style="margin-top:0">＋ Add a pose</h3>' +
    '<label class="field" for="cs-name">Name</label>' +
    '<input type="text" id="cs-name" maxlength="60" placeholder="e.g. Reverse Bird" oninput="App.customSkillName(this,\'pose\')">' +
    '<div class="role-label">Difficulty</div><div class="segmented" id="cs-diff-pose">' + diffSegInner(poseFormDiff, 'pose') + '</div>' +
    '<label class="field" for="cs-desc">Description (optional)</label>' +
    '<textarea id="cs-desc" placeholder="How to get into it, key cues…"></textarea>' +
    ytAttachHtml('pose', '') +
    '<div class="row wrap" style="margin-top:10px">' +
    '<button type="button" class="btn" onclick="App.submitCustomPose()">Add pose</button>' +
    '<button type="button" class="btn ghost" onclick="App.togglePoseForm()">Cancel</button></div></div>';
}

function transFormHtml() {
  return '<div class="card"><h3 style="margin-top:0">＋ Add a transition</h3>' +
    '<label class="field" for="cs-trans">From and to — type <strong>to</strong>, <strong>&gt;</strong> or <strong>→</strong></label>' +
    '<input type="text" id="cs-trans" maxlength="80" placeholder="e.g. Bird to Throne" autocomplete="off" oninput="App.transPreview(this.value)">' +
    '<div id="cs-trans-preview" style="margin-top:6px"></div>' +
    '<div class="role-label">Difficulty</div><div class="segmented" id="cs-diff-trans">' + diffSegInner(transFormDiff, 'trans') + '</div>' +
    ytAttachHtml('trans', '') +
    '<div class="row wrap" style="margin-top:10px">' +
    '<button type="button" class="btn" onclick="App.submitCustomTrans()">Add transition</button>' +
    '<button type="button" class="btn ghost" onclick="App.toggleTransForm()">Cancel</button></div></div>';
}

/* ---------------- element notes ---------------- */
// Poses, transitions, flows and washing machines are all "elements" here.
// Notes live in state.settings.meta.notes keyed 'pose:<id>' | 'trans:<id>' |
// 'flow:<id>' (washing machines are flows). settings.meta already round-trips
// through profiles.meta in the adapter, so notes sync with zero schema changes;
// change detection stamps settingsTs automatically on edit.
let noteTimer = null, pendingNote = null;

function noteKey(kind, id) {
  return (kind === 'transition' ? 'trans:' : kind === 'flow' ? 'flow:' : 'pose:') + id;
}
function noteMap() {
  const m = state.settings.meta;
  return (m && typeof m === 'object' && !Array.isArray(m) &&
    m.notes && typeof m.notes === 'object' && !Array.isArray(m.notes)) ? m.notes : {};
}
function getNote(key) { return noteMap()[key] || ''; }
function hasNote(key) { return !!getNote(key); }
function noteMark(key) {
  return hasNote(key) ? '<span class="note-ind" title="Has notes">📝</span>' : '';
}
function writeNote(key, text) {
  const t = (text || '').trim();
  let m = state.settings.meta;
  if (!m || typeof m !== 'object' || Array.isArray(m)) m = state.settings.meta = {};
  if (!t) {
    if (m.notes && typeof m.notes === 'object' && !Array.isArray(m.notes)) {
      delete m.notes[key];
      if (!Object.keys(m.notes).length) delete m.notes;
    }
    if (!Object.keys(m).length) delete state.settings.meta;
  } else {
    if (!m.notes || typeof m.notes !== 'object' || Array.isArray(m.notes)) m.notes = {};
    m.notes[key] = t;
  }
  persist();
}
function flushNotes() {
  if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; }
  if (pendingNote) { const p = pendingNote; pendingNote = null; writeNote(p.key, p.value); }
}
function notesSection(key) {
  return '<h2>📝 Notes</h2><div class="card">' +
    '<textarea id="note-area" data-key="' + esc(key) + '" placeholder="Cues, reminders, what to drill next…" ' +
    'oninput="App.noteInput(this)" onblur="App.noteBlur(this)">' + esc(getNote(key)) + '</textarea>' +
    '<p class="hint">Saved automatically — syncs across your devices.</p></div>';
}

/* ---------------- Skill detail ---------------- */
function renderSkillDetail(view, id) {
  const s = byId.get(id);
  if (!s) { view.innerHTML = '<a class="back" href="#/library">← Library</a><div class="empty">Unknown skill.</div>'; return; }
  const roles = state.settings.primaryRoles.length ? state.settings.primaryRoles : ROLES;

  let h = '<a class="back" href="#/library">← Library</a>';
  h += '<div class="detail-head"><span class="skill-kind' + (s.kind === 'transition' ? ' transition' : '') + '">' + (s.kind === 'pose' ? 'Pose' : 'Transition') + '</span>' +
    (s.origin === 'user' ? ' <span class="pill">yours</span>' : '');
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
  h += notesSection(noteKey(s.kind, s.id));
  if (s.origin === 'user') {
    h += '<div style="margin-top:16px"><button type="button" class="btn danger" onclick="App.deleteSkill(\'' + s.id + '\')">Delete this ' + s.kind + '</button></div>';
  }
  view.innerHTML = h;
}

function disciplineLabel(d) {
  return { lbase: 'L-base', icarian: 'Icarian', standing: 'Standing', dancelift: 'Dance lifts' }[d] || d || 'Acro';
}

/* ---------------- Discover ("What next?") ---------------- */

/** My Goals: starred flows with a readiness bar + full component checklist. */
function myGoalsHtml(roles) {
  const goals = state.settings.goalFlowIds.map(getFlow).filter(Boolean);
  let h = '<section><div class="sec-head"><h2>⭐ My goals</h2></div>';
  if (!goals.length) {
    h += '<div class="card empty">No goal flows yet.<br>Star a flow <strong>☆</strong> in the 🌀 Flows library or on its page to track it here.</div>';
  } else {
    goals.forEach(f => {
      const { poses, transitions } = flowComponents(f);
      const comps = poses.concat(transitions);
      const rd = flowReadiness(f, roles, 'drilling');
      const worst = Math.min.apply(null, roles.map(r => rank(getLevel(f.id, r, 'you'))));
      const flowSt = LEVELS[worst];
      h += '<div class="card goal-card"><div class="sec-head"><h3 style="margin:0"><a href="#/flow/' + f.id + '">' + esc(f.name) + '</a></h3>' +
        '<span class="pill' + (worst >= rank('solid') ? ' green' : '') + '">' + LEVEL_LABEL[flowSt] + '</span></div>';
      if (rd) {
        h += '<div class="bar"><span style="width:' + Math.round(rd.pct * 100) + '%"></span></div>' +
          '<div class="muted small">' + Math.round(rd.pct * 100) + '% of components at Drilling+ (' + rd.ready + '/' + rd.total + ') · flow itself: ' +
          LEVEL_LABEL[flowSt] + '</div>' +
          '<div class="checklist">';
        comps.forEach(id => {
          const s = byId.get(id);
          if (!s) return;
          const lv = Math.min.apply(null, roles.map(r => rank(getLevel(id, r, 'you'))));
          const ok = lv >= rank('drilling');
          h += '<a class="check' + (ok ? ' on' : '') + '" href="#/skill/' + id + '">' +
            '<span class="check-mark">' + (ok ? '✓' : '○') + '</span>' + esc(s.name) +
            '<span class="check-lv">' + LEVEL_LABEL[LEVELS[lv]] + '</span></a>';
        });
        h += '</div>';
      } else if (f.incomplete) {
        h += '<div class="card draft-note" style="margin:10px 0 0"><strong>🧩 Needs steps.</strong> ' +
          'Added from a video — map its sequence before tracking components here. ' +
          '<div style="margin-top:8px"><button type="button" class="btn small" onclick="App.editFlowInBuilder(\'' + f.id + '\')">🧩 Add steps in Builder</button></div></div>';
      } else {
        h += '<div class="muted small">Sequence unverified — components unknown. Learn the machine, then record its sequence in the Flow Builder to track components here.</div>';
      }
      h += '</div>';
    });
  }
  return h + '</section>';
}

/** Flows to drill: training flows whose components are mostly ready (≥70% drilling+)
 *  but the flow itself isn't solid yet. Close goal flows rank first. */
function flowsToDrillHtml(roles) {
  const rows = [];
  // Drafts (added from a video, steps not mapped) are excluded until they have
  // a real sequence — flowReadiness() would return null for them anyway.
  state.settings.trainingFlowIds.map(getFlow).filter(f => f && !f.incomplete && f.steps.length >= 2).forEach(f => {
    const solid = roles.every(r => rank(getLevel(f.id, r, 'you')) >= rank('solid'));
    if (solid) return; // already solid — nothing to drill
    const rd = flowReadiness(f, roles, 'drilling');
    if (!rd || rd.pct < 0.7) return;
    rows.push({ f, rd });
  });
  if (!rows.length) return '';
  rows.sort((a, b) => (isGoal(b.f.id) - isGoal(a.f.id)) || (b.rd.pct - a.rd.pct));
  let h = '<section><div class="sec-head"><h2>🌀 Flows to drill</h2></div>';
  h += '<div class="card"><p class="muted small" style="margin-top:0">Training flows whose parts are mostly ready (70%+ of components at Drilling+) but the flow itself isn\'t solid yet. ⭐ goals first.</p>' +
    '<div class="skill-list">';
  rows.forEach(({ f, rd }) => {
    h += '<div class="skill-item"><div class="skill-main"><a class="skill-name" href="#/flow/' + f.id + '">' + esc(f.name) + '</a>' +
      '<div class="bar"><span style="width:' + Math.round(rd.pct * 100) + '%"></span></div>' +
      '<div class="muted small">' + Math.round(rd.pct * 100) + '% of components at Drilling+ (' + rd.ready + '/' + rd.total + ')' +
      (isGoal(f.id) ? ' · ⭐ goal' : '') + '</div></div>' +
      '<div class="skill-side">' + diffPips(flowDifficulty(f)) + roleDots(f.id, roles, 'you') + '</div></div>';
  });
  return h + '</div></div></section>';
}

function renderDiscover(view) {
  const roles = state.settings.primaryRoles.length ? state.settings.primaryRoles : ROLES;
  const roleNames = roles.map(r => ROLE_LABEL[r]).join(' + ');

  let h = '<h1>Practice</h1>';
  h += '<p class="muted">Based on your <strong>' + esc(roleNames) + '</strong> progress (change primary roles in 💾 Data).</p>';

  h += myGoalsHtml(roles) + flowsToDrillHtml(roles);

  // --- Ready to learn: transitions whose endpoints are drilling+, transition not solid ---
  const ready = allTransitions().filter(t =>
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
let editingFlowId = null; // user flow id being edited in place (null = new flow)
let editingCopyOf = null; // seed flow id being copied as "my version" (null = not a copy)

function renderBuilder(view) {
  const q = builderQuery.trim().toLowerCase();
  const poses = allPoses()
    .filter(p => !q || (p.name + ' ' + (p.aliases || []).join(' ')).toLowerCase().includes(q) ||
      normArrow(p.name + ' ' + (p.aliases || []).join(' ')).includes(normArrow(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const editF = editingFlowId ? getFlow(editingFlowId) : null;
  const copyF = editingCopyOf ? getFlow(editingCopyOf) : null;
  // Editing state can go stale (flow deleted on another render) — drop it.
  if (editingFlowId && !editF) { editingFlowId = null; }
  if (editingCopyOf && !copyF) { editingCopyOf = null; }

  let h = '';
  if (editingFlowId && editF) {
    h += '<h1>Editing ' + esc(editF.name) + '</h1>';
    h += '<p class="muted">Update the steps below, then save. The flow keeps its name, tutorials, and training/goal membership. ' +
      '<button type="button" class="btn ghost small-btn" onclick="App.cancelBuilderEdit()">Cancel editing</button></p>';
  } else if (editingCopyOf && copyF) {
    h += '<h1>My version of ' + esc(copyF.name) + '</h1>';
    h += '<p class="muted">Tweak the sequence — saving creates <strong>your own copy</strong>; the built-in flow is never changed. ' +
      '<button type="button" class="btn ghost small-btn" onclick="App.cancelBuilderEdit()">Cancel</button></p>';
  } else {
    h += '<h1>Flow builder</h1>';
    h += '<p class="muted">Tap poses to append them. We\'ll resolve each link to a known transition — <strong>?</strong> means nobody has named that link yet.</p>';
  }

  // draft sequence
  h += '<div class="card"><h3 style="margin-top:0">Your sequence</h3><div id="draft-seq">';
  h += draftSeqHTML();
  h += '</div>';
  if (!(editingFlowId && editF)) {
    h += '<label class="field" for="flow-name">Flow name</label>';
    h += '<input type="text" id="flow-name" placeholder="e.g. My Sunday jam flow" maxlength="60" value="' +
      esc(editingCopyOf && copyF ? copyF.name + ' (my version)' : '') + '">';
  }
  h += '<div class="row wrap" style="margin-top:10px">';
  h += '<button type="button" class="btn" onclick="App.saveFlow()" ' + (draftSteps.length < 2 ? 'disabled' : '') + '>' +
    (editingFlowId ? 'Save steps' : (editingCopyOf ? 'Save my version' : 'Save flow')) + '</button>';
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
    const draft = isDraftFlow(f);
    h += '<a class="skill-item' + (draft ? ' incomplete' : '') + '" href="#/flow/' + f.id + '"><div class="skill-top">' +
      '<span class="skill-name">' + esc(f.name) + '</span>' +
      (draft ? '<span class="pill amber">🧩 Needs steps</span>' : '') +
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
  const goal = isGoal(f.id), tr = isTraining(f.id);
  const draft = isDraftFlow(f);
  if (draft) {
    h += '<div class="card draft-note"><strong>🧩 Needs steps.</strong> ' +
      'This was added from a video — its steps haven\'t been mapped yet. Watch the tutorial, then tap below to build the sequence pose by pose.' +
      '<div style="margin-top:10px"><button type="button" class="btn" onclick="App.editFlowInBuilder(\'' + f.id + '\')">🧩 Add steps in Builder</button></div></div>';
  }
  h += '<div class="flow-actions">' +
    '<button type="button" class="btn small' + (tr ? ' ghost' : '') + '" onclick="App.toggleTraining(\'' + f.id + '\')">' + (tr ? '✓ In your training' : '+ Add to training') + '</button>' +
    '<button type="button" class="btn small' + (goal ? ' ghost' : '') + '" onclick="App.toggleGoal(\'' + f.id + '\')">' + (goal ? '⭐ Goal' : '☆ Set as goal') + '</button>' +
    (f.washingMachine ? '<span class="pill green">🌀 washing machine</span>' : '<span class="pill grey">flow</span>') +
    '<span class="pill">' + (f.origin === 'user' ? 'created by you' : 'seed library') + '</span>' +
    (draft ? '<span class="pill amber">🧩 needs steps</span>' : (flowVerified(f) ? '' : '<span class="pill amber">sequence unverified</span>')) +
    (f.origin === 'user' && !draft ? '<button type="button" class="btn small ghost" onclick="App.editFlowInBuilder(\'' + f.id + '\')">🧩 Edit steps</button>' : '') +
    (f.origin !== 'user' ? '<button type="button" class="btn small ghost" onclick="App.copyFlowToBuilder(\'' + f.id + '\')">📋 Make my own version</button>' : '') +
    '</div>';
  if (f.note) h += '<p class="muted">' + esc(f.note) + '</p>';

  h += '<div class="card"><h3 style="margin-top:0">Your progress on this flow</h3>' +
    stepper(f.id, 'you');
  const rd = flowReadiness(f, roles, 'drilling');
  if (rd) {
    h += '<div class="bar" style="margin-top:10px"><span style="width:' + Math.round(rd.pct * 100) + '%"></span></div>' +
      '<div class="muted small">' + Math.round(rd.pct * 100) + '% of components at Drilling+ (' + rd.ready + '/' + rd.total + ') for ' +
      esc(roles.map(r => ROLE_LABEL[r]).join(' + ')) + '</div>';
  }
  h += '<p class="hint">Track the flow itself — separate from its poses and transitions. Drilling every part doesn\'t mean the whole machine flows.</p></div>';

  if (!f.steps.length) {
    if (!draft) {
      h += '<div class="empty"><span class="big">🌀</span>Sequence not recorded yet.<br>Learn it, then rebuild it in the Flow Builder to track it properly.</div>';
    }
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
  h += notesSection(noteKey('flow', f.id));
  if (f.origin === 'user') {
    h += '<button type="button" class="btn danger" onclick="App.deleteFlow(\'' + f.id + '\')">Delete this flow</button>';
  }
  view.innerHTML = '<div class="flow-detail' + (draft ? ' incomplete' : '') + '">' + h + '</div>';
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
let logSelected = []; // skill/flow ids picked in the Log tab's type-ahead

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

  h += '<div class="role-label">Skills drilled — poses, transitions & flows</div>';
  h += '<div class="combo-wrap"><div class="chip-row" id="log-chips">' +
    logSelected.map(logSkillChipHtml).join('') + '</div>';
  h += '<input type="text" id="log-skill-search" placeholder="Type to find a pose, transition, or flow…" autocomplete="off" ' +
    'oninput="App.logSkillInput(this.value)" onfocus="App.logSkillInput(this.value)" onkeydown="App.logSkillKey(event)">';
  h += '<div class="combo-list hidden" id="log-skill-list" role="listbox"></div></div>';
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

/** Navigate to a hash, re-rendering even when we're already there. */
function goHash(h) {
  if (location.hash === h) render();
  else location.hash = h;
}

window.App = {
  /* navigation re-render */
  rerender() { render(); },

  /* cloud-sync hooks — the sync actions themselves are attached by
   * supabase-adapter.js when it loads; these two are adapter-agnostic. */
  applySyncedState(merged) { state = merged; registerCustomSkills(); render(); },
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

  /* element notes */
  noteInput(el) {
    if (noteTimer) clearTimeout(noteTimer);
    pendingNote = { key: el.getAttribute('data-key'), value: el.value };
    noteTimer = setTimeout(flushNotes, 500);
  },
  noteBlur(el) {
    pendingNote = { key: el.getAttribute('data-key'), value: el.value };
    flushNotes();
  },

  /* builder */
  builderSearch(v) {
    builderQuery = v;
    // re-render only the pose chips, keep the draft + name input intact
    const q = v.trim().toLowerCase();
    const poses = allPoses()
      .filter(p => !q || (p.name + ' ' + (p.aliases || []).join(' ')).toLowerCase().includes(q) ||
        normArrow(p.name + ' ' + (p.aliases || []).join(' ')).includes(normArrow(q)))
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
  /** Load a user flow's steps into the Builder for in-place editing. */
  editFlowInBuilder(id) {
    const f = getFlow(id);
    if (!f || f.origin !== 'user') { toast('Only your own flows can be edited.'); return; }
    draftSteps = f.steps.slice();
    editingFlowId = id;
    editingCopyOf = null;
    goHash('#/builder');
    toast('Editing ' + f.name + ' — update the steps, then save.');
  },
  /** Load a seed flow's steps into the Builder; saving creates your own copy. */
  copyFlowToBuilder(id) {
    const f = getFlow(id);
    if (!f) return;
    draftSteps = f.steps.slice();
    editingFlowId = null;
    editingCopyOf = id;
    goHash('#/builder');
  },
  /** Abandon the builder edit/copy and start fresh. */
  cancelBuilderEdit() {
    draftSteps = [];
    editingFlowId = null;
    editingCopyOf = null;
    render();
  },
  saveFlow() {
    if (draftSteps.length < 2) { toast('Add at least 2 poses first.'); return; }
    const tids = [];
    for (let i = 0; i + 1 < draftSteps.length; i++) {
      tids.push(pairToTrans.get(draftSteps[i] + '→' + draftSteps[i + 1]) || null);
    }
    const isCycle = draftSteps.length > 1 && draftSteps[0] === draftSteps[draftSteps.length - 1];

    // --- in-place edit of a user flow: same id, keep name/tutorials/training/goals ---
    if (editingFlowId) {
      const f = state.flows.find(x => x.id === editingFlowId);
      if (!f) {
        toast('That flow no longer exists.');
        draftSteps = []; editingFlowId = null; editingCopyOf = null;
        render();
        return;
      }
      const wasDraft = isDraftFlow(f);
      f.steps = draftSteps.slice();
      f.transitions = tids;
      f.washingMachine = isCycle;
      if (f.steps.length >= 2) delete f.incomplete; // mapped now — no longer a draft
      persist();
      draftSteps = []; editingFlowId = null; editingCopyOf = null;
      toast(wasDraft ? '🎉 Steps mapped — no longer a draft!' : 'Steps updated ✓');
      goHash('#/flow/' + f.id);
      return;
    }

    // --- new flow: fresh builder flow, or "my version" of a seed flow ---
    const nameEl = document.getElementById('flow-name');
    const copySrc = editingCopyOf ? getFlow(editingCopyOf) : null;
    const name = ((nameEl && nameEl.value) || '').trim() ||
      (copySrc ? copySrc.name + ' (my version)' : '');
    if (!name) { toast('Give your flow a name first.'); if (nameEl && nameEl.focus) nameEl.focus(); return; }
    const flow = {
      id: 'u_' + slugify(name) + '_' + Date.now().toString(36),
      name,
      steps: draftSteps.slice(),
      transitions: tids,
      washingMachine: isCycle,
      origin: 'user',
      note: copySrc ? 'My version of "' + copySrc.name + '".' : '',
      tutorials: copySrc ? (copySrc.tutorials || []).map(t => Object.assign({}, t)) : []
    };
    state.flows.push(flow);
    if (!state.settings.trainingFlowIds.includes(flow.id)) state.settings.trainingFlowIds.push(flow.id);
    persist();
    draftSteps = []; editingFlowId = null; editingCopyOf = null;
    toast(copySrc ? '📋 Saved as your version — added to your training!'
      : (flow.washingMachine ? '🌀 Saved as a washing machine — added to your training!' : 'Flow saved — added to your training!'));
    goHash('#/flow/' + flow.id);
  },
  deleteFlow(id) {
    if (!confirm('Delete this flow?')) return;
    state.flows = state.flows.filter(f => f.id !== id);
    state.settings.trainingFlowIds = state.settings.trainingFlowIds.filter(x => x !== id);
    state.settings.goalFlowIds = state.settings.goalFlowIds.filter(x => x !== id);
    // drop its notes too
    if (state.settings.meta && state.settings.meta.notes) delete state.settings.meta.notes[noteKey('flow', id)];
    if (editingFlowId === id) { editingFlowId = null; draftSteps = []; }
    if (editingCopyOf === id) { editingCopyOf = null; draftSteps = []; }
    persist();
    location.hash = '#/builder';
  },

  /* add flow from YouTube */
  toggleYtForm() {
    ytFormOpen = !ytFormOpen;
    updateLibraryList();
  },
  async submitYouTubeFlow() {
    const urlEl = document.getElementById('yt-url');
    const nameEl = document.getElementById('yt-name');
    const wmEl = document.getElementById('yt-wm');
    const url = ((urlEl && urlEl.value) || '').trim();
    const vid = parseYouTubeId(url);
    if (!vid) {
      toast('That doesn\'t look like a YouTube link — check the URL and try again.');
      if (urlEl && urlEl.focus) urlEl.focus();
      return;
    }
    const nameOverride = ((nameEl && nameEl.value) || '').trim();
    const wm = !!(wmEl && wmEl.checked);
    toast('Looking up the video…');
    let meta = null;
    try { meta = await oembedLookup(url); } catch (e) { meta = null; } // offline → fallbacks below
    const videoTitle = (meta && meta.title) || nameOverride || 'Untitled flow';
    const flow = {
      id: 'u_' + slugify(nameOverride || (meta && meta.title) || 'flow') + '_' + Date.now().toString(36),
      name: nameOverride || (meta && meta.title) || 'Untitled flow',
      steps: [],
      transitions: [],
      washingMachine: wm,
      origin: 'user',
      note: '',
      tutorials: [{ title: videoTitle, url: url, videoId: vid, creator: (meta && meta.author_name) || 'YouTube' }],
      incomplete: true
    };
    state.flows.push(flow);
    if (!state.settings.trainingFlowIds.includes(flow.id)) state.settings.trainingFlowIds.push(flow.id);
    persist();
    ytFormOpen = false;
    toast('📼 Saved as an unfinished draft — map its steps in the Builder.');
    goHash('#/flow/' + flow.id);
  },

  /* add custom pose / transition */
  togglePoseForm() {
    poseFormOpen = !poseFormOpen;
    if (poseFormOpen) transFormOpen = false;
    updateLibraryList();
  },
  toggleTransForm() {
    transFormOpen = !transFormOpen;
    if (transFormOpen) poseFormOpen = false;
    updateLibraryList();
  },
  customSkillDiff(d, form) {
    if (form === 'pose') poseFormDiff = d; else transFormDiff = d;
    const el = document.getElementById('cs-diff-' + form);
    if (el) el.innerHTML = diffSegInner(form === 'pose' ? poseFormDiff : transFormDiff, form);
  },
  /** Keep the "Search YouTube for '<name>' tutorial" link in sync with the typed name. */
  customSkillName(el, form) {
    const name = (el.value || '').trim();
    const link = document.getElementById('cs-yt-link-' + form);
    if (link) {
      link.href = skillYtSearchUrl(name);
      link.textContent = '🔍 Search YouTube for ' + (name ? '“' + name + '” tutorial' : 'a tutorial') + ' ↗';
    }
  },
  /** Live "From → To" preview (or the error naming the bad side) under the transition input. */
  transPreview(v) {
    const box = document.getElementById('cs-trans-preview');
    const link = document.getElementById('cs-yt-link-trans');
    const r = parseTransitionInput(v);
    const name = r.error ? (v || '').trim() : skillName(r.from) + ' → ' + skillName(r.to);
    if (box) {
      box.innerHTML = r.error
        ? '<span class="pill amber">' + esc(r.error) + '</span>'
        : '<span class="pill green">✓</span> <span class="pill">' + esc(skillName(r.from)) + '</span> <span aria-hidden="true">→</span> <span class="pill">' + esc(skillName(r.to)) + '</span>';
    }
    if (link) {
      link.href = skillYtSearchUrl(name);
      link.textContent = '🔍 Search YouTube for ' + (name ? '“' + name + '” tutorial' : 'a tutorial') + ' ↗';
    }
  },
  async submitCustomPose() {
    const nameEl = document.getElementById('cs-name');
    const name = ((nameEl && nameEl.value) || '').trim();
    if (!name) { toast('Give the pose a name first.'); if (nameEl && nameEl.focus) nameEl.focus(); return; }
    const desc = ((document.getElementById('cs-desc') || {}).value || '').trim();
    const yt = ((document.getElementById('cs-yt-pose') || {}).value || '').trim();
    toast('Adding pose…');
    const tutorials = await attachTutorial(yt, name);
    const skill = {
      id: customSkillId('pose', name), kind: 'pose', name, aliases: [],
      difficulty: poseFormDiff, description: desc, tutorials, origin: 'user'
    };
    addCustomSkill(skill);
    poseFormOpen = false; poseFormDiff = 3;
    toast('Pose added ✓');
    goHash('#/skill/' + skill.id);
  },
  async submitCustomTrans() {
    const inputEl = document.getElementById('cs-trans');
    const raw = ((inputEl && inputEl.value) || '').trim();
    const r = parseTransitionInput(raw);
    if (r.error) { toast(r.error); if (inputEl && inputEl.focus) inputEl.focus(); return; }
    const existing = pairToTrans.get(r.from + '→' + r.to);
    if (existing) { toast('That transition is already in your library.'); goHash('#/skill/' + existing); return; }
    const name = skillName(r.from) + ' → ' + skillName(r.to);
    const yt = ((document.getElementById('cs-yt-trans') || {}).value || '').trim();
    toast('Adding transition…');
    const tutorials = await attachTutorial(yt, name);
    const skill = {
      id: customSkillId('transition', name), kind: 'transition', name, aliases: [],
      difficulty: transFormDiff, description: '', from: r.from, to: r.to,
      tutorials, origin: 'user'
    };
    addCustomSkill(skill);
    transFormOpen = false; transFormDiff = 3;
    toast('Transition added ✓');
    goHash('#/skill/' + skill.id);
  },
  deleteSkill(id) {
    const s = byId.get(id);
    if (!s || s.origin !== 'user') return;
    if (!confirm('Delete "' + s.name + '"? Its progress and notes go too.')) return;
    // deleting a pose also deletes its custom transitions
    const doomed = [id];
    if (s.kind === 'pose') {
      customSkills().forEach(x => {
        if (x.kind === 'transition' && (x.from === id || x.to === id)) doomed.push(x.id);
      });
    }
    const m = state.settings.meta;
    if (m && Array.isArray(m.customSkills)) {
      m.customSkills = m.customSkills.filter(x => doomed.indexOf(x.id) === -1);
    }
    registerCustomSkills();
    // drop their notes
    if (state.settings.meta && state.settings.meta.notes && typeof state.settings.meta.notes === 'object') {
      doomed.forEach(did => {
        ['pose:', 'trans:', 'flow:'].forEach(p => { delete state.settings.meta.notes[p + did]; });
      });
      if (!Object.keys(state.settings.meta.notes).length) delete state.settings.meta.notes;
    }
    // clear progress through the normal path — sync tombstones delete server rows
    doomed.forEach(did => {
      ROLES.forEach(r => { setLevel(did, r, 'unstarted', 'you'); setLevel(did, r, 'unstarted', 'partner'); });
    });
    persist();
    location.hash = '#/library';
  },

  /* flow training + goals */
  toggleTraining(flowId) {
    const arr = state.settings.trainingFlowIds;
    const i = arr.indexOf(flowId);
    if (i >= 0) {
      arr.splice(i, 1);
      // a flow that leaves training also leaves goals (goal ⊆ training)
      const g = state.settings.goalFlowIds.indexOf(flowId);
      if (g >= 0) state.settings.goalFlowIds.splice(g, 1);
      toast('Removed from your training.');
    } else {
      arr.push(flowId);
      toast('Added to your training ✓');
    }
    persist();
    render();
  },
  toggleGoal(flowId) {
    const arr = state.settings.goalFlowIds;
    const i = arr.indexOf(flowId);
    if (i >= 0) {
      arr.splice(i, 1);
      toast('Goal removed.');
    } else {
      arr.push(flowId);
      // starring a flow as a goal puts it in training too
      if (!state.settings.trainingFlowIds.includes(flowId)) state.settings.trainingFlowIds.push(flowId);
      toast('⭐ Set as a goal — added to your training.');
    }
    persist();
    render();
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
  /* log type-ahead */
  logSkillInput(q) {
    const list = document.getElementById('log-skill-list');
    if (!list) return;
    const matches = logSkillSearch(q);
    if (!matches.length) { list.classList.add('hidden'); list.innerHTML = ''; return; }
    list.innerHTML = matches.map(logSkillSuggestionHtml).join('');
    list.classList.remove('hidden');
  },
  logSkillKey(e) {
    if (e.key === 'Escape') { App.logSkillClose(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = document.getElementById('log-skill-search');
      const m = logSkillSearch(input ? input.value : '');
      if (m.length) App.logSkillAdd(m[0].id);
    }
  },
  logSkillAdd(id) {
    logSelectedAdd(logSelected, id);
    App.logSkillRefresh();
  },
  logSkillRemove(id) {
    logSelected = logSelectedRemove(logSelected, id);
    App.logSkillRefresh();
  },
  logSkillRefresh() {
    const row = document.getElementById('log-chips');
    if (row) row.innerHTML = logSelected.map(logSkillChipHtml).join('');
    const input = document.getElementById('log-skill-search');
    if (input) input.value = '';
    App.logSkillClose();
  },
  logSkillClose() {
    const list = document.getElementById('log-skill-list');
    if (list) { list.classList.add('hidden'); list.innerHTML = ''; }
  },
  saveLog() {
    const date = document.getElementById('log-date').value || localToday();
    const partner = document.getElementById('log-partner').value.trim();
    const role = document.getElementById('log-role').value;
    const notes = document.getElementById('log-notes').value.trim();
    const skills = logSelected.slice();
    state.practiceLogs.push({
      id: 'l_' + Date.now().toString(36),
      date, partner, role, skills,
      confidence: logConfidence, notes
    });
    persist();
    logConfidence = 3;
    logSelected = [];
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
        pruneFlowLists();
        registerCustomSkills();
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
    // stored.settings replaces fresh settings wholesale — backfill new arrays,
    // and drop references to flows that no longer exist.
    if (!state.settings || typeof state.settings !== 'object') state.settings = freshState().settings;
    if (!Array.isArray(state.settings.trainingFlowIds)) state.settings.trainingFlowIds = [];
    if (!Array.isArray(state.settings.goalFlowIds)) state.settings.goalFlowIds = [];
    pruneFlowLists();
    registerCustomSkills();
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('beforeunload', flushNotes);
  // Close the log type-ahead dropdown when tapping outside it.
  document.addEventListener('click', (e) => {
    const list = document.getElementById('log-skill-list');
    if (list && !list.classList.contains('hidden') && !e.target.closest('.combo-wrap')) {
      list.classList.add('hidden'); list.innerHTML = '';
    }
  });
  render();
}

init();
