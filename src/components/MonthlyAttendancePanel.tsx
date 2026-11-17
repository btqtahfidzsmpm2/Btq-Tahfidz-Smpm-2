import React, { useMemo, useState } from 'react';
import { AbsensiRecord, Student, UserSession } from '../types';
import { storage } from '../services/storage';
import { detectBtqClassGender, isValidBtqClass } from '../utils/access';
import {
  computeStudentAttendanceSummary,
  formatMonthLabel,
  getCurrentMonthStr,
  getMonthDays,
  shiftMonthStr,
  StudentAttendanceSummary
} from '../utils/attendance';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Edit3,
  Filter,
  Search,
  ShieldAlert
} from 'lucide-react';

interface MonthlyAttendancePanelProps {
  user: UserSession;
  students: Student[];
  absensiList: AbsensiRecord[];
  onOpenPresensiModal: () => void;
  onDataUpdated: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

type AttendanceStatus = 'Hadir' | 'Sakit' | 'Izin' | 'Alpa';

const STATUS_SHORT: Record<AttendanceStatus, string> = {
  Hadir: 'H',
  Sakit: 'S',
  Izin: 'I',
  Alpa: 'A'
};

const STATUS_PRIORITY: Record<AttendanceStatus, number> = {
  Alpa: 4,
  Sakit: 3,
  Izin: 2,
  Hadir: 1
};

export const MonthlyAttendancePanel: React.FC<MonthlyAttendancePanelProps> = ({
  user,
  students,
  absensiList,
  onOpenPresensiModal,
  onDataUpdated,
  onNotify
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthStr);
  const [sesiFilter, setSesiFilter] = useState<'all' | 'btq' | 'tahfidz'>(() =>
    user.role === 'guru_ngaji'
      ? 'btq'
      : user.role === 'guru_tahfidz'
      ? 'tahfidz'
      : 'all'
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterBtqGender, setFilterBtqGender] = useState<'' | 'PI' | 'PA'>('');
  const [filterBTQ, setFilterBTQ] = useState('');
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [quickEditMode, setQuickEditMode] = useState(false);

  const canEditCells = user.role !== 'wali_kelas';
  const effectiveSesi: 'all' | 'btq' | 'tahfidz' =
    user.role === 'guru_ngaji'
      ? 'btq'
      : user.role === 'guru_tahfidz'
      ? 'tahfidz'
      : sesiFilter;

  const days = useMemo(() => getMonthDays(selectedMonth), [selectedMonth]);
  const todayStr = new Date().toISOString().slice(0, 10);

  // Distinct formal classes
  const formalClassOptions = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (s.kelas && s.kelas.trim() && s.kelas !== '-') {
        set.add(s.kelas.trim().toUpperCase());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students]);

