import React, { useState, useEffect } from 'react';
import { Student, UserSession } from '../../types';
import { storage } from '../../services/storage';
import { X, Award } from 'lucide-react';

interface InputTahfidzModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  initialStudent?: Student;
  user: UserSession;
  onSuccess: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const InputTahfidzModal: React.FC<InputTahfidzModalProps> = ({
  isOpen,
  onClose,
  students,
  initialStudent,
  user,
  onSuccess,
  onNotify
}) => {
  const tahfidzStudents = students.filter(s => s.isTahfidz);
  const [nisn, setNisn] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [surat, setSurat] = useState('QS. Al-Mulk');
  const [ayat, setAyat] = useState('Ayat 1-15');
  const [status, setStatus] = useState<'Ziyadah' | 'Muroja\'ah' | 'Mutqin'>('Ziyadah');
  const [kelancaran, setKelancaran] = useState<'Sangat Lancar (Mumtaz)' | 'Lancar (Jayyid Jiddan)' | 'Cukup (Jayyid)'>('Sangat Lancar (Mumtaz)');
  const [catatan, setCatatan] = useState('');

  useEffect(() => {
    if (initialStudent && initialStudent.isTahfidz) {
      setNisn(initialStudent.nisn);
    } else if (tahfidzStudents.length > 0) {
      setNisn(tahfidzStudents[0].nisn);
    }
  }, [initialStudent, tahfidzStudents, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nisn) {
      onNotify('error', 'Pilih Siswa', 'Silakan pilih santri tahfidz.');
      return;
    }

    const currentStudent = students.find(s => s.nisn === nisn);
    storage.addTahfidz({
      nisn,
      tanggal,
      surat,
      ayat,
      status,
      kelancaran,
      guru: user.nama,
      catatan
    });

    onNotify(
      'success',
      'Setoran Tahfidz Dicatat',
      `Berhasil mencatat setoran ${surat} (${ayat}) untuk ${currentStudent?.nama || nisn}.`
    );
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-200">
        
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Catat Setoran Hafalan Tahfidz
              </h2>
              <p className="text-[11px] text-slate-500">Mutaba'ah hafalan Al-Qur'an santri tahfidz SPEMDA</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 pt-3">
          
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Pilih Santri Tahfidz:
            </label>
            <select
              value={nisn}
              onChange={e => setNisn(e.target.value)}
              required
              className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              {tahfidzStudents.map(s => (
                <option key={s.id} value={s.nisn}>
                  {s.nama} ({s.kelas} · Target: {s.targetJuz || 'Juz 30'})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Tanggal Setoran:</label>
              <input
                type="date"
                value={tanggal}
                onChange={e => setTanggal(e.target.value)}
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Surat Al-Qur'an:</label>
              <input
                type="text"
                value={surat}
                onChange={e => setSurat(e.target.value)}
                placeholder="Misal: QS. Al-Mulk"
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Rentang Ayat:</label>
              <input
                type="text"
                value={ayat}
                onChange={e => setAyat(e.target.value)}
                placeholder="Misal: Ayat 1-30"
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Kategori Setoran:</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="Ziyadah">Ziyadah (Hafalan Baru)</option>
                <option value="Muroja'ah">Muroja'ah (Mengulang)</option>
                <option value="Mutqin">Mutqin (Kuat / Tasmi')</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Kualitas Kelancaran:</label>
            <select
              value={kelancaran}
              onChange={e => setKelancaran(e.target.value as any)}
              className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="Sangat Lancar (Mumtaz)">Sangat Lancar (Mumtaz)</option>
              <option value="Lancar (Jayyid Jiddan)">Lancar (Jayyid Jiddan)</option>
              <option value="Cukup (Jayyid)">Cukup (Jayyid)</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Catatan Evaluasi / Penguji:</label>
            <input
              type="text"
              value={catatan}
              onChange={e => setCatatan(e.target.value)}
              placeholder="Catatan makhraj dan kelancaran..."
              className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/2 py-2 px-3 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              className="w-1/2 py-2 px-3 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              Simpan Setoran
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
