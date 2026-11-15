import React, { useState } from 'react';
import { Student } from '../../types';
import { storage } from '../../services/storage';
import {
  X,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  BookOpen,
  Award
} from 'lucide-react';

interface ImportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

type ImportMode = 'ngaji' | 'tahfidz';

interface ParsedTahfidzRow {
  nisn: string;
  nama: string;
  gender: 'L' | 'P';
  kelas: string;
  halaqahTahfidz: string;
  pembimbingTahfidz: string;
  ruanganTahfidz: string;
  targetJuz: string;
  totalHafalan: string;
  hafalanTerakhir: string;
  kelancaran: 'Sangat Lancar (Mumtaz)' | 'Lancar (Jayyid Jiddan)' | 'Cukup (Jayyid)';
  catatan?: string;
}

const NGAJI_HEADER =
  'NISN,NAMA_LENGKAP,JENIS_KELAMIN,KELAS_FORMAL,KELOMPOK_BTQ,PENGAJAR_BTQ,RUANGAN,WALI_KELAS,TAHFIDZ,TARGET_JUZ,NILAI_UJIAN,PREDIKAT,NATIJAH,CATATAN_MAKHRAJ';

const NGAJI_SAMPLE_CSV = `${NGAJI_HEADER}
0082600001,NAMA SISWA 1,P,7D,TILAWATI 4 PI,NAMA GURU NGAJI,RUANGAN 7E,NAMA WALI KELAS,TIDAK,-,85,MUMTAZ,Naik Jilid 5,Lancar makhraj dan tartil
0082600002,NAMA SISWA 2,L,7A,AL-QUR'AN PA,NAMA GURU NGAJI,RUANGAN 7A,NAMA WALI KELAS,YA,Juz 30,90,MUMTAZ,MUMTAZ,Tartil dan tajwid baik`;

const TAHFIDZ_HEADER =
  'NISN,NAMA_LENGKAP,JENIS_KELAMIN,KELAS_FORMAL,HALAQAH_TAHFIDZ,PEMBIMBING_TAHFIDZ,RUANGAN_TAHFIDZ,TARGET_JUZ,TOTAL_HAFALAN,HAFALAN_TERAKHIR,KELANCARAN,CATATAN_TAHFIDZ';

const TAHFIDZ_SAMPLE_CSV = `${TAHFIDZ_HEADER}
0082600002,NAMA SISWA 2,L,7A,HALAQAH TAHFIDZ JUZ 30,NAMA GURU NGAJI,MASJID AL-IKHLAS,Juz 30 & 29,1.5 Juz,QS. An-Naba: 1-40,Sangat Lancar (Mumtaz),Mutqin dan siap tasmi
0082600003,NAMA SISWA 3,P,8B,HALAQAH TAHFIDZ MUTQIN,NAMA GURU TAHFIDZ,RUANGAN TAHFIDZ,Juz 30,1 Juz,QS. Al-Mulk: 1-15,Lancar (Jayyid Jiddan),Perhatikan panjang pendek mad`;

function parseCSVLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : ',';
  const regex =
    delimiter === ','
      ? /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g
      : /(?:\t|\n|^)("(?:(?:"")*[^"]*)*"|[^\t\n]*|(?:\n|$))/g;

  const matches: string[] = [];
  let match;
  while ((match = regex.exec(line))) {
    let val = match[1] || '';
    val = val.replace(/^"/, '').replace(/"$/, '').replace(/""/g, '"').trim();
    matches.push(val);
    if (regex.lastIndex >= line.length) break;
  }

  return matches.length > 1
    ? matches
    : line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
}

