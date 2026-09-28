"use client";

import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import {
  IconPlus, IconTrash, IconEdit, IconDownload, IconSearch, IconClose, IconAlert,
  IconGrid, IconCar, IconKey, IconUsers, IconReceipt, IconWallet, IconChevron,
  IconSun, IconMoon, IconUpload, IconEye, IconLock, IconCamera
} from './icons';
import { Field, StatCard, Stub, EmptyState, ModalShell, PayoutBreakdown, LinkedEntriesList, ChargeRow } from './ui';
import {
  HOST_PAYOUT_CATEGORY, REFUND_CATEGORY, EXPENSE_CATEGORIES, INCOME_CATEGORIES,
  PIE_COLORS, DAMAGE_KM_RATE, REFUND_TIERS, REQUIRED_ALWAYS, MULTIDAY_DISCOUNT_TIERS,
  ROLE_PERMS
} from '@/lib/constants';
import {
  refundTierFor, multiDayDiscountFor, uid, todayStr, nowLocal, money, monthKey,
  monthLabel, nextBookingCode, safeGet, safeSet, getCol, pad2, toLocalInputStr,
  toDateInputStr, parseFlexibleDateTime, parseFlexibleDate, numOrBlank,
  compressImageFile, migrateTransactions
} from '@/lib/helpers';
import { computeBooking } from '@/lib/computeBooking';

export function LoginScreen({ onLogin, rolePasswords }) {
  const [role, setRole] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const roles = [
    { id: 'admin', label: 'Admin', desc: 'Full access — bookings, fleet, customers, finance, settings' },
    { id: 'manager', label: 'Manager', desc: 'Add & edit bookings until marked completed' },
    { id: 'finance', label: 'Finance', desc: 'View bookings, manage payouts & cash flow' }
  ];
  function submit(e) {
    e.preventDefault();
    if (password === rolePasswords[role]) {
      const authInfo = { role };
      safeSet('mm-auth', authInfo);
      onLogin(authInfo);
    } else {
      setError('Incorrect password for this role.');
    }
  }
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '32px', width: '380px', maxWidth: '92vw' }}>
        <img src="/logo.png" alt="MM Miles" style={{ height: '48px', width: 'auto', display: 'block', marginBottom: '8px' }} />
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 22px' }}>Sign in to your ledger</p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {roles.map(r => (
              <div key={r.id} onClick={() => { setRole(r.id); setError(''); }} style={{ cursor: 'pointer', padding: '10px 12px', borderRadius: '8px', border: role === r.id ? '2px solid #B8863C' : '1px solid var(--border)', background: role === r.id ? 'var(--input-bg)' : 'transparent' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 2px' }}>{r.label}</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>{r.desc}</p>
              </div>
            ))}
          </div>
          <Field label="Password"><input type="password" required autoFocus className="mm-input" value={password} onChange={e => { setPassword(e.target.value); setError(''); }} /></Field>
          {error && <p style={{ fontSize: '12px', color: '#A8452F', margin: 0, display: 'flex', alignItems: 'center', gap: '5px' }}><IconAlert />{error}</p>}
          <button type="submit" className="mm-btn mm-btn-primary" style={{ justifyContent: 'center', marginTop: '4px' }}><IconLock size={14} /> Sign in as {roles.find(r => r.id === role).label}</button>
        </form>
      </div>
    </div>
  );
}