  // Distinct BTQ classes grouped by PI / PA
  const groupedBTQ = useMemo(() => {
    const piSet = new Set<string>();
    const paSet = new Set<string>();
    students.forEach(s => {
      if (!isValidBtqClass(s.kelasBTQ)) return;
      const g = detectBtqClassGender(s.kelasBTQ, s.gender);
      if (g === 'PI') piSet.add(s.kelasBTQ.trim());
      else paSet.add(s.kelasBTQ.trim());
    });
    return {
      pi: Array.from(piSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      pa: Array.from(paSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    };
  }, [students]);

  // Lookup map: `${nisn}::${dateStr}` -> { status, tooltip }
  const dailyCellMap = useMemo(() => {
    const map = new Map<string, { status: AttendanceStatus; detail: string }>();
    absensiList.forEach(rec => {
      if (!rec.tanggal.startsWith(selectedMonth)) return;
      if (effectiveSesi !== 'all' && rec.sesi !== effectiveSesi) return;

      const key = `${rec.nisn}::${rec.tanggal}`;
      const existing = map.get(key);
      const sesiLabel = rec.sesi === 'btq' ? 'BTQ' : 'Tahfidz';
      const piece = `${sesiLabel}: ${rec.status}`;

      if (!existing) {
        map.set(key, { status: rec.status, detail: piece });
      } else {
        const chosenStatus =
          STATUS_PRIORITY[rec.status] > STATUS_PRIORITY[existing.status]
            ? rec.status
            : existing.status;
        map.set(key, {
          status: chosenStatus,
          detail: `${existing.detail} | ${piece}`
        });
      }
    });
    return map;
  }, [absensiList, selectedMonth, effectiveSesi]);

  // Base students filtered by session if 'tahfidz' selected by Admin/Wali Kelas
  const sessionScopedStudents = useMemo(() => {
    if (effectiveSesi === 'tahfidz') {
      return students.filter(s => s.isTahfidz);
    }
    if (effectiveSesi === 'btq') {
      return students.filter(s => isValidBtqClass(s.kelasBTQ));
    }
    return students;
  }, [students, effectiveSesi]);

  // Pre-compute attendance summary per student for the selected month & session
  const summaryMap = useMemo(() => {
    const map = new Map<string, StudentAttendanceSummary>();
    sessionScopedStudents.forEach(s => {
      map.set(
        s.nisn,
        computeStudentAttendanceSummary(s, absensiList, {
          monthPrefix: selectedMonth,
          sesi: effectiveSesi
        })
      );
    });
    return map;
  }, [sessionScopedStudents, absensiList, selectedMonth, effectiveSesi]);

  // Flagged students (Sering Tidak Masuk / Sering Alpa) within current scope
  const flaggedStudents = useMemo(() => {
    return sessionScopedStudents
      .map(s => ({ student: s, summary: summaryMap.get(s.nisn)! }))
      .filter(item => item.summary && item.summary.flagLevel !== 'aman')
      .sort((a, b) => {
        if (a.summary.flagLevel !== b.summary.flagLevel) {
          return a.summary.flagLevel === 'kritis' ? -1 : 1;
        }
        if (b.summary.alpa !== a.summary.alpa) return b.summary.alpa - a.summary.alpa;
        return b.summary.totalTidakMasuk - a.summary.totalTidakMasuk;
      });
  }, [sessionScopedStudents, summaryMap]);

  // Final filtered student rows for matrix table
  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return sessionScopedStudents
      .filter(s => {
        if (q) {
          const matchQ =
            s.nama.toLowerCase().includes(q) ||
            s.nisn.toLowerCase().includes(q) ||
            s.kelas.toLowerCase().includes(q) ||
            s.kelasBTQ.toLowerCase().includes(q) ||
            s.pengajar.toLowerCase().includes(q);
          if (!matchQ) return false;
        }
        if (filterClass && s.kelas.trim().toUpperCase() !== filterClass) return false;
        if (filterBtqGender) {
          const g = isValidBtqClass(s.kelasBTQ)
            ? detectBtqClassGender(s.kelasBTQ, s.gender)
            : null;
          if (g !== filterBtqGender) return false;
        }
        if (filterBTQ && s.kelasBTQ.trim().toUpperCase() !== filterBTQ.trim().toUpperCase()) {
          return false;
        }
        if (onlyFlagged) {
          const sum = summaryMap.get(s.nisn);
          if (!sum || sum.flagLevel === 'aman') return false;
        }
        return true;
      })
      .sort((a, b) => {
        const clsCmp = a.kelas.localeCompare(b.kelas, undefined, { numeric: true });
        return clsCmp !== 0 ? clsCmp : a.nama.localeCompare(b.nama);
      });
  }, [
    sessionScopedStudents,
    searchTerm,
    filterClass,
    filterBtqGender,
    filterBTQ,
    onlyFlagged,
    summaryMap
  ]);

