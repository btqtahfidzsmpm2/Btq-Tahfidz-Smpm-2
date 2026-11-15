import React, { useState, useMemo } from 'react';
import {
  Student,
  UserSession,
  Teacher,
  UserAccount,
  AuthLogEntry,
  BacaanRecord,
  TahfidzRecord,
  AbsensiRecord
} from '../types';
import { BatchEvaluationTable } from './BatchEvaluationTable';
import { AccountSecurityPanel } from './AccountSecurityPanel';
import { ReportCenterPanel } from './ReportCenterPanel';
import { storage } from '../services/storage';
import { downloadRaporPdf } from '../services/raporPdf';
import {
  getAuthorizedStudents,
  getAuthorizedNgajiStudents,
  getAuthorizedTahfidzStudents,
  canTeachNgaji,
  canTeachTahfidz,
  isValidBtqClass,
  matchesTeacherName
} from '../utils/access';
import {
  Users,
  BookOpen,
  Award,
  GraduationCap,
  ClipboardCheck,
  Plus,
  Search,
  Download,
  Filter,
  Eye,
  Edit3,
  Trash2,
  FileSpreadsheet,
  UserCheck,
  UserPlus,
  MapPin,
  RefreshCw,
  CopyX,
  Table,
  Shield,
  KeyRound,
  AlertTriangle,
  Printer,
  FileDown
} from 'lucide-react';

