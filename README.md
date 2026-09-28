# MM Miles — Self-drive rental ledger

A booking, payout and cash-flow ledger for an offline self-drive car rental
store. Built for the MM Miles team in India.

**Stack:** Next.js 14 (App Router) on Vercel · Supabase (Postgres 17 + Auth) ·
direct Postgres over the Supavisor pooler · `@supabase/supabase-js` for auth
only · `pg` on the server for data.

---

## What you get

* **Three roles, real permissions**: Admin (full), Manager (bookings while
  ongoing), Finance (read bookings, manage cash flow + payouts). Enforced by
  Postgres Row Level Security, not just hidden buttons.
* **One ledger, one source of truth**: booking money (commission, host payout,
  payment / payout / refund status) is computed by a single SQL view and
  surfaced through the API. The browser never recomputes it.
* **Admin controls the team**: Admin can change anyone's password, create new
  teammates, and change anyone's role — all from one screen, all audited.
* **Excel-friendly**: full export (5 sheets) and template-based import still
  work, against the live database.

---

## Starter accounts

These were created with the easy passwords you asked for. The admin should
change them from the **Team & passwords** screen on first login.

---

## Environment variables

Set these in `.env.local` for local dev and in the Vercel project settings for
production. **Never commit them.**

| Variable                                | Required | Notes |
|-----------------------------------------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL`              | yes      | from Supabase dashboard |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | yes      | safe in the browser |
| `SUPABASE_SECRET_KEY`                   | yes      | **server only** |
| `SUPABASE_PROJECT_REF`                  | yes      | the `mydtfp…` ref |
| `DB_PASSWORD`                           | yes      | the Postgres password |
| `SUPABASE_REGION`                       | optional | defaults to `ap-southeast-2` |

---

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

The app talks to your live Supabase project — no local Postgres needed.

## Apply the schema (one-time)

The SQL lives in `/workspace/mmschema/sql/`:

```
001_schema.sql     enums, tables, indexes, constraints
002_functions.sql  money view, triggers, helpers
003_rls.sql        row-level security policies + admin functions
004_seed.sql       category list + grants + realtime
```

Apply them with `psql` or the helper script:

```bash
node /workspace/mmschema/scripts/migrate.js
node /workspace/mmschema/scripts/seed_users.js
```

## Test it

```bash
# Schema + RLS (180 assertions, runs as postgres)
node /workspace/mmschema/scripts/test.js

# End-to-end through the running app (63 assertions)
npm run build && npm start &
node /workspace/mmschema/scripts/e2e.js
```

---

## Deploy to Vercel

```bash
npm i -g vercel
vercel link          # link to a fresh project (or existing one)
vercel env add NEXT_PUBLIC_SUPABASE_URL          # paste value
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel env add SUPABASE_SECRET_KEY
vercel env add SUPABASE_PROJECT_REF
vercel env add DB_PASSWORD
vercel env add SUPABASE_REGION          # ap-southeast-2
vercel --prod
```

The app is fully Next.js serverless-compatible: no WebSockets, no background
workers, just API routes.

---

## Architecture

```
┌─────────────────┐  sign-in (email+password)  ┌─────────────────┐
│   Browser       │ ─────────────────────────► │  Supabase Auth   │
│                 │ ◄────── JWT (access tok) ─── │                 │
│                 │                            └─────────────────┘
│  supabase-js    │
│   (auth only)   │      Bearer JWT
│                 │ ─────────────────────────►  ┌─────────────────┐
│  React UI       │  /api/data, /api/...        │  Next.js (Vercel)│
│  no DB creds    │ ◄─── JSON rows ──────────── │  pg over pooler │
└─────────────────┘                            │  RLS enforced    │
                                               └────────┬────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │   Postgres 17    │
                                               │   RLS policies   │
                                               │   booking_fin.   │
                                               └─────────────────┘
```

**Why not PostgREST?** PostgREST on this project can't verify the new-style
API keys, so the API layer is a thin Next.js shim. That's actually stronger
(DB credentials and the secret key stay on the server) and lets Postgres RLS
do the authorization with no second copy of the rules.

---

## Schema map (the interesting bits)

| File / concept | Lives in | Why |
|---|---|---|
| Booking money math | `public.booking_financials` view | One source of truth, mirrors `lib/computeBooking.js` |
| Commission rate resolution | view CTE | vehicle override → host → default 30 |
| Refund policy (no-show = 0%) | view CTE | matches the app's `cancelled/no-show` rule |
| Role permission matrix | `public.ROLE_PERMS` (not stored — see 003 RLS) | RLS policies |
| Double-booking guard | `EXCLUDE USING gist` on bookings | DB-level, can't be bypassed |
| Auto booking codes | `trg_bookings_code` | `0001, 0002…` |
| Audit trail | `public.audit_log` + `trg_audit` | SECURITY DEFINER, admin-readable |
| Admin user mgmt | `public.admin_list_users`, `admin_set_user_role`, `admin_note_password_reset` | server functions; the password change itself goes through the Auth Admin API |

See `/workspace/mmschema/CONNECTION.md` for the connection facts (pooler region,
known PostgREST caveat, etc.).
