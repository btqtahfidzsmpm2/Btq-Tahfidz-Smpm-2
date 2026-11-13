import React, { useState, useEffect, useMemo } from 'react';
import { Student, UserSession } from '../types';
import { storage } from '../services/storage';
import {
  Save,
  Check,
  Calendar,
  Search,
  BookOpen,
  UserCheck,
  Sparkles,
  Award,
  ChevronRight,
  Filter
} from 'lucide-react';

interface BatchEvaluationTableProps {
  user: UserSession;
  students: Student[];
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
  onDataUpdated: () => void;
}

interface EvaluationRow {
  nisn: string;
  nama: string;
  gender: 'L' | 'P';
  kelas: string;
  kelasBTQ: string;
  isTahfidz: boolean;
  capaianSebelumnya: string;
  tipe: 'Tilawati Remaja' | "Al-Qur'an";
  jilid: string;
  halaman: string;
  nilai: 'A' | 'B' | 'C';
  catatan: string;
  statusPresensi: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa';
  isDirty: boolean;
  isSaving: boolean;
  savedAt: string | null;
}

const COMMON_NOTES = [
  'Lancar & tartil fashahah',
  'Perhatikan panjang mad thabi\'i',
  'Dengung ghunnah diperjelas',
  'Latihan makhraj huruf tebal-tipis',
  'Waqaf & washal tertib',
  'Persiapan tes kenaikan jilid'
];

const TILAWATI_LEVELS = [
  'Jilid 1',
  'Jilid 2',
  'Jilid 3',
  'Jilid 4',
  'Jilid 5',
  'Ghorib & Musykilat',
  'Tajwid Praktis'
];

const JUZ_LEVELS = Array.from({ length: 30 }, (_, i) => `Juz ${i + 1}`);

