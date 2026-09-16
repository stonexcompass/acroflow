/* ============================================================================
 * AcroFlow — Supabase cloud-sync adapter (optional; offline-first preserved)
 * ----------------------------------------------------------------------------
 * Loaded AFTER app.js (see index.html). If the user has entered a Supabase
 * project URL + publishable key in the Data tab, app.js's init() swaps `DB`
 * from LocalAdapter to SupabaseAdapter via pickAdapter(). If Supabase is not
 * configured — or the device is offline, or the user is signed out — the
 * adapter delegates everything to localStorage and the app behaves exactly
 * as it does today.
 *
 * SCHEMA EVOLUTION RULE — READ BEFORE ADDING A SYNC FIELD:
 *   NEW FIELDS GO IN `meta` (jsonb) — NEVER ADD ANOTHER COLUMN.
 *   `user_flows.meta` carries flow-level extras (incomplete, tutorials, …);
 *   `profiles.meta` carries future settings. Both round-trip opaquely
 *   through this adapter (see flowToRow/rowToFlow and the profiles mapping),
 *   so new features ship with ZERO database migrations. The v1.2 migration
 *   was the last DDL this project will ever need.
 *
 * What's stored where (all in this browser's localStorage, never in files):
 *   acroflow.v1        the app's working state (unchanged from v1)
 *   acroflow.supabase  { url, key } — project URL + publishable key
 *   acroflow.session   Supabase auth session (access/refresh tokens)
 *   acroflow.syncmeta  per-record timestamps, local↔uuid id maps, tombstones
 *
 * No dependencies: plain fetch() against the Supabase REST + Auth APIs.
 * The publishable key is only ever typed into the Data tab by the user.
 * ========================================================================== */
'use strict';

