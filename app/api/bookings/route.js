import { withUser, handler, HttpError, pickColumns } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

const MONEY_COLUMNS = new Set([
  'rate', 'damage_km_rate', 'rental_amount', 'extra_hour_charge', 'extra_km_charge',
  'damage_amount', 'fuel_amount', 'fine_amount', 'toll_amount', 'rental_commission',
  'extra_hour_commission', 'km_damage_base', 'km_damage_commission', 'pass_through_base',
  'total_commission', 'gross_revenue', 'extras', 'host_payout', 'total_due', 'paid_online',
  'paid_cash', 'paid_total', 'balance', 'payout_paid', 'payout_balance', 'refund_due',
  'refund_paid', 'refund_balance', 'effective_refund_percent', 'daily_rate', 'hourly_rate',
  'pkg4hr_rate', 'pkg4hr_km', 'pkg4to10_rate', 'pkg4to10_km', 'pkg12hr_rate', 'pkg12hr_km',
  'km_limit', 'extra_km_rate', 'extra_hour_rate', 'commission_rate', 'amount', 'start_km',
  'end_km', 'extra_hours', 'extra_km', 'refund_percent', 'days', 'year',
]);

/** Save and return the database-computed view row in one API request. */
export const POST = handler(async req => withUser(req, async c => {
  const body = await req.json();
  const data = pickColumns('bookings', body);
  const columns = Object.keys(data);
  if (!columns.length) throw new HttpError(400, 'Nothing to save');

  let id;
  if (body.id) {
    const setClause = columns.map((column, i) => `${column} = $${i + 1}`).join(', ');
    const result = await c.query(
      `update bookings set ${setClause} where id = $${columns.length + 1} returning id`,
      [...columns.map(column => data[column]), body.id]
    );
    if (!result.rowCount) throw new HttpError(404, 'bookings row not found');
    id = result.rows[0].id;
  } else {
    const result = await c.query(
      `insert into bookings (${columns.join(', ')})
       values (${columns.map((_, i) => `$${i + 1}`).join(', ')})
       returning id`,
      columns.map(column => data[column])
    );
    id = result.rows[0].id;
  }

  const result = await c.query(
    'select booking_id as id, * from public.booking_financials where booking_id = $1',
    [id]
  );
  if (!result.rowCount) throw new HttpError(500, 'Saved booking was not available in the financial view');

  const row = {};
  for (const [key, value] of Object.entries(result.rows[0])) {
    row[key] = MONEY_COLUMNS.has(key) && value != null ? Number(value) : value;
  }
  return { row };
}));
