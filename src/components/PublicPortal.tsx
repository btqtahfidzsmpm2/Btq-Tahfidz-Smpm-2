import React, { useState } from 'react';
import {
  Student,
  BacaanRecord,
  TahfidzRecord,
  AbsensiRecord,
  PublicStudentReport
} from '../types';
import { cloudDb } from '../services/cloudDb';
import { Search, BookOpen, Award, CheckCircle2, User, Cloud } from 'lucide-react';

interface PublicPortalProps {
  students: Student[];
  bacaanList: BacaanRecord[];
  tahfidzList: TahfidzRecord[];
  absensiList: AbsensiRecord[];
  selectedStudent: Student | null;
  onSelectStudent: (student: Student | null) => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const PublicPortal: React.FC<PublicPortalProps> = ({
  students,
  bacaanList,
  tahfidzList,
  absensiList,
  selectedStudent,
  onSelectStudent,
  onNotify
}) => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'bacaan' | 'tahfidz' | 'absensi'>('bacaan');
  const [isSearchingCloud, setIsSearchingCloud] = useState(false);
  const [cloudPublicReport, setCloudPublicReport] = useState<PublicStudentReport | null>(null);
  const [searchMatches, setSearchMatches] = useState<PublicStudentReport[]>([]);

  const handleSelectMatchedReport = (report: PublicStudentReport) => {
    setCloudPublicReport(report);
    setSearchMatches([]);
    onSelectStudent(report.student);
    onNotify('success', 'Data Siswa Ditemukan', `Menampilkan laporan untuk ${report.student.nama}`);
  };

  const handleSearch = async (customQuery?: string) => {
    const raw = (customQuery ?? query).trim();
    const q = raw.toLowerCase();
    if (!q) {
      onNotify('info', 'Masukkan NISN atau Nama Siswa', 'Silakan ketik nomor NISN atau nama lengkap putra-putri Anda.');
      return;
    }

    setSearchMatches([]);

    // 1. When centralized Supabase DB is active, query live cloud database directly by NISN or Nama
    if (cloudDb.isSupabaseMode()) {
      setIsSearchingCloud(true);
      try {
        const results = await cloudDb.searchPublicStudents(raw);
        const exactNisn = results.find(r => r.student.nisn.toLowerCase() === q);
        if (exactNisn) {
          handleSelectMatchedReport(exactNisn);
          return;
        }
        if (results.length === 1) {
          handleSelectMatchedReport(results[0]);
          return;
        }
        if (results.length > 1) {
          setSearchMatches(results);
          onNotify(
            'info',
            `Ditemukan ${results.length} Siswa`,
            'Silakan pilih nama putra-putri Anda dari daftar hasil di bawah.'
          );
          return;
        }
      } catch {
        // Fallback to synced local cache below if network briefly offline
      } finally {
        setIsSearchingCloud(false);
      }
    }

    // 2. Check synced in-memory / local cache (exact NISN first, then name match)
    const exactLocal = students.find(s => s.nisn.toLowerCase() === q);
    if (exactLocal) {
      setCloudPublicReport(null);
      onSelectStudent(exactLocal);
      onNotify('success', 'Data Siswa Ditemukan', `Menampilkan laporan untuk ${exactLocal.nama}`);
      return;
    }

    const nameMatchesLocal = students.filter(s => s.nama.toLowerCase().includes(q));
    if (nameMatchesLocal.length === 1) {
      setCloudPublicReport(null);
      onSelectStudent(nameMatchesLocal[0]);
      onNotify('success', 'Data Siswa Ditemukan', `Menampilkan laporan untuk ${nameMatchesLocal[0].nama}`);
      return;
    }
    if (nameMatchesLocal.length > 1) {
      const wrapped: PublicStudentReport[] = nameMatchesLocal.slice(0, 10).map(st => ({
        student: st,
        recentBacaan: bacaanList.filter(b => b.nisn === st.nisn),
        recentTahfidz: tahfidzList.filter(t => t.nisn === st.nisn)
      }));
      setSearchMatches(wrapped);
      onNotify(
        'info',
        `Ditemukan ${nameMatchesLocal.length} Siswa`,
        'Silakan pilih nama putra-putri Anda dari daftar hasil di bawah.'
      );
      return;
    }

    // 3. Fallback Cloud lookup by NISN (for Firestore publicReports on fresh browsers)
    if (/^[a-zA-Z0-9_-]{4,40}$/.test(raw)) {
      setIsSearchingCloud(true);
      try {
        const cloudReport = await cloudDb.getPublicReportByNisn(raw);
        if (cloudReport) {
          handleSelectMatchedReport(cloudReport);
          return;
        }
      } finally {
        setIsSearchingCloud(false);
      }
    }

    onNotify(
      'error',
      'Data Tidak Ditemukan',
      `Siswa dengan kata kunci "${raw}" tidak ditemukan. Pastikan NISN atau ejaan nama sudah sesuai.`
    );
  };

