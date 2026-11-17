import React, { useState, useMemo, useEffect } from 'react';
import {
  Student,
  BacaanRecord,
  TahfidzRecord,
  AbsensiRecord,
  UserSession,
  RaporPrintStatus,
  RaporPrintBatchLog,
  RaporSettings
} from '../types';
import { storage } from '../services/storage';
import { downloadRaporPdf, downloadClassSummaryPdf } from '../services/raporPdf';
import { RaporPrintableSheet, ClassSummaryPrintableSheet } from './RaporPrintableSheet';
import { detectBtqClassGender, isValidBtqClass } from '../utils/access';
import {
  Printer,
  ClipboardList,
  CheckCircle2,
  Clock,
  Users,
  Search,
  Download,
  FileDown,
  RotateCcw,
  Eye,
  Settings2,
  CheckSquare,
  Square,
  FileSpreadsheet,
  History,
  X
} from 'lucide-react';

interface ReportCenterPanelProps {
  user: UserSession;
  students: Student[];
  bacaanList: BacaanRecord[];
  tahfidzList: TahfidzRecord[];
  absensiList: AbsensiRecord[];
  preselectedStudentNisn?: string | null;
  onClearPreselected?: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

type PrintPayload =
  | { mode: 'rapor'; students: Student[] }
  | { mode: 'rekap_kelas'; kelasLabel: string; students: Student[] }
  | null;

export const ReportCenterPanel: React.FC<ReportCenterPanelProps> = ({
  user,
  students,
  bacaanList,
  tahfidzList,
  absensiList,
  preselectedStudentNisn,
  onClearPreselected,
  onNotify
}) => {
  const [subTab, setSubTab] = useState<'cetak' | 'rekap'>('cetak');

  // Filter states for Cetak Massal
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [selectedBTQ, setSelectedBTQ] = useState<string>('');
  const [programFilter, setProgramFilter] = useState<'all' | 'tahfidz' | 'reguler'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'printed' | 'unprinted'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedNisns, setSelectedNisns] = useState<Set<string>>(new Set());

  // Rekap filters
  const [rekapClassFilter, setRekapClassFilter] = useState<string>('ALL');
  const [rekapStatusFilter, setRekapStatusFilter] = useState<'all' | 'printed' | 'unprinted'>('all');
  const [rekapSearch, setRekapSearch] = useState<string>('');

  // Settings & Print Tracking
  const [settings, setSettings] = useState<RaporSettings>(() => storage.getRaporSettings());
  const [showSettingsEditor, setShowSettingsEditor] = useState(false);
  const [printStatuses, setPrintStatuses] = useState<Record<string, RaporPrintStatus>>(() =>
    storage.getRaporPrintStatuses()
  );
  const [printLogs, setPrintLogs] = useState<RaporPrintBatchLog[]>(() =>
    storage.getRaporPrintLogs()
  );

  // Preview & Print Payload
  const [previewStudent, setPreviewStudent] = useState<Student | null>(null);
  const [printPayload, setPrintPayload] = useState<PrintPayload>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const refreshPrintState = () => {
    setPrintStatuses(storage.getRaporPrintStatuses());
    setPrintLogs(storage.getRaporPrintLogs());
  };

