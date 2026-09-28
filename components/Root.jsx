"use client";

import { useState, useEffect } from 'react';
import { signInAnonymously } from 'firebase/auth';
import { getDoc, setDoc } from 'firebase/firestore';
import { auth, docRef, syncEnabled } from '@/lib/firebase';
import { ROLE_PERMS } from '@/lib/constants';
import { ROLE_PASSWORDS as DEFAULT_ROLE_PASSWORDS } from '@/lib/defaultPasswords';
import { safeGet, safeSet } from '@/lib/helpers';
import { LoginScreen } from './LoginScreen';
import { App } from './App';

function Root() {
  const [authInfo, setAuthInfo] = useState(() => safeGet('mm-auth'));
  const [rolePasswords, setRolePasswords] = useState(() => safeGet('mm-role-passwords') || DEFAULT_ROLE_PASSWORDS);
  const [passwordsReady, setPasswordsReady] = useState(!syncEnabled);

  useEffect(() => {
    if (!syncEnabled) return;
    let cancelled = false;
    signInAnonymously(auth)
      .then(() => getDoc(docRef))
      .then(snap => {
        if (cancelled) return;
        const d = snap.data();
        if (d && d.rolePasswords) {
          setRolePasswords(d.rolePasswords);
          safeSet('mm-role-passwords', d.rolePasswords);
        }
        setPasswordsReady(true);
      })
      .catch(err => { console.error('Could not fetch synced passwords, using local copy', err); setPasswordsReady(true); });
    return () => { cancelled = true; };
  }, []);

  function updateRolePasswords(next) {
    setRolePasswords(next);
    safeSet('mm-role-passwords', next);
    if (syncEnabled && docRef) setDoc(docRef, { rolePasswords: next }, { merge: true }).catch(err => console.error('Password sync failed', err));
  }

  if (!passwordsReady) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6555', fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Loading…</div>;
  }
  if (!authInfo || !ROLE_PERMS[authInfo.role]) return <LoginScreen onLogin={setAuthInfo} rolePasswords={rolePasswords} />;
  return <App authInfo={authInfo} onLogout={() => { localStorage.removeItem('mm-auth'); setAuthInfo(null); }} rolePasswords={rolePasswords} onUpdateRolePasswords={updateRolePasswords} />;
}

export default Root;
