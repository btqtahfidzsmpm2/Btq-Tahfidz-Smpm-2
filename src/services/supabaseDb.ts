import { supabase, isSupabaseConfigured } from './supabase';
import {
  AbsensiRecord,
  AuthLogEntry,
  BacaanRecord,
  PublicStudentReport,
  RaporPrintBatchLog,
  RaporPrintStatus,
  RaporSettings,
  Role,
  Student,
  TahfidzRecord,
  Teacher,
  UserAccount
} from '../types';

function requireClient() {
  if (!supabase || !isSupabaseConfigured) {
    throw new Error('Supabase belum dikonfigurasi pada Environment Variables (VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY).');
  }
  return supabase;
}

// ============================================================================
// ROW MAPPERS (PostgreSQL snake_case <-> TypeScript camelCase)
// ============================================================================

function mapStudentRow(r: Record<string, unknown>): Student {
  const capaian = (r.capaian_terakhir as Record<string, unknown>) || {};
  const ujian = (r.ujian as Record<string, unknown>) || {};

  return {
    id: String(r.id || r.nisn || ''),
    nisn: String(r.nisn || ''),
    nama: String(r.nama || ''),
    gender: r.gender === 'L' ? 'L' : 'P',
    kelas: String(r.kelas || '-'),
    kelasBTQ: String(r.kelas_btq || '-'),
    pengajar: String(r.pengajar || '-'),
    ruangan: String(r.ruangan || '-'),
    waliKelas: String(r.wali_kelas || '-'),
    isTahfidz: Boolean(r.is_tahfidz),
    pembimbingTahfidz: r.pembimbing_tahfidz ? String(r.pembimbing_tahfidz) : undefined,
    halaqahTahfidz: r.halaqah_tahfidz ? String(r.halaqah_tahfidz) : undefined,
    ruanganTahfidz: r.ruangan_tahfidz ? String(r.ruangan_tahfidz) : undefined,
    targetJuz: r.target_juz ? String(r.target_juz) : undefined,
    totalHafalan: r.total_hafalan ? String(r.total_hafalan) : undefined,
    hafalanTerakhir: r.hafalan_terakhir ? String(r.hafalan_terakhir) : undefined,
    capaianTerakhir: {
      tingkat: String(capaian.tingkat || '-'),
      halamanAyat: String(capaian.halamanAyat || '-'),
      tanggal: String(capaian.tanggal || new Date().toISOString().slice(0, 10)),
      nilai: (['A', 'B', 'C'].includes(String(capaian.nilai)) ? capaian.nilai : 'A') as 'A' | 'B' | 'C'
    },
    ujian: {
      tanggal: ujian.tanggal ? String(ujian.tanggal) : undefined,
      jenis: ujian.jenis ? String(ujian.jenis) : undefined,
      nilai: Number(ujian.nilai ?? 80),
      predikat: (['MUMTAZ', 'JAYYID', 'MAQBUL', 'ROSHIB', 'A', 'B', 'C', 'D'].includes(
        String(ujian.predikat)
      )
        ? ujian.predikat
        : 'JAYYID') as Student['ujian']['predikat'],
      natijah: String(ujian.natijah || '-'),
      kelulusan: ujian.kelulusan ? String(ujian.kelulusan) : undefined,
      keterangan: ujian.keterangan ? String(ujian.keterangan) : undefined
    },
    kehadiranPersen: typeof r.kehadiran_persen === 'number' ? r.kehadiran_persen : 100
  };
}

