# AcroFlow 🤸

An offline-first, installable web app for tracking your acro-yoga practice:
a **skill graph** of L-base poses and transitions (tracked separately, per
role), a "what should I learn next?" discovery engine, a flow builder that
detects washing machines, a two-person jam comparison, a practice log, and
first-class flows & washing machines — a 🌀 Flows library, an active
training set, starred end goals, and per-role progress on the flow itself.

**No build step. No frameworks. No CDNs.** Just `index.html` + `styles.css` +
`app.js` + `data.js`, so anyone can read it, host it, and hack on it.

## Run it locally

```bash
cd acro-app
python3 -m http.server 8000
# open http://localhost:8000
```

On your phone (same Wi-Fi): open `http://<your-computer-ip>:8000`.
Use "Add to Home screen" to install it as an app icon.

## Publish to GitHub Pages (free)

1. Create a **public** repo on GitHub, e.g. `acroflow`.
2. Push this folder's contents to the repo's `main` branch (all files at the
   repo root, or in `docs/` — either works).
3. Repo → **Settings → Pages** → Source: **Deploy from a branch** →
   Branch: `main`, folder: `/` (or `/docs`) → Save.
4. Your app is live at `https://<you>.github.io/acroflow/` in ~a minute.

All asset references are relative (`./app.js`, `./styles.css`, …), so the app
works identically at a project-site subpath. No custom domain needed, though
you can add one later in the same Pages settings.

## Project layout

| File | What it is |
|---|---|
| `index.html` | App shell + bottom tab nav + service-worker registration |
| `styles.css` | Mobile-first styles, big tap targets |
| `app.js` | All application logic (screens, router, progress, flows) |
| `data.js` | Seed skill graph — `window.SEED = { poses, transitions, flows }` |
| `manifest.json` | PWA manifest (name "AcroFlow", standalone display) |
| `sw.js` | Service worker — caches the app shell for offline use |
| `icon.svg` / `icon-192.png` / `icon-512.png` | App icons (PNGs generated from the SVG) |
| `supabase-adapter.js` | Optional Supabase cloud-sync adapter + Data-tab UI (no dependencies, fetch only) |
| `supabase-schema.sql` | Cloud-sync tables — run once in the Supabase SQL editor |

## Data model (device store)

Everything lives under one localStorage key, **`acroflow.v1`**:

- `settings` — `{ name, primaryRoles: ['base','flyer'],
  trainingFlowIds: [], goalFlowIds: [] }`. `trainingFlowIds` is the active
  training set (flows you drill, from the 🌀 Flows library or the Builder);
  `goalFlowIds` is a subset of it — starred end-goal flows.
- `progress` — `{ skillId: { base, flyer, spotter } }`, each level one of
  `unstarted | learning | drilling | solid | teach`. Poses, transitions **and
  flows** are tracked in the same map — flow ids are just more keys, so no
  schema change was needed to track a whole machine per role. Knowing Bird
  and Throne says nothing about Bird → Throne, and drilling every part of a
  machine says nothing about the machine itself: the flow's own level is
  tracked separately. Only non-`unstarted` entries are stored.
- `partnerProgress` — same shape, for the Jam partner profile on this device.
- `flows` — user-built flows: `{ id, name, steps:[poseIds],
  transitions:[ids|null aligned], washingMachine, origin:'user', note,
  tutorials:[{title,url,videoId,creator}], incomplete }`.
  `incomplete:true` marks a draft added from a YouTube link (steps not mapped
  yet — see "Add a flow from YouTube" below); it's cleared once ≥2 steps are
  saved in the Builder. Seed flows live in `data.js`, not here.
- `practiceLogs` — `[{ id, date, partner, role, skills:[skillIds],
  confidence:1-5, notes }]`. `skills` can hold pose, transition **and flow**
  ids — the log form groups them into poses / transitions / flows & washing
  machines.

## The StorageAdapter seam (read this before adding sync)

All persistence goes through a tiny adapter object. Today it's the
localStorage implementation in `app.js`; **every app call `await`s it**, so a
network backend drops in with no screen changes.

To swap backends, implement these five methods. The app already ships two:
`LocalAdapter` (always available) and `SupabaseAdapter` (used automatically
when the user configures a project URL + key in the Data tab — see
`pickAdapter()` in `supabase-adapter.js`; no code change needed).