(function () {
  /* The adapter needs app.js's LocalAdapter; bail out quietly without it. */
  if (typeof LocalAdapter === 'undefined' || typeof localStorage === 'undefined') return;

  /* ---------------- local bookkeeping ---------------- */
  var CFG_KEY = 'acroflow.supabase';
  var SES_KEY = 'acroflow.session';
  var META_KEY = 'acroflow.syncmeta';

  function lsGet(k) {
    try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; }
    catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full/blocked */ }
  }
  function lsDel(k) {
    try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
  }
  function nowISO() { return new Date().toISOString(); }
  function notify(m) {
    if (window.App && typeof window.App.notify === 'function') window.App.notify(m);
  }
  function randomUUID() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function blankState() {
    return {
      version: (window.SEED && window.SEED.version) || '1.0.0',
      settings: { name: '', primaryRoles: ['base', 'flyer'], trainingFlowIds: [], goalFlowIds: [] },
      progress: {},
      partnerProgress: {},
      flows: [],
      practiceLogs: []
    };
  }

  /** True when the state holds no user data (fresh install / after reset). */
  function isEmptyState(s) {
    if (!s) return true;
    var noProg = !s.progress || !Object.keys(s.progress).length;
    var noPartner = !s.partnerProgress || !Object.keys(s.partnerProgress).length;
    var noFlows = !s.flows || !s.flows.length;
    var noLogs = !s.practiceLogs || !s.practiceLogs.length;
    var st = s.settings || {};
    var pr = st.primaryRoles || [];
    var defRoles = pr.length === 2 && pr.indexOf('base') !== -1 && pr.indexOf('flyer') !== -1;
    var noTrain = !st.trainingFlowIds || !st.trainingFlowIds.length;
    var noGoals = !st.goalFlowIds || !st.goalFlowIds.length;
    return noProg && noPartner && noFlows && noLogs && !st.name && defRoles && noTrain && noGoals;
  }

  /* ---------------- config ---------------- */
  function getConfig() {
    var c = lsGet(CFG_KEY);
    if (c && typeof c.url === 'string' && typeof c.key === 'string' && c.url && c.key) {
      return { url: c.url.replace(/\/+$/, ''), key: c.key.trim() };
    }
    return null;
  }

  /* ---------------- auth (Supabase Auth REST) ---------------- */
  function toSession(data) {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      user: { id: data.user && data.user.id, email: data.user && data.user.email }
    };
  }

  function getSession() { return lsGet(SES_KEY); }

  async function authCall(path, body, token) {
    var cfg = getConfig();
    if (!cfg) throw new Error('Supabase is not configured.');
    var headers = { 'apikey': cfg.key, 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var res = await fetch(cfg.url + path, {
      method: 'POST', headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    var data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok) {
      var msg = (data && (data.msg || data.error_description || data.error)) || ('HTTP ' + res.status);
      throw new Error(msg);
    }
    return data;
  }

  /** Returns a valid session, refreshing once when expired, or null. */
  async function ensureSession() {
    if (!getConfig()) return null;
    var s = getSession();
    if (!s || !s.refresh_token) return null;
    if (s.expires_at && s.expires_at - 60000 > Date.now()) return s;
    try {
      var data = await authCall('/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
      s = toSession(data);
      lsSet(SES_KEY, s);
      return s;
    } catch (e) {
      lsDel(SES_KEY);
      return null;
    }
  }

  /** Resolves { session, confirmed }. confirmed=false means "check your email". */
  async function signUp(email, password) {
    var data = await authCall('/auth/v1/signup', { email: email, password: password });
    if (data && data.access_token) {
      var s = toSession(data);
      lsSet(SES_KEY, s);
      return { session: s, confirmed: true };
    }
    return { session: null, confirmed: false };
  }

  async function signIn(email, password) {
    var data = await authCall('/auth/v1/token?grant_type=password', { email: email, password: password });
    var s = toSession(data);
    lsSet(SES_KEY, s);
    return s;
  }

  async function signOut() {
    var s = getSession();
    try { if (s && s.access_token) await authCall('/auth/v1/logout', null, s.access_token); }
    catch (e) { /* still clear the local session */ }
    lsDel(SES_KEY);
  }

  /* ---------------- REST client ---------------- */
  var UPSERT = 'resolution=merge-duplicates,return=representation';

  async function api(method, path, body, prefer) {
    var cfg = getConfig();
    if (!cfg) throw new Error('Supabase is not configured.');
    var sess = await ensureSession();
    if (!sess || !sess.access_token) throw new Error('Not signed in.');
    var headers = {
      'apikey': cfg.key,
      'Authorization': 'Bearer ' + sess.access_token,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    if (prefer) headers['Prefer'] = prefer;
    var res = await fetch(cfg.url + path, {
      method: method, headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (res.status === 204) return null;
    var data = null;
    try { data = await res.json(); } catch (e) { /* non-JSON */ }
    if (!res.ok) {
      var msg = (data && (data.message || data.msg || data.error)) || ('HTTP ' + res.status);
      throw new Error(msg);
    }
    return data;
  }

  /* ---------------- row mapping: state <-> tables ---------------- */
  /* progress bags: { skillId: { role: level } }, sparse (no 'unstarted'). */

  function progEntries(bag) {
    var out = [];
    Object.keys(bag || {}).forEach(function (sid) {
      var roles = bag[sid] || {};
      Object.keys(roles).forEach(function (role) {
        out.push({ skill: sid, role: role, level: roles[role] });
      });
    });
    return out;
  }

  function setBag(bag, sid, role, level) {
    if (!bag[sid]) bag[sid] = {};
    bag[sid][role] = level;
  }

  function tsGet(meta, bucket, sid, role) {
    return meta[bucket] && meta[bucket][sid] && meta[bucket][sid][role];
  }
  function tsSet(meta, bucket, sid, role, iso) {
    meta[bucket] = meta[bucket] || {};
    meta[bucket][sid] = meta[bucket][sid] || {};
    meta[bucket][sid][role] = iso;
  }
  function tsDel(meta, bucket, sid, role) {
    if (meta[bucket] && meta[bucket][sid]) {
      delete meta[bucket][sid][role];
      if (!Object.keys(meta[bucket][sid]).length) delete meta[bucket][sid];
    }
  }

  /* Local log/flow ids ('l_…', 'u_…') aren't UUIDs, so the cloud uses a
   * generated UUID per record; the mapping lives in syncmeta. */
  function uuidFor(kind, localId, meta) {
    meta.idmap = meta.idmap || { logs: {}, flows: {} };
    var map = meta.idmap[kind];
    if (!map[localId]) map[localId] = randomUUID();
    return map[localId];
  }
  function localIdFor(kind, uuid, meta) {
    var map = (meta.idmap && meta.idmap[kind]) || {};
    var found = Object.keys(map).filter(function (k) { return map[k] === uuid; })[0];
    if (found) return found;
    // Deterministic device-local id derived from the uuid (stable across devices).
    return (kind === 'logs' ? 'l_' : 'u_') + uuid.replace(/-/g, '').slice(0, 16);
  }

  function logToRow(l, uid, meta, ts) {
    return {
      id: uuidFor('logs', l.id, meta),
      user_id: uid,
      date: l.date || null,
      partner: l.partner || null,
      role: l.role || null,
      skill_ids: l.skills || [],
      confidence: (l.confidence === undefined || l.confidence === null) ? null : l.confidence,
      notes: l.notes || null,
      updated_at: ts
    };
  }
  function rowToLog(r, meta) {
    var id = localIdFor('logs', r.id, meta);
    meta.idmap = meta.idmap || { logs: {}, flows: {} };
    meta.idmap.logs[id] = r.id;
    return {
      id: id,
      date: r.date || '',
      partner: r.partner || '',
      role: r.role,
      skills: r.skill_ids || [],
      confidence: r.confidence,
      notes: r.notes || ''
    };
  }

  /* Flow-level extras (incomplete, tutorials, and anything future) live in
   * the `meta` jsonb column — NEVER add another column to user_flows.
   * Unknown keys already on f.meta are preserved verbatim. */
  function flowToRow(f, uid, meta, ts) {
    var m = (f.meta && typeof f.meta === 'object' && !Array.isArray(f.meta))
      ? Object.assign({}, f.meta) : {};
    m.incomplete = !!f.incomplete;
    m.tutorials = f.tutorials || [];
    return {
      id: uuidFor('flows', f.id, meta),
      user_id: uid,
      name: f.name,
      steps: f.steps || [],
      // Postgres text[] accepts JSON nulls as NULL elements.
      transitions: (f.transitions || []).map(function (t) { return t || null; }),
      washing_machine: !!f.washingMachine,
      note: f.note || null,
      meta: m,
      updated_at: ts
    };
  }
  function rowToFlow(r, meta) {
    var id = localIdFor('flows', r.id, meta);
    meta.idmap = meta.idmap || { logs: {}, flows: {} };
    meta.idmap.flows[id] = r.id;
    // `meta` is authoritative. The pre-final-v1.2 dedicated columns
    // (`incomplete`, `tutorials`) are read as fallback only, for rows
    // written before the meta migration — the select below never asks
    // for them because they may not exist.
    var m = (r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta)) ? r.meta : {};
    return {
      id: id,
      name: r.name,
      steps: r.steps || [],
      transitions: (r.transitions || []).map(function (t) { return t || null; }),
      washingMachine: !!r.washing_machine,
      origin: 'user',
      note: r.note || '',
      meta: m,
      incomplete: m.incomplete !== undefined ? !!m.incomplete : !!r.incomplete,
      tutorials: m.tutorials !== undefined ? m.tutorials : (r.tutorials || [])
    };
  }

  /* ---------------- sync metadata ---------------- */
  function getMeta() {
    var m = lsGet(META_KEY) || {};
    m.idmap = m.idmap || { logs: {}, flows: {} };
    return m;
  }
  function setMeta(m) { lsSet(META_KEY, m); }

  function progMapOf(bag) {
    var m = {};
    progEntries(bag).forEach(function (e) { m[e.skill + '|' + e.role] = e.level; });
    return m;
  }
  function logSigs(logs) {
    var m = {};
    (logs || []).forEach(function (l) {
      m[l.id] = JSON.stringify([l.date, l.partner, l.role, l.skills, l.confidence, l.notes]);
    });
    return m;
  }
  function flowSigs(flows) {
    var m = {};
    (flows || []).forEach(function (f) {
      // meta is part of the signature so edits to future meta keys trigger a sync.
      m[f.id] = JSON.stringify([f.name, f.steps, f.transitions, f.washingMachine, f.note, !!f.incomplete, f.tutorials, f.meta || {}]);
    });
    return m;
  }

  /** Refresh only the "last seen" snapshots (never timestamps). */
  function snapshotState(s, meta) {
    meta.lastProgress = progMapOf(s.progress);
    meta.lastPartner = progMapOf(s.partnerProgress);
    meta.lastLogs = logSigs(s.practiceLogs);
    meta.lastFlows = flowSigs(s.flows);
    meta.lastSettings = JSON.stringify(s.settings || {});
  }

  /**
   * Diff the current state against the last snapshot: stamp changed records
   * with now, record tombstones for deleted ones. Called on every save().
   */
  function noteLocalChanges(s, meta) {
    var t = nowISO();
    [['progress', 'progressTs', 'lastProgress', 'delProgress'],
     ['partnerProgress', 'partnerTs', 'lastPartner', 'delPartner']].forEach(function (spec) {
      var bagName = spec[0], tsB = spec[1], lastK = spec[2], delK = spec[3];
      var cur = progMapOf(s[bagName]);
      var last = meta[lastK] || {};
      meta[delK] = meta[delK] || {};
      Object.keys(cur).forEach(function (k) {
        var parts = k.split('|');
        if (last[k] !== cur[k]) { tsSet(meta, tsB, parts[0], parts[1], t); delete meta[delK][k]; }
      });
      Object.keys(last).forEach(function (k) {
        if (!(k in cur)) {
          var parts = k.split('|');
          meta[delK][k] = t;
          tsDel(meta, tsB, parts[0], parts[1]);
        }
      });
      meta[lastK] = cur;
    });

    [['practiceLogs', 'logTs', 'lastLogs', 'delLogs', logSigs],
     ['flows', 'flowTs', 'lastFlows', 'delFlows', flowSigs]].forEach(function (spec) {
      var listName = spec[0], tsK = spec[1], lastK = spec[2], delK = spec[3], sigFn = spec[4];
      var cur = sigFn(s[listName]);
      var last = meta[lastK] || {};
      meta[tsK] = meta[tsK] || {};
      meta[delK] = meta[delK] || {};
      Object.keys(cur).forEach(function (id) {
        if (last[id] !== cur[id]) { meta[tsK][id] = t; delete meta[delK][id]; }
      });
      Object.keys(last).forEach(function (id) {
        if (!(id in cur)) { meta[delK][id] = t; delete meta[tsK][id]; }
      });
      meta[lastK] = cur;
    });

    var sig = JSON.stringify(s.settings || {});
    if (meta.lastSettings !== sig) { meta.settingsTs = t; meta.lastSettings = sig; }
    setMeta(meta);
  }

  /* ---------------- cloud fetch ---------------- */
  async function fetchCloud(uid) {
    var q = 'user_id=eq.' + encodeURIComponent(uid);
    var results = await Promise.all([
      api('GET', '/rest/v1/profiles?select=id,display_name,primary_roles,training_flow_ids,goal_flow_ids,meta,updated_at&id=eq.' + encodeURIComponent(uid)),
      api('GET', '/rest/v1/progress?select=skill_id,role,level,updated_at&' + q),
      api('GET', '/rest/v1/partner_progress?select=skill_id,role,level,updated_at&' + q),
      api('GET', '/rest/v1/practice_logs?select=id,date,partner,role,skill_ids,confidence,notes,updated_at&' + q),
      api('GET', '/rest/v1/user_flows?select=id,name,steps,transitions,washing_machine,note,meta,updated_at&' + q)
    ]);
    return {
      prof: (results[0] && results[0][0]) || null,
      prog: results[1] || [],
      pprog: results[2] || [],
      logs: results[3] || [],
      flows: results[4] || []
    };
  }

  /* ---------------- push: upload local state (idempotent) ---------------- */
  async function pushState(state, uid, meta) {
    var t = nowISO();
    var st = state.settings || {};

    // Future settings live in settings.meta (round-tripped opaquely) —
    // NEVER add another column to profiles. The key is omitted when empty
    // so we never clobber server-side meta we haven't seen.
    var profRow = {
      id: uid,
      display_name: st.name || null,
      primary_roles: st.primaryRoles || ['base', 'flyer'],
      training_flow_ids: st.trainingFlowIds || [],
      goal_flow_ids: st.goalFlowIds || [],
      updated_at: meta.settingsTs || t
    };
    if (st.meta && typeof st.meta === 'object' && !Array.isArray(st.meta)) profRow.meta = st.meta;
    await api('POST', '/rest/v1/profiles', profRow, UPSERT);

    var bags = [
      ['progress', 'progress', 'progressTs', 'delProgress'],
      ['partnerProgress', 'partner_progress', 'partnerTs', 'delPartner']
    ];
    for (var b = 0; b < bags.length; b++) {
      var bagName = bags[b][0], table = bags[b][1], tsB = bags[b][2], delK = bags[b][3];
      var rows = progEntries(state[bagName]).map(function (e) {
        return {
          user_id: uid, skill_id: e.skill, role: e.role, level: e.level,
          updated_at: tsGet(meta, tsB, e.skill, e.role) || t
        };
      });
      if (rows.length) await api('POST', '/rest/v1/' + table, rows, UPSERT);
      var dels = Object.keys(meta[delK] || {});
      for (var d = 0; d < dels.length; d++) {
        var parts = dels[d].split('|');
        await api('DELETE', '/rest/v1/' + table + '?user_id=eq.' + encodeURIComponent(uid) +
          '&skill_id=eq.' + encodeURIComponent(parts[0]) + '&role=eq.' + encodeURIComponent(parts[1]));
      }
      meta[delK] = {};
    }

    var logs = state.practiceLogs || [];
    for (var i = 0; i < logs.length; i++) {
      var lts = (meta.logTs && meta.logTs[logs[i].id]) || t;
      await api('POST', '/rest/v1/practice_logs', logToRow(logs[i], uid, meta, lts), UPSERT);
    }
    var delLogs = Object.keys(meta.delLogs || {});
    for (var j = 0; j < delLogs.length; j++) {
      var luuid = meta.idmap.logs[delLogs[j]];
      if (luuid) await api('DELETE', '/rest/v1/practice_logs?id=eq.' + encodeURIComponent(luuid));
      delete meta.idmap.logs[delLogs[j]];
    }
    meta.delLogs = {};

    var flows = state.flows || [];
    for (var k = 0; k < flows.length; k++) {
      var fts = (meta.flowTs && meta.flowTs[flows[k].id]) || t;
      await api('POST', '/rest/v1/user_flows', flowToRow(flows[k], uid, meta, fts), UPSERT);
    }
    var delFlows = Object.keys(meta.delFlows || {});
    for (var m2 = 0; m2 < delFlows.length; m2++) {
      var fuuid = meta.idmap.flows[delFlows[m2]];
      if (fuuid) await api('DELETE', '/rest/v1/user_flows?id=eq.' + encodeURIComponent(fuuid));
      delete meta.idmap.flows[delFlows[m2]];
    }
    meta.delFlows = {};

    meta.lastSyncAt = t;
    snapshotState(state, meta);
    setMeta(meta);
  }

  /* ---------------- pull: build a state from cloud rows ---------------- */
  function stateFromCloud(cloud, meta) {
    var s = blankState();
    if (cloud.prof) {
      s.settings.name = cloud.prof.display_name || '';
      s.settings.primaryRoles = cloud.prof.primary_roles || ['base', 'flyer'];
      s.settings.trainingFlowIds = cloud.prof.training_flow_ids || [];
      s.settings.goalFlowIds = cloud.prof.goal_flow_ids || [];
      // Future settings ride along opaquely in profiles.meta.
      if (cloud.prof.meta && typeof cloud.prof.meta === 'object' && !Array.isArray(cloud.prof.meta)) {
        s.settings.meta = cloud.prof.meta;
      }
      meta.settingsTs = cloud.prof.updated_at;
    }
    cloud.prog.forEach(function (r) {
      setBag(s.progress, r.skill_id, r.role, r.level);
      tsSet(meta, 'progressTs', r.skill_id, r.role, r.updated_at);
    });
    cloud.pprog.forEach(function (r) {
      setBag(s.partnerProgress, r.skill_id, r.role, r.level);
      tsSet(meta, 'partnerTs', r.skill_id, r.role, r.updated_at);
    });
    cloud.logs.forEach(function (r) {
      var l = rowToLog(r, meta);
      s.practiceLogs.push(l);
      meta.logTs = meta.logTs || {};
      meta.logTs[l.id] = r.updated_at;
    });
    cloud.flows.forEach(function (r) {
      var f = rowToFlow(r, meta);
      s.flows.push(f);
      meta.flowTs = meta.flowTs || {};
      meta.flowTs[f.id] = r.updated_at;
    });
    snapshotState(s, meta);
    return s;
  }

  /* ---------------- merge: per-record last-write-wins ---------------- */
  async function mergeBoth(local, uid, meta) {
    var cloud = await fetchCloud(uid);
    var merged = JSON.parse(JSON.stringify(local));
    var t = nowISO();

    var ops = { progUp: [], progDel: [], pprogUp: [], pprogDel: [], logUp: [], logDel: [], flowUp: [], flowDel: [], profile: null };

    /* progress bags */
    [['progress', cloud.prog, 'progressTs', 'delProgress', 'progUp', 'progDel', 'progress'],
     ['partnerProgress', cloud.pprog, 'partnerTs', 'delPartner', 'pprogUp', 'pprogDel', 'partner_progress']
    ].forEach(function (spec) {
      var bagName = spec[0], rows = spec[1], tsB = spec[2], delK = spec[3];
      var upK = spec[4], delOpK = spec[5], table = spec[6];
      var bag = merged[bagName] = merged[bagName] || {};
      var cloudByKey = {};
      rows.forEach(function (r) { cloudByKey[r.skill_id + '|' + r.role] = r; });
      var localByKey = progMapOf(bag);
      var dels = meta[delK] || {};
      var keys = {};
      Object.keys(localByKey).forEach(function (k) { keys[k] = 1; });
      Object.keys(cloudByKey).forEach(function (k) { keys[k] = 1; });
      Object.keys(dels).forEach(function (k) { keys[k] = 1; });

      Object.keys(keys).forEach(function (k) {
        var parts = k.split('|'), sid = parts[0], role = parts[1];
        var lv = localByKey[k];
        var cr = cloudByKey[k];
        var delTs = dels[k];
        var lts = tsGet(meta, tsB, sid, role);

        if (delTs) {
          // Deleted locally at delTs. Cloud edit after that wins (resurrect); else delete wins.
          if (cr && cr.updated_at > delTs) {
            setBag(bag, sid, role, cr.level);
            tsSet(meta, tsB, sid, role, cr.updated_at);
          } else if (cr) {
            ops[delOpK].push({ sid: sid, role: role, table: table });
          }
          delete dels[k];
        } else if (lv !== undefined && cr) {
          if (lts && lts >= cr.updated_at) {
            ops[upK].push({ user_id: uid, skill_id: sid, role: role, level: lv, updated_at: lts });
          } else {
            // Cloud is newer — or local predates sync (no timestamp): cloud wins (documented).
            setBag(bag, sid, role, cr.level);
            tsSet(meta, tsB, sid, role, cr.updated_at);
          }
        } else if (lv !== undefined) {
          var uts = lts || t;
          ops[upK].push({ user_id: uid, skill_id: sid, role: role, level: lv, updated_at: uts });
          if (!lts) tsSet(meta, tsB, sid, role, uts);
        } else if (cr) {
          setBag(bag, sid, role, cr.level);
          tsSet(meta, tsB, sid, role, cr.updated_at);
        }
      });
      meta[delK] = dels;
    });

    /* logs + flows (same shape, different buckets) */
    [['practiceLogs', cloud.logs, 'logTs', 'delLogs', 'logs', 'logUp', 'logDel', 'practice_logs', logToRow, rowToLog],
     ['flows', cloud.flows, 'flowTs', 'delFlows', 'flows', 'flowUp', 'flowDel', 'user_flows', flowToRow, rowToFlow]
    ].forEach(function (spec) {
      var listName = spec[0], rows = spec[1], tsK = spec[2], delK = spec[3];
      var idKind = spec[4], upK = spec[5], delOpK = spec[6], table = spec[7];
      var toRow = spec[8], fromRow = spec[9];
      meta[tsK] = meta[tsK] || {};
      var cloudByUuid = {};
      rows.forEach(function (r) { cloudByUuid[r.id] = r; });
      var seen = {};
      var out = [];

      // Local tombstones first: delete from cloud unless cloud edited after.
      Object.keys(meta[delK] || {}).forEach(function (localId) {
        var uuid = (meta.idmap[idKind] || {})[localId];
        var cr = uuid && cloudByUuid[uuid];
        var delTs = meta[delK][localId];
        if (cr && cr.updated_at > delTs) {
          var res = fromRow(cr, meta);
          out.push(res);
          meta[tsK][res.id] = cr.updated_at;
          seen[uuid] = 1;
        } else if (uuid) {
          ops[delOpK].push(uuid);
        }
        delete meta[delK][localId];
        delete meta.idmap[idKind][localId];
        delete meta[tsK][localId];
      });
      meta[delK] = {};

      (merged[listName] || []).forEach(function (item) {
        var uuid = uuidFor(idKind, item.id, meta);
        var cr = cloudByUuid[uuid];
        var lts = meta[tsK][item.id];
        if (cr) {
          seen[uuid] = 1;
          if (lts && lts >= cr.updated_at) {
            ops[upK].push(toRow(item, uid, meta, lts));
            out.push(item);
          } else {
            var pulled = fromRow(cr, meta); // cloud newer, or local ts unknown → cloud wins
            out.push(pulled);
            meta[tsK][pulled.id] = cr.updated_at;
          }
        } else {
          var uts = lts || t;
          ops[upK].push(toRow(item, uid, meta, uts));
          if (!lts) meta[tsK][item.id] = uts;
          out.push(item);
        }
      });

      rows.forEach(function (cr) {
        if (seen[cr.id]) return;
        var pulled2 = fromRow(cr, meta);
        out.push(pulled2);
        meta[tsK][pulled2.id] = cr.updated_at;
      });

      merged[listName] = out;
    });

    /* settings <-> profiles */
    var sts = meta.settingsTs;
    var mst = merged.settings || {};
    // Copies every key of ops.profile through, so future settings keys
    // (including meta) survive the merge write without code changes.
    function profRowFrom(s) {
      var row = {
        display_name: s.name || null,
        primary_roles: s.primaryRoles || ['base', 'flyer'],
        training_flow_ids: s.trainingFlowIds || [],
        goal_flow_ids: s.goalFlowIds || [],
        updated_at: sts
      };
      if (s.meta && typeof s.meta === 'object' && !Array.isArray(s.meta)) row.meta = s.meta;
      return row;
    }
    if (cloud.prof) {
      if (sts && sts >= cloud.prof.updated_at) {
        ops.profile = profRowFrom(mst);
      } else {
        // Cloud newer — or local predates sync (unknown ts): cloud wins (documented).
        merged.settings = { name: cloud.prof.display_name || '', primaryRoles: cloud.prof.primary_roles || ['base', 'flyer'], trainingFlowIds: cloud.prof.training_flow_ids || [], goalFlowIds: cloud.prof.goal_flow_ids || [] };
        if (cloud.prof.meta && typeof cloud.prof.meta === 'object' && !Array.isArray(cloud.prof.meta)) {
          merged.settings.meta = cloud.prof.meta;
        }
        meta.settingsTs = cloud.prof.updated_at;
      }
    } else {
      var puts = sts || t;
      ops.profile = profRowFrom(mst);
      ops.profile.updated_at = puts;
      if (!sts) meta.settingsTs = puts;
    }

    /* execute cloud writes */
    if (ops.profile) {
      // Pass every key through (id + whatever the merge decided): future
      // settings keys must not be dropped here.
      var prow = { id: uid };
      Object.keys(ops.profile).forEach(function (k) { prow[k] = ops.profile[k]; });
      await api('POST', '/rest/v1/profiles', prow, UPSERT);
    }
    if (ops.progUp.length) await api('POST', '/rest/v1/progress', ops.progUp, UPSERT);
    if (ops.pprogUp.length) await api('POST', '/rest/v1/partner_progress', ops.pprogUp, UPSERT);
    var allDel = ops.progDel.concat(ops.pprogDel);
    for (var d = 0; d < allDel.length; d++) {
      await api('DELETE', '/rest/v1/' + allDel[d].table + '?user_id=eq.' + encodeURIComponent(uid) +
        '&skill_id=eq.' + encodeURIComponent(allDel[d].sid) + '&role=eq.' + encodeURIComponent(allDel[d].role));
    }
    if (ops.logUp.length) await api('POST', '/rest/v1/practice_logs', ops.logUp, UPSERT);
    for (var l2 = 0; l2 < ops.logDel.length; l2++) {
      await api('DELETE', '/rest/v1/practice_logs?id=eq.' + encodeURIComponent(ops.logDel[l2]));
    }
    if (ops.flowUp.length) await api('POST', '/rest/v1/user_flows', ops.flowUp, UPSERT);
    for (var f2 = 0; f2 < ops.flowDel.length; f2++) {
      await api('DELETE', '/rest/v1/user_flows?id=eq.' + encodeURIComponent(ops.flowDel[f2]));
    }

    meta.lastSyncAt = t;
    snapshotState(merged, meta);
    setMeta(meta);
    await LocalAdapter.save(merged);
    return merged;
  }

  /* ---------------- reconcile: pick push / pull / merge ---------------- */
  async function reconcile(local, uid) {
    var meta = getMeta();
    var cloud;
    try {
      cloud = await fetchCloud(uid);
    } catch (e) {
      throw new Error('Could not reach Supabase (' + e.message + ').');
    }
    var cloudEmpty = !cloud.prof && !cloud.prog.length && !cloud.pprog.length && !cloud.logs.length && !cloud.flows.length;
    var localEmpty = isEmptyState(local);
    // A device that has synced before (timestamps / tombstones in syncmeta)
    // is never treated as "fresh": otherwise deleting your last local record
    // would look like a fresh install and the pull below would resurrect it.
    var syncHistory = !!(
      Object.keys(meta.lastProgress || {}).length || Object.keys(meta.lastPartner || {}).length ||
      Object.keys(meta.lastLogs || {}).length || Object.keys(meta.lastFlows || {}).length ||
      Object.keys(meta.delProgress || {}).length || Object.keys(meta.delPartner || {}).length ||
      Object.keys(meta.delLogs || {}).length || Object.keys(meta.delFlows || {}).length ||
      meta.settingsTs
    );

    if (localEmpty && !cloudEmpty && !syncHistory) {
      // Fresh device (or after Reset): take the cloud as truth.
      var pulled = stateFromCloud(cloud, meta);
      setMeta(meta);
      await LocalAdapter.save(pulled);
      return pulled;
    }
    if (cloudEmpty && !localEmpty) {
      // First connect with data on this device: upload everything.
      noteLocalChanges(local, meta);
      await pushState(local, uid, meta);
      return local;
    }
    // Both sides have data (or both empty, or local was emptied by deletes):
    // per-record last-write-wins.
    return mergeBoth(local, uid, meta);
  }

  /* ---------------- debounced auto-push ---------------- */
  var pushTimer = null, pushing = false, pushQueued = false;

  function schedulePush() {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushNow(); }, 1500);
  }

  async function pushNow() {
    if (pushing) { pushQueued = true; return; }
    pushing = true;
    try {
      var sess = await ensureSession();
      if (!sess) return;
      var state = await LocalAdapter.load();
      if (!state) return;
      var meta = getMeta();
      await pushState(state, sess.user.id, meta);
    } catch (e) {
      console.warn('AcroFlow sync: push failed:', e);
      notify('☁ Sync failed — will retry on your next change.');
    } finally {
      pushing = false;
      if (pushQueued) { pushQueued = false; schedulePush(); }
    }
  }

  /* ---------------- the adapter (same interface as LocalAdapter) ---------------- */
  var SupabaseAdapter = {
    name: 'Supabase ☁ + localStorage',

    async load() {
      if (!getConfig()) return LocalAdapter.load(); // not configured → today's behavior
      var sess = null;
      try { sess = await ensureSession(); } catch (e) { sess = null; }
      if (!sess) return LocalAdapter.load(); // signed out or offline → local only
      var local = await LocalAdapter.load();
      try {
        return await reconcile(local || blankState(), sess.user.id);
      } catch (e) {
        console.warn('AcroFlow sync: load fell back to local:', e);
        return local; // network/API error → keep the app working offline
      }
    },

    async save(state) {
      await LocalAdapter.save(state); // offline-first: local always wins immediately
      try {
        if (!getConfig()) return;
        var meta = getMeta();
        noteLocalChanges(state, meta);
        var sess = await ensureSession();
        if (!sess) return;
        schedulePush();
      } catch (e) {
        console.warn('AcroFlow sync: save hook failed:', e);
      }
    },

    async clear() {
      await LocalAdapter.clear();
      lsDel(META_KEY);
      try {
        if (!getConfig()) return;
        var sess = await ensureSession();
        if (!sess) return;
        // Deleting the profile cascades to all user rows (see schema).
        await api('DELETE', '/rest/v1/profiles?id=eq.' + encodeURIComponent(sess.user.id));
      } catch (e) {
        console.warn('AcroFlow sync: cloud clear failed:', e);
      }
    },

    exportJSON: LocalAdapter.exportJSON,
    importJSON: LocalAdapter.importJSON
  };

  /* ---------------- full sync (Sync-now button, post-sign-in) ---------------- */
  async function fullSync() {
    if (!getConfig()) throw new Error('Supabase is not configured.');
    var sess = await ensureSession();
    if (!sess) throw new Error('Not signed in.');
    var local = await LocalAdapter.load();
    return reconcile(local || blankState(), sess.user.id);
  }

  /* ---------------- Data-tab UI ---------------- */
  function statusShort() {
    if (!getConfig()) return 'Cloud sync: not configured — see README.';
    var sess = getSession();
    if (!sess) return 'Cloud sync: configured, signed out.';
    return 'Cloud sync: active' + (sess.user && sess.user.email ? ' as ' + sess.user.email : '') + '.';
  }

  function statusHTML() {
    var cfg = getConfig();
    if (!cfg) {
      return '<p><span class="pill grey">⚪ Not configured</span></p>' +
        '<p class="hint">Everything stays on this device. Add your Supabase details below to sync across devices.</p>';
    }
    var sess = getSession();
    if (!sess) {
      return '<p><span class="pill amber">🟡 Configured — signed out</span></p>' +
        '<p class="hint">Sign in below to start syncing.</p>';
    }
    var meta = getMeta();
    var when = meta.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleString() : 'never';
    return '<p><span class="pill green">🟢 Signed in</span></p>' +
      '<p class="hint">' + esc(sess.user && sess.user.email ? sess.user.email : '') +
      ' · last sync ' + esc(when) + '</p>';
  }

  function syncCardHTML() {
    var cfg = getConfig();
    var sess = getSession();
    var h = '<div class="card"><h3 style="margin-top:0">☁ Cloud sync</h3>';
    h += '<div>' + statusHTML() + '</div>';
    if (!cfg) {
      h += '<label class="field" for="sync-url">Supabase project URL</label>' +
        '<input type="url" id="sync-url" placeholder="https://xyzcompany.supabase.co" autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '<label class="field" for="sync-key">Publishable key</label>' +
        '<input type="password" id="sync-key" placeholder="sb_publishable_…" autocomplete="off" autocapitalize="off" spellcheck="false">' +
        '<div class="row wrap" style="margin-top:10px"><button type="button" class="btn" onclick="App.syncSaveConfig()">Save &amp; enable</button></div>' +
        '<p class="hint">Stored only in this browser — never in the code or the repo. One-time setup steps are in the README.</p>';
    } else {
      h += '<p class="small muted">Project: ' + esc(cfg.url) + '</p>';
      if (!sess) {
        h += '<label class="field" for="sync-email">Email</label>' +
          '<input type="email" id="sync-email" autocomplete="email" autocapitalize="off" spellcheck="false">' +
          '<label class="field" for="sync-pass">Password</label>' +
          '<input type="password" id="sync-pass" autocomplete="current-password">' +
          '<div class="row wrap" style="margin-top:10px">' +
          '<button type="button" class="btn" onclick="App.syncSignIn()">Sign in</button>' +
          '<button type="button" class="btn secondary" onclick="App.syncSignUp()">Create account</button></div>' +
          '<p class="hint">If your project requires email confirmation, create the account, click the link in your email, then sign in.</p>';
      } else {
        h += '<div class="row wrap">' +
          '<button type="button" class="btn secondary" onclick="App.syncNow()">⇅ Sync now</button>' +
          '<button type="button" class="btn ghost" onclick="App.syncSignOut()">Sign out</button></div>';
      }
      h += '<div style="margin-top:8px"><button type="button" class="btn ghost small-btn" onclick="App.syncForget()">Remove Supabase config</button></div>';
    }
    return h + '</div>';
  }

  function readVal(id) {
    var el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
  }

  /* Actions attached onto window.App (app.js owns the App object). */
  function attachActions() {
    if (!window.App) return;
    Object.assign(window.App, {
      syncSaveConfig: function () {
        var url = readVal('sync-url');
        var key = readVal('sync-key');
        if (!/^https:\/\/.+/.test(url)) { notify('Enter your Supabase project URL (https://…).'); return; }
        if (!key) { notify('Enter your publishable key.'); return; }
        lsSet(CFG_KEY, { url: url, key: key });
        location.reload(); // re-init with the Supabase adapter
      },
      syncSignIn: async function () {
        var email = readVal('sync-email'), password = readVal('sync-pass');
        if (!email || !password) { notify('Enter your email and password.'); return; }
        notify('Signing in…');
        try {
          await signIn(email, password);
          var merged = await fullSync();
          window.App.applySyncedState(merged);
          notify('☁ Signed in and synced.');
        } catch (e) {
          notify('Sign in failed: ' + e.message);
          window.App.rerender();
        }
      },
      syncSignUp: async function () {
        var email = readVal('sync-email'), password = readVal('sync-pass');
        if (!email || !password) { notify('Enter your email and password.'); return; }
        if (password.length < 6) { notify('Password must be at least 6 characters.'); return; }
        notify('Creating account…');
        try {
          var res = await signUp(email, password);
          if (!res.confirmed) {
            notify('Account created — check your email for the confirmation link, then sign in.');
            window.App.rerender();
            return;
          }
          var merged = await fullSync();
          window.App.applySyncedState(merged);
          notify('☁ Account created and synced.');
        } catch (e) {
          notify('Sign up failed: ' + e.message);
          window.App.rerender();
        }
      },
      syncSignOut: async function () {
        await signOut();
        notify('Signed out. Your data stays on this device.');
        window.App.rerender();
      },
      syncNow: async function () {
        notify('Syncing…');
        try {
          var merged = await fullSync();
          window.App.applySyncedState(merged);
          notify('☁ Sync complete.');
        } catch (e) {
          notify('Sync failed: ' + e.message);
        }
      },
      syncForget: function () {
        if (!confirm('Remove the Supabase URL and key from this browser? Your cloud data and local data are kept.')) return;
        lsDel(CFG_KEY);
        lsDel(SES_KEY);
        lsDel(META_KEY);
        location.reload(); // re-init with the local adapter
      }
    });
  }

  attachActions();

  /* ---------------- public surface ---------------- */
  window.AcFlowsync = {
    /** Called by app.js init(): returns SupabaseAdapter when configured, else the fallback. */
    pickAdapter: function (fallback) { return getConfig() ? SupabaseAdapter : (fallback || null); },
    SupabaseAdapter: SupabaseAdapter,
    getConfig: getConfig,
    getSession: getSession,
    signUp: signUp,
    signIn: signIn,
    signOut: signOut,
    fullSync: fullSync,
    syncCardHTML: syncCardHTML,
    statusShort: statusShort,
    /* internals exposed for testing */
    _internals: {
      blankState: blankState,
      isEmptyState: isEmptyState,
      getMeta: getMeta,
      setMeta: setMeta,
      noteLocalChanges: noteLocalChanges,
      pushState: pushState,
      fetchCloud: fetchCloud,
      reconcile: reconcile,
      progEntries: progEntries,
      logToRow: logToRow,
      rowToLog: rowToLog,
      flowToRow: flowToRow,
      rowToFlow: rowToFlow,
      uuidFor: uuidFor,
      localIdFor: localIdFor,
      CFG_KEY: CFG_KEY,
      SES_KEY: SES_KEY,
      META_KEY: META_KEY
    }
  };
})();
