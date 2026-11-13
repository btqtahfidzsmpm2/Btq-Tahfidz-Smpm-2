import React, { useState, useEffect } from 'react';
import { Student, UserSession } from '../../types';
import { storage } from '../../services/storage';
import { X, BookOpen } from 'lucide-react';

interface InputBacaanModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  initialStudent?: Student;
  user: UserSession;
  onSuccess: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const InputBacaanModal: React.FC<InputBacaanModalProps> = ({
  isOpen,
  onClose,
  students,
  initialStudent,
  user,
  onSuccess,
  onNotify
}) => {
  const [nisn, setNisn] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [tipe, setTipe] = useState<'Tilawati Remaja' | 'Al-Qur\'an'>('Tilawati Remaja');
  const [jilid, setJilid] = useState('Jilid 4');
  const [halaman, setHalaman] = useState('Halaman 15');
  const [nilai, setNilai] = useState<'A' | 'B' | 'C'>('A');
  const [catatan, setCatatan] = useState('');

  useEffect(() => {
    if (initialStudent) {
      setNisn(initialStudent.nisn);
      if (initialStudent.kelasBTQ.includes("QUR'AN") || initialStudent.kelasBTQ.includes('KHATAM')) {
        setTipe("Al-Qur'an");
        setJilid('Juz 15');
        setHalaman('QS. Al-Isra: 1-20');
      } else {
        setTipe('Tilawati Remaja');
        setJilid('Jilid 4');
        setHalaman('Halaman 18');
      }
    } else if (students.length > 0) {
      setNisn(students[0].nisn);
    }
  }, [initialStudent, students, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nisn) {
      onNotify('error', 'Pilih Siswa', 'Silakan pilih siswa yang dinilai terlebih dahulu.');
      return;
    }

    const currentStudent = students.find(s => s.nisn === nisn);
    storage.addBacaan({
      nisn,
      tanggal,
      tipe,
      jilid,
      halaman,
      nilai,
      catatan,
      pengajar: user.nama
    });

    onNotify(
      'success',
      'Capaian Mengaji Dicatat',
      `Berhasil memperbarui capaian bacaan untuk ${currentStudent?.nama || nisn}.`
    );
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-200">
        
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Catat Capaian Tilawati / Qur'an
              </h2>
              <p className="text-[11px] text-slate-500">Mutaba'ah harian perkembangan mengaji halaqah</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 pt-3">
          
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Pilih Siswa:</label>
            <select
              value={nisn}
              onChange={e => setNisn(e.target.value)}
              required
              className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {students.map(s => (
                <option key={s.id} value={s.nisn}>
                  {s.nama} ({s.kelas} · {s.kelasBTQ})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Tanggal Halaqah:</label>
              <input
                type="date"
                value={tanggal}
                onChange={e => setTanggal(e.target.value)}
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Jenis Kitab:</label>
              <select
                value={tipe}
                onChange={e => setTipe(e.target.value as any)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="Tilawati Remaja">Tilawati Remaja</option>
                <option value="Al-Qur'an">Al-Qur'an</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Jilid / Juz:</label>
              <input
                type="text"
                value={jilid}
                onChange={e => setJilid(e.target.value)}
                placeholder="Misal: Jilid 4 atau Juz 15"
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Halaman / Ayat:</label>
              <input
                type="text"
                value={halaman}
                onChange={e => setHalaman(e.target.value)}
                placeholder="Misal: Hal 20 atau Ayat 1-25"
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Predikat Kelancaran:</label>
              <select
                value={nilai}
                onChange={e => setNilai(e.target.value as any)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="A">A (Sangat Lancar / Mumtaz)</option>
                <option value="B">B (Cukup Lancar / Jayyid)</option>
                <option value="C">C (Mengulang / Maqbul)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Catatan Tajwid/Makhraj:</label>
              <input
                type="text"
                value={catatan}
                onChange={e => setCatatan(e.target.value)}
                placeholder="Catatan evaluasi pengajar..."
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
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
              className="w-1/2 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              Simpan Capaian
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