  // Month global KPIs across sessionScopedStudents
  const monthKpis = useMemo(() => {
    let totalHadir = 0;
    let totalPertemuan = 0;
    let totalAlpa = 0;
    let totalSakitIzin = 0;

    sessionScopedStudents.forEach(s => {
      const sum = summaryMap.get(s.nisn);
      if (sum) {
        totalHadir += sum.hadir;
        totalPertemuan += sum.totalPertemuan;
        totalAlpa += sum.alpa;
        totalSakitIzin += sum.sakit + sum.izin;
      }
    });

    const avgPct =
      totalPertemuan > 0 ? Math.round((totalHadir / totalPertemuan) * 100) : 100;

    return {
      totalStudents: sessionScopedStudents.length,
      totalHadir,
      totalPertemuan,
      totalAlpa,
      totalSakitIzin,
      avgPct,
      flaggedCount: flaggedStudents.length,
      kritisCount: flaggedStudents.filter(f => f.summary.flagLevel === 'kritis').length
    };
  }, [sessionScopedStudents, summaryMap, flaggedStudents]);

  const handleToggleQuickEdit = () => {
    if (!canEditCells) return;
    const next = !quickEditMode;
    if (next && effectiveSesi === 'all') {
      setSesiFilter('btq');
      onNotify(
        'info',
        'Sesi Diarahkan ke Halaqah BTQ',
        'Mode Edit Cepat aktif untuk sesi BTQ. Pilih sesi Tahfidz di dropdown jika ingin mengedit presensi Tahfidz.'
      );
    }
    setQuickEditMode(next);
  };

  const handleCycleCell = (student: Student, dateStr: string) => {
    if (!quickEditMode || !canEditCells) return;
    const targetSesi: 'btq' | 'tahfidz' =
      effectiveSesi === 'tahfidz' ? 'tahfidz' : 'btq';

    const existing = absensiList.find(
      a => a.nisn === student.nisn && a.tanggal === dateStr && a.sesi === targetSesi
    );
    const order: Array<AttendanceStatus | null> = [
      null,
      'Hadir',
      'Sakit',
      'Izin',
      'Alpa'
    ];
    const currIdx = existing ? order.indexOf(existing.status) : 0;
    const nextStatus = order[(currIdx + 1) % order.length];

    if (nextStatus === null) {
      storage.deleteAttendanceEntry(student.nisn, targetSesi, dateStr);
    } else {
      storage.saveAttendanceBatch([{ nisn: student.nisn, status: nextStatus }], targetSesi, dateStr);
    }
    onDataUpdated();
  };

