-- Contoh data. Jalankan SETELAH schema.sql jika ingin mencoba.

insert into public.events (name, event_date, location, open_at, close_at, is_active)
values (
  'Pertemuan Lansia September 2026',
  '2026-09-25',
  'RSUD Wonosari',
  '2026-09-25 06:00:00+07',
  '2026-09-25 08:00:00+07',
  true
)
on conflict do nothing;

insert into public.participants (full_name, address)
values
  ('Aulia Barokah', 'Getas, Playen, Gunungkidul'),
  ('Budi Santoso', 'Getas, Playen, Gunungkidul'),
  ('Dewi Lestari', 'Getas, Playen, Gunungkidul'),
  ('Jumilah', 'Getas, Playen, Gunungkidul'),
  ('Karsini', 'Getas, Playen, Gunungkidul'),
  ('Maryati', 'Getas, Playen, Gunungkidul'),
  ('Mulyono', 'Getas, Playen, Gunungkidul'),
  ('Nanik Sulastri', 'Getas, Playen, Gunungkidul'),
  ('Paini', 'Getas, Playen, Gunungkidul'),
  ('Siti Aminah', 'Getas, Playen, Gunungkidul'),
  ('Siti Rahayu', 'Getas, Playen, Gunungkidul'),
  ('Sri Wahyuni', 'Getas, Playen, Gunungkidul')
on conflict do nothing;
