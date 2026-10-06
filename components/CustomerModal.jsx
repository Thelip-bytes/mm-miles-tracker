"use client";

import { useState, useEffect } from 'react';
import { IconAlert } from './icons';
import { Field, ModalShell } from './ui';
import { PhotoCapture } from './PhotoCapture';

export function CustomerModal({ form, photos, onCancel, onSave, saving, syncing, saveError }) {
  const [data, setData] = useState(form);
  const [error, setError] = useState('');
  const set = (k, v) => setData(d => ({ ...d, [k]: v }));

  // The three images live on the customer row but are NOT part of /api/data —
  // they are fetched on demand from /api/customers/photos because each one is a
  // few hundred KB of base64. Until they arrive we must not let a save send
  // blank strings, or it would wipe the photos already stored.
  const photosPending = !!data.id && !photos &&
    !!(data.hasPhoto || data.hasAadharPhoto || data.hasLicensePhoto);

  useEffect(() => {
    if (!photos) return;
    setData(d => ({
      ...d,
      photo: d.photo || photos.photo || '',
      aadharPhoto: d.aadharPhoto || photos.aadharPhoto || '',
      licensePhoto: d.licensePhoto || photos.licensePhoto || '',
    }));
  }, [photos]);

  function submit(e) {
    e.preventDefault();
    if (!data.name || !data.aadhar || !data.licenseNumber || !data.address) {
      setError('Name, Aadhar number, license number, and address are all required.');
      return;
    }
    setError('');
    onSave(data);
  }

  return (
    <ModalShell title={data.id ? 'Edit customer' : 'New customer'} onCancel={onCancel} onSubmit={submit}>
      <Field label="Name *"><input required className="mm-input" value={data.name || ''} onChange={e => set('name', e.target.value)} /></Field>
      <div className="mm-form-grid">
        <Field label="Aadhar number *"><input required placeholder="XXXX XXXX XXXX" className="mm-input" style={{ fontFamily: '"IBM Plex Mono", monospace' }} value={data.aadhar || ''} onChange={e => set('aadhar', e.target.value)} /></Field>
        <Field label="License number *"><input required placeholder="DL number" className="mm-input" style={{ fontFamily: '"IBM Plex Mono", monospace' }} value={data.licenseNumber || ''} onChange={e => set('licenseNumber', e.target.value)} /></Field>
      </div>
      <div className="mm-form-grid">
        <Field label="Phone"><input className="mm-input" value={data.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
        <Field label="Address *"><input required className="mm-input" value={data.address || ''} onChange={e => set('address', e.target.value)} /></Field>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 4px' }}>Photos</p>
        <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '0 0 10px' }}>Optional, but useful for verification. On a phone this opens the camera directly; on a computer it opens a file picker. Photos are compressed and stored with the customer record.</p>
        <div className="mm-form-grid" style={{ '--cols': 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
          <PhotoCapture label="Renter photo" value={data.photo || ''} onChange={(v) => set('photo', v)} loading={photosPending} />
          <PhotoCapture label="Aadhar card" value={data.aadharPhoto || ''} onChange={(v) => set('aadharPhoto', v)} loading={photosPending} />
          <PhotoCapture label="License" value={data.licensePhoto || ''} onChange={(v) => set('licensePhoto', v)} loading={photosPending} />
        </div>
      </div>
      {(error || saveError) && (
        <p role="alert" style={{ fontSize: '12px', color: '#A8452F', background: '#F7E4E0', border: '1px solid #E0A79A', borderRadius: '8px', padding: '9px 11px', margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}>
          <IconAlert />{error || saveError}
        </p>
      )}
      <div className="mm-modal-actions">
        <button type="button" className="mm-btn mm-btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="mm-btn mm-btn-primary" disabled={saving || syncing || photosPending}
          style={{ opacity: (saving || syncing || photosPending) ? 0.6 : 1 }}>
          {saving ? 'Saving…' : syncing ? 'Updating totals…' : photosPending ? 'Loading photos…' : 'Save customer'}
        </button>
      </div>
    </ModalShell>
  );
}
