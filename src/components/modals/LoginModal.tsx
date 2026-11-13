import React, { useState, useEffect } from 'react';
import { Role, UserSession } from '../../types';
import { authService } from '../../services/auth';
import {
  ShieldCheck,
  User,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  X,
  LogIn
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (session: UserSession) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLogin
}) => {
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedSeconds, setLockedSeconds] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setPassword('');
      setShowPassword(false);
    }
  }, [isOpen]);

  // Countdown timer when temporarily locked
  useEffect(() => {
    if (lockedSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockedSeconds(prev => {
        if (prev <= 1) {
          setError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedSeconds]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || lockedSeconds > 0) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const result = await authService.authenticate(username, password, roleFilter);
      if (result.ok) {
        setUsername('');
        setPassword('');
        onLogin(result.session);
        onClose();
      } else {
        setError(result.error);
        if (result.lockedSeconds) {
          setLockedSeconds(result.lockedSeconds);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-200">

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <img
              src="/assets/logo_spemda_quran.png"
              alt="Logo SMP Muhammadiyah 2 Surabaya & Fashahah Balaghah Qur'an"
              className="h-10 w-auto object-contain bg-slate-50 p-1 rounded-lg border border-slate-200 shrink-0"
            />
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">
                Login Portal Pengajar & Admin
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                SMP Muhammadiyah 2 Surabaya
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition-colors"
            aria-label="Tutup dialog login"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">

          {/* Role Verification Filter (Optional) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block">
              Kategori Akun
            </label>
            <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 rounded-xl">
              {[
                { key: 'all', label: 'Semua' },
                { key: 'admin', label: 'Admin' },
                { key: 'guru_ngaji', label: 'Ngaji' },
                { key: 'guru_tahfidz', label: 'Tahfidz' },
                { key: 'wali_kelas', label: 'Wali Kls' }
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setRoleFilter(tab.key as Role | 'all');
                    setError(null);
                  }}
                  className={`py-1.5 px-1 rounded-lg text-[11px] font-bold transition-colors ${
                    roleFilter === tab.key
                      ? 'bg-emerald-800 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <p className="font-semibold">
                  {lockedSeconds > 0
                    ? `Akses dikunci sementara (${lockedSeconds} detik tersisa).`
                    : error}
                </p>
              </div>
            </div>
          )}

          {/* Username Field */}
          <div className="space-y-1.5">
            <label htmlFor="login-username" className="text-xs font-bold text-slate-700 block">
              Username Akun
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Contoh: admin atau umi.kulsum"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1.5">
            <label htmlFor="login-password" className="text-xs font-bold text-slate-700 block">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Masukkan password akun Anda"
                className="w-full pl-9 pr-10 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 p-0.5 rounded"
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Security Note */}
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-900 leading-relaxed">
              Login dilindungi verifikasi hash terenkripsi dan pembatasan percobaan gagal. Lupa username atau password? Hubungi <strong>Administrator SIM-Qur'an SPEMDA</strong> untuk reset kredensial.
            </p>
          </div>

          {/* Submit Buttons */}
          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-2.5 px-3 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting || lockedSeconds > 0}
              className="w-2/3 py-2.5 px-4 bg-emerald-800 hover:bg-emerald-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Memverifikasi...'
                  : lockedSeconds > 0
                  ? `Terkunci (${lockedSeconds}d)`
                  : 'Masuk dengan Akun'}
              </span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
