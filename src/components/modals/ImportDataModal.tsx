import React, { useState } from 'react';
import { Student } from '../../types';
import { storage } from '../../services/storage';
import { X, FileSpreadsheet, Download, Upload, CheckCircle2, AlertCircle, Copy, Check } from 'lucide-react';

interface ImportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

const CSV_HEADER = 'NISN,NAMA_LENGKAP,JENIS_KELAMIN,KELAS_FORMAL,KELOMPOK_BTQ,PENGAJAR_BTQ,RUANGAN,WALI_KELAS,TAHFIDZ,TARGET_JUZ,NILAI_UJIAN,PREDIKAT,NATIJAH,CATATAN_MAKHRAJ';

const SAMPLE_CSV = `${CSV_HEADER}
0082600001,ADARAZAHRA AALEYAH RIFFANI,P,7D,AL-QUR'AN PI D,UMI KULSUM,RUANGAN 7E,USTADZAH NURUL M.PD,YA,Juz 30 & 29,93,MUMTAZ,MUMTAZ,Lancar makhraj dan tartil
0082600002,ADILNA FIRZANAH,P,7D,TILAWATI 4 PI,TAUFIQURRAHMAN S.PD,RUANGAN 7E,USTADZAH NURUL M.PD,TIDAK,-,72,JAYYID,Tetap Jilid 4,Belum Lancar mad thabi'i
0082600011,ADITYA SYAM FIRDAUS,L,7A,TILAWATI 3 PA,USTADZ RIDWAN S.PD.I,RUANGAN 7A,USTADZ AHMAD DAHLAN S.PD,TIDAK,-,82,JAYYID,Naik ke Jilid 4,Lancar makharijul huruf
0082600012,AHMAD FAUZAN PRATAMA,L,7A,TILAWATI 4 PA,USTADZ RIDWAN S.PD.I,RUANGAN 7A,USTADZ AHMAD DAHLAN S.PD,YA,Juz 30 & 29,90,MUMTAZ,Naik ke Jilid 5,Fashahah dan suara tartil
0062400111,MIKAYLA ALYA NURFADILAH,P,9E,KHATAM AL-QUR'AN PI,SITI FATIMAH S.PD.I,RUANGAN 9E,USTADZAH HASANAH M.PD,YA,5 Juz,96,MUMTAZ,KHATAM 30 JUZ & TASMI 5 JUZ,Sangat membanggakan siap wisuda`;

