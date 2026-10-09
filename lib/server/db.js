import { Pool, escapeLiteral } from 'pg';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Server-side database access.
//
// PostgREST is not usable on this Supabase project (it cannot verify the new
// sb_secret_ keys and its schema-cache query fails), so data access goes over
// the Supavisor pooler instead. That is actually the stronger posture:
//
//   * DB credentials and the service key never reach the browser.
//   * Every request is authenticated against Supabase Auth, then the session
//     runs as `authenticated` with the caller's JWT claims set, so Postgres
//     RLS decides what they may touch. The API is not a second, weaker copy of
//     the permission rules.
//
// PERFORMANCE NOTE -----------------------------------------------------------
// Every statement sent to Postgres costs one network round trip, and a
// serverless function is usually NOT in the same region as the database.
// At ~200 ms per hop the difference between 12 statements and 3 statements is
// 1.8 seconds on every single request. So this module is deliberately written
// to make as few round trips as possible:
//
//   1. `begin + set claims + set role` are sent as ONE multi-statement query.
//      Postgres runs a simple-query string in a single transaction unless it
//      contains explicit BEGIN/COMMIT, so the transaction stays open for the
//      caller's work and is closed by the `commit` below.
//   2. The Supabase Auth verification is cached per access token for a short
//      window, so a warm lambda doesn't pay an extra HTTPS hop per request.
//   3. Callers that need several result sets should send them as ONE
//      multi-statement query (see `multi()`), not `Promise.all` — a pg client
//      executes queued queries strictly one at a time, so `Promise.all` on a
//      single client gives no parallelism at all.
// ============================================================================

const REGION = process.env.SUPABASE_REGION || 'ap-southeast-2';

const pool = new Pool({
  host: `aws-0-${REGION}.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${process.env.SUPABASE_PROJECT_REF}`,
  password: process.env.DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  // Keep this small: each Vercel lambda instance gets its own pool, and the
  // Supabase free plan caps total connections. 3 per instance is plenty for a
  // single-store ledger and avoids queueing/timeouts under a burst of saves.
  max: 3,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
});

export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function bearer(req) {
  const h = req.headers.get('authorization') || '';
  if (!h.toLowerCase().startsWith('bearer ')) throw new HttpError(401, 'Missing bearer token');
  return h.slice(7).trim();
}

// ---------------------------------------------------------------------------
// Auth verification cache.
//
// `adminClient.auth.getUser()` is an HTTPS call to GoTrue, which is hosted next
// to the database — i.e. on the far side of the planet from a default `iad1`
// Vercel function. Caching the result for the life of the token (bounded here
// to a short window so a revoked session still bounces quickly) removes one
// full round trip from every API call after the first.
// ---------------------------------------------------------------------------
const AUTH_TTL_MS = 55_000;
const AUTH_CACHE_MAX = 100;
const authCache = new Map(); // token -> { user, exp }

async function verifyToken(token) {
  const now = Date.now();
  const hit = authCache.get(token);
  if (hit && hit.exp > now) return hit.user;

  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data?.user) {
    authCache.delete(token);
    throw new HttpError(401, 'Invalid or expired session');
  }
  authCache.set(token, { user: data.user, exp: now + AUTH_TTL_MS });
  // Map keeps insertion order, so this evicts the oldest entry.
  if (authCache.size > AUTH_CACHE_MAX) authCache.delete(authCache.keys().next().value);
  return data.user;
}

/** Drop cached auth for a token (call after sign-out / password reset). */
export function forgetToken(token) { if (token) authCache.delete(token); }

/**
 * Run `fn` inside a transaction impersonating the caller, so RLS applies.
 * `fn` receives a pg client.
 */
