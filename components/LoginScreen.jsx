"use client";

import { useState } from 'react';
import { Field } from './ui';
import { IconAlert, IconLock } from './icons';
import supabase from '@/lib/supabase';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (error) {
      // deliberately vague: don't reveal whether the address exists
      setError('Incorrect email or password.');
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '32px', width: '380px', maxWidth: '92vw' }}>
        <img src="/logo.png" alt="MM Miles" style={{ height: '48px', width: 'auto', display: 'block', marginBottom: '8px' }} />
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 22px' }}>Sign in to your ledger</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Field label="Email"><input type="email" required autoFocus autoComplete="username" className="mm-input" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="you@mmmiles.com" /></Field>
          <Field label="Password"><input type="password" required autoComplete="current-password" className="mm-input" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} /></Field>
          {error && <p style={{ fontSize: '12px', color: '#A8452F', margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}><IconAlert />{error}</p>}
          <button type="submit" disabled={busy} className="mm-btn mm-btn-primary" style={{ justifyContent: 'center', marginTop: '4px', opacity: busy ? 0.6 : 1 }}>
            <IconLock size={14} /> {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '18px 0 0' }}>
          First time here? An admin can create your login and set your password from the admin screen.
        </p>
      </div>
    </div>
  );
}
