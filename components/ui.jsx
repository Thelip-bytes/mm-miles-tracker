"use client";

import { money } from '@/lib/helpers';
import { DAMAGE_KM_RATE } from '@/lib/constants';
import { IconClose } from './icons';

// Small, reusable building blocks shared by many views and modals:
// form fields, stat cards, empty states, the generic modal shell, and
// the payout/linked-entries summaries used inside the booking modal.

export const labelStyle = { fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' };
export function Field({ label, hint, children }) { return <div><label style={labelStyle}>{label}{hint && <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}> · {hint}</span>}</label>{children}</div>; }

export function StatCard({ label, value, sub, tone }) {
  const toneColor = tone === 'good' ? '#3F6B4F' : tone === 'bad' ? '#A8452F' : tone === 'gold' ? '#B8863C' : 'var(--text-heading)';
  return (
    <div className="mm-stat">
      <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: toneColor }} />
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 6px 2px' }}>{label}</p>
      <p className="mm-stat-value">₹{money(value)}</p>
      {sub && <p style={{ fontSize: '11px', color: toneColor, margin: 0, marginLeft: '2px' }}>{sub}</p>}
    </div>
  );
}
export function Stub({ children }) {
  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      <div style={{ width: '14px', flexShrink: 0, borderRight: '2px dashed var(--border)', backgroundImage: 'radial-gradient(circle at 0 0, transparent 6px, #F6F3EC 6.5px)', backgroundSize: '14px 14px', backgroundRepeat: 'repeat-y' }} />
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}
export function EmptyState({ text }) {
  return <div style={{ background: 'var(--card-bg)', border: '1px dashed var(--border)', borderRadius: '10px', padding: '40px 20px', textAlign: 'center' }}><p style={{ fontSize: '13px', color: 'var(--text-faint)', margin: 0 }}>{text}</p></div>;
}
export function ModalShell({ title, onCancel, onSubmit, children, wide }) {
  return (
    <div className="mm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={`mm-modal${wide ? ' wide' : ''}`}>
        <div className="mm-modal-head">
          <p style={{ fontFamily: 'Fraunces, serif', fontSize: '17px', fontWeight: 600, color: 'var(--text-heading)', margin: 0 }}>{title}</p>
          <button type="button" className="mm-icon-btn" aria-label="Close" onClick={onCancel}><IconClose /></button>
        </div>
        <form onSubmit={onSubmit} className="mm-modal-body">{children}</form>
      </div>
    </div>
  );
}

export function PayoutBreakdown({ calc }) {
  const rows = [
    { label: 'Rental', base: calc.rental, rate: calc.rate, commission: calc.rentalCommission },
    calc.extraHourCharge > 0 && { label: 'Extra hours', base: calc.extraHourCharge, rate: calc.rate, commission: calc.extraHourCommission },
    calc.kmDamageBase > 0 && { label: 'Extra km + damage', base: calc.kmDamageBase, rate: DAMAGE_KM_RATE, commission: calc.kmDamageCommission },
    calc.passThroughBase > 0 && { label: 'Fuel, toll & fines (pass-through)', base: calc.passThroughBase, rate: 0, commission: 0 },
  ].filter(Boolean);
  return (
    <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', fontSize: '12px' }}>
      {rows.map(r => (
        <div key={r.label} className="mm-kv-row" style={{ padding: '4px 0', color: 'var(--text-muted)' }}>
          <span>{r.label} · ₹{money(r.base)} @ {r.rate}%</span>
          <span>commission ₹{money(r.commission)} · host ₹{money(r.base - r.commission)}</span>
        </div>
      ))}
      <div className="mm-kv-row" style={{ padding: '6px 0 2px', borderTop: '1px solid var(--border)', marginTop: '4px', fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600 }}>
        <span style={{ color: 'var(--text-heading)' }}>Total</span>
        <span style={{ color: 'var(--text-heading)' }}>commission ₹{money(calc.totalCommission)} · <span style={{ color: '#B8863C' }}>host ₹{money(calc.hostPayout)}</span></span>
      </div>
    </div>
  );
}

export function LinkedEntriesList({ entries, emptyText }) {
  if (!entries.length) return emptyText ? <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: '6px 0 0' }}>{emptyText}</p> : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '6px' }}>
      {entries.map(t => (
        <div key={t.id} className="mm-kv-row" style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
          <span>{t.date} · {t.mode === 'online' ? 'Online' : 'Cash'} · {t.category}</span>
          <span>₹{money(t.amount)}</span>
        </div>
      ))}
    </div>
  );
}

export function ChargeRow({ label, amountKey, noteKey, data, set, readOnly, rateHint }) {
  return (
    <div className="mm-charge-row">
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}{rateHint ? <span style={{ display: 'block', color: 'var(--text-faint)' }}>{rateHint}</span> : null}</span>
      <input type="number" min="0" placeholder="₹0" readOnly={readOnly} className="mm-input" value={data[amountKey] === undefined ? '' : data[amountKey]} onChange={e => set(amountKey, e.target.value)} />
      {noteKey && <input placeholder="Note (optional)" className="mm-input mm-charge-note" value={data[noteKey] || ''} onChange={e => set(noteKey, e.target.value)} />}
    </div>
  );
}
