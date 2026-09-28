import { withUser, handler, HttpError } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

// Admin changes a teammate's app role. The permission check itself lives in the
// database function (public.admin_set_user_role), so it is enforced even if this
// route were bypassed.
export const POST = handler(async (req) => withUser(req, async (c) => {
  const { userId, role } = await req.json();
  if (!userId || !role) throw new HttpError(400, 'userId and role are required');
  if (!['admin', 'manager', 'finance'].includes(role)) throw new HttpError(400, 'Unknown role');

  try {
    await c.query('select public.admin_set_user_role($1, $2::public.app_role)', [userId, role]);
  } catch (e) {
    if (/only an admin|cannot remove your own/i.test(e.message)) throw new HttpError(403, e.message);
    if (/no such user/i.test(e.message)) throw new HttpError(404, e.message);
    throw e;
  }
  return { ok: true, userId, role };
}));
