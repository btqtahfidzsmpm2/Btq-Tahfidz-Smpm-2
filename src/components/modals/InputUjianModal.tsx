import React, { useState, useEffect } from 'react';
import { Student } from '../../types';
import { storage } from '../../services/storage';
import { X, GraduationCap } from 'lucide-react';

interface InputUjianModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  initialStudent?: Student;
  onSuccess: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const InputUjianModal: React.FC<InputUjianModalProps> = ({
  isOpen,
  onClose,
  students,
  initialStudent,
  onSuccess,
  onNotify
}) => {
  const [nisn, setNisn] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().slice(0, 10));
  const [jenis, setJenis] = useState('Tes Kenaikan Jilid Tilawati');
  const [nilai, setNilai] = useState<number>(85);
  const [predikat, setPredikat] = useState<'MUMTAZ' | 'JAYYID' | 'MAQBUL' | 'ROSHIB'>('MUMTAZ');
  const [natijah, setNatijah] = useState('Naik ke Jilid 5');
  const [kelulusan, setKelulusan] = useState('Lulus Kenaikan Tingkat');
  const [keterangan, setKeterangan] = useState('Lancar makhraj dan tartil');

  useEffect(() => {
    if (initialStudent) {
      setNisn(initialStudent.nisn);
      setNilai(initialStudent.ujian.nilai || 85);
      setPredikat(
        (initialStudent.ujian.predikat === 'MUMTAZ' || initialStudent.ujian.predikat === 'A')
          ? 'MUMTAZ'
          : (initialStudent.ujian.predikat === 'JAYYID' || initialStudent.ujian.predikat === 'B')
          ? 'JAYYID'
          : (initialStudent.ujian.predikat === 'MAQBUL' || initialStudent.ujian.predikat === 'C')
          ? 'MAQBUL'
          : 'ROSHIB'
      );
      setNatijah(initialStudent.ujian.natijah || 'MUMTAZ');
      setKelulusan(initialStudent.ujian.kelulusan || 'Lulus Kenaikan Tingkat');
      setKeterangan(initialStudent.ujian.keterangan || 'Lancar');
    } else if (students.length > 0) {
      setNisn(students[0].nisn);
    }
  }, [initialStudent, students, isOpen]);

  // Auto-update predikat when nilai changes
  const handleNilaiChange = (val: number) => {
    setNilai(val);
    if (val >= 85) setPredikat('MUMTAZ');
    else if (val >= 75) setPredikat('JAYYID');
    else if (val >= 65) setPredikat('MAQBUL');
    else setPredikat('ROSHIB');
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nisn) {
      onNotify('error', 'Pilih Siswa', 'Silakan pilih siswa yang dinilai.');
      return;
    }

    const currentStudent = students.find(s => s.nisn === nisn);
    storage.updateUjian(nisn, {
      tanggal,
      jenis,
      nilai,
      predikat,
      natijah,
      kelulusan,
      keterangan
    });

    onNotify(
      'success',
      'Nilai Ujian Diperbarui',
      `Hasil ujian tes kenaikan untuk ${currentStudent?.nama || nisn} berhasil disimpan.`
    );
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-200">
        
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Update Nilai Tes Kenaikan BTQ
              </h2>
              <p className="text-[11px] text-slate-500">Penilaian ujian munaqosyah & tasmi' santri SPEMDA</p>
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
              className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
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
              <label className="text-xs font-bold text-slate-700 block mb-1">Tanggal Ujian:</label>
              <input
                type="date"
                value={tanggal}
                onChange={e => setTanggal(e.target.value)}
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Jenis Ujian:</label>
              <select
                value={jenis}
                onChange={e => setJenis(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="Tes Kenaikan Jilid Tilawati">Tes Kenaikan Jilid Tilawati</option>
                <option value="Tes Kenaikan BTQ Munaqosyah">Tes Kenaikan BTQ Munaqosyah</option>
                <option value="Tasmi Juz Tahfidz">Tasmi Juz Tahfidz</option>
                <option value="Munaqosyah Khatam Al-Qur'an">Munaqosyah Khatam Al-Qur'an</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Nilai Angka (0-100):</label>
              <input
                type="number"
                min="0"
                max="100"
                value={nilai}
                onChange={e => handleNilaiChange(Number(e.target.value))}
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold font-mono bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Predikat Kelulusan:</label>
              <select
                value={predikat}
                onChange={e => setPredikat(e.target.value as any)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="MUMTAZ">MUMTAZ (≥85)</option>
                <option value="JAYYID">JAYYID (75-84)</option>
                <option value="MAQBUL">MAQBUL (65-74)</option>
                <option value="ROSHIB">ROSHIB (&lt;65)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Natijah / Keputusan:</label>
              <input
                type="text"
                value={natijah}
                onChange={e => setNatijah(e.target.value)}
                placeholder="Misal: Naik ke Jilid 5 / MUMTAZ"
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold uppercase bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Status Kelulusan:</label>
              <select
                value={kelulusan}
                onChange={e => setKelulusan(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="Lulus Kenaikan Tingkat">Lulus Kenaikan Tingkat</option>
                <option value="Lulus Mumtaz">Lulus Mumtaz</option>
                <option value="Lulus Bersyarat">Lulus Bersyarat</option>
                <option value="Mengulang / Penguatan">Mengulang / Penguatan</option>
                <option value="Lulus Wisuda Tahfidz">Lulus Wisuda Tahfidz</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Catatan Evaluasi / Makhraj:</label>
            <input
              type="text"
              value={keterangan}
              onChange={e => setKeterangan(e.target.value)}
              placeholder="Catatan makhraj, tajwid, dan tartil..."
              className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-purple-500"
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
              className="w-1/2 py-2 px-3 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              Simpan Hasil Ujian
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
