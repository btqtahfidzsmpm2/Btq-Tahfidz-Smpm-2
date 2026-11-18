import React, { useState, useEffect } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { AccessRequest, Role, UserSession } from '../../types';
import { authService } from '../../services/auth';
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
  CheckCircle2,
  Send,
  ArrowLeft
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

  // Google Sign-In & Access Request states
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [showNewTabHint, setShowNewTabHint] = useState(false);
  const [unlinkedUser, setUnlinkedUser] = useState<FirebaseUser | null>(null);
  const [pendingRequest, setPendingRequest] = useState<AccessRequest | null>(null);
  const [reqNama, setReqNama] = useState('');
  const [reqRole, setReqRole] = useState<'guru_ngaji' | 'guru_tahfidz' | 'wali_kelas'>('guru_ngaji');
  const [reqNote, setReqNote] = useState('');
  const [reqSuccessMsg, setReqSuccessMsg] = useState<string | null>(null);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setGoogleError(null);
      setShowNewTabHint(false);
      setPassword('');
      setShowPassword(false);
      setReqSuccessMsg(null);
    } else {
      setUnlinkedUser(null);
      setPendingRequest(null);
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

  const formatGoogleAuthError = (err: any): { msg: string; suggestNewTab: boolean } => {
    const code = String(err?.code || '');
    const rawMsg = String(err?.message || '');

    if (code === 'auth/popup-blocked') {
      return {
        msg: 'Pop-up login Google diblokir oleh browser Anda. Izinkan pop-up untuk situs ini atau buka portal di tab browser penuh di bawah.',
        suggestNewTab: true
      };
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return {
        msg: isInIframe
          ? 'Pop-up login Google tertutup atau dibatasi di dalam frame preview. Klik "Buka Portal di Tab Baru" di bawah lalu login dengan akun Google Anda.'
          : 'Jendela pilih akun Google ditutup sebelum login selesai. Jika browser menutupnya otomatis, coba buka di tab Chrome/Safari penuh.',
        suggestNewTab: true
      };
    }
    if (code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/web-storage-unsupported') {
      return {
        msg: 'Browser atau aplikasi pembuka tautan ini (seperti browser bawaan WhatsApp/frame) tidak mendukung pop-up Google. Buka portal langsung di Chrome/Safari pada tab baru.',
        suggestNewTab: true
      };
    }
    if (code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'domain ini';
      return {
        msg: `Domain (${host}) belum diizinkan pada Firebase Auth. Pastikan Anda membuka tautan resmi aplikasi atau hubungi Admin.`,
        suggestNewTab: false
      };
    }
    if (code === 'auth/network-request-failed') {
      return {
        msg: 'Gagal terhubung ke server Google/Firebase. Periksa koneksi internet Anda lalu coba lagi.',
        suggestNewTab: false
      };
    }

    // Parse JSON wrapped Firestore errors if any
    try {
      const parsed = JSON.parse(rawMsg);
      if (parsed?.error) {
        return {
          msg: `Gagal verifikasi akses Cloud: ${parsed.error}`,
          suggestNewTab: false
        };
      }
    } catch {
      // non-JSON
    }

    return {
      msg: rawMsg || 'Gagal masuk dengan Google. Pastikan koneksi internet aktif dan pop-up diizinkan.',
      suggestNewTab: isInIframe
    };
  };

  const handleGoogleSignIn = async () => {
    if (isGoogleLoading || isSubmitting) return;
    setError(null);
    setGoogleError(null);
    setShowNewTabHint(false);
    setReqSuccessMsg(null);
    setIsGoogleLoading(true);

    try {
      const fbUser = await cloudDb.signInWithGoogle();
      const result = await cloudDb.resolveGoogleUserSession(fbUser);

      if (result.status === 'authorized' && result.session) {
        onLogin(result.session);
        onClose();
        return;
      }

      if (result.status === 'unverified') {
        await cloudDb.signOutGoogle();
        setGoogleError('Email Google Anda belum terverifikasi. Gunakan akun Gmail yang terverifikasi.');
        return;
      }

      if (result.status === 'disabled') {
        await cloudDb.signOutGoogle();
        setGoogleError('Akun Google Anda sedang dinonaktifkan oleh Administrator. Hubungi Admin SIM-Qur\'an.');
        return;
      }

      // Unlinked teacher / staff account -> open request form
      setUnlinkedUser(fbUser);
      setPendingRequest(result.pendingRequest || null);
      setReqNama(result.pendingRequest?.nama || fbUser.displayName || '');
      setReqRole(result.pendingRequest?.requestedRole || 'guru_ngaji');
      setReqNote(result.pendingRequest?.requestedNote || '');
    } catch (err: any) {
      const { msg, suggestNewTab } = formatGoogleAuthError(err);
      setGoogleError(msg);
      setShowNewTabHint(suggestNewTab);
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSubmitAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlinkedUser || isGoogleLoading) return;
    setError(null);
    setIsGoogleLoading(true);

    try {
      const savedReq = await cloudDb.submitAccessRequest({
        fbUser: unlinkedUser,
        nama: reqNama.trim() || unlinkedUser.displayName || 'Guru',
        requestedRole: reqRole,
        requestedNote: reqNote.trim() || '-'
      });
      setPendingRequest(savedReq);
      setReqSuccessMsg(
        'Permintaan akses berhasil dikirim ke Cloud. Silakan kabari Administrator agar menyetujui penautan akun Google Anda.'
      );
    } catch (err: any) {
      setError(err?.message || 'Gagal mengirim permintaan akses.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleSwitchGoogleAccount = async () => {
    try {
      await cloudDb.signOutGoogle();
    } catch {
      // ignore
    }
    setUnlinkedUser(null);
    setPendingRequest(null);
    setReqSuccessMsg(null);
    setError(null);
    setGoogleError(null);
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
                Login Portal Pengajar & Admin
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                SMP Muhammadiyah 2 Surabaya · Cloud Real-Time
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

        {/* Unlinked Google Account -> Request Access View */}
        {unlinkedUser ? (
          <div className="pt-4 space-y-4">
            <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 flex items-start gap-2.5">
              <Cloud className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
              <div className="text-xs text-sky-950 leading-relaxed">
                <p className="font-bold">Akun Google Terdeteksi: {unlinkedUser.email}</p>
                <p className="text-[11px] text-sky-800 mt-0.5">
                  Email Google ini belum ditautkan ke daftar Guru/Wali Kelas. Untuk login sebagai <strong>Admin Utama Cloud</strong>, klik <strong>Ganti Akun</strong> lalu pilih <code className="font-mono font-bold">btqtahfidzsmpm2@gmail.com</code>. Jika Anda Guru/Wali Kelas, kirim permintaan akses di bawah ini.
                </p>
              </div>
            </div>

            {pendingRequest?.status === 'pending' && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-amber-900">
                <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <p className="font-bold">Status Permintaan: Menunggu Persetujuan Admin</p>
                  <p>
                    Nama: <strong>{pendingRequest.nama}</strong> · Peran:{' '}
                    <strong className="uppercase">{pendingRequest.requestedRole.replace(/_/g, ' ')}</strong>
                  </p>
                  <p className="mt-0.5 text-amber-800">
                    Anda dapat memperbarui catatan di bawah ini atau login ulang setelah Admin menyetujui akun Anda.
                  </p>
                </div>
              </div>
            )}

            {pendingRequest?.status === 'rejected' && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2.5 text-rose-900">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  Permintaan sebelumnya ditolak oleh Admin. Periksa kembali identitas/kelas Anda lalu kirim ulang permintaan akses.
                </p>
              </div>
            )}

            {reqSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-emerald-900 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>{reqSuccessMsg}</span>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-rose-800 text-xs">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmitAccessRequest} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nama Lengkap Ustadz / Ustadzah:
                </label>
                <input
                  type="text"
                  required
                  value={reqNama}
                  onChange={e => setReqNama(e.target.value)}
                  placeholder="Contoh: Ustadzah Siti Aminah, S.Pd"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Peran yang Diajukan:
                </label>
                <select
                  value={reqRole}
                  onChange={e =>
                    setReqRole(e.target.value as 'guru_ngaji' | 'guru_tahfidz' | 'wali_kelas')
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="guru_ngaji">Guru Ngaji (Kelas BTQ)</option>
                  <option value="guru_tahfidz">Guru Tahfidz (Program Tahfidz)</option>
                  <option value="wali_kelas">Wali Kelas Formal (Pantau Report)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Keterangan Kelompok BTQ / Halaqah / Kelas:
                </label>
                <input
                  type="text"
                  required
                  value={reqNote}
                  onChange={e => setReqNote(e.target.value)}
                  placeholder="Misal: TILAWATI 4 PI, Halaqah Juz 30, atau Kelas 7A"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSwitchGoogleAccount}
                  className="px-3 py-2.5 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Ganti Akun</span>
                </button>
                <button
                  type="submit"
                  disabled={isGoogleLoading}
                  className="flex-1 py-2.5 px-4 bg-emerald-800 hover:bg-emerald-700 disabled:bg-slate-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isGoogleLoading
                      ? 'Mengirim...'
                      : pendingRequest?.status === 'pending'
                      ? 'Perbarui Permintaan Akses'
                      : 'Kirim Permintaan Akses ke Admin'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="pt-4 space-y-4">
            {/* Primary Cloud Login: Google Sign-In */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold text-emerald-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Login Cloud Real-Time (Online)</span>
                </span>
                <span className="text-[10px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200">
                  Disarankan
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Admin (<code className="font-mono font-bold">btqtahfidzsmpm2@gmail.com</code>) &amp; Guru masuk dengan akun Google untuk sinkronisasi real-time antar HP &amp; laptop.
              </p>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isGoogleLoading || isSubmitting}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-900 border border-slate-300 rounded-xl text-xs font-extrabold transition-colors shadow-xs flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
                  />
                </svg>
                <span>
                  {isGoogleLoading ? 'Menghubungkan ke Google...' : 'Masuk dengan Akun Google'}
                </span>
              </button>

              {googleError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 space-y-2 text-rose-900">
                  <div className="flex items-start gap-2 text-[11px] leading-relaxed">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span className="font-semibold">{googleError}</span>
                  </div>
                  {(showNewTabHint || isInIframe) && typeof window !== 'undefined' && (
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center py-2 px-3 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-colors"
                    >
                      Buka Portal di Tab Baru (Solusi Login Google)
                    </a>
                  )}
                </div>
              )}

              {!googleError && isInIframe && typeof window !== 'undefined' && (
                <div className="flex items-center justify-between gap-2 pt-0.5 text-[10px] text-emerald-900/80">
                  <span>Menggunakan frame preview?</span>
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-emerald-800 underline hover:text-emerald-950 shrink-0"
                  >
                    Buka di Tab Baru &rarr;
                  </a>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200" />
              <span className="shrink mx-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                atau akun lokal perangkat
              </span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            {/* Secondary Username / Password Login Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Role Verification Filter (Optional) */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block">
                  Kategori Akun Lokal
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
              <div className="space-y-1">
                <label htmlFor="login-username" className="text-xs font-bold text-slate-700 block">
                  Username Akun
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
                    placeholder="Contoh: admin atau umi.kulsum"
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-1">
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
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Untuk sinkronisasi multi-perangkat secara online, gunakan <strong>Masuk dengan Akun Google</strong>. Login username lokal hanya untuk perangkat ini.
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
                      : 'Masuk Akun Lokal'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
