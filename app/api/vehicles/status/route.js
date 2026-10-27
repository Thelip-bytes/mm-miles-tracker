import { withUser, handler, HttpError } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

const STATUSES = new Set(['available', 'maintenance', 'paused']);

// Admins and managers can both change a car's status; the database function
// enforces that and touches only status + note, so this stays separate from
// the admin-only vehicle save.
export const POST = handler(async req => withUser(req, async c => {
  const { id, status, note } = await req.json();
  if (!id) throw new HttpError(400, 'Missing vehicle id');
  if (!STATUSES.has(status)) throw new HttpError(400, 'Choose Available, Maintenance or Paused.');
  const r = await c.query('select * from public.set_vehicle_status($1, $2, $3)', [id, status, note || null]);
  return { row: r.rows[0] };
}));