export const BatchEvaluationTable: React.FC<BatchEvaluationTableProps> = ({
  user,
  students,
  onNotify,
  onDataUpdated
}) => {
  const [tanggal, setTanggal] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterBTQ, setFilterBTQ] = useState<string>('');
  const [filterKelasReguler, setFilterKelasReguler] = useState<string>('');
  const [rows, setRows] = useState<Record<string, EvaluationRow>>({});
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  // Dynamic list of unique BTQ classes from students
  const availableKelasBTQ = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (s.kelasBTQ && s.kelasBTQ.trim() && s.kelasBTQ !== '-') {
        set.add(s.kelasBTQ.trim());
      }
    });
    return Array.from(set).sort();
  }, [students]);

  // Dynamic list of unique regular/formal classes from students
  const availableKelasReguler = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (s.kelas && s.kelas.trim() && s.kelas !== '-') {
        set.add(s.kelas.trim());
      }
    });
    return Array.from(set).sort();
  }, [students]);

  // Parse initial rows from student data
  useEffect(() => {
    const initialMap: Record<string, EvaluationRow> = {};

    students.forEach(s => {
      const last = s.capaianTerakhir;
      let tipe: 'Tilawati Remaja' | "Al-Qur'an" = 'Tilawati Remaja';
      let jilid = 'Jilid 4';

      if (last?.tingkat) {
        if (last.tingkat.includes("Qur'an") || last.tingkat.includes('Juz')) {
          tipe = "Al-Qur'an";
          const matchJuz = last.tingkat.match(/Juz\s*\d+/i);
          jilid = matchJuz ? matchJuz[0] : 'Juz 1';
        } else {
          tipe = 'Tilawati Remaja';
          const matchJilid = last.tingkat.match(/Jilid\s*\d+/i);
          jilid = matchJilid ? matchJilid[0] : 'Jilid 4';
        }
      } else if (s.kelasBTQ.includes("QUR'AN") || s.kelasBTQ.includes('KHATAM')) {
        tipe = "Al-Qur'an";
        jilid = 'Juz 1';
      }

      initialMap[s.nisn] = {
        nisn: s.nisn,
        nama: s.nama,
        gender: s.gender,
        kelas: s.kelas,
        kelasBTQ: s.kelasBTQ,
        isTahfidz: s.isTahfidz,
        capaianSebelumnya: last
          ? `${last.tingkat} · ${last.halamanAyat} (${last.nilai})`
          : 'Belum ada catatan',
        tipe,
        jilid,
        halaman: last?.halamanAyat || 'Halaman 1',
        nilai: last?.nilai || 'A',
        catatan: '',
        statusPresensi: 'Hadir',
        isDirty: false,
        isSaving: false,
        savedAt: null
      };
    });

    setRows(initialMap);
  }, [students]);

  // Filtered rows for viewing based on Kelas BTQ and Kelas Reguler
  const filteredList = useMemo(() => {
    return students.filter(s => {
      const matchSearch =
        s.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.nisn.includes(searchTerm) ||
        s.kelas.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.kelasBTQ.toLowerCase().includes(searchTerm.toLowerCase());

      const matchBTQ = filterBTQ
        ? s.kelasBTQ.trim().toUpperCase() === filterBTQ.trim().toUpperCase()
        : true;

      const matchReguler = filterKelasReguler
        ? s.kelas.trim().toUpperCase() === filterKelasReguler.trim().toUpperCase()
        : true;

      return matchSearch && matchBTQ && matchReguler;
    });
  }, [students, searchTerm, filterBTQ, filterKelasReguler]);

  // Update row in state and trigger real-time save
  const updateRow = (nisn: string, patch: Partial<EvaluationRow>, autoSave: boolean = true) => {
    setRows(prev => {
      const current = prev[nisn];
      if (!current) return prev;

      const updated = {
        ...current,
        ...patch,
        isDirty: true
      };

      if (autoSave) {
        // Save immediately to storage in real-time
        try {
          storage.updateSingleStudentEvaluation(
            {
              nisn: updated.nisn,
              tanggal,
              tipe: updated.tipe,
              jilid: updated.jilid,
              halaman: updated.halaman,
              nilai: updated.nilai,
              catatan: updated.catatan || 'Mutaba\'ah tabel harian',
              statusPresensi: updated.statusPresensi
            },
            user.nama
          );

          updated.isDirty = false;
          updated.savedAt = new Date().toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
        } catch {
          // ignore
        }
      }

      return {
        ...prev,
        [nisn]: updated
      };
    });

    if (autoSave) {
      onDataUpdated();
    }
  };

  // Increment page number helper
  const handleIncrementPage = (nisn: string) => {
    const current = rows[nisn];
    if (!current) return;

    const pageMatch = current.halaman.match(/\d+/);
    if (pageMatch) {
      const nextNum = parseInt(pageMatch[0], 10) + 1;
      const nextText = current.halaman.replace(/\d+/, nextNum.toString());
      updateRow(nisn, { halaman: nextText }, true);
      onNotify('info', `Halaman Naik: ${current.nama}`, `Menjadi ${nextText} (Tersimpan otomatis).`);
    } else {
      const nextText = `${current.halaman} +1`;
      updateRow(nisn, { halaman: nextText }, true);
    }
  };

  // Set all students to Hadir
  const handleSetAllHadir = () => {
    const updated: Record<string, EvaluationRow> = { ...rows };
    const nowTime = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    filteredList.forEach(s => {
      if (updated[s.nisn]) {
        updated[s.nisn] = {
          ...updated[s.nisn],
          statusPresensi: 'Hadir',
          savedAt: nowTime
        };
      }
    });

    setRows(updated);

    // Save batch attendance
    storage.recordAttendanceBatch(
      filteredList.map(s => s.nisn),
      'btq',
      tanggal
    );

    onNotify('success', 'Presensi Diperbarui', `Seluruh ${filteredList.length} santri ditandai HADIR.`);
    onDataUpdated();
  };

  // Set all students to Nilai A
  const handleSetAllNilaiA = () => {
    setRows(prev => {
      const copy = { ...prev };
      filteredList.forEach(s => {
        if (copy[s.nisn]) {
          copy[s.nisn] = {
            ...copy[s.nisn],
            nilai: 'A',
            isDirty: true
          };
        }
      });
      return copy;
    });

    onNotify('info', 'Nilai Diatur', `Nilai ${filteredList.length} santri diatur ke Mumtaz (A). Klik 'Simpan Semua' untuk mengonfirmasi.`);
  };

  // Save all rows to database in one click
  const handleSaveAll = () => {
    setIsBulkSaving(true);
    const toSave = Object.values(rows);

    const payload = toSave.map(r => ({
      nisn: r.nisn,
      tanggal,
      tipe: r.tipe,
      jilid: r.jilid,
      halaman: r.halaman,
      nilai: r.nilai,
      catatan: r.catatan || 'Penilaian lembar mutaba\'ah massal',
      statusPresensi: r.statusPresensi
    }));

    const res = storage.saveBatchBacaanEvaluations(payload, user.nama);

    const nowTime = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    setRows(prev => {
      const copy = { ...prev };
      Object.keys(copy).forEach(k => {
        copy[k] = {
          ...copy[k],
          isDirty: false,
          savedAt: nowTime
        };
      });
      return copy;
    });

    setIsBulkSaving(false);
    onDataUpdated();
    onNotify(
      'success',
      'Penilaian Massal Berhasil Disimpan',
      `Berhasil memperbarui capaian mutaba'ah dan presensi ${res.savedCount} santri secara real-time.`
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-emerald-800" />
              <span>Lembar Penilaian Mutaba'ah Massal (Real-Time)</span>
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
              {filteredList.length} Santri
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Guru ngaji dapat menilai seluruh santri binaan secara langsung dalam satu tabel. Nilai, jilid, halaman, dan kehadiran tersimpan seketika.
          </p>
        </div>

        {/* Global Sheet Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tanggal Sesi */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold text-slate-500 hidden sm:inline">Tanggal:</span>
            <input
              type="date"
              value={tanggal}
              onChange={e => setTanggal(e.target.value)}
              className="bg-transparent font-mono font-bold text-slate-800 focus:outline-none cursor-pointer"
            />
          </div>

          {/* Quick presets */}
          <button
            type="button"
            onClick={handleSetAllHadir}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-colors shadow-2xs flex items-center gap-1"
            title="Tandai seluruh santri di tabel ini sebagai Hadir hari ini"
          >
            <UserCheck className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Set Semua Hadir</span>
          </button>

          <button
            type="button"
            onClick={handleSetAllNilaiA}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-colors shadow-2xs flex items-center gap-1"
            title="Set nilai semua santri menjadi Mumtaz (A)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">Set Nilai A</span>
          </button>

          {/* Big Save Button */}
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isBulkSaving}
            className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isBulkSaving ? 'Menyimpan...' : 'Simpan Semua Penilaian'}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-slate-600 font-bold mr-1">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span>Filter Cepat:</span>
          </div>

          {/* 1. Filter Kelas BTQ */}
          <select
            value={filterBTQ}
            onChange={e => setFilterBTQ(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Semua Kelas BTQ</option>
            {availableKelasBTQ.map(btq => (
              <option key={btq} value={btq}>
                {btq}
              </option>
            ))}
          </select>

          {/* 2. Filter Kelas Reguler */}
          <select
            value={filterKelasReguler}
            onChange={e => setFilterKelasReguler(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Semua Kelas Reguler</option>
            {availableKelasReguler.map(reg => (
              <option key={reg} value={reg}>
                Kelas {reg}
              </option>
            ))}
          </select>

          {(filterBTQ || filterKelasReguler || searchTerm) && (
            <button
              type="button"
              onClick={() => {
                setFilterBTQ('');
                setFilterKelasReguler('');
                setSearchTerm('');
              }}
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2 py-1 transition-colors"
            >
              Reset Filter
            </button>
          )}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Cari santri di tabel ini..."
            className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* The Master Batch Evaluation Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[680px] overflow-y-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200 sticky top-0 z-10 shadow-2xs">
              <tr>
                <th className="p-3 w-10 text-center">No</th>
                <th className="p-3 min-w-[200px]">Nama Santri & NISN</th>
                <th className="p-3 min-w-[110px] text-center">Presensi</th>
                <th className="p-3 min-w-[150px]">Capaian Sebelumnya</th>
                <th className="p-3 min-w-[130px]">Materi / Tipe</th>
                <th className="p-3 min-w-[120px]">Jilid / Juz</th>
                <th className="p-3 min-w-[150px]">Halaman / Ayat Baru</th>
                <th className="p-3 min-w-[110px] text-center">Nilai</th>
                <th className="p-3 min-w-[220px]">Catatan Tajwid & Makhraj</th>
                <th className="p-3 min-w-[100px] text-center whitespace-nowrap">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length > 0 ? (
                filteredList.map((student, index) => {
                  const row = rows[student.nisn];
                  if (!row) return null;

                  return (
                    <tr
                      key={student.nisn}
                      className="hover:bg-emerald-50/20 transition-colors"
                    >
                      {/* No */}
                      <td className="p-3 text-center font-mono text-slate-400 font-semibold">
                        {index + 1}
                      </td>

                      {/* Nama & NISN */}
                      <td className="p-3">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{student.nama}</span>
                          {student.isTahfidz && (
                            <span className="text-[10px] text-amber-700 font-bold" title="Santri Tahfidz">
                              ★
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                          <span>{student.nisn}</span>
                          <span>·</span>
                          <span className="font-sans font-semibold text-slate-600">{student.kelas}</span>
                          <span>·</span>
                          <span className="font-sans text-emerald-800 font-semibold truncate max-w-[120px]">
                            {student.kelasBTQ}
                          </span>
                        </div>
                      </td>

                      {/* Presensi Hari Ini (Kolom ke-3 Setelah Nama) */}
                      <td className="p-3 text-center">
                        <select
                          value={row.statusPresensi}
                          onChange={e =>
                            updateRow(
                              student.nisn,
                              {
                                statusPresensi: e.target.value as 'Hadir' | 'Sakit' | 'Izin' | 'Alpa'
                              },
                              true
                            )
                          }
                          className={`w-full py-1.5 px-2 border rounded-lg text-xs font-bold focus:outline-none cursor-pointer ${
                            row.statusPresensi === 'Hadir'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                              : row.statusPresensi === 'Sakit'
                              ? 'border-blue-300 bg-blue-50 text-blue-800'
                              : row.statusPresensi === 'Izin'
                              ? 'border-amber-300 bg-amber-50 text-amber-800'
                              : 'border-rose-300 bg-rose-50 text-rose-800'
                          }`}
                        >
                          <option value="Hadir">Hadir</option>
                          <option value="Sakit">Sakit</option>
                          <option value="Izin">Izin</option>
                          <option value="Alpa">Alpa</option>
                        </select>
                      </td>

                      {/* Capaian Sebelumnya */}
                      <td className="p-3 text-slate-500 font-mono text-[11px]">
                        <span className="block text-slate-700 font-medium font-sans">
                          {row.capaianSebelumnya}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          Terakhir diperbarui
                        </span>
                      </td>

                      {/* Tipe Materi Dropdown */}
                      <td className="p-3">
                        <select
                          value={row.tipe}
                          onChange={e => {
                            const newTipe = e.target.value as 'Tilawati Remaja' | "Al-Qur'an";
                            updateRow(
                              student.nisn,
                              {
                                tipe: newTipe,
                                jilid: newTipe === 'Tilawati Remaja' ? 'Jilid 4' : 'Juz 1'
                              },
                              true
                            );
                          }}
                          className="w-full p-1.5 border border-slate-300 rounded-lg text-xs bg-white font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="Tilawati Remaja">Tilawati Remaja</option>
                          <option value="Al-Qur'an">Al-Qur'an 30 Juz</option>
                        </select>
                      </td>

                      {/* Jilid / Juz Selector */}
                      <td className="p-3">
                        {row.tipe === 'Tilawati Remaja' ? (
                          <select
                            value={row.jilid}
                            onChange={e => updateRow(student.nisn, { jilid: e.target.value }, true)}
                            className="w-full p-1.5 border border-slate-300 rounded-lg text-xs bg-white font-semibold text-emerald-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            {TILAWATI_LEVELS.map(lvl => (
                              <option key={lvl} value={lvl}>
                                {lvl}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={row.jilid}
                            onChange={e => updateRow(student.nisn, { jilid: e.target.value }, true)}
                            className="w-full p-1.5 border border-slate-300 rounded-lg text-xs bg-white font-semibold text-indigo-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            {JUZ_LEVELS.map(j => (
                              <option key={j} value={j}>
                                {j}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>

                      {/* Halaman / Ayat Baru with +1 Page Quick Button */}
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={row.halaman}
                            onChange={e => updateRow(student.nisn, { halaman: e.target.value }, false)}
                            onBlur={() => updateRow(student.nisn, { halaman: row.halaman }, true)}
                            placeholder="Mis: Halaman 18"
                            className="w-full p-1.5 border border-slate-300 rounded-lg text-xs bg-white font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleIncrementPage(student.nisn)}
                            className="px-2 py-1.5 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-800 border border-slate-300 font-bold rounded-lg text-[11px] shrink-0 transition-colors"
                            title="Naikkan 1 Halaman Otomatis"
                          >
                            +1
                          </button>
                        </div>
                      </td>

                      {/* Nilai (A / B / C buttons) */}
                      <td className="p-3 text-center">
                        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                          {(['A', 'B', 'C'] as const).map(n => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => updateRow(student.nisn, { nilai: n }, true)}
                              className={`px-2 py-1 text-xs font-bold rounded-md transition-all ${
                                row.nilai === n
                                  ? n === 'A'
                                    ? 'bg-emerald-700 text-white shadow-2xs'
                                    : n === 'B'
                                    ? 'bg-blue-600 text-white shadow-2xs'
                                    : 'bg-amber-600 text-white shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                              title={n === 'A' ? 'A (Mumtaz/Lancar)' : n === 'B' ? 'B (Jayyid/Cukup)' : 'C (Maqbul/Mengulang)'}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </td>

                      {/* Catatan Tajwid & Makhraj */}
                      <td className="p-3">
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={row.catatan}
                            onChange={e => updateRow(student.nisn, { catatan: e.target.value }, false)}
                            onBlur={() => updateRow(student.nisn, { catatan: row.catatan }, true)}
                            placeholder="Tulis catatan atau pilih preset..."
                            className="w-full p-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          {/* Quick note presets */}
                          <div className="flex flex-wrap gap-1">
                            {COMMON_NOTES.slice(0, 2).map((note, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => updateRow(student.nisn, { catatan: note }, true)}
                                className="text-[10px] text-slate-500 hover:text-emerald-800 hover:underline bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200"
                              >
                                {note}
                              </button>
                            ))}
                          </div>
                        </div>
                      </td>

                      {/* Real-Time Save Indicator */}
                      <td className="p-3 text-center whitespace-nowrap">
                        {row.savedAt ? (
                          <div className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{row.savedAt}</span>
                          </div>
                        ) : row.isDirty ? (
                          <span className="text-[11px] text-amber-600 font-semibold animate-pulse">
                            Mengetik...
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Siap</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    Tidak ada santri yang sesuai dengan kriteria filter atau pencarian Anda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">
              {filteredList.length} dari {students.length} santri ditampilkan.
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-emerald-800 font-medium">
              Sistem Otomatis Menyimpan Riwayat Bacaan & Kehadiran per Baris
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAll}
              className="px-4 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold transition-colors shadow-2xs flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Simpan Seluruh Baris ({filteredList.length} Santri)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
