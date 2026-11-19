-- ============================================================================
-- SIM-QUR'AN & TAHFIDZ TERPADU - SMP MUHAMMADIYAH 2 SURABAYA
-- Skema Database PostgreSQL (Supabase) + Realtime + RLS
-- Jalankan seluruh script ini pada Supabase Dashboard > SQL Editor
-- ============================================================================

-- Helper trigger function untuk memperbarui kolom updated_at secara otomatis
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. TABEL DATA SISWA / SANTRI (students)
CREATE TABLE IF NOT EXISTS public.students (
  id TEXT PRIMARY KEY,
  nisn TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('L', 'P')),
  kelas TEXT NOT NULL DEFAULT '-',
  kelas_btq TEXT NOT NULL DEFAULT '-',
  pengajar TEXT NOT NULL DEFAULT '-',
  ruangan TEXT NOT NULL DEFAULT '-',
  wali_kelas TEXT NOT NULL DEFAULT '-',
  is_tahfidz BOOLEAN NOT NULL DEFAULT FALSE,
  pembimbing_tahfidz TEXT,
  halaqah_tahfidz TEXT,
  ruangan_tahfidz TEXT,
  target_juz TEXT,
  total_hafalan TEXT,
  hafalan_terakhir TEXT,
  capaian_terakhir JSONB NOT NULL DEFAULT '{"tingkat":"-","halamanAyat":"-","tanggal":"","nilai":"A"}'::jsonb,
  ujian JSONB NOT NULL DEFAULT '{"nilai":80,"predikat":"JAYYID","natijah":"-"}'::jsonb,
  kehadiran_persen INTEGER NOT NULL DEFAULT 100 CHECK (kehadiran_persen >= 0 AND kehadiran_persen <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_nisn ON public.students (nisn);
CREATE INDEX IF NOT EXISTS idx_students_nama ON public.students (LOWER(nama));
CREATE INDEX IF NOT EXISTS idx_students_kelas ON public.students (kelas);
CREATE INDEX IF NOT EXISTS idx_students_kelas_btq ON public.students (kelas_btq);

DROP TRIGGER IF EXISTS trg_students_updated_at ON public.students;
CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. TABEL GURU PENGAJAR BTQ & TAHFIDZ (teachers)
CREATE TABLE IF NOT EXISTS public.teachers (
  id TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('guru_ngaji', 'guru_tahfidz')),
  kelompok_btq TEXT NOT NULL DEFAULT '-',
  kelompok_tahfidz TEXT,
  ruangan TEXT NOT NULL DEFAULT '-',
  kontak TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teachers_role ON public.teachers (role);
CREATE INDEX IF NOT EXISTS idx_teachers_nama ON public.teachers (LOWER(nama));

DROP TRIGGER IF EXISTS trg_teachers_updated_at ON public.teachers;
CREATE TRIGGER trg_teachers_updated_at
  BEFORE UPDATE ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. TABEL CAPAIAN TILAWATI / BACAAN AL-QUR'AN (tilawati_records)
CREATE TABLE IF NOT EXISTS public.tilawati_records (
  id TEXT PRIMARY KEY,
  nisn TEXT NOT NULL REFERENCES public.students(nisn) ON DELETE CASCADE,
  tanggal TEXT NOT NULL,
  tipe TEXT NOT NULL CHECK (tipe IN ('Tilawati Remaja', 'Al-Qur''an')),
  jilid TEXT NOT NULL,
  halaman TEXT NOT NULL,
  nilai TEXT NOT NULL CHECK (nilai IN ('A', 'B', 'C')),
  catatan TEXT,
  pengajar TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tilawati_nisn_tgl ON public.tilawati_records (nisn, tanggal DESC);

DROP TRIGGER IF EXISTS trg_tilawati_updated_at ON public.tilawati_records;
CREATE TRIGGER trg_tilawati_updated_at
  BEFORE UPDATE ON public.tilawati_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. TABEL SETORAN TAHFIDZ (tahfidz_records)
CREATE TABLE IF NOT EXISTS public.tahfidz_records (
  id TEXT PRIMARY KEY,
  nisn TEXT NOT NULL REFERENCES public.students(nisn) ON DELETE CASCADE,
  tanggal TEXT NOT NULL,
  surat TEXT NOT NULL,
  ayat TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Ziyadah', 'Muraja''ah')),
  kelancaran TEXT NOT NULL,
  guru TEXT NOT NULL,
  catatan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tahfidz_nisn_tgl ON public.tahfidz_records (nisn, tanggal DESC);

DROP TRIGGER IF EXISTS trg_tahfidz_updated_at ON public.tahfidz_records;
CREATE TRIGGER trg_tahfidz_updated_at
  BEFORE UPDATE ON public.tahfidz_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. TABEL PRESENSI HARIAN BTQ & TAHFIDZ (absensi_records)
CREATE TABLE IF NOT EXISTS public.absensi_records (
  id TEXT PRIMARY KEY,
  nisn TEXT NOT NULL REFERENCES public.students(nisn) ON DELETE CASCADE,
  tanggal TEXT NOT NULL,
  sesi TEXT NOT NULL CHECK (sesi IN ('btq', 'tahfidz')),
  status TEXT NOT NULL CHECK (status IN ('Hadir', 'Izin', 'Sakit', 'Alpa')),
  keterangan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nisn, tanggal, sesi)
);

CREATE INDEX IF NOT EXISTS idx_absensi_nisn_tgl ON public.absensi_records (nisn, tanggal DESC);

DROP TRIGGER IF EXISTS trg_absensi_updated_at ON public.absensi_records;
CREATE TRIGGER trg_absensi_updated_at
  BEFORE UPDATE ON public.absensi_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. TABEL RIWAYAT NILAI UJIAN / KENAIKAN JILID & MUNAQOSYAH (ujian_records)
CREATE TABLE IF NOT EXISTS public.ujian_records (
  id TEXT PRIMARY KEY,
  nisn TEXT NOT NULL REFERENCES public.students(nisn) ON DELETE CASCADE,
  tanggal TEXT NOT NULL,
  jenis TEXT NOT NULL,
  nilai NUMERIC(5,2) NOT NULL CHECK (nilai >= 0 AND nilai <= 100),
  predikat TEXT NOT NULL,
  natijah TEXT NOT NULL,
  kelulusan TEXT,
  keterangan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ujian_nisn_tgl ON public.ujian_records (nisn, tanggal DESC);

DROP TRIGGER IF EXISTS trg_ujian_updated_at ON public.ujian_records;
CREATE TRIGGER trg_ujian_updated_at
  BEFORE UPDATE ON public.ujian_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. TABEL AKUN PETUGAS TERPUSAT (staff_accounts)
CREATE TABLE IF NOT EXISTS public.staff_accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'guru_ngaji', 'guru_tahfidz', 'wali_kelas')),
  nama TEXT NOT NULL,
  teacher_id TEXT,
  assigned_group TEXT,
  assigned_tahfidz_group TEXT,
  assigned_class TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default_password BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until BIGINT,
  last_login TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_staff_accounts_username ON public.staff_accounts (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_staff_accounts_role ON public.staff_accounts (role);

-- 8. TABEL LOG AKTIVITAS AUTENTIKASI (auth_logs)
CREATE TABLE IF NOT EXISTS public.auth_logs (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  username TEXT NOT NULL,
  nama TEXT,
  role TEXT,
  event TEXT NOT NULL,
  detail TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_logs_timestamp ON public.auth_logs (timestamp DESC);

-- 9. TABEL PENGATURAN & STATUS CETAK RAPOR (rapor_settings, rapor_print_statuses, rapor_print_logs)
CREATE TABLE IF NOT EXISTS public.rapor_settings (
  id TEXT PRIMARY KEY DEFAULT 'main',
  tahun_ajaran TEXT NOT NULL DEFAULT '2026/2027',
  semester TEXT NOT NULL DEFAULT 'Ganjil',
  tanggal_rapor TEXT NOT NULL DEFAULT '',
  kepala_sekolah TEXT NOT NULL DEFAULT '',
  nbm_kepala TEXT NOT NULL DEFAULT '',
  koordinator TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rapor_print_statuses (
  nisn TEXT PRIMARY KEY REFERENCES public.students(nisn) ON DELETE CASCADE,
  print_count INTEGER NOT NULL DEFAULT 0,
  last_printed_at TEXT NOT NULL,
  last_printed_by TEXT NOT NULL,
  semester TEXT NOT NULL,
  tahun_ajaran TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.rapor_print_logs (
  id TEXT PRIMARY KEY,
  printed_at TEXT NOT NULL,
  printed_by TEXT NOT NULL,
  kelas_label TEXT NOT NULL,
  jenis_cetak TEXT NOT NULL,
  total_rapor INTEGER NOT NULL DEFAULT 0,
  semester TEXT NOT NULL,
  tahun_ajaran TEXT NOT NULL,
  nisn_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- KEBIJAKAN RLS (ROW LEVEL SECURITY)
-- Karena login petugas dikelola di tabel staff_accounts & Portal Wali Murid
-- dapat diakses publik berdasarkan pencarian NISN/nama melalui anon key,
-- aktifkan RLS dengan kebijakan akses yang mengizinkan klien aplikasi.
-- Untuk keamanan produksi lanjutan, Anda dapat memindahkan autentikasi ke Supabase Auth.
-- ============================================================================
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tilawati_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absensi_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ujian_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapor_print_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapor_print_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students',
    'teachers',
    'tilawati_records',
    'tahfidz_records',
    'absensi_records',
    'ujian_records',
    'staff_accounts',
    'auth_logs',
    'rapor_settings',
    'rapor_print_statuses',
    'rapor_print_logs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_all_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "allow_all_%s" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ============================================================================
-- AKTIFKAN SUPABASE REALTIME PUBLICATION
-- ============================================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students',
    'teachers',
    'tilawati_records',
    'tahfidz_records',
    'absensi_records',
    'ujian_records',
    'staff_accounts',
    'auth_logs',
    'rapor_settings',
    'rapor_print_statuses',
    'rapor_print_logs'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