function toStudentRow(s: Student): Record<string, unknown> {
  return {
    id: s.id || `std-${s.nisn}`,
    nisn: s.nisn,
    nama: s.nama,
    gender: s.gender === 'L' ? 'L' : 'P',
    kelas: s.kelas || '-',
    kelas_btq: s.kelasBTQ || '-',
    pengajar: s.pengajar || '-',
    ruangan: s.ruangan || '-',
    wali_kelas: s.waliKelas || '-',
    is_tahfidz: Boolean(s.isTahfidz),
    pembimbing_tahfidz: s.pembimbingTahfidz ?? null,
    halaqah_tahfidz: s.halaqahTahfidz ?? null,
    ruangan_tahfidz: s.ruanganTahfidz ?? null,
    target_juz: s.targetJuz ?? null,
    total_hafalan: s.totalHafalan ?? null,
    hafalan_terakhir: s.hafalanTerakhir ?? null,
    capaian_terakhir: s.capaianTerakhir,
    ujian: s.ujian,
    kehadiran_persen: typeof s.kehadiranPersen === 'number' ? Math.round(s.kehadiranPersen) : 100
  };
}

function mapTeacherRow(r: Record<string, unknown>): Teacher {
  return {
    id: String(r.id || ''),
    nama: String(r.nama || ''),
    role: r.role === 'guru_tahfidz' ? 'guru_tahfidz' : 'guru_ngaji',
    kelompokBTQ: String(r.kelompok_btq || '-'),
    kelompokTahfidz: r.kelompok_tahfidz ? String(r.kelompok_tahfidz) : undefined,
    ruangan: String(r.ruangan || '-'),
    kontak: r.kontak ? String(r.kontak) : undefined,
    email: r.email ? String(r.email) : undefined
  };
}

function toTeacherRow(t: Teacher): Record<string, unknown> {
  return {
    id: t.id,
    nama: t.nama,
    role: t.role,
    kelompok_btq: t.kelompokBTQ || '-',
    kelompok_tahfidz: t.kelompokTahfidz ?? null,
    ruangan: t.ruangan || '-',
    kontak: t.kontak ?? null,
    email: t.email ?? null
  };
}

function mapBacaanRow(r: Record<string, unknown>): BacaanRecord {
  return {
    id: String(r.id || ''),
    nisn: String(r.nisn || ''),
    tanggal: String(r.tanggal || ''),
    tipe: (r.tipe === "Al-Qur'an" ? "Al-Qur'an" : 'Tilawati Remaja') as BacaanRecord['tipe'],
    jilid: String(r.jilid || ''),
    halaman: String(r.halaman || ''),
    nilai: (['A', 'B', 'C'].includes(String(r.nilai)) ? r.nilai : 'A') as 'A' | 'B' | 'C',
    catatan: r.catatan ? String(r.catatan) : undefined,
    pengajar: String(r.pengajar || '')
  };
}

function toBacaanRow(b: BacaanRecord): Record<string, unknown> {
  return {
    id: b.id,
    nisn: b.nisn,
    tanggal: b.tanggal,
    tipe: b.tipe,
    jilid: b.jilid,
    halaman: b.halaman,
    nilai: b.nilai,
    catatan: b.catatan ?? null,
    pengajar: b.pengajar
  };
}

function mapTahfidzRow(r: Record<string, unknown>): TahfidzRecord {
  return {
    id: String(r.id || ''),
    nisn: String(r.nisn || ''),
    tanggal: String(r.tanggal || ''),
    surat: String(r.surat || ''),
    ayat: String(r.ayat || ''),
    status: (r.status === "Muraja'ah" ? "Muraja'ah" : 'Ziyadah') as TahfidzRecord['status'],
    kelancaran: String(r.kelancaran || 'Sangat Lancar (Mumtaz)') as TahfidzRecord['kelancaran'],
    guru: String(r.guru || ''),
    catatan: r.catatan ? String(r.catatan) : undefined
  };
}

function toTahfidzRow(t: TahfidzRecord): Record<string, unknown> {
  return {
    id: t.id,
    nisn: t.nisn,
    tanggal: t.tanggal,
    surat: t.surat,
    ayat: t.ayat,
    status: t.status,
    kelancaran: t.kelancaran,
    guru: t.guru,
    catatan: t.catatan ?? null
  };
}

