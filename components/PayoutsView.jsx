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
import { useMediaQuery, PHONE_QUERY } from '@/lib/useMediaQuery';

function PayoutStatusTag({ status }) {
  return (
    <span className="mm-tag" style={{ background: status === 'paid' ? '#E1EFE4' : status === 'partial' ? '#FBEFD9' : 'var(--border-light)', color: status === 'paid' ? '#3F6B4F' : status === 'partial' ? '#8A5E1E' : '#6B6555', textTransform: 'capitalize' }}>{status}</span>
  );
}

export function PayoutsView({ bookings, allEnriched, transactions, vehicleLabel, filter, setFilter, search, setSearch, onRecordPayout }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const active = allEnriched.filter(b => b.status !== 'cancelled' && b.status !== 'no-show');
  const thisMonth = monthKey(todayStr());
  const totalPending = active.reduce((s, b) => s + b.calc.payoutBalance, 0);
  const totalPaidThisMonth = transactions.filter(t => t.type === 'expense' && t.category === HOST_PAYOUT_CATEGORY && monthKey(t.date) === thisMonth).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const filters = [['all', 'All'], ['pending', 'Pending'], ['partial', 'Partial'], ['paid', 'Paid']];
  const [expanded, setExpanded] = useState(() => new Set());
  function toggleExpand(id) { setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  return (
    <div>
      <h1 className="mm-h1" style={{ margin: '0 0 4px' }}>Host payouts</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>What's owed to each host, separate from booking sales. Payouts are logged in the cash flow tab — nothing to mark here manually.</p>
      <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
        Commission tiers: <b style={{ color: 'var(--text-heading)' }}>rental & extra hours</b> at the vehicle/host rate (default 30%) · <b style={{ color: 'var(--text-heading)' }}>extra km & damage</b> at {DAMAGE_KM_RATE}% · <b style={{ color: 'var(--text-heading)' }}>fuel, toll & fines</b> pass through at 0%. Click a row's arrow to see the exact math.
      </div>
      <div className="mm-stats-2" style={{ marginBottom: '22px' }}>
        <StatCard label="Total payout pending" value={totalPending} sub="across all hosts" tone="bad" />
        <StatCard label="Paid out this month" value={totalPaidThisMonth} tone="good" />
      </div>
      <div className="mm-toolbar">
        <div className="mm-search">
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--text-faint)' }}><IconSearch /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search booking, vehicle, host" className="mm-input" style={{ paddingLeft: '30px' }} />
        </div>
        <div className="mm-chips">
          {filters.map(([f, label]) => (
            <span key={f} onClick={() => setFilter(f)} className={`mm-chip${filter === f ? ' active' : ''}`}>{label}</span>
          ))}
        </div>
      </div>
      {bookings.length === 0 ? <EmptyState text="No payouts match. Bookings will show up here once rentals are logged." /> : isPhone ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {bookings.map(b => {
            const isOpen = expanded.has(b.id);
            const payoutEntries = transactions.filter(t => t.type === 'expense' && t.category === HOST_PAYOUT_CATEGORY && t.bookingId === b.id);
            const figures = [
              ['Rental', b.calc.rental, 'var(--text-heading)'],
              ['Extras', b.calc.extras, 'var(--text-muted)'],
              ['Commission', b.calc.totalCommission, '#A8452F'],
              ['Owed to host', b.calc.hostPayout, '#B8863C'],
            ];
            return (
              <div key={b.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 2px' }}>{b.code}</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-heading)', margin: 0 }}>{vehicleLabel(b.calc.vehicle)}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>{b.calc.host ? b.calc.host.name : '—'}</p>
                  </div>
                  <PayoutStatusTag status={b.calc.payoutStatus} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 12px', marginTop: '10px' }}>
                  {figures.map(([label, value, color]) => (
                    <div key={label}>
                      <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0 }}>{label}</p>
                      <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '13px', fontWeight: 600, color, margin: 0 }}>₹{money(value)}</p>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-light)' }}>
                  <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '13px', fontWeight: 600, color: b.calc.payoutBalance > 0 ? '#A8452F' : '#3F6B4F' }}>Balance ₹{money(b.calc.payoutBalance)}</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" className="mm-btn mm-btn-ghost mm-btn-sm" onClick={() => toggleExpand(b.id)} aria-expanded={isOpen}>
                      Details <span style={{ display: 'inline-flex', transform: isOpen ? 'rotate(180deg)' : 'none' }}><IconChevron /></span>
                    </button>
                    {b.calc.payoutStatus !== 'paid' && (
                      <button type="button" className="mm-btn mm-btn-gold mm-btn-sm" onClick={() => onRecordPayout(b)}>Log payout</button>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div style={{ marginTop: '10px' }}>
                    <PayoutBreakdown calc={b.calc} />
                    <LinkedEntriesList entries={payoutEntries} emptyText="No payout logged yet for this booking." />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mm-table-wrap" style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px' }}>
          <table>
            <thead>
              <tr>
                <th className="mm-th" style={{ width: '28px' }}></th>
                <th className="mm-th">Booking</th>
                <th className="mm-th">Vehicle · host</th>
                <th className="mm-th" style={{ textAlign: 'right' }}>Rental</th>
                <th className="mm-th" style={{ textAlign: 'right' }}>Extras</th>
                <th className="mm-th" style={{ textAlign: 'right' }}>Commission</th>
                <th className="mm-th" style={{ textAlign: 'right' }}>Owed to host</th>
                <th className="mm-th" style={{ textAlign: 'right' }}>Balance</th>
                <th className="mm-th">Status</th>
                <th className="mm-th"></th>
              </tr>
            </thead>
            <tbody>
              {bookings.map(b => {
                const isOpen = expanded.has(b.id);
                const payoutEntries = transactions.filter(t => t.type === 'expense' && t.category === HOST_PAYOUT_CATEGORY && t.bookingId === b.id);
                return (
                  <Fragment key={b.id}>
                    <tr>
                      <td className="mm-td">
                        <button type="button" className="mm-icon-btn" onClick={() => toggleExpand(b.id)} style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}><IconChevron /></button>
                      </td>
                      <td className="mm-td" style={{ fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600 }}>{b.code}</td>
                      <td className="mm-td">
                        <div style={{ fontSize: '13px' }}>{vehicleLabel(b.calc.vehicle)}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{b.calc.host ? b.calc.host.name : '—'}</div>
                      </td>
                      <td className="mm-td" style={{ textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace' }}>₹{money(b.calc.rental)}</td>
                      <td className="mm-td" style={{ textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', color: 'var(--text-muted)' }}>₹{money(b.calc.extras)}</td>
                      <td className="mm-td" style={{ textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', color: '#A8452F' }}>₹{money(b.calc.totalCommission)}</td>
                      <td className="mm-td" style={{ textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', fontWeight: 600, color: '#B8863C' }}>₹{money(b.calc.hostPayout)}</td>
                      <td className="mm-td" style={{ textAlign: 'right', fontFamily: '"IBM Plex Mono", monospace', color: b.calc.payoutBalance > 0 ? '#A8452F' : '#3F6B4F' }}>₹{money(b.calc.payoutBalance)}</td>
                      <td className="mm-td">
                        <PayoutStatusTag status={b.calc.payoutStatus} />
                      </td>
                      <td className="mm-td">
                        {b.calc.payoutStatus !== 'paid' && (
                          <button type="button" className="mm-btn mm-btn-gold mm-btn-sm" onClick={() => onRecordPayout(b)}>Log payout</button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td className="mm-td" colSpan="10" style={{ background: 'var(--page-bg)' }}>
                          <PayoutBreakdown calc={b.calc} />
                          <LinkedEntriesList entries={payoutEntries} emptyText="No payout logged yet for this booking." />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
