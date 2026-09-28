"use client";

import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import * as XLSX from 'xlsx';
import { signInAnonymously } from 'firebase/auth';
import { onSnapshot, setDoc } from 'firebase/firestore';
import { auth, db, docRef, syncEnabled } from '@/lib/firebase';
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
import {
  IconPlus, IconTrash, IconEdit, IconDownload, IconSearch, IconClose, IconAlert,
  IconGrid, IconCar, IconKey, IconUsers, IconReceipt, IconWallet, IconChevron,
  IconSun, IconMoon, IconUpload, IconEye, IconLock, IconCamera
} from './icons';
import { Field, StatCard, Stub, EmptyState, ModalShell, PayoutBreakdown, LinkedEntriesList, ChargeRow } from './ui';
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

export function App({ authInfo, onLogout, rolePasswords, onUpdateRolePasswords }) {
  const perms = ROLE_PERMS[authInfo.role] || ROLE_PERMS.finance;
  const [tab, setTab] = useState(() => (perms.tabs.length ? perms.tabs[0] : 'overview'));
  const [bookings, setBookings] = useState(() => safeGet('mm-bookings') || []);
  const [vehicles, setVehicles] = useState(() => safeGet('mm-vehicles') || []);
  const [hosts, setHosts] = useState(() => safeGet('mm-hosts') || []);
  const [customers, setCustomers] = useState(() => safeGet('mm-customers') || []);
  const [transactions, setTransactions] = useState(() => migrateTransactions());

  const [bookingForm, setBookingForm] = useState(null);
  const [vehicleForm, setVehicleForm] = useState(null);
  const [hostForm, setHostForm] = useState(null);
  const [customerForm, setCustomerForm] = useState(null);
  const [transactionForm, setTransactionForm] = useState(null);
  const [bookingFilter, setBookingFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [payoutFilter, setPayoutFilter] = useState('all');
  const [payoutSearch, setPayoutSearch] = useState('');
  const [syncStatus, setSyncStatus] = useState(syncEnabled ? 'connecting' : 'local-only');
  const [theme, setTheme] = useState(() => safeGet('mm-theme') || 'light');
  const [importSummary, setImportSummary] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showPasswordsModal, setShowPasswordsModal] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { document.body.setAttribute('data-theme', theme); safeSet('mm-theme', theme); }, [theme]);

  useEffect(() => {
    if (!syncEnabled) return;
    let unsub;
    signInAnonymously(auth).then(() => {
      unsub = onSnapshot(docRef, snap => {
        const d = snap.data();
        if (d) {
          setBookings(d.bookings || []);
          setVehicles(d.vehicles || []);
          setHosts(d.hosts || []);
          setCustomers(d.customers || []);
          setTransactions(d.transactions || []);
        }
        setSyncStatus('synced');
      }, err => { console.error('Firestore sync error', err); setSyncStatus('error'); });
    }).catch(err => { console.error('Firebase sign-in error', err); setSyncStatus('error'); });
    return () => { if (unsub) unsub(); };
  }, []);

  function persistField(field, value, setter) {
    setter(value);
    if (syncEnabled && docRef) {
      setDoc(docRef, { [field]: value }, { merge: true }).catch(err => console.error('Sync write failed', err));
    } else {
      safeSet('mm-' + field, value);
    }
  }

  const paidMap = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      if (t.type === 'income' && t.bookingId) {
        if (!map[t.bookingId]) map[t.bookingId] = { online: 0, cash: 0 };
        map[t.bookingId][t.mode === 'online' ? 'online' : 'cash'] += Number(t.amount) || 0;
      }
    });
    return map;
  }, [transactions]);

  const payoutPaidMap = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      if (t.type === 'expense' && t.category === HOST_PAYOUT_CATEGORY && t.bookingId) {
        map[t.bookingId] = (map[t.bookingId] || 0) + (Number(t.amount) || 0);
      }
    });
    return map;
  }, [transactions]);

  const refundPaidMap = useMemo(() => {
    const map = {};
    transactions.forEach(t => {
      if (t.type === 'expense' && t.category === REFUND_CATEGORY && t.bookingId) {
        map[t.bookingId] = (map[t.bookingId] || 0) + (Number(t.amount) || 0);
      }
    });
    return map;
  }, [transactions]);

  const enriched = useMemo(() => bookings.map(b => ({ ...b, calc: computeBooking(b, vehicles, hosts, paidMap[b.id], payoutPaidMap[b.id], refundPaidMap[b.id]) })), [bookings, vehicles, hosts, paidMap, payoutPaidMap, refundPaidMap]);

  const stats = useMemo(() => {
    const active = enriched.filter(b => b.status !== 'cancelled' && b.status !== 'no-show');
    const pendingPayouts = active.reduce((s, b) => s + b.calc.payoutBalance, 0);
    const pendingFromCustomers = active.reduce((s, b) => s + Math.max(0, b.calc.balance), 0);
    return { pendingPayouts, pendingFromCustomers };
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
    const incomeEntries = transactions.filter(t => t.type === 'income');
    const expenseEntries = transactions.filter(t => t.type === 'expense');
    const onlineIncome = incomeEntries.filter(t => t.mode === 'online').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const cashIncome = incomeEntries.filter(t => t.mode !== 'online').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const onlineOutgo = expenseEntries.filter(t => t.mode === 'online').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const cashOutgo = expenseEntries.filter(t => t.mode !== 'online').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    return { onlineIncome, cashIncome, onlineOutgo, cashOutgo, onlineNet: onlineIncome - onlineOutgo, cashNet: cashIncome - cashOutgo };
  }, [transactions]);

  const paymentModeData = useMemo(() => (
    [{ name: 'Online', value: cashFlow.onlineIncome }, { name: 'Cash', value: cashFlow.cashIncome }].filter(d => d.value > 0)
  ), [cashFlow]);

  function vehicleLabel(v) { return v ? `${v.regNumber} · ${v.make} ${v.model}` : '—'; }
  function customerName(id) { const c = customers.find(c => c.id === id); return c ? c.name : '—'; }
  function bookingLabel(b) { return b ? `${b.code} · ${vehicleLabel((vehicles.find(v => v.id === b.vehicleId)))} · ${customerName(b.customerId)}` : ''; }

  function saveBooking(data) {
    const updated = data.id ? bookings.map(b => b.id === data.id ? data : b) : [...bookings, { ...data, id: uid(), code: data.code || nextBookingCode(bookings) }];
    persistField('bookings', updated, setBookings);
    setBookingForm(null);
  }
  function deleteBooking(id) { persistField('bookings', bookings.filter(b => b.id !== id), setBookings); }
  function saveVehicle(data) {
    const updated = data.id ? vehicles.map(v => v.id === data.id ? data : v) : [...vehicles, { ...data, id: uid() }];
    persistField('vehicles', updated, setVehicles);
    setVehicleForm(null);
  }
  function deleteVehicle(id) { persistField('vehicles', vehicles.filter(v => v.id !== id), setVehicles); }
  function saveHost(data) {
    const updated = data.id ? hosts.map(h => h.id === data.id ? data : h) : [...hosts, { ...data, id: uid() }];
    persistField('hosts', updated, setHosts);
    setHostForm(null);
  }
  function deleteHost(id) { persistField('hosts', hosts.filter(h => h.id !== id), setHosts); }
  function saveCustomer(data) {
    const updated = data.id ? customers.map(c => c.id === data.id ? data : c) : [...customers, { ...data, id: uid() }];
    persistField('customers', updated, setCustomers);
    setCustomerForm(null);
  }
  function deleteCustomer(id) { persistField('customers', customers.filter(c => c.id !== id), setCustomers); }
  function quickAddCustomer(customerWithId) {
    persistField('customers', [...customers, customerWithId], setCustomers);
  }
  function saveTransaction(data) {
    const updated = data.id ? transactions.map(t => t.id === data.id ? data : t) : [...transactions, { ...data, id: uid() }];
    persistField('transactions', updated, setTransactions);
    setTransactionForm(null);
  }
  function deleteTransaction(id) { persistField('transactions', transactions.filter(t => t.id !== id), setTransactions); }
  function openPayoutEntry(booking) {
    setTransactionForm({
      type: 'expense', date: todayStr(), category: HOST_PAYOUT_CATEGORY, mode: 'online',
      bookingId: booking.id, amount: booking.calc.payoutBalance, note: `Payout for ${booking.code}`
    });
  }

  function exportExcel() {
    const bookingRows = enriched.map(b => ({
      'Booking ID': b.code, 'Vehicle': vehicleLabel(b.calc.vehicle), 'Host': b.calc.host ? b.calc.host.name : '—',
      'Customer': customerName(b.customerId), 'Aadhar': (customers.find(c => c.id === b.customerId) || {}).aadhar || '',
      'Start': b.start, 'End': b.end, 'Days': b.days,
      'Rental amount': b.calc.rental, 'Start KM': b.startKm === undefined ? '' : b.startKm, 'End KM': b.endKm === undefined ? '' : b.endKm, 'Extra km charge': b.calc.extraKmCharge, 'Extra hour charge': b.calc.extraHourCharge,
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
      'Linked booking': (bookings.find(b => b.id === t.bookingId) || {}).code || '', 'Mode': t.mode === 'online' ? 'Online' : 'Cash',
      'Amount': t.amount, 'Note': t.note || ''
    }));
    const cashFlowRows = [
      { 'Item': 'Online credit', 'Amount': cashFlow.onlineIncome },
      { 'Item': 'Online debit', 'Amount': cashFlow.onlineOutgo },
      { 'Item': 'Online net', 'Amount': cashFlow.onlineNet },
      { 'Item': 'Cash credit', 'Amount': cashFlow.cashIncome },
      { 'Item': 'Cash debit', 'Amount': cashFlow.cashOutgo },
      { 'Item': 'Cash net', 'Amount': cashFlow.cashNet },
    ];

    const wb = XLSX.utils.book_new();
    function sheetFromRows(rows, headers) {
      if (rows.length > 0) return XLSX.utils.json_to_sheet(rows);
      return XLSX.utils.aoa_to_sheet([headers]);
    }
    XLSX.utils.book_append_sheet(wb, sheetFromRows(bookingRows, ['Booking ID', 'Vehicle', 'Host', 'Customer', 'Aadhar', 'Start', 'End', 'Days', 'Rental amount', 'Start KM', 'End KM', 'Extra km charge', 'Extra hour charge', 'Toll', 'Fuel', 'Damage', 'Traffic fine', 'Total due', 'Online paid', 'Cash paid', 'Payment status', 'Commission %', 'Total commission', 'Host payout', 'Payout paid', 'Payout status', 'Refund due', 'Refund paid', 'Refund status', 'Booking status', 'Notes']), 'Bookings');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(hostRows, ['Host', 'Phone', 'Bank details', 'Default commission %', 'Vehicles', 'Total bookings', 'Total rental collected', 'Total commission (platform)', 'Total payout due', 'Payout paid', 'Payout pending']), 'Host payouts');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(customerRows, ['Name', 'Aadhar number', 'Phone', 'Address', 'Total bookings', 'Total spent', 'Status']), 'Customers');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(transactionRows, ['Date', 'Type', 'Category', 'Linked booking', 'Mode', 'Amount', 'Note']), 'Income & expenses');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(cashFlowRows, ['Item', 'Amount']), 'Cash flow');
    XLSX.writeFile(wb, `MM_Miles_Export_${todayStr()}.xlsx`);
  }

  function downloadImportTemplate() {
    const wb = XLSX.utils.book_new();
    const vehicleRows = [{ 'Reg Number': 'TN01BR9111', 'Make': 'Maruti Suzuki', 'Model': 'Fronx', 'Year': 2023, 'Fuel': 'Petrol', 'Transmission': 'Automatic', 'Daily Rate': 2700, 'Hourly Rate': 150, '4hr Rate': 800, '4hr KM': 100, '4-10hr Rate': 180, '4-10hr KM': 200, '12hr Rate': 1800, '12hr KM': 300, 'Host Name': 'Mohamed Faiyaz', 'Host Phone': '9876543210', 'Host Commission %': 30, 'KM Policy': 'Unlimited', 'KM Limit': '', 'Extra KM Rate': '', 'Extra Hour Rate': 150 }];
    const bookingRows = [{ 'Booking ID': '', 'Vehicle Reg Number': 'TN01BR9111', 'Customer Name': 'Ravi Kumar', 'Customer Aadhar': '', 'Customer Phone': '', 'Customer Address': '', 'Start': '01-04-2026 08:00', 'End': '02-04-2026 08:00', 'Rental Amount': 2700, 'Extra Hours': 0, 'Extra Hour Charge': 0, 'Start KM': 12000, 'End KM': 12180, 'Toll': 0, 'Fuel': 0, 'Damage': 0, 'Traffic Fine': 0, 'Booking Status': 'completed', 'Online Paid': 2700, 'Cash Paid': 0, 'Payout Paid': 1890, 'Payout Mode': 'online', 'Notes': '' }];
    const txnRows = [{ 'Date': '05-04-2026', 'Type': 'Expense', 'Category': 'Vehicle maintenance', 'Amount': 500, 'Mode': 'Cash', 'Linked Booking ID': '', 'Note': 'Example — delete this row' }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vehicleRows), 'Vehicles');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bookingRows), 'Bookings');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txnRows), 'Other Transactions');
    XLSX.writeFile(wb, 'MM_Miles_Import_Template.xlsx');
  }

  function handleImportFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array', cellDates: true });
        const warnings = [];
        const newHosts = [...hosts];
        const newVehicles = [...vehicles];
        const newCustomers = [...customers];
        const newBookings = [...bookings];
        const newTransactions = [...transactions];
        let addedVehicles = 0, updatedVehicles = 0, addedHosts = 0, addedCustomers = 0, addedBookings = 0, addedTxns = 0;

        function findOrCreateHost(name, phone, rate) {
          if (!name) return null;
          let h = newHosts.find(h => h.name.trim().toLowerCase() === String(name).trim().toLowerCase());
          if (!h) {
            h = { id: uid(), name: String(name).trim(), phone: phone || '', commissionRate: numOrBlank(rate) !== '' ? numOrBlank(rate) : 30, bank: '' };
            newHosts.push(h); addedHosts++;
          }
          return h;
        }
        function findOrCreateVehicle(reg, row) {
          if (!reg) return null;
          const regNorm = String(reg).trim().toUpperCase();
          let v = newVehicles.find(v => v.regNumber === regNorm);
          if (!v) {
            const host = findOrCreateHost(getCol(row, 'Host Name'), getCol(row, 'Host Phone'), getCol(row, 'Host Commission %', 'Host Commission'));
            v = {
              id: uid(), regNumber: regNorm, make: getCol(row, 'Make') || 'Unknown', model: getCol(row, 'Model') || '', year: numOrBlank(getCol(row, 'Year')),
              fuel: getCol(row, 'Fuel') || 'Petrol', transmission: getCol(row, 'Transmission') || 'Automatic', dailyRate: numOrBlank(getCol(row, 'Daily Rate')), hourlyRate: numOrBlank(getCol(row, 'Hourly Rate')),
              pkg4hrRate: numOrBlank(getCol(row, '4hr Rate')), pkg4hrKm: numOrBlank(getCol(row, '4hr KM')),
              pkg4to10Rate: numOrBlank(getCol(row, '4-10hr Rate')), pkg4to10Km: numOrBlank(getCol(row, '4-10hr KM')),
              pkg12hrRate: numOrBlank(getCol(row, '12hr Rate')), pkg12hrKm: numOrBlank(getCol(row, '12hr KM')),
              hostId: host ? host.id : '', kmPolicy: /limit/i.test(getCol(row, 'KM Policy')) ? 'limited' : 'unlimited',
              kmLimit: numOrBlank(getCol(row, 'KM Limit')), extraKmRate: numOrBlank(getCol(row, 'Extra KM Rate')),
              extraHourRate: numOrBlank(getCol(row, 'Extra Hour Rate')), commissionRate: ''
            };
            newVehicles.push(v); addedVehicles++;
          } else {
            const newRate = numOrBlank(getCol(row, 'Daily Rate'));
            const newHourly = numOrBlank(getCol(row, 'Hourly Rate'));
            let changed = false;
            if (newRate !== '' && Number(v.dailyRate) !== Number(newRate)) { v.dailyRate = newRate; changed = true; }
            if (newHourly !== '' && Number(v.hourlyRate) !== Number(newHourly)) { v.hourlyRate = newHourly; changed = true; }
            ['4hr Rate,pkg4hrRate', '4hr KM,pkg4hrKm', '4-10hr Rate,pkg4to10Rate', '4-10hr KM,pkg4to10Km', '12hr Rate,pkg12hrRate', '12hr KM,pkg12hrKm'].forEach(pair => {
              const [col, field] = pair.split(',');
              const val = numOrBlank(getCol(row, col));
              if (val !== '' && Number(v[field]) !== Number(val)) { v[field] = val; changed = true; }
            });
            if (changed) updatedVehicles++;
          }
          return v;
        }
        function findOrCreateCustomer(name, aadhar, phone, address) {
          if (!name) return null;
          const nameNorm = String(name).trim().toLowerCase();
          let c = newCustomers.find(c => (aadhar && c.aadhar && String(c.aadhar).trim() === String(aadhar).trim()) || c.name.trim().toLowerCase() === nameNorm);
          if (!c) {
            c = { id: uid(), name: String(name).trim(), aadhar: aadhar || '', phone: phone || '', address: address || '' };
            newCustomers.push(c); addedCustomers++;
          }
          return c;
        }

        const vehicleSheet = wb.Sheets['Vehicles'];
        if (vehicleSheet) {
          XLSX.utils.sheet_to_json(vehicleSheet).forEach(row => {
            const reg = getCol(row, 'Reg Number', 'Registration Number', 'Vehicle Reg Number');
            if (reg) findOrCreateVehicle(reg, row);
          });
        }

        const bookingSheet = wb.Sheets['Bookings'];
        const codeToId = {};
        newBookings.forEach(b => { if (b.code) codeToId[b.code] = b.id; });
        if (bookingSheet) {
          XLSX.utils.sheet_to_json(bookingSheet).forEach((row, i) => {
            const reg = getCol(row, 'Vehicle Reg Number', 'Reg Number', 'Vehicle');
            const custName = getCol(row, 'Customer Name', 'Customer');
            const start = parseFlexibleDateTime(getCol(row, 'Start', 'Start Date'));
            const end = parseFlexibleDateTime(getCol(row, 'End', 'End Date'));
            const rental = numOrBlank(getCol(row, 'Rental Amount', 'Rental'));
            if (!reg || !custName || !start || !end || rental === '') { warnings.push(`Bookings row ${i + 2}: missing vehicle, customer, dates, or rental amount — skipped.`); return; }
            const vehicle = findOrCreateVehicle(reg, row);
            const customer = findOrCreateCustomer(custName, getCol(row, 'Customer Aadhar', 'Aadhar'), getCol(row, 'Customer Phone', 'Phone'), getCol(row, 'Customer Address', 'Address'));
            let code = String(getCol(row, 'Booking ID', 'Booking Id', 'Code') || '').trim();
            if (!code || codeToId[code]) code = nextBookingCode(newBookings);
            const s = new Date(start), e = new Date(end);
            const days = e > s ? Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24))) : 1;
            const bookingId = uid();
            const startKm = numOrBlank(getCol(row, 'Start KM', 'Start Km', 'Odometer Start'));
            const endKm = numOrBlank(getCol(row, 'End KM', 'End Km', 'Odometer End'));
            const kmDriven = (startKm !== '' && endKm !== '') ? Math.max(0, endKm - startKm) : 0;
            const isVehLimited = vehicle.kmPolicy === 'limited';
            const extraKm = isVehLimited ? Math.max(0, kmDriven - (Number(vehicle.kmLimit) || 0)) : 0;
            const extraKmCharge = isVehLimited ? extraKm * (Number(vehicle.extraKmRate) || 0) : 0;
            const booking = {
              id: bookingId, code, vehicleId: vehicle.id, customerId: customer.id, start, end, days,
              rentalAmount: rental, extraHours: numOrBlank(getCol(row, 'Extra Hours')) || 0, extraHourCharge: numOrBlank(getCol(row, 'Extra Hour Charge')) || 0,
              startKm: startKm === '' ? '' : startKm, endKm: endKm === '' ? '' : endKm, extraKm, extraKmCharge,
              tollAmount: numOrBlank(getCol(row, 'Toll')) || 0, fuelAmount: numOrBlank(getCol(row, 'Fuel')) || 0,
              damageAmount: numOrBlank(getCol(row, 'Damage')) || 0, fineAmount: numOrBlank(getCol(row, 'Traffic Fine', 'Fine')) || 0,
              status: (String(getCol(row, 'Booking Status', 'Status')).toLowerCase() || 'completed').match(/ongoing|completed|cancelled/) ? String(getCol(row, 'Booking Status', 'Status')).toLowerCase() : 'completed',
              notes: getCol(row, 'Notes') || ''
            };
            newBookings.push(booking); addedBookings++; codeToId[code] = bookingId;
            const onlinePaid = numOrBlank(getCol(row, 'Online Paid'));
            const cashPaid = numOrBlank(getCol(row, 'Cash Paid'));
            if (onlinePaid) { newTransactions.push({ id: uid(), type: 'income', date: start.slice(0, 10), category: 'Booking payment', amount: onlinePaid, mode: 'online', bookingId, note: 'Imported' }); addedTxns++; }
            if (cashPaid) { newTransactions.push({ id: uid(), type: 'income', date: start.slice(0, 10), category: 'Booking payment', amount: cashPaid, mode: 'cash', bookingId, note: 'Imported' }); addedTxns++; }
            const payoutPaid = numOrBlank(getCol(row, 'Payout Paid'));
            if (payoutPaid) { newTransactions.push({ id: uid(), type: 'expense', date: end.slice(0, 10), category: HOST_PAYOUT_CATEGORY, amount: payoutPaid, mode: /cash/i.test(getCol(row, 'Payout Mode')) ? 'cash' : 'online', bookingId, note: 'Imported' }); addedTxns++; }
          });
        }

        const txnSheet = wb.Sheets['Other Transactions'] || wb.Sheets['Transactions'] || wb.Sheets['Expenses'];
        if (txnSheet) {
          XLSX.utils.sheet_to_json(txnSheet).forEach((row, i) => {
            const date = parseFlexibleDate(getCol(row, 'Date'));
            const amount = numOrBlank(getCol(row, 'Amount'));
            if (!date || amount === '') { warnings.push(`Other Transactions row ${i + 2}: missing date or amount — skipped.`); return; }
            const type = /income/i.test(getCol(row, 'Type')) ? 'income' : 'expense';
            const category = getCol(row, 'Category') || (type === 'income' ? 'Other income' : 'Other');
            const mode = /cash/i.test(getCol(row, 'Mode')) ? 'cash' : 'online';
            const linkedCode = String(getCol(row, 'Linked Booking ID', 'Booking ID') || '').trim();
            newTransactions.push({ id: uid(), type, date, category, amount, mode, bookingId: linkedCode ? (codeToId[linkedCode] || '') : '', note: getCol(row, 'Note') || 'Imported' });
            addedTxns++;
          });
        }

        if (addedHosts) persistField('hosts', newHosts, setHosts);
        if (addedVehicles || updatedVehicles) persistField('vehicles', newVehicles, setVehicles);
        if (addedCustomers) persistField('customers', newCustomers, setCustomers);
        if (addedBookings) persistField('bookings', newBookings, setBookings);
        if (addedTxns) persistField('transactions', newTransactions, setTransactions);

        setImportSummary({ hosts: addedHosts, vehicles: addedVehicles, vehiclesUpdated: updatedVehicles, customers: addedCustomers, bookings: addedBookings, transactions: addedTxns, warnings });
      } catch (err) {
        console.error('Import failed', err);
        setImportSummary({ error: 'Could not read that file. Make sure it\u2019s a .xlsx file matching the template.' });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function clearAllData() {
    persistField('bookings', [], setBookings);
    persistField('vehicles', [], setVehicles);
    persistField('hosts', [], setHosts);
    persistField('customers', [], setCustomers);
    persistField('transactions', [], setTransactions);
    setShowResetConfirm(false);
  }

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

  return (
    <div style={{ display: 'flex', width: '100%', maxWidth: '1280px', minHeight: '80vh', fontFamily: 'Inter, sans-serif', background: 'var(--page-bg)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(28,37,65,0.08)' }}>
      <div style={{ width: '220px', flexShrink: 0, background: '#1C2541', padding: '20px 12px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '4px 8px 20px' }}>
          <img src="/logo.png" alt="MM Miles" style={{ height: '40px', width: 'auto', display: 'block' }} />
          <p style={{ fontSize: '11px', color: '#8892B0', margin: '2px 0 0' }}>Self-drive rental ledger</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navItems.map(item => (
            <div key={item.id} className={`mm-nav-item ${tab === item.id ? 'active' : ''}`} onClick={() => setTab(item.id)}>
              <item.Icon size={16} />{item.label}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button type="button" className="mm-btn mm-btn-ghost" style={{ justifyContent: 'center', background: 'transparent', color: '#C9CCDA', border: '1px solid #3A4568' }} onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}>
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
          <p style={{ fontSize: '11px', margin: '4px 8px 0', color: syncStatus === 'synced' ? '#8FD19E' : syncStatus === 'error' ? '#E08A8A' : '#8892B0' }}>
            {syncStatus === 'synced' ? '● Synced across devices' : syncStatus === 'connecting' ? '○ Connecting…' : syncStatus === 'error' ? '● Sync error — check setup' : '○ Local only — see setup steps'}
          </p>
          <p style={{ fontSize: '11px', color: '#6B7396', margin: '0 8px' }}>{bookings.length} bookings logged</p>
          <div style={{ borderTop: '1px solid #2E3A5C', marginTop: '6px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 8px 0' }}>
            <p style={{ fontSize: '11px', color: '#C9CCDA', margin: 0 }}>Signed in as <b>{perms.label}</b></p>
            <button type="button" onClick={onLogout} style={{ background: 'none', border: 'none', color: '#8892B0', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer' }}>Switch user</button>
          </div>
          {perms.canClear && <button type="button" onClick={() => setShowResetConfirm(true)} style={{ background: 'none', border: 'none', color: '#8A5461', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer', padding: '2px 8px', textAlign: 'left' }}>Clear all data</button>}
          {authInfo.role === 'admin' && <button type="button" onClick={() => setShowPasswordsModal(true)} style={{ background: 'none', border: 'none', color: '#8892B0', fontSize: '11px', textDecoration: 'underline', cursor: 'pointer', padding: '2px 8px', textAlign: 'left' }}>Change passwords</button>}
        </div>
      </div>

      <div style={{ flex: 1, padding: '24px 28px', overflowY: 'auto', maxHeight: '90vh' }}>
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
      </div>

      {bookingForm && <BookingModal form={bookingForm} vehicles={vehicles} hosts={hosts} customers={customers} transactions={transactions} bookings={bookings} onCancel={() => setBookingForm(null)} onSave={saveBooking} onQuickAddCustomer={quickAddCustomer} readOnly={!perms.canEditBooking(bookingForm)} canFinance={perms.canFinance} canOverridePrice={perms.canOverridePrice} canBypassTimeGuards={perms.canBypassTimeGuards} />}
      {vehicleForm && <VehicleModal form={vehicleForm} hosts={hosts} onCancel={() => setVehicleForm(null)} onSave={saveVehicle} />}
      {hostForm && <HostModal form={hostForm} onCancel={() => setHostForm(null)} onSave={saveHost} />}
      {customerForm && <CustomerModal form={customerForm} onCancel={() => setCustomerForm(null)} onSave={saveCustomer} />}
      {transactionForm && <TransactionModal form={transactionForm} bookings={enriched} bookingLabel={bookingLabel} onCancel={() => setTransactionForm(null)} onSave={saveTransaction} />}
      {importSummary && <ImportSummaryModal summary={importSummary} onClose={() => setImportSummary(null)} />}
      {showResetConfirm && <ResetConfirmModal syncEnabled={syncEnabled} counts={{ bookings: bookings.length, vehicles: vehicles.length, hosts: hosts.length, customers: customers.length, transactions: transactions.length }} onCancel={() => setShowResetConfirm(false)} onConfirm={clearAllData} />}
      {showPasswordsModal && <ChangePasswordsModal rolePasswords={rolePasswords} onCancel={() => setShowPasswordsModal(false)} onSave={(next) => { onUpdateRolePasswords(next); setShowPasswordsModal(false); }} />}
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
