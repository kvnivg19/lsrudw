# Lansia SMART RSUD Wonosari

Aplikasi konfirmasi kehadiran lansia berbasis Next.js, Supabase, dan Vercel.

## Fitur

- Halaman publik sangat sederhana untuk lansia.
- Wajib memasukkan nama lengkap.
- Setelah nama lengkap cocok, nama + alamat ditampilkan.
- Klik "Hadir" → konfirmasi → kehadiran tercatat.
- Tidak ada daftar peserta yang sudah hadir di halaman publik.
- Satu peserta hanya dapat hadir satu kali untuk satu kegiatan.
- Kegiatan punya tanggal, lokasi, waktu mulai, dan waktu tutup.
- Setelah waktu tutup, halaman publik otomatis terkunci.
- Dashboard admin dengan statistik.
- Kelola kegiatan dan menentukan kegiatan aktif.
- Tambah, edit, dan nonaktifkan peserta.
- Export daftar hadir ke Word (.docx) dan PDF.
- Mode demo lokal otomatis aktif sebelum Supabase disambungkan.

## Menjalankan di VS Code

```bash
npm install
npm run dev
```

Buka:

- http://localhost:3000
- http://localhost:3000/admin

## Menghubungkan Supabase

1. Buat project Supabase.
2. Buka SQL Editor.
3. Jalankan `supabase/schema.sql`.
4. Opsional: jalankan `supabase/seed-example.sql` untuk data contoh.
5. Buat user admin di Supabase Authentication → Users.
6. Ambil User UID dari user admin.
7. Jalankan:

```sql
insert into public.admin_users (user_id)
values ('UUID_USER_ADMIN');
```

8. Salin `.env.example` menjadi `.env.local`.
9. Isi:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

10. Restart `npm run dev`.

## Catatan keamanan

Halaman publik tidak membaca alamat semua peserta. Browser hanya meminta alamat setelah nama lengkap yang dimasukkan cocok dengan satu peserta aktif.

Pembatasan waktu juga ditegakkan di kebijakan database pada `attendance`, bukan hanya oleh countdown di browser.

Jangan pernah memasukkan Supabase service role key ke `.env` dengan awalan `NEXT_PUBLIC_` atau ke kode frontend.

## Deploy Vercel

Push project ke GitHub, import repository ke Vercel, lalu tambahkan environment variables yang sama di Project Settings → Environment Variables.

## Cara paling mudah di Windows

1. Extract ZIP ini.
2. Klik `INSTALL.bat`.
3. Setelah selesai, klik `START.bat`.
4. Buka http://localhost:3000
5. Dashboard admin: http://localhost:3000/admin

Untuk mode lokal tanpa Supabase, project otomatis memakai data demo di browser. Untuk produksi, isi `.env.local` dan jalankan `supabase/schema.sql`.
