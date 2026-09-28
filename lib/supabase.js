"use client";

import { createClient } from '@supabase/supabase-js';

// Browser-side Supabase client. It is used for AUTHENTICATION ONLY (sign in,
// sign out, session refresh) — never for reading or writing ledger data, so the
// publishable key is all it needs and no data credentials reach the browser.
//
// All data flows through the Next.js API routes, which hold the database
// credentials server-side and let Postgres RLS decide what this user may touch.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }
);

export default supabase;