  const handleExportMonthlyCsv = () => {
    const dayHeaders = days.map(d => `'${d.dayStr}`);
    const headers = [
      'NISN',
      'Nama Siswa',
      'Kelas Formal',
      'Kelas BTQ',
      'Kategori',
      ...dayHeaders,
      'Hadir (H)',
      'Sakit (S)',
      'Izin (I)',
      'Alpa (A)',
      'Total Tidak Masuk',
      'Kehadiran (%)',
      'Tanda Pantauan'
    ];

    const rows = filteredStudents.map(s => {
      const sum = summaryMap.get(s.nisn);
      const btqGender = isValidBtqClass(s.kelasBTQ)
        ? detectBtqClassGender(s.kelasBTQ, s.gender) || '-'
        : '-';
      const dayCells = days.map(d => {
        const c = dailyCellMap.get(`${s.nisn}::${d.dateStr}`);
        return c ? STATUS_SHORT[c.status] : '-';
      });
      const statusText =
        sum?.flagLevel === 'kritis'
          ? `SERING ALPA (${sum.flagReason})`
          : sum?.flagLevel === 'waspada'
          ? `SERING TIDAK MASUK (${sum.flagReason})`
          : 'BAIK';

      return [
        `"${s.nisn}"`,
        `"${s.nama}"`,
        `"${s.kelas}"`,
        `"${s.kelasBTQ}"`,
        `"${btqGender}"`,
        ...dayCells.map(v => `"${v}"`),
        sum?.hadir ?? 0,
        sum?.sakit ?? 0,
        sum?.izin ?? 0,
        sum?.alpa ?? 0,
        sum?.totalTidakMasuk ?? 0,
        sum?.totalPertemuan ? `${sum.persentase}%` : '-',
        `"${statusText}"`
      ];
    });

    const csv =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute(
      'download',
      `absensi_bulanan_${selectedMonth}_${user.role}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onNotify(
      'success',
      'Export Absensi Bulanan Berhasil',
      `Berhasil mengunduh daftar hadir bulan ${formatMonthLabel(selectedMonth)} untuk ${filteredStudents.length} siswa.`
    );
  };

  return (
    <div className="space-y-4">
      {/* Header & Month Controls */}
      <section className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-blue-700" />
            <span>Daftar Absensi Kehadiran 1 Bulan ({formatMonthLabel(selectedMonth)})</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {user.role === 'guru_ngaji'
              ? `Rekap kehadiran bulanan khusus Kelas BTQ binaan ${user.nama}. Siswa dengan ketidakhadiran berulang ditandai otomatis.`
              : user.role === 'guru_tahfidz'
              ? `Rekap kehadiran bulanan khusus Halaqah Tahfidz binaan ${user.nama}.`
              : user.role === 'wali_kelas'
              ? `Pemantauan kehadiran bulanan siswa Kelas ${user.assignedClass || 'Perwalian Anda'}. Siswa yang sering tidak masuk ditandai khusus agar mudah ditindaklanjuti.`
              : 'Rekapitulasi kehadiran seluruh santri selama satu bulan penuh beserta penanda otomatis siswa yang sering tidak masuk.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Month navigation */}
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-1">
            <button
              type="button"
              onClick={() => setSelectedMonth(prev => shiftMonthStr(prev, -1))}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
              title="Bulan Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="month"
              value={selectedMonth}
              onChange={e => e.target.value && setSelectedMonth(e.target.value)}
              className="px-2 py-1 text-xs font-bold text-slate-800 bg-transparent focus:outline-none font-mono"
            />
            <button
              type="button"
              onClick={() => setSelectedMonth(prev => shiftMonthStr(prev, 1))}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
              title="Bulan Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSelectedMonth(getCurrentMonthStr())}
            className="px-2.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl"
          >
            Bulan Ini
          </button>

          {/* Session picker for Admin / Wali Kelas */}
          {(user.role === 'admin' || user.role === 'wali_kelas') && (
            <select
              value={sesiFilter}
              onChange={e => setSesiFilter(e.target.value as 'all' | 'btq' | 'tahfidz')}
              className="px-3 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">Semua Sesi (BTQ &amp; Tahfidz)</option>
              <option value="btq">Khusus Sesi BTQ</option>
              <option value="tahfidz">Khusus Sesi Tahfidz</option>
            </select>
          )}

          {canEditCells && (
            <button
              type="button"
              onClick={handleToggleQuickEdit}
              className={`px-3 py-2 text-xs font-bold rounded-xl border transition-colors flex items-center gap-1.5 ${
                quickEditMode
                  ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-2xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="Aktifkan untuk mengubah status H/S/I/A langsung dengan klik kotak tanggal"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{quickEditMode ? 'Edit Sel Aktif (Klik Kotak)' : 'Mode Edit Sel'}</span>
            </button>
          )}

          {canEditCells && (
            <button
              type="button"
              onClick={onOpenPresensiModal}
              className="px-3.5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>+ Presensi Harian</span>
            </button>
          )}
        </div>
      </section>

      {/* 4 Monthly KPI Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <span className="text-xs font-medium text-slate-500 block">
            Siswa Dipantau ({formatMonthLabel(selectedMonth)})
          </span>
          <span className="text-2xl font-black text-slate-900 font-mono tabular-nums mt-1 block">
            {monthKpis.totalStudents}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            {effectiveSesi === 'btq'
              ? 'Sesi Halaqah BTQ'
              : effectiveSesi === 'tahfidz'
              ? 'Sesi Halaqah Tahfidz'
              : 'Gabungan Sesi BTQ & Tahfidz'}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <span className="text-xs font-medium text-slate-500 block">
            Catatan Hadir Bulan Ini
          </span>
          <span className="text-2xl font-black text-emerald-700 font-mono tabular-nums mt-1 block">
            {monthKpis.totalHadir}
            <span className="text-xs font-normal text-slate-400 ml-1">
              / {monthKpis.totalPertemuan} presensi
            </span>
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            Total ketidakhadiran: {monthKpis.totalAlpa} Alpa · {monthKpis.totalSakitIzin} Sakit/Izin
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <span className="text-xs font-medium text-slate-500 block">
            Rata-rata Kehadiran Bulanan
          </span>
          <span className="text-2xl font-black text-blue-700 font-mono tabular-nums mt-1 block">
            {monthKpis.totalPertemuan > 0 ? `${monthKpis.avgPct}%` : '-'}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            {monthKpis.totalPertemuan > 0
              ? 'Dihitung dari presensi tercatat bulan ini'
              : 'Belum ada presensi tercatat bulan ini'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setOnlyFlagged(prev => !prev)}
          className={`p-4 rounded-xl border text-left transition-all ${
            monthKpis.flaggedCount > 0
              ? onlyFlagged
                ? 'bg-rose-600 border-rose-700 text-white shadow-sm'
                : 'bg-rose-50/80 border-rose-200 hover:border-rose-300'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold ${
                onlyFlagged
                  ? 'text-rose-100'
                  : monthKpis.flaggedCount > 0
                  ? 'text-rose-800'
                  : 'text-slate-500'
              }`}
            >
              Siswa Sering Tidak Masuk
            </span>
            <ShieldAlert
              className={`w-4 h-4 ${
                onlyFlagged
                  ? 'text-amber-300'
                  : monthKpis.flaggedCount > 0
                  ? 'text-rose-600'
                  : 'text-slate-400'
              }`}
            />
          </div>
          <span
            className={`text-2xl font-black font-mono tabular-nums mt-1 block ${
              onlyFlagged
                ? 'text-white'
                : monthKpis.flaggedCount > 0
                ? 'text-rose-700'
                : 'text-slate-900'
            }`}
          >
            {monthKpis.flaggedCount}
          </span>
          <span
            className={`text-[11px] block mt-0.5 ${
              onlyFlagged
                ? 'text-rose-100 font-semibold'
                : monthKpis.flaggedCount > 0
                ? 'text-rose-700 font-semibold'
                : 'text-slate-400'
            }`}
          >
            {monthKpis.flaggedCount > 0
              ? onlyFlagged
                ? 'Filter aktif: Klik untuk tampilkan semua'
                : `${monthKpis.kritisCount} Sering Alpa · Klik untuk saring`
              : 'Tidak ada siswa yang sering absen'}
          </span>
        </button>
      </section>

      {/* Alert Banner for Admin / Wali Kelas / Teachers when students are frequently absent */}
      {flaggedStudents.length > 0 && (
        <section className="bg-rose-50 border border-rose-200 rounded-2xl p-4 space-y-3 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-extrabold text-rose-950">
                  Pantauan Khusus: {flaggedStudents.length} Siswa Sering Tidak Masuk pada {formatMonthLabel(selectedMonth)}
                </h3>
                <p className="text-[11px] text-rose-800 mt-0.5">
                  Siswa ditandai otomatis apabila memiliki <strong>Alpa &ge; 2&times;</strong>, total tidak masuk <strong>&ge; 3&times;</strong> (Sakit/Izin/Alpa), atau tingkat kehadiran di bawah <strong>85%</strong>.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOnlyFlagged(prev => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 border transition-colors ${
                onlyFlagged
                  ? 'bg-white text-rose-800 border-rose-300'
                  : 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600'
              }`}
            >
              {onlyFlagged
                ? 'Tampilkan Semua Siswa'
                : `Saring ${flaggedStudents.length} Siswa Bermasalah`}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {flaggedStudents.slice(0, 9).map(({ student, summary }) => (
              <div
                key={student.id}
                className={`p-2.5 rounded-xl border bg-white flex items-center justify-between gap-2 ${
                  summary.flagLevel === 'kritis' ? 'border-rose-300' : 'border-amber-300'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                        summary.flagLevel === 'kritis' ? 'bg-rose-600' : 'bg-amber-500'
                      }`}
                    />
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {student.nama}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                    Kelas {student.kelas} · {isValidBtqClass(student.kelasBTQ) ? student.kelasBTQ : 'Tahfidz'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                      summary.flagLevel === 'kritis'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {summary.flagLabel}
                  </span>
                  <span className="block text-[10px] font-mono text-slate-600 mt-0.5">
                    A:{summary.alpa} I:{summary.izin} S:{summary.sakit} ({summary.persentase}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
          {flaggedStudents.length > 9 && (
            <p className="text-[11px] text-rose-700 font-semibold">
              + {flaggedStudents.length - 9} siswa lainnya juga ditandai pada tabel di bawah.
            </p>
          )}
        </section>
      )}

      {/* Filter Bar & Monthly Attendance Matrix */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold mr-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Filter:</span>
            </div>

            {formalClassOptions.length > 1 && (
              <select
                value={filterClass}
                onChange={e => setFilterClass(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-medium"
              >
                <option value="">Semua Kelas Formal</option>
                {formalClassOptions.map(c => (
                  <option key={c} value={c}>
                    Kelas {c}
                  </option>
                ))}
              </select>
            )}

            {user.role !== 'guru_tahfidz' && (
              <>
                <select
                  value={filterBtqGender}
                  onChange={e => {
                    setFilterBtqGender(e.target.value as '' | 'PI' | 'PA');
                    setFilterBTQ('');
                  }}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-semibold"
                >
                  <option value="">Semua BTQ (PI &amp; PA)</option>
                  <option value="PI">Putri (PI)</option>
                  <option value="PA">Putra (PA)</option>
                </select>

                <select
                  value={filterBTQ}
                  onChange={e => setFilterBTQ(e.target.value)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-medium"
                >
                  <option value="">Semua Kelas BTQ</option>
                  {groupedBTQ.pi.length > 0 && filterBtqGender !== 'PA' && (
                    <optgroup label="Kelas BTQ Putri (PI)">
                      {groupedBTQ.pi.map(b => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {groupedBTQ.pa.length > 0 && filterBtqGender !== 'PI' && (
                    <optgroup label="Kelas BTQ Putra (PA)">
                      {groupedBTQ.pa.map(b => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </>
            )}

            <button
              type="button"
              onClick={() => setOnlyFlagged(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1 ${
                onlyFlagged
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Sering Tidak Masuk ({flaggedStudents.length})</span>
            </button>

            {(searchTerm || filterClass || filterBtqGender || filterBTQ || onlyFlagged) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setFilterClass('');
                  setFilterBtqGender('');
                  setFilterBTQ('');
                  setOnlyFlagged(false);
                }}
                className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1"
              >
                Reset
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Cari nama atau NISN..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
              />
            </div>

            <button
              type="button"
              onClick={handleExportMonthlyCsv}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg flex items-center gap-1.5 shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span>Export CSV Bulanan</span>
            </button>
          </div>
        </div>

        {/* Scrollable 1-Month Matrix Table */}
        <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
          <table className="w-full text-[11px] text-left border-collapse">
            <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200 sticky top-0 z-20">
              <tr>
                <th className="p-2.5 text-center w-9 sticky left-0 z-30 bg-slate-100 border-r border-slate-200">
                  No
                </th>
                <th className="p-2.5 min-w-[210px] sticky left-9 z-30 bg-slate-100 border-r border-slate-200">
                  Siswa &amp; Tanda Pantauan
                </th>
                {days.map(d => {
                  const isToday = d.dateStr === todayStr;
                  return (
                    <th
                      key={d.dateStr}
                      className={`p-1 text-center min-w-[28px] border-r border-slate-200/70 ${
                        isToday
                          ? 'bg-blue-100 text-blue-900'
                          : d.isSunday
                          ? 'bg-rose-50/70 text-rose-500'
                          : ''
                      }`}
                      title={d.dateStr}
                    >
                      <div className="font-mono text-[10px] leading-none">{d.dayStr}</div>
                      <div className="text-[9px] font-medium opacity-75 mt-0.5">
                        {d.weekdayShort}
                      </div>
                    </th>
                  );
                })}
                <th className="p-2 text-center bg-emerald-50 text-emerald-800 border-l border-slate-200">
                  H
                </th>
                <th className="p-2 text-center bg-blue-50 text-blue-800">S</th>
                <th className="p-2 text-center bg-amber-50 text-amber-800">I</th>
                <th className="p-2 text-center bg-rose-50 text-rose-800">A</th>
                <th className="p-2 text-center bg-slate-100 text-slate-700 whitespace-nowrap">
                  % Hadir
                </th>
                <th className="p-2 text-center bg-slate-100 text-slate-700 whitespace-nowrap min-w-[130px]">
                  Status Pantauan
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student, idx) => {
                  const sum = summaryMap.get(student.nisn) || {
                    nisn: student.nisn,
                    hadir: 0,
                    sakit: 0,
                    izin: 0,
                    alpa: 0,
                    totalTidakMasuk: 0,
                    totalPertemuan: 0,
                    persentase: 100,
                    flagLevel: 'aman' as const,
                    flagLabel: 'Kehadiran Baik',
                    flagReason: ''
                  };
                  const btqGender = isValidBtqClass(student.kelasBTQ)
                    ? detectBtqClassGender(student.kelasBTQ, student.gender)
                    : null;
                  const rowHighlight =
                    sum.flagLevel === 'kritis'
                      ? 'bg-rose-50/50 hover:bg-rose-50'
                      : sum.flagLevel === 'waspada'
                      ? 'bg-amber-50/40 hover:bg-amber-50/70'
                      : 'bg-white hover:bg-slate-50';

                  return (
                    <tr key={student.id} className={`${rowHighlight} transition-colors`}>
                      <td
                        className={`p-2 text-center font-mono text-slate-500 sticky left-0 z-10 border-r border-slate-200 ${
                          sum.flagLevel === 'kritis'
                            ? 'bg-rose-50'
                            : sum.flagLevel === 'waspada'
                            ? 'bg-amber-50'
                            : 'bg-white'
                        }`}
                      >
                        {idx + 1}
                      </td>
                      <td
                        className={`p-2 sticky left-9 z-10 border-r border-slate-200 ${
                          sum.flagLevel === 'kritis'
                            ? 'bg-rose-50'
                            : sum.flagLevel === 'waspada'
                            ? 'bg-amber-50'
                            : 'bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="font-bold text-slate-900 truncate max-w-[165px]">
                            {student.nama}
                          </span>
                          {sum.flagLevel !== 'aman' && (
                            <span
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-extrabold shrink-0 ${
                                sum.flagLevel === 'kritis'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-amber-400 text-slate-950'
                              }`}
                              title={sum.flagReason}
                            >
                              <AlertTriangle className="w-2.5 h-2.5" />
                              {sum.flagLevel === 'kritis' ? 'ALPA' : 'ABSEN'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                          <span className="font-semibold text-slate-700">{student.kelas}</span>
                          <span>·</span>
                          {isValidBtqClass(student.kelasBTQ) ? (
                            <>
                              <span className="truncate max-w-[115px]">{student.kelasBTQ}</span>
                              {btqGender && (
                                <span
                                  className={`px-1 rounded font-bold text-[9px] ${
                                    btqGender === 'PI'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-sky-100 text-sky-800'
                                  }`}
                                >
                                  {btqGender}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-amber-700 font-semibold">
                              {student.halaqahTahfidz || 'Tahfidz'}
                            </span>
                          )}
                        </div>
                      </td>

                      {days.map(d => {
                        const cell = dailyCellMap.get(`${student.nisn}::${d.dateStr}`);
                        const isToday = d.dateStr === todayStr;

                        let pillClass =
                          'text-slate-300 hover:text-slate-500';
                        if (cell?.status === 'Hadir') {
                          pillClass = 'bg-emerald-100 text-emerald-800 font-extrabold';
                        } else if (cell?.status === 'Sakit') {
                          pillClass = 'bg-blue-100 text-blue-800 font-extrabold';
                        } else if (cell?.status === 'Izin') {
                          pillClass = 'bg-amber-100 text-amber-800 font-extrabold';
                        } else if (cell?.status === 'Alpa') {
                          pillClass = 'bg-rose-600 text-white font-extrabold';
                        }

                        return (
                          <td
                            key={d.dateStr}
                            onClick={() => handleCycleCell(student, d.dateStr)}
                            title={
                              quickEditMode && canEditCells
                                ? `${student.nama} (${d.dateStr}): Klik untuk ubah H/S/I/A`
                                : cell
                                ? `${student.nama} (${d.dateStr}) - ${cell.detail}`
                                : `${d.dateStr}: Belum ada presensi`
                            }
                            className={`p-0.5 text-center border-r border-slate-100 ${
                              isToday
                                ? 'bg-blue-50/60'
                                : d.isSunday
                                ? 'bg-slate-50/80'
                                : ''
                            } ${
                              quickEditMode && canEditCells
                                ? 'cursor-pointer hover:ring-1 hover:ring-inset hover:ring-amber-500'
                                : ''
                            }`}
                          >
                            <span
                              className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-mono ${pillClass}`}
                            >
                              {cell ? STATUS_SHORT[cell.status] : '·'}
                            </span>
                          </td>
                        );
                      })}

                      <td className="p-2 text-center font-mono font-bold text-emerald-700 bg-emerald-50/40 border-l border-slate-200">
                        {sum.hadir}
                      </td>
                      <td className="p-2 text-center font-mono font-bold text-blue-700 bg-blue-50/30">
                        {sum.sakit}
                      </td>
                      <td className="p-2 text-center font-mono font-bold text-amber-700 bg-amber-50/30">
                        {sum.izin}
                      </td>
                      <td
                        className={`p-2 text-center font-mono font-extrabold ${
                          sum.alpa > 0
                            ? 'text-rose-700 bg-rose-100/70'
                            : 'text-slate-400 bg-rose-50/20'
                        }`}
                      >
                        {sum.alpa}
                      </td>
                      <td className="p-2 text-center font-mono font-extrabold">
                        {sum.totalPertemuan > 0 ? (
                          <span
                            className={
                              sum.persentase < 75
                                ? 'text-rose-700'
                                : sum.persentase < 85
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }
                          >
                            {sum.persentase}%
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {sum.flagLevel === 'kritis' ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200 font-bold text-[10px]"
                            title={sum.flagReason}
                          >
                            <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                            <span>{sum.flagLabel}</span>
                          </span>
                        ) : sum.flagLevel === 'waspada' ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200 font-bold text-[10px]"
                            title={sum.flagReason}
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>{sum.flagLabel}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>{sum.totalPertemuan > 0 ? 'Baik' : 'Belum Ada Data'}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={days.length + 8}
                    className="p-8 text-center text-slate-400 text-xs"
                  >
                    {onlyFlagged
                      ? `Tidak ada siswa yang ditandai sering tidak masuk pada bulan ${formatMonthLabel(selectedMonth)}.`
                      : 'Tidak ada siswa yang cocok dengan filter atau hak akses Anda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Legend */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-[11px] text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-flex w-4 h-4 items-center justify-center rounded bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px]">
                H
              </span>
              Hadir
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-flex w-4 h-4 items-center justify-center rounded bg-blue-100 text-blue-800 font-bold font-mono text-[10px]">
                S
              </span>
              Sakit
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-flex w-4 h-4 items-center justify-center rounded bg-amber-100 text-amber-800 font-bold font-mono text-[10px]">
                I
              </span>
              Izin
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-flex w-4 h-4 items-center justify-center rounded bg-rose-600 text-white font-bold font-mono text-[10px]">
                A
              </span>
              Alpa (Tanpa Keterangan)
            </span>
          </div>
          <div className="text-slate-500">
            Menampilkan <strong>{filteredStudents.length}</strong> siswa · Tanda otomatis:{' '}
            <strong className="text-rose-700">Alpa &ge;2&times;</strong> atau{' '}
            <strong className="text-amber-700">Absen &ge;3&times; / Hadir &lt;85%</strong>
          </div>
        </div>
      </section>
    </div>
  );
};
