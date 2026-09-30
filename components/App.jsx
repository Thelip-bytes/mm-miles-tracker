"use client";

import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import * as XLSX from 'xlsx';
import { api, toBookingView, fromBookingView } from '@/lib/api';
import { HOST_PAYOUT_CATEGORY, INCOME_CATEGORIES, ROLE_PERMS } from '@/lib/constants';
import {
  todayStr, nowLocal, monthKey, monthLabel,
  safeGet, safeSet, getCol, parseFlexibleDateTime, parseFlexibleDate, numOrBlank
} from '@/lib/helpers';
import {
  IconGrid, IconCar, IconKey, IconUsers, IconWallet, IconReceipt,
  IconSun, IconMoon, IconDownload, IconUpload, IconMenu, IconClose
} from './icons';
import { Overview } from './Overview';
import { Bookings } from './Bookings';
import { PayoutsView } from './PayoutsView';
import { HostsView } from './HostsView';
import { VehiclesView } from './VehiclesView';
import { CustomersView } from './CustomersView';
import { CashFlowView } from './CashFlowView';
import { BookingModal } from './BookingModal';
import { VehicleModal } from './VehicleModal';
import { HostModal } from './HostModal';
import { CustomerModal } from './CustomerModal';
import { TransactionModal } from './TransactionModal';
import { ImportSummaryModal } from './ImportSummaryModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { ChangePasswordsModal } from './ChangePasswordsModal';
import { ResetConfirmModal } from './ResetConfirmModal';

// The database stores snake_case; the components have always spoken camelCase
// (that was the localStorage shape). These two mappers are the only place the
// two vocabularies meet.
const num = (v) => (v === null || v === undefined || v === '' ? '' : v);

const toVehicle = (v) => ({
  id: v.id, hostId: v.host_id, regNumber: v.reg_number, make: v.make, model: v.model,
  year: num(v.year), fuel: v.fuel, transmission: v.transmission,
  dailyRate: num(v.daily_rate), hourlyRate: num(v.hourly_rate),
  pkg4hrRate: num(v.pkg4hr_rate), pkg4hrKm: num(v.pkg4hr_km),
  pkg4to10Rate: num(v.pkg4to10_rate), pkg4to10Km: num(v.pkg4to10_km),
  pkg12hrRate: num(v.pkg12hr_rate), pkg12hrKm: num(v.pkg12hr_km),
  kmPolicy: v.km_policy, kmLimit: num(v.km_limit),
  extraKmRate: num(v.extra_km_rate), extraHourRate: num(v.extra_hour_rate),
  // blank in the UI means "inherit from host" — a NULL column
  commissionRate: v.commission_rate === null ? '' : v.commission_rate,
  notes: v.notes || '',
});

const toHost = (h) => ({
  id: h.id, name: h.name, phone: h.phone || '', commissionRate: h.commission_rate,
  bank: h.bank_details || '', notes: h.notes || '',
});

const toCustomer = (c) => ({
  id: c.id, name: c.name, aadhar: c.aadhar || '', licenseNumber: c.license_number || '',
  phone: c.phone || '', address: c.address || '',
  photo: c.photo || '', aadharPhoto: c.aadhar_photo || '', licensePhoto: c.license_photo || '',
  notes: c.notes || '',
});

const toTransaction = (t) => ({
  id: t.id, date: t.booked_on, type: t.type, category: t.category,
  amount: t.amount, mode: t.mode, bookingId: t.booking_id || '', note: t.note || '',
});