  // Distinct formal classes from student data sorted naturally (7A, 7B, ..., 9G)
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (s.kelas && s.kelas.trim() && s.kelas !== '-') {
        set.add(s.kelas.trim().toUpperCase());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students]);

  const availableBTQ = useMemo(() => {
    const set = new Set<string>();
    students.forEach(s => {
      if (isValidBtqClass(s.kelasBTQ)) {
        set.add(s.kelasBTQ.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students]);

  const groupedBTQ = useMemo(() => {
    const putri: string[] = [];
    const putra: string[] = [];
    const other: string[] = [];
    availableBTQ.forEach(k => {
      const g = detectBtqClassGender(k);
      if (g === 'PI') putri.push(k);
      else if (g === 'PA') putra.push(k);
      else other.push(k);
    });
    return { putri, putra, other };
  }, [availableBTQ]);

  // Handle preselected student coming from Admin Student List quick-print button
  useEffect(() => {
    if (!preselectedStudentNisn) return;
    const found = students.find(s => s.nisn === preselectedStudentNisn);
    if (found) {
      setSubTab('cetak');
      setSelectedClass(found.kelas.toUpperCase());
      setSelectedNisns(new Set([found.nisn]));
      setPreviewStudent(found);
      onClearPreselected?.();
    }
  }, [preselectedStudentNisn, students, onClearPreselected]);

  // Filtered students for Cetak Massal
  const cetakStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return students
      .filter(s => {
        if (selectedClass !== 'ALL' && s.kelas.trim().toUpperCase() !== selectedClass) {
          return false;
        }
        if (selectedBTQ && s.kelasBTQ.trim().toUpperCase() !== selectedBTQ.trim().toUpperCase()) {
          return false;
        }
        if (programFilter === 'tahfidz' && !s.isTahfidz) return false;
        if (programFilter === 'reguler' && s.isTahfidz) return false;

        const isPrinted = Boolean(printStatuses[s.nisn]?.printCount);
        if (statusFilter === 'printed' && !isPrinted) return false;
        if (statusFilter === 'unprinted' && isPrinted) return false;

        if (
          q &&
          !s.nama.toLowerCase().includes(q) &&
          !s.nisn.toLowerCase().includes(q) &&
          !s.kelasBTQ.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const clsCmp = a.kelas.localeCompare(b.kelas, undefined, { numeric: true });
        return clsCmp !== 0 ? clsCmp : a.nama.localeCompare(b.nama);
      });
  }, [students, selectedClass, selectedBTQ, programFilter, statusFilter, searchTerm, printStatuses]);

  // Auto-select all students in class whenever class filter changes (for convenient 1-click mass printing)
  useEffect(() => {
    if (selectedClass !== 'ALL') {
      const classStudentNisns = students
        .filter(s => s.kelas.trim().toUpperCase() === selectedClass)
        .map(s => s.nisn);
      setSelectedNisns(new Set(classStudentNisns));
    }
  }, [selectedClass, students]);

  // Class breakdown summary for Rekap Cetak Rapor
  const classRekapSummary = useMemo(() => {
    return availableClasses.map(cls => {
      const inClass = students.filter(s => s.kelas.trim().toUpperCase() === cls);
      const printedList = inClass.filter(s => Boolean(printStatuses[s.nisn]?.printCount));
      const printedCount = printedList.length;
      const unprintedCount = inClass.length - printedCount;
      const pct = inClass.length > 0 ? Math.round((printedCount / inClass.length) * 100) : 0;

      let latestPrintAt = '';
      printedList.forEach(s => {
        const dt = printStatuses[s.nisn]?.lastPrintedAt;
        if (dt && dt > latestPrintAt) latestPrintAt = dt;
      });

      return {
        kelas: cls,
        total: inClass.length,
        printedCount,
        unprintedCount,
        pct,
        latestPrintAt,
        students: inClass
      };
    });
  }, [availableClasses, students, printStatuses]);

  // Global recap metrics
  const globalMetrics = useMemo(() => {
    const total = students.length;
    const printed = students.filter(s => Boolean(printStatuses[s.nisn]?.printCount)).length;
    const unprinted = total - printed;
    const totalBatches = printLogs.length;
    return { total, printed, unprinted, totalBatches };
  }, [students, printStatuses, printLogs]);

  // Rekap student table list
  const rekapStudentList = useMemo(() => {
    const q = rekapSearch.trim().toLowerCase();
    return students
      .filter(s => {
        if (rekapClassFilter !== 'ALL' && s.kelas.trim().toUpperCase() !== rekapClassFilter) {
          return false;
        }
        const isPrinted = Boolean(printStatuses[s.nisn]?.printCount);
        if (rekapStatusFilter === 'printed' && !isPrinted) return false;
        if (rekapStatusFilter === 'unprinted' && isPrinted) return false;
        if (
          q &&
          !s.nama.toLowerCase().includes(q) &&
          !s.nisn.toLowerCase().includes(q) &&
          !s.kelas.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        const clsCmp = a.kelas.localeCompare(b.kelas, undefined, { numeric: true });
        return clsCmp !== 0 ? clsCmp : a.nama.localeCompare(b.nama);
      });
  }, [students, rekapClassFilter, rekapStatusFilter, rekapSearch, printStatuses]);

  const toggleSelectNisn = (nisn: string) => {
    setSelectedNisns(prev => {
      const next = new Set(prev);
      if (next.has(nisn)) next.delete(nisn);
      else next.add(nisn);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedNisns(new Set(cetakStudents.map(s => s.nisn)));
  };

  const selectUnprintedFiltered = () => {
    setSelectedNisns(
      new Set(cetakStudents.filter(s => !printStatuses[s.nisn]?.printCount).map(s => s.nisn))
    );
  };

  const clearSelection = () => {
    setSelectedNisns(new Set());
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    storage.saveRaporSettings(settings);
    setShowSettingsEditor(false);
    onNotify('success', 'Pengaturan Rapor Disimpan', 'Kop surat dan tanda tangan rapor diperbarui.');
  };

  const triggerRaporPrint = (targetStudents: Student[], labelOverride?: string) => {
    if (targetStudents.length === 0) {
      onNotify('error', 'Belum Ada Siswa Dipilih', 'Centang minimal 1 siswa atau pilih kelas terlebih dahulu.');
      return;
    }

    const jenisCetak =
      targetStudents.length === 1 ? 'Rapor Siswa (Satuan)' : 'Rapor Siswa (Massal)';
    const kelasLabel =
      labelOverride ||
      (selectedClass === 'ALL' ? 'Lintas Kelas' : `Kelas ${selectedClass}`);

    storage.recordRaporPrintBatch({
      students: targetStudents,
      printedBy: user.nama,
      kelasLabel,
      jenisCetak,
      semester: settings.semester,
      tahunAjaran: settings.tahunAjaran
    });
    refreshPrintState();

    setPrintPayload({ mode: 'rapor', students: targetStudents });
    onNotify(
      'success',
      `Menyiapkan Cetak ${targetStudents.length} Rapor`,
      `Status cetak untuk ${kelasLabel} telah dicatat pada Rekap Cetak Rapor.`
    );

    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleDownloadRaporPdf = async (targetStudents: Student[], labelOverride?: string) => {
    if (targetStudents.length === 0) {
      onNotify('error', 'Belum Ada Siswa Dipilih', 'Centang minimal 1 siswa atau pilih kelas terlebih dahulu.');
      return;
    }

    setIsDownloadingPdf(true);
    try {
      const kelasLabel =
        labelOverride ||
        (targetStudents.length === 1
          ? `${targetStudents[0].kelas}_${targetStudents[0].nama}`
          : selectedClass === 'ALL'
          ? 'Lintas_Kelas'
          : `Kelas_${selectedClass}`);

      const fileName = await downloadRaporPdf({
        students: targetStudents,
        bacaanList,
        tahfidzList,
        absensiList,
        settings,
        fileLabel: kelasLabel
      });

      storage.recordRaporPrintBatch({
        students: targetStudents,
        printedBy: user.nama,
        kelasLabel: labelOverride || (selectedClass === 'ALL' ? 'Lintas Kelas' : `Kelas ${selectedClass}`),
        jenisCetak:
          targetStudents.length === 1 ? 'Download Rapor PDF (Satuan)' : 'Download Rapor PDF (Massal)',
        semester: settings.semester,
        tahunAjaran: settings.tahunAjaran
      });
      refreshPrintState();

      onNotify(
        'success',
        `Download Rapor PDF Berhasil (${targetStudents.length} Rapor)`,
        `File "${fileName}" telah diunduh dan tercatat di Rekap Rapor.`
      );
    } catch {
      onNotify('error', 'Gagal Membuat PDF Rapor', 'Terjadi kendala saat menyusun file PDF.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadClassSummaryPdf = async (kelasLabel: string, targetStudents: Student[]) => {
    if (targetStudents.length === 0) {
      onNotify('error', 'Data Kosong', 'Tidak ada data siswa pada kelas yang dipilih.');
      return;
    }

    setIsDownloadingPdf(true);
    try {
      const fileName = await downloadClassSummaryPdf({
        kelasLabel,
        students: targetStudents,
        printStatuses,
        settings
      });

      storage.recordRaporPrintBatch({
        students: targetStudents,
        printedBy: user.nama,
        kelasLabel,
        jenisCetak: 'Download Rekap Nilai (PDF)',
        semester: settings.semester,
        tahunAjaran: settings.tahunAjaran
      });
      refreshPrintState();

      onNotify('success', 'Rekap Nilai PDF Diunduh', `File "${fileName}" berhasil diunduh.`);
    } catch {
      onNotify('error', 'Gagal Mengunduh Rekap PDF', 'Terjadi kendala saat menyusun file PDF rekap.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const triggerClassSummaryPrint = (kelasLabel: string, targetStudents: Student[]) => {
    if (targetStudents.length === 0) {
      onNotify('error', 'Data Kosong', 'Tidak ada data siswa pada kelas yang dipilih.');
      return;
    }

    storage.recordRaporPrintBatch({
      students: targetStudents,
      printedBy: user.nama,
      kelasLabel,
      jenisCetak: 'Rekapitulasi Nilai Kelas',
      semester: settings.semester,
      tahunAjaran: settings.tahunAjaran
    });
    refreshPrintState();

    setPrintPayload({ mode: 'rekap_kelas', kelasLabel, students: targetStudents });
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleExportRekapCSV = () => {
    const headers = [
      'NISN',
      'Nama Siswa',
      'Kelas Formal',
      'Kelompok BTQ',
      'Capaian Terakhir',
      'Nilai Ujian',
      'Predikat',
      'Natijah',
      'Status Cetak Rapor',
      'Jumlah Cetak',
      'Terakhir Dicetak',
      'Dicetak Oleh'
    ];

    const rows = rekapStudentList.map(s => {
      const st = printStatuses[s.nisn];
      return [
        `"${s.nisn}"`,
        `"${s.nama}"`,
        `"${s.kelas}"`,
        `"${s.kelasBTQ}"`,
        `"${s.capaianTerakhir.tingkat} - ${s.capaianTerakhir.halamanAyat}"`,
        s.ujian.nilai,
        `"${s.ujian.predikat}"`,
        `"${s.ujian.natijah}"`,
        st ? '"Sudah Dicetak"' : '"Belum Dicetak"',
        st ? st.printCount : 0,
        `"${st ? new Date(st.lastPrintedAt).toLocaleString('id-ID') : '-'}"`,
        `"${st ? st.lastPrintedBy : '-'}"`
      ];
    });

    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute('download', `rekap_cetak_rapor_spemda_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onNotify('success', 'Rekap CSV Diunduh', `Berhasil mengekspor ${rekapStudentList.length} data rekap cetak rapor.`);
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  const selectedStudentsToPrint = useMemo(
    () => cetakStudents.filter(s => selectedNisns.has(s.nisn)),
    [cetakStudents, selectedNisns]
  );

  // Strict guard: only admin can use report printing
  if (user.role !== 'admin') return null;

  return (
    <div className="space-y-6">

      {/* SCREEN UI (Hidden during print) */}
      <div className="no-print space-y-6">

        {/* Top Control & Sub-Tabs Header */}
        <section className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <FileDown className="w-4 h-4 text-emerald-800" />
              <span>Pusat Download, Cetak & Rekap Rapor (Khusus Admin)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Unduh file PDF rapor atau cetak massal per kelas (1 siswa 1 halaman A4) sekaligus pantau rekap status seluruh kelas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                onClick={() => setSubTab('cetak')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                  subTab === 'cetak'
                    ? 'bg-emerald-800 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Download & Cetak Rapor</span>
              </button>

              <button
                onClick={() => setSubTab('rekap')}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                  subTab === 'rekap'
                    ? 'bg-emerald-800 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>Rekap Cetak Rapor ({globalMetrics.printed}/{globalMetrics.total})</span>
              </button>
            </div>

            <button
              onClick={() => setShowSettingsEditor(prev => !prev)}
              className="px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <Settings2 className="w-3.5 h-3.5 text-slate-600" />
              <span>Atur Kop & TTD Rapor</span>
            </button>
          </div>
        </section>

        {/* Editable Rapor Header & Signature Settings */}
        {showSettingsEditor && (
          <form
            onSubmit={handleSaveSettings}
            className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                Pengaturan Kop Surat, Tanggal & Penanda Tangan Rapor
              </h3>
              <button
                type="button"
                onClick={() => setShowSettingsEditor(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Tahun Ajaran</label>
                <input
                  type="text"
                  value={settings.tahunAjaran}
                  onChange={e => setSettings({ ...settings, tahunAjaran: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Semester</label>
                <select
                  value={settings.semester}
                  onChange={e => setSettings({ ...settings, semester: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                >
                  <option value="Ganjil">Ganjil</option>
                  <option value="Genap">Genap</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Tanggal Rapor</label>
                <input
                  type="text"
                  value={settings.tanggalRapor}
                  onChange={e => setSettings({ ...settings, tanggalRapor: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Kepala Sekolah</label>
                <input
                  type="text"
                  value={settings.kepalaSekolah}
                  onChange={e => setSettings({ ...settings, kepalaSekolah: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">NBM Kepala Sekolah</label>
                <input
                  type="text"
                  value={settings.nbmKepala}
                  onChange={e => setSettings({ ...settings, nbmKepala: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">Koordinator BTQ</label>
                <input
                  type="text"
                  value={settings.koordinator}
                  onChange={e => setSettings({ ...settings, koordinator: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl"
              >
                Simpan Pengaturan Rapor
              </button>
            </div>
          </form>
        )}

        {/* SUB-TAB 1: CETAK MASSAL PER KELAS */}
        {subTab === 'cetak' && (
          <div className="space-y-4">
            {students.length === 0 ? (
              <div className="p-10 bg-white rounded-2xl border border-dashed border-slate-300 text-center space-y-2">
                <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-700">Belum Ada Data Siswa</p>
                <p className="text-xs text-slate-500">
                  Silakan impor data siswa terlebih dahulu untuk mencetak rapor massal per kelas.
                </p>
              </div>
            ) : (
              <>
                {/* Class Quick Selector Strip */}
                <section className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wide">
                      1. Pilih Kelas Formal untuk Cetak Massal:
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Klik nama kelas untuk memilih seluruh siswa di kelas tersebut secara otomatis
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => setSelectedClass('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                        selectedClass === 'ALL'
                          ? 'bg-emerald-800 text-white border-emerald-800'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Semua Kelas ({students.length})
                    </button>

                    {classRekapSummary.map(item => (
                      <button
                        key={item.kelas}
                        onClick={() => setSelectedClass(item.kelas)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                          selectedClass === item.kelas
                            ? 'bg-emerald-800 text-white border-emerald-800 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50'
                        }`}
                      >
                        <span>Kelas {item.kelas}</span>
                        <span
                          className={`text-[10px] font-mono ${
                            selectedClass === item.kelas ? 'text-amber-300' : 'text-slate-400'
                          }`}
                        >
                          ({item.printedCount}/{item.total})
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Filter + Mass Print Action Toolbar */}
                <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={selectedBTQ}
                        onChange={e => setSelectedBTQ(e.target.value)}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-medium"
                      >
                        <option value="">Semua Kelompok BTQ (PI &amp; PA)</option>
                        {groupedBTQ.putri.length > 0 && (
                          <optgroup label="Kelas BTQ Putri (PI)">
                            {groupedBTQ.putri.map(b => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {groupedBTQ.putra.length > 0 && (
                          <optgroup label="Kelas BTQ Putra (PA)">
                            {groupedBTQ.putra.map(b => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {groupedBTQ.other.map(b => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>

                      <select
                        value={programFilter}
                        onChange={e => setProgramFilter(e.target.value as any)}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-medium"
                      >
                        <option value="all">Semua Program</option>
                        <option value="tahfidz">Khusus Program Tahfidz</option>
                        <option value="reguler">BTQ Reguler Saja</option>
                      </select>

                      <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as any)}
                        className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-medium"
                      >
                        <option value="all">Semua Status Cetak</option>
                        <option value="unprinted">Belum Dicetak</option>
                        <option value="printed">Sudah Dicetak</option>
                      </select>

                      <div className="relative w-full sm:w-52">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={e => setSearchTerm(e.target.value)}
                          placeholder="Cari nama / NISN..."
                          className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={selectAllFiltered}
                        className="px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg flex items-center gap-1"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Pilih Semua ({cetakStudents.length})</span>
                      </button>

                      <button
                        type="button"
                        onClick={selectUnprintedFiltered}
                        className="px-2.5 py-1.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg"
                      >
                        Pilih Belum Dicetak
                      </button>

                      {selectedNisns.size > 0 && (
                        <button
                          type="button"
                          onClick={clearSelection}
                          className="px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg"
                        >
                          Batal Pilih
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDownloadRaporPdf(selectedStudentsToPrint)}
                        disabled={selectedStudentsToPrint.length === 0 || isDownloadingPdf}
                        className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-2"
                      >
                        <FileDown className="w-4 h-4" />
                        <span>
                          {isDownloadingPdf
                            ? 'Menyusun PDF...'
                            : `Download Rapor PDF (${selectedStudentsToPrint.length})`}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => triggerRaporPrint(selectedStudentsToPrint)}
                        disabled={selectedStudentsToPrint.length === 0}
                        className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-2"
                      >
                        <Printer className="w-4 h-4" />
                        <span>
                          Cetak Massal ({selectedStudentsToPrint.length} Rapor)
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Checklist Student Table */}
                  <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200 sticky top-0 z-10">
                        <tr>
                          <th className="p-3 w-10 text-center">Pilih</th>
                          <th className="p-3">NISN</th>
                          <th className="p-3">Nama Siswa</th>
                          <th className="p-3">Kelas</th>
                          <th className="p-3">Kelompok BTQ</th>
                          <th className="p-3">Capaian & Nilai</th>
                          <th className="p-3">Status Cetak</th>
                          <th className="p-3 text-center">Aksi Satuan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cetakStudents.length > 0 ? (
                          cetakStudents.map(s => {
                            const isSelected = selectedNisns.has(s.nisn);
                            const st = printStatuses[s.nisn];
                            return (
                              <tr
                                key={s.id}
                                className={`transition-colors ${
                                  isSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50/70'
                                }`}
                              >
                                <td className="p-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => toggleSelectNisn(s.nisn)}
                                    className="text-emerald-800 hover:text-emerald-950"
                                    aria-label={`Pilih ${s.nama}`}
                                  >
                                    {isSelected ? (
                                      <CheckSquare className="w-4 h-4" />
                                    ) : (
                                      <Square className="w-4 h-4 text-slate-400" />
                                    )}
                                  </button>
                                </td>
                                <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                                  {s.nisn}
                                </td>
                                <td className="p-3 font-bold text-slate-900">
                                  {s.nama}{' '}
                                  {s.isTahfidz && (
                                    <span className="text-amber-600" title="Program Tahfidz">
                                      ★
                                    </span>
                                  )}
                                  <span className="block text-[10px] font-normal text-slate-400">
                                    Pengajar: {s.pengajar}
                                  </span>
                                </td>
                                <td className="p-3 font-bold text-slate-700">{s.kelas}</td>
                                <td className="p-3 font-semibold text-emerald-800">{s.kelasBTQ}</td>
                                <td className="p-3">
                                  <div className="font-semibold text-slate-800">
                                    {s.capaianTerakhir.tingkat}
                                  </div>
                                  <span className="text-[10px] text-slate-500">
                                    Ujian: {s.ujian.nilai} ({s.ujian.natijah})
                                  </span>
                                </td>
                                <td className="p-3">
                                  {st ? (
                                    <div className="text-emerald-700 font-bold flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                      <span>Sudah ({st.printCount}x)</span>
                                    </div>
                                  ) : (
                                    <span className="text-amber-700 font-semibold flex items-center gap-1">
                                      <Clock className="w-3.5 h-3.5 shrink-0" />
                                      <span>Belum Dicetak</span>
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewStudent(prev =>
                                          prev?.nisn === s.nisn ? null : s
                                        )
                                      }
                                      className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors"
                                      title="Pratinjau Rapor"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isDownloadingPdf}
                                      onClick={() =>
                                        handleDownloadRaporPdf([s], `Kelas_${s.kelas}_${s.nama}`)
                                      }
                                      className="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-300 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
                                      title="Download Rapor PDF Siswa Ini"
                                    >
                                      <FileDown className="w-3 h-3" />
                                      <span>PDF</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => triggerRaporPrint([s], `Kelas ${s.kelas}`)}
                                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
                                      title="Cetak Rapor Siswa Ini"
                                    >
                                      <Printer className="w-3 h-3" />
                                      <span>Cetak</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-slate-400">
                              Tidak ada siswa yang sesuai dengan filter pilihan Anda.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* On-Screen Rapor Preview Box */}
                {previewStudent && (
                  <section className="bg-slate-200/70 p-4 sm:p-6 rounded-2xl border border-slate-300 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                        Pratinjau Rapor A4 — {previewStudent.nama} ({previewStudent.kelas})
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isDownloadingPdf}
                          onClick={() =>
                            handleDownloadRaporPdf(
                              [previewStudent],
                              `Kelas_${previewStudent.kelas}_${previewStudent.nama}`
                            )
                          }
                          className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>Download PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            triggerRaporPrint([previewStudent], `Kelas ${previewStudent.kelas}`)
                          }
                          className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Cetak Rapor Ini</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewStudent(null)}
                          className="p-1.5 bg-white text-slate-600 hover:text-slate-900 rounded-lg border border-slate-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <RaporPrintableSheet
                      student={previewStudent}
                      bacaanList={bacaanList}
                      tahfidzList={tahfidzList}
                      absensiList={absensiList}
                      settings={settings}
                      isPreview
                    />
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* SUB-TAB 2: REKAP CETAK RAPOR */}
        {subTab === 'rekap' && (
          <div className="space-y-6">
            {/* 4 Metrics */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-white border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-medium">Total Siswa Wajib Rapor</span>
                  <Users className="w-4 h-4 text-slate-700" />
                </div>
                <span className="text-2xl font-black text-slate-900 font-mono tabular-nums">
                  {globalMetrics.total}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Tersebar di {availableClasses.length} kelas formal
                </span>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-medium">Rapor Sudah Dicetak</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                </div>
                <span className="text-2xl font-black text-emerald-700 font-mono tabular-nums">
                  {globalMetrics.printed}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {globalMetrics.total > 0
                    ? `${Math.round((globalMetrics.printed / globalMetrics.total) * 100)}% selesai dicetak`
                    : '0%'}
                </span>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-medium">Belum Dicetak</span>
                  <Clock className="w-4 h-4 text-amber-600" />
                </div>
                <span className="text-2xl font-black text-amber-700 font-mono tabular-nums">
                  {globalMetrics.unprinted}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Menunggu pencetakan admin
                </span>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-medium">Sesi Cetak Massal</span>
                  <History className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-2xl font-black text-blue-700 font-mono tabular-nums">
                  {globalMetrics.totalBatches}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Riwayat aktivitas cetak rapor
                </span>
              </div>
            </section>

            {/* Rekap Progres Cetak Per Kelas */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Rekapitulasi Cetak Rapor Tiap Kelas Formal
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pantau kelengkapan cetak rapor per kelas dan cetak massal siswa yang tersisa.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      storage.resetAllRaporStatuses();
                      refreshPrintState();
                      onNotify('info', 'Status Cetak Direset', 'Semua status cetak rapor diatur ulang menjadi Belum Dicetak.');
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Status Semester Baru</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Kelas</th>
                      <th className="p-3 text-center">Total Siswa</th>
                      <th className="p-3 text-center">Sudah Dicetak</th>
                      <th className="p-3 text-center">Belum Dicetak</th>
                      <th className="p-3">Progres Kelas</th>
                      <th className="p-3">Cetak Terakhir</th>
                      <th className="p-3 text-center">Aksi Cepat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classRekapSummary.length > 0 ? (
                      classRekapSummary.map(row => (
                        <tr key={row.kelas} className="hover:bg-slate-50/70">
                          <td className="p-3 font-extrabold text-slate-900">Kelas {row.kelas}</td>
                          <td className="p-3 text-center font-mono font-bold text-slate-700">
                            {row.total}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-700">
                            {row.printedCount}
                          </td>
                          <td className="p-3 text-center font-mono font-bold text-amber-700">
                            {row.unprintedCount}
                          </td>
                          <td className="p-3 min-w-[140px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-emerald-700 transition-all"
                                  style={{ width: `${row.pct}%` }}
                                />
                              </div>
                              <span className="font-mono text-[11px] font-bold text-slate-700 w-9 text-right">
                                {row.pct}%
                              </span>
                            </div>
                          </td>
                          <td className="p-3 font-mono text-[11px] text-slate-500">
                            {formatDateTime(row.latestPrintAt)}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              <button
                                type="button"
                                disabled={isDownloadingPdf}
                                onClick={() =>
                                  handleDownloadRaporPdf(row.students, `Kelas ${row.kelas}`)
                                }
                                className="px-2.5 py-1 bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-300 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
                              >
                                <FileDown className="w-3 h-3" />
                                <span>Download PDF</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => triggerRaporPrint(row.students, `Kelas ${row.kelas}`)}
                                className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Cetak Kelas</span>
                              </button>

                              {row.unprintedCount > 0 && row.printedCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    triggerRaporPrint(
                                      row.students.filter(s => !printStatuses[s.nisn]?.printCount),
                                      `Sisa Kelas ${row.kelas}`
                                    )
                                  }
                                  className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[11px] font-bold"
                                >
                                  Cetak Sisa ({row.unprintedCount})
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  triggerClassSummaryPrint(`Kelas ${row.kelas}`, row.students)
                                }
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-semibold"
                                title="Cetak Daftar Rekap Nilai Kelas"
                              >
                                Rekap Nilai
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400">
                          Belum ada data kelas terdaftar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Detail Status Cetak Per Siswa */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={rekapClassFilter}
                    onChange={e => setRekapClassFilter(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-medium"
                  >
                    <option value="ALL">Semua Kelas Formal</option>
                    {availableClasses.map(c => (
                      <option key={c} value={c}>
                        Kelas {c}
                      </option>
                    ))}
                  </select>

                  <select
                    value={rekapStatusFilter}
                    onChange={e => setRekapStatusFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 font-medium"
                  >
                    <option value="all">Semua Status Cetak</option>
                    <option value="printed">Sudah Dicetak</option>
                    <option value="unprinted">Belum Dicetak</option>
                  </select>

                  <div className="relative w-full sm:w-56">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={rekapSearch}
                      onChange={e => setRekapSearch(e.target.value)}
                      placeholder="Cari nama atau NISN..."
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isDownloadingPdf}
                    onClick={() =>
                      handleDownloadClassSummaryPdf(
                        rekapClassFilter === 'ALL' ? 'Semua Kelas' : `Kelas ${rekapClassFilter}`,
                        rekapStudentList
                      )
                    }
                    className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-300 rounded-lg flex items-center gap-1.5"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>Download Rekap PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      triggerClassSummaryPrint(
                        rekapClassFilter === 'ALL' ? 'Semua Kelas' : `Kelas ${rekapClassFilter}`,
                        rekapStudentList
                      )
                    }
                    className="px-3 py-1.5 text-xs font-bold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Cetak Tabel Rekap</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportRekapCSV}
                    className="px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 rounded-lg flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Rekap CSV</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="p-3">NISN</th>
                      <th className="p-3">Nama Siswa</th>
                      <th className="p-3">Kelas</th>
                      <th className="p-3">Kelompok BTQ</th>
                      <th className="p-3">Nilai Ujian</th>
                      <th className="p-3">Status Cetak</th>
                      <th className="p-3">Terakhir Dicetak</th>
                      <th className="p-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rekapStudentList.length > 0 ? (
                      rekapStudentList.map(s => {
                        const st = printStatuses[s.nisn];
                        return (
                          <tr key={s.id} className="hover:bg-slate-50/70">
                            <td className="p-3 font-mono text-slate-500">{s.nisn}</td>
                            <td className="p-3 font-bold text-slate-900">{s.nama}</td>
                            <td className="p-3 font-semibold text-slate-700">{s.kelas}</td>
                            <td className="p-3 text-emerald-800 font-medium">{s.kelasBTQ}</td>
                            <td className="p-3 font-mono">
                              <strong>{s.ujian.nilai}</strong> ({s.ujian.natijah})
                            </td>
                            <td className="p-3">
                              {st ? (
                                <span className="text-emerald-700 font-bold">
                                  Sudah Dicetak ({st.printCount}x)
                                </span>
                              ) : (
                                <span className="text-amber-700 font-semibold">Belum Dicetak</span>
                              )}
                            </td>
                            <td className="p-3 text-[11px] font-mono text-slate-500">
                              {st ? `${formatDateTime(st.lastPrintedAt)} · ${st.lastPrintedBy}` : '-'}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={isDownloadingPdf}
                                  onClick={() =>
                                    handleDownloadRaporPdf([s], `Kelas_${s.kelas}_${s.nama}`)
                                  }
                                  className="px-2 py-1 bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-300 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
                                  title="Download Rapor PDF"
                                >
                                  <FileDown className="w-3 h-3" />
                                  <span>PDF</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => triggerRaporPrint([s], `Kelas ${s.kelas}`)}
                                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold"
                                >
                                  {st ? 'Cetak Ulang' : 'Cetak'}
                                </button>
                                {st && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      storage.resetStudentRaporStatus(s.nisn);
                                      refreshPrintState();
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-700 rounded"
                                    title="Reset status cetak siswa ini"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-slate-400">
                          Tidak ada data siswa yang cocok dengan filter rekap.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Riwayat Sesi Cetak Massal */}
            <section className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/70">
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                  Riwayat Aktivitas Cetak Rapor & Rekap ({printLogs.length} Sesi)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-3">Waktu Cetak</th>
                      <th className="p-3">Jenis Cetak</th>
                      <th className="p-3">Kelas / Lingkup</th>
                      <th className="p-3 text-center">Jumlah Rapor</th>
                      <th className="p-3">Periode</th>
                      <th className="p-3">Dicetak Oleh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {printLogs.length > 0 ? (
                      printLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50/60">
                          <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {formatDateTime(log.printedAt)}
                          </td>
                          <td className="p-3 font-bold text-slate-800">{log.jenisCetak}</td>
                          <td className="p-3 font-semibold text-emerald-800">{log.kelasLabel}</td>
                          <td className="p-3 text-center font-mono font-bold">{log.totalRapor}</td>
                          <td className="p-3 text-slate-600">
                            Sem. {log.semester} ({log.tahunAjaran})
                          </td>
                          <td className="p-3 text-slate-700 font-medium">{log.printedBy}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400">
                          Belum ada riwayat cetak rapor tercatat. Gunakan menu Cetak Massal Per Kelas untuk mulai mencetak.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

      </div>

      {/* PRINT-ONLY CONTAINER (Only visible when window.print() is active) */}
      <div className="hidden print-only">
        {printPayload?.mode === 'rapor' &&
          printPayload.students.map(student => (
            <RaporPrintableSheet
              key={student.id}
              student={student}
              bacaanList={bacaanList}
              tahfidzList={tahfidzList}
              absensiList={absensiList}
              settings={settings}
            />
          ))}

        {printPayload?.mode === 'rekap_kelas' && (
          <ClassSummaryPrintableSheet
            kelasLabel={printPayload.kelasLabel}
            students={printPayload.students}
            printStatuses={printStatuses}
            settings={settings}
          />
        )}
      </div>

    </div>
  );
};
