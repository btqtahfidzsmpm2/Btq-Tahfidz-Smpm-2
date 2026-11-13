import React, { useState } from 'react';
import { Student } from '../../types';
import { storage } from '../../services/storage';
import { X, ClipboardCheck, Check } from 'lucide-react';

interface PresensiModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  onSuccess: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const PresensiModal: React.FC<PresensiModalProps> = ({
  isOpen,
  onClose,
  students,
  onSuccess,
  onNotify
}) => {
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [sesi, setSesi] = useState<'btq' | 'tahfidz'>('btq');
  const [attendanceMap, setAttendanceMap] = useState<Record<string, 'Hadir' | 'Sakit' | 'Izin' | 'Alpa'>>({});

  if (!isOpen) return null;

  const handleStatusChange = (nisn: string, status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa') => {
    setAttendanceMap(prev => ({
      ...prev,
      [nisn]: status
    }));
  };

  const handleMarkAllHadir = () => {
    const newMap: Record<string, 'Hadir'> = {};
    students.forEach(s => {
      newMap[s.nisn] = 'Hadir';
    });
    setAttendanceMap(newMap);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const existing = storage.getAbsensi();
    const newRecords = students.map(s => ({
      id: `abs-${Date.now()}-${s.nisn}`,
      nisn: s.nisn,
      tanggal,
      sesi,
      status: attendanceMap[s.nisn] || 'Hadir'
    }));

    storage.saveAbsensi([...newRecords, ...existing]);

    onNotify(
      'success',
      'Presensi Selesai Dicatat',
      `Berhasil menyimpan presensi sesi ${sesi.toUpperCase()} untuk ${students.length} siswa pada tanggal ${tanggal}.`
    );
    onSuccess();
    onClose();
  };

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
                Presensi Harian Halaqah
              </h2>
              <p className="text-[11px] text-slate-500">Catat kehadiran santri BTQ & Tahfidz SPEMDA</p>
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
                onChange={e => setSesi(e.target.value as any)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="btq">Halaqah BTQ / Tilawati</option>
                <option value="tahfidz">Halaqah Tahfidz Qur'an</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between shrink-0 pt-1">
            <span className="text-xs font-semibold text-slate-700">
              Daftar Siswa ({students.length})
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
            {students.map(s => {
              const currentStatus = attendanceMap[s.nisn] || 'Hadir';

              return (
                <div key={s.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50">
                  <div className="min-w-0 pr-2">
                    <p className="font-bold text-slate-800 truncate">{s.nama}</p>
                    <p className="text-[10px] text-slate-400 font-mono">
                      {s.kelas} · {s.kelasBTQ}
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
            })}
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
              className="w-1/2 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              Simpan Presensi
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
