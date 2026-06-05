# Profiles, Tips Tracker, and Family Chat Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add lightweight household profiles, a wife-focused tip-tracking module inspired by ServerLife, and a basic family group chat while keeping the Household Hub simple and modular.

**Architecture:** Keep the current single Express/PWA app and JSON/KV store, but introduce a small domain/module layer so each feature owns its data helpers and routes. Profiles become the access/context layer: a signed household session can choose an active profile; modules declare which profiles can see them. Tips and chat are separate hub modules, not bolted onto task/grocery code.

**Tech Stack:** Existing Node/Express app, current JSON/KV `readStore()`/`writeStore()` persistence, public SPA (`public/app.js`, `public/styles.css`), Node test runner, PWA service worker.

---

## Product Direction

### Core concepts

1. **Household session** remains the outer security layer for now.
   - Keep a `HOUSEHOLD_PIN=<4-digit-pin>` style shared login.
   - Do not build full email/password accounts yet.

2. **Profiles** sit inside the household session.
   - Example profiles: `Justin`, `Wife`, `Family`, later `Kids`, `Grandparents`.
   - A session chooses an active profile after PIN unlock or via a profile switcher.
   - A profile controls which nav modules appear and which personal data is shown.

3. **Modules/plugins** are route/API bundles with profile visibility.
   - Core modules: `home`, `tasks`, `calendar`, `grocery`, `documents`.
   - New optional modules: `tips`, `chat`.
   - Avoid a complex plugin runtime for now. Use a static registry file that makes modules feel plugin-like without overengineering.

4. **Tips** should be optimized for fast mobile entry.
   - One-handed end-of-shift entry.
   - Minimal fields.
   - Calendar/day summary.
   - Export back to CSV/Excel-compatible format.

5. **Chat** should start as simple family bulletin/chat, not a Signal/iMessage clone.
   - Text-only first.
   - Group channels.
   - Basic unread/new indicators.
   - No push notifications until the storage/auth model is stable.

---

## Recommended phased build

### Phase 1: Profiles + Module Registry Foundation

**Outcome:** The app knows who is using it and can show/hide modules without implementing tips/chat yet.

#### Data model

Extend `emptyStore()` in `src/db.js`:

```js
function emptyStore() {
  return {
    profiles: [],
    modules: [],
    tasks: [],
    groceryItems: [],
    tipEntries: [],
    chatThreads: [],
    chatMessages: [],
  };
}
```

Normalize old stores safely so existing data still loads.

Suggested profile shape:

```js
{
  id: 'justin',
  name: 'Justin',
  color: '#ffd60a',
  role: 'adult',
  enabledModules: ['home', 'tasks', 'calendar', 'grocery', 'documents', 'chat'],
  createdAt,
  updatedAt
}
```

Suggested initial profiles:

```js
[
  { id: 'family', name: 'Family', role: 'household', enabledModules: ['home', 'calendar', 'grocery', 'documents', 'chat'] },
  { id: 'justin', name: 'Justin', role: 'adult', enabledModules: ['home', 'tasks', 'calendar', 'grocery', 'documents', 'chat'] },
  { id: 'wife', name: 'Wife', role: 'adult', enabledModules: ['home', 'calendar', 'grocery', 'documents', 'tips', 'chat'] }
]
```

#### Files

- Create: `src/profiles.js`
- Create: `src/modules.js`
- Modify: `src/db.js`
- Modify: `src/auth.js`
- Modify: `src/server.js`
- Modify: `public/app.js`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Tests: `tests/profiles.test.js`, `tests/ui.test.js`, `tests/deploy.test.js`

#### API routes

Add:

```txt
GET  /api/profiles
GET  /api/profile
POST /api/profile/select
GET  /api/modules
```

`POST /api/profile/select` sets a signed/profile cookie or updates the existing session payload.

#### Acceptance criteria

- Existing PIN login still works.
- First login defaults to `family` profile if no selected profile exists.
- Profile switcher appears in desktop/sidebar and mobile nav.
- Module nav hides `Tips` for Justin and shows it for Wife.
- Existing tasks remain visible under current behavior until Phase 2 scopes them.
- Tests prove old stores without `profiles` still normalize correctly.

---

### Phase 2: Personal vs Family Task Scoping

**Outcome:** Justin can have personal todo lists that are not family lists, and Wife does not see irrelevant modules/tasks by default.

#### Data changes

Add ownership/scope to task records:

```js
{
  id,
  title,
  scope: 'personal' | 'family',
  profileId: 'justin' | null,
  project,
  ...existingTaskFields
}
```

Default behavior:

- Existing tasks migrate to `scope: 'family'` unless project/category strongly indicates personal. Keep it simple: default family.
- `Family` profile sees family tasks.
- `Justin` profile can toggle `Personal / Family / All` in tasks.
- `Wife` can do the same if/when she uses tasks.
- E-paper dashboard should only show `family` tasks unless explicitly enabled later.

#### Files

