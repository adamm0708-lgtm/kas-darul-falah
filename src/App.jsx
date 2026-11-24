import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase, supabaseConfigured } from './lib/supabase';
import InstallPrompt from './components/InstallPrompt.jsx';

/* Logo resmi: kubah masjid putih + bulan sabit emas di atas hijau #14532d —
   selaras dengan ikon PWA (public/icons/icon.svg). Hanya visual. */
function LogoMark({ className }) {
  return (
    <span className={className || 'logo-mark'} aria-hidden="true">
      <svg viewBox="0 0 120 120" role="img" aria-label="Logo Kas Langgar Darul Falah">
        <defs>
          <linearGradient id="logoTileGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1b6b3a" />
            <stop offset="0.55" stopColor="#14532d" />
            <stop offset="1" stopColor="#0b3d20" />
          </linearGradient>
          <mask id="logoCrescent">
            <rect width="120" height="120" fill="#fff" />
            <circle cx="99" cy="21" r="7.5" fill="#000" />
          </mask>
        </defs>
        <rect x="2" y="2" width="116" height="116" rx="28" fill="url(#logoTileGrad)" stroke="#d4af37" strokeWidth="2.5" />
        <g fill="none" stroke="#d4af37" strokeOpacity="0.22" strokeWidth="1.5">
          <rect x="9" y="9" width="20" height="20" rx="2" />
          <rect x="9" y="9" width="20" height="20" rx="2" transform="rotate(45 19 19)" />
        </g>
        <circle cx="95" cy="24" r="9" fill="#d4af37" mask="url(#logoCrescent)" />
        <path d="M30 68 A30 30 0 0 1 90 68 Z" fill="#ffffff" />
        <rect x="58" y="32" width="4" height="10" fill="#d4af37" />
        <circle cx="60" cy="29" r="3.5" fill="#d4af37" />
        <rect x="14" y="58" width="7" height="44" rx="3.5" fill="#ffffff" />
        <rect x="99" y="58" width="7" height="44" rx="3.5" fill="#ffffff" />
        <circle cx="17.5" cy="54" r="3" fill="#d4af37" />
        <circle cx="102.5" cy="54" r="3" fill="#d4af37" />
        <rect x="24" y="68" width="72" height="34" rx="5" fill="#ffffff" />
        <path d="M54 102 V88 a6 6 0 0 1 12 0 v14 Z" fill="#14532d" />
      </svg>
    </span>
  );
}

/* Warna chip kategori — murni presentasi, deterministik dari nama. */
const CAT_TONES = ['cat-tone-0', 'cat-tone-1', 'cat-tone-2', 'cat-tone-3', 'cat-tone-4', 'cat-tone-5'];
function catTone(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CAT_TONES[h % CAT_TONES.length];
}

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

