import React, { useState, useEffect } from 'react';
import { Role, UserSession, Teacher } from '../../types';
import { TEACHERS_LIST, HOMEROOM_CLASSES } from '../../data/initialData';
import { Shield, BookOpen, Award, School, X } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (session: UserSession) => void;
  teachers?: Teacher[];
  teachersList?: string[];
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  teachers = [],
  teachersList = TEACHERS_LIST
}) => {
  const [selectedRole, setSelectedRole] = useState<Role>('admin');

  const ngajiTeachers = teachers.length > 0
    ? teachers.filter(t => t.role === 'guru_ngaji').map(t => t.nama)
    : teachersList;

  const tahfidzTeachers = teachers.length > 0
    ? teachers.filter(t => t.role === 'guru_tahfidz').map(t => t.nama)
    : teachersList;

  const [selectedTeacher, setSelectedTeacher] = useState<string>(ngajiTeachers[0] || 'UMI KULSUM');
  const [selectedTahfidzTeacher, setSelectedTahfidzTeacher] = useState<string>(tahfidzTeachers[0] || 'USTADZ HAMDAN AL-HAFIDZ');
  const [selectedClass, setSelectedClass] = useState<string>(HOMEROOM_CLASSES[0]);

  // Keep defaults valid when teachers change
  useEffect(() => {
    if (ngajiTeachers.length > 0 && !ngajiTeachers.includes(selectedTeacher)) {
      setSelectedTeacher(ngajiTeachers[0]);
    }
    if (tahfidzTeachers.length > 0 && !tahfidzTeachers.includes(selectedTahfidzTeacher)) {
      setSelectedTahfidzTeacher(tahfidzTeachers[0]);
    }
  }, [teachers, ngajiTeachers, tahfidzTeachers]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRole === 'admin') {
      onLogin({
        role: 'admin',
        nama: 'Ustadz Operator SIM-Qur\'an'
      });
    } else if (selectedRole === 'guru_ngaji') {
      const teacherObj = teachers.find(t => t.nama.toUpperCase() === selectedTeacher.toUpperCase());
      onLogin({
        role: 'guru_ngaji',
        nama: selectedTeacher,
        assignedGroup: teacherObj?.kelompokBTQ || (selectedTeacher === 'UMI KULSUM' ? "AL-QUR'AN PI D" : 'Kelompok Binaan')
      });
    } else if (selectedRole === 'guru_tahfidz') {
      const tahfidzName = selectedTahfidzTeacher || tahfidzTeachers[0] || 'USTADZ HAMDAN AL-HAFIDZ';
      onLogin({
        role: 'guru_tahfidz',
        nama: tahfidzName
      });
    } else if (selectedRole === 'wali_kelas') {
      onLogin({
        role: 'wali_kelas',
        nama: `Wali Kelas ${selectedClass}`,
        assignedClass: selectedClass
      });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <img
              src="/assets/logo_spemda_quran.png"
              alt="Logo SMP Muhammadiyah 2 Surabaya & Fashahah Balaghah Qur'an"
              className="h-10 w-auto object-contain bg-slate-50 p-1 rounded-lg border border-slate-200 shrink-0"
            />
            <div>
              <h2 className="text-base font-bold text-slate-900">Masuk Portal Petugas / Guru</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                SMP Muhammadiyah 2 Surabaya
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          
          {/* Role selector tiles */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">Pilih Otoritas Peran:</label>
            
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setSelectedRole('admin')}
                className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                  selectedRole === 'admin'
                    ? 'border-emerald-700 bg-emerald-50/60 text-slate-900'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold leading-tight">Administrator Utama</p>
                  <p className="text-[11px] text-slate-500 truncate">Akses seluruh data sekolah (Putra & Putri)</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRole('guru_ngaji')}
                className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                  selectedRole === 'guru_ngaji'
                    ? 'border-emerald-700 bg-emerald-50/60 text-slate-900'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold leading-tight">Guru Ngaji / Pengajar BTQ</p>
                  <p className="text-[11px] text-slate-500 truncate">Hanya kelas halaqah & kelompok binaannya</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRole('guru_tahfidz')}
                className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                  selectedRole === 'guru_tahfidz'
                    ? 'border-emerald-700 bg-emerald-50/60 text-slate-900'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Award className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold leading-tight">Guru Tahfidz</p>
                  <p className="text-[11px] text-slate-500 truncate">Khusus santri peserta program tahfidz</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRole('wali_kelas')}
                className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                  selectedRole === 'wali_kelas'
                    ? 'border-emerald-700 bg-emerald-50/60 text-slate-900'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
                  <School className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold leading-tight">Wali Kelas Formal</p>
                  <p className="text-[11px] text-slate-500 truncate">Monitoring rekap harian santri kelas binaannya</p>
                </div>
              </button>
            </div>
          </div>

          {/* Contextual dropdown based on selected role */}
          {selectedRole === 'guru_ngaji' && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Pilih Nama Ustadz / Ustadzah (Guru Ngaji):
              </label>
              <select
                value={selectedTeacher}
                onChange={e => setSelectedTeacher(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {ngajiTeachers.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedRole === 'guru_tahfidz' && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Pilih Nama Ustadz Pembina Tahfidz:
              </label>
              <select
                value={selectedTahfidzTeacher}
                onChange={e => setSelectedTahfidzTeacher(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {tahfidzTeachers.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedRole === 'wali_kelas' && (
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Pilih Rombel Kelas Formal Binaan:
              </label>
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-medium bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {HOMEROOM_CLASSES.map(c => (
                  <option key={c} value={c}>
                    Wali Kelas {c}
                  </option>
                ))}
              </select>
            </div>
          )}

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
              className="w-1/2 py-2 px-3 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              Masuk Sistem
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
