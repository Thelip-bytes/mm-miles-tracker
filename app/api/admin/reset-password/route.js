import { withUser, handler, HttpError, adminClient } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

// Admin resets a teammate's password.
//
// This cannot be done from the browser: Supabase Auth will only let the service
// key set another user's credential. The route therefore (1) proves the caller
// is an admin via RLS, (2) updates the credential server-side, and (3) records
// the change in the audit trail.
//
// The target user never needs to know their old password, and an admin does not
// need the target's current session.
export const POST = handler(async (req) => withUser(req, async (c) => {
  const isAdmin = (await c.query('select public.is_admin() as a')).rows[0].a;
  if (!isAdmin) throw new HttpError(403, 'Only an admin can reset passwords');

  const { userId, newPassword } = await req.json();
  if (!userId || !newPassword) throw new HttpError(400, 'userId and newPassword are required');
  if (String(newPassword).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');

  const target = (await c.query('select id, role from public.profiles where id = $1', [userId])).rows[0];
  if (!target) throw new HttpError(404, 'No such user');

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password: String(newPassword),
  });
  if (error) throw new HttpError(400, error.message);

  // Record it (this also stamps profiles.password_reset_at and writes audit_log)
  await c.query('select public.admin_note_password_reset($1)', [userId]);

  return { ok: true, userId, role: target.role };
}));