export const ImportDataModal: React.FC<ImportDataModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onNotify
}) => {
  const [importMode, setImportMode] = useState<ImportMode>('ngaji');
  const [activeTab, setActiveTab] = useState<'upload' | 'format'>('upload');
  const [rawText, setRawText] = useState('');
  const [parsedNgajiRows, setParsedNgajiRows] = useState<Omit<Student, 'id'>[]>([]);
  const [parsedTahfidzRows, setParsedTahfidzRows] = useState<ParsedTahfidzRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [hasCopied, setHasCopied] = useState(false);

  if (!isOpen) return null;

  const currentCount = importMode === 'ngaji' ? parsedNgajiRows.length : parsedTahfidzRows.length;

  const parseCSVText = (text: string, forcedMode?: ImportMode) => {
    const lines = text
      .trim()
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0);

    if (lines.length === 0) {
      setParsedNgajiRows([]);
      setParsedTahfidzRows([]);
      setParseErrors([]);
      return;
    }

    const firstLineUpper = lines[0].toUpperCase();
    let effectiveMode: ImportMode = forcedMode || importMode;

    // Auto-detect format from header columns
    if (
      !forcedMode &&
      (firstLineUpper.includes('HALAQAH_TAHFIDZ') ||
        firstLineUpper.includes('PEMBIMBING_TAHFIDZ') ||
        firstLineUpper.includes('TOTAL_HAFALAN') ||
        firstLineUpper.includes('HAFALAN_TERAKHIR'))
    ) {
      effectiveMode = 'tahfidz';
      if (importMode !== 'tahfidz') setImportMode('tahfidz');
    } else if (
      !forcedMode &&
      (firstLineUpper.includes('KELOMPOK_BTQ') ||
        firstLineUpper.includes('PENGAJAR_BTQ') ||
        firstLineUpper.includes('NILAI_UJIAN'))
    ) {
      effectiveMode = 'ngaji';
      if (importMode !== 'ngaji') setImportMode('ngaji');
    }

    const isHeader =
      firstLineUpper.includes('NISN') ||
      firstLineUpper.includes('NAMA_LENGKAP') ||
      firstLineUpper.includes('HALAQAH') ||
      firstLineUpper.includes('KELOMPOK_BTQ');

    const dataLines = isHeader ? lines.slice(1) : lines;
    const errors: string[] = [];

    if (effectiveMode === 'ngaji') {
      const validNgaji: Omit<Student, 'id'>[] = [];
      dataLines.forEach((line, index) => {
        const cols = parseCSVLine(line);
        if (cols.length < 2) {
          errors.push(`Baris ${index + (isHeader ? 2 : 1)}: Format tidak lengkap (minimal butuh NISN & Nama).`);
          return;
        }

        const nisn = cols[0] || '';
        const nama = cols[1] || '';
        const gender = (cols[2]?.toUpperCase() === 'L' ? 'L' : 'P') as 'L' | 'P';
        const kelas = cols[3] || '7D';
        const kelasBTQ = cols[4] || 'TILAWATI 4 PI';
        const pengajar = (cols[5] || 'GURU BTQ').toUpperCase();
        const ruangan = cols[6] || `RUANGAN ${kelas}`;
        const waliKelas = cols[7] || '-';
        const isTahfidz = ['YA', 'TRUE', '1', 'YES', 'TAHFIDZ'].includes(cols[8]?.toUpperCase() || '');
        const targetJuz = cols[9] && cols[9] !== '-' ? cols[9] : isTahfidz ? 'Juz 30' : undefined;
        const nilai = Number(cols[10]) || 80;
        const predikat = (
          cols[11]?.toUpperCase() || (nilai >= 85 ? 'MUMTAZ' : nilai >= 75 ? 'JAYYID' : 'MAQBUL')
        ) as any;
        const natijah = cols[12] || (nilai >= 75 ? 'Lulus Kenaikan Tingkat' : 'Tetap');
        const catatan = cols[13] || 'Lancar dan tertib';

        if (!nisn) {
          errors.push(`Baris ${index + (isHeader ? 2 : 1)}: NISN tidak boleh kosong.`);
          return;
        }

        validNgaji.push({
          nisn,
          nama: nama.toUpperCase(),
          gender,
          kelas,
          kelasBTQ,
          pengajar,
          ruangan,
          waliKelas,
          isTahfidz,
          targetJuz,
          totalHafalan: isTahfidz ? '1 Juz' : undefined,
          hafalanTerakhir: isTahfidz ? 'Setoran awal' : undefined,
          capaianTerakhir: {
            tingkat: kelasBTQ,
            halamanAyat: 'Halaman Awal',
            tanggal: new Date().toISOString().slice(0, 10),
            nilai: nilai >= 85 ? 'A' : 'B'
          },
          ujian: {
            tanggal: new Date().toISOString().slice(0, 10),
            jenis: 'Tes Kenaikan BTQ',
            nilai,
            predikat,
            natijah,
            kelulusan: natijah,
            keterangan: catatan
          },
          kehadiranPersen: 100
        });
      });

      setParsedNgajiRows(validNgaji);
      setParsedTahfidzRows([]);
      setParseErrors(errors);
    } else {
      const validTahfidz: ParsedTahfidzRow[] = [];
      dataLines.forEach((line, index) => {
        const cols = parseCSVLine(line);
        if (cols.length < 2) {
          errors.push(`Baris ${index + (isHeader ? 2 : 1)}: Format Tahfidz tidak lengkap (minimal butuh NISN & Nama).`);
          return;
        }

        const nisn = cols[0] || '';
        const nama = cols[1] || '';
        const gender = (cols[2]?.toUpperCase() === 'L' ? 'L' : 'P') as 'L' | 'P';
        const kelas = cols[3] || '7D';
        const halaqahTahfidz = cols[4] || 'HALAQAH TAHFIDZ';
        const pembimbingTahfidz = (cols[5] || 'GURU TAHFIDZ').toUpperCase();
        const ruanganTahfidz = cols[6] || 'MASJID AL-IKHLAS';
        const targetJuz = cols[7] || 'Juz 30';
        const totalHafalan = cols[8] || '0 Juz';
        const hafalanTerakhir = cols[9] || 'Setoran awal';
        const rawKelancaran = (cols[10] || '').toLowerCase();
        let kelancaran: ParsedTahfidzRow['kelancaran'] = 'Lancar (Jayyid Jiddan)';
        if (rawKelancaran.includes('mumtaz') || rawKelancaran.includes('sangat')) {
          kelancaran = 'Sangat Lancar (Mumtaz)';
        } else if (rawKelancaran.includes('cukup') || rawKelancaran === 'jayyid') {
          kelancaran = 'Cukup (Jayyid)';
        }
        const catatan = cols[11] || '';

        if (!nisn) {
          errors.push(`Baris ${index + (isHeader ? 2 : 1)}: NISN tidak boleh kosong.`);
          return;
        }

        validTahfidz.push({
          nisn,
          nama: nama.toUpperCase(),
          gender,
          kelas,
          halaqahTahfidz,
          pembimbingTahfidz,
          ruanganTahfidz,
          targetJuz,
          totalHafalan,
          hafalanTerakhir,
          kelancaran,
          catatan
        });
      });

      setParsedTahfidzRows(validTahfidz);
      setParsedNgajiRows([]);
      setParseErrors(errors);
    }
  };

  const handleModeSwitch = (mode: ImportMode) => {
    setImportMode(mode);
    if (rawText.trim()) {
      parseCSVText(rawText, mode);
    } else {
      setParsedNgajiRows([]);
      setParsedTahfidzRows([]);
      setParseErrors([]);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setRawText(text);
    parseCSVText(text);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      setRawText(content);
      parseCSVText(content);
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = (withSamples: boolean) => {
    const content =
      importMode === 'ngaji'
        ? withSamples
          ? NGAJI_SAMPLE_CSV
          : NGAJI_HEADER + '\n'
        : withSamples
        ? TAHFIDZ_SAMPLE_CSV
        : TAHFIDZ_HEADER + '\n';

    const filename =
      importMode === 'ngaji'
        ? withSamples
          ? 'contoh_format_ngaji_btq_spemda.csv'
          : 'template_kosong_ngaji_btq_spemda.csv'
        : withSamples
        ? 'contoh_format_program_tahfidz_spemda.csv'
        : 'template_kosong_program_tahfidz_spemda.csv';

    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify('success', 'File CSV Diunduh', `Berhasil mengunduh ${filename}`);
  };

  const handleCopySample = () => {
    const text = importMode === 'ngaji' ? NGAJI_SAMPLE_CSV : TAHFIDZ_SAMPLE_CSV;
    navigator.clipboard.writeText(text);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2500);
    onNotify(
      'info',
      'Format Disalin',
      `Format CSV ${importMode === 'ngaji' ? 'Ngaji / BTQ' : 'Program Tahfidz'} berhasil disalin ke clipboard.`
    );
  };

  const handleExecuteImport = () => {
    if (importMode === 'ngaji') {
      if (parsedNgajiRows.length === 0) {
        onNotify('error', 'Tidak Ada Data Ngaji', 'Silakan tempel atau unggah file data Ngaji yang valid.');
        return;
      }
      const res = storage.importStudentsBatch(parsedNgajiRows);
      onNotify(
        'success',
        'Import Data Ngaji / BTQ Berhasil',
        `Berhasil memproses ${parsedNgajiRows.length} siswa (${res.added} baru, ${res.updated} diperbarui). ${res.teachersCount} guru tersinkronisasi.`
      );
    } else {
      if (parsedTahfidzRows.length === 0) {
        onNotify('error', 'Tidak Ada Data Tahfidz', 'Silakan tempel atau unggah file data Program Tahfidz yang valid.');
        return;
      }
      const res = storage.importTahfidzBatch(parsedTahfidzRows);
      onNotify(
        'success',
        'Import Data Program Tahfidz Berhasil',
        `Berhasil memproses ${parsedTahfidzRows.length} santri Tahfidz (${res.merged} digabung ke siswa yang ada tanpa menimpa Kelas BTQ, ${res.added} baru). Pembimbing otomatis masuk ke daftar Guru Tahfidz.`
      );
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative border border-slate-200 max-h-[92vh] flex flex-col">

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Import Format Data Siswa, Pengajar & Program Tahfidz
              </h2>
              <p className="text-[11px] text-slate-500">
                Mendukung 2 format berbeda: Data Ngaji/BTQ (14 kolom) dan Khusus Program Tahfidz (12 kolom)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format Selector (Ngaji vs Tahfidz Separate Format) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 shrink-0">
          <button
            type="button"
            onClick={() => handleModeSwitch('ngaji')}
            className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
              importMode === 'ngaji'
                ? 'border-emerald-700 bg-emerald-50/80 shadow-2xs'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                importMode === 'ngaji' ? 'bg-emerald-800 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">
                Format 1: Data Siswa Ngaji / BTQ
              </p>
              <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                Tilawati Remaja, Al-Qur'an, Kelompok BTQ, Pengajar BTQ & Nilai Ujian (14 Kolom)
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleModeSwitch('tahfidz')}
            className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
              importMode === 'tahfidz'
                ? 'border-amber-600 bg-amber-50/80 shadow-2xs'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                importMode === 'tahfidz' ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Award className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">
                Format 2: Khusus Program Tahfidz
              </p>
              <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                Halaqah Tahfidz, Pembimbing Tahfidz, Target Juz, Total & Hafalan Terakhir (12 Kolom)
              </p>
            </div>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0 mt-3">
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === 'upload'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Upload & Tempel Data {importMode === 'ngaji' ? 'Ngaji/BTQ' : 'Program Tahfidz'} ({currentCount} Terdeteksi)
          </button>
          <button
            onClick={() => setActiveTab('format')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === 'format'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Panduan Struktur Format ({importMode === 'ngaji' ? '14 Kolom Ngaji' : '12 Kolom Tahfidz'})
          </button>
        </div>

        {/* Tab 1: Upload / Paste */}
        {activeTab === 'upload' && (
          <div className="flex-1 overflow-y-auto space-y-4 pt-4 pr-1 min-h-0">

            {/* Info banner for Tahfidz mode */}
            {importMode === 'tahfidz' && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950 leading-relaxed">
                <strong>Pemisahan Kelas BTQ & Kelas Tahfidz:</strong> Siswa program Tahfidz yang NISN/Namanya sudah ada dari import Ngaji akan otomatis ditambahkan status <strong>Program Tahfidz</strong> tanpa menimpa <strong>Kelas BTQ</strong> dan <strong>Guru Ngaji</strong>-nya. Kolom <strong>PEMBIMBING_TAHFIDZ</strong> otomatis dibuatkan akun pada <strong>Dashboard Guru Tahfidz</strong>.
              </div>
            )}

            {/* Template Download Bar */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <span className="font-bold text-slate-800">
                  Unduh Format {importMode === 'ngaji' ? 'Siswa Ngaji / BTQ' : 'Khusus Program Tahfidz'}:
                </span>
                <span className="text-slate-500 block text-[11px]">Buka di Microsoft Excel atau Google Sheets</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate(false)}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Template Kosong</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate(true)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs ${
                    importMode === 'ngaji'
                      ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                      : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Contoh Format {importMode === 'ngaji' ? 'Ngaji' : 'Tahfidz'}</span>
                </button>
              </div>
            </div>

            {/* File Upload Option */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Pilih File CSV {importMode === 'ngaji' ? 'Ngaji / BTQ' : 'Program Tahfidz'} dari Komputer:
              </label>
              <label className="border-2 border-dashed border-slate-300 hover:border-emerald-600 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer bg-slate-50/50 hover:bg-emerald-50/30 transition-colors">
                <Upload className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-semibold text-slate-700">
                  Klik untuk memilih file .CSV (deteksi format otomatis)
                </span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Paste Box Option */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Atau Tempel (Paste) Teks CSV / Salinan dari Excel:
                </label>
                {rawText && (
                  <button
                    onClick={() => {
                      setRawText('');
                      setParsedNgajiRows([]);
                      setParsedTahfidzRows([]);
                      setParseErrors([]);
                    }}
                    className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold"
                  >
                    Bersihkan
                  </button>
                )}
              </div>
              <textarea
                value={rawText}
                onChange={handleTextChange}
                rows={5}
                placeholder={
                  importMode === 'ngaji'
                    ? `Tempel baris CSV format Ngaji/BTQ di sini...\n${NGAJI_HEADER}`
                    : `Tempel baris CSV format Program Tahfidz di sini...\n${TAHFIDZ_HEADER}`
                }
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed"
              />
            </div>

            {/* Status and Preview for Ngaji */}
            {importMode === 'ngaji' && parsedNgajiRows.length > 0 && (
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Siap Diimpor (Format Ngaji/BTQ): {parsedNgajiRows.length} Siswa</span>
                </div>

                <div className="max-h-36 overflow-y-auto border border-emerald-200/80 rounded-lg bg-white divide-y divide-slate-100 text-[11px]">
                  {parsedNgajiRows.slice(0, 8).map((row, i) => (
                    <div key={i} className="p-2 flex items-center justify-between gap-2">
                      <div>
                        <strong className="text-slate-800">{row.nama}</strong>{' '}
                        <span className="text-slate-500 font-mono">({row.nisn})</span>
                      </div>
                      <div className="text-slate-600 text-right">
                        {row.kelas} · {row.kelasBTQ} · {row.pengajar}
                      </div>
                    </div>
                  ))}
                  {parsedNgajiRows.length > 8 && (
                    <div className="p-2 text-center text-slate-400 italic text-[10px]">
                      ... dan {parsedNgajiRows.length - 8} siswa lainnya
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Status and Preview for Tahfidz */}
            {importMode === 'tahfidz' && parsedTahfidzRows.length > 0 && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-amber-600" />
                  <span>Siap Diimpor (Format Program Tahfidz): {parsedTahfidzRows.length} Santri</span>
                </div>

                <div className="max-h-36 overflow-y-auto border border-amber-200/80 rounded-lg bg-white divide-y divide-slate-100 text-[11px]">
                  {parsedTahfidzRows.slice(0, 8).map((row, i) => (
                    <div key={i} className="p-2 flex items-center justify-between gap-2">
                      <div>
                        <strong className="text-slate-800">{row.nama}</strong>{' '}
                        <span className="text-slate-500 font-mono">({row.nisn})</span>
                      </div>
                      <div className="text-slate-600 text-right">
                        {row.halaqahTahfidz} · Pembimbing: <strong>{row.pembimbingTahfidz}</strong> · {row.totalHafalan}
                      </div>
                    </div>
                  ))}
                  {parsedTahfidzRows.length > 8 && (
                    <div className="p-2 text-center text-slate-400 italic text-[10px]">
                      ... dan {parsedTahfidzRows.length - 8} santri Tahfidz lainnya
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Errors */}
            {parseErrors.length > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                <div className="flex items-center gap-1.5 text-rose-800 font-bold">
                  <AlertCircle className="w-4 h-4 text-rose-600" />
                  <span>Peringatan Format ({parseErrors.length} baris diabaikan):</span>
                </div>
                <ul className="list-disc list-inside text-rose-700 text-[11px] max-h-24 overflow-y-auto">
                  {parseErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        )}

        {/* Tab 2: Format Specification & Table */}
        {activeTab === 'format' && (
          <div className="flex-1 overflow-y-auto space-y-4 pt-4 pr-1 min-h-0 text-xs">

            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <p className="font-bold text-slate-900">
                  {importMode === 'ngaji'
                    ? '14 Kolom Format Data Siswa Ngaji / BTQ'
                    : '12 Kolom Format Data Khusus Program Tahfidz'}
                </p>
                <p className="text-[11px] text-slate-500">
                  Urutan kolom pada spreadsheet Excel / Google Sheets (format terpisah)
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopySample}
                className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1"
              >
                {hasCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                <span>{hasCopied ? 'Tersalin!' : 'Salin Header & Contoh'}</span>
              </button>
            </div>

            {importMode === 'ngaji' ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">No</th>
                      <th className="p-2.5">Nama Kolom</th>
                      <th className="p-2.5">Contoh Pengisian</th>
                      <th className="p-2.5">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {[
                      ['1', 'NISN', '0082600001', '10 digit nomor NISN unik anak (kunci pencarian wali murid).'],
                      ['2', 'NAMA_LENGKAP', 'NAMA LENGKAP SISWA', 'Nama lengkap siswa.'],
                      ['3', 'JENIS_KELAMIN', 'P / L', 'P untuk Putri, L untuk Putra.'],
                      ['4', 'KELAS_FORMAL', '7D / 8E / 9A', 'Rombel formal sekolah.'],
                      ['5', 'KELOMPOK_BTQ', 'TILAWATI 4 PI', 'Kelas BTQ (Tilawati 1-5, Al-Qur\'an Pi/Pa).'],
                      ['6', 'PENGAJAR_BTQ', 'USTADZ/AH NGAJI', 'Nama guru ngaji pengampu kelompok BTQ.'],
                      ['7', 'RUANGAN', 'RUANGAN 7E', 'Lokasi ruangan kelas ngaji.'],
                      ['8', 'WALI_KELAS', 'USTADZAH NURUL M.PD', 'Nama wali kelas formal siswa.'],
                      ['9', 'TAHFIDZ', 'YA / TIDAK', 'Apakah siswa juga mengikuti program Tahfidz.'],
                      ['10', 'TARGET_JUZ', 'Juz 30 & 29', 'Target hafalan (isi "-" jika tidak).'],
                      ['11', 'NILAI_UJIAN', '90', 'Nilai angka hasil tes kenaikan (0-100).'],
                      ['12', 'PREDIKAT', 'MUMTAZ', 'MUMTAZ, JAYYID, MAQBUL, ROSHIB.'],
                      ['13', 'NATIJAH', 'Naik Jilid 5', 'Status kenaikan jilid/tingkat.'],
                      ['14', 'CATATAN_MAKHRAJ', 'Lancar dan tartil', 'Catatan fashahah dan tajwid.']
                    ].map(([no, col, ex, desc]) => (
                      <tr key={no}>
                        <td className="p-2.5 font-mono">{no}</td>
                        <td className="p-2.5 font-bold font-mono text-emerald-800">{col}</td>
                        <td className="p-2.5 font-semibold">{ex}</td>
                        <td className="p-2.5 text-slate-500">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="border border-amber-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-amber-50 text-amber-950 font-bold uppercase border-b border-amber-200">
                    <tr>
                      <th className="p-2.5">No</th>
                      <th className="p-2.5">Nama Kolom</th>
                      <th className="p-2.5">Contoh Pengisian</th>
                      <th className="p-2.5">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {[
                      ['1', 'NISN', '0082600002', 'NISN unik santri (digabung otomatis jika sudah ada di data Ngaji).'],
                      ['2', 'NAMA_LENGKAP', 'NAMA SANTRI TAHFIDZ', 'Nama lengkap santri program Tahfidz.'],
                      ['3', 'JENIS_KELAMIN', 'L / P', 'L untuk Putra, P untuk Putri.'],
                      ['4', 'KELAS_FORMAL', '7A / 8B / 9C', 'Kelas formal di sekolah.'],
                      ['5', 'HALAQAH_TAHFIDZ', 'HALAQAH TAHFIDZ JUZ 30', 'Nama kelompok/halaqah khusus program Tahfidz.'],
                      ['6', 'PEMBIMBING_TAHFIDZ', 'NAMA USTADZ/AH', 'Nama guru pembimbing Program Tahfidz (terhubung ke Dashboard Guru Tahfidz).'],
                      ['7', 'RUANGAN_TAHFIDZ', 'MASJID AL-IKHLAS', 'Lokasi halaqah Tahfidz berlangsung.'],
                      ['8', 'TARGET_JUZ', 'Juz 30 & 29', 'Target hafalan santri pada semester berjalan.'],
                      ['9', 'TOTAL_HAFALAN', '1.5 Juz', 'Akumulasi total hafalan yang telah dicapai.'],
                      ['10', 'HAFALAN_TERAKHIR', 'QS. An-Naba: 1-40', 'Surat & ayat setoran hafalan terakhir.'],
                      ['11', 'KELANCARAN', 'Sangat Lancar (Mumtaz)', 'Sangat Lancar (Mumtaz) / Lancar (Jayyid Jiddan) / Cukup (Jayyid).'],
                      ['12', 'CATATAN_TAHFIDZ', 'Mutqin siap tasmi', 'Catatan murojaah / tajwid dari pembimbing Tahfidz.']
                    ].map(([no, col, ex, desc]) => (
                      <tr key={no}>
                        <td className="p-2.5 font-mono">{no}</td>
                        <td className="p-2.5 font-bold font-mono text-amber-800">{col}</td>
                        <td className="p-2.5 font-semibold">{ex}</td>
                        <td className="p-2.5 text-slate-500">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

          </div>
        )}

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between shrink-0 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
          >
            Tutup
          </button>

          {activeTab === 'upload' && (
            <button
              type="button"
              disabled={currentCount === 0}
              onClick={handleExecuteImport}
              className={`py-2 px-5 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 ${
                currentCount > 0
                  ? importMode === 'ngaji'
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                    : 'bg-amber-500 hover:bg-amber-600 text-slate-950 cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {currentCount > 0
                  ? `Import ${currentCount} Siswa (${importMode === 'ngaji' ? 'Format Ngaji' : 'Program Tahfidz'})`
                  : 'Import Data'}
              </span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