function mapAbsensiRow(r: Record<string, unknown>): AbsensiRecord {
  return {
    id: String(r.id || ''),
    nisn: String(r.nisn || ''),
    tanggal: String(r.tanggal || ''),
    sesi: r.sesi === 'tahfidz' ? 'tahfidz' : 'btq',
    status: (['Hadir', 'Izin', 'Sakit', 'Alpa'].includes(String(r.status))
      ? r.status
      : 'Hadir') as AbsensiRecord['status'],
    keterangan: r.keterangan ? String(r.keterangan) : undefined
  };
}

function toAbsensiRow(a: AbsensiRecord): Record<string, unknown> {
  return {
    id: a.id,
    nisn: a.nisn,
    tanggal: a.tanggal,
    sesi: a.sesi,
    status: a.status,
    keterangan: a.keterangan ?? null
  };
}

function mapAccountRow(r: Record<string, unknown>): UserAccount {
  return {
    id: String(r.id || ''),
    username: String(r.username || ''),
    passwordHash: String(r.password_hash || ''),
    salt: String(r.salt || ''),
    role: (r.role as Role) || 'guru_ngaji',
    nama: String(r.nama || ''),
    teacherId: r.teacher_id ? String(r.teacher_id) : undefined,
    assignedGroup: r.assigned_group ? String(r.assigned_group) : undefined,
    assignedTahfidzGroup: r.assigned_tahfidz_group ? String(r.assigned_tahfidz_group) : undefined,
    assignedClass: r.assigned_class ? String(r.assigned_class) : undefined,
    isActive: r.is_active !== false,
    isDefaultPassword: Boolean(r.is_default_password),
    failedAttempts: Number(r.failed_attempts ?? 0),
    lockedUntil: typeof r.locked_until === 'number' ? r.locked_until : undefined,
    lastLogin: r.last_login ? String(r.last_login) : undefined,
    createdAt: String(r.created_at || new Date().toISOString()),
    updatedAt: String(r.updated_at || new Date().toISOString())
  };
}

function toAccountRow(a: UserAccount): Record<string, unknown> {
  return {
    id: a.id,
    username: a.username,
    password_hash: a.passwordHash,
    salt: a.salt,
    role: a.role,
    nama: a.nama,
    teacher_id: a.teacherId ?? null,
    assigned_group: a.assignedGroup ?? null,
    assigned_tahfidz_group: a.assignedTahfidzGroup ?? null,
    assigned_class: a.assignedClass ?? null,
    is_active: a.isActive,
    is_default_password: a.isDefaultPassword,
    failed_attempts: a.failedAttempts ?? 0,
    locked_until: a.lockedUntil ?? null,
    last_login: a.lastLogin ?? null,
    created_at: a.createdAt,
    updated_at: a.updatedAt
  };
}