interface TeacherDashboardProps {
  user: UserSession;
  students: Student[];
  teachers: Teacher[];
  bacaanList: BacaanRecord[];
  tahfidzList: TahfidzRecord[];
  absensiList: AbsensiRecord[];
  accounts: UserAccount[];
  authLogs: AuthLogEntry[];
  onRefreshAccounts: () => void;
  onOpenChangePasswordModal: () => void;
  onOpenBacaanModal: (student?: Student) => void;
  onOpenTahfidzModal: (student?: Student) => void;
  onOpenUjianModal: (student?: Student) => void;
  onOpenPresensiModal: () => void;
  onOpenAddStudentModal: () => void;
  onOpenEditStudentModal: (student: Student) => void;
  onDeleteStudent: (student: Student) => void;
  onOpenAddTeacherModal: () => void;
  onOpenEditTeacherModal: (teacher: Teacher) => void;
  onDeleteTeacher: (teacher: Teacher) => void;
  onOpenImportModal: () => void;
  onViewStudentReport: (student: Student) => void;
  onSyncTeachersFromStudents: () => void;
  onDeduplicateStudents: () => void;
  onClearAllData: () => void;
  onDataUpdated: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  user,
  students,
  teachers,
  bacaanList,
  tahfidzList,
  absensiList,
  accounts,
  authLogs,
  onRefreshAccounts,
  onOpenChangePasswordModal,
  onOpenBacaanModal,
  onOpenTahfidzModal,
  onOpenUjianModal,
  onOpenPresensiModal,
  onOpenAddStudentModal,
  onOpenEditStudentModal,
  onDeleteStudent,
  onOpenAddTeacherModal,
  onOpenEditTeacherModal,
  onDeleteTeacher,
  onOpenImportModal,
  onViewStudentReport,
  onSyncTeachersFromStudents,
  onDeduplicateStudents,
  onClearAllData,
  onDataUpdated,
  onNotify
}) => {
  // Admin sub-menu tab: 'siswa' | 'penilaian' | 'rapor' | 'guru' | 'keamanan'
  const [adminTab, setAdminTab] = useState<'siswa' | 'penilaian' | 'rapor' | 'guru' | 'keamanan'>('siswa');
  const [preselectedPrintNisn, setPreselectedPrintNisn] = useState<string | null>(null);

  // Guru Ngaji tab: 'tabel' | 'list'
  const [guruNgajiTab, setGuruNgajiTab] = useState<'tabel' | 'list'>('tabel');
  // Guru Tahfidz tab: 'setoran' | 'list'
  const [guruTahfidzTab, setGuruTahfidzTab] = useState<'setoran' | 'list'>('setoran');
  const [tahfidzSearch, setTahfidzSearch] = useState<string>('');

  // Filters for Students
  const [filterClass, setFilterClass] = useState<string>('');
  const [filterBTQ, setFilterBTQ] = useState<string>('');
  const [filterProgram, setFilterProgram] = useState<'' | 'btq' | 'tahfidz' | 'non_tahfidz'>('');
  const [filterGender, setFilterGender] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Filters for Teachers
  const [teacherSearch, setTeacherSearch] = useState<string>('');
  const [teacherRoleFilter, setTeacherRoleFilter] = useState<
    'all' | 'guru_ngaji' | 'guru_tahfidz'
  >('all');

  // Role-Based Filtering for Students
  const authorizedStudents = useMemo(
    () => getAuthorizedStudents(user, students),
    [user, students]
  );

  const ngajiStudents = useMemo(
    () => getAuthorizedNgajiStudents(user, students),
    [user, students]
  );

  const tahfidzStudents = useMemo(
    () => getAuthorizedTahfidzStudents(user, students),
    [user, students]
  );

  const filteredTahfidzStudents = useMemo(() => {
    const q = tahfidzSearch.trim().toLowerCase();
    if (!q) return tahfidzStudents;
    return tahfidzStudents.filter(
      s =>
        s.nama.toLowerCase().includes(q) ||
        s.nisn.includes(q) ||
        s.kelas.toLowerCase().includes(q) ||
        (s.halaqahTahfidz || '').toLowerCase().includes(q)
    );
  }, [tahfidzStudents, tahfidzSearch]);

  // Dynamic list of unique BTQ classes (excluding Tahfidz placeholders)
  const availableKelasBTQ = useMemo(() => {
    const source = user.role === 'admin' ? students : authorizedStudents;
    const set = new Set<string>();
    source.forEach(s => {
      if (isValidBtqClass(s.kelasBTQ)) {
        set.add(s.kelasBTQ.trim());
      }
    });
    return Array.from(set).sort();
  }, [user.role, students, authorizedStudents]);

  // Combined search and sub-filters for Students
  const filteredStudents = useMemo(() => {
    return authorizedStudents.filter(s => {
      const matchSearch =
        s.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.nisn.includes(searchTerm) ||
        s.kelasBTQ.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.pengajar.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.halaqahTahfidz || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.pembimbingTahfidz || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchClass = filterClass ? s.kelas === filterClass : true;
      const matchBTQ = filterBTQ
        ? s.kelasBTQ.trim().toUpperCase() === filterBTQ.trim().toUpperCase()
        : true;
      const matchProgram =
        filterProgram === 'btq'
          ? isValidBtqClass(s.kelasBTQ)
          : filterProgram === 'tahfidz'
          ? s.isTahfidz
          : filterProgram === 'non_tahfidz'
          ? !s.isTahfidz
          : true;
      const matchGender = filterGender ? s.gender === filterGender : true;

      return matchSearch && matchClass && matchBTQ && matchProgram && matchGender;
    });
  }, [authorizedStudents, searchTerm, filterClass, filterBTQ, filterProgram, filterGender]);

  // Filtered Teachers
  const filteredTeachers = useMemo(() => {
    return teachers.filter(t => {
      const matchSearch =
        t.nama.toLowerCase().includes(teacherSearch.toLowerCase()) ||
        t.kelompokBTQ.toLowerCase().includes(teacherSearch.toLowerCase()) ||
        (t.kelompokTahfidz || '').toLowerCase().includes(teacherSearch.toLowerCase()) ||
        t.ruangan.toLowerCase().includes(teacherSearch.toLowerCase());

      const matchRole =
        teacherRoleFilter === 'all' ? true : t.role === teacherRoleFilter;

      return matchSearch && matchRole;
    });
  }, [teachers, teacherSearch, teacherRoleFilter]);

  // Metrics for Student Dashboard
  const metrics = useMemo(() => {
    const total = authorizedStudents.length;
    const tahfidzCount = authorizedStudents.filter(s => s.isTahfidz).length;
    const mumtazCount = authorizedStudents.filter(
      s => s.ujian.predikat === 'MUMTAZ' || s.ujian.nilai >= 85
    ).length;
    const avgAttendance = Math.round(
      authorizedStudents.reduce((acc, curr) => acc + (curr.kehadiranPersen || 95), 0) / (total || 1)
    );

    return { total, tahfidzCount, mumtazCount, avgAttendance };
  }, [authorizedStudents]);

  // Metrics for Teacher Management
  const teacherMetrics = useMemo(() => {
    const total = teachers.length;
    const guruNgaji = teachers.filter(t => t.role === 'guru_ngaji').length;
    const guruTahfidz = teachers.filter(t => t.role === 'guru_tahfidz').length;
    const uniqueRooms = new Set(
      teachers.map(t => t.ruangan).filter(r => r && r.trim() && r !== '-')
    ).size;

    return { total, guruNgaji, guruTahfidz, uniqueRooms };
  }, [teachers]);

  // Export CSV Handler
  const handleExportCSV = () => {
    const headers = ['NISN', 'Nama Siswa', 'JK', 'Kelas Formal', 'Kelompok BTQ', 'Pengajar', 'Ruangan', 'Tahfidz', 'Capaian Terakhir', 'Nilai Ujian', 'Natijah'];
    const rows = filteredStudents.map(s => [
      `"${s.nisn}"`,
      `"${s.nama}"`,
      `"${s.gender}"`,
      `"${s.kelas}"`,
      `"${s.kelasBTQ}"`,
      `"${s.pengajar}"`,
      `"${s.ruangan}"`,
      s.isTahfidz ? '"Ya"' : '"Tidak"',
      `"${s.capaianTerakhir.tingkat} - ${s.capaianTerakhir.halamanAyat}"`,
      s.ujian.nilai,
      `"${s.ujian.natijah}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rekap_btq_spemda_${user.role}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onNotify('success', 'Export CSV Berhasil', `Berhasil mengekspor ${filteredStudents.length} data siswa.`);
  };

  const handleQuickDownloadStudentPdf = async (student: Student) => {
    try {
      const settings = storage.getRaporSettings();
      const fileName = await downloadRaporPdf({
        students: [student],
        bacaanList,
        tahfidzList,
        absensiList,
        settings,
        fileLabel: `Kelas_${student.kelas}_${student.nama}`
      });
      storage.recordRaporPrintBatch({
        students: [student],
        printedBy: user.nama,
        kelasLabel: `Kelas ${student.kelas}`,
        jenisCetak: 'Download Rapor PDF (Satuan)',
        semester: settings.semester,
        tahunAjaran: settings.tahunAjaran
      });
      onNotify(
        'success',
        'Download Rapor PDF Berhasil',
        `Rapor ${student.nama} (${fileName}) berhasil diunduh.`
      );
    } catch {
      onNotify('error', 'Gagal Download PDF', 'Terjadi kendala saat membuat file PDF rapor.');
    }
  };

  const getRoleDescription = () => {
    switch (user.role) {
      case 'admin':
        return 'Administrator Utama: Akses penuh untuk mengelola siswa Kelas BTQ & Program Tahfidz, Guru Ngaji, Guru Tahfidz, serta Cetak/Download Rapor.';
      case 'guru_ngaji':
        return `Guru Ngaji (Kelas BTQ): Membina capaian Tilawati & Al-Qur'an siswa pada kelompok ${user.assignedGroup || 'BTQ binaan Anda'}.`;
      case 'guru_tahfidz':
        return `Guru Tahfidz (Program Tahfidz): Mengelola setoran hafalan Qur'an, tasmi juz, dan capaian santri pada halaqah ${user.assignedTahfidzGroup || user.assignedGroup || 'Tahfidz binaan Anda'}.`;
      case 'wali_kelas':
        return `Wali Kelas ${user.assignedClass || 'Formal'}: Memantau rekap harian kehadiran dan pencapaian siswa perwalian Anda.`;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">

      {/* Default Password Security Alert Banner */}
      {user.isDefaultPassword && (
        <section className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-400 text-slate-900 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-amber-950">
                Peringatan Keamanan: Anda Masih Menggunakan Password Standar Awal
              </h3>
              <p className="text-[11px] text-amber-900 mt-0.5 leading-relaxed">
                Demi menjaga keamanan data nilai & santri, segera perbarui password akun <strong className="font-mono">@{user.username}</strong> dengan password pribadi Anda sendiri.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenChangePasswordModal}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Ubah Password Sekarang</span>
          </button>
        </section>
      )}

      {/* Top Banner & Title */}
      <section className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div className="flex items-start sm:items-center gap-4">
          <img
            src="/assets/logo_spemda_quran.png"
            alt="Logo SMP Muhammadiyah 2 Surabaya & Fashahah Balaghah Qur'an"
            className="h-14 sm:h-16 w-auto object-contain bg-slate-50 p-1.5 rounded-xl border border-slate-200 shadow-2xs shrink-0"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Dashboard{' '}
                {user.role === 'admin'
                  ? 'Administrator'
                  : user.role === 'guru_ngaji'
                  ? 'Guru Ngaji'
                  : user.role === 'guru_tahfidz'
                  ? 'Guru Tahfidz'
                  : 'Wali Kelas'}
              </h1>
              <span className="text-xs text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200 uppercase font-mono">
                {user.nama}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              {getRoleDescription()}
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap gap-2 w-full lg:w-auto">
          {user.role === 'admin' && (
            <>
              <button
                onClick={onOpenAddStudentModal}
                className="px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Tambah Siswa</span>
              </button>

              <button
                onClick={onOpenAddTeacherModal}
                className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Tambah Guru</span>
              </button>

              <button
                onClick={onOpenImportModal}
                className="px-3 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-800" />
                <span>Import Format Data</span>
              </button>

              <button
                onClick={() => setAdminTab('rapor')}
                className="px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5 text-amber-300" />
                <span>Download & Cetak Rapor</span>
              </button>
            </>
          )}

          {canTeachNgaji(user.role) && (
            <button
              onClick={() => onOpenBacaanModal()}
              className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>+ Capaian Tilawati</span>
            </button>
          )}

          {canTeachTahfidz(user.role) && (
            <button
              onClick={() => onOpenTahfidzModal()}
              className="px-3.5 py-2 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
            >
              <Award className="w-3.5 h-3.5" />
              <span>+ Setoran Tahfidz</span>
            </button>
          )}

          <button
            onClick={() => onOpenUjianModal()}
            className="px-3.5 py-2 text-xs font-bold text-white bg-purple-700 hover:bg-purple-800 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Update Nilai Ujian</span>
          </button>

          <button
            onClick={onOpenPresensiModal}
            className="px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            <span>Presensi Harian</span>
          </button>
        </div>
      </section>

      {/* GURU NGAJI SUB-MENU TABS (KHUSUS TILAWATI & AL-QUR'AN / BTQ) */}
      {user.role === 'guru_ngaji' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setGuruNgajiTab('tabel')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
              guruNgajiTab === 'tabel'
                ? 'bg-emerald-800 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Table className="w-4 h-4" />
            <span>Tabel Penilaian Massal BTQ ({ngajiStudents.length})</span>
            <span className="text-[10px] bg-emerald-700 text-white px-1.5 py-0.5 rounded font-mono font-semibold">
              ⚡ Mode Cepat
            </span>
          </button>

          <button
            onClick={() => setGuruNgajiTab('list')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
              guruNgajiTab === 'list'
                ? 'bg-emerald-800 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Daftar Siswa Kelas BTQ & Rapor ({ngajiStudents.length})</span>
          </button>
        </div>
      )}

      {/* GURU TAHFIDZ SUB-MENU TABS (KHUSUS SETORAN & HALAQAH TAHFIDZ) */}
      {user.role === 'guru_tahfidz' && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
          <button
            onClick={() => setGuruTahfidzTab('setoran')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
              guruTahfidzTab === 'setoran'
                ? 'bg-amber-500 text-slate-950 shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Halaqah & Setoran Tahfidz ({tahfidzStudents.length})</span>
          </button>

          <button
            onClick={() => setGuruTahfidzTab('list')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
              guruTahfidzTab === 'list'
                ? 'bg-emerald-800 text-white shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Ringkasan & Rapor Santri Tahfidz ({tahfidzStudents.length})</span>
          </button>
        </div>
      )}

      {/* ADMIN SUB-MENU TABS (Active only for admin) */}
      {user.role === 'admin' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAdminTab('siswa')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
                adminTab === 'siswa'
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Kelola Data Siswa & Ujian ({students.length})</span>
            </button>

            <button
              onClick={() => setAdminTab('penilaian')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
                adminTab === 'penilaian'
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>Tabel Penilaian Massal</span>
              <span className="text-[10px] bg-emerald-700 text-white px-1.5 py-0.5 rounded font-mono font-semibold">
                ⚡ Mode Cepat
              </span>
            </button>

            <button
              onClick={() => setAdminTab('rapor')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
                adminTab === 'rapor'
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <FileDown className="w-4 h-4" />
              <span>Download, Cetak & Rekap Rapor</span>
            </button>

            <button
              onClick={() => setAdminTab('guru')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
                adminTab === 'guru'
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Kelola Guru Ngaji & Tahfidz ({teachers.length})</span>
            </button>

            <button
              onClick={() => setAdminTab('keamanan')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-2 ${
                adminTab === 'keamanan'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Akun & Keamanan Login ({accounts.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(students.length > 0 || teachers.length > 0) && (
              <>
                <button
                  onClick={onDeduplicateStudents}
                  className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  title="Hapus data siswa yang namanya dobel menjadi satu nama saja"
                >
                  <CopyX className="w-3.5 h-3.5 text-rose-600" />
                  <span>Hapus Nama Siswa Dobel</span>
                </button>

                <button
                  onClick={onClearAllData}
                  className="px-3.5 py-2 text-xs font-bold text-rose-800 bg-white hover:bg-rose-50 border border-rose-300 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  title="Hapus seluruh data siswa, guru, bacaan, dan absensi"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>Kosongkan Semua Data</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* VIEW 0: KELOLA AKUN & KEAMANAN LOGIN (ADMIN ONLY) */}
      {user.role === 'admin' && adminTab === 'keamanan' && (
        <AccountSecurityPanel
          currentUser={user}
          accounts={accounts}
          logs={authLogs}
          onRefreshAccounts={onRefreshAccounts}
          onNotify={onNotify}
        />
      )}

      {/* VIEW 1: TABEL PENILAIAN MASSAL BTQ (GURU NGAJI / ADMIN) */}
      {((user.role === 'guru_ngaji' && guruNgajiTab === 'tabel') ||
        (user.role === 'admin' && adminTab === 'penilaian')) && (
        <BatchEvaluationTable
          user={user}
          students={ngajiStudents}
          bacaanList={bacaanList}
          absensiList={absensiList}
          onNotify={onNotify}
          onDataUpdated={onDataUpdated}
        />
      )}

      {/* VIEW 1B: HALAQAH & SETORAN TAHFIDZ (KHUSUS GURU TAHFIDZ) */}
      {user.role === 'guru_tahfidz' && guruTahfidzTab === 'setoran' && (
        <section className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-amber-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600" />
                <span>Daftar Santri Halaqah Program Tahfidz</span>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Khusus santri peserta Program Tahfidz pada halaqah <strong>{user.assignedTahfidzGroup || user.assignedGroup || 'Binaan Anda'}</strong> (terpisah dari kelas reguler BTQ).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={tahfidzSearch}
                  onChange={e => setTahfidzSearch(e.target.value)}
                  placeholder="Cari santri / NISN / halaqah..."
                  className="pl-8 pr-3 py-1.5 border border-amber-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <button
                onClick={() => onOpenTahfidzModal()}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs"
              >
                <Award className="w-3.5 h-3.5" />
                <span>+ Catat Setoran Tahfidz</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">NISN</th>
                  <th className="p-3">Nama Santri</th>
                  <th className="p-3">Kelas Formal</th>
                  <th className="p-3">Halaqah Tahfidz & Ruangan</th>
                  <th className="p-3">Target Juz</th>
                  <th className="p-3">Total Hafalan</th>
                  <th className="p-3">Setoran Terakhir</th>
                  <th className="p-3 text-center">Nilai Tes</th>
                  <th className="p-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTahfidzStudents.length > 0 ? (
                  filteredTahfidzStudents.map(st => (
                    <tr key={st.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="p-3 font-mono text-slate-500 whitespace-nowrap">{st.nisn}</td>
                      <td className="p-3 font-bold text-slate-900">
                        <div>{st.nama}</div>
                        <span className="text-[10px] font-normal text-slate-500">
                          {isValidBtqClass(st.kelasBTQ) ? `Kelas BTQ: ${st.kelasBTQ}` : 'Program Tahfidz (Non-BTQ)'}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">{st.kelas}</td>
                      <td className="p-3">
                        <div className="font-semibold text-amber-800">
                          {st.halaqahTahfidz || user.assignedTahfidzGroup || 'HALAQAH TAHFIDZ'}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">
                          {st.ruanganTahfidz || st.ruangan}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{st.targetJuz || 'Juz 30'}</td>
                      <td className="p-3 font-bold text-emerald-800">{st.totalHafalan || '-'}</td>
                      <td className="p-3 text-slate-700">{st.hafalanTerakhir || '-'}</td>
                      <td className="p-3 text-center">
                        <span className="font-bold font-mono text-slate-800">{st.ujian.nilai}</span>
                        <span className="block text-[10px] text-slate-400 font-semibold">
                          {st.ujian.predikat}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => onOpenTahfidzModal(st)}
                            className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-lg text-[11px] transition-colors"
                          >
                            + Setoran
                          </button>
                          <button
                            onClick={() => onOpenUjianModal(st)}
                            className="p-1.5 text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded-lg transition-colors"
                            title="Update Nilai Tes Tahfidz"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onViewStudentReport(st)}
                            className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Lihat Rapor"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-slate-400">
                      Belum ada santri Program Tahfidz yang terhubung dengan akun Anda. Pastikan Admin mengimpor data Format Tahfidz atau menandai siswa sebagai peserta Tahfidz.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* VIEW 2: KELOLA SISWA (Directory / Metrics) */}
      {(((user.role === 'admin' && adminTab === 'siswa') ||
        (user.role === 'guru_ngaji' && guruNgajiTab === 'list') ||
        (user.role === 'guru_tahfidz' && guruTahfidzTab === 'list') ||
        user.role === 'wali_kelas')) && (
        <>
          {/* 4 Metric Cards */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-medium">Siswa di Bawah Otoritas</span>
                <Users className="w-4 h-4 text-emerald-700" />
              </div>
              <span className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                {metrics.total}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Terdaftar di semester aktif
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-medium">Peserta Program Tahfidz</span>
                <Award className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-2xl font-black text-amber-700 font-mono tabular-nums">
                {metrics.tahfidzCount}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Fokus juz 30, 29, 28, dan 1
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-medium">Predikat Ujian Mumtaz</span>
                <GraduationCap className="w-4 h-4 text-purple-700" />
              </div>
              <span className="text-2xl font-black text-purple-800 font-mono tabular-nums">
                {metrics.mumtazCount}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Nilai di atas 85 / Istimewa
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-medium">Presensi Rata-rata</span>
                <ClipboardCheck className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-2xl font-black text-blue-700 font-mono tabular-nums">
                {metrics.avgAttendance}%
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Kehadiran mengaji & halaqah
              </span>
            </div>
          </section>

          {/* Student Filter and Table Card */}
          <section className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
            
            {/* Filter Bar */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
              
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold mr-1">
                  <Filter className="w-3.5 h-3.5" />
                  <span>Filter:</span>
                </div>

                {/* Filter Formal Class */}
                <select
                  value={filterClass}
                  onChange={e => setFilterClass(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">Semua Kelas Formal</option>
                  <option value="7D">7D (Putri)</option>
                  <option value="7E">7E (Putri)</option>
                  <option value="7F">7F (Putri)</option>
                  <option value="7A">7A (Putra)</option>
                  <option value="7B">7B (Putra)</option>
                  <option value="7C">7C (Putra)</option>
                  <option value="8E">8E (Putri)</option>
                  <option value="8F">8F (Putri)</option>
                  <option value="8G">8G (Putri)</option>
                  <option value="8A">8A (Putra)</option>
                  <option value="8B">8B (Putra)</option>
                  <option value="8C">8C (Putra)</option>
                  <option value="8D">8D (Putra)</option>
                  <option value="9E">9E (Putri)</option>
                  <option value="9F">9F (Putri)</option>
                  <option value="9G">9G (Putri)</option>
                  <option value="9A">9A (Putra)</option>
                  <option value="9B">9B (Putra)</option>
                  <option value="9C">9C (Putra)</option>
                  <option value="9D">9D (Putra)</option>
                </select>

                {/* Filter Kelas BTQ (Sesuai dengan Kelas BTQ Data Siswa) */}
                <select
                  value={filterBTQ}
                  onChange={e => setFilterBTQ(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">Semua Kelas BTQ</option>
                  {availableKelasBTQ.map(btq => (
                    <option key={btq} value={btq}>
                      {btq}
                    </option>
                  ))}
                </select>

                {/* Filter Program (BTQ vs Tahfidz) */}
                {user.role !== 'guru_tahfidz' && (
                  <select
                    value={filterProgram}
                    onChange={e => setFilterProgram(e.target.value as '' | 'btq' | 'tahfidz' | 'non_tahfidz')}
                    className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Semua Program</option>
                    <option value="btq">Peserta Kelas BTQ</option>
                    <option value="tahfidz">Peserta Program Tahfidz</option>
                    <option value="non_tahfidz">BTQ Saja (Non-Tahfidz)</option>
                  </select>
                )}

                {/* Filter Gender */}
                <select
                  value={filterGender}
                  onChange={e => setFilterGender(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">Semua Santri (Pa/Pi)</option>
                  <option value="P">Santri Putri</option>
                  <option value="L">Santri Putra</option>
                </select>

                {(filterClass || filterBTQ || filterProgram || filterGender || searchTerm) && (
                  <button
                    onClick={() => {
                      setFilterClass('');
                      setFilterBTQ('');
                      setFilterProgram('');
                      setFilterGender('');
                      setSearchTerm('');
                    }}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1"
                  >
                    Reset Filter
                  </button>
                )}
              </div>

              {/* Search Box & Export */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 md:w-60">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Cari nama, NISN, atau guru..."
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <button
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs"
                  title="Download Data CSV"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
              </div>

            </div>

            {/* Master Data Table */}
            <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
                  <tr>
                    <th className="p-3 whitespace-nowrap">NISN</th>
                    <th className="p-3">Nama Siswa</th>
                    <th className="p-3 whitespace-nowrap">Kelas</th>
                    <th className="p-3">Kelas BTQ &amp; Tahfidz</th>
                    <th className="p-3">Pengajar &amp; Ruangan</th>
                    <th className="p-3 whitespace-nowrap">Capaian Terakhir</th>
                    <th className="p-3 text-center whitespace-nowrap">Nilai Ujian</th>
                    <th className="p-3 text-center whitespace-nowrap">Hasil Tes</th>
                    <th className="p-3 text-center whitespace-nowrap">Aksi Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.length > 0 ? (
                    filteredStudents.map(student => (
                      <tr key={student.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3 font-mono font-medium text-slate-500 whitespace-nowrap">
                          {student.nisn}
                        </td>

                        <td className="p-3 font-bold text-slate-900">
                          <div className="flex items-center gap-1.5">
                            <span>{student.nama}</span>
                            {student.isTahfidz && (
                              <span className="text-[10px] text-amber-700 font-bold" title="Peserta Program Tahfidz">
                                ★ Tahfidz
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-normal block">
                            Wali Kelas: {student.waliKelas}
                          </span>
                        </td>

                        <td className="p-3 font-semibold text-slate-700 whitespace-nowrap">
                          {student.kelas}
                        </td>

                        <td className="p-3">
                          <div className={`font-semibold ${isValidBtqClass(student.kelasBTQ) ? 'text-emerald-800' : 'text-slate-400 italic font-normal'}`}>
                            {isValidBtqClass(student.kelasBTQ) ? `BTQ: ${student.kelasBTQ}` : 'Tidak ikut Kelas BTQ'}
                          </div>
                          {student.isTahfidz ? (
                            <span className="text-[10px] font-semibold text-amber-700 block mt-0.5">
                              Tahfidz: {student.halaqahTahfidz || 'HALAQAH TAHFIDZ'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              Non-Tahfidz
                            </span>
                          )}
                        </td>

                        <td className="p-3 text-slate-600">
                          {isValidBtqClass(student.kelasBTQ) && (
                            <div>
                              <span className="font-medium text-slate-800">Ngaji: {student.pengajar}</span>
                              <span className="text-[10px] text-slate-400 font-mono ml-1">({student.ruangan})</span>
                            </div>
                          )}
                          {student.isTahfidz && student.pembimbingTahfidz && student.pembimbingTahfidz !== '-' && (
                            <div className="mt-0.5">
                              <span className="font-medium text-amber-800">Tahfidz: {student.pembimbingTahfidz}</span>
                              {student.ruanganTahfidz && (
                                <span className="text-[10px] text-slate-400 font-mono ml-1">({student.ruanganTahfidz})</span>
                              )}
                            </div>
                          )}
                          {!isValidBtqClass(student.kelasBTQ) && (!student.isTahfidz || !student.pembimbingTahfidz) && (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className="p-3 text-slate-700">
                          <span className="font-semibold text-slate-900 block">
                            {student.capaianTerakhir.tingkat}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {student.capaianTerakhir.halamanAyat} ({student.capaianTerakhir.tanggal})
                          </span>
                        </td>

                        <td className="p-3 text-center">
                          <span className="font-bold font-mono tabular-nums text-slate-800">
                            {student.ujian.nilai}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-semibold">
                            {student.ujian.predikat}
                          </span>
                        </td>

                        <td className="p-3 text-center">
                          <span className="font-semibold text-slate-700 text-[11px] block">
                            {student.ujian.natijah}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            {student.ujian.kelulusan || 'Sesuai level'}
                          </span>
                        </td>

                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            
                            {/* View Report */}
                            <button
                              onClick={() => onViewStudentReport(student)}
                              className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                              title="Lihat Rapor Siswa"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {/* Input Reading (Tilawati) - KHUSUS ADMIN & GURU NGAJI */}
                            {canTeachNgaji(user.role) && (
                              <button
                                onClick={() => onOpenBacaanModal(student)}
                                className="p-1.5 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Catat Capaian Tilawati / Qur'an"
                              >
                                <BookOpen className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Input Tahfidz - KHUSUS ADMIN & GURU TAHFIDZ */}
                            {student.isTahfidz && canTeachTahfidz(user.role) && (
                              <button
                                onClick={() => onOpenTahfidzModal(student)}
                                className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Catat Setoran Tahfidz"
                              >
                                <Award className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {/* Update Exam */}
                            <button
                              onClick={() => onOpenUjianModal(student)}
                              className="p-1.5 text-purple-700 hover:text-purple-900 hover:bg-purple-50 rounded-lg transition-colors"
                              title="Perbarui Nilai Tes Kenaikan"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {/* ADMIN ONLY: DOWNLOAD PDF, CETAK RAPOR, EDIT & DELETE SISWA REAL TIME */}
                            {user.role === 'admin' && (
                              <>
                                <button
                                  onClick={() => handleQuickDownloadStudentPdf(student)}
                                  className="p-1.5 text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors"
                                  title="Download Rapor PDF Siswa Ini"
                                >
                                  <FileDown className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => {
                                    setPreselectedPrintNisn(student.nisn);
                                    setAdminTab('rapor');
                                  }}
                                  className="p-1.5 text-slate-700 hover:text-slate-950 hover:bg-slate-100 rounded-lg transition-colors"
                                  title="Cetak Rapor Siswa Ini"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => onOpenEditStudentModal(student)}
                                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Edit Siswa"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => onDeleteStudent(student)}
                                  className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Hapus Siswa (Real Time)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}

                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="p-10 text-center text-slate-500">
                        {students.length === 0 && user.role === 'admin' ? (
                          <div className="max-w-md mx-auto space-y-3">
                            <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto border border-emerald-200">
                              <FileSpreadsheet className="w-5 h-5" />
                            </div>
                            <p className="text-sm font-bold text-slate-800">
                              Database Siswa & Pengajar Masih Kosong
                            </p>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              Seluruh data contoh telah dibersihkan. Silakan unggah data siswa, NISN, kelompok BTQ, dan guru pengajar melalui tombol <strong>Import Format Data</strong>.
                            </p>
                            <button
                              onClick={onOpenImportModal}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl transition-colors shadow-2xs"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                              <span>Import Format Data Sekarang</span>
                            </button>
                          </div>
                        ) : (
                          'Tidak ada data siswa yang cocok dengan kriteria filter atau hak akses Anda.'
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer Summary */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center">
              <span>
                Menampilkan <strong className="text-slate-700">{filteredStudents.length}</strong> dari{' '}
                <strong className="text-slate-700">{authorizedStudents.length}</strong> siswa.
              </span>
              <span className="font-mono text-[11px]">
                SMP Muhammadiyah 2 Surabaya · SIM-Qur'an
              </span>
            </div>

          </section>
        </>
      )}

      {/* VIEW B: KELOLA GURU NGAJI & TAHFIDZ (ADMIN ONLY) */}
      {user.role === 'admin' && adminTab === 'guru' && (
        <div className="space-y-6">
          
          {/* Synchronize & Source of Truth Banner */}
          <section className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-800 text-white flex items-center justify-center shrink-0 shadow-2xs">
                <RefreshCw className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-emerald-950">
                  Sinkronisasi Guru Pengajar Langsung dari Data Siswa Terimpor
                </h3>
                <p className="text-[11px] text-emerald-800 leading-relaxed mt-0.5 max-w-2xl">
                  Daftar guru dimuat terpisah sesuai tugasnya: kolom <strong>PENGAJAR_BTQ</strong> (Format Ngaji) menjadi <strong>Guru Ngaji (Kelas BTQ)</strong> dan kolom <strong>PEMBIMBING_TAHFIDZ</strong> (Format Tahfidz) menjadi <strong>Guru Tahfidz (Program Tahfidz)</strong>.
                </p>
              </div>
            </div>

            <button
              onClick={onSyncTeachersFromStudents}
              className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-xs transition-colors shadow-2xs flex items-center gap-2 shrink-0 cursor-pointer"
              title="Hapus guru dummy/contoh dan masukkan guru asli dari data siswa"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Hapus Guru Contoh & Sinkronkan</span>
            </button>
          </section>

          {/* Teacher Metrics */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-medium">Total Guru Pengajar</span>
                <UserCheck className="w-4 h-4 text-emerald-700" />
              </div>
              <span className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                {teacherMetrics.total}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Ustadz & Ustadzah aktif
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-medium">Guru Ngaji (Kelas BTQ)</span>
                <BookOpen className="w-4 h-4 text-emerald-800" />
              </div>
              <span className="text-2xl font-black text-emerald-800 font-mono tabular-nums">
                {teacherMetrics.guruNgaji}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Membina Tilawati & Al-Qur'an
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-medium">Guru Tahfidz (Program Tahfidz)</span>
                <Award className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-2xl font-black text-amber-700 font-mono tabular-nums">
                {teacherMetrics.guruTahfidz}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Membimbing Halaqah & Setoran Tahfidz
              </span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-medium">Ruangan Halaqah Aktif</span>
                <MapPin className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-2xl font-black text-blue-700 font-mono tabular-nums">
                {teacherMetrics.uniqueRooms}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Lokasi kelas mengaji harian
              </span>
            </div>
          </section>

          {/* Teacher Table and Management */}
          <section className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
            
            {/* Filter Bar */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/60 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-700">Filter Peran:</span>
                <div className="flex flex-wrap items-center gap-1 p-0.5 bg-slate-200/70 rounded-lg">
                  <button
                    onClick={() => setTeacherRoleFilter('all')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                      teacherRoleFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua ({teachers.length})
                  </button>
                  <button
                    onClick={() => setTeacherRoleFilter('guru_ngaji')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                      teacherRoleFilter === 'guru_ngaji'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Guru Ngaji ({teacherMetrics.guruNgaji})
                  </button>
                  <button
                    onClick={() => setTeacherRoleFilter('guru_tahfidz')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                      teacherRoleFilter === 'guru_tahfidz'
                        ? 'bg-white text-amber-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Guru Tahfidz ({teacherMetrics.guruTahfidz})
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 md:w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={teacherSearch}
                    onChange={e => setTeacherSearch(e.target.value)}
                    placeholder="Cari nama guru, kelompok, ruangan..."
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <button
                  onClick={onSyncTeachersFromStudents}
                  className="px-3 py-1.5 bg-white border border-emerald-700 text-emerald-800 hover:bg-emerald-50 font-bold rounded-lg text-xs transition-colors shadow-2xs flex items-center gap-1.5 shrink-0"
                  title="Hapus guru contoh dan muat guru dari data siswa"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sinkronkan Guru</span>
                </button>

                <button
                  onClick={onOpenAddTeacherModal}
                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs transition-colors shadow-2xs flex items-center gap-1.5 shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Tambah Guru Baru</span>
                </button>
              </div>
            </div>

            {/* Teachers Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3">Nama Ustadz / Ustadzah</th>
                    <th className="p-3">Bidang / Peran</th>
                    <th className="p-3">Kelas BTQ / Halaqah Tahfidz</th>
                    <th className="p-3">Ruangan</th>
                    <th className="p-3">Kontak WhatsApp</th>
                    <th className="p-3 text-center">Santri Dibimbing</th>
                    <th className="p-3 text-center whitespace-nowrap">Aksi Real Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTeachers.length > 0 ? (
                    filteredTeachers.map(teacher => {
                      const studentCount = students.filter(s =>
                        teacher.role === 'guru_tahfidz'
                          ? s.isTahfidz && matchesTeacherName(s.pembimbingTahfidz, teacher.nama)
                          : isValidBtqClass(s.kelasBTQ) && matchesTeacherName(s.pengajar, teacher.nama)
                      ).length;
                      const linkedAcc = accounts.find(
                        a =>
                          a.teacherId === teacher.id ||
                          (a.role === teacher.role &&
                            a.nama.trim().toUpperCase() === teacher.nama.trim().toUpperCase())
                      );

                      return (
                        <tr key={teacher.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="p-3 font-bold text-slate-900">
                            <div>{teacher.nama}</div>
                            {linkedAcc && (
                              <div className="text-[11px] font-mono font-normal text-slate-500 mt-0.5">
                                Login: <span className="text-emerald-800 font-semibold">{linkedAcc.username}</span>
                              </div>
                            )}
                          </td>

                          <td className="p-3">
                            <span
                              className={`font-semibold text-xs ${
                                teacher.role === 'guru_tahfidz'
                                  ? 'text-amber-700'
                                  : 'text-emerald-800'
                              }`}
                            >
                              {teacher.role === 'guru_tahfidz'
                                ? 'Guru Tahfidz (Program Tahfidz)'
                                : 'Guru Ngaji (Kelas BTQ)'}
                            </span>
                          </td>

                          <td className="p-3 font-medium text-slate-700">
                            {teacher.role === 'guru_tahfidz' ? (
                              <span className="text-amber-800 font-semibold">
                                {teacher.kelompokTahfidz || teacher.kelompokBTQ}
                              </span>
                            ) : (
                              <span className="text-emerald-900 font-semibold">
                                {teacher.kelompokBTQ}
                              </span>
                            )}
                          </td>

                          <td className="p-3 font-mono text-slate-600">
                            {teacher.ruangan}
                          </td>

                          <td className="p-3 font-mono text-slate-500">
                            {teacher.kontak || '-'}
                          </td>

                          <td className="p-3 text-center">
                            <span className="font-bold text-slate-800 font-mono tabular-nums">
                              {studentCount} Siswa
                            </span>
                          </td>

                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Filter to view students */}
                              <button
                                onClick={() => {
                                  setSearchTerm(teacher.nama);
                                  setAdminTab('siswa');
                                  onNotify('info', `Memfilter Siswa`, `Menampilkan santri binaan ${teacher.nama}.`);
                                }}
                                className="p-1.5 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 rounded-lg transition-colors"
                                title="Lihat Siswa Binaan"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Edit Teacher */}
                              <button
                                onClick={() => onOpenEditTeacherModal(teacher)}
                                className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Edit Data Guru"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete Teacher */}
                              <button
                                onClick={() => onDeleteTeacher(teacher)}
                                className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Hapus Guru (Real Time)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        Tidak ada guru pengajar yang cocok dengan pencarian Anda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex justify-between items-center">
              <span>
                Total <strong className="text-slate-700">{filteredTeachers.length}</strong> guru pengajar BTQ & Tahfidz terdaftar.
              </span>
              <span className="font-mono text-[11px]">SMP Muhammadiyah 2 Surabaya</span>
            </div>

          </section>

        </div>
      )}
      </div>

      {/* VIEW RAPOR: CETAK MASSAL & REKAP CETAK RAPOR (HANYA ADMIN) */}
      {user.role === 'admin' && adminTab === 'rapor' && (
        <ReportCenterPanel
          user={user}
          students={students}
          bacaanList={bacaanList}
          tahfidzList={tahfidzList}
          absensiList={absensiList}
          preselectedStudentNisn={preselectedPrintNisn}
          onClearPreselected={() => setPreselectedPrintNisn(null)}
          onNotify={onNotify}
        />
      )}

    </div>
  );
};
