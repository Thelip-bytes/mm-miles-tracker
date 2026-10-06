import { withUser, handler } from '@/lib/server/db';

// On-demand customer photos.
//
// Photos are stored as compressed base64 data URLs on the customer row, so they
// are by far the heaviest part of the ledger — hundreds of kilobytes each, three
// per customer. /api/data no longer returns them; this route does, and the UI
// only calls it when the Customers tab is opened or a customer form is edited.
//
//   GET /api/customers/photos           -> every photo, as { [id]: {...} }
//   GET /api/customers/photos?id=<uuid> -> one customer's photos
//
// Either way it is a single round trip.
export const dynamic = 'force-dynamic';

const COLUMNS = 'id, photo, aadhar_photo, license_photo';

export const GET = handler(async (req) => withUser(req, async (c) => {
  const id = new URL(req.url).searchParams.get('id');

  const r = id
    ? await c.query(`select ${COLUMNS} from public.customers where id = $1`, [id])
    : await c.query(
        `select ${COLUMNS} from public.customers
          where photo is not null or aadhar_photo is not null or license_photo is not null`
      );

  if (id) {
    const row = r.rows[0];
    return { photos: row ? { [row.id]: toShape(row) } : {} };
  }

  const photos = {};
  for (const row of r.rows) photos[row.id] = toShape(row);
  return { photos };
}));

function toShape(row) {
  return {
    photo: row.photo || '',
    aadharPhoto: row.aadhar_photo || '',
    licensePhoto: row.license_photo || '',
  };
}
