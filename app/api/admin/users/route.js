import { withUser, handler, HttpError, adminClient } from '@/lib/server/db';

export const dynamic = 'force-dynamic';

// Team directory for the admin screen. RLS blocks this for non-admins
// (public.admin_list_users raises), so a 403 here is the correct answer.
export const GET = handler(async (req) => withUser(req, async (c) => {
  const isAdmin = (await c.query('select public.is_admin() as a')).rows[0].a;
  if (!isAdmin) throw new HttpError(403, 'Only an admin can list users');
  const r = await c.query('select * from public.admin_list_users()');
  return { users: r.rows };
}));

// Create a new team member. Supabase Auth owns the credential, so this must run
// with the service key on the server — the browser can never mint a user.
export const POST = handler(async (req) => withUser(req, async (c, user) => {
  const isAdmin = (await c.query('select public.is_admin() as a')).rows[0].a;
  if (!isAdmin) throw new HttpError(403, 'Only an admin can add users');

  const { email, password, role, full_name } = await req.json();
  if (!email || !password) throw new HttpError(400, 'Email and password are required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'That email looks invalid');
  if (String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters');

  const { data, error } = await adminClient.auth.admin.createUser({
    email: String(email).toLowerCase().trim(),
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || '', role: role || 'finance' },
  });
  if (error) throw new HttpError(400, error.message);

  const ins = await c.query(
    `insert into public.profiles (id, full_name, role) values ($1,$2,$3)
     on conflict (id) do update set full_name = excluded.full_name, role = excluded.role
     returning id, full_name, role`,
    [data.user.id, full_name || '', role || 'finance']
  );
  return { user: ins.rows[0] };
}));
