"use client";

import { useState, useEffect } from 'react';
import { ROLE_PERMS } from '@/lib/constants';
import supabase from '@/lib/supabase';
import { LoginScreen } from './LoginScreen';
import { App } from './App';

function Root() {
  const [authInfo, setAuthInfo] = useState(undefined);

  useEffect(() => {
    let active = true;
    // pick up a session that may already exist (e.g. after a hard refresh)
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) loadProfile(data.session).then(setAuthInfo);
      else setAuthInfo(null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      if (s) loadProfile(s).then(setAuthInfo);
      else setAuthInfo(null);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  async function loadProfile(session) {
    const res = await fetch('/api/data', { headers: { Authorization: `Bearer ${session.access_token}` } });
    if (!res.ok) return null;
    const body = await res.json();
    if (!body.role) return null;
    return { role: body.role, id: body.profile?.id };
  }

  function logout() {
    supabase.auth.signOut();
  }

  if (authInfo === undefined) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6555', fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Loading…</div>;
  }
  if (!authInfo) return <LoginScreen />;
  return <App role={authInfo.role} userId={authInfo.id} onLogout={logout} />;
}

export default Root;
