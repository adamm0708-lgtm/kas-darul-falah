import React, { useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from './lib/supabase';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });

export default function App() {
  const [connection, setConnection] = useState('Memeriksa konfigurasi…');
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [year, setYear] = useState('all');
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');

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

  async function handleLogout() {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setAdminEmail('');
    setLoginMessage('Anda sudah logout.');
  }

  const categoryMap = useMemo(() => new Map(categories.map(c => [String(c.id), c.name ?? c.category_name ?? c.title ?? 'Kategori'])), [categories]);
  const years = useMemo(() => [...new Set(transactions.map(t => String(t.transaction_date).slice(0, 4)))].sort().reverse(), [transactions]);
  const visible = useMemo(() => transactions.filter(t => year === 'all' || String(t.transaction_date).startsWith(year)), [transactions, year]);
  const totals = useMemo(() => visible.reduce((a, t) => {
    const amount = Number(t.amount) || 0;
    if (t.transaction_type === 'income') a.income += amount;
    if (t.transaction_type === 'expense') a.expense += amount;
    return a;
  }, { income: 0, expense: 0 }), [visible]);
  const balance = totals.income - totals.expense;

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand-mark">DF</div>
        <div><p className="eyebrow">LAPORAN KEUANGAN LANGGAR</p><h1>Waqaf Darul Falah</h1><p className="muted">Ledok Kidul Dalem · Bangil</p></div>
        <span className="status-pill">{connection}</span>
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
      {isAdmin && <section className="admin-welcome"><strong>Mode Admin aktif</strong><span>{adminEmail}</span><p>Login berhasil. Fitur pengelolaan transaksi akan ditambahkan pada tahap berikutnya.</p></section>}
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
        <article className="stat-card balance"><span>Saldo bersih periode</span><strong>{loading ? 'Memuat…' : money.format(balance)}</strong><small>Total pemasukan dikurangi pengeluaran</small></article>
        <article className="stat-card"><span>Total pemasukan</span><strong>{loading ? 'Memuat…' : money.format(totals.income)}</strong><small>{year === 'all' ? 'Semua periode' : 'Tahun ' + year}</small></article>
        <article className="stat-card"><span>Total pengeluaran</span><strong>{loading ? 'Memuat…' : money.format(totals.expense)}</strong><small>{year === 'all' ? 'Semua periode' : 'Tahun ' + year}</small></article>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">BUKU KAS</p><h2>Riwayat transaksi</h2></div>
          <select className="year-select" value={year} onChange={e => setYear(e.target.value)} aria-label="Filter tahun">
            <option value="all">Semua tahun</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {loading ? <div className="empty-state"><h3>Memuat data transaksi…</h3></div> :
          visible.length === 0 ? <div className="empty-state"><div className="empty-icon">▤</div><h3>Belum ada transaksi</h3><p>Belum ditemukan catatan untuk periode yang dipilih.</p></div> :
          <div className="table-wrap"><table className="transactions-table">
            <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Jenis</th><th className="amount-cell">Jumlah</th></tr></thead>
            <tbody>{visible.map(t => <tr key={t.id}>
              <td>{dateFmt.format(new Date(t.transaction_date + 'T00:00:00'))}</td>
              <td className="description-cell">{t.description || '-'}</td>
              <td>{categoryMap.get(String(t.category_id)) || '-'}</td>
              <td><span className={'type-pill ' + (t.transaction_type === 'income' ? 'income' : 'expense')}>{t.transaction_type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</span></td>
              <td className="amount-cell">{money.format(Number(t.amount) || 0)}</td>
            </tr>)}</tbody>
          </table></div>}
      </section>
      <footer>© {new Date().getFullYear()} Langgar Waqaf Darul Falah · Bangil</footer>
    </main>
  );
}