export default function App() {
  const [connection, setConnection] = useState('Memeriksa konfigurasi…');
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState('all');
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 10;
  const [reportMonth, setReportMonth] = useState('2026-11');
  const [reportTab, setReportTab] = useState('summary');
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newType, setNewType] = useState('income');
  const [newCategory, setNewCategory] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [rowMessage, setRowMessage] = useState('');

  async function verifyAdmin(session) {
    if (!session?.user) {
      setIsAdmin(false);
      setAdminEmail('');
      return;
    }
    const { data, error: adminError } = await supabase.rpc('is_admin');
    if (adminError || data !== true) {
      setIsAdmin(false);
      setAdminEmail('');
      return;
    }
    setIsAdmin(true);
    setAdminEmail(session.user.email || '');
  }

  useEffect(() => {
    let alive = true;
    async function loadDashboard() {
      if (!supabaseConfigured) {
        setConnection('Konfigurasi Supabase belum lengkap');
        setError('Periksa VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di Vercel.');
        setLoading(false);
        return;
      }
      setConnection('Menghubungkan ke Supabase…');
      const [txResult, catResult, sessionResult] = await Promise.all([
        supabase.from('transactions').select('id, transaction_date, transaction_type, description, amount, category_id').order('transaction_date', { ascending: false }),
        supabase.from('categories').select('*'),
        supabase.auth.getSession()
      ]);
      if (!alive) return;
      if (txResult.error) {
        setConnection('Gagal membaca transaksi');
        setError(txResult.error.message);
        setLoading(false);
        return;
      }
      if (catResult.error) {
        setConnection('Terhubung, kategori tidak terbaca');
        setError('Transaksi berhasil dibaca, tetapi kategori gagal dimuat: ' + catResult.error.message);
      } else {
        setConnection('Terhubung ke Supabase');
      }
      setTransactions(txResult.data ?? []);
      setCategories(catResult.data ?? []);
      if (sessionResult.data?.session) await verifyAdmin(sessionResult.data.session);
      setLoading(false);
    }
    loadDashboard();
    return () => {
      alive = false;
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginBusy(true);
    setLoginMessage('');
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setLoginMessage('Login gagal: ' + signInError.message);
      setLoginBusy(false);
      return;
    }
    const { data: adminResult, error: adminError } = await supabase.rpc('is_admin');
    if (adminError || adminResult !== true) {
      await supabase.auth.signOut();
      setLoginMessage('Akun berhasil masuk, tetapi belum terdaftar sebagai admin. Hubungi pengelola.');
      setLoginBusy(false);
      return;
    }
    setIsAdmin(true);
    setAdminEmail(data.user?.email || email.trim());
    setPassword('');
    setLoginMessage('Login admin berhasil.');
    setShowLogin(false);
    setLoginBusy(false);
  }

  async function refreshTransactions() {
    const { data, error: refreshError } = await supabase
      .from('transactions')
      .select('id, transaction_date, transaction_type, description, amount, category_id')
      .order('transaction_date', { ascending: false });
    if (refreshError) throw refreshError;
    setTransactions(data ?? []);
  }

  /* Simpan transaksi: tambah baru (insert) atau ubah yang sudah ada (update).
     Dipakai form yang sama; editingId null = tambah, terisi = ubah. */
  async function handleSaveTransaction(event) {
    event.preventDefault();
    if (!isAdmin) return;
    if (!newCategory) {
      setFormMessage('Pilih kategori terlebih dahulu.');
      return;
    }
    const amount = Number(newAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormMessage('Jumlah harus lebih dari nol.');
      return;
    }
    setSavingTransaction(true);
    setFormMessage('');
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
      setFormMessage('Sesi admin tidak ditemukan. Silakan login kembali.');
      setSavingTransaction(false);
      return;
    }
    const payload = {
      transaction_date: newDate,
      transaction_type: newType,
      category_id: Number(newCategory),
      description: newDescription.trim(),
      amount
    };
    let saveError = null;
    if (editingId) {
      ({ error: saveError } = await supabase.from('transactions').update(payload).eq('id', editingId));
    } else {
      ({ error: saveError } = await supabase.from('transactions').insert({ ...payload, created_by: userResult.user.id }));
    }
    if (saveError) {
      setFormMessage('Gagal menyimpan: ' + saveError.message);
      setSavingTransaction(false);
      return;
    }
    try {
      await refreshTransactions();
      setFormMessage(editingId ? 'Transaksi berhasil diubah.' : 'Transaksi berhasil disimpan.');
      setEditingId(null);
      setNewDescription('');
      setNewAmount('');
      setNewDate(new Date().toISOString().slice(0, 10));
      setNewType('income');
      setNewCategory('');
      setShowAddForm(false);
    } catch (refreshError) {
      setFormMessage('Transaksi tersimpan, tetapi daftar gagal diperbarui: ' + refreshError.message);
    }
    setSavingTransaction(false);
  }

  function startEditTransaction(t) {
    setEditingId(t.id);
    setNewDate(String(t.transaction_date).slice(0, 10));
    setNewType(t.transaction_type);
    setNewCategory(String(t.category_id));
    setNewDescription(t.description || '');
    setNewAmount(String(t.amount ?? ''));
    setFormMessage('');
    setRowMessage('');
    setDeleteConfirmId(null);
    setShowAddForm(true);
  }

  function cancelEditTransaction() {
    setEditingId(null);
    setShowAddForm(false);
    setFormMessage('');
  }

  async function handleDeleteTransaction(id) {
    if (!isAdmin) return;
    if (deleteConfirmId !== id) {
      setDeleteConfirmId(id);
      return;
    }
    setDeletingId(id);
    setRowMessage('');
    const { error: deleteError } = await supabase.from('transactions').delete().eq('id', id);
    setDeletingId(null);
    setDeleteConfirmId(null);
    if (deleteError) {
      setRowMessage('Gagal menghapus: ' + deleteError.message);
      return;
    }
    try {
      await refreshTransactions();
      setRowMessage('Transaksi berhasil dihapus.');
    } catch (refreshError) {
      setRowMessage('Transaksi terhapus, tetapi daftar gagal diperbarui: ' + refreshError.message);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setAdminEmail('');
    setLoginMessage('Anda sudah logout.');
  }

  const categoryMap = useMemo(() => new Map(categories.map(c => [String(c.id), c.name ?? c.category_name ?? c.title ?? 'Kategori'])), [categories]);
  const years = useMemo(() => [...new Set(transactions.map(t => String(t.transaction_date).slice(0, 4)))].sort().reverse(), [transactions]);
  const visible = useMemo(() => transactions.filter(t => year === 'all' || String(t.transaction_date).startsWith(year)), [transactions, year]);
  const historyPageCount = Math.max(1, Math.ceil(visible.length / historyPageSize));
  const paginatedVisible = visible.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);
  const totals = useMemo(() => visible.reduce((a, t) => {
    const amount = Number(t.amount) || 0;
    if (t.transaction_type === 'income') a.income += amount;
    if (t.transaction_type === 'expense') a.expense += amount;
    return a;
  }, { income: 0, expense: 0 }), [visible]);
  const balance = totals.income - totals.expense;
  const monthlyReport = useMemo(() => {
    const [selectedYear, selectedMonth] = reportMonth.split('-').map(Number);
    const monthTransactions = transactions
      .filter(t => String(t.transaction_date).slice(0, 7) === reportMonth)
      .slice()
      .sort((a, b) => String(a.transaction_date).localeCompare(String(b.transaction_date)));
    const income = monthTransactions.filter(t => t.transaction_type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
    const expense = monthTransactions.filter(t => t.transaction_type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);
    const knownOpening = {
      '2026-07': 2330000,
      '2026-08': 2105000,
      '2026-09': 6259000,
      '2026-10': 7172000,
      '2026-11': 7458000
    };
    const opening = knownOpening[reportMonth] ?? (reportMonth > '2026-11' ? 7458000 + transactions
      .filter(t => String(t.transaction_date).slice(0, 7) >= '2026-11' && String(t.transaction_date).slice(0, 7) < reportMonth)
      .reduce((s, t) => s + (t.transaction_type === 'income' ? 1 : -1) * Number(t.amount || 0), 0) : 0);
    const byCategory = new Map();
    monthTransactions.forEach(t => {
      const category = categoryMap.get(String(t.category_id)) || 'Tanpa kategori';
      const item = byCategory.get(category) || { income: 0, expense: 0 };
      if (t.transaction_type === 'income') item.income += Number(t.amount || 0);
      if (t.transaction_type === 'expense') item.expense += Number(t.amount || 0);
      byCategory.set(category, item);
    });
    return { monthTransactions, income, expense, opening, closing: opening + income - expense, byCategory, selectedYear, selectedMonth };
  }, [transactions, reportMonth, categoryMap]);


  function downloadMonthlyPdf() {
    const monthLabel = new Date(reportMonth + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFontSize(15);
    doc.text('LANGGAR WAQAF DARUL FALAH', 14, 15);
    doc.setFontSize(10);
    doc.text('Ledok Kidul Dalem, Bangil', 14, 21);
    doc.setFontSize(12);
    doc.text('LAPORAN KAS BULAN ' + monthLabel.toUpperCase(), 14, 30);
    autoTable(doc, {
      startY: 36,
      head: [['Saldo Awal', 'Pemasukan', 'Pengeluaran', 'Saldo Akhir', 'Jumlah Transaksi']],
      body: [[money.format(monthlyReport.opening), money.format(monthlyReport.income), money.format(monthlyReport.expense), money.format(monthlyReport.closing), String(monthlyReport.monthTransactions.length)]],
      styles: { fontSize: 9 }
    });
    const details = monthlyReport.monthTransactions.map((t, i) => [
      String(i + 1),
      dateFmt.format(new Date(t.transaction_date + 'T00:00:00')),
      t.description || '-',
      categoryMap.get(String(t.category_id)) || '-',
      t.transaction_type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      t.transaction_type === 'income' ? money.format(Number(t.amount || 0)) : '-',
      t.transaction_type === 'expense' ? money.format(Number(t.amount || 0)) : '-'
    ]);
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['No', 'Tanggal', 'Keterangan', 'Kategori', 'Jenis', 'Pemasukan', 'Pengeluaran']],
      body: details.length ? details : [['-', '-', 'Tidak ada transaksi', '-', '-', '-', '-']],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [20, 83, 45] },
      columnStyles: { 2: { cellWidth: 62 } }
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [['Kategori', 'Total Pemasukan', 'Total Pengeluaran', 'Selisih']],
      body: [...monthlyReport.byCategory.entries()].map(([name, value]) => [name, money.format(value.income), money.format(value.expense), money.format(value.income - value.expense)]),
      styles: { fontSize: 8 }
    });
    doc.save('Laporan_Kas_' + reportMonth + '.pdf');
  }

  function downloadMonthlyExcel() {
    const monthLabel = new Date(reportMonth + '-01T00:00:00').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const workbook = XLSX.utils.book_new();
    const summaryRows = [
      ['LANGGAR WAQAF DARUL FALAH'],
      ['Ledok Kidul Dalem, Bangil'],
      ['LAPORAN KAS BULAN ' + monthLabel.toUpperCase()],
      [],
      ['Saldo awal', monthlyReport.opening],
      ['Total pemasukan', monthlyReport.income],
      ['Total pengeluaran', monthlyReport.expense],
      ['Saldo akhir', monthlyReport.closing],
      ['Jumlah transaksi', monthlyReport.monthTransactions.length]
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), 'Ringkasan');
    const detailRows = [
      ['No', 'Tanggal', 'Keterangan', 'Kategori', 'Jenis', 'Pemasukan (Rp)', 'Pengeluaran (Rp)'],
      ...monthlyReport.monthTransactions.map((t, i) => [
        i + 1, t.transaction_date, t.description || '-', categoryMap.get(String(t.category_id)) || '-',
        t.transaction_type === 'income' ? 'Pemasukan' : 'Pengeluaran',
        t.transaction_type === 'income' ? Number(t.amount || 0) : 0,
        t.transaction_type === 'expense' ? Number(t.amount || 0) : 0
      ])
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(detailRows), 'Rincian Transaksi');
    const categoryRows = [
      ['Kategori', 'Total Pemasukan (Rp)', 'Total Pengeluaran (Rp)', 'Selisih (Rp)'],
      ...[...monthlyReport.byCategory.entries()].map(([name, value]) => [name, value.income, value.expense, value.income - value.expense])
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(categoryRows), 'Rekap Kategori');
    XLSX.writeFile(workbook, 'Laporan_Kas_' + reportMonth + '.xlsx');
  }


  return (
    <main className="page-shell">
      <InstallPrompt />
      <header className="hero">
        <svg className="hero-skyline" viewBox="0 0 520 200" aria-hidden="true" focusable="false">
          <defs>
            <mask id="heroCrescent">
              <rect width="520" height="200" fill="#fff" />
              <circle cx="454" cy="40" r="14" fill="#000" />
            </mask>
          </defs>
          <g fill="#082a17" opacity="0.6">
            <path d="M150 200 V150 A70 70 0 0 1 290 150 V200 Z" />
            <rect x="120" y="148" width="200" height="52" />
            <rect x="96" y="108" width="14" height="92" rx="7" />
            <rect x="330" y="108" width="14" height="92" rx="7" />
            <path d="M360 200 V170 A26 26 0 0 1 412 170 V200 Z" />
            <rect x="352" y="168" width="68" height="32" />
            <path d="M28 200 V178 A20 20 0 0 1 68 178 V200 Z" />
            <rect x="22" y="176" width="52" height="24" />
          </g>
          <g fill="#d4af37">
            <rect x="216" y="64" width="8" height="20" />
            <circle cx="220" cy="60" r="6" />
            <circle cx="103" cy="102" r="6" />
            <circle cx="337" cy="102" r="6" />
            <circle cx="446" cy="46" r="17" mask="url(#heroCrescent)" />
            <path d="M400 90 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8 z" />
            <path d="M120 60 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5 z" opacity="0.7" />
          </g>
        </svg>
        <div className="hero-inner">
          <div className="hero-top">
            <div className="logo-lockup">
              <LogoMark className="logo-mark" />
              <div className="logo-text">
                <p className="logo-eyebrow">LAPORAN KEUANGAN LANGGAR</p>
                <h1 className="logo-name">Kas Langgar Darul Falah</h1>
                <p className="logo-sub">Langgar Waqaf Darul Falah · Ledok Kidul Dalem, Bangil</p>
              </div>
            </div>
            <span className="status-pill">{connection}</span>
          </div>
          <p className="hero-tag">Keuangan langgar yang transparan — pemasukan, pengeluaran, dan laporan bulanan bisa dipantau bersama oleh jamaah.</p>
          <div className="hero-chips"><span className="hero-chip">Transparan</span><span className="hero-chip">Laporan bulanan</span><span className="hero-chip">Arsip lengkap</span></div>
        </div>
      </header>
      <section className="intro">
        <div><p className="eyebrow">DASHBOARD KAS</p><h2>Ringkasan keuangan</h2><p className="muted">Transparan, rapi, dan bisa dipantau bersama.</p></div>
        <div className="intro-actions">
          <span className="muted">{visible.length} transaksi</span>
          {isAdmin
            ? <button className="outline-button" onClick={handleLogout}>Logout Admin</button>
            : <button className="outline-button" onClick={() => { setShowLogin(v => !v); setLoginMessage(''); }}>Masuk Admin</button>}
        </div>
      </section>
      {isAdmin && <section className="admin-welcome"><div className="admin-welcome-head"><div><strong>Mode Admin aktif</strong><span>{adminEmail}</span></div><button className="primary-button" type="button" onClick={() => { const opening = !showAddForm; setShowAddForm(opening); setFormMessage(''); if (opening) { setEditingId(null); setNewDescription(''); setNewAmount(''); setNewDate(new Date().toISOString().slice(0, 10)); setNewType('income'); setNewCategory(''); } }}>{showAddForm ? 'Tutup Form' : '+ Tambah Transaksi'}</button></div><p>Catat pemasukan atau pengeluaran baru, atau ubah dan hapus catatan yang sudah ada dari tabel riwayat di bawah.</p></section>}
      {isAdmin && showAddForm && <section className="login-panel transaction-form-panel">
        <div><p className="eyebrow">BUKU KAS</p><h2>{editingId ? 'Ubah Transaksi' : 'Tambah Transaksi'}</h2><p className="muted">{editingId ? 'Perubahan langsung tersimpan ke database.' : 'Catatan baru akan langsung tersimpan ke database.'}</p></div>
        <form className="login-form" onSubmit={handleSaveTransaction}>
          <label>Tanggal<input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} required /></label>
          <label>Jenis transaksi<select value={newType} onChange={e => setNewType(e.target.value)}><option value="income">Pemasukan</option><option value="expense">Pengeluaran</option></select></label>
          <label>Kategori<select value={newCategory} onChange={e => setNewCategory(e.target.value)} required><option value="">Pilih kategori</option>{categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name ?? cat.category_name ?? cat.title ?? 'Kategori'}</option>)}</select></label>
          <label>Keterangan<input type="text" value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Contoh: Infaq bulanan" required maxLength={200} /></label>
          <label>Jumlah (Rupiah)<input type="number" min="1" step="1" inputMode="numeric" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="Contoh: 100000" required /></label>
          {formMessage && <p className="login-message">{formMessage}</p>}
          <div className="login-actions"><button className="primary-button" type="submit" disabled={savingTransaction}>{savingTransaction ? 'Menyimpan…' : (editingId ? 'Simpan Perubahan' : 'Simpan Transaksi')}</button><button className="cancel-button" type="button" onClick={cancelEditTransaction}>Batal</button></div>
        </form>
      </section>}
      {showLogin && !isAdmin && <section className="login-panel">
        <div><p className="eyebrow">AREA PENGELOLA</p><h2>Login Admin</h2><p className="muted">Masuk menggunakan akun admin yang sudah dibuat di Supabase.</p></div>
        <form className="login-form" onSubmit={handleLogin}>
          <label>Email admin<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nama@email.com" autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password akun admin" autoComplete="current-password" required /></label>
          {loginMessage && <p className="login-message">{loginMessage}</p>}
          <div className="login-actions"><button className="primary-button" type="submit" disabled={loginBusy}>{loginBusy ? 'Memeriksa…' : 'Login'}</button><button className="cancel-button" type="button" onClick={() => setShowLogin(false)}>Batal</button></div>
        </form>
      </section>}
      {loginMessage && !showLogin && !isAdmin && <p className="login-message">{loginMessage}</p>}
      {error && <section className="notice"><strong>Ada kendala saat memuat data.</strong><p>{error}</p></section>}
      <section className="stats-grid">
        <article className="stat-card balance"><span className="stat-icon balance"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18" /><path d="M16 15h2" /></svg></span><span>Saldo bersih periode</span><strong>{loading ? 'Memuat…' : money.format(balance)}</strong><small>Total pemasukan dikurangi pengeluaran</small></article>
        <article className="stat-card"><span className="stat-icon income"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg></span><span>Total pemasukan</span><strong>{loading ? 'Memuat…' : money.format(totals.income)}</strong><small>{year === 'all' ? 'Semua periode' : 'Tahun ' + year}</small></article>
        <article className="stat-card"><span className="stat-icon expense"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7l6 6 4-4 8 8" /><path d="M21 17v-7h-7" /></svg></span><span>Total pengeluaran</span><strong>{loading ? 'Memuat…' : money.format(totals.expense)}</strong><small>{year === 'all' ? 'Semua periode' : 'Tahun ' + year}</small></article>
      </section>
      <section className="panel monthly-report-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">ARSIP DAN LAPORAN</p><h2>Laporan bulanan</h2><p className="muted">Rincian transaksi bulan terpilih, lengkap dengan ringkasan dan rekap kategori.</p></div>
          <div className="report-actions">
            <input className="year-select" type="month" value={reportMonth} min="2026-07" onChange={e => setReportMonth(e.target.value)} aria-label="Pilih bulan laporan" />
            <div className="report-downloads"><button className="primary-button" type="button" onClick={downloadMonthlyPdf} disabled={loading}>Download PDF</button>{isAdmin && <button className="outline-button" type="button" onClick={downloadMonthlyExcel} disabled={loading}>Download Excel</button>}</div>
          </div>
        </div>
        <div className="report-tabs" role="tablist" aria-label="Tampilan laporan">
          <button type="button" className={reportTab === 'summary' ? 'report-tab active' : 'report-tab'} onClick={() => setReportTab('summary')}>Ringkasan</button>
          <button type="button" className={reportTab === 'details' ? 'report-tab active' : 'report-tab'} onClick={() => setReportTab('details')}>Rincian Transaksi</button>
          <button type="button" className={reportTab === 'charts' ? 'report-tab active' : 'report-tab'} onClick={() => setReportTab('charts')}>Grafik</button>
        </div>
        {reportTab === 'summary' && <div className="report-summary-grid">
          <div className="sum-opening"><span>Saldo awal</span><strong>{money.format(monthlyReport.opening)}</strong></div>
          <div className="sum-income"><span>Pemasukan</span><strong>{money.format(monthlyReport.income)}</strong></div>
          <div className="sum-expense"><span>Pengeluaran</span><strong>{money.format(monthlyReport.expense)}</strong></div>
          <div className="sum-closing"><span>Saldo akhir</span><strong>{money.format(monthlyReport.closing)}</strong></div>
          <div className="report-summary-note">Total {monthlyReport.monthTransactions.length} transaksi tercatat pada bulan ini.</div>
        </div>}
        {reportTab === 'details' && <>
          <div className="report-detail-heading"><h3>Rincian transaksi bulan ini</h3><span>{monthlyReport.monthTransactions.length} transaksi</span></div>
          {monthlyReport.monthTransactions.length === 0 ? <div className="empty-state"><p>Belum ada transaksi pada bulan yang dipilih.</p></div> :
            <div className="table-wrap tall"><table className="transactions-table">
              <thead><tr><th>No.</th><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Jenis</th><th className="amount-cell">Pemasukan</th><th className="amount-cell">Pengeluaran</th></tr></thead>
              <tbody>{monthlyReport.monthTransactions.map((t, i) => <tr key={t.id}>
                <td>{i + 1}</td>
                <td>{dateFmt.format(new Date(t.transaction_date + 'T00:00:00'))}</td>
                <td className="description-cell">{t.description || '-'}</td>
                <td><span className={'cat-chip ' + catTone(categoryMap.get(String(t.category_id)))}><i />{categoryMap.get(String(t.category_id)) || '-'}</span></td>
                <td><span className={'type-pill ' + (t.transaction_type === 'income' ? 'income' : 'expense')}>{t.transaction_type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</span></td>
                <td className="amount-cell">{t.transaction_type === 'income' ? money.format(Number(t.amount) || 0) : '-'}</td>
                <td className="amount-cell">{t.transaction_type === 'expense' ? money.format(Number(t.amount) || 0) : '-'}</td>
              </tr>)}</tbody>
            </table></div>}
        </>}
        {reportTab === 'charts' && (() => {
          const daysInMonth = new Date(monthlyReport.selectedYear, monthlyReport.selectedMonth, 0).getDate();
          const daily = Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1;
            const items = monthlyReport.monthTransactions.filter(t => Number(String(t.transaction_date).slice(8, 10)) === day);
            return { day, income: items.filter(t => t.transaction_type === 'income').reduce((sum, t) => sum + Number(t.amount || 0), 0), expense: items.filter(t => t.transaction_type === 'expense').reduce((sum, t) => sum + Number(t.amount || 0), 0) };
          });
          const maxDaily = Math.max(1, ...daily.flatMap(d => [d.income, d.expense]));
          const maxTotal = Math.max(1, monthlyReport.income, monthlyReport.expense);
          return <div className="report-charts">
            <div className="chart-card">
              <h3>Perbandingan pemasukan dan pengeluaran</h3>
              <div className="comparison-chart">
                <div><span>Pemasukan</span><div className="comparison-track"><i className="income-bar" style={{ width: (monthlyReport.income / maxTotal * 100) + '%', background: 'linear-gradient(90deg, #16a34a, #4ade80)' }} /></div><strong>{money.format(monthlyReport.income)}</strong></div>
                <div><span>Pengeluaran</span><div className="comparison-track"><i className="expense-bar" style={{ width: (monthlyReport.expense / maxTotal * 100) + '%', background: 'linear-gradient(90deg, #ea580c, #fb923c)' }} /></div><strong>{money.format(monthlyReport.expense)}</strong></div>
              </div>
            </div>
            <div className="chart-card">
              <h3>Aktivitas kas per tanggal</h3>
              <div className="chart-legend"><span><i className="legend-income" /> Pemasukan</span><span><i className="legend-expense" /> Pengeluaran</span></div>
              <div className="daily-chart">{daily.map(d => <div className="daily-chart-column" key={d.day} title={'Tanggal ' + d.day + ': pemasukan ' + money.format(d.income) + ', pengeluaran ' + money.format(d.expense)}>
                <div className="daily-bars"><i className="daily-income" style={{ height: (d.income / maxDaily * 100) + '%', background: 'linear-gradient(180deg, #4ade80, #15803d)' }} /><i className="daily-expense" style={{ height: (d.expense / maxDaily * 100) + '%', background: 'linear-gradient(180deg, #fdba74, #ea580c)' }} /></div>
                <small>{d.day % 5 === 1 || d.day === 1 ? d.day : ''}</small>
              </div>)}</div>
              <p className="chart-footnote">Grafik mengikuti transaksi pada bulan yang dipilih. Arahkan kursor ke batang untuk melihat nilai harian.</p>
            </div>
          </div>;
        })()}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">BUKU KAS</p><h2>Riwayat transaksi</h2></div>
          <select className="year-select" value={year} onChange={e => { setYear(e.target.value); setHistoryPage(1); }} aria-label="Filter tahun">
            <option value="all">Semua tahun</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {rowMessage && <p className="login-message row-message">{rowMessage}</p>}
        {loading ? <div className="empty-state"><h3>Memuat data transaksi…</h3></div> :
          visible.length === 0 ? <div className="empty-state"><div className="empty-icon">▤</div><h3>Belum ada transaksi</h3><p>Belum ditemukan catatan untuk periode yang dipilih.</p></div> :
          <div className="table-wrap"><table className="transactions-table">
            <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Jenis</th><th className="amount-cell">Jumlah</th>{isAdmin && <th className="actions-cell">Aksi</th>}</tr></thead>
            <tbody>{paginatedVisible.map(t => <tr key={t.id}>
              <td>{dateFmt.format(new Date(t.transaction_date + 'T00:00:00'))}</td>
              <td className="description-cell">{t.description || '-'}</td>
              <td><span className={'cat-chip ' + catTone(categoryMap.get(String(t.category_id)))}><i />{categoryMap.get(String(t.category_id)) || '-'}</span></td>
              <td><span className={'type-pill ' + (t.transaction_type === 'income' ? 'income' : 'expense')}>{t.transaction_type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</span></td>
              <td className={'amount-cell ' + (t.transaction_type === 'income' ? 'income' : 'expense')}>{money.format(Number(t.amount) || 0)}</td>
              {isAdmin && <td className="actions-cell"><div className="row-actions">
                <button type="button" className="action-button" onClick={() => startEditTransaction(t)}>Ubah</button>
                {deleteConfirmId === t.id
                  ? <><button type="button" className="action-button danger-confirm" disabled={deletingId === t.id} onClick={() => handleDeleteTransaction(t.id)}>{deletingId === t.id ? 'Menghapus…' : 'Ya, hapus'}</button><button type="button" className="action-button" onClick={() => setDeleteConfirmId(null)}>Batal</button></>
                  : <button type="button" className="action-button danger" onClick={() => handleDeleteTransaction(t.id)}>Hapus</button>}
              </div></td>}
            </tr>)}</tbody>
          </table></div>}
        {!loading && visible.length > 0 && <div className="history-pagination">
          <span>Menampilkan {((historyPage - 1) * historyPageSize) + 1}–{Math.min(historyPage * historyPageSize, visible.length)} dari {visible.length} transaksi</span>
          <div className="pagination-controls">
            <button type="button" className="page-button" onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1}>Sebelumnya</button>
            <strong>Halaman {historyPage} / {historyPageCount}</strong>
            <button type="button" className="page-button" onClick={() => setHistoryPage(p => Math.min(historyPageCount, p + 1))} disabled={historyPage >= historyPageCount}>Berikutnya</button>
          </div>
        </div>}
      </section>
      <footer className="site-footer">
        <LogoMark className="logo-mark" />
        <div>
          <strong>Kas Langgar Darul Falah</strong>
          <p>Langgar Waqaf Darul Falah · Ledok Kidul Dalem, Bangil<br />Dikelola dengan transparan untuk jamaah.</p>
        </div>
        <span className="foot-copy">© {new Date().getFullYear()} Langgar Waqaf Darul Falah<br />Keuangan langgar, terbuka untuk semua.</span>
      </footer>
    </main>
  );
}
