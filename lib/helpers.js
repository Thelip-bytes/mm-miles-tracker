import { REFUND_TIERS, MULTIDAY_DISCOUNT_TIERS } from './constants';

// Small, dependency-free utility functions used throughout the app:
// dates/formatting, storage, Excel-import parsing, image compression.

export function refundTierFor(hoursBefore) {
  return REFUND_TIERS.find(t => hoursBefore >= t.minHours) || REFUND_TIERS[REFUND_TIERS.length - 1];
}
export function multiDayDiscountFor(days) {
  const t = MULTIDAY_DISCOUNT_TIERS.find(t => days >= t.min && days <= t.max);
  return t ? t.percent : 0;
}
export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
export function todayStr() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
export function nowLocal() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
export function money(n) { const v = Number(n) || 0; return v.toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
export function monthKey(dateStr) { return (dateStr || '').slice(0, 7); }
export function monthLabel(key) { if (!key) return ''; const [y, m] = key.split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }); }
export function nextBookingCode(bookings) {
  let max = 0;
  bookings.forEach(b => { const n = parseInt(String(b.code || '').replace(/\D/g, ''), 10); if (!isNaN(n)) max = Math.max(max, n); });
  return String(max + 1).padStart(4, '0');
}
export function safeGet(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
export function safeSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.error('save failed', key, e); } }

export function getCol(row, ...names) {
  for (const n of names) {
    for (const k in row) {
      if (k.trim().toLowerCase() === n.toLowerCase()) { const v = row[k]; return (v === undefined || v === null) ? '' : v; }
    }
  }
  return '';
}
export function pad2(n) { return String(n).padStart(2, '0'); }
export function toLocalInputStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
export function toDateInputStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function parseFlexibleDateTime(val) {
  if (val instanceof Date && !isNaN(val)) return toLocalInputStr(val);
  const s = String(val || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})[ T]+(\d{1,2}):(\d{2})/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}T${pad2(m[4])}:${m[5]}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}T${pad2(m[4])}:${m[5]}`;
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}T00:00`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}T00:00`;
  const d = new Date(s);
  if (!isNaN(d)) return toLocalInputStr(d);
  return '';
}
export function parseFlexibleDate(val) {
  const dt = parseFlexibleDateTime(val);
  return dt ? dt.slice(0, 10) : '';
}
export function numOrBlank(v) { if (v === '' || v === undefined || v === null) return ''; const n = Number(v); return isNaN(n) ? '' : n; }

export function compressImageFile(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * (maxDim / width)); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * (maxDim / height)); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function migrateTransactions() {
  const existing = safeGet('mm-transactions');
  if (existing) return existing;
  const oldExpenses = safeGet('mm-expenses');
  if (oldExpenses && oldExpenses.length) {
    return oldExpenses.map(e => ({ id: e.id, date: e.date, type: 'expense', category: e.category, amount: e.amount, mode: e.mode || 'cash', note: e.note || '', bookingId: '' }));
  }
  return [];
}