```js
const MyAdapter = {
  name: 'my-backend',

  // Load the whole state object, or null when nothing is stored yet.
  // Must tolerate missing/newer fields — the app merges over freshState().
  async load()  /* -> Promise<object|null> */,

  // Persist the whole state object (same shape as the localStorage JSON).
  async save(state)  /* -> Promise<void> */,

  // Delete everything (the "Reset all data" button).
  async clear()  /* -> Promise<void> */,

  // Serialize state for the Export-download button. (May stay sync.)
  exportJSON(state)  /* -> string */,

  // Parse + validate an imported JSON string for the Import button.
  // Throw new Error('human-readable reason') when invalid.
  importJSON(text)  /* -> object */,
};
```

Rules for a new adapter: never invent fields the app doesn't read; keep the
`progress` map sparse (omit `unstarted`); treat `data.js` as read-only seed
data unless you also implement the seed-table merge described below.

## Cloud sync (Supabase)

**Status: working, optional.** Without configuration the app is exactly the
v1 offline app. Add your Supabase details and it syncs across devices.

### One-time setup (about 10 minutes)

1. **Create a free Supabase project** at https://supabase.com → New project.
   Note the project URL, e.g. `https://xyzcompany.supabase.co`.
2. **Run the schema:** in the Supabase dashboard open the **SQL editor**,
   paste the entire contents of `supabase-schema.sql`, and run it. This
   creates `profiles`, `progress`, `partner_progress`, `practice_logs` and
   `user_flows` with Row Level Security (each user can only read/write their
   own rows). It is safe to run twice (`if not exists` everywhere).
3. **Confirm email auth is on:** Authentication → Providers → **Email**
   should be enabled (it is by default). If "Confirm email" is on, new
   accounts must click the link in their inbox before signing in — the app
   tells them this.
4. **Get the publishable key:** Project Settings → API → copy the
   **publishable** key (starts with `sb_publishable_…`). Never use the
   `service_role` / secret key in the app.
5. **In the app:** open 💾 Data → **☁ Cloud sync**, paste the project URL
   and publishable key, tap **Save & enable**, then **Create account** (or
   **Sign in**).

The URL and key are stored only in your browser's localStorage (under
`acroflow.supabase`) — they are never written into the code or the repo.

### Sync strategy

- **localStorage stays the working store.** Every change saves locally
  first (instant, offline-safe); cloud pushes are debounced (~1.5 s) and
  silent, with a toast only on failure.
- **First connect with data on this device + empty cloud → push.**
  Everything uploads; you keep working.
- **Fresh device (or after Reset) + cloud has data → pull.** The cloud
  becomes the local state.
- **Both sides have data → per-record last-write-wins on `updated_at`.**
  Each progress cell (skill × role), practice-log entry, flow and the
  profile settings resolve independently by newest timestamp; ties keep the
  local value. Deletes are tracked as tombstones, so deleting on one device
  removes the row everywhere (unless another device edited it *after* the
  delete — then the edit wins and the record comes back, which is the
  honest outcome).
