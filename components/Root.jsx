"use client";

import { useState, useEffect } from 'react';
import { ROLE_PERMS } from '@/lib/constants';
import { safeGet, safeSet } from '@/lib/helpers';
import supabase from '@/lib/supabase';
import { LoginScreen } from './LoginScreen';
import { App } from './App';

function Root() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  // role/profile live alongside the session rather than in localStorage — a
  // stale cached role would let the UI show the wrong tabs until a reload.
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setBooting(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s ?? null);
      setBooting(false);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  // pull the profile (which carries the role) whenever the user changes
  useEffect(() => {
    let active = true;
    if (!session) { setProfile(null); return; }
    (async () => {
      try {
        const res = await fetch('/api/data', { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (!active) return;
        setProfile({ role: body.role, id: body.profile?.id, full_name: body.profile?.full_name });
      } catch (e) {
        console.error('Could not load profile', e);
        if (active) setProfile({ role: null, error: true });
      }
    })();
    return () => { active = false; };
  }, [session]);

  async function logout() {
    await supabase.auth.signOut();
    safeSet('mm-auth', null);
    setProfile(null);
  }

  if (booting) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6555', fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Loading…</div>;
  }
  if (!session) return <LoginScreen />;

  if (!profile) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6555', fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Loading your workspace…</div>;
  }
  if (!ROLE_PERMS[profile.role]) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '32px', maxWidth: '420px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 8px' }}>This account has no role yet</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
            Ask an admin to set your role, then sign in again.
          </p>
          <button type="button" className="mm-btn mm-btn-primary" onClick={logout}>Sign out</button>
        </div>
      </div>
    );
  }

  return <App role={profile.role} userId={profile.id} onLogout={logout} />;
}

export default Root;