export async function withUser(req, fn) {
  const token = bearer(req);
  const user = await verifyToken(token);

  const claims = {
    sub: user.id,
    role: 'authenticated',
    email: user.email,
    aud: 'authenticated',
  };

  const client = await pool.connect();
  try {
    // ONE round trip for the whole session setup. `escapeLiteral` is used
    // because a multi-statement simple query cannot carry bind parameters; the
    // claims object is built here from verified server-side data, never from
    // the request body.
    const claimsLit = escapeLiteral(JSON.stringify(claims));
    await client.query(
      `begin; select set_config('request.jwt.claims', ${claimsLit}, true); set local role authenticated;`
    );
    const result = await fn(client, user);
    await client.query('commit');
    return result;
  } catch (e) {
    try { await client.query('rollback'); } catch {}
    // Map Postgres/RLS errors onto sensible HTTP statuses.
    if (/row-level security|permission denied/i.test(e.message)) throw new HttpError(403, 'This account does not have permission for that change. Ask an admin to check your role.');
    if (/only an admin/i.test(e.message)) throw new HttpError(403, e.message);
    if (/duplicate key|unique/i.test(e.message)) throw new HttpError(409, e.message);
    if (e.constraint === 'bookings_check') throw new HttpError(400, 'The booking end date and time must be later than its start date and time. Please correct the dates and try again.');
    if (e.constraint === 'bookings_no_overlap' || e.code === '23P01') throw new HttpError(409, 'This vehicle already has another booking during those dates. Choose a different vehicle or adjust the booking dates.');
    if (e.constraint === 'bookings_check1') throw new HttpError(400, 'Enter a reason for the overridden booking price before saving.');
    if (e.constraint === 'bookings_days_check') throw new HttpError(400, 'The booking duration must be at least 1 day. Check the start and end dates.');
    if (e.constraint?.startsWith('bookings_') && e.constraint.endsWith('_check')) throw new HttpError(400, 'A booking amount, kilometer reading, or refund percentage is outside its allowed range. Check the highlighted values and try again.');
    if (e.constraint === 'transactions_amount_check') throw new HttpError(400, 'Income and expense amounts cannot be negative. Enter at least ₹0.');
    if (e.constraint === 'transactions_category_fkey' || /is a .* entry|category/i.test(e.message)) throw new HttpError(400, 'Choose a category that matches whether this entry is income or an expense.');
    if (/violates check constraint|exclusion constraint/i.test(e.message)) throw new HttpError(400, 'One or more values do not meet the booking or ledger rules. Check the dates, amounts, and readings.');
    if (/violates foreign key/i.test(e.message)) throw new HttpError(400, 'Referenced record does not exist');
    if (/cannot remove your own/i.test(e.message)) throw new HttpError(403, e.message);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Run several SELECTs as a single round trip.
 *
 * `statements` must be plain SQL with NO bind parameters (a multi-statement
 * simple query cannot be parameterised) — use `current_setting(
 * 'request.jwt.claims', true)::json ->> 'sub'` where you need the caller's id.
 * Returns an array of `rows`, one per statement, in order.
 */
export async function multi(client, statements) {
  // pg's simple-query protocol accepts several statements in one string, but
  // PostgreSQL still needs a semicolon between each statement. Without these,
  // the next SELECT is parsed as part of the previous one and /api/data fails
  // with a syntax error near "select".
  const sql = `${statements.join(';\n')};`;
  const res = await client.query(sql);
  const list = Array.isArray(res) ? res : [res];
  return list.map(r => r.rows);
}

/** Standard route wrapper: returns JSON, maps errors to status codes. */
export function handler(fn) {
  return async (req, ctx) => {
    try {
      const body = await fn(req, ctx);
      return Response.json(body ?? { ok: true });
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('[api]', e);
      return Response.json({ error: e.message || 'Server error' }, { status });
    }
  };
}

/** Columns a client may set, per table. Strips anything else. */
const ALLOWED = {
  bookings: ['code', 'vehicle_id', 'customer_id', 'starts_at', 'ends_at', 'days', 'closing_time',
    'rental_amount', 'extra_hours', 'extra_hour_charge', 'extra_km', 'extra_km_charge',
    'toll_amount', 'fuel_amount', 'damage_amount', 'fine_amount', 'start_km', 'end_km',
    'status', 'refund_percent', 'cancelled_at', 'price_overridden', 'price_override_reason', 'notes'],
  vehicles: ['host_id', 'reg_number', 'make', 'model', 'year', 'fuel', 'transmission',
    'daily_rate', 'hourly_rate', 'pkg4hr_rate', 'pkg4hr_km', 'pkg4to10_rate', 'pkg4to10_km',
    'pkg12hr_rate', 'pkg12hr_km', 'km_policy', 'km_limit', 'extra_km_rate', 'extra_hour_rate',
    'commission_rate', 'is_active', 'notes'],
  hosts: ['name', 'phone', 'commission_rate', 'bank_details', 'notes', 'is_active'],
  customers: ['name', 'aadhar', 'license_number', 'phone', 'address', 'photo', 'aadhar_photo', 'license_photo', 'notes'],
  transactions: ['booked_on', 'type', 'category', 'amount', 'mode', 'booking_id', 'note'],
};

export function pickColumns(table, body) {
  const allowed = ALLOWED[table];
  if (!allowed) throw new HttpError(400, `Unknown table ${table}`);
  const out = {};
  for (const k of allowed) if (k in (body || {})) out[k] = body[k] === '' ? null : body[k];
  return out;
}

/** Generic upsert/delete used by the CRUD routes. */
export function crudRoutes(table) {
  return {
    save: handler(async (req) => withUser(req, async (c, user) => {
      const body = await req.json();
      const data = pickColumns(table, body);
      if (!Object.keys(data).length) throw new HttpError(400, 'Nothing to save');

      if (body.id) {
        const cols = Object.keys(data);
        const setClause = cols.map((k, i) => `${k} = $${i + 1}`).join(', ');
        const r = await c.query(
          `update ${table} set ${setClause} where id = $${cols.length + 1} returning *`,
          [...cols.map(k => data[k]), body.id]
        );
        if (!r.rowCount) throw new HttpError(404, `${table} row not found`);
        return { row: r.rows[0] };
      }
      const cols = Object.keys(data);
      const r = await c.query(
        `insert into ${table} (${cols.join(', ')})
         values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
         returning *`,
        cols.map(k => data[k])
      );
      return { row: r.rows[0] };
    })),

    remove: handler(async (req, ctx) => withUser(req, async (c) => {
      const id = ctx?.params?.id || new URL(req.url).searchParams.get('id');
      if (!id) throw new HttpError(400, 'Missing id');
      const r = await c.query(`delete from ${table} where id = $1 returning id`, [id]);
      // 0 rows = either it doesn't exist OR RLS hid it from this user. From the
      // caller's perspective those are indistinguishable, and "not allowed" is
      // the safer answer (it doesn't leak whether the row exists).
      if (!r.rowCount) throw new HttpError(403, 'Not allowed');
      return { ok: true };
    })),
  };
}
