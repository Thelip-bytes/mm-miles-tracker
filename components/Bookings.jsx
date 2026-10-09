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

export function Bookings({ bookings, vehicles, filter, setFilter, search, setSearch, onAdd, onEdit, onView, onDelete, vehicleLabel, customerName, perms }) {
  const filters = [['all', 'All'], ['upcoming', 'Upcoming'], ['ongoing', 'Ongoing'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['no-show', 'No show'], ['payment-pending', 'Payment pending']];
  return (
    <div>
      <div className="mm-page-head" style={{ marginBottom: '18px' }}>
        <div>
          <h1 className="mm-h1">Bookings</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>{bookings.length} record{bookings.length !== 1 ? 's' : ''}</p>
        </div>
        {perms.canAddBooking && <button type="button" className="mm-btn mm-btn-primary" onClick={onAdd} disabled={vehicles.length === 0}><IconPlus /> New booking</button>}
      </div>
      {perms.canAddBooking && vehicles.length === 0 && <p style={{ fontSize: '12px', color: '#A8452F', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}><IconAlert />Add a vehicle under "Vehicles & hosts" before creating a booking.</p>}
      {perms.canAddBooking ? (
        <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '-4px 0 14px' }}>Payments aren't entered here — log them in "Income, expenses & cash flow" linked to the booking ID, and they'll show up below automatically.</p>
      ) : (
        <p style={{ fontSize: '12px', color: 'var(--text-faint)', margin: '-4px 0 14px' }}>{perms.viewBookingsReadOnly ? 'View-only access — click a booking to see full details.' : 'You can add and edit bookings here until they\u2019re marked completed.'}</p>
      )}
      <div className="mm-toolbar">
        <div className="mm-search">
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--text-faint)' }}><IconSearch /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ID, vehicle, customer" className="mm-input" style={{ paddingLeft: '30px' }} />
        </div>
        <div className="mm-chips">
          {filters.map(([f, label]) => (
            <span key={f} onClick={() => setFilter(f)} className={`mm-chip${filter === f ? ' active' : ''}`}>{label}</span>
          ))}
        </div>
      </div>
      {bookings.length === 0 ? <EmptyState text="No bookings match. Add a booking to start tallying rentals against what's collected." /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="mm-hide-mobile" style={{ display: 'flex', alignItems: 'center', padding: '0 16px 0 30px', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '70px', fontSize: '11px', color: 'var(--text-faint)' }}>Booking</div>
            <div style={{ flex: 1, minWidth: '200px', fontSize: '11px', color: 'var(--text-faint)' }}>Vehicle & customer</div>
            <div style={{ textAlign: 'right', minWidth: '110px', fontSize: '11px', color: 'var(--text-faint)' }}>Due / paid</div>
            <div style={{ minWidth: '76px', fontSize: '11px', color: 'var(--text-faint)' }}>Booking status</div>
            <div style={{ width: '44px' }}></div>
          </div>
          {bookings.map(b => (
            <div key={b.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              <Stub>
                <div className="mm-bk-row">
                  <div className="mm-bk-code">
                    <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 2px' }}>{b.code}</p>
                    <p style={{ fontSize: '11px', color: 'var(--text-faint)', margin: 0 }}>{b.days}d</p>
                  </div>
                  <div className="mm-bk-main">
                    <p style={{ fontSize: '13px', color: 'var(--text-heading)', margin: '0 0 2px', fontWeight: 500 }}>{vehicleLabel(b.calc.vehicle)}</p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>{customerName(b.customerId)} · {(b.start || '').replace('T', ' ')} → {(b.end || '').replace('T', ' ')}</p>
                  </div>
                  <div className="mm-bk-money">
                    <p style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '0 0 2px' }}>₹{money(b.calc.paidTotal)} <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>/ ₹{money(b.calc.totalDue)}</span></p>
                    <span className="mm-tag" style={{ background: b.calc.paymentStatus === 'Paid' ? '#E1EFE4' : b.calc.paymentStatus === 'Partial' ? '#FBEFD9' : '#F7E4E0', color: b.calc.paymentStatus === 'Paid' ? '#3F6B4F' : b.calc.paymentStatus === 'Partial' ? '#8A5E1E' : '#A8452F' }}>{b.calc.paymentStatus}</span>
                  </div>
                  <div className="mm-bk-tags">
                    <span className="mm-tag" style={{ background: b.timeStatus === 'completed' ? '#E1EFE4' : (b.timeStatus === 'cancelled' || b.timeStatus === 'no-show') ? '#F7E4E0' : b.timeStatus === 'upcoming' ? '#E6F0FA' : 'var(--border-light)', color: b.timeStatus === 'completed' ? '#3F6B4F' : (b.timeStatus === 'cancelled' || b.timeStatus === 'no-show') ? '#A8452F' : b.timeStatus === 'upcoming' ? '#1D5A9E' : '#6B6555', textTransform: 'capitalize' }}>{b.timeStatus === 'no-show' ? 'No show' : b.timeStatus}</span>
                    {b.calc.refundDue > 0 && (
                      <span className="mm-tag" style={{ background: b.calc.refundStatus === 'paid' ? '#E1EFE4' : '#FBEFD9', color: b.calc.refundStatus === 'paid' ? '#3F6B4F' : '#8A5E1E' }}>Refund {b.calc.refundStatus === 'paid' ? 'paid' : `₹${money(b.calc.refundBalance)} due`}</span>
                    )}
                  </div>
                  <div className="mm-bk-actions">
                    {perms.canEditBooking(b) && <button type="button" className="mm-icon-btn" onClick={() => onEdit(b)}><IconEdit /></button>}
                    {!perms.canEditBooking(b) && perms.viewBookingsReadOnly && <button type="button" className="mm-icon-btn" onClick={() => onView(b)}><IconEye /></button>}
                    {perms.canDeleteBooking && <button type="button" className="mm-icon-btn" onClick={() => onDelete(b.id)}><IconTrash /></button>}
                  </div>
                </div>
              </Stub>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
