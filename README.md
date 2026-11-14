# Kas Langgar Darul Falah

Aplikasi dashboard kas publik dan panel admin untuk Langgar Waqaf Darul Falah, Ledok Kidul Dalem, Bangil.

## Menjalankan lokal

1. `npm install`
2. Salin `.env.example` menjadi `.env` dan isi kredensial Supabase.
3. `npm run dev`

## Environment Variables

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Jangan pernah memasukkan Supabase `service_role` key ke frontend.

## Status

Fondasi React + Vite dan koneksi Supabase sudah disiapkan. Pemetaan kolom transaksi dan panel admin dilanjutkan setelah struktur tabel aktual diverifikasi.
