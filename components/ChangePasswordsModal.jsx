"use client";

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ModalShell } from './ui';
import { IconAlert } from './icons';

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', finance: 'Finance' };

function randomPassword() {
  // readable starter password: no ambiguous characters, easy to retype over the phone
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', lower = 'abcdefghijkmnopqrstuvwxyz', digit = '23456789';
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  const all = upper + lower + digit;
  return pick(upper) + pick(lower) + pick(digit) + pick(all) + pick(all) + pick(all) + pick(digit) + pick(all);
}

// Admin-only. Lists the team and lets the admin set anyone's password, or add a
// new teammate. The actual credential change happens on the server via the
// Supabase Auth admin API — no password is ever stored in this app's data.
export function ChangePasswordsModal({ onCancel }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});          // userId -> new password
  const [confirming, setConfirming] = useState(null); // userId currently being saved
  const [newUser, setNewUser] = useState({ email: '', full_name: '', role: 'manager', password: randomPassword() });

  useEffect(() => {
    let active = true;
    api.listUsers()
      .then(({ users }) => { if (active) { setUsers(users); setDrafts(Object.fromEntries(users.map(u => [u.id, '']))); } })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  async function savePassword(u) {
    const pw = drafts[u.id];
    if (!pw || pw.length < 6) { setError(`Enter a password of at least 6 characters for ${u.email}.`); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await api.resetPassword(u.id, pw);
      setDrafts(d => ({ ...d, [u.id]: '' }));
      setConfirming(null);
      setNotice(`Password updated for ${u.email}. They can sign in with it now.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function changeRole(u, role) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api.setRole(u.id, role);
      setUsers(list => list.map(x => x.id === u.id ? { ...x, role } : x));
      setNotice(`${u.email} is now ${ROLE_LABEL[role]}.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function addUser(e) {
    e.preventDefault();
    if (!newUser.email || !newUser.password) { setError('Email and password are required.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await api.createUser(newUser);
      const { users } = await api.listUsers();
      setUsers(users);
      setDrafts(d => ({ ...d, ...Object.fromEntries(users.map(u => [u.id, ''])) }));
      setNewUser({ email: '', full_name: '', role: 'manager', password: randomPassword() });
      setNotice('Teammate added. Share their password with them directly.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <ModalShell title="Team & passwords" onCancel={onCancel}>
      <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '0 0 14px' }}>
        Set a password for anyone, or change what they're allowed to do. Passwords are stored by
        Supabase Auth (hashed, never readable) — this screen only ever sets them.
      </p>

      {error && <p style={{ fontSize: '12px', color: '#A8452F', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '5px' }}><IconAlert />{error}</p>}
      {notice && <p style={{ fontSize: '12px', color: '#3F6B4F', margin: '0 0 10px' }}>{notice}</p>}

      {!users && !error && <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading team…</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '46vh', overflowY: 'auto' }}>
        {(users || []).map(u => (
          <div key={u.id} style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.full_name || u.email}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0 }}>{u.email}</p>
              </div>
              <select
                className="mm-input"
                style={{ width: 120, flexShrink: 0 }}
                value={u.role}
                disabled={busy}
                onChange={e => changeRole(u, e.target.value)}
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="finance">Finance</option>
              </select>
            </div>
            {u.password_reset_at && (
              <p style={{ fontSize: '10px', color: 'var(--text-faint)', margin: '4px 0 0' }}>
                password last set {new Date(u.password_reset_at).toLocaleString('en-IN')}
              </p>
            )}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <input
                className="mm-input"
                type="text"
                placeholder="new password"
                autoComplete="new-password"
                value={drafts[u.id] || ''}
                onChange={e => setDrafts(d => ({ ...d, [u.id]: e.target.value }))}
              />
              {confirming === u.id ? (
                <>
                  <button type="button" className="mm-btn mm-btn-primary" disabled={busy} onClick={() => savePassword(u)}>Confirm</button>
                  <button type="button" className="mm-btn mm-btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
                </>
              ) : (
                <button type="button" className="mm-btn mm-btn-gold" disabled={busy} onClick={() => setConfirming(u.id)}>Set</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={addUser} style={{ borderTop: '1px solid var(--border)', marginTop: '14px', paddingTop: '12px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 8px' }}>Add a teammate</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <input className="mm-input" type="email" required placeholder="email" value={newUser.email} onChange={e => setNewUser(n => ({ ...n, email: e.target.value }))} />
          <input className="mm-input" type="text" placeholder="name" value={newUser.full_name} onChange={e => setNewUser(n => ({ ...n, full_name: e.target.value }))} />
          <input className="mm-input" type="text" placeholder="password" value={newUser.password} onChange={e => setNewUser(n => ({ ...n, password: e.target.value }))} />
          <select className="mm-input" value={newUser.role} onChange={e => setNewUser(n => ({ ...n, role: e.target.value }))}>
            <option value="manager">Manager</option>
            <option value="finance">Finance</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
          <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel}>Done</button>
          <button type="submit" className="mm-btn mm-btn-primary" disabled={busy}>Add teammate</button>
        </div>
      </form>
    </ModalShell>
  );
}
