import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Student, UserSession, BacaanRecord, AbsensiRecord } from '../types';
import { storage } from '../services/storage';
import { cloudDb } from '../services/cloudDb';
import { detectBtqClassGender, isValidBtqClass } from '../utils/access';
import {
  Save,
  Check,
  Calendar,
  Search,
  BookOpen,
  UserCheck,
  Sparkles,
  Filter,
  AlertCircle,
  Zap
} from 'lucide-react';

interface BatchEvaluationTableProps {
  user: UserSession;
  students: Student[];
  bacaanList?: BacaanRecord[];
  absensiList?: AbsensiRecord[];
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
  "Perhatikan panjang mad thabi'i",
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

function buildDefaultRow(
  s: Student,
  existingBacaan?: BacaanRecord,
  existingAbsensi?: AbsensiRecord
): EvaluationRow {
  const last = s.capaianTerakhir;
  let tipe: 'Tilawati Remaja' | "Al-Qur'an" = 'Tilawati Remaja';
  let jilid = 'Jilid 4';

  if (existingBacaan) {
    tipe = existingBacaan.tipe;
    jilid = existingBacaan.jilid || (tipe === "Al-Qur'an" ? 'Juz 1' : 'Jilid 4');
  } else if (last?.tingkat) {
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

  return {
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
    halaman: existingBacaan?.halaman || last?.halamanAyat || 'Halaman 1',
    nilai: existingBacaan?.nilai || last?.nilai || 'A',
    catatan: existingBacaan?.catatan || '',
    statusPresensi: existingAbsensi?.status || 'Hadir',
    isDirty: false,
    isSaving: false,
    savedAt: existingBacaan ? 'Tersimpan' : null
  };
}

export const BatchEvaluationTable: React.FC<BatchEvaluationTableProps> = ({
  user,
  students,
  bacaanList = [],
  absensiList = [],
  onNotify,
  onDataUpdated
}) => {
  const [tanggal, setTanggal] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterBtqGender, setFilterBtqGender] = useState<'' | 'PI' | 'PA'>('');
  const [filterBTQ, setFilterBTQ] = useState<string>('');
  const [filterKelasReguler, setFilterKelasReguler] = useState<string>('');
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(true);
  const [rows, setRows] = useState<Record<string, EvaluationRow>>({});
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  const prevTanggalRef = useRef<string>(tanggal);

  // Dynamic list of unique BTQ classes grouped into Putri (PI) and Putra (PA)
  const groupedKelasBTQ = useMemo(() => {
    const piSet = new Set<string>();
    const paSet = new Set<string>();
    students.forEach(s => {
      if (!isValidBtqClass(s.kelasBTQ)) return;
      const g = detectBtqClassGender(s.kelasBTQ, s.gender);
      if (g === 'PI') piSet.add(s.kelasBTQ.trim());
      else paSet.add(s.kelasBTQ.trim());
    });
    return {
      pi: Array.from(piSet).sort(),
      pa: Array.from(paSet).sort()
    };
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

  // Sync student data & daily records without wiping unsaved edits or savedAt timestamps
  useEffect(() => {
    const tanggalChanged = prevTanggalRef.current !== tanggal;
    prevTanggalRef.current = tanggal;

    const bacaanByNisn = new Map<string, BacaanRecord>();
    bacaanList.forEach(b => {
      if (b.tanggal === tanggal && !bacaanByNisn.has(b.nisn)) {
        bacaanByNisn.set(b.nisn, b);
      }
    });

    const absensiByNisn = new Map<string, AbsensiRecord>();
    absensiList.forEach(a => {
      if (a.tanggal === tanggal && a.sesi === 'btq' && !absensiByNisn.has(a.nisn)) {
        absensiByNisn.set(a.nisn, a);
      }
    });

    setRows(prev => {
      const nextMap: Record<string, EvaluationRow> = {};

      students.forEach(s => {
        const existingRow = prev[s.nisn];
        const existingBacaan = bacaanByNisn.get(s.nisn);
        const existingAbs = absensiByNisn.get(s.nisn);

        if (existingRow && !tanggalChanged) {
          const freshCapaian = s.capaianTerakhir
            ? `${s.capaianTerakhir.tingkat} · ${s.capaianTerakhir.halamanAyat} (${s.capaianTerakhir.nilai})`
            : 'Belum ada catatan';

          nextMap[s.nisn] = {
            ...existingRow,
            nama: s.nama,
            gender: s.gender,
            kelas: s.kelas,
            kelasBTQ: s.kelasBTQ,
            isTahfidz: s.isTahfidz,
            capaianSebelumnya: freshCapaian
          };
        } else {
          nextMap[s.nisn] = buildDefaultRow(s, existingBacaan, existingAbs);
        }
      });

      return nextMap;
    });
  }, [students, tanggal, bacaanList, absensiList]);

  // Filtered rows for viewing based on Putri (PI)/Putra (PA), Kelas BTQ, and Kelas Reguler
  const filteredList = useMemo(() => {
    return students.filter(s => {
      const matchSearch =
        s.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.nisn.includes(searchTerm) ||
        s.kelas.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.kelasBTQ.toLowerCase().includes(searchTerm.toLowerCase());

      const btqGender = detectBtqClassGender(s.kelasBTQ, s.gender);
      const matchBtqGender = filterBtqGender ? btqGender === filterBtqGender : true;

      const matchBTQ = filterBTQ
        ? s.kelasBTQ.trim().toUpperCase() === filterBTQ.trim().toUpperCase()
        : true;

      const matchReguler = filterKelasReguler
        ? s.kelas.trim().toUpperCase() === filterKelasReguler.trim().toUpperCase()
        : true;

      return matchSearch && matchBtqGender && matchBTQ && matchReguler;
    });
  }, [students, searchTerm, filterBtqGender, filterBTQ, filterKelasReguler]);

  // Count unsaved changes
  const unsavedTotalCount = useMemo(() => {
    return (Object.values(rows) as EvaluationRow[]).filter(r => r.isDirty).length;
  }, [rows]);

  // Save a single row immediately (manual Simpan click, Enter key, or auto-save trigger)
  const persistSingleRow = (rowToSave: EvaluationRow, showToast: boolean = false) => {
    const nowTime = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const evalRes = storage.updateSingleStudentEvaluation(
      {
        nisn: rowToSave.nisn,
        tanggal,
        tipe: rowToSave.tipe,
        jilid: rowToSave.jilid,
        halaman: rowToSave.halaman.trim() || 'Halaman 1',
        nilai: rowToSave.nilai,
        catatan: rowToSave.catatan.trim() || "Mutaba'ah tabel harian",
        statusPresensi: rowToSave.statusPresensi
      },
      user.nama
    );

    if (cloudDb.isCloudAuthenticated()) {
      void cloudDb
        .saveBatchBacaanEvaluationsCloud({
          bacaanRecords: evalRes.savedBacaan,
          absensiRecords: evalRes.savedAbsensi,
          updatedStudents: evalRes.updatedStudents,
          allBacaan: storage.getBacaan(),
          allTahfidz: storage.getTahfidz(),
          allAbsensi: storage.getAbsensi()
        })
        .catch(err => {
          onNotify(
            'error',
            'Gagal Sinkronisasi Cloud',
            err instanceof Error ? err.message : 'Penilaian baris belum tersinkron ke Cloud.'
          );
        });
    }

    setRows(prev => {
      const current = prev[rowToSave.nisn];
      if (!current) return prev;
      return {
        ...prev,
        [rowToSave.nisn]: {
          ...current,
          ...rowToSave,
          isDirty: false,
          isSaving: false,
          savedAt: nowTime
        }
      };
    });

    onDataUpdated();

    if (showToast) {
      onNotify(
        'success',
        `Penilaian Disimpan: ${rowToSave.nama}`,
        `${rowToSave.tipe} ${rowToSave.jilid} · ${rowToSave.halaman} · Nilai ${rowToSave.nilai} · Presensi ${rowToSave.statusPresensi}.`
      );
    }
  };

  // Explicit Save button handler per row
  const handleSaveRow = (nisn: string) => {
    const row = rows[nisn];
    if (!row) return;
    persistSingleRow(row, true);
  };

  // Update row in state and optionally trigger real-time save
  const updateRow = (
    nisn: string,
    patch: Partial<EvaluationRow>,
    canAutoSave: boolean = true
  ) => {
    const current = rows[nisn];
    if (!current) return;

    const updated: EvaluationRow = {
      ...current,
      ...patch,
      isDirty: true
    };

    const shouldSaveNow = canAutoSave && autoSaveEnabled;

    if (shouldSaveNow) {
      persistSingleRow(updated, false);
    } else {
      setRows(prev => ({
        ...prev,
        [nisn]: updated
      }));
    }
  };

  // Increment page number helper
  const handleIncrementPage = (nisn: string) => {
    const current = rows[nisn];
    if (!current) return;

    const pageMatch = current.halaman.match(/\d+/);
    const nextText = pageMatch
      ? current.halaman.replace(/\d+/, (parseInt(pageMatch[0], 10) + 1).toString())
      : `${current.halaman} +1`;

    if (autoSaveEnabled) {
      persistSingleRow({ ...current, halaman: nextText }, false);
      onNotify('info', `Halaman Naik: ${current.nama}`, `Menjadi ${nextText} (Tersimpan).`);
    } else {
      updateRow(nisn, { halaman: nextText }, false);
    }
  };

  // Set all displayed students to Hadir
  const handleSetAllHadir = () => {
    const nowTime = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    setRows(prev => {
      const updated = { ...prev };
      filteredList.forEach(s => {
        if (updated[s.nisn]) {
          updated[s.nisn] = {
            ...updated[s.nisn],
            statusPresensi: 'Hadir',
            isDirty: autoSaveEnabled ? updated[s.nisn].isDirty : true,
            savedAt: autoSaveEnabled ? nowTime : updated[s.nisn].savedAt
          };
        }
      });
      return updated;
    });

    if (autoSaveEnabled) {
      const payload = filteredList
        .map(s => rows[s.nisn])
        .filter((r): r is EvaluationRow => Boolean(r))
        .map(r => ({
          nisn: r.nisn,
          tanggal,
          tipe: r.tipe,
          jilid: r.jilid,
          halaman: r.halaman.trim() || 'Halaman 1',
          nilai: r.nilai,
          catatan: r.catatan.trim() || "Mutaba'ah tabel harian",
          statusPresensi: 'Hadir' as const
        }));
      const batchRes = storage.saveBatchBacaanEvaluations(payload, user.nama);
      if (cloudDb.isCloudAuthenticated()) {
        void cloudDb
          .saveBatchBacaanEvaluationsCloud({
            bacaanRecords: batchRes.savedBacaan,
            absensiRecords: batchRes.savedAbsensi,
            updatedStudents: batchRes.updatedStudents,
            allBacaan: storage.getBacaan(),
            allTahfidz: storage.getTahfidz(),
            allAbsensi: storage.getAbsensi()
          })
          .catch(err => {
            onNotify(
              'error',
              'Gagal Sinkronisasi Cloud',
              err instanceof Error ? err.message : 'Presensi hadir massal belum tersinkron ke Cloud.'
            );
          });
      }
      onDataUpdated();
      onNotify(
        'success',
        'Presensi Disimpan',
        `Seluruh ${filteredList.length} santri ditandai HADIR & tersimpan.`
      );
    } else {
      onNotify(
        'info',
        'Presensi Diatur Hadir',
        `${filteredList.length} santri diatur HADIR. Klik "Simpan Semua" untuk menyimpan.`
      );
    }
  };

  // Set all displayed students to Nilai A
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

    onNotify(
      'info',
      'Nilai Diatur ke Mumtaz (A)',
      `${filteredList.length} santri diatur ke A. Klik "Simpan Perubahan" untuk menyimpan ke database.`
    );
  };

  // Save displayed rows & any dirty rows in one click
  const handleSaveAll = async () => {
    if (isBulkSaving) return;
    setIsBulkSaving(true);

    const targetMap = new Map<string, EvaluationRow>();
    // Include all displayed rows
    filteredList.forEach(s => {
      if (rows[s.nisn]) {
        targetMap.set(s.nisn, rows[s.nisn]);
      }
    });
    // Also include any dirty rows outside active filter so no edits are lost
    (Object.values(rows) as EvaluationRow[]).forEach(r => {
      if (r.isDirty) {
        targetMap.set(r.nisn, r);
      }
    });

    const toSave = Array.from(targetMap.values());
    if (toSave.length === 0) {
      setIsBulkSaving(false);
      onNotify('info', 'Tidak Ada Data', 'Tidak ada baris santri untuk disimpan.');
      return;
    }

    const payload = toSave.map(r => ({
      nisn: r.nisn,
      tanggal,
      tipe: r.tipe,
      jilid: r.jilid,
      halaman: r.halaman.trim() || 'Halaman 1',
      nilai: r.nilai,
      catatan: r.catatan.trim() || "Penilaian lembar mutaba'ah massal",
      statusPresensi: r.statusPresensi
    }));

    const res = storage.saveBatchBacaanEvaluations(payload, user.nama);

    if (cloudDb.isCloudAuthenticated()) {
      try {
        await cloudDb.saveBatchBacaanEvaluationsCloud({
          bacaanRecords: res.savedBacaan,
          absensiRecords: res.savedAbsensi,
          updatedStudents: res.updatedStudents,
          allBacaan: storage.getBacaan(),
          allTahfidz: storage.getTahfidz(),
          allAbsensi: storage.getAbsensi()
        });
      } catch (err) {
        onNotify(
          'error',
          'Gagal Sinkronisasi Cloud',
          err instanceof Error ? err.message : 'Penilaian massal belum tersinkron ke Cloud.'
        );
      }
    }

    const nowTime = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    setRows(prev => {
      const copy = { ...prev };
      toSave.forEach(r => {
        if (copy[r.nisn]) {
          copy[r.nisn] = {
            ...copy[r.nisn],
            isDirty: false,
            isSaving: false,
            savedAt: nowTime
          };
        }
      });
      return copy;
    });

    setIsBulkSaving(false);
    onDataUpdated();
    onNotify(
      'success',
      'Penilaian Massal Berhasil Disimpan',
      `Berhasil menyimpan capaian mutaba'ah dan presensi ${res.savedCount} santri untuk tanggal ${tanggal}.`
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-black text-slate-900 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-emerald-800" />
              <span>Lembar Penilaian Mutaba'ah Massal</span>
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold">
              {filteredList.length} Santri
            </span>
            {unsavedTotalCount > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-bold flex items-center gap-1 border border-amber-300">
                <AlertCircle className="w-3 h-3 text-amber-700" />
                <span>{unsavedTotalCount} Belum Disimpan</span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            {user.role === 'guru_ngaji'
              ? `Khusus menilai & mengabsen kelas BTQ binaan Anda (${user.assignedGroup || 'Kelas BTQ Anda'}). `
              : 'Nilai seluruh santri BTQ (Putri PI & Putra PA) langsung dalam tabel. '}
            Klik <strong>Simpan</strong> di tiap baris atau <strong>Simpan Semua Penilaian</strong> untuk menyimpan permanen.
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

          {/* Toggle Auto-Save vs Manual Save */}
          <button
            type="button"
            onClick={() => {
              const next = !autoSaveEnabled;
              setAutoSaveEnabled(next);
              onNotify(
                'info',
                next ? 'Simpan Otomatis Aktif' : 'Mode Simpan Manual Aktif',
                next
                  ? 'Perubahan pilihan langsung disimpan otomatis ke sistem.'
                  : 'Edit semua kolom terlebih dahulu lalu klik Simpan per baris atau Simpan Semua.'
              );
            }}
            className={`px-3 py-1.5 border rounded-xl text-xs font-bold transition-colors shadow-2xs flex items-center gap-1.5 ${
              autoSaveEnabled
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                : 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
            }`}
            title="Atur apakah perubahan dropdown langsung tersimpan atau menunggu klik tombol Simpan"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>{autoSaveEnabled ? 'Auto-Simpan: Aktif' : 'Simpan: Manual'}</span>
          </button>

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
            disabled={isBulkSaving || filteredList.length === 0}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
              unsavedTotalCount > 0
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                : 'bg-emerald-800 hover:bg-emerald-900 text-white'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {isBulkSaving
                ? 'Menyimpan...'
                : unsavedTotalCount > 0
                ? `Simpan Perubahan (${unsavedTotalCount})`
                : 'Simpan Semua Penilaian'}
            </span>
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

          {/* 0. Filter Kategori BTQ Putri (PI) vs Putra (PA) */}
          <select
            value={filterBtqGender}
            onChange={e => {
              setFilterBtqGender(e.target.value as '' | 'PI' | 'PA');
              setFilterBTQ('');
            }}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Semua BTQ (PI &amp; PA)</option>
            <option value="PI">Kelas BTQ Putri (PI)</option>
            <option value="PA">Kelas BTQ Putra (PA)</option>
          </select>

          {/* 1. Filter Kelas BTQ (Dikelompokkan PI vs PA) */}
          <select
            value={filterBTQ}
            onChange={e => setFilterBTQ(e.target.value)}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Semua Kelas BTQ</option>
            {groupedKelasBTQ.pi.length > 0 && filterBtqGender !== 'PA' && (
              <optgroup label="Kelas BTQ Putri (PI)">
                {groupedKelasBTQ.pi.map(btq => (
                  <option key={btq} value={btq}>
                    {btq}
                  </option>
                ))}
              </optgroup>
            )}
            {groupedKelasBTQ.pa.length > 0 && filterBtqGender !== 'PI' && (
              <optgroup label="Kelas BTQ Putra (PA)">
                {groupedKelasBTQ.pa.map(btq => (
                  <option key={btq} value={btq}>
                    {btq}
                  </option>
                ))}
              </optgroup>
            )}
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

          {(filterBtqGender || filterBTQ || filterKelasReguler || searchTerm) && (
            <button
              type="button"
              onClick={() => {
                setFilterBtqGender('');
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
                <th className="p-3 min-w-[150px] text-center whitespace-nowrap">Simpan & Status</th>
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
                      className={`transition-colors ${
                        row.isDirty
                          ? 'bg-amber-50/40 hover:bg-amber-50/70'
                          : 'hover:bg-emerald-50/20'
                      }`}
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
                        <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span>{student.nisn}</span>
                          <span>·</span>
                          <span className="font-sans font-semibold text-slate-600">{student.kelas}</span>
                          <span>·</span>
                          <span className="font-sans text-emerald-800 font-semibold truncate max-w-[130px]">
                            {student.kelasBTQ}
                          </span>
                          {(() => {
                            const g = detectBtqClassGender(student.kelasBTQ, student.gender);
                            return g ? (
                              <span
                                className={`font-sans text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                  g === 'PI'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-sky-100 text-sky-800'
                                }`}
                              >
                                {g === 'PI' ? 'PI (Putri)' : 'PA (Putra)'}
                              </span>
                            ) : null;
                          })()}
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
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveRow(student.nisn);
                              }
                            }}
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
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveRow(student.nisn);
                              }
                            }}
                            placeholder="Tulis catatan lalu klik Simpan..."
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

                      {/* Per-Row Simpan Action & Status */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleSaveRow(student.nisn)}
                            disabled={row.isSaving}
                            className={`w-full px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center gap-1 cursor-pointer ${
                              row.isDirty
                                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-2xs'
                                : 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs'
                            }`}
                            title="Simpan penilaian & presensi santri ini"
                          >
                            <Save className="w-3 h-3" />
                            <span>{row.isDirty ? 'Simpan*' : 'Simpan'}</span>
                          </button>

                          {row.isDirty ? (
                            <span className="text-[10px] text-amber-700 font-semibold">
                              Belum disimpan
                            </span>
                          ) : row.savedAt ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>{row.savedAt}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Siap dinilai</span>
                          )}
                        </div>
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-800">
              {filteredList.length} dari {students.length} santri ditampilkan.
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-emerald-800 font-medium">
              {unsavedTotalCount > 0
                ? `${unsavedTotalCount} baris menunggu disimpan (klik Simpan atau Enter)`
                : 'Semua data tabel siap & tersinkronisasi'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isBulkSaving || filteredList.length === 0}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                unsavedTotalCount > 0
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                  : 'bg-emerald-800 hover:bg-emerald-900 text-white'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>
                {isBulkSaving
                  ? 'Menyimpan...'
                  : unsavedTotalCount > 0
                  ? `Simpan Perubahan (${unsavedTotalCount})`
                  : `Simpan Seluruh Baris (${filteredList.length} Santri)`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