- Modify: `src/tasks.js`
- Modify: `src/einkDashboard.js`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Tests: `tests/features.test.js`, `tests/api.test.js`, `tests/ui.test.js`

#### API behavior

Enhance:

```txt
GET /api/tasks?scope=family
GET /api/tasks?scope=personal&profileId=justin
POST /api/tasks { title, scope, profileId, ... }
```

Server should infer default `profileId` from active profile instead of trusting only client input.

#### Acceptance criteria

- Family profile does not show Justin-only personal tasks.
- Justin profile can see personal tasks and family tasks.
- New tasks created from Justin's personal view become `scope: personal`, `profileId: justin`.
- New tasks created from Home/Family views remain `scope: family`.
- E-paper output remains family-safe.

---

### Phase 3: Tips Tracker Module MVP

**Outcome:** Wife can stop manually tracking tips in Excel for day-to-day entry, while still exporting CSV for records/taxes.

#### UX target

Mobile-first route: `/tips`

Primary screen:

- Big `Add shift` button.
- Today's date defaulted.
- Fast fields:
  - Date
  - Shift: lunch/dinner/double/custom
  - Cash tips
  - Card/credit tips
  - Tip-out / fees / deductions
  - Hours worked
  - Notes
- Computed totals:
  - Gross tips
  - Net tips
  - Hourly average
- Month summary cards:
  - This week
  - This month
  - Year to date
  - Best day
- List/calendar of recent shifts.

Do **not** start with employer payroll complexity, tax estimates, photo receipts, or multi-job support unless requested.

#### Data model

Add `tipEntries` to store:

```js
{
  id,
  profileId: 'wife',
  date: '2026-06-05',
  shift: 'dinner',
  cashTips: 0,
  cardTips: 0,
  tipOut: 0,
  hours: 0,
  notes: '',
  createdAt,
  updatedAt
}
```

Derived values:

```js
const gross = cashTips + cardTips;
const net = gross - tipOut;
const hourly = hours > 0 ? net / hours : null;
```

#### Files

- Create: `src/tips.js`
- Modify: `src/server.js`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `public/index.html`
- Modify: `public/service-worker.js`
- Tests: `tests/tips.test.js`, `tests/ui.test.js`

#### API routes

```txt
GET    /api/tips?profileId=wife&from=YYYY-MM-DD&to=YYYY-MM-DD
POST   /api/tips
PATCH  /api/tips/:id
DELETE /api/tips/:id
GET    /api/tips/summary?profileId=wife&period=month
GET    /api/tips/export.csv?profileId=wife&from=YYYY-MM-DD&to=YYYY-MM-DD
```

#### CSV export columns

```csv
Date,Shift,Cash Tips,Card Tips,Gross Tips,Tip Out,Net Tips,Hours,Hourly Average,Notes
```

#### Acceptance criteria

- Tips route appears only for Wife profile by default.
- Add shift works with numeric mobile keyboard.
- Summary updates after adding/editing/deleting shifts.
- CSV export opens/downloads and can be pasted/imported into Excel.
- Tests cover validation:
  - no negative amounts unless explicitly allowed later
  - valid date required
  - unauthorized/non-enabled profile cannot access tips

---

### Phase 4: Basic Family Chat MVP

**Outcome:** A simple private family group chat exists inside the hub.

#### Important constraint

This should start as a lightweight in-app message board/chat. True WhatsApp/Messenger behavior requires real-time transport, push notifications, media storage, delivery receipts, and stronger identity/auth. Do not build that first.

#### MVP UX

Route: `/chat`

- Thread list:
  - `Family`
  - optionally `Grandparents`
- Message list with bubbles.
- Composer at bottom.
- Sender shown by active profile.
- Poll for new messages every 10-15 seconds while page is open.
- Show simple unread count based on `lastReadAt` per profile/thread.

#### Data model

```js
chatThreads: [
  {
    id: 'family',
    name: 'Family',
    memberProfileIds: ['justin', 'wife'],
    createdAt,
    updatedAt
  }
]
```

```js
chatMessages: [
  {
    id,
    threadId: 'family',
    senderProfileId: 'justin',
    body: 'Message text',
    createdAt,
    editedAt: null,
    deletedAt: null
  }
]
```

```js
chatReads: [
  {
    threadId: 'family',
    profileId: 'justin',
    lastReadAt
  }
]
```

#### Files

- Create: `src/chat.js`
- Modify: `src/server.js`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `public/index.html`
- Modify: `public/service-worker.js`
- Tests: `tests/chat.test.js`, `tests/ui.test.js`

#### API routes

```txt
GET  /api/chat/threads
POST /api/chat/threads
GET  /api/chat/threads/:threadId/messages?after=ISO_DATE
POST /api/chat/threads/:threadId/messages
POST /api/chat/threads/:threadId/read
```

#### Acceptance criteria

- Family thread works for Justin and Wife.
- Grandparents thread can exist but only shows for profiles included as members.
- Sending a blank message returns 400.
- Messages render in chronological order.
- Active profile controls sender identity.
- Polling refreshes without losing draft text.
- No horizontal overflow on mobile.

