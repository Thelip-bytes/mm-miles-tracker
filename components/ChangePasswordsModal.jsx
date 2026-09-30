"use client";

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ModalShell, Field } from './ui';
import { IconAlert } from './icons';

const ROLE_LABEL = { admin: 'Admin', manager: 'Manager', finance: 'Finance' };

// Admin-only. The original modal edited one password per role, but the
// requirement is to change anyone's password — so each Supabase auth user
// gets a row. Visual language (Field components, ModalShell, the same
// explanatory paragraph) is kept identical to the original.
export function ChangePasswordsModal({ onCancel }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [open, setOpen] = useState({});
  const [newUser, setNewUser] = useState({ email: '', full_name: '', role: 'manager', password: '' });
  const [showAdd, setShowAdd] = useState(false);

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
      setOpen(o => ({ ...o, [u.id]: false }));
      setNotice(`Password updated for ${u.email}.`);
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
      setNewUser({ email: '', full_name: '', role: 'manager', password: '' });
      setShowAdd(false);
      setNotice('Teammate added. Share their password with them directly.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  // Render a single user as the original's Field rows — same spacing, same
  // helper text style — instead of a bordered card.
  return (
    <ModalShell title="Change role passwords" onCancel={onCancel} onSubmit={(e) => e.preventDefault()}>
      <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '0 0 14px' }}>
        These are the sign-in passwords for the team — one per Supabase auth account.
        This is a simple screen-lock, not encrypted security; anyone who can edit
        this can read them. Passwords are stored by Supabase Auth (hashed).
      </p>

      {error && <p style={{ fontSize: '12px', color: '#A8452F', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '5px' }}><IconAlert />{error}</p>}
      {notice && <p style={{ fontSize: '12px', color: '#3F6B4F', margin: '0 0 10px' }}>{notice}</p>}

      {!users && !error && <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading team…</p>}

      {(users || []).map(u => (
        <div key={u.id} style={{ marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>{u.full_name || u.email}</p>
              <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0 }}>{u.email}{u.password_reset_at ? ` · password last set ${new Date(u.password_reset_at).toLocaleString('en-IN')}` : ''}</p>
            </div>
            <select
              className="mm-input"
              style={{ width: 110, flexShrink: 0 }}
              value={u.role}
              disabled={busy}
              onChange={e => changeRole(u, e.target.value)}
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="finance">Finance</option>
            </select>
          </div>
          {open[u.id] ? (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <input
                className="mm-input"
                type="text"
                placeholder="new password"
                autoComplete="new-password"
                style={{ flex: 1 }}
                value={drafts[u.id] || ''}
                onChange={e => setDrafts(d => ({ ...d, [u.id]: e.target.value }))}
              />
              <button type="button" className="mm-btn mm-btn-primary" disabled={busy} onClick={() => savePassword(u)}>Save</button>
              <button type="button" className="mm-btn mm-btn-ghost" onClick={() => setOpen(o => ({ ...o, [u.id]: false }))}>Cancel</button>
            </div>
          ) : (
            <div style={{ marginTop: '6px' }}>
              <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm" disabled={busy} onClick={() => setOpen(o => ({ ...o, [u.id]: true }))}>Change password</button>
            </div>
          )}
        </div>
      ))}

      <div style={{ borderTop: '1px solid var(--border)', marginTop: '12px', paddingTop: '12px' }}>
        {showAdd ? (
          <form onSubmit={addUser}>
            <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '0 0 8px' }}>Add a teammate</p>
            <Field label="Email"><input className="mm-input" type="email" required value={newUser.email} onChange={e => setNewUser(n => ({ ...n, email: e.target.value }))} /></Field>
            <Field label="Full name"><input className="mm-input" value={newUser.full_name} onChange={e => setNewUser(n => ({ ...n, full_name: e.target.value }))} /></Field>
            <Field label="Initial password"><input className="mm-input" type="text" value={newUser.password} onChange={e => setNewUser(n => ({ ...n, password: e.target.value }))} /></Field>
            <Field label="Role">
              <select className="mm-input" value={newUser.role} onChange={e => setNewUser(n => ({ ...n, role: e.target.value }))}>
                <option value="manager">Manager</option>
                <option value="finance">Finance</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button type="button" className="mm-btn mm-btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="mm-btn mm-btn-primary" disabled={busy}>Add teammate</button>
            </div>
          </form>
        ) : (
          <button type="button" className="mm-btn mm-btn-ghost" onClick={() => setShowAdd(true)}>+ Add a teammate</button>
        )}
      </div>

<<<<<<< HEAD
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
=======
      <div className="mm-modal-actions" style={{ marginTop: '10px' }}>
>>>>>>> 07f5e40 (mobile)
        <button type="button" className="mm-btn mm-btn-primary" onClick={onCancel}>Done</button>
      </div>
    </ModalShell>
  );
}
