import React, { useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from './lib/supabase';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function App() {
  const [connection, setConnection] = useState('Memeriksa konfigurasi…');
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      setConnection('Menunggu konfigurasi Supabase di Vercel');
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      setSession(data?.session ?? null);
      setConnection(error ? 'Gagal menghubungi Supabase' : 'Terhubung ke Supabase');
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand-mark">DF</div>
        <div><p className="eyebrow">LAPORAN KEUANGAN LANGGAR</p><h1>Waqaf Darul Falah</h1><p className="muted">Ledok Kidul Dalem · Bangil</p></div>
        <span className="status-pill">{connection}</span>
      </header>
      <section className="intro"><div><p className="eyebrow">DASHBOARD KAS</p><h2>Ringkasan keuangan</h2><p className="muted">Transparan, rapi, dan bisa dipantau bersama.</p></div><button className="outline-button" onClick={() => window.location.hash = '#admin'}>Masuk Admin</button></section>
      {!supabaseConfigured && <section className="notice"><strong>Konfigurasi belum lengkap.</strong><p>Tambahkan VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY pada Environment Variables di Vercel.</p></section>}
      <section className="stats-grid">
        <article className="stat-card balance"><span>Saldo saat ini</span><strong>Menunggu data transaksi</strong><small>Saldo dihitung dari seluruh riwayat transaksi</small></article>
        <article className="stat-card"><span>Total pemasukan</span><strong>—</strong><small>Semua periode</small></article>
        <article className="stat-card"><span>Total pengeluaran</span><strong>—</strong><small>Semua periode</small></article>
      </section>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">BUKU KAS</p><h2>Riwayat transaksi</h2></div><span className="muted">Semua tahun</span></div><div className="empty-state"><div className="empty-icon">▤</div><h3>Data transaksi akan ditampilkan di sini</h3><p>Dashboard akan membaca riwayat yang sudah diimpor ke Supabase setelah struktur kolom database dicocokkan.</p></div></section>
      <footer>© {new Date().getFullYear()} Langgar Waqaf Darul Falah · Bangil</footer>
    </main>
  );
}
