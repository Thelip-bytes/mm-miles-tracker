import { Pool } from 'pg';
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
// ============================================================================

const REGION = process.env.SUPABASE_REGION || 'ap-southeast-2';

const pool = new Pool({
  host: `aws-0-${REGION}.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${process.env.SUPABASE_PROJECT_REF}`,
  password: process.env.DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
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

/**
 * Run `fn` inside a transaction impersonating the caller, so RLS applies.
 * `fn` receives a pg client.
 */
export async function withUser(req, fn) {
  const token = bearer(req);
  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Invalid or expired session');

  const claims = {
    sub: data.user.id,
    role: 'authenticated',
    email: data.user.email,
    aud: 'authenticated',
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims', JSON.stringify(claims),
    ]);
    await client.query('SET LOCAL ROLE authenticated');
    const result = await fn(client, data.user);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    // Map Postgres/RLS errors onto sensible HTTP statuses.
    if (/row-level security|permission denied/i.test(e.message)) throw new HttpError(403, 'Not allowed');
    if (/only an admin/i.test(e.message)) throw new HttpError(403, e.message);
    if (/duplicate key|unique/i.test(e.message)) throw new HttpError(409, e.message);
    if (/violates check constraint|exclusion constraint|is a .* entry|category/i.test(e.message)) throw new HttpError(400, e.message);
    if (/violates foreign key/i.test(e.message)) throw new HttpError(400, 'Referenced record does not exist');
    if (/cannot remove your own/i.test(e.message)) throw new HttpError(403, e.message);
    throw e;
  } finally {
    client.release();
  }
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