---

### Phase 5: Home Dashboard Integration

**Outcome:** Home adapts to the active profile and module set.

#### Home behavior

Family profile:

- Family calendar
- Family tasks
- Grocery
- Documents
- Chat preview

Justin profile:

- Personal tasks
- Family calendar
- Grocery
- Chat preview
- No Tips card

Wife profile:

- Tips quick add / month total
- Family calendar
- Grocery
- Chat preview
- Optional tasks card if enabled

#### Files

- Modify: `public/app.js`
- Modify: `public/styles.css`
- Tests: `tests/ui.test.js`

#### Acceptance criteria

- `/home` changes cards based on active profile.
- Tips card does not show for Justin profile.
- Personal task counts do not leak onto Family profile.
- Chat preview only shows messages from threads the profile belongs to.

---

### Phase 6: Persistence/Deployment Hardening

**Outcome:** Data model remains safe as the store grows.

#### Work

- Make `normalizeStore()` explicitly normalize every collection.
- Add `schemaVersion` to store.
- Add migration helper:

```js
function migrateStore(store) {
  // v1 existing tasks/grocery -> v2 profiles/modules/tips/chat
}
```

- Decide whether JSON/KV remains enough.
  - For early use, yes.
  - If chat grows, consider Vercel Postgres/Supabase/SQLite-on-host later.

#### Acceptance criteria

- Existing production data survives migration.
- Tests load a pre-profile fixture and verify no data loss.
- KV and local JSON tests pass.

---

## Suggested implementation order

1. Add store schema normalization for profiles/modules/tips/chat placeholders.
2. Add profile registry and active profile selection.
3. Add module registry and profile-aware nav visibility.
4. Add task scope/profile fields and filters.
5. Add Tips API and tests.
6. Add Tips mobile UI.
7. Add Tips CSV export.
8. Add Chat API and tests.
9. Add Chat mobile UI with polling.
10. Add Home dashboard profile-aware cards.
11. Add migration tests and deploy verification.

---

## Key design decisions

### Profiles before tips/chat

Profiles are the foundation. Without profiles, tips and personal tasks become messy quickly because the app cannot know whose modules/data to show.

### Static module registry before real plugins

A dynamic plugin loader would be overkill. Use `src/modules.js`:

```js
export const modules = [
  { id: 'home', label: 'Home', href: '/home', icon: '🏠', profiles: 'all' },
  { id: 'tasks', label: 'Today', href: '/today', icon: '◷', profiles: ['justin', 'wife'] },
  { id: 'tips', label: 'Tips', href: '/tips', icon: '💵', profiles: ['wife'] },
  { id: 'chat', label: 'Chat', href: '/chat', icon: '💬', profiles: ['family', 'justin', 'wife'] }
];
```

This gives the plugin feel without a plugin system.

### Tips is private-by-default

Tips are income/work records. It should be visible only to Wife profile unless she explicitly wants family/admin access.

### Chat starts as web-only

Do not try to solve push notifications, background delivery, attachments, or encryption in MVP. Start with a useful family message board that can become more real-time later.

---

## Testing checklist

Run after each phase:

```bash
env -u HOUSEHOLD_PIN -u HOUSEHOLD_PASSWORD npm test
```

Run authenticated browser checks at mobile width for:

```txt
/home
/today
/tips
/chat
/grocery
```

For mobile overflow, verify:

```js
Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) === window.innerWidth
```

For PWA changes:

- Bump `hub-pwa-N` in `public/index.html`.
- Bump `todo-hub-vN` in `public/service-worker.js`.
- Add new app shell routes/assets.
- Verify served CSS/JS URLs in local and production.

---

## Out of scope for MVP

- Full Google/Apple account auth.
- Role-based admin console.
- Push notifications.
- Chat media uploads.
- End-to-end encryption.
- Multiple restaurants/jobs in Tips.
- Tax filing logic.
- Payroll integration.
- True installable separate apps per module.

---

## Future enhancements

### Tips

- Multiple job/location support.
- Tip pooling/tip-out presets.
- Calendar heatmap.
- Pay-period summaries.
- Tax estimate helper.
- Import existing Excel/CSV history.
- Reminder if no shift entered after usual work nights.

### Chat

- Web Push notifications.
- Attachments/photos.
- Reactions.
- Read receipts.
- Grandparent invite PIN/link.
- Discord/SMS bridge for selected threads.

### Profiles

- Per-profile PINs.
- Kids/chores profile.
- Parent-only docs.
- Profile-specific home screen ordering.

---

## First implementation slice I recommend

Build **Phase 1 + a thin Tips placeholder** first:

1. Profiles exist.
2. Active profile can be switched.
3. Nav is profile-aware.
4. Wife profile shows a Tips nav item.
5. `/tips` route renders a placeholder shell with the intended fields but no persistence yet.

That will validate the structure and UX before touching income records or chat storage.
