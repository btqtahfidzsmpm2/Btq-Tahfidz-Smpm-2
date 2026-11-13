import React, { useState, useEffect } from 'react';
import { Student } from '../../types';
import { storage } from '../../services/storage';
import { TEACHERS_LIST, HOMEROOM_CLASSES } from '../../data/initialData';
import { X, UserPlus, Edit3 } from 'lucide-react';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentToEdit?: Student | null;
  teachersList?: string[];
  onSuccess: (student?: Student) => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({
  isOpen,
  onClose,
  studentToEdit,
  teachersList = TEACHERS_LIST,
  onSuccess,
  onNotify
}) => {
  const [nisn, setNisn] = useState('');
  const [nama, setNama] = useState('');
  const [gender, setGender] = useState<'L' | 'P'>('P');
  const [kelas, setKelas] = useState(HOMEROOM_CLASSES[0]);
  const [kelasBTQ, setKelasBTQ] = useState("AL-QUR'AN PI D");
  const [pengajar, setPengajar] = useState(teachersList[0] || 'UMI KULSUM');
  const [ruangan, setRuangan] = useState('RUANGAN 7E');
  const [waliKelas, setWaliKelas] = useState('USTADZAH NURUL M.PD');
  const [isTahfidz, setIsTahfidz] = useState(false);
  const [targetJuz, setTargetJuz] = useState('Juz 30');

  useEffect(() => {
    if (studentToEdit) {
      setNisn(studentToEdit.nisn);
      setNama(studentToEdit.nama);
      setGender(studentToEdit.gender);
      setKelas(studentToEdit.kelas);
      setKelasBTQ(studentToEdit.kelasBTQ);
      setPengajar(studentToEdit.pengajar);
      setRuangan(studentToEdit.ruangan);
      setWaliKelas(studentToEdit.waliKelas);
      setIsTahfidz(studentToEdit.isTahfidz);
      setTargetJuz(studentToEdit.targetJuz || 'Juz 30');
    } else {
      setNisn('');
      setNama('');
      setGender('P');
      setKelas(HOMEROOM_CLASSES[0]);
      setKelasBTQ("AL-QUR'AN PI D");
      setPengajar(teachersList[0] || 'UMI KULSUM');
      setRuangan('RUANGAN 7E');
      setWaliKelas('USTADZAH NURUL M.PD');
      setIsTahfidz(false);
      setTargetJuz('Juz 30');
    }
  }, [studentToEdit, isOpen, teachersList]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nisn.trim() || !nama.trim()) {
      onNotify('error', 'Data Belum Lengkap', 'NISN dan Nama Siswa wajib diisi.');
      return;
    }

    if (studentToEdit) {
      // Update existing student
      storage.updateStudent(studentToEdit.nisn, {
        nama: nama.trim().toUpperCase(),
        gender,
        kelas,
        kelasBTQ,
        pengajar,
        ruangan,
        waliKelas,
        isTahfidz,
        targetJuz: isTahfidz ? targetJuz : undefined
      });
      onNotify('success', 'Data Siswa Diperbarui', `Informasi ${nama.toUpperCase()} berhasil diperbarui secara real time.`);
      onSuccess();
    } else {
      // Add new student
      const students = storage.getStudents();
      if (students.some(s => s.nisn === nisn.trim())) {
        onNotify('error', 'NISN Sudah Terdaftar', `Siswa dengan NISN ${nisn} sudah ada di database.`);
        return;
      }

      const newStudent = storage.addStudent({
        nisn: nisn.trim(),
        nama: nama.trim().toUpperCase(),
        gender,
        kelas,
        kelasBTQ,
        pengajar,
        ruangan,
        waliKelas,
        isTahfidz,
        targetJuz: isTahfidz ? targetJuz : undefined,
        totalHafalan: isTahfidz ? '0 Juz' : undefined,
        hafalanTerakhir: isTahfidz ? 'Belum setoran' : undefined,
        capaianTerakhir: {
          tingkat: kelasBTQ,
          halamanAyat: 'Halaman Awal',
          tanggal: new Date().toISOString().slice(0, 10),
          nilai: 'A'
        },
        ujian: {
          tanggal: new Date().toISOString().slice(0, 10),
          jenis: 'Tes Penempatan BTQ',
          nilai: 80,
          predikat: 'JAYYID',
          natijah: kelasBTQ,
          kelulusan: 'Terdaftar Aktif',
          keterangan: 'Siswa baru terdaftar'
        },
        kehadiranPersen: 100
      });

      onNotify('success', 'Siswa Baru Ditambahkan', `${nama} (${kelas}) berhasil didaftarkan ke sistem.`);
      onSuccess(newStudent);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-200 max-h-[90vh] overflow-y-auto">
        
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center">
              {studentToEdit ? <Edit3 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {studentToEdit ? 'Edit Data Siswa' : 'Tambah Data Siswa Baru'}
              </h2>
              <p className="text-[11px] text-slate-500">Khusus Administrator SMP Muhammadiyah 2 Surabaya</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 pt-3">
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">NISN (10 Digit):</label>
              <input
                type="text"
                maxLength={10}
                value={nisn}
                disabled={Boolean(studentToEdit)}
                onChange={e => setNisn(e.target.value)}
                placeholder="008260xxxx"
                required
                className={`w-full p-2 border border-slate-300 rounded-lg text-xs font-mono font-bold bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                  studentToEdit ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : ''
                }`}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Jenis Kelamin:</label>
              <select
                value={gender}
                onChange={e => setGender(e.target.value as any)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="P">Santri Putri (Pi)</option>
                <option value="L">Santri Putra (Pa)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Nama Lengkap Siswa:</label>
            <input
              type="text"
              value={nama}
              onChange={e => setNama(e.target.value)}
              placeholder="Ketik nama lengkap siswa..."
              required
              className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold uppercase bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Kelas Formal:</label>
              <select
                value={kelas}
                onChange={e => setKelas(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {HOMEROOM_CLASSES.map(c => (
                  <option key={c} value={c}>
                    Kelas {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Wali Kelas:</label>
              <input
                type="text"
                value={waliKelas}
                onChange={e => setWaliKelas(e.target.value)}
                placeholder="Nama wali kelas..."
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Kelompok BTQ / Tilawati:</label>
              <input
                type="text"
                value={kelasBTQ}
                onChange={e => setKelasBTQ(e.target.value)}
                placeholder="Misal: TILAWATI 4 PI / AL-QUR'AN PA"
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Ruangan Halaqah:</label>
              <input
                type="text"
                value={ruangan}
                onChange={e => setRuangan(e.target.value)}
                placeholder="Misal: RUANGAN 7E / LAB PAI"
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Ustadz / Ustadzah Pengajar:</label>
            <select
              value={pengajar}
              onChange={e => setPengajar(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {teachersList.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Tahfidz Checkbox */}
          <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isTahfidzCheck"
                checked={isTahfidz}
                onChange={e => setIsTahfidz(e.target.checked)}
                className="w-4 h-4 text-emerald-600 rounded"
              />
              <label htmlFor="isTahfidzCheck" className="text-xs font-bold text-slate-800 cursor-pointer">
                Mengikuti Program Khusus Tahfidz Qur'an
              </label>
            </div>

            {isTahfidz && (
              <div className="pt-1">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Target Hafalan Awal:</label>
                <select
                  value={targetJuz}
                  onChange={e => setTargetJuz(e.target.value)}
                  className="w-full p-1.5 border border-amber-300 rounded-lg text-xs bg-white font-medium"
                >
                  <option value="Juz 30">Juz 30</option>
                  <option value="Juz 30 & 29">Juz 30 & 29 (2 Juz)</option>
                  <option value="Juz 30, 29, 28">Juz 30, 29, 28 (3 Juz)</option>
                  <option value="Juz 1, 2">Juz 1 & 2</option>
                  <option value="5 Juz">5 Juz</option>
                </select>
              </div>
            )}
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
              className="w-1/2 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              {studentToEdit ? 'Simpan Perubahan' : 'Tambahkan Siswa'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
