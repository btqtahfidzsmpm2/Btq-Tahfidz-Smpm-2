import React, { useState, useEffect } from 'react';
import { Teacher } from '../../types';
import { storage } from '../../services/storage';
import { X, UserCheck, BookOpen, Award } from 'lucide-react';

interface TeacherModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherToEdit?: Teacher | null;
  onSuccess: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const TeacherModal: React.FC<TeacherModalProps> = ({
  isOpen,
  onClose,
  teacherToEdit,
  onSuccess,
  onNotify
}) => {
  const [nama, setNama] = useState('');
  const [role, setRole] = useState<'guru_ngaji' | 'guru_tahfidz'>('guru_ngaji');
  const [kelompokBTQ, setKelompokBTQ] = useState('');
  const [ruangan, setRuangan] = useState('RUANGAN 7A');
  const [kontak, setKontak] = useState('');

  useEffect(() => {
    if (teacherToEdit) {
      setNama(teacherToEdit.nama);
      setRole(teacherToEdit.role);
      setKelompokBTQ(teacherToEdit.kelompokBTQ);
      setRuangan(teacherToEdit.ruangan);
      setKontak(teacherToEdit.kontak || '');
    } else {
      setNama('');
      setRole('guru_ngaji');
      setKelompokBTQ('TILAWATI 4 PA');
      setRuangan('RUANGAN 7A');
      setKontak('');
    }
  }, [teacherToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim()) {
      onNotify('error', 'Nama Guru Wajib Diisi', 'Silakan masukkan nama lengkap ustadz / ustadzah.');
      return;
    }

    if (teacherToEdit) {
      storage.updateTeacher(teacherToEdit.id, {
        nama: nama.trim().toUpperCase(),
        role,
        kelompokBTQ: kelompokBTQ.trim(),
        ruangan: ruangan.trim(),
        kontak: kontak.trim()
      });
      onNotify('success', 'Data Guru Diperbarui', `Informasi ${nama.toUpperCase()} berhasil diperbarui secara real-time.`);
    } else {
      storage.addTeacher({
        nama: nama.trim().toUpperCase(),
        role,
        kelompokBTQ: kelompokBTQ.trim(),
        ruangan: ruangan.trim(),
        kontak: kontak.trim()
      });
      onNotify('success', 'Guru Baru Ditambahkan', `Ustadz/ah ${nama.toUpperCase()} berhasil didaftarkan ke sistem.`);
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {teacherToEdit ? 'Edit Data Guru Pengajar' : 'Tambah Guru Ngaji / Tahfidz Baru'}
              </h2>
              <p className="text-[11px] text-slate-500">
                Pembaruan real-time pada sistem penugasan halaqah SPEMDA
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 pt-3">
          
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Nama Lengkap Ustadz / Ustadzah:
            </label>
            <input
              type="text"
              value={nama}
              onChange={e => setNama(e.target.value)}
              placeholder="Contoh: USTADZ AHMAD RIDWAN, S.PD.I"
              required
              className="w-full p-2 border border-slate-300 rounded-lg text-xs font-bold uppercase bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Bidang / Peran Pengajar:
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole('guru_ngaji')}
                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-colors ${
                  role === 'guru_ngaji'
                    ? 'border-emerald-600 bg-emerald-50/70 text-slate-900 font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <BookOpen className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-xs leading-tight">Guru Ngaji (BTQ)</span>
              </button>

              <button
                type="button"
                onClick={() => setRole('guru_tahfidz')}
                className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-colors ${
                  role === 'guru_tahfidz'
                    ? 'border-amber-500 bg-amber-50/70 text-slate-900 font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                <Award className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-xs leading-tight">Guru Tahfidz</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Kelompok / Tingkat BTQ:
              </label>
              <input
                type="text"
                value={kelompokBTQ}
                onChange={e => setKelompokBTQ(e.target.value)}
                placeholder="Misal: TILAWATI 4 PA"
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Ruangan Halaqah:
              </label>
              <input
                type="text"
                value={ruangan}
                onChange={e => setRuangan(e.target.value)}
                placeholder="Misal: RUANGAN 7A / LAB PAI"
                required
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Nomor WhatsApp / Kontak (Opsional):
            </label>
            <input
              type="text"
              value={kontak}
              onChange={e => setKontak(e.target.value)}
              placeholder="Misal: 081234567890"
              className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
              className="w-1/2 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              {teacherToEdit ? 'Simpan Perubahan' : 'Tambah Guru'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