function mapAuthLogRow(r: Record<string, unknown>): AuthLogEntry {
  return {
    id: String(r.id || ''),
    timestamp: String(r.timestamp || ''),
    username: String(r.username || ''),
    nama: r.nama ? String(r.nama) : undefined,
    role: r.role ? (r.role as Role) : undefined,
    event: (r.event || 'LOGIN_SUCCESS') as AuthLogEntry['event'],
    detail: String(r.detail || '')
  };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export interface SupabaseCloudSnapshot {
  students: Student[];
  teachers: Teacher[];
  bacaan: BacaanRecord[];
  tahfidz: TahfidzRecord[];
  absensi: AbsensiRecord[];
  accounts: UserAccount[];
  authLogs: AuthLogEntry[];
  raporSettings?: RaporSettings;
  raporStatuses: Record<string, RaporPrintStatus>;
  raporLogs: RaporPrintBatchLog[];
}

export const supabaseDb = {
  isConfigured(): boolean {
    return isSupabaseConfigured && Boolean(supabase);
  },

  async checkHealth(): Promise<boolean> {
    if (!supabase || !isSupabaseConfigured) return false;
    const { error } = await supabase.from('students').select('nisn').limit(1);
    return !error;
  },

  /**
   * Loads full centralized state from Supabase PostgreSQL.
   */
  async fetchAllCloudSnapshot(): Promise<SupabaseCloudSnapshot> {
    const client = requireClient();

    const [
      studentsRes,
      teachersRes,
      bacaanRes,
      tahfidzRes,
      absensiRes,
      accountsRes,
      logsRes,
      raporSetRes,
      raporStatRes,
      raporLogRes
    ] = await Promise.all([
      client.from('students').select('*').order('nama', { ascending: true }),
      client.from('teachers').select('*').order('nama', { ascending: true }),
      client.from('tilawati_records').select('*').order('tanggal', { ascending: false }),
      client.from('tahfidz_records').select('*').order('tanggal', { ascending: false }),
      client.from('absensi_records').select('*').order('tanggal', { ascending: false }),
      client.from('staff_accounts').select('*'),
      client.from('auth_logs').select('*').order('timestamp', { ascending: false }).limit(60),
      client.from('rapor_settings').select('*').eq('id', 'main').maybeSingle(),
      client.from('rapor_print_statuses').select('*'),
      client.from('rapor_print_logs').select('*').order('printed_at', { ascending: false })
    ]);

    if (studentsRes.error) throw new Error(studentsRes.error.message);
    if (teachersRes.error) throw new Error(teachersRes.error.message);
    if (bacaanRes.error) throw new Error(bacaanRes.error.message);
    if (tahfidzRes.error) throw new Error(tahfidzRes.error.message);
    if (absensiRes.error) throw new Error(absensiRes.error.message);

    const raporStatuses: Record<string, RaporPrintStatus> = {};
    (raporStatRes.data || []).forEach(r => {
      const nisn = String(r.nisn || '');
      if (nisn) {
        raporStatuses[nisn] = {
          nisn,
          printCount: Number(r.print_count || 0),
          lastPrintedAt: String(r.last_printed_at || ''),
          lastPrintedBy: String(r.last_printed_by || ''),
          semester: String(r.semester || ''),
          tahunAjaran: String(r.tahun_ajaran || '')
        };
      }
    });

    const raporLogs: RaporPrintBatchLog[] = (raporLogRes.data || []).map(r => ({
      id: String(r.id || ''),
      printedAt: String(r.printed_at || ''),
      printedBy: String(r.printed_by || ''),
      kelasLabel: String(r.kelas_label || ''),
      jenisCetak: (r.jenis_cetak || 'Rapor Siswa (Massal)') as RaporPrintBatchLog['jenisCetak'],
      totalRapor: Number(r.total_rapor || 0),
      semester: String(r.semester || ''),
      tahunAjaran: String(r.tahun_ajaran || ''),
      nisnList: Array.isArray(r.nisn_list) ? (r.nisn_list as string[]) : []
    }));

    const raporSettings: RaporSettings | undefined = raporSetRes.data
      ? {
          tahunAjaran: String(raporSetRes.data.tahun_ajaran || '2026/2027'),
          semester: String(raporSetRes.data.semester || 'Ganjil'),
          tanggalRapor: String(raporSetRes.data.tanggal_rapor || ''),
          kepalaSekolah: String(raporSetRes.data.kepala_sekolah || ''),
          nbmKepala: String(raporSetRes.data.nbm_kepala || ''),
          koordinator: String(raporSetRes.data.koordinator || '')
        }
      : undefined;

    return {
      students: (studentsRes.data || []).map(mapStudentRow),
      teachers: (teachersRes.data || []).map(mapTeacherRow),
      bacaan: (bacaanRes.data || []).map(mapBacaanRow),
      tahfidz: (tahfidzRes.data || []).map(mapTahfidzRow),
      absensi: (absensiRes.data || []).map(mapAbsensiRow),
      accounts: (accountsRes.data || []).map(mapAccountRow),
      authLogs: (logsRes.data || []).map(mapAuthLogRow),
      raporSettings,
      raporStatuses,
      raporLogs
    };
  },

  /**
   * Subscribes to live Supabase Realtime changes across all centralized tables.
   */
  subscribeRealtime(onChange: () => void): () => void {
    if (!supabase || !isSupabaseConfigured) return () => {};

    const tables = [
      'students',
      'teachers',
      'tilawati_records',
      'tahfidz_records',
      'absensi_records',
      'ujian_records',
      'staff_accounts',
      'rapor_settings',
      'rapor_print_statuses',
      'rapor_print_logs'
    ];

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onChange();
      }, 250);
    };

    const channel = supabase.channel('simquran-cloud-sync');
    tables.forEach(table => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => trigger()
      );
    });
    channel.subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      void supabase?.removeChannel(channel);
    };
  },

  /**
   * Public Portal lookup by NISN or Student Name directly in Supabase.
   */
  async searchPublicStudents(rawQuery: string): Promise<PublicStudentReport[]> {
    const client = requireClient();
    const cleaned = rawQuery.trim();
    if (!cleaned) return [];

    // Try exact NISN first, or case-insensitive partial match on NISN or Nama
    const safePattern = cleaned.replace(/[%_]/g, '');
    const { data: matchedStudents, error } = await client
      .from('students')
      .select('*')
      .or(`nisn.eq.${safePattern},nisn.ilike.%${safePattern}%,nama.ilike.%${safePattern}%`)
      .limit(12);

    if (error) throw new Error(error.message);
    if (!matchedStudents || matchedStudents.length === 0) return [];

    const students = matchedStudents.map(mapStudentRow);
    const nisnList = students.map(s => s.nisn);

    const [bacaanRes, tahfidzRes, absensiRes] = await Promise.all([
      client
        .from('tilawati_records')
        .select('*')
        .in('nisn', nisnList)
        .order('tanggal', { ascending: false }),
      client
        .from('tahfidz_records')
        .select('*')
        .in('nisn', nisnList)
        .order('tanggal', { ascending: false }),
      client
        .from('absensi_records')
        .select('*')
        .in('nisn', nisnList)
        .order('tanggal', { ascending: false })
    ]);

    const bacaanAll = (bacaanRes.data || []).map(mapBacaanRow);
    const tahfidzAll = (tahfidzRes.data || []).map(mapTahfidzRow);
    const absensiAll = (absensiRes.data || []).map(mapAbsensiRow);

    return students.map(student => {
      const sAbs = absensiAll.filter(a => a.nisn === student.nisn);
      const hadir = sAbs.filter(a => a.status === 'Hadir').length;
      const sakit = sAbs.filter(a => a.status === 'Sakit').length;
      const izin = sAbs.filter(a => a.status === 'Izin').length;
      const alpa = sAbs.filter(a => a.status === 'Alpa').length;
      const persen =
        sAbs.length > 0 ? Math.round((hadir / sAbs.length) * 100) : student.kehadiranPersen ?? 100;

      return {
        student,
        recentBacaan: bacaanAll.filter(b => b.nisn === student.nisn).slice(0, 20),
        recentTahfidz: tahfidzAll.filter(t => t.nisn === student.nisn).slice(0, 20),
        absensiSummary: { hadir, sakit, izin, alpa, persen }
      };
    });
  },

  async getPublicReportByNisn(nisn: string): Promise<PublicStudentReport | null> {
    const client = requireClient();
    const { data, error } = await client
      .from('students')
      .select('*')
      .eq('nisn', nisn.trim())
      .maybeSingle();

    if (error || !data) return null;
    const student = mapStudentRow(data);

    const [bRes, tRes, aRes] = await Promise.all([
      client
        .from('tilawati_records')
        .select('*')
        .eq('nisn', student.nisn)
        .order('tanggal', { ascending: false })
        .limit(20),
      client
        .from('tahfidz_records')
        .select('*')
        .eq('nisn', student.nisn)
        .order('tanggal', { ascending: false })
        .limit(20),
      client
        .from('absensi_records')
        .select('*')
        .eq('nisn', student.nisn)
        .order('tanggal', { ascending: false })
    ]);

    const sAbs = (aRes.data || []).map(mapAbsensiRow);
    const hadir = sAbs.filter(a => a.status === 'Hadir').length;
    const sakit = sAbs.filter(a => a.status === 'Sakit').length;
    const izin = sAbs.filter(a => a.status === 'Izin').length;
    const alpa = sAbs.filter(a => a.status === 'Alpa').length;
    const persen =
      sAbs.length > 0 ? Math.round((hadir / sAbs.length) * 100) : student.kehadiranPersen ?? 100;

    return {
      student,
      recentBacaan: (bRes.data || []).map(mapBacaanRow),
      recentTahfidz: (tRes.data || []).map(mapTahfidzRow),
      absensiSummary: { hadir, sakit, izin, alpa, persen }
    };
  },

  // ==========================================================================
  // CRUD MUTATIONS
  // ==========================================================================

  async upsertStudent(student: Student): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('students')
      .upsert(toStudentRow(student), { onConflict: 'nisn' });
    if (error) throw new Error(error.message);
  },

  async deleteStudent(nisn: string): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('students').delete().eq('nisn', nisn);
    if (error) throw new Error(error.message);
  },

  async upsertTeacher(teacher: Teacher): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('teachers')
      .upsert(toTeacherRow(teacher), { onConflict: 'id' });
    if (error) throw new Error(error.message);
  },

  async deleteTeacher(teacherId: string): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('teachers').delete().eq('id', teacherId);
    if (error) throw new Error(error.message);
  },

  async saveBacaan(record: BacaanRecord, updatedStudent?: Student): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('tilawati_records')
      .upsert(toBacaanRow(record), { onConflict: 'id' });
    if (error) throw new Error(error.message);

    if (updatedStudent) {
      await this.upsertStudent(updatedStudent);
    }
  },

  async saveTahfidz(record: TahfidzRecord, updatedStudent?: Student): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('tahfidz_records')
      .upsert(toTahfidzRow(record), { onConflict: 'id' });
    if (error) throw new Error(error.message);

    if (updatedStudent) {
      await this.upsertStudent(updatedStudent);
    }
  },

  async saveUjian(student: Student): Promise<void> {
    const client = requireClient();
    await this.upsertStudent(student);

    if (student.ujian) {
      const tanggal = student.ujian.tanggal || new Date().toISOString().slice(0, 10);
      const jenis = student.ujian.jenis || 'Munaqosyah / Kenaikan Jilid';
      const examId = `ujn-${student.nisn}-${tanggal}`;
      const { error } = await client.from('ujian_records').upsert(
        {
          id: examId,
          nisn: student.nisn,
          tanggal,
          jenis,
          nilai: Number(student.ujian.nilai ?? 80),
          predikat: String(student.ujian.predikat || 'JAYYID'),
          natijah: String(student.ujian.natijah || '-'),
          kelulusan: student.ujian.kelulusan ?? null,
          keterangan: student.ujian.keterangan ?? null
        },
        { onConflict: 'id' }
      );
      if (error) throw new Error(error.message);
    }
  },

  async saveAbsensiBatch(
    records: AbsensiRecord[],
    updatedStudents: Student[]
  ): Promise<void> {
    const client = requireClient();

    for (const chunk of chunkArray(records, 250)) {
      const { error } = await client
        .from('absensi_records')
        .upsert(chunk.map(toAbsensiRow), { onConflict: 'nisn,tanggal,sesi' });
      if (error) throw new Error(error.message);
    }

    for (const chunk of chunkArray(updatedStudents, 250)) {
      const { error } = await client
        .from('students')
        .upsert(chunk.map(toStudentRow), { onConflict: 'nisn' });
      if (error) throw new Error(error.message);
    }
  },

  async deleteAbsensi(
    nisn: string,
    sesi: 'btq' | 'tahfidz',
    tanggal: string,
    updatedStudent?: Student
  ): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('absensi_records')
      .delete()
      .match({ nisn, sesi, tanggal });
    if (error) throw new Error(error.message);

    if (updatedStudent) {
      await this.upsertStudent(updatedStudent);
    }
  },

  async saveBatchBacaanEvaluations(params: {
    bacaanRecords: BacaanRecord[];
    absensiRecords: AbsensiRecord[];
    updatedStudents: Student[];
  }): Promise<void> {
    const client = requireClient();

    for (const chunk of chunkArray(params.bacaanRecords, 250)) {
      const { error } = await client
        .from('tilawati_records')
        .upsert(chunk.map(toBacaanRow), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }

    for (const chunk of chunkArray(params.absensiRecords, 250)) {
      const { error } = await client
        .from('absensi_records')
        .upsert(chunk.map(toAbsensiRow), { onConflict: 'nisn,tanggal,sesi' });
      if (error) throw new Error(error.message);
    }

    for (const chunk of chunkArray(params.updatedStudents, 250)) {
      const { error } = await client
        .from('students')
        .upsert(chunk.map(toStudentRow), { onConflict: 'nisn' });
      if (error) throw new Error(error.message);
    }
  },

  async pushAllLocalToCloud(params: {
    students: Student[];
    teachers: Teacher[];
    bacaan: BacaanRecord[];
    tahfidz: TahfidzRecord[];
    absensi: AbsensiRecord[];
    raporSettings?: RaporSettings;
  }): Promise<void> {
    const client = requireClient();

    for (const chunk of chunkArray(params.students, 250)) {
      const { error } = await client
        .from('students')
        .upsert(chunk.map(toStudentRow), { onConflict: 'nisn' });
      if (error) throw new Error(error.message);
    }

    for (const chunk of chunkArray(params.teachers, 250)) {
      const { error } = await client
        .from('teachers')
        .upsert(chunk.map(toTeacherRow), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }

    const validNisns = new Set(params.students.map(s => s.nisn));
    const validBacaan = params.bacaan.filter(b => validNisns.has(b.nisn));
    const validTahfidz = params.tahfidz.filter(t => validNisns.has(t.nisn));
    const validAbsensi = params.absensi.filter(a => validNisns.has(a.nisn));

    for (const chunk of chunkArray(validBacaan, 250)) {
      const { error } = await client
        .from('tilawati_records')
        .upsert(chunk.map(toBacaanRow), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }

    for (const chunk of chunkArray(validTahfidz, 250)) {
      const { error } = await client
        .from('tahfidz_records')
        .upsert(chunk.map(toTahfidzRow), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }

    for (const chunk of chunkArray(validAbsensi, 250)) {
      const { error } = await client
        .from('absensi_records')
        .upsert(chunk.map(toAbsensiRow), { onConflict: 'nisn,tanggal,sesi' });
      if (error) throw new Error(error.message);
    }

    if (params.raporSettings) {
      await this.saveRaporSettings(params.raporSettings);
    }
  },

  async clearAllData(): Promise<void> {
    const client = requireClient();
    const tables = [
      'tilawati_records',
      'tahfidz_records',
      'absensi_records',
      'ujian_records',
      'rapor_print_statuses',
      'rapor_print_logs',
      'students',
      'teachers'
    ];
    for (const t of tables) {
      const { error } = await client.from(t).delete().neq('id', '__never__');
      if (error && t === 'rapor_print_statuses') {
        await client.from(t).delete().neq('nisn', '__never__');
      } else if (error) {
        throw new Error(error.message);
      }
    }
  },

  // ==========================================================================
  // STAFF ACCOUNTS & AUTH LOGS
  // ==========================================================================

  async fetchStaffAccounts(): Promise<UserAccount[]> {
    const client = requireClient();
    const { data, error } = await client.from('staff_accounts').select('*');
    if (error) throw new Error(error.message);
    return (data || []).map(mapAccountRow);
  },

  async upsertStaffAccount(account: UserAccount): Promise<void> {
    const client = requireClient();
    const { error } = await client
      .from('staff_accounts')
      .upsert(toAccountRow(account), { onConflict: 'id' });
    if (error) throw new Error(error.message);
  },

  async syncStaffAccountsBatch(accounts: UserAccount[]): Promise<void> {
    const client = requireClient();
    for (const chunk of chunkArray(accounts, 250)) {
      const { error } = await client
        .from('staff_accounts')
        .upsert(chunk.map(toAccountRow), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }
  },

  async deleteStaffAccount(accountId: string): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('staff_accounts').delete().eq('id', accountId);
    if (error) throw new Error(error.message);
  },

  async purgeTeacherStaffAccounts(): Promise<void> {
    const client = requireClient();
    await client.from('staff_accounts').delete().in('role', ['guru_ngaji', 'guru_tahfidz']);
    await client.from('auth_logs').delete().neq('id', '__never__');
  },

  async fetchAuthLogs(): Promise<AuthLogEntry[]> {
    const client = requireClient();
    const { data, error } = await client
      .from('auth_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return (data || []).map(mapAuthLogRow);
  },

  async appendAuthLog(entry: AuthLogEntry): Promise<void> {
    const client = requireClient();
    await client.from('auth_logs').upsert(
      {
        id: entry.id,
        timestamp: entry.timestamp,
        username: entry.username,
        nama: entry.nama ?? null,
        role: entry.role ?? null,
        event: entry.event,
        detail: entry.detail
      },
      { onConflict: 'id' }
    );
  },

  // ==========================================================================
  // RAPOR SETTINGS & PRINT LOGS
  // ==========================================================================

  async saveRaporSettings(settings: RaporSettings): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('rapor_settings').upsert(
      {
        id: 'main',
        tahun_ajaran: settings.tahunAjaran,
        semester: settings.semester,
        tanggal_rapor: settings.tanggalRapor,
        kepala_sekolah: settings.kepalaSekolah,
        nbm_kepala: settings.nbmKepala,
        koordinator: settings.koordinator
      },
      { onConflict: 'id' }
    );
    if (error) throw new Error(error.message);
  },

  async saveRaporPrintBatch(params: {
    updatedStatuses: RaporPrintStatus[];
    newLog: RaporPrintBatchLog;
  }): Promise<void> {
    const client = requireClient();

    for (const chunk of chunkArray(params.updatedStatuses, 250)) {
      const { error } = await client.from('rapor_print_statuses').upsert(
        chunk.map(st => ({
          nisn: st.nisn,
          print_count: st.printCount,
          last_printed_at: st.lastPrintedAt,
          last_printed_by: st.lastPrintedBy,
          semester: st.semester,
          tahun_ajaran: st.tahunAjaran
        })),
        { onConflict: 'nisn' }
      );
      if (error) throw new Error(error.message);
    }

    const { error: logErr } = await client.from('rapor_print_logs').upsert(
      {
        id: params.newLog.id,
        printed_at: params.newLog.printedAt,
        printed_by: params.newLog.printedBy,
        kelas_label: params.newLog.kelasLabel,
        jenis_cetak: params.newLog.jenisCetak,
        total_rapor: params.newLog.totalRapor,
        semester: params.newLog.semester,
        tahun_ajaran: params.newLog.tahunAjaran,
        nisn_list: params.newLog.nisnList
      },
      { onConflict: 'id' }
    );
    if (logErr) throw new Error(logErr.message);
  },

  async resetStudentRaporStatus(nisn: string): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('rapor_print_statuses').delete().eq('nisn', nisn);
    if (error) throw new Error(error.message);
  },

  async resetAllRaporStatuses(): Promise<void> {
    const client = requireClient();
    const { error } = await client.from('rapor_print_statuses').delete().neq('nisn', '__never__');
    if (error) throw new Error(error.message);
  }
};