- **One caveat:** data created *before* the first sync has no local
  timestamp. On the very first merge, a conflicting cloud record wins over
  such pre-sync local data (documented choice — it avoids clobbering the
  other device's newer edits). After that first sync every edit is
  timestamped and merges are true last-write-wins.
- **Sign-in** happens at app start too: opening the app while signed in
  pulls/merges before rendering, so the second device catches up.
- **"Sync now"** in the Data tab forces a full pull + merge + push.
- **"Reset all data"** clears the device *and* your cloud rows (it deletes
  your profile row; the schema cascades). It keeps your Supabase URL/key
  and sign-in.
- **"Remove Supabase config"** just forgets the URL/key on that browser;
  cloud data and local data are untouched.

### Table ↔ app mapping

| Table | App state | Notes |
|---|---|---|
| `profiles` | `settings` | `display_name` ↔ name, `primary_roles` ↔ primaryRoles, `training_flow_ids` ↔ trainingFlowIds, `goal_flow_ids` ↔ goalFlowIds |
| `progress` | `progress` | one row per skill × role; sparse (no `unstarted`). Pose, transition **and flow** ids share this table — no schema change needed to track machines |
| `partner_progress` | `partnerProgress` | your notes about the jam partner |
| `practice_logs` | `practiceLogs` | local `l_…` ids map to UUIDs in a local id-map |
| `user_flows` | `flows` | same UUID id-mapping; `transitions` NULLs preserved; `incomplete` + `tutorials` sync (v1.2 schema adds the two columns) |

Auth is email + password via Supabase Auth REST (`/auth/v1/signup`,
`/auth/v1/token?grant_type=password`); the session is refreshed
automatically and stored in localStorage under `acroflow.session`.

**Seed-data tradeoff** (also noted in the SQL file): the pose/transition/flow
library currently ships **static in `data.js`** — instant load, works offline,
curriculum fixes ship with the app (a 30-second GitHub Pages deploy). Moving
the seed into Supabase tables would let you fix a tutorial link without a
release, but costs you offline-first loading and needs a seed-version/cache
strategy. Stay with `data.js` until the curriculum genuinely needs
server-side editing.

## Seed library notes

- L-base only for v1: **19 poses, 27 transitions, 15 flows**
  (Ninja Star, Four Step, Beginner Flow, Cork Screw, Trap Door,
  Reverse Tumbleweed (Beginner), Final Washing Machine + Barrel Roll,
  Catherine's Wheel, Star Tumbler, Mystery Box, Musical Chairs,
  Reverse Star Tumbler, Slacker Cycle and High Barrel Roll with **sequence
  unverified** — their steps are deliberately left empty rather than
  guessed wrong; rebuild them in the Flow Builder).
- Every tutorial URL was individually fetched and verified on 2026-09-16.
  If one dies, the skill still works — they're just links.
- Tutorials with a YouTube `videoId` render as **thumbnail cards** in the
  skill detail view, and the Library list shows a small thumbnail per
  skill — so every skill is visually identifiable at a glance.
- **Flows are first-class citizens**: the Library has a 🌀 Flows tab with
  thumbnails, per-role dots, training toggles and goal stars; every flow
  detail page tracks the flow's own per-role progress separately from its
  components; training flows get a **"Flows to drill"** section in Discover
  (components ≥70% drilling+, flow not solid, ⭐ goals first) and a
  **"My goals"** section at the top of Discover with a readiness bar and a
  full component checklist; the practice log groups drilled skills into
  poses / transitions / flows; Jam keeps its component-based "both can run"
  and "one skill away" flow calculations. `trainingFlowIds`/`goalFlowIds`
  sync through the `profiles` table (v1.1 schema adds the two columns);
  flow *progress* rides the existing `progress` table with no schema change.
- Sources consulted: Partner Acrobatics L-basing manual and YouTube
  (Jacob Brown), jacobbrownacro.com, YogaSlackers acro library, Skilltaco
  acro catalog, AcroYoga Essentials progression, Acrodemy, plus community
  tutorials (Acro Adventure, AcroNoga, YogaSlackers, AcroRoots, Ulu Yoga,
  Acro Connection, Acroloco, Yogafreq, Super Dave, Lauren Clausen &
  Scott Cooper, Simons Akroyoga).
- **Add a flow from YouTube**: the 🌀 Flows tab has an "Add from YouTube"
  button. Paste a video URL (watch, youtu.be, shorts, embed and live links
  all work) — the app pulls the title/creator via YouTube oEmbed (no API
  key), or falls back to your typed name / "Untitled flow" when offline.
  The flow is saved as an **unfinished draft** (`incomplete:true`, no steps,
  auto-added to training) with the video as its tutorial. Drafts get the
  standard unfinished treatment everywhere — dashed border, reduced
  opacity, grayscale thumbnails, italic names, a "Needs steps" pill and a
  prominent **"Add steps in Builder"** CTA — and are excluded from "Flows
  to drill" / readiness math until ≥2 steps are mapped. User flows get
  **"Edit steps in Builder"** on their detail page (loads the draft,
  saves in place — same id, keeps name/tutorials/training/goals, clears
  `incomplete`); built-in flows get **"Make my own version"** instead
  (saves a new "<name> (my version)" user flow; seed data is never
  mutated). The Builder shows an "Editing …" header with a cancel option
  while an edit is loaded. `incomplete` and `tutorials` sync through the
  `user_flows` table (v1.2 schema adds the two columns).
