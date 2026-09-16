# AcroFlow 🤸

An offline-first, installable web app for tracking your acro-yoga practice:
a **skill graph** of L-base poses and transitions (tracked separately, per
role), a "what should I learn next?" discovery engine, a flow builder that
detects washing machines, a two-person jam comparison, and a practice log.

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

- `settings` — `{ name, primaryRoles: ['base','flyer'] }`
- `progress` — `{ skillId: { base, flyer, spotter } }`, each level one of
  `unstarted | learning | drilling | solid | teach`. Poses and transitions are
  tracked **separately** — knowing Bird and Throne says nothing about
  Bird → Throne. Only non-`unstarted` entries are stored.
- `partnerProgress` — same shape, for the Jam partner profile on this device.
- `flows` — user-built flows: `{ id, name, steps:[poseIds],
  transitions:[ids|null aligned], washingMachine, origin:'user', note }`.
  Seed flows live in `data.js`, not here.
- `practiceLogs` — `[{ id, date, partner, role, skills:[skillIds],
  confidence:1-5, notes }]`.

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
| `profiles` | `settings` | `display_name` ↔ name, `primary_roles` ↔ primaryRoles |
| `progress` | `progress` | one row per skill × role; sparse (no `unstarted`) |
| `partner_progress` | `partnerProgress` | your notes about the jam partner |
| `practice_logs` | `practiceLogs` | local `l_…` ids map to UUIDs in a local id-map |
| `user_flows` | `flows` | same UUID id-mapping; `transitions` NULLs preserved |

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

- L-base only for v1: **19 poses, 20 transitions, 5 flows**
  (Ninja Star, Four Step, Beginner Flow + Barrel Roll and Catherine's Wheel
  with **sequence unverified** — their steps are deliberately left empty
  rather than guessed wrong; rebuild them in the Flow Builder).
- Every tutorial URL was individually fetched and verified on 2026-09-16.
  If one dies, the skill still works — they're just links.
- Sources consulted: Partner Acrobatics L-basing manual, YogaSlackers acro
  library, Skilltaco acro catalog, AcroYoga Essentials progression, plus
  community tutorials (Acro Adventure, AcroNoga, YogaSlackers, AcroRoots,
  Ulu Yoga, Acro Connection, Acroloco, Acrodemy).