export function App({ role, onLogout }) {
  const perms = ROLE_PERMS[role] || ROLE_PERMS.finance;

  const [tab, setTab] = useState(() => (perms.tabs.length ? perms.tabs[0] : 'overview'));
  const [bookings, setBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  const [bookingForm, setBookingForm] = useState(null);
  const [vehicleForm, setVehicleForm] = useState(null);
  const [hostForm, setHostForm] = useState(null);
  const [customerForm, setCustomerForm] = useState(null);
  const [transactionForm, setTransactionForm] = useState(null);
  const [bookingFilter, setBookingFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [payoutFilter, setPayoutFilter] = useState('all');
  const [payoutSearch, setPayoutSearch] = useState('');
  const [theme, setTheme] = useState(() => safeGet('mm-theme') || 'light');
  const [importSummary, setImportSummary] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showPasswordsModal, setShowPasswordsModal] = useState(false);
  // the sidebar is a slide-in drawer on tablets and phones (see .mm-sidebar)
  const [navOpen, setNavOpen] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { document.body.setAttribute('data-theme', theme); safeSet('mm-theme', theme); }, [theme]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  function selectTab(id) {
    setTab(id);
    setNavOpen(false);
    window.scrollTo(0, 0);
  }

  // one load, then every mutation re-runs it — the database is the source of
  // truth, so there is no local cache that could drift out of sync
  const reload = useMemo(() => async () => {
    try {
      const d = await api.load();
      setBookings(d.bookings.map(toBookingView));
      setVehicles(d.vehicles.map(toVehicle));
      setHosts(d.hosts.map(toHost));
      setCustomers(d.customers.map(toCustomer));
      setTransactions(d.transactions.map(toTransaction));
      setLoadError('');
    } catch (e) {
      setLoadError(e.message || 'Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // bookings already carry a `calc` object computed by public.booking_financials
  const enriched = bookings;

  async function mutate(fn, close) {
    setSaving(true);
    try {
      await fn();
      if (close) close();
      await reload();
    } catch (e) {
      setLoadError(e.message || 'That change could not be saved');
    } finally {
      setSaving(false);
    }
  }

  const saveBooking = (data) => mutate(() => api.saveBooking(fromBookingView(data)), () => setBookingForm(null));
  const saveVehicle = (data) => mutate(() => api.saveVehicle({
    id: data.id, host_id: data.hostId, reg_number: data.regNumber, make: data.make,
    model: data.model, year: data.year, fuel: data.fuel, transmission: data.transmission,
    daily_rate: data.dailyRate, hourly_rate: data.hourlyRate,
    pkg4hr_rate: data.pkg4hrRate, pkg4hr_km: data.pkg4hrKm,
    pkg4to10_rate: data.pkg4to10Rate, pkg4to10_km: data.pkg4to10Km,
    pkg12hr_rate: data.pkg12hrRate, pkg12hr_km: data.pkg12hrKm,
    km_policy: data.kmPolicy, km_limit: data.kmLimit,
    extra_km_rate: data.extraKmRate, extra_hour_rate: data.extraHourRate,
    commission_rate: data.commissionRate,
  }), () => setVehicleForm(null));
  const saveHost = (data) => mutate(() => api.saveHost({
    id: data.id, name: data.name, phone: data.phone,
    commission_rate: data.commissionRate, bank_details: data.bank,
  }), () => setHostForm(null));
  const saveCustomer = (data) => mutate(() => api.saveCustomer({
    id: data.id, name: data.name, aadhar: data.aadhar, license_number: data.licenseNumber,
    phone: data.phone, address: data.address, photo: data.photo,
    aadhar_photo: data.aadharPhoto, license_photo: data.licensePhoto,
  }), () => setCustomerForm(null));
  const quickAddCustomer = (c) => mutate(() => api.saveCustomer({
    name: c.name, aadhar: c.aadhar, license_number: c.licenseNumber,
    phone: c.phone, address: c.address,
  }));
  const saveTransaction = (data) => mutate(() => api.saveTransaction({
    id: data.id, booked_on: data.date, type: data.type, category: data.category,
    amount: data.amount, mode: data.mode, booking_id: data.bookingId, note: data.note,
  }), () => setTransactionForm(null));

  const deleteBooking = (id) => mutate(() => api.deleteBooking(id));
  const deleteVehicle = (id) => mutate(() => api.deleteVehicle(id));
  const deleteHost = (id) => mutate(() => api.deleteHost(id));
  const deleteCustomer = (id) => mutate(() => api.deleteCustomer(id));
  const deleteTransaction = (id) => mutate(() => api.deleteTransaction(id));

  function openPayoutEntry(booking) {
    setTransactionForm({
      type: 'expense', date: todayStr(), category: HOST_PAYOUT_CATEGORY, mode: 'online',
      bookingId: booking.id, amount: booking.calc.payoutBalance, note: `Payout for ${booking.code}`
    });
  }

  const vehicleLabel = (v) => (v ? `${v.regNumber} · ${v.make} ${v.model}` : '—');
  const customerName = (id) => { const c = customers.find(x => x.id === id); return c ? c.name : '—'; };
  const bookingLabel = (b) => (b ? `${b.code} · ${vehicleLabel((vehicles.find(v => v.id === b.vehicleId)))} · ${customerName(b.customerId)}` : '');

  const stats = useMemo(() => {
    const active = enriched.filter(b => b.status !== 'cancelled' && b.status !== 'no-show');
    return {
      pendingPayouts: active.reduce((s, b) => s + b.calc.payoutBalance, 0),
      pendingFromCustomers: active.reduce((s, b) => s + Math.max(0, b.calc.balance), 0),
    };
  }, [enriched]);

  const chartData = useMemo(() => {
    const months = []; const d = new Date();
    for (let i = 5; i >= 0; i--) { const dt = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`); }
    return months.map(key => {
      const active = enriched.filter(b => b.status !== 'cancelled' && b.status !== 'no-show' && monthKey(b.start) === key);
      return { month: monthLabel(key), sales: active.reduce((s, b) => s + b.calc.rental, 0), commission: active.reduce((s, b) => s + b.calc.totalCommission, 0) };
    });
  }, [enriched]);

  const cashFlow = useMemo(() => {
    const inc = transactions.filter(t => t.type === 'income');
    const exp = transactions.filter(t => t.type === 'expense');
    const sum = (list) => list.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const onlineIncome = sum(inc.filter(t => t.mode === 'online'));
    const cashIncome = sum(inc.filter(t => t.mode !== 'online'));
    const onlineOutgo = sum(exp.filter(t => t.mode === 'online'));
    const cashOutgo = sum(exp.filter(t => t.mode !== 'online'));
    return { onlineIncome, cashIncome, onlineOutgo, cashOutgo, onlineNet: onlineIncome - onlineOutgo, cashNet: cashIncome - cashOutgo };
  }, [transactions]);

  const paymentModeData = useMemo(
    () => [{ name: 'Online', value: cashFlow.onlineIncome }, { name: 'Cash', value: cashFlow.cashIncome }].filter(d => d.value > 0),
    [cashFlow]
  );

  // ------------------------------------------------------------ excel export
  function exportExcel() {
    const bookingRows = enriched.map(b => ({
      'Booking ID': b.code, 'Vehicle': vehicleLabel(b.calc.vehicle),
      'Host': b.calc.host ? b.calc.host.name : '—', 'Customer': customerName(b.customerId),
      'Aadhar': (customers.find(c => c.id === b.customerId) || {}).aadhar || '',
      'Start': b.start, 'End': b.end, 'Days': b.days,
      'Rental amount': b.calc.rental, 'Start KM': b.startKm, 'End KM': b.endKm,
      'Extra km charge': b.calc.extraKmCharge, 'Extra hour charge': b.calc.extraHourCharge,
      'Toll': b.calc.tollAmount, 'Fuel': b.calc.fuelAmount, 'Damage': b.calc.damageAmount, 'Traffic fine': b.calc.fineAmount,
      'Total due': b.calc.totalDue, 'Online paid': b.calc.paidOnline, 'Cash paid': b.calc.paidCash,
      'Payment status': b.calc.paymentStatus, 'Commission %': b.calc.rate, 'Total commission': b.calc.totalCommission,
      'Host payout': b.calc.hostPayout, 'Payout paid': b.calc.payoutPaidAmount, 'Payout status': b.calc.payoutStatus,
      'Refund due': b.calc.refundDue, 'Refund paid': b.calc.refundPaidAmount, 'Refund status': b.calc.refundStatus,
      'Booking status': b.status, 'Notes': b.notes || ''
    }));
    const hostRows = hosts.map(h => {
      const hb = enriched.filter(b => b.calc.host && b.calc.host.id === h.id && b.status !== 'cancelled' && b.status !== 'no-show');
      return {
        'Host': h.name, 'Phone': h.phone || '', 'Bank details': h.bank || '', 'Default commission %': h.commissionRate,
        'Vehicles': vehicles.filter(v => v.hostId === h.id).length, 'Total bookings': hb.length,
        'Total rental collected': hb.reduce((s, b) => s + b.calc.rental, 0),
        'Total commission (platform)': hb.reduce((s, b) => s + b.calc.totalCommission, 0),
        'Total payout due': hb.reduce((s, b) => s + b.calc.hostPayout, 0),
        'Payout paid': hb.reduce((s, b) => s + b.calc.payoutPaidAmount, 0),
        'Payout pending': hb.reduce((s, b) => s + b.calc.payoutBalance, 0),
      };
    });
    const customerRows = customers.map(c => {
      const cb = bookings.filter(b => b.customerId === c.id && b.status !== 'cancelled' && b.status !== 'no-show');
      return { 'Name': c.name, 'Aadhar number': c.aadhar || '', 'Phone': c.phone || '', 'Address': c.address || '', 'Total bookings': cb.length, 'Total spent': cb.reduce((s, b) => s + (Number(b.rentalAmount) || 0), 0), 'Status': cb.length >= 2 ? 'Repeat customer' : 'New' };
    });
    const transactionRows = transactions.map(t => ({
      'Date': t.date, 'Type': t.type === 'income' ? 'Income' : 'Expense', 'Category': t.category,
      'Linked booking': (bookings.find(b => b.id === t.bookingId) || {}).code || '',
      'Mode': t.mode === 'online' ? 'Online' : 'Cash', 'Amount': t.amount, 'Note': t.note || ''
    }));
    const cashFlowRows = [
      { 'Item': 'Online credit', 'Amount': cashFlow.onlineIncome }, { 'Item': 'Online debit', 'Amount': cashFlow.onlineOutgo },
      { 'Item': 'Online net', 'Amount': cashFlow.onlineNet }, { 'Item': 'Cash credit', 'Amount': cashFlow.cashIncome },
      { 'Item': 'Cash debit', 'Amount': cashFlow.cashOutgo }, { 'Item': 'Cash net', 'Amount': cashFlow.cashNet },
    ];

    const wb = XLSX.utils.book_new();
    const sheetFromRows = (rows, headers) => (rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([headers]));
    XLSX.utils.book_append_sheet(wb, sheetFromRows(bookingRows, ['Booking ID', 'Vehicle', 'Host', 'Customer', 'Aadhar', 'Start', 'End', 'Days', 'Rental amount', 'Start KM', 'End KM', 'Extra km charge', 'Extra hour charge', 'Toll', 'Fuel', 'Damage', 'Traffic fine', 'Total due', 'Online paid', 'Cash paid', 'Payment status', 'Commission %', 'Total commission', 'Host payout', 'Payout paid', 'Payout status', 'Refund due', 'Refund paid', 'Refund status', 'Booking status', 'Notes']), 'Bookings');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(hostRows, ['Host', 'Phone', 'Bank details', 'Default commission %', 'Vehicles', 'Total bookings', 'Total rental collected', 'Total commission (platform)', 'Total payout due', 'Payout paid', 'Payout pending']), 'Host payouts');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(customerRows, ['Name', 'Aadhar number', 'Phone', 'Address', 'Total bookings', 'Total spent', 'Status']), 'Customers');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(transactionRows, ['Date', 'Type', 'Category', 'Linked booking', 'Mode', 'Amount', 'Note']), 'Income & expenses');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(cashFlowRows, ['Item', 'Amount']), 'Cash flow');
    XLSX.writeFile(wb, `MM_Miles_Export_${todayStr()}.xlsx`);
  }

  function downloadImportTemplate() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Reg Number': 'TN01BR9111', 'Make': 'Maruti Suzuki', 'Model': 'Fronx', 'Year': 2023, 'Fuel': 'petrol', 'Transmission': 'automatic', 'Daily Rate': 2700, 'Hourly Rate': 150, '4hr Rate': 800, '4hr KM': 100, '4-10hr Rate': 180, '4-10hr KM': 200, '12hr Rate': 1800, '12hr KM': 300, 'Host Name': 'Mohamed Faiyaz', 'Host Phone': '9876543210', 'Host Commission %': 30, 'KM Policy': 'unlimited', 'KM Limit': '', 'Extra KM Rate': '', 'Extra Hour Rate': 150 }]), 'Vehicles');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Booking ID': '', 'Vehicle Reg Number': 'TN01BR9111', 'Customer Name': 'Ravi Kumar', 'Customer Aadhar': '', 'Customer License': '', 'Customer Phone': '', 'Customer Address': '', 'Start': '01-04-2026 08:00', 'End': '02-04-2026 08:00', 'Rental Amount': 2700, 'Extra Hours': 0, 'Extra Hour Charge': 0, 'Start KM': 12000, 'End KM': 12180, 'Toll': 0, 'Fuel': 0, 'Damage': 0, 'Traffic Fine': 0, 'Booking Status': 'completed', 'Online Paid': 2700, 'Cash Paid': 0, 'Payout Paid': 1890, 'Payout Mode': 'online', 'Notes': '' }]), 'Bookings');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ 'Date': '05-04-2026', 'Type': 'Expense', 'Category': 'Vehicle maintenance', 'Amount': 500, 'Mode': 'Cash', 'Linked Booking ID': '', 'Note': 'Example — delete this row' }]), 'Other Transactions');
    XLSX.writeFile(wb, 'MM_Miles_Import_Template.xlsx');
  }

  // ------------------------------------------------------------ excel import
  // Rows are written one API call at a time so each one gets its own
  // validation, booking-code assignment and audit entry.
  async function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        setSaving(true);
        const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: true });
        const warnings = [];
        const newHosts = [...hosts], newVehicles = [...vehicles];
        const newCustomers = [...customers], newBookings = [...bookings];
        const newTransactions = [];
        let addedVehicles = 0, updatedVehicles = 0, addedHosts = 0, addedCustomers = 0, addedBookings = 0, addedTxns = 0;

        const findOrCreateHost = (name, phone, rate) => {
          if (!name) return null;
          const key = String(name).trim().toLowerCase();
          let h = newHosts.find(x => x.name.trim().toLowerCase() === key);
          if (!h) { h = { id: `tmp-h-${newHosts.length}`, name: String(name).trim(), phone: phone || '', commissionRate: numOrBlank(rate) !== '' ? numOrBlank(rate) : 30, bank: '' }; newHosts.push(h); addedHosts++; }
          return h;
        };
        const findOrCreateVehicle = (reg, row) => {
          if (!reg) return null;
          const regNorm = String(reg).trim().toUpperCase();
          let v = newVehicles.find(x => x.regNumber === regNorm);
          if (!v) {
            const host = findOrCreateHost(getCol(row, 'Host Name'), getCol(row, 'Host Phone'), getCol(row, 'Host Commission %', 'Host Commission'));
            v = {
              id: `tmp-v-${newVehicles.length}`, regNumber: regNorm, hostId: host ? host.id : '',
              make: getCol(row, 'Make') || 'Unknown', model: getCol(row, 'Model') || '',
              year: numOrBlank(getCol(row, 'Year')), fuel: (getCol(row, 'Fuel') || 'petrol').toLowerCase(),
              transmission: (getCol(row, 'Transmission') || 'automatic').toLowerCase(),
              dailyRate: numOrBlank(getCol(row, 'Daily Rate')), hourlyRate: numOrBlank(getCol(row, 'Hourly Rate')),
              pkg4hrRate: numOrBlank(getCol(row, '4hr Rate')), pkg4hrKm: numOrBlank(getCol(row, '4hr KM')),
              pkg4to10Rate: numOrBlank(getCol(row, '4-10hr Rate')), pkg4to10Km: numOrBlank(getCol(row, '4-10hr KM')),
              pkg12hrRate: numOrBlank(getCol(row, '12hr Rate')), pkg12hrKm: numOrBlank(getCol(row, '12hr KM')),
              kmPolicy: /limit/i.test(getCol(row, 'KM Policy')) ? 'limited' : 'unlimited',
              kmLimit: numOrBlank(getCol(row, 'KM Limit')), extraKmRate: numOrBlank(getCol(row, 'Extra KM Rate')),
              extraHourRate: numOrBlank(getCol(row, 'Extra Hour Rate')), commissionRate: '',
            };
            newVehicles.push(v); addedVehicles++;
          }
          return v;
        };
        const findOrCreateCustomer = (name, aadhar, license, phone, address) => {
          if (!name) return null;
          const key = String(name).trim().toLowerCase();
          let c = newCustomers.find(x => (aadhar && x.aadhar && String(x.aadhar).trim() === String(aadhar).trim()) || x.name.trim().toLowerCase() === key);
          if (!c) { c = { id: `tmp-c-${newCustomers.length}`, name: String(name).trim(), aadhar: aadhar || '', licenseNumber: license || '', phone: phone || '', address: address || '' }; newCustomers.push(c); addedCustomers++; }
          return c;
        };
        // vehicles + hosts must be persisted before bookings can reference them
        for (const h of newHosts.filter(x => String(x.id).startsWith('tmp-'))) await saveHost(h);
        for (const v of newVehicles.filter(x => String(x.id).startsWith('tmp-'))) await saveVehicle(v);
        for (const c of newCustomers.filter(x => String(x.id).startsWith('tmp-'))) await saveCustomer(c);
        await reload();
        // re-read so bookings link against real database ids
        const cur = await api.load();
        const vByReg = Object.fromEntries(cur.vehicles.map(x => [x.reg_number, x.id]));
        const cByName = Object.fromEntries(cur.customers.map(x => [x.name.trim().toLowerCase(), x.id]));

        const vehicleSheet = wb.Sheets['Vehicles'];
        if (vehicleSheet) XLSX.utils.sheet_to_json(vehicleSheet).forEach(row => { const reg = getCol(row, 'Reg Number', 'Registration Number', 'Vehicle Reg Number'); if (reg) findOrCreateVehicle(reg, row); });
        for (const v of newVehicles.filter(x => String(x.id).startsWith('tmp-') && !vByReg[v.regNumber])) await saveVehicle(v);

        const bookingSheet = wb.Sheets['Bookings'];
        if (bookingSheet) {
          XLSX.utils.sheet_to_json(bookingSheet).forEach((row, i) => {
            const reg = getCol(row, 'Vehicle Reg Number', 'Reg Number', 'Vehicle');
            const custName = getCol(row, 'Customer Name', 'Customer');
            const start = parseFlexibleDateTime(getCol(row, 'Start', 'Start Date'));
            const end = parseFlexibleDateTime(getCol(row, 'End', 'End Date'));
            const rental = numOrBlank(getCol(row, 'Rental Amount', 'Rental'));
            if (!reg || !custName || !start || !end || rental === '') { warnings.push(`Bookings row ${i + 2}: missing vehicle, customer, dates, or rental amount — skipped.`); return; }
            const vehicleId = vByReg[String(reg).trim().toUpperCase()];
            if (!vehicleId) { warnings.push(`Bookings row ${i + 2}: vehicle ${reg} not found — skipped.`); return; }
            const cust = findOrCreateCustomer(custName, getCol(row, 'Customer Aadhar', 'Aadhar'), getCol(row, 'Customer License', 'License'), getCol(row, 'Customer Phone', 'Phone'), getCol(row, 'Customer Address', 'Address'));
            const customerId = cByName[String(custName).trim().toLowerCase()] || (cust && cust.id);
            const s = new Date(start), en = new Date(end);
            const days = en > s ? Math.max(1, Math.ceil((en - s) / (1000 * 60 * 60 * 24))) : 1;
            newBookings.push({
              vehicleId, customerId, start, end, days,
              rentalAmount: rental, extraHours: numOrBlank(getCol(row, 'Extra Hours')) || 0,
              extraHourCharge: numOrBlank(getCol(row, 'Extra Hour Charge')) || 0,
              startKm: numOrBlank(getCol(row, 'Start KM', 'Start Km', 'Odometer Start')),
              endKm: numOrBlank(getCol(row, 'End KM', 'End Km', 'Odometer End')),
              extraKm: 0, extraKmCharge: 0,
              tollAmount: numOrBlank(getCol(row, 'Toll')) || 0, fuelAmount: numOrBlank(getCol(row, 'Fuel')) || 0,
              damageAmount: numOrBlank(getCol(row, 'Damage')) || 0, fineAmount: numOrBlank(getCol(row, 'Traffic Fine', 'Fine')) || 0,
              status: /ongoing|completed|cancelled|no-show/i.test(getCol(row, 'Booking Status', 'Status'))
                ? String(getCol(row, 'Booking Status', 'Status')).toLowerCase().match(/ongoing|completed|cancelled|no-show/)[0] : 'completed',
              notes: getCol(row, 'Notes') || '',
            });
            addedBookings++;
          });
        }

        for (const b of newBookings) {
          const saved = await api.saveBooking(fromBookingView(b));
          b.id = saved.row.id;
          b.code = saved.row.code;
        }

        const txnSheet = wb.Sheets['Other Transactions'] || wb.Sheets['Transactions'] || wb.Sheets['Expenses'];
        if (txnSheet) {
          for (const [i, row] of XLSX.utils.sheet_to_json(txnSheet).entries()) {
            const date = parseFlexibleDate(getCol(row, 'Date'));
            const amount = numOrBlank(getCol(row, 'Amount'));
            if (!date || amount === '') { warnings.push(`Other Transactions row ${i + 2}: missing date or amount — skipped.`); continue; }
            const type = /income/i.test(getCol(row, 'Type')) ? 'income' : 'expense';
            newTransactions.push({
              date, type,
              category: getCol(row, 'Category') || (type === 'income' ? 'Other income' : 'Other'),
              amount, mode: /cash/i.test(getCol(row, 'Mode')) ? 'cash' : 'online',
              bookingId: '', note: getCol(row, 'Note') || 'Imported',
            });
          }
        }
        // payments/settlements declared on the booking row
        if (bookingSheet) {
          XLSX.utils.sheet_to_json(bookingSheet).forEach((row, i) => {
            const code = String(getCol(row, 'Booking ID', 'Booking Id', 'Code') || '').trim();
            const bk = newBookings.find(b => b.code === code);
            if (!bk || !bk.id) return;
            const online = numOrBlank(getCol(row, 'Online Paid'));
            const cash = numOrBlank(getCol(row, 'Cash Paid'));
            const payout = numOrBlank(getCol(row, 'Payout Paid'));
            if (online) newTransactions.push({ date: bk.start.slice(0, 10), type: 'income', category: 'Booking payment', amount: online, mode: 'online', bookingId: bk.id, note: 'Imported' });
            if (cash) newTransactions.push({ date: bk.start.slice(0, 10), type: 'income', category: 'Booking payment', amount: cash, mode: 'cash', bookingId: bk.id, note: 'Imported' });
            if (payout) newTransactions.push({ date: bk.end.slice(0, 10), type: 'expense', category: HOST_PAYOUT_CATEGORY, amount: payout, mode: /cash/i.test(getCol(row, 'Payout Mode')) ? 'cash' : 'online', bookingId: bk.id, note: 'Imported' });
          });
        }
        for (const t of newTransactions) { await saveTransaction(t); addedTxns++; }

        await reload();
        setImportSummary({ hosts: addedHosts, vehicles: addedVehicles, vehiclesUpdated: updatedVehicles, customers: addedCustomers, bookings: addedBookings, transactions: addedTxns, warnings });
      } catch (err) {
        console.error('Import failed', err);
        setImportSummary({ error: 'Could not read that file. Make sure it’s a .xlsx file matching the template.' });
      } finally {
        setSaving(false);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function clearAllData() {
    setSaving(true);
    try {
      for (const t of transactions) await api.deleteTransaction(t.id);
      for (const b of bookings) await api.deleteBooking(b.id);
      for (const v of vehicles) await api.deleteVehicle(v.id);
      for (const c of customers) await api.deleteCustomer(c.id);
      for (const h of hosts) await api.deleteHost(h.id);
      await reload();
    } catch (e) { setLoadError(e.message); }
    finally { setSaving(false); setShowResetConfirm(false); }
  }

  // ---------------------------------------------------------------- filters
  const filteredBookings = useMemo(() => {
    let list = [...enriched].sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    if (bookingFilter === 'payment-pending') list = list.filter(b => b.status !== 'cancelled' && b.status !== 'no-show' && b.calc.paymentStatus !== 'Paid');
    else if (bookingFilter === 'overdue') list = list.filter(b => b.calc.isOverdue);
    else if (bookingFilter === 'upcoming') list = list.filter(b => b.calc.isUpcoming);
    else if (bookingFilter !== 'all') list = list.filter(b => b.status === bookingFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b => (b.code || '').toLowerCase().includes(q) || vehicleLabel(b.calc.vehicle).toLowerCase().includes(q) || customerName(b.customerId).toLowerCase().includes(q));
    }
    return list;
  }, [enriched, bookingFilter, search, customers, vehicles]);

  const filteredPayouts = useMemo(() => {
    let list = enriched.filter(b => b.status !== 'cancelled' && b.status !== 'no-show').sort((a, b) => (b.start || '').localeCompare(a.start || ''));
    if (payoutFilter !== 'all') list = list.filter(b => b.calc.payoutStatus === payoutFilter);
    if (payoutSearch.trim()) {
      const q = payoutSearch.toLowerCase();
      list = list.filter(b => (b.code || '').toLowerCase().includes(q) || vehicleLabel(b.calc.vehicle).toLowerCase().includes(q) || (b.calc.host && b.calc.host.name.toLowerCase().includes(q)));
    }
    return list;
  }, [enriched, payoutFilter, payoutSearch, vehicles]);

  const allNavItems = [
    { id: 'overview', label: 'Overview', Icon: IconGrid },
    { id: 'bookings', label: 'Bookings', Icon: IconCar },
    { id: 'payouts', label: 'Payouts', Icon: IconWallet },
    { id: 'vehicles', label: 'Vehicles', Icon: IconKey },
    { id: 'hosts', label: 'Hosts', Icon: IconUsers },
    { id: 'customers', label: 'Customers', Icon: IconUsers },
    { id: 'cashflow', label: 'Income, expenses & cash flow', Icon: IconReceipt },
  ];
  const navItems = allNavItems.filter(item => perms.tabs.includes(item.id));

  if (loading) {
    return <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B6555', fontFamily: 'Inter, sans-serif', fontSize: '13px' }}>Loading your ledger…</div>;
  }
  if (loadError && bookings.length === 0) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '28px', maxWidth: '460px', margin: '0 16px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#A8452F', margin: '0 0 8px' }}>Couldn't load the ledger</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>{loadError}</p>
          <button type="button" className="mm-btn mm-btn-primary" onClick={() => { setLoading(true); reload(); }}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mm-shell">
      <header className="mm-topbar">
        <img src="/logo.png" alt="MM Miles" style={{ height: '26px', width: 'auto', display: 'block' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {saving && <span style={{ fontSize: '11px', color: '#8892B0' }}>Saving…</span>}
          <button type="button" className="mm-topbar-btn" aria-label="Open menu" onClick={() => setNavOpen(true)}><IconMenu size={20} /></button>
        </div>
      </header>
      {navOpen && <div className="mm-backdrop" onClick={() => setNavOpen(false)} />}
      <aside className={`mm-sidebar${navOpen ? ' open' : ''}`}>
        <div style={{ padding: '4px 8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
          <div>
            <img src="/logo.png" alt="MM Miles" style={{ height: '40px', width: 'auto', display: 'block' }} />
            <p style={{ fontSize: '11px', color: '#8892B0', margin: '2px 0 0' }}>Self-drive rental ledger</p>
          </div>
          <button type="button" className="mm-icon-btn mm-sidebar-close" aria-label="Close menu" onClick={() => setNavOpen(false)}><IconClose /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map(item => (
            <div key={item.id} className={`mm-nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => selectTab(item.id)}>
              <item.Icon size={16} />{item.label}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button type="button" className="mm-btn mm-btn-ghost" style={{ justifyContent: 'center', background: 'transparent', color: '#C9CCDA', border: '1px solid #3A4568' }} onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light') )}>
            {theme === 'light' ? <IconMoon /> : <IconSun />} {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
          {perms.canExport && <button type="button" className="mm-btn mm-btn-gold" style={{ justifyContent: 'center' }} onClick={exportExcel}><IconDownload /> Export Excel</button>}
          {perms.canImport && (
            <Fragment>
              <input type="file" accept=".xlsx,.xls" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImportFile} />
              <button type="button" className="mm-btn mm-btn-ghost" style={{ justifyContent: 'center', background: 'transparent', color: '#C9CCDA', border: '1px solid #3A4568' }} onClick={() => fileInputRef.current && fileInputRef.current.click()}><IconUpload /> Import Excel</button>
              <button type="button" className="mm-btn mm-btn-ghost" style={{ justifyContent: 'center', background: 'transparent', color: '#C9CCDA', border: '1px solid #3A4568' }} onClick={downloadImportTemplate}><IconDownload size={13} /> Import template</button>
            </Fragment>
          )}
          {saving && <p style={{ fontSize: '11px', color: '#8892B0', margin: '4px 8px 0' }}>Saving…</p>}
          <p style={{ fontSize: '11px', margin: '4px 8px 0', color: loadError ? '#E08A8A' : '#8FD19E' }}>
            ● Synced
          </p>
          <p style={{ fontSize: '11px', color: '#6B7396', margin: '0 8px' }}>{bookings.length} bookings logged</p>
          <div style={{ borderTop: '1px solid #2E3A5C', marginTop: '6px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 8px 0' }}>
            <p style={{ fontSize: '11px', color: '#C9CCDA', margin: 0 }}>Signed in as <b>{perms.label}</b></p>
            <button type="button" onClick={onLogout} style={{ background: 'none', border: 'none', color: '#8892B0', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer' }}>Switch user</button>
          </div>
          {perms.canClear && <button type="button" onClick={() => setShowResetConfirm(true)} style={{ background: 'none', border: 'none', color: '#8A5461', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer', padding: '2px 8px', textAlign: 'left' }}>Clear all data</button>}
          {role === 'admin' && <button type="button" onClick={() => setShowPasswordsModal(true)} style={{ background: 'none', border: 'none', color: '#8892B0', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer', padding: '2px 8px', textAlign: 'left' }}>Change passwords</button>}
        </div>
      </aside>

      <main className="mm-main">
        {tab === 'overview' && perms.tabs.includes('overview') && <Overview stats={stats} chartData={chartData} paymentModeData={paymentModeData} bookings={enriched} vehicleLabel={vehicleLabel} customerName={customerName} theme={theme} />}
        {tab === 'bookings' && perms.tabs.includes('bookings') && (
          <Bookings bookings={filteredBookings} vehicles={vehicles} filter={bookingFilter} setFilter={setBookingFilter} search={search} setSearch={setSearch}
            onAdd={() => setBookingForm({ start: nowLocal(), end: nowLocal(), days: 1, status: 'ongoing' })}
            onEdit={(b) => setBookingForm(b)} onView={(b) => setBookingForm(b)}
            onDelete={(id) => setDeleteConfirm({ type: 'booking', id, label: `booking ${(bookings.find(b => b.id === id) || {}).code || ''}` })}
            vehicleLabel={vehicleLabel} customerName={customerName} perms={perms} />
        )}
        {tab === 'payouts' && perms.tabs.includes('payouts') && (
          <PayoutsView bookings={filteredPayouts} allEnriched={enriched} transactions={transactions} vehicleLabel={vehicleLabel} filter={payoutFilter} setFilter={setPayoutFilter} search={payoutSearch} setSearch={setPayoutSearch} onRecordPayout={openPayoutEntry} />
        )}
        {tab === 'vehicles' && perms.tabs.includes('vehicles') && (
          <VehiclesView vehicles={vehicles} hosts={hosts} bookings={enriched}
            onAdd={() => setVehicleForm({ commissionRate: '', kmPolicy: 'unlimited' })} onEdit={(v) => setVehicleForm(v)}
            onDelete={(id) => setDeleteConfirm({ type: 'vehicle', id, label: `vehicle ${(vehicles.find(v => v.id === id) || {}).regNumber || ''}` })}
            canEdit={perms.canFleet} canFinance={perms.canFinance} />
        )}
        {tab === 'hosts' && perms.tabs.includes('hosts') && (
          <HostsView hosts={hosts} vehicles={vehicles} bookings={enriched}
            onAdd={() => setHostForm({ commissionRate: 30 })} onEdit={(h) => setHostForm(h)}
            onDelete={(id) => setDeleteConfirm({ type: 'host', id, label: `host ${(hosts.find(h => h.id === id) || {}).name || ''}` })}
            canEdit={perms.canFleet} canFinance={perms.canFinance} />
        )}
        {tab === 'customers' && perms.tabs.includes('customers') && (
          <CustomersView customers={customers} bookings={bookings} onAdd={() => setCustomerForm({})} onEdit={(c) => setCustomerForm(c)}
            onDelete={(id) => setDeleteConfirm({ type: 'customer', id, label: `customer ${(customers.find(c => c.id === id) || {}).name || ''}` })}
            canEdit={perms.canCustomers} />
        )}
        {tab === 'cashflow' && perms.tabs.includes('cashflow') && (
          <CashFlowView cashFlow={cashFlow} transactions={[...transactions].sort((a, b) => (b.date || '').localeCompare(a.date || ''))} bookings={bookings}
            bookingLabel={bookingLabel}
            onAddIncome={() => setTransactionForm({ type: 'income', date: todayStr(), category: INCOME_CATEGORIES[0], mode: 'online' })}
            onAddExpense={() => setTransactionForm({ type: 'expense', date: todayStr(), category: 'Vehicle maintenance', mode: 'cash' })}
            onEdit={(t) => setTransactionForm(t)}
            onDelete={(id) => setDeleteConfirm({ type: 'transaction', id, label: `${(transactions.find(t => t.id === id) || {}).category || 'entry'}` })} />
        )}
      </main>

      {bookingForm && <BookingModal form={bookingForm} vehicles={vehicles} hosts={hosts} customers={customers} transactions={transactions} bookings={bookings} onCancel={() => setBookingForm(null)} onSave={saveBooking} onQuickAddCustomer={quickAddCustomer} readOnly={!perms.canEditBooking(bookingForm)} canFinance={perms.canFinance} canOverridePrice={perms.canOverridePrice} canBypassTimeGuards={perms.canBypassTimeGuards} />}
      {vehicleForm && <VehicleModal form={vehicleForm} hosts={hosts} onCancel={() => setVehicleForm(null)} onSave={saveVehicle} />}
      {hostForm && <HostModal form={hostForm} onCancel={() => setHostForm(null)} onSave={saveHost} />}
      {customerForm && <CustomerModal form={customerForm} onCancel={() => setCustomerForm(null)} onSave={saveCustomer} />}
      {transactionForm && <TransactionModal form={transactionForm} bookings={enriched} bookingLabel={bookingLabel} onCancel={() => setTransactionForm(null)} onSave={saveTransaction} />}
      {importSummary && <ImportSummaryModal summary={importSummary} onClose={() => setImportSummary(null)} />}
      {showResetConfirm && <ResetConfirmModal counts={{ bookings: bookings.length, vehicles: vehicles.length, hosts: hosts.length, customers: customers.length, transactions: transactions.length }} onCancel={() => setShowResetConfirm(false)} onConfirm={clearAllData} />}
      {showPasswordsModal && <ChangePasswordsModal onCancel={() => setShowPasswordsModal(false)} />}
      {deleteConfirm && (
        <DeleteConfirmModal
          label={deleteConfirm.label}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={() => {
            const fns = { booking: deleteBooking, vehicle: deleteVehicle, host: deleteHost, customer: deleteCustomer, transaction: deleteTransaction };
            fns[deleteConfirm.type](deleteConfirm.id);
            setDeleteConfirm(null);
          }}
        />
      )}
    </div>
  );
}
