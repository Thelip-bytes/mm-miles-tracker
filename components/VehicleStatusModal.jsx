"use client";

import { useState } from 'react';
import { IconAlert } from './icons';
import { Field, ModalShell } from './ui';

export const VEHICLE_STATUSES = [
  ['available', 'Available'],
  ['maintenance', 'Maintenance'],
  ['paused', 'Paused'],
];

// Admins and managers both use this; it saves only status + note.
export function VehicleStatusModal({ form, onCancel, onSave, saving, saveError }) {
  const [status, setStatus] = useState(form.status || 'available');
  const [statusNote, setStatusNote] = useState(form.statusNote || '');
  const blocked = status !== 'available';
  function submit(e) { e.preventDefault(); onSave({ id: form.id, status, statusNote: blocked ? statusNote : '' }); }
  return (
    <ModalShell title={`Vehicle status · ${form.regNumber}`} onCancel={onCancel} onSubmit={submit}>
      <Field label="Status">
        <select className="mm-input" value={status} onChange={e => setStatus(e.target.value)}>
          {VEHICLE_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      {blocked && (
        <>
          <Field label="Reason (optional)" hint="shown when someone tries to book this car">
            <input className="mm-input" placeholder="e.g. Clutch replacement, back on 30 Oct" maxLength={200} value={statusNote} onChange={e => setStatusNote(e.target.value)} />
          </Field>
          <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: 0 }}>New bookings for this car are blocked until it's set back to Available. A trip that's already running isn't affected.</p>
        </>
      )}
      {saveError && (
        <p role="alert" style={{ fontSize: '12px', color: '#A8452F', background: '#F7E4E0', border: '1px solid #E0A79A', borderRadius: '8px', padding: '9px 11px', margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
          <IconAlert />{saveError}
        </p>
      )}
      <div className="mm-modal-actions">
        <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="mm-btn mm-btn-primary" disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save status'}
        </button>
      </div>
    </ModalShell>
  );
}
