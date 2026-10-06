"use client";

import { useState, useEffect, useRef } from 'react';
import supabase from '@/lib/supabase';
import { LoginScreen } from './LoginScreen';
import { App } from './App';

// The login gate loads /api/data once and passes it into App. This avoids a
// sequential role lookup followed by a second full-ledger request on every
// page open. Customer photos are excluded from that payload and loaded only
// when the Customers tab needs them.
//
// `resolvedToken` deduplicates completed lookups, and both callbacks can await
// the same in-flight request. TOKEN_REFRESHED still works because it arrives
// with a new token.
function Root() {
  const [authInfo, setAuthInfo] = useState(undefined);
  const resolvedToken = useRef(null);
  const inFlight = useRef(null);
  const currentToken = useRef(null);

  useEffect(() => {
    let active = true;

    async function resolve(session) {
      if (!session) {
        currentToken.current = null;
        resolvedToken.current = null;
        if (active) setAuthInfo(null);
        return;
      }
      const token = session.access_token;
      currentToken.current = token;
      if (resolvedToken.current === token) return;      // already handled this session
      let request = inFlight.current?.token === token ? inFlight.current.promise : null;
      if (!request) {
        // Keep the promise so a second Strict Mode effect can await the same
        // request and still update its own (active) component lifecycle.
        request = fetch('/api/data', { headers: { Authorization: `Bearer ${token}` } })
          .then(async res => res.ok ? res.json() : null);
        inFlight.current = { token, promise: request };
      }
      try {
        const body = await request;
        if (!active || currentToken.current !== token) return;
        resolvedToken.current = body?.role ? token : null;
        setAuthInfo(body?.role ? { role: body.role, id: body.profile?.id, initialData: body } : null);
      } catch {
        if (active && currentToken.current === token) {
          resolvedToken.current = null;
          setAuthInfo(null);
        }
      } finally {
        if (inFlight.current?.promise === request) inFlight.current = null;
      }
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => resolve(s));

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  function logout() {
    supabase.auth.signOut();
  }

  if (authInfo === undefined) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6555', fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Loading…</div>;
  }
  if (!authInfo) return <LoginScreen />;
  return <App role={authInfo.role} userId={authInfo.id} initialData={authInfo.initialData} onLogout={logout} />;
}

export default Root;
