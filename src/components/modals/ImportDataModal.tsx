import React, { useState } from 'react';
import { Student } from '../../types';
import { storage } from '../../services/storage';
import { cloudDb, StaffDirectoryRecord } from '../../services/cloudDb';
import { sanitizeDocId } from '../../services/firebase';
import { formatBtqClassWithGender } from '../../utils/access';
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
  Award,
  UserCheck
} from 'lucide-react';

interface ImportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

type ImportMode = 'ngaji' | 'tahfidz' | 'guru_btq' | 'guru_tahfidz';

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

interface ParsedTeacherRow {
  nama: string;
  kelompok: string;
  ruangan: string;
  kontak?: string;
  email?: string;
}

const NGAJI_HEADER =
  'NISN,NAMA_LENGKAP,JENIS_KELAMIN,KELAS_FORMAL,KELOMPOK_BTQ,PENGAJAR_BTQ,RUANGAN,WALI_KELAS,NILAI_UJIAN,PREDIKAT,NATIJAH,CATATAN_MAKHRAJ';

const NGAJI_SAMPLE_CSV = `${NGAJI_HEADER}
0082600001,NAMA SISWA BTQ 1,P,7D,TILAWATI 4 PI,USTADZAH SITI,RUANGAN 7E,WALI KELAS 7D,88,MUMTAZ,Naik Jilid 5,Lancar makhraj dan tartil
0082600002,NAMA SISWA BTQ 2,L,7A,AL-QUR'AN PA,USTADZ AHMAD,RUANGAN 7A,WALI KELAS 7A,90,MUMTAZ,MUMTAZ,Tartil dan tajwid baik`;

const TAHFIDZ_HEADER =
  'NISN,NAMA_LENGKAP,JENIS_KELAMIN,KELAS_FORMAL,HALAQAH_TAHFIDZ,PEMBIMBING_TAHFIDZ,RUANGAN_TAHFIDZ,TARGET_JUZ,TOTAL_HAFALAN,HAFALAN_TERAKHIR,KELANCARAN,CATATAN_TAHFIDZ';

const TAHFIDZ_SAMPLE_CSV = `${TAHFIDZ_HEADER}
0082600002,NAMA SISWA BTQ 2,L,7A,HALAQAH TAHFIDZ JUZ 30,USTADZ FAUZAN,MASJID AL-IKHLAS,Juz 30 & 29,1.5 Juz,QS. An-Naba: 1-40,Sangat Lancar (Mumtaz),Mutqin dan siap tasmi
0082600003,NAMA SANTRI TAHFIDZ 3,P,8B,HALAQAH TAHFIDZ MUTQIN,USTADZAH AISYAH,RUANGAN TAHFIDZ,Juz 30,1 Juz,QS. Al-Mulk: 1-15,Lancar (Jayyid Jiddan),Perhatikan panjang pendek mad`;

const GURU_BTQ_HEADER = 'NAMA_GURU_BTQ,KELOMPOK_BTQ,RUANGAN_BTQ,KONTAK_WA,EMAIL_GOOGLE';

const GURU_BTQ_SAMPLE_CSV = `${GURU_BTQ_HEADER}
USTADZAH SITI,TILAWATI 4 PI,RUANGAN 7E,081234567890,ustadzah.siti@gmail.com
USTADZ AHMAD,AL-QUR'AN PA,RUANGAN 7A,081298765432,ustadz.ahmad@gmail.com`;

const GURU_TAHFIDZ_HEADER = 'NAMA_GURU_TAHFIDZ,HALAQAH_TAHFIDZ,RUANGAN_TAHFIDZ,KONTAK_WA,EMAIL_GOOGLE';

