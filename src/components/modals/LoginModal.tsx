import React, { useState, useEffect } from 'react';
import { Role, UserSession } from '../../types';
import { authService, DEFAULT_PASSWORDS } from '../../services/auth';
import { cloudDb } from '../../services/cloudDb';
import {
  ShieldCheck,
  User,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  X,
  LogIn,
  Cloud,
  Sparkles
} from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (session: UserSession) => void;
  onGoogleLoginSuccess?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLogin,
  onGoogleLoginSuccess
}) => {
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedSeconds, setLockedSeconds] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Reset form when modal opens
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

  const handleGoogleSignIn = async () => {
    if (isGoogleLoading) return;
    setError(null);
    setIsGoogleLoading(true);
    try {
      await cloudDb.signInWithGoogle();
      onGoogleLoginSuccess?.();
      onClose();
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const msg = (err as { message?: string })?.message || '';
      if (code === 'auth/popup-blocked') {
        setError(
          'Popup login Google diblokir oleh browser Anda. Mohon izinkan popup untuk situs ini lalu klik tombol Masuk Google lagi.'
        );
      } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('Jendela login Google ditutup sebelum selesai. Silakan coba lagi.');
      } else if (code === 'auth/unauthorized-domain') {
        setError(
          `Domain "${window.location.hostname}" belum terdaftar di Authorized Domains Firebase Authentication. Tambahkan domain ini pada Firebase Console > Authentication > Settings > Authorized domains.`
        );
      } else {
        setError(msg || 'Gagal masuk dengan Akun Google. Periksa koneksi internet Anda.');
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

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
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-200 my-4">

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
                Login Portal Pengajar &amp; Admin
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                SMP Muhammadiyah 2 Surabaya · Cloud Real-Time Sync
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

        {/* Cloud Login Section */}
        <div className="pt-4 space-y-3">
          {cloudDb.isSupabaseMode() ? (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5">
              <Cloud className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="text-[11px] text-emerald-950 leading-relaxed">
                <p className="font-bold flex items-center gap-1">
                  <span>Sinkron Cloud Terpusat Aktif (Supabase)</span>
                  <Sparkles className="w-3 h-3 text-amber-600" />
                </p>
                <p className="text-emerald-800 mt-0.5">
                  Masuk dengan username &amp; password petugas Anda. Seluruh data santri, Tilawati, Tahfidz, presensi, ujian, dan akun langsung tersinkronisasi di semua akun &amp; perangkat.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2.5">
              <div className="flex items-start gap-2">
                <Cloud className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="text-[11px] text-emerald-950 leading-relaxed">
                  <p className="font-bold flex items-center gap-1">
                    <span>Sinkron Cloud Real-Time Antar Akun &amp; HP/Laptop</span>
                    <Sparkles className="w-3 h-3 text-amber-600" />
                  </p>
                  <p className="text-emerald-800 mt-0.5">
                    Admin utama (<strong className="font-mono">btqtahfidzsmpm2@gmail.com</strong>), Guru BTQ, Guru Tahfidz, dan Wali Kelas otomatis tersinkronisasi datanya saat masuk dengan Google.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 disabled:bg-slate-100 text-slate-900 border border-emerald-300 rounded-xl text-xs font-extrabold transition-colors shadow-xs flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                <span>
                  {isGoogleLoading
                    ? 'Membuka Login Google...'
                    : 'Masuk dengan Akun Google (Sinkron Cloud)'}
                </span>
              </button>
            </div>
          )}

          {/* Error Alert (shared for Cloud & username/password auth) */}
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

          {!cloudDb.isSupabaseMode() && (
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center" aria-hidden="true">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Atau Login Username &amp; Password
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Username & Password Form */}
        <form onSubmit={handleSubmit} className="pt-2 space-y-3">
          {/* Role Verification Filter (Optional) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block">
              Kategori Peran (Login Lokal)
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 p-1 bg-slate-100 rounded-xl">
              {[
                { key: 'all', label: 'Semua' },
                { key: 'admin', label: 'Admin' },
                { key: 'guru_ngaji', label: 'Guru Ngaji' },
                { key: 'guru_tahfidz', label: 'Guru Tahfidz' },
                { key: 'wali_kelas', label: 'Wali Kls' }
              ].map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setRoleFilter(tab.key as Role | 'all');
                    setError(null);
                  }}
                  className={`py-1.5 px-1 rounded-lg text-[10px] sm:text-[11px] font-bold transition-colors whitespace-nowrap ${
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

          {/* Username Field */}
          <div className="space-y-1">
            <label htmlFor="login-username" className="text-xs font-bold text-slate-700 block">
              Username Lokal
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Contoh: admin atau walikelas.7a"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-1">
            <label htmlFor="login-password" className="text-xs font-bold text-slate-700 block">
              Password Lokal
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
                placeholder="Masukkan password akun lokal"
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
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Login lokal (<code className="font-mono font-bold">admin</code> / <code className="font-mono font-bold">{DEFAULT_PASSWORDS.admin}</code>) hanya menyimpan data di browser ini saja. Untuk sinkron antar akun/perangkat, gunakan tombol <strong>Masuk dengan Akun Google</strong> di atas.
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
              className="w-2/3 py-2.5 px-4 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-400 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Memverifikasi...'
                  : lockedSeconds > 0
                  ? `Terkunci (${lockedSeconds}d)`
                  : 'Masuk Mode Lokal'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
