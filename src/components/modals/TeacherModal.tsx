import React, { useState, useEffect } from 'react';
import { Teacher } from '../../types';
import { storage } from '../../services/storage';
import { authService, slugifyUsername, DEFAULT_PASSWORDS } from '../../services/auth';
import { X, UserCheck, BookOpen, Award, KeyRound, Eye, EyeOff, User } from 'lucide-react';

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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [usernameEditedManually, setUsernameEditedManually] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setShowPassword(false);
    setPassword('');

    if (teacherToEdit) {
      setNama(teacherToEdit.nama);
      setRole(teacherToEdit.role);
      setKelompokBTQ(teacherToEdit.kelompokBTQ);
      setRuangan(teacherToEdit.ruangan);
      setKontak(teacherToEdit.kontak || '');
      const existingAcc = authService
        .getAccounts()
        .find(
          a =>
            a.teacherId === teacherToEdit.id ||
            a.nama.trim().toUpperCase() === teacherToEdit.nama.trim().toUpperCase()
        );
      setUsername(existingAcc?.username || slugifyUsername(teacherToEdit.nama));
      setUsernameEditedManually(true);
    } else {
      setNama('');
      setRole('guru_ngaji');
      setKelompokBTQ('TILAWATI 4 PA');
      setRuangan('RUANGAN 7A');
      setKontak('');
      setUsername('');
      setUsernameEditedManually(false);
    }
  }, [teacherToEdit, isOpen]);

  // Auto-suggest username when typing teacher name for new teacher
  useEffect(() => {
    if (!teacherToEdit && !usernameEditedManually && nama.trim()) {
      setUsername(slugifyUsername(nama));
    }
  }, [nama, teacherToEdit, usernameEditedManually]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim()) {
      onNotify('error', 'Nama Guru Wajib Diisi', 'Silakan masukkan nama lengkap ustadz / ustadzah.');
      return;
    }

    if (password.trim().length > 0 && password.trim().length < 6) {
      onNotify('error', 'Password Terlalu Pendek', 'Password login guru minimal 6 karakter.');
      return;
    }

    let savedTeacher: Teacher;
    if (teacherToEdit) {
      storage.updateTeacher(teacherToEdit.id, {
        nama: nama.trim().toUpperCase(),
        role,
        kelompokBTQ: kelompokBTQ.trim(),
        ruangan: ruangan.trim(),
        kontak: kontak.trim()
      });
      savedTeacher = {
        ...teacherToEdit,
        nama: nama.trim().toUpperCase(),
        role,
        kelompokBTQ: kelompokBTQ.trim(),
        ruangan: ruangan.trim(),
        kontak: kontak.trim()
      };
    } else {
      savedTeacher = storage.addTeacher({
        nama: nama.trim().toUpperCase(),
        role,
        kelompokBTQ: kelompokBTQ.trim(),
        ruangan: ruangan.trim(),
        kontak: kontak.trim()
      });
    }

    const credRes = await authService.upsertTeacherCredentials({
      teacher: savedTeacher,
      username: username.trim() || undefined,
      password: password.trim() || undefined
    });

    if (!credRes.ok) {
      onNotify('error', 'Gagal Mengatur Akun Login', credRes.error);
      return;
    }

    if (teacherToEdit) {
      onNotify(
        'success',
        'Data & Akun Guru Diperbarui',
        `${savedTeacher.nama} (username: ${credRes.username}) berhasil diperbarui secara real-time.`
      );
    } else {
      const infoPwd = password.trim() ? 'sesuai input Anda' : `default (${DEFAULT_PASSWORDS.guru})`;
      onNotify(
        'success',
        'Guru & Akun Login Ditambahkan',
        `${savedTeacher.nama} · Username: ${credRes.username} · Password: ${infoPwd}.`
      );
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-200 max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {teacherToEdit ? 'Edit Data & Akun Guru' : 'Tambah Guru & Akun Login Baru'}
              </h2>
              <p className="text-[11px] text-slate-500">
                Pembaruan real-time pada sistem penugasan & keamanan SPEMDA
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

          {/* Credentials Box */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <KeyRound className="w-3.5 h-3.5 text-emerald-700" />
              <span>Kredensial Login Guru</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Username Login:
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={username}
                    onChange={e => {
                      setUsername(e.target.value);
                      setUsernameEditedManually(true);
                    }}
                    placeholder="contoh: umi.kulsum"
                    required
                    className="w-full pl-8 pr-2 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  {teacherToEdit ? 'Password Baru (Opsional):' : 'Password Awal (Opsional):'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={teacherToEdit ? 'Kosongkan jika tetap' : 'Min. 6 karakter'}
                    className="w-full pl-2.5 pr-8 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {!teacherToEdit && !password && (
              <p className="text-[10px] text-slate-500 leading-relaxed">
                Jika password dikosongkan, sistem menggunakan password standar guru dan dapat diubah pada menu Keamanan Akun.
              </p>
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
              className="w-1/2 py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
            >
              {teacherToEdit ? 'Simpan Perubahan' : 'Tambah Guru & Akun'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