const GURU_TAHFIDZ_SAMPLE_CSV = `${GURU_TAHFIDZ_HEADER}
USTADZ FAUZAN,HALAQAH TAHFIDZ JUZ 30,MASJID AL-IKHLAS,081345678901,ustadz.fauzan@gmail.com
USTADZAH AISYAH,HALAQAH TAHFIDZ MUTQIN,RUANGAN TAHFIDZ,081356789012,ustadzah.aisyah@gmail.com`;

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
  const [parsedTeacherRows, setParsedTeacherRows] = useState<ParsedTeacherRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [hasCopied, setHasCopied] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const currentCount =
    importMode === 'ngaji'
      ? parsedNgajiRows.length
      : importMode === 'tahfidz'
      ? parsedTahfidzRows.length
      : parsedTeacherRows.length;

  const clearParsed = () => {
    setParsedNgajiRows([]);
    setParsedTahfidzRows([]);
    setParsedTeacherRows([]);
  };

  const parseCSVText = (text: string, forcedMode?: ImportMode) => {
    const lines = text
      .trim()
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0);

    if (lines.length === 0) {
      clearParsed();
      setParseErrors([]);
      return;
    }

    const firstLineUpper = lines[0].toUpperCase();
    let effectiveMode: ImportMode = forcedMode || importMode;

    // Auto-detect format from header columns
    if (!forcedMode) {
      if (firstLineUpper.includes('NAMA_GURU_TAHFIDZ')) {
        effectiveMode = 'guru_tahfidz';
        if (importMode !== 'guru_tahfidz') setImportMode('guru_tahfidz');
      } else if (firstLineUpper.includes('NAMA_GURU_BTQ')) {
        effectiveMode = 'guru_btq';
        if (importMode !== 'guru_btq') setImportMode('guru_btq');
      } else if (
        firstLineUpper.includes('HALAQAH_TAHFIDZ') ||
        firstLineUpper.includes('PEMBIMBING_TAHFIDZ') ||
        firstLineUpper.includes('TOTAL_HAFALAN') ||
        firstLineUpper.includes('HAFALAN_TERAKHIR')
      ) {
        effectiveMode = 'tahfidz';
        if (importMode !== 'tahfidz') setImportMode('tahfidz');
      } else if (
        firstLineUpper.includes('KELOMPOK_BTQ') ||
        firstLineUpper.includes('PENGAJAR_BTQ') ||
        firstLineUpper.includes('NILAI_UJIAN')
      ) {
        effectiveMode = 'ngaji';
        if (importMode !== 'ngaji') setImportMode('ngaji');
      }
    }

    const isHeader =
      firstLineUpper.includes('NISN') ||
      firstLineUpper.includes('NAMA_LENGKAP') ||
      firstLineUpper.includes('NAMA_GURU') ||
      firstLineUpper.includes('HALAQAH') ||
      firstLineUpper.includes('KELOMPOK_BTQ');

    const headerCols = isHeader ? parseCSVLine(lines[0]).map(h => h.toUpperCase()) : [];
    const hasLegacyTahfidzCols =
      headerCols.includes('TAHFIDZ') || headerCols.includes('TARGET_JUZ');

    const dataLines = isHeader ? lines.slice(1) : lines;
    const errors: string[] = [];

    if (effectiveMode === 'ngaji') {
      const validNgaji: Omit<Student, 'id'>[] = [];
      dataLines.forEach((line, index) => {
        const cols = parseCSVLine(line);
        if (cols.length < 2) {
          errors.push(`Baris ${index + (isHeader ? 2 : 1)}: Format BTQ tidak lengkap (minimal butuh NISN & Nama).`);
          return;
        }

        const nisn = cols[0] || '';
        const nama = cols[1] || '';
        const gender = (cols[2]?.toUpperCase() === 'L' ? 'L' : 'P') as 'L' | 'P';
        const kelas = cols[3] || '7D';
        const rawKelasBTQ = cols[4] || (gender === 'L' ? 'TILAWATI 4 PA' : 'TILAWATI 4 PI');
        const kelasBTQ = formatBtqClassWithGender(rawKelasBTQ, gender);
        const pengajar = (cols[5] || 'GURU BTQ').toUpperCase();
        const ruangan = cols[6] || `RUANGAN ${kelas}`;
        const waliKelas = cols[7] || '-';

        // Support both pure 12-column BTQ format (default) and legacy 14-column Ngaji format
        let nilai = 80;
        let predikatRaw = '';
        let natijahRaw = '';
        let catatan = 'Lancar dan tertib';

        if (hasLegacyTahfidzCols || cols.length >= 13) {
          nilai = Number(cols[10]) || 80;
          predikatRaw = cols[11]?.toUpperCase() || '';
          natijahRaw = cols[12] || '';
          catatan = cols[13] || 'Lancar dan tertib';
        } else {
          nilai = Number(cols[8]) || 80;
          predikatRaw = cols[9]?.toUpperCase() || '';
          natijahRaw = cols[10] || '';
          catatan = cols[11] || 'Lancar dan tertib';
        }

        const predikat = (
          predikatRaw || (nilai >= 85 ? 'MUMTAZ' : nilai >= 75 ? 'JAYYID' : 'MAQBUL')
        ) as any;
        const natijah = natijahRaw || (nilai >= 75 ? 'Lulus Kenaikan Tingkat' : 'Tetap');

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
          // Pure BTQ import never tags student as Tahfidz (kept separate from Format Tahfidz)
          isTahfidz: false,
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
      setParsedTeacherRows([]);
      setParseErrors(errors);
    } else if (effectiveMode === 'tahfidz') {
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
      setParsedTeacherRows([]);
      setParseErrors(errors);
    } else {
      // guru_btq or guru_tahfidz
      const validTeachers: ParsedTeacherRow[] = [];
      dataLines.forEach((line, index) => {
        const cols = parseCSVLine(line);
        const nama = (cols[0] || '').trim().toUpperCase();
        if (!nama) {
          errors.push(`Baris ${index + (isHeader ? 2 : 1)}: Nama guru tidak boleh kosong.`);
          return;
        }
        const kelompok =
          (cols[1] || '').trim() ||
          (effectiveMode === 'guru_tahfidz' ? 'HALAQAH TAHFIDZ' : 'BTQ REGULER');
        const ruangan =
          (cols[2] || '').trim() ||
          (effectiveMode === 'guru_tahfidz' ? 'RUANGAN TAHFIDZ' : 'RUANGAN KELAS');
        const kontak = (cols[3] || '').trim() || undefined;
        const emailRaw = (cols[4] || '').trim().toLowerCase();
        const email = emailRaw && emailRaw.includes('@') ? emailRaw : undefined;

        validTeachers.push({ nama, kelompok, ruangan, kontak, email });
      });

      setParsedTeacherRows(validTeachers);
      setParsedNgajiRows([]);
      setParsedTahfidzRows([]);
      setParseErrors(errors);
    }
  };

  const handleModeSwitch = (mode: ImportMode) => {
    setImportMode(mode);
    if (rawText.trim()) {
      parseCSVText(rawText, mode);
    } else {
      clearParsed();
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

  const getFormatStrings = () => {
    switch (importMode) {
      case 'ngaji':
        return {
          header: NGAJI_HEADER,
          sample: NGAJI_SAMPLE_CSV,
          sampleFile: 'contoh_format_siswa_guru_btq_spemda.csv',
          emptyFile: 'template_kosong_siswa_guru_btq_spemda.csv',
          label: 'Siswa & Guru BTQ'
        };
      case 'tahfidz':
        return {
          header: TAHFIDZ_HEADER,
          sample: TAHFIDZ_SAMPLE_CSV,
          sampleFile: 'contoh_format_santri_guru_tahfidz_spemda.csv',
          emptyFile: 'template_kosong_santri_guru_tahfidz_spemda.csv',
          label: 'Santri & Guru Tahfidz'
        };
      case 'guru_btq':
        return {
          header: GURU_BTQ_HEADER,
          sample: GURU_BTQ_SAMPLE_CSV,
          sampleFile: 'contoh_format_daftar_guru_btq_spemda.csv',
          emptyFile: 'template_kosong_daftar_guru_btq_spemda.csv',
          label: 'Daftar Guru BTQ'
        };
      case 'guru_tahfidz':
        return {
          header: GURU_TAHFIDZ_HEADER,
          sample: GURU_TAHFIDZ_SAMPLE_CSV,
          sampleFile: 'contoh_format_daftar_guru_tahfidz_spemda.csv',
          emptyFile: 'template_kosong_daftar_guru_tahfidz_spemda.csv',
          label: 'Daftar Guru Tahfidz'
        };
    }
  };

  const handleDownloadTemplate = (withSamples: boolean) => {
    const fmt = getFormatStrings();
    const content = withSamples ? fmt.sample : fmt.header + '\n';
    const filename = withSamples ? fmt.sampleFile : fmt.emptyFile;

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
    const fmt = getFormatStrings();
    navigator.clipboard.writeText(fmt.sample);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2500);
    onNotify(
      'info',
      'Format Disalin',
      `Format CSV ${fmt.label} berhasil disalin ke clipboard.`
    );
  };

  const toStaffDirRecords = (teachersList: ReturnType<typeof storage.getTeachers>): StaffDirectoryRecord[] => {
    const existingWali = cloudDb
      .getCachedStaffDirectory()
      .filter(d => d.role === 'wali_kelas');
    return [
      ...teachersList.map(t => ({
        id: sanitizeDocId(t.id, 128),
        nama: t.nama,
        role: t.role,
        kelompokBTQ: t.kelompokBTQ || '-',
        kelompokTahfidz: t.kelompokTahfidz,
        ruangan: t.ruangan || '-',
        kontak: t.kontak,
        email: t.email
      })),
      ...existingWali
    ];
  };

  const handleExecuteImport = async () => {
    if (isImporting) return;
    setIsImporting(true);
    try {
      if (importMode === 'ngaji') {
        if (parsedNgajiRows.length === 0) {
          onNotify('error', 'Tidak Ada Data BTQ', 'Silakan tempel atau unggah file data Siswa & Guru BTQ yang valid.');
          return;
        }
        const res = storage.importStudentsBatch(parsedNgajiRows);
        if (cloudDb.isCloudAuthenticated()) {
          const allStudents = storage.getStudents();
          const importedNisns = new Set(parsedNgajiRows.map(r => r.nisn));
          const affectedStudents = allStudents.filter(s => importedNisns.has(s.nisn));
          const staffDir = toStaffDirRecords(res.teachers);
          await cloudDb.saveStaffDirectoryBatch(staffDir);
          await cloudDb.syncStudentsBatch(affectedStudents, staffDir, false);
        }
        onNotify(
          'success',
          'Import Data Siswa & Guru BTQ Berhasil',
          `Berhasil memproses ${parsedNgajiRows.length} siswa BTQ (${res.added} baru, ${res.updated} diperbarui). Pengajar otomatis masuk ke Guru Ngaji (BTQ).`
        );
      } else if (importMode === 'tahfidz') {
        if (parsedTahfidzRows.length === 0) {
          onNotify('error', 'Tidak Ada Data Tahfidz', 'Silakan tempel atau unggah file data Santri Program Tahfidz yang valid.');
          return;
        }
        const res = storage.importTahfidzBatch(parsedTahfidzRows);
        if (cloudDb.isCloudAuthenticated()) {
          const allStudents = storage.getStudents();
          const importedNisns = new Set(parsedTahfidzRows.map(r => r.nisn));
          const affectedStudents = allStudents.filter(s => importedNisns.has(s.nisn));
          const staffDir = toStaffDirRecords(res.teachers);
          await cloudDb.saveStaffDirectoryBatch(staffDir);
          await cloudDb.syncStudentsBatch(affectedStudents, staffDir, false);
          if (res.newTahfidzRecords.length > 0) {
            const studentsMap = new Map(
              affectedStudents.map(s => [sanitizeDocId(s.nisn, 40), s])
            );
            await cloudDb.saveTahfidzBatchCloud(res.newTahfidzRecords, studentsMap, staffDir);
          }
        }
        onNotify(
          'success',
          'Import Data Santri & Guru Tahfidz Berhasil',
          `Berhasil memproses ${parsedTahfidzRows.length} santri Tahfidz (${res.merged} digabung ke siswa yang ada tanpa menimpa Kelas BTQ, ${res.added} baru). Pembimbing otomatis masuk ke Guru Tahfidz.`
        );
      } else if (importMode === 'guru_btq') {
        if (parsedTeacherRows.length === 0) {
          onNotify('error', 'Tidak Ada Data Guru BTQ', 'Silakan tempel atau unggah daftar Guru BTQ yang valid.');
          return;
        }
        const res = storage.importTeachersBatch(parsedTeacherRows, 'guru_ngaji');
        if (cloudDb.isCloudAuthenticated()) {
          const staffDir = toStaffDirRecords(res.teachers);
          await cloudDb.saveStaffDirectoryBatch(staffDir);
          await cloudDb.recomputeAllPermissionsCloud(storage.getStudents(), staffDir);
        }
        onNotify(
          'success',
          'Import Daftar Guru BTQ Berhasil',
          `Berhasil memproses ${parsedTeacherRows.length} Guru BTQ (${res.added} baru, ${res.updated} diperbarui) khusus pada Dashboard Guru Ngaji.`
        );
      } else {
        if (parsedTeacherRows.length === 0) {
          onNotify('error', 'Tidak Ada Data Guru Tahfidz', 'Silakan tempel atau unggah daftar Guru Tahfidz yang valid.');
          return;
        }
        const res = storage.importTeachersBatch(parsedTeacherRows, 'guru_tahfidz');
        if (cloudDb.isCloudAuthenticated()) {
          const staffDir = toStaffDirRecords(res.teachers);
          await cloudDb.saveStaffDirectoryBatch(staffDir);
          await cloudDb.recomputeAllPermissionsCloud(storage.getStudents(), staffDir);
        }
        onNotify(
          'success',
          'Import Daftar Guru Tahfidz Berhasil',
          `Berhasil memproses ${parsedTeacherRows.length} Guru Tahfidz (${res.added} baru, ${res.updated} diperbarui) khusus pada Dashboard Guru Tahfidz.`
        );
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      onNotify(
        'error',
        'Sebagian Sinkronisasi Cloud Gagal',
        err?.message || 'Data tersimpan lokal, namun sinkronisasi ke Firestore terkendala.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  const fmt = getFormatStrings();

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
                Import Format Data Terpisah (BTQ &amp; Tahfidz)
              </h2>
              <p className="text-[11px] text-slate-500">
                Format Guru BTQ dan Guru Tahfidz dipisah total agar data siswa &amp; pengajar tidak tercampur
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4 Separated Format Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 shrink-0">
          <button
            type="button"
            onClick={() => handleModeSwitch('ngaji')}
            className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
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
                1. Format Siswa &amp; Guru BTQ
              </p>
              <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                Khusus Kelas BTQ, Tilawati/Al-Qur'an, Pengajar BTQ &amp; Nilai Tes (12 Kolom Murni BTQ)
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleModeSwitch('tahfidz')}
            className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
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
                2. Format Santri &amp; Guru Tahfidz
              </p>
              <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                Khusus Halaqah Tahfidz, Pembimbing Tahfidz, Target Juz &amp; Hafalan (12 Kolom Murni Tahfidz)
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleModeSwitch('guru_btq')}
            className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
              importMode === 'guru_btq'
                ? 'border-teal-700 bg-teal-50/80 shadow-2xs'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                importMode === 'guru_btq' ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">
                3. Format Daftar Guru BTQ Sendiri
              </p>
              <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                Impor khusus akun Ustadz/ah Pengajar BTQ, Kelompok BTQ &amp; Ruangan (4 Kolom)
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleModeSwitch('guru_tahfidz')}
            className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
              importMode === 'guru_tahfidz'
                ? 'border-orange-600 bg-orange-50/80 shadow-2xs'
                : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                importMode === 'guru_tahfidz' ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-extrabold text-slate-900">
                4. Format Daftar Guru Tahfidz Sendiri
              </p>
              <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                Impor khusus akun Ustadz/ah Pembimbing Tahfidz, Halaqah &amp; Ruangan (4 Kolom)
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
            1. Upload &amp; Tempel {fmt.label} ({currentCount} Terdeteksi)
          </button>
          <button
            onClick={() => setActiveTab('format')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === 'format'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Panduan Kolom ({fmt.label})
          </button>
        </div>

        {/* Tab 1: Upload / Paste */}
        {activeTab === 'upload' && (
          <div className="flex-1 overflow-y-auto space-y-4 pt-4 pr-1 min-h-0">

            {/* Clear separation notice */}
            <div
              className={`p-3 rounded-xl border text-[11px] leading-relaxed ${
                importMode === 'tahfidz' || importMode === 'guru_tahfidz'
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-950'
              }`}
            >
              {importMode === 'ngaji' && (
                <>
                  <strong>Mode Murni Siswa &amp; Guru BTQ:</strong> Hanya mengisi data <strong>Kelas BTQ</strong> &amp; <strong>Guru Ngaji</strong> (tidak mencampur kolom Tahfidz). Jika NISN sama dengan santri Tahfidz, status Tahfidz tetap terjaga terpisah.
                </>
              )}
              {importMode === 'tahfidz' && (
                <>
                  <strong>Mode Murni Santri &amp; Guru Tahfidz:</strong> Hanya mengisi data <strong>Halaqah Tahfidz</strong> &amp; <strong>Guru Tahfidz</strong> tanpa menimpa <strong>Kelas BTQ</strong> atau <strong>Guru Ngaji</strong> siswa.
                </>
              )}
              {importMode === 'guru_btq' && (
                <>
                  <strong>Mode Daftar Guru BTQ Sendiri:</strong> Semua guru pada format ini khusus didaftarkan ke peran <strong>Guru Ngaji (Kelas BTQ)</strong> beserta akun loginnya tanpa tercampur ke Guru Tahfidz.
                </>
              )}
              {importMode === 'guru_tahfidz' && (
                <>
                  <strong>Mode Daftar Guru Tahfidz Sendiri:</strong> Semua guru pada format ini khusus didaftarkan ke peran <strong>Guru Tahfidz (Program Tahfidz)</strong> beserta akun loginnya tanpa tercampur ke Guru BTQ.
                </>
              )}
            </div>

            {/* Template Download Bar */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <span className="font-bold text-slate-800">
                  Unduh Format {fmt.label}:
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
                    importMode === 'tahfidz' || importMode === 'guru_tahfidz'
                      ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                      : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                  }`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Contoh Format</span>
                </button>
              </div>
            </div>

            {/* File Upload Option */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Pilih File CSV ({fmt.label}) dari Komputer:
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
                      clearParsed();
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
                placeholder={`Tempel baris CSV format ${fmt.label} di sini...\n${fmt.header}`}
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed"
              />
            </div>

            {/* Preview for Ngaji */}
            {importMode === 'ngaji' && parsedNgajiRows.length > 0 && (
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Siap Diimpor (Siswa &amp; Guru BTQ): {parsedNgajiRows.length} Siswa</span>
                </div>

                <div className="max-h-36 overflow-y-auto border border-emerald-200/80 rounded-lg bg-white divide-y divide-slate-100 text-[11px]">
                  {parsedNgajiRows.slice(0, 8).map((row, i) => (
                    <div key={i} className="p-2 flex items-center justify-between gap-2">
                      <div>
                        <strong className="text-slate-800">{row.nama}</strong>{' '}
                        <span className="text-slate-500 font-mono">({row.nisn})</span>
                      </div>
                      <div className="text-slate-600 text-right">
                        {row.kelas} · {row.kelasBTQ} · <strong>{row.pengajar}</strong>
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

            {/* Preview for Tahfidz */}
            {importMode === 'tahfidz' && parsedTahfidzRows.length > 0 && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-amber-900 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-amber-600" />
                  <span>Siap Diimpor (Santri &amp; Guru Tahfidz): {parsedTahfidzRows.length} Santri</span>
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

            {/* Preview for Guru BTQ or Guru Tahfidz */}
            {(importMode === 'guru_btq' || importMode === 'guru_tahfidz') &&
              parsedTeacherRows.length > 0 && (
                <div
                  className={`p-3 rounded-xl border space-y-2 ${
                    importMode === 'guru_tahfidz'
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-emerald-50/60 border-emerald-200'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-slate-900 font-bold text-xs">
                    <CheckCircle2
                      className={`w-4 h-4 ${
                        importMode === 'guru_tahfidz' ? 'text-amber-600' : 'text-emerald-600'
                      }`}
                    />
                    <span>
                      Siap Diimpor ({fmt.label}): {parsedTeacherRows.length} Guru
                    </span>
                  </div>

                  <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg bg-white divide-y divide-slate-100 text-[11px]">
                    {parsedTeacherRows.slice(0, 10).map((row, i) => (
                      <div key={i} className="p-2 flex items-center justify-between gap-2">
                        <strong className="text-slate-800">{row.nama}</strong>
                        <div className="text-slate-600 text-right">
                          {row.kelompok} · {row.ruangan}
                        </div>
                      </div>
                    ))}
                    {parsedTeacherRows.length > 10 && (
                      <div className="p-2 text-center text-slate-400 italic text-[10px]">
                        ... dan {parsedTeacherRows.length - 10} guru lainnya
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
                  Struktur Kolom: {fmt.label}
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

            {importMode === 'ngaji' && (
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
                      ['1', 'NISN', '0082600001', '10 digit nomor NISN unik anak.'],
                      ['2', 'NAMA_LENGKAP', 'NAMA SISWA BTQ', 'Nama lengkap siswa.'],
                      ['3', 'JENIS_KELAMIN', 'P / L', 'P untuk Putri, L untuk Putra.'],
                      ['4', 'KELAS_FORMAL', '7D / 8E / 9A', 'Rombel formal sekolah.'],
                      ['5', 'KELOMPOK_BTQ', 'TILAWATI 4 PI', 'Kelas BTQ (Tilawati 1-5, Al-Qur\'an Pi/Pa).'],
                      ['6', 'PENGAJAR_BTQ', 'USTADZAH SITI', 'Nama Guru BTQ (masuk ke Dashboard Guru Ngaji).'],
                      ['7', 'RUANGAN', 'RUANGAN 7E', 'Lokasi ruangan kelas ngaji BTQ.'],
                      ['8', 'WALI_KELAS', 'USTADZAH NURUL', 'Nama wali kelas formal siswa.'],
                      ['9', 'NILAI_UJIAN', '90', 'Nilai angka hasil tes kenaikan BTQ (0-100).'],
                      ['10', 'PREDIKAT', 'MUMTAZ', 'MUMTAZ, JAYYID, MAQBUL, ROSHIB.'],
                      ['11', 'NATIJAH', 'Naik Jilid 5', 'Status kenaikan jilid/tingkat BTQ.'],
                      ['12', 'CATATAN_MAKHRAJ', 'Lancar dan tartil', 'Catatan fashahah dan tajwid BTQ.']
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
            )}

            {importMode === 'tahfidz' && (
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
                      ['1', 'NISN', '0082600002', 'NISN unik santri (otomatis terhubung jika sudah ada di BTQ).'],
                      ['2', 'NAMA_LENGKAP', 'NAMA SANTRI TAHFIDZ', 'Nama lengkap santri program Tahfidz.'],
                      ['3', 'JENIS_KELAMIN', 'L / P', 'L untuk Putra, P untuk Putri.'],
                      ['4', 'KELAS_FORMAL', '7A / 8B / 9C', 'Kelas formal di sekolah.'],
                      ['5', 'HALAQAH_TAHFIDZ', 'HALAQAH TAHFIDZ JUZ 30', 'Nama halaqah khusus program Tahfidz.'],
                      ['6', 'PEMBIMBING_TAHFIDZ', 'USTADZ FAUZAN', 'Nama Guru Tahfidz (masuk ke Dashboard Guru Tahfidz).'],
                      ['7', 'RUANGAN_TAHFIDZ', 'MASJID AL-IKHLAS', 'Lokasi halaqah Tahfidz berlangsung.'],
                      ['8', 'TARGET_JUZ', 'Juz 30 & 29', 'Target hafalan santri pada semester berjalan.'],
                      ['9', 'TOTAL_HAFALAN', '1.5 Juz', 'Akumulasi total hafalan yang telah dicapai.'],
                      ['10', 'HAFALAN_TERAKHIR', 'QS. An-Naba: 1-40', 'Surat & ayat setoran hafalan terakhir.'],
                      ['11', 'KELANCARAN', 'Sangat Lancar (Mumtaz)', 'Sangat Lancar (Mumtaz) / Lancar (Jayyid Jiddan) / Cukup (Jayyid).'],
                      ['12', 'CATATAN_TAHFIDZ', 'Mutqin siap tasmi', 'Catatan murojaah / tajwid dari Guru Tahfidz.']
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

            {importMode === 'guru_btq' && (
              <div className="border border-teal-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-teal-50 text-teal-950 font-bold uppercase border-b border-teal-200">
                    <tr>
                      <th className="p-2.5">No</th>
                      <th className="p-2.5">Nama Kolom</th>
                      <th className="p-2.5">Contoh Pengisian</th>
                      <th className="p-2.5">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {[
                      ['1', 'NAMA_GURU_BTQ', 'USTADZAH SITI', 'Nama lengkap Ustadz/ah pengajar kelas BTQ.'],
                      ['2', 'KELOMPOK_BTQ', 'TILAWATI 4 PI, TILAWATI 5 PI', 'Kelas BTQ yang diampu (pisahkan dengan koma jika >1 kelas).'],
                      ['3', 'RUANGAN_BTQ', 'RUANGAN 7E', 'Lokasi ruang mengajar BTQ.'],
                      ['4', 'KONTAK_WA', '081234567890', 'Nomor WhatsApp guru BTQ (opsional).'],
                      ['5', 'EMAIL_GOOGLE', 'ustadzah.siti@gmail.com', 'Alamat Gmail guru untuk Login Cloud Online (opsional).']
                    ].map(([no, col, ex, desc]) => (
                      <tr key={no}>
                        <td className="p-2.5 font-mono">{no}</td>
                        <td className="p-2.5 font-bold font-mono text-teal-800">{col}</td>
                        <td className="p-2.5 font-semibold">{ex}</td>
                        <td className="p-2.5 text-slate-500">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {importMode === 'guru_tahfidz' && (
              <div className="border border-orange-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-orange-50 text-orange-950 font-bold uppercase border-b border-orange-200">
                    <tr>
                      <th className="p-2.5">No</th>
                      <th className="p-2.5">Nama Kolom</th>
                      <th className="p-2.5">Contoh Pengisian</th>
                      <th className="p-2.5">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {[
                      ['1', 'NAMA_GURU_TAHFIDZ', 'USTADZ FAUZAN', 'Nama lengkap Ustadz/ah pembimbing program Tahfidz.'],
                      ['2', 'HALAQAH_TAHFIDZ', 'HALAQAH TAHFIDZ JUZ 30', 'Nama halaqah Tahfidz binaan.'],
                      ['3', 'RUANGAN_TAHFIDZ', 'MASJID AL-IKHLAS', 'Lokasi halaqah Tahfidz berlangsung.'],
                      ['4', 'KONTAK_WA', '081345678901', 'Nomor WhatsApp pembimbing Tahfidz (opsional).'],
                      ['5', 'EMAIL_GOOGLE', 'ustadz.fauzan@gmail.com', 'Alamat Gmail pembimbing untuk Login Cloud Online (opsional).']
                    ].map(([no, col, ex, desc]) => (
                      <tr key={no}>
                        <td className="p-2.5 font-mono">{no}</td>
                        <td className="p-2.5 font-bold font-mono text-orange-800">{col}</td>
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
              disabled={currentCount === 0 || isImporting}
              onClick={handleExecuteImport}
              className={`py-2 px-5 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 ${
                currentCount > 0 && !isImporting
                  ? importMode === 'tahfidz' || importMode === 'guru_tahfidz'
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 cursor-pointer'
                    : 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isImporting
                  ? 'Mengimpor ke Cloud...'
                  : currentCount > 0
                  ? `Import ${currentCount} Data (${fmt.label})`
                  : 'Import Data'}
              </span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