  const isUsingCloudReport =
    Boolean(cloudPublicReport && selectedStudent && cloudPublicReport.student.nisn === selectedStudent.nisn);

  const localBacaan = selectedStudent
    ? bacaanList.filter(b => b.nisn === selectedStudent.nisn)
    : [];
  const studentBacaan =
    isUsingCloudReport && cloudPublicReport!.recentBacaan.length > 0
      ? cloudPublicReport!.recentBacaan
      : localBacaan;

  const localTahfidz = selectedStudent
    ? tahfidzList.filter(t => t.nisn === selectedStudent.nisn)
    : [];
  const studentTahfidz =
    isUsingCloudReport && cloudPublicReport!.recentTahfidz.length > 0
      ? cloudPublicReport!.recentTahfidz
      : localTahfidz;

  const studentAbsensi = selectedStudent
    ? absensiList.filter(a => a.nisn === selectedStudent.nisn)
    : [];

  const cloudAbs = isUsingCloudReport ? cloudPublicReport?.absensiSummary : undefined;
  const hadirCount =
    cloudAbs && isUsingCloudReport
      ? cloudAbs.hadir
      : studentAbsensi.filter(a => a.status === 'Hadir').length;
  const sakitCount =
    cloudAbs && isUsingCloudReport
      ? cloudAbs.sakit
      : studentAbsensi.filter(a => a.status === 'Sakit').length;
  const izinCount =
    cloudAbs && isUsingCloudReport
      ? cloudAbs.izin
      : studentAbsensi.filter(a => a.status === 'Izin').length;
  const alpaCount =
    cloudAbs && isUsingCloudReport
      ? cloudAbs.alpa
      : studentAbsensi.filter(a => a.status === 'Alpa').length;
  const totalSesi =
    cloudAbs && isUsingCloudReport
      ? cloudAbs.hadir + cloudAbs.sakit + cloudAbs.izin + cloudAbs.alpa
      : studentAbsensi.length;
  const presensiPersen =
    totalSesi > 0
      ? Math.round((hadirCount / totalSesi) * 100)
      : cloudAbs?.persen ?? selectedStudent?.kehadiranPersen ?? 100;