export const ImportDataModal: React.FC<ImportDataModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onNotify
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'format'>('upload');
  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<Omit<Student, 'id'>[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [hasCopied, setHasCopied] = useState(false);

  if (!isOpen) return null;

  // Function to parse CSV or TSV text
  const parseCSVText = (text: string) => {
    const lines = text
      .trim()
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0);

    if (lines.length === 0) {
      setParsedRows([]);
      setParseErrors([]);
      return;
    }

    const firstLine = lines[0];
    const isHeader =
      firstLine.toUpperCase().includes('NISN') &&
      firstLine.toUpperCase().includes('NAMA');

    const dataLines = isHeader ? lines.slice(1) : lines;
    const errors: string[] = [];
    const validStudents: Omit<Student, 'id'>[] = [];

    dataLines.forEach((line, index) => {
      // Split by tab or comma, handling quotes if present
      const delimiter = line.includes('\t') ? '\t' : ',';
      
      // Simple regex split for CSV with quotes
      const regex = delimiter === ','
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

      // If regex match didn't yield columns, fallback to direct split
      const cols = matches.length > 1 ? matches : line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));

      if (cols.length < 2) {
        errors.push(`Baris ${index + (isHeader ? 2 : 1)}: Format tidak lengkap (minimal butuh NISN & Nama).`);
        return;
      }

      const nisn = cols[0] || '';
      const nama = cols[1] || '';
      const gender = (cols[2]?.toUpperCase() === 'L' ? 'L' : 'P') as 'L' | 'P';
      const kelas = cols[3] || '7D';
      const kelasBTQ = cols[4] || 'TILAWATI 4 PI';
      const pengajar = cols[5] || 'USTADZ RIDWAN S.PD.I';
      const ruangan = cols[6] || `RUANGAN ${kelas}`;
      const waliKelas = cols[7] || 'USTADZAH NURUL M.PD';
      const isTahfidz = ['YA', 'TRUE', '1', 'YES', 'TAHFIDZ'].includes(cols[8]?.toUpperCase() || '');
      const targetJuz = cols[9] || (isTahfidz ? 'Juz 30' : undefined);
      const nilai = Number(cols[10]) || 80;
      const predikat = (cols[11]?.toUpperCase() || (nilai >= 85 ? 'MUMTAZ' : nilai >= 75 ? 'JAYYID' : 'MAQBUL')) as any;
      const natijah = cols[12] || (nilai >= 75 ? 'Lulus Kenaikan Tingkat' : 'Tetap');
      const catatan = cols[13] || 'Lancar dan tertib';

      if (!nisn) {
        errors.push(`Baris ${index + (isHeader ? 2 : 1)}: NISN tidak boleh kosong.`);
        return;
      }

      validStudents.push({
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

    setParsedRows(validStudents);
    setParseErrors(errors);
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
    const content = withSamples ? SAMPLE_CSV : CSV_HEADER + '\n';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = withSamples ? 'contoh_data_siswa_spemda.csv' : 'template_import_spemda.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onNotify('success', 'File CSV Diunduh', `Berhasil mengunduh ${link.download}`);
  };

  const handleCopySample = () => {
    navigator.clipboard.writeText(SAMPLE_CSV);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2500);
    onNotify('info', 'Contoh Disalin', 'Data CSV sampel berhasil disalin ke clipboard.');
  };

  const handleExecuteImport = () => {
    if (parsedRows.length === 0) {
      onNotify('error', 'Tidak Ada Data', 'Silakan tempel atau unggah file data yang valid terlebih dahulu.');
      return;
    }

    const res = storage.importStudentsBatch(parsedRows);
    onNotify(
      'success',
      'Import & Sinkronisasi Guru Berhasil',
      `Berhasil memproses ${parsedRows.length} siswa (${res.added} baru, ${res.updated} diperbarui). ${res.teachersCount} guru ngaji & tahfidz otomatis dimasukkan dari data siswa, serta guru contoh telah dihapus.`
    );
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative border border-slate-200 max-h-[92vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Format & Import Massal Data Siswa, Pengajar & NISN
              </h2>
              <p className="text-[11px] text-slate-500">
                Impor data ratusan siswa, kelompok BTQ, ruangan, dan nilai sekaligus
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg">
            <X className="w-4 h-4" />
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
            1. Upload & Tempel Data ({parsedRows.length} Terdeteksi)
          </button>
          <button
            onClick={() => setActiveTab('format')}
            className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${
              activeTab === 'format'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Panduan Struktur Format Kolom
          </button>
        </div>

        {/* Tab 1: Upload / Paste */}
        {activeTab === 'upload' && (
          <div className="flex-1 overflow-y-auto space-y-4 pt-4 pr-1 min-h-0">
            
            {/* Template Download Bar */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <span className="font-bold text-slate-800">Unduh Format Siap Pakai:</span>
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
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Template Berisi Contoh</span>
                </button>
              </div>
            </div>

            {/* File Upload Option */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Pilih File CSV dari Komputer:
              </label>
              <label className="border-2 border-dashed border-slate-300 hover:border-emerald-600 rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer bg-slate-50/50 hover:bg-emerald-50/30 transition-colors">
                <Upload className="w-4 h-4 text-emerald-700" />
                <span className="text-xs font-semibold text-slate-700">
                  Klik untuk memilih file .CSV (atau seret kemari)
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
                      setParsedRows([]);
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
                placeholder="Tempel baris data CSV di sini... Contoh:
0082600001,ADARAZAHRA AALEYAH,P,7D,AL-QUR'AN PI D,UMI KULSUM,RUANGAN 7E,USTADZAH NURUL M.PD,YA,Juz 30,93,MUMTAZ,MUMTAZ,Lancar"
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed"
              ></textarea>
            </div>

            {/* Status and Preview */}
            {parsedRows.length > 0 && (
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Siap Diimpor: {parsedRows.length} Siswa Teridentifikasi</span>
                </div>

                <div className="max-h-36 overflow-y-auto border border-emerald-200/80 rounded-lg bg-white divide-y divide-slate-100 text-[11px]">
                  {parsedRows.slice(0, 8).map((row, i) => (
                    <div key={i} className="p-2 flex items-center justify-between">
                      <div>
                        <strong className="text-slate-800">{row.nama}</strong>{' '}
                        <span className="text-slate-500 font-mono">({row.nisn})</span>
                      </div>
                      <div className="text-slate-600">
                        {row.kelas} · {row.kelasBTQ} · {row.pengajar}
                      </div>
                    </div>
                  ))}
                  {parsedRows.length > 8 && (
                    <div className="p-2 text-center text-slate-400 italic text-[10px]">
                      ... dan {parsedRows.length - 8} siswa lainnya
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
                <p className="font-bold text-slate-900">14 Kolom Standar SIM-Qur'an SPEMDA</p>
                <p className="text-[11px] text-slate-500">Urutan kolom pada spreadsheet Excel / Google Sheets</p>
              </div>
              <button
                type="button"
                onClick={handleCopySample}
                className="px-2.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-xs flex items-center gap-1"
              >
                {hasCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                <span>{hasCopied ? 'Tersalin!' : 'Salin Contoh'}</span>
              </button>
            </div>

            {/* Specifications Table */}
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
                  <tr>
                    <td className="p-2.5 font-mono">1</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">NISN</td>
                    <td className="p-2.5 font-mono">0082600001</td>
                    <td className="p-2.5 text-slate-500">10 digit nomor NISN unik anak (kunci pencarian wali murid).</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">2</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">NAMA_LENGKAP</td>
                    <td className="p-2.5 font-bold">ADARAZAHRA AALEYAH</td>
                    <td className="p-2.5 text-slate-500">Nama lengkap siswa (huruf kapital).</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">3</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">JENIS_KELAMIN</td>
                    <td className="p-2.5 font-mono font-bold">P / L</td>
                    <td className="p-2.5 text-slate-500"><strong>P</strong> untuk Putri, <strong>L</strong> untuk Putra.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">4</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">KELAS_FORMAL</td>
                    <td className="p-2.5 font-bold">7D / 7A / 8E / 9A</td>
                    <td className="p-2.5 text-slate-500">Rombel formal sekolah (7A–7F, 8A–8G, 9A–9G).</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">5</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">KELOMPOK_BTQ</td>
                    <td className="p-2.5 font-bold">AL-QUR'AN PI D</td>
                    <td className="p-2.5 text-slate-500">Tilawati Jilid 1–5, Al-Qur'an Pi/Pa, Khatam.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">6</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">PENGAJAR_BTQ</td>
                    <td className="p-2.5 font-bold">UMI KULSUM</td>
                    <td className="p-2.5 text-slate-500">Nama guru ngaji / ustadz pembina halaqah.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">7</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">RUANGAN</td>
                    <td className="p-2.5 font-mono">RUANGAN 7E / LAB PAI</td>
                    <td className="p-2.5 text-slate-500">Lokasi ruangan tempat halaqah berlangsung.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">8</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">WALI_KELAS</td>
                    <td className="p-2.5">USTADZAH NURUL M.PD</td>
                    <td className="p-2.5 text-slate-500">Nama wali kelas siswa.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">9</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">TAHFIDZ</td>
                    <td className="p-2.5 font-bold">YA / TIDAK</td>
                    <td className="p-2.5 text-slate-500">Apakah anak mengikuti program khusus Tahfidz.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">10</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">TARGET_JUZ</td>
                    <td className="p-2.5">Juz 30 & 29</td>
                    <td className="p-2.5 text-slate-500">Target juz hafalan (kosongkan jika non-tahfidz).</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">11</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">NILAI_UJIAN</td>
                    <td className="p-2.5 font-mono font-bold">93</td>
                    <td className="p-2.5 text-slate-500">Nilai angka hasil ujian tes kenaikan (0 - 100).</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">12</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">PREDIKAT</td>
                    <td className="p-2.5 font-bold">MUMTAZ</td>
                    <td className="p-2.5 text-slate-500">MUMTAZ (≥85), JAYYID (75-84), MAQBUL (65-74), ROSHIB.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">13</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">NATIJAH</td>
                    <td className="p-2.5 font-bold">MUMTAZ / Naik Jilid 5</td>
                    <td className="p-2.5 text-slate-500">Keputusan kelulusan hasil munaqosyah.</td>
                  </tr>
                  <tr>
                    <td className="p-2.5 font-mono">14</td>
                    <td className="p-2.5 font-bold font-mono text-emerald-800">CATATAN_MAKHRAJ</td>
                    <td className="p-2.5 italic">Lancar makhraj dan tartil</td>
                    <td className="p-2.5 text-slate-500">Catatan tajwid dan fashahah dari penguji.</td>
                  </tr>
                </tbody>
              </table>
            </div>

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
              disabled={parsedRows.length === 0}
              onClick={handleExecuteImport}
              className={`py-2 px-5 rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5 ${
                parsedRows.length > 0
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Import {parsedRows.length > 0 ? `${parsedRows.length} Siswa ke Database` : 'Data'}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
