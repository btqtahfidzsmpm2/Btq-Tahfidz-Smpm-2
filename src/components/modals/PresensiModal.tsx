import React, { useState, useEffect, useMemo } from 'react';
import { Student, UserSession } from '../../types';
import { storage } from '../../services/storage';
import { detectBtqClassGender, isValidBtqClass } from '../../utils/access';
import { computeStudentAttendanceSummary, getCurrentMonthStr } from '../../utils/attendance';
import { X, ClipboardCheck, Check, AlertTriangle } from 'lucide-react';

interface PresensiModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserSession;
  students: Student[];
  onSuccess: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const PresensiModal: React.FC<PresensiModalProps> = ({
  isOpen,
  onClose,
  user,
  students,
  onSuccess,
  onNotify
}) => {
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [sesi, setSesi] = useState<'btq' | 'tahfidz'>(
    user.role === 'guru_tahfidz' ? 'tahfidz' : 'btq'
  );
  const [selectedKelasBTQ, setSelectedKelasBTQ] = useState<string>('');
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, 'Hadir' | 'Sakit' | 'Izin' | 'Alpa'>
  >({});

  // Lock session according to teacher role
  useEffect(() => {
    if (user.role === 'guru_ngaji') {
      setSesi('btq');
    } else if (user.role === 'guru_tahfidz') {
      setSesi('tahfidz');
    }
  }, [user.role, isOpen]);

  // Unique BTQ classes available in the authorized students list (grouped PI vs PA)
  const btqClassOptions = useMemo(() => {
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

  const visibleStudents = useMemo(() => {
    if (sesi === 'tahfidz' && user.role === 'admin') {
      return students.filter(s => s.isTahfidz);
    }
    if (selectedKelasBTQ) {
      return students.filter(
        s => s.kelasBTQ.trim().toUpperCase() === selectedKelasBTQ.trim().toUpperCase()
      );
    }
    return students;
  }, [students, sesi, user.role, selectedKelasBTQ]);

  const [allAbsensi, setAllAbsensi] = useState(() => storage.getAbsensi());

  // Pre-hydrate existing attendance status for the selected tanggal & sesi
  useEffect(() => {
    if (!isOpen) return;
    const existing = storage.getAbsensi();
    setAllAbsensi(existing);
    const map: Record<string, 'Hadir' | 'Sakit' | 'Izin' | 'Alpa'> = {};
    existing.forEach(a => {
      if (a.tanggal === tanggal && a.sesi === sesi && !map[a.nisn]) {
        map[a.nisn] = a.status;
      }
    });
    setAttendanceMap(map);
  }, [isOpen, tanggal, sesi]);

  const currentMonthStr = tanggal.slice(0, 7) || getCurrentMonthStr();

  if (!isOpen) return null;

  const handleStatusChange = (nisn: string, status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa') => {
    setAttendanceMap(prev => ({
      ...prev,
      [nisn]: status
    }));
  };

  const handleMarkAllHadir = () => {
    const newMap = { ...attendanceMap };
    visibleStudents.forEach(s => {
      newMap[s.nisn] = 'Hadir';
    });
    setAttendanceMap(newMap);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (visibleStudents.length === 0) {
      onNotify(
        'info',
        'Tidak Ada Siswa',
        'Tidak ada daftar siswa binaan yang tersedia untuk diabsen pada sesi ini.'
      );
      return;
    }

    const entries = visibleStudents.map(s => ({
      nisn: s.nisn,
      status: attendanceMap[s.nisn] || ('Hadir' as const)
    }));

    storage.saveAttendanceBatch(entries, sesi, tanggal);

    onNotify(
      'success',
      'Presensi Selesai Dicatat',
      `Berhasil menyimpan presensi sesi ${sesi.toUpperCase()} untuk ${visibleStudents.length} siswa pada tanggal ${tanggal}.`
    );
    onSuccess();
    onClose();
  };

  const totalBtqOptions = btqClassOptions.pi.length + btqClassOptions.pa.length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-200 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center">
              <ClipboardCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Presensi Harian {user.role === 'guru_ngaji' ? 'Kelas BTQ Binaan' : user.role === 'guru_tahfidz' ? 'Halaqah Tahfidz' : 'Halaqah'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {user.role === 'guru_ngaji'
                  ? `Khusus kelas binaan ${user.nama} (${user.assignedGroup || 'Kelas BTQ Anda'})`
                  : user.role === 'guru_tahfidz'
                  ? `Khusus santri Tahfidz binaan ${user.nama}`
                  : 'Catat kehadiran santri BTQ (PA/PI) & Tahfidz SPEMDA'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 shrink-0">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Tanggal Presensi:</label>
              <input
                type="date"
                value={tanggal}
                onChange={e => setTanggal(e.target.value)}
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Sesi Halaqah:</label>
              <select
                value={sesi}
                disabled={user.role === 'guru_ngaji' || user.role === 'guru_tahfidz'}
                onChange={e => setSesi(e.target.value as 'btq' | 'tahfidz')}
                className={`w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                  user.role === 'guru_ngaji' || user.role === 'guru_tahfidz'
                    ? 'bg-slate-100 text-slate-600 cursor-not-allowed'
                    : ''
                }`}
              >
                <option value="btq">Halaqah BTQ / Tilawati</option>
                <option value="tahfidz">Halaqah Tahfidz Qur'an</option>
              </select>
            </div>
          </div>

          {sesi === 'btq' && totalBtqOptions > 1 && (
            <div className="shrink-0">
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Filter Kelas BTQ Binaan (Putri PI / Putra PA):
              </label>
              <select
                value={selectedKelasBTQ}
                onChange={e => setSelectedKelasBTQ(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Semua Kelas BTQ Binaan ({students.length} Siswa)</option>
                {btqClassOptions.pi.length > 0 && (
                  <optgroup label="Kelas BTQ Putri (PI)">
                    {btqClassOptions.pi.map(cls => (
                      <option key={cls} value={cls}>
                        {cls} (Putri / PI)
                      </option>
                    ))}
                  </optgroup>
                )}
                {btqClassOptions.pa.length > 0 && (
                  <optgroup label="Kelas BTQ Putra (PA)">
                    {btqClassOptions.pa.map(cls => (
                      <option key={cls} value={cls}>
                        {cls} (Putra / PA)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between shrink-0 pt-1">
            <span className="text-xs font-semibold text-slate-700">
              Daftar Siswa ({visibleStudents.length})
            </span>
            <button
              type="button"
              onClick={handleMarkAllHadir}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Tandai Semua Hadir</span>
            </button>
          </div>

          {/* Scrollable Student List */}
          <div className="flex-1 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-60 p-1">
            {visibleStudents.length > 0 ? (
              visibleStudents.map(s => {
                const currentStatus = attendanceMap[s.nisn] || 'Hadir';
                const btqGender = detectBtqClassGender(s.kelasBTQ, s.gender);
                const monthlySum = computeStudentAttendanceSummary(s, allAbsensi, {
                  monthPrefix: currentMonthStr,
                  sesi
                });

                return (
                  <div
                    key={s.id}
                    className={`p-2.5 flex items-center justify-between text-xs ${
                      monthlySum.flagLevel === 'kritis'
                        ? 'bg-rose-50/60 hover:bg-rose-50'
                        : monthlySum.flagLevel === 'waspada'
                        ? 'bg-amber-50/40 hover:bg-amber-50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-slate-800 truncate">{s.nama}</p>
                        {monthlySum.flagLevel !== 'aman' && (
                          <span
                            className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-extrabold ${
                              monthlySum.flagLevel === 'kritis'
                                ? 'bg-rose-600 text-white'
                                : 'bg-amber-400 text-slate-950'
                            }`}
                            title={monthlySum.flagReason}
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>{monthlySum.flagLabel}</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1 flex-wrap">
                        <span>{s.kelas}</span>
                        <span>·</span>
                        {sesi === 'tahfidz' ? (
                          <span className="text-amber-800 font-semibold">
                            {s.halaqahTahfidz || 'Halaqah Tahfidz'}
                          </span>
                        ) : (
                          <>
                            <span className="font-semibold text-slate-700">{s.kelasBTQ}</span>
                            {btqGender && (
                              <span
                                className={`px-1 py-0.2 rounded font-bold ${
                                  btqGender === 'PI'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-sky-100 text-sky-800'
                                }`}
                              >
                                {btqGender}
                              </span>
                            )}
                          </>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {(['Hadir', 'Sakit', 'Izin', 'Alpa'] as const).map(status => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => handleStatusChange(s.nisn, status)}
                          className={`px-2 py-1 rounded text-[11px] font-bold transition-colors ${
                            currentStatus === status
                              ? status === 'Hadir'
                                ? 'bg-emerald-700 text-white'
                                : status === 'Sakit'
                                ? 'bg-blue-600 text-white'
                                : status === 'Izin'
                                ? 'bg-amber-500 text-slate-900'
                                : 'bg-rose-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-6 text-center text-xs text-slate-400">
                Belum ada santri yang terdaftar di kelas binaan Anda.
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-2 px-3 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={visibleStudents.length === 0}
              className="w-1/2 py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              Simpan Presensi
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