  return (
    <div className="space-y-6">
      
      {/* Hero Section & Search Bar */}
      <section className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-900 rounded-3xl p-6 sm:p-10 text-white shadow-lg relative overflow-hidden no-print">
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <div className="flex justify-center mb-1">
            <img
              src="/assets/logo_spemda_quran.png"
              alt="Logo SMP Muhammadiyah 2 Surabaya & Fashahah Balaghah Qur'an"
              className="h-16 sm:h-20 w-auto object-contain bg-white/95 px-3 py-1.5 rounded-2xl shadow-md"
            />
          </div>
          <p className="text-amber-300 text-xs font-semibold uppercase tracking-wider">
            Portal Monitoring Wali Murid · SMP Muhammadiyah 2 Surabaya
          </p>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight">
            Pantau Mutaba'ah Tilawati & Tahfidz Ananda
          </h1>
          <p className="text-emerald-100 text-xs sm:text-sm max-w-xl mx-auto leading-relaxed">
            Periksa pencapaian mengaji harian, setoran hafalan Qur'an, kehadiran halaqah, dan hasil tes kenaikan tingkat secara online dengan nomor NISN atau nama siswa.
          </p>

          {/* Search Box */}
          <div className="flex max-w-lg mx-auto pt-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="Ketik NISN atau nama lengkap siswa..."
                className="w-full pl-4 pr-10 py-3 rounded-l-2xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-amber-400 text-xs sm:text-sm bg-white"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-3.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              )}
            </div>
            <button
              onClick={() => handleSearch()}
              disabled={isSearchingCloud}
              className="bg-amber-400 hover:bg-amber-500 disabled:bg-amber-300 text-slate-900 font-bold px-6 rounded-r-2xl text-xs sm:text-sm transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Search className="w-4 h-4" />
              <span>{isSearchingCloud ? 'Mencari...' : 'Cari'}</span>
            </button>
          </div>

          {/* Multi-match picker when searching by Name */}
          {searchMatches.length > 1 && (
            <div className="max-w-lg mx-auto bg-white/95 text-slate-800 rounded-2xl p-3 shadow-lg text-left space-y-1.5">
              <p className="text-[11px] font-bold text-emerald-900 px-1">
                Pilih siswa yang sesuai ({searchMatches.length} hasil):
              </p>
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                {searchMatches.map(item => (
                  <button
                    key={item.student.nisn}
                    type="button"
                    onClick={() => handleSelectMatchedReport(item)}
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 rounded-xl transition-colors flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-xs font-extrabold text-slate-900">{item.student.nama}</p>
                      <p className="text-[11px] text-slate-500">
                        Kelas {item.student.kelas} · {item.student.kelasBTQ}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono font-bold text-emerald-800 shrink-0">
                      {item.student.nisn}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Dynamic Student Database Status */}
          <div className="pt-2 text-xs text-emerald-200 flex flex-wrap items-center justify-center gap-2">
            {students.length > 0 ? (
              <span>
                Tersedia <strong className="text-amber-300">{students.length}</strong> data siswa aktif — masukkan NISN atau nama lengkap putra-putri Anda.
              </span>
            ) : (
              <span className="text-emerald-100/90 inline-flex items-center gap-1.5 flex-wrap justify-center">
                <Cloud className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>
                  {cloudDb.isSupabaseMode()
                    ? 'Terhubung ke Cloud Database — masukkan NISN atau nama lengkap siswa untuk melihat mutaba\'ah terkini.'
                    : 'Ketik tepat 10 digit NISN untuk mengambil laporan Cloud siswa, atau klik Login Petugas / Cloud untuk sinkronisasi penuh.'}
                </span>
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Result Card: Mutaba'ah Siswa (Tampilan Online Wali Murid) */}
      {selectedStudent ? (
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8 space-y-6">
          <div className="border-b border-slate-200 pb-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xl shrink-0">
                  <User className="w-7 h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                      {selectedStudent.nama}
                    </h2>
                    <span className="text-xs text-emerald-700 font-semibold">
                      · {selectedStudent.kelasBTQ}
                    </span>
                    {selectedStudent.isTahfidz && (
                      <span className="text-xs text-amber-700 font-semibold">
                        · Program Tahfidz
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>NISN: <strong className="font-mono text-slate-800">{selectedStudent.nisn}</strong></span>
                    <span aria-hidden="true">·</span>
                    <span>Kelas Formal: <strong className="text-slate-800">{selectedStudent.kelas}</strong></span>
                    <span aria-hidden="true">·</span>
                    <span>Ruangan: <strong className="text-slate-800">{selectedStudent.ruangan}</strong></span>
                    <span aria-hidden="true">·</span>
                    <span>Wali Kelas: <strong className="text-slate-800">{selectedStudent.waliKelas}</strong></span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 4 Summary Stat Cards (Zero-pill discipline, clean metrics with tabular numerals) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold block">Capaian Terakhir</span>
              <span className="text-base font-extrabold text-emerald-800 mt-1 block">
                {selectedStudent.capaianTerakhir.tingkat}
              </span>
              <span className="text-xs text-slate-500 block mt-0.5">
                {selectedStudent.capaianTerakhir.halamanAyat} · Nilai: {selectedStudent.capaianTerakhir.nilai}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold block">Setoran Tahfidz</span>
              <span className="text-base font-extrabold text-amber-700 mt-1 block">
                {selectedStudent.isTahfidz
                  ? selectedStudent.totalHafalan || '1 Juz'
                  : 'Reguler'}
              </span>
              <span className="text-xs text-slate-500 block mt-0.5 truncate">
                {selectedStudent.isTahfidz
                  ? `Terakhir: ${selectedStudent.hafalanTerakhir || '-'}`
                  : 'Fokus Tilawati Remaja'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold block">Presensi Kehadiran</span>
              <span className="text-base font-extrabold text-blue-700 mt-1 block font-mono tabular-nums">
                {presensiPersen}%
              </span>
              <span className="text-xs text-slate-500 block mt-0.5">
                {hadirCount ? `${hadirCount} sesi hadir tercatat` : 'Hadir penuh di halaqah'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-xs text-slate-500 font-semibold block">Tes Kenaikan Tingkat</span>
              <span className="text-base font-extrabold text-purple-800 mt-1 block">
                {selectedStudent.ujian.natijah}
              </span>
              <span className="text-xs text-slate-500 block mt-0.5 font-mono tabular-nums">
                Nilai: {selectedStudent.ujian.nilai} ({selectedStudent.ujian.predikat})
              </span>
            </div>

          </div>

          {/* Evaluasi Penguji & Catatan Makhraj */}
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80">
            <p className="text-xs font-bold text-amber-900 uppercase tracking-wide">
              Catatan Evaluasi Tajwid & Makhraj Ustadz/ah:
            </p>
            <p className="text-xs text-slate-700 mt-1 leading-relaxed">
              {selectedStudent.ujian.keterangan ||
                'Alhamdulillah bacaan baik dan konsisten mengikuti kegiatan halaqah mutaba\'ah setiap hari.'}
            </p>
          </div>

          {/* Tabular Navigation for History (Interactive tabs) */}
          <div className="space-y-4">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg no-print max-w-md">
              <button
                onClick={() => setActiveTab('bacaan')}
                className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md transition-colors ${
                  activeTab === 'bacaan'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Riwayat Tilawati / Qur'an ({studentBacaan.length})
              </button>
              
              {selectedStudent.isTahfidz && (
                <button
                  onClick={() => setActiveTab('tahfidz')}
                  className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md transition-colors ${
                    activeTab === 'tahfidz'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Setoran Tahfidz ({studentTahfidz.length})
                </button>
              )}

              <button
                onClick={() => setActiveTab('absensi')}
                className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-md transition-colors ${
                  activeTab === 'absensi'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Presensi ({studentAbsensi.length > 0 ? studentAbsensi.length : `${presensiPersen}%`})
              </button>
            </div>

            {/* TAB CONTENT 1: BACAAN TILAWATI / QUR'AN */}
            {activeTab === 'bacaan' && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-700" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Catatan Capaian Harian Tilawati & Qur'an
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Pengajar: {selectedStudent.pengajar}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-3 font-semibold">Tanggal</th>
                        <th className="p-3 font-semibold">Tipe Kitab</th>
                        <th className="p-3 font-semibold">Jilid / Juz</th>
                        <th className="p-3 font-semibold">Halaman / Ayat</th>
                        <th className="p-3 font-semibold text-center">Predikat</th>
                        <th className="p-3 font-semibold">Catatan Tajwid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {studentBacaan.length > 0 ? (
                        studentBacaan.map(b => (
                          <tr key={b.id} className="hover:bg-slate-50/50">
                            <td className="p-3 text-slate-600 font-mono">{b.tanggal}</td>
                            <td className="p-3 font-medium text-slate-800">{b.tipe}</td>
                            <td className="p-3 font-semibold text-emerald-800">{b.jilid}</td>
                            <td className="p-3 text-slate-700">{b.halaman}</td>
                            <td className="p-3 text-center">
                              <span className="font-bold text-emerald-700 font-mono">
                                {b.nilai}
                              </span>
                            </td>
                            <td className="p-3 text-slate-600 italic">
                              {b.catatan || 'Bacaan lancar'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400">
                            Belum ada riwayat bacaan tambahan untuk siswa ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: SETORAN TAHFIDZ */}
            {activeTab === 'tahfidz' && selectedStudent.isTahfidz && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-600" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Mutaba'ah Setoran Hafalan Siswa Tahfidz
                      {selectedStudent.halaqahTahfidz ? ` · ${selectedStudent.halaqahTahfidz}` : ''}
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Target: {selectedStudent.targetJuz || 'Juz 30'}
                    {selectedStudent.pembimbingTahfidz ? ` · Pembimbing: ${selectedStudent.pembimbingTahfidz}` : ''}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-3 font-semibold">Tanggal</th>
                        <th className="p-3 font-semibold">Surat Al-Qur'an</th>
                        <th className="p-3 font-semibold">Rentang Ayat</th>
                        <th className="p-3 font-semibold">Kategori</th>
                        <th className="p-3 font-semibold">Kelancaran</th>
                        <th className="p-3 font-semibold">Penguji</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {studentTahfidz.length > 0 ? (
                        studentTahfidz.map(t => (
                          <tr key={t.id} className="hover:bg-slate-50/50">
                            <td className="p-3 text-slate-600 font-mono">{t.tanggal}</td>
                            <td className="p-3 font-bold text-slate-900">{t.surat}</td>
                            <td className="p-3 text-slate-700">{t.ayat}</td>
                            <td className="p-3 font-medium text-amber-800">{t.status}</td>
                            <td className="p-3 text-slate-700">{t.kelancaran}</td>
                            <td className="p-3 text-slate-600">{t.guru}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400">
                            Belum ada riwayat setoran tahfidz untuk siswa ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT 3: PRESENSI */}
            {activeTab === 'absensi' && (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Rekap Kehadiran Halaqah BTQ & Tahfidz
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Ruangan: {selectedStudent.ruangan}
                  </span>
                </div>

                <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/50 border-b border-slate-200 text-xs">
                  <div>
                    <span className="text-slate-500">Hadir:</span>{' '}
                    <strong className="text-emerald-700 font-mono">
                      {studentAbsensi.length > 0 ? `${hadirCount} Sesi` : `${presensiPersen}%`}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Sakit:</span>{' '}
                    <strong className="text-blue-700 font-mono">
                      {sakitCount} Sesi
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Izin:</span>{' '}
                    <strong className="text-amber-700 font-mono">
                      {izinCount} Sesi
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Alpa:</span>{' '}
                    <strong className="text-rose-700 font-mono">
                      {alpaCount} Sesi
                    </strong>
                  </div>
                </div>

                <div className="p-4 text-xs text-slate-600">
                  <p className="leading-relaxed">
                    Siswa terdaftar aktif pada jadwal halaqah BTQ dan Tahfidz di {selectedStudent.ruangan} di bawah bimbingan {selectedStudent.pengajar}. Tingkat kehadiran tercatat {presensiPersen}%.
                  </p>
                </div>
              </div>
            )}
          </div>

        </section>
      ) : (
        /* Empty State / Search Guide */
        <div className="p-8 border border-dashed border-slate-300 rounded-2xl text-center space-y-3 bg-white">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            Masukkan Nomor NISN atau Nama Siswa
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Gunakan kotak pencarian di atas untuk memantau capaian Tilawati Remaja, hafalan Tahfidz, dan status ujian kenaikan tingkat putra-putri Anda.
          </p>
        </div>
      )}

    </div>
  );
};
