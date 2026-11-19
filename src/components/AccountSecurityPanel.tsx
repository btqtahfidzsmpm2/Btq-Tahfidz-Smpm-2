import React, { useState, useMemo } from 'react';
import {
  Role,
  UserAccount,
  UserSession,
  AuthLogEntry,
  AccessRequest,
  StaffInvite
} from '../types';
import { authService, generateStrongPassword, evaluatePasswordStrength } from '../services/auth';
import { isSupabaseConfigured } from '../services/supabase';
import { HOMEROOM_CLASSES } from '../data/initialData';
import {
  Shield,
  KeyRound,
  UserPlus,
  Search,
  Lock,
  Unlock,
  CheckCircle2,
  AlertTriangle,
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  History,
  Power,
  Trash2,
  X,
  Edit3,
  Link2,
  Cloud,
  Mail,
  UserCheck,
  UploadCloud
} from 'lucide-react';

interface AccountSecurityPanelProps {
  currentUser: UserSession;
  accounts: UserAccount[];
  logs: AuthLogEntry[];
  cloudConnected?: boolean;
  accessRequests?: AccessRequest[];
  staffInvites?: StaffInvite[];
  onApproveAccessRequest?: (params: {
    request: AccessRequest;
    role: Role;
    nama: string;
    assignedGroup?: string;
    assignedTahfidzGroup?: string;
    assignedClass?: string;
  }) => Promise<void>;
  onRejectAccessRequest?: (uid: string) => Promise<void>;
  onSaveCloudInvite?: (params: {
    email: string;
    nama: string;
    role: Role;
    assignedGroup?: string;
    assignedTahfidzGroup?: string;
    assignedClass?: string;
  }) => Promise<void>;
  onDeleteCloudInvite?: (inviteId: string) => Promise<void>;
  onResyncCloudAccess?: () => Promise<void>;
  onPushLocalToCloud?: () => Promise<void>;
  onRefreshAccounts: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

export const AccountSecurityPanel: React.FC<AccountSecurityPanelProps> = ({
  currentUser,
  accounts,
  logs,
  cloudConnected = false,
  accessRequests = [],
  staffInvites = [],
  onApproveAccessRequest,
  onRejectAccessRequest,
  onSaveCloudInvite,
  onDeleteCloudInvite,
  onResyncCloudAccess,
  onPushLocalToCloud,
  onRefreshAccounts,
  onNotify
}) => {
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [subView, setSubView] = useState<'accounts' | 'logs'>('accounts');

  // Cloud Invite & Request states
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteNama, setInviteNama] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('guru_ngaji');
  const [inviteGroup, setInviteGroup] = useState('');
  const [inviteTahfidzGroup, setInviteTahfidzGroup] = useState('HALAQAH TAHFIDZ');
  const [inviteClass, setInviteClass] = useState(HOMEROOM_CLASSES[0]);
  const [isCloudBusy, setIsCloudBusy] = useState(false);

  // Per-request editable overrides
  const [reqEdits, setReqEdits] = useState<
    Record<
      string,
      {
        role: Role;
        nama: string;
        assignedGroup: string;
        assignedTahfidzGroup: string;
        assignedClass: string;
      }
    >
  >({});

  // Reset Password Modal state
  const [resetTarget, setResetTarget] = useState<UserAccount | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [showResetPwd, setShowResetPwd] = useState(true);
  const [lastIssuedCreds, setLastIssuedCreds] = useState<{
    nama: string;
    username: string;
    password: string;
  } | null>(null);

  // Edit Username Modal state
  const [editTarget, setEditTarget] = useState<UserAccount | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editNama, setEditNama] = useState('');

  // Create Account Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createRole, setCreateRole] = useState<Role>('admin');
  const [createNama, setCreateNama] = useState('');
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createGroup, setCreateGroup] = useState('');
  const [createTahfidzGroup, setCreateTahfidzGroup] = useState('');
  const [createClass, setCreateClass] = useState(HOMEROOM_CLASSES[0]);

  const metrics = useMemo(() => {
    const now = Date.now();
    return {
      total: accounts.length,
      active: accounts.filter(a => a.isActive).length,
      defaultPwdCount: accounts.filter(a => a.isDefaultPassword).length,
      lockedOrDisabled: accounts.filter(
        a => !a.isActive || (a.lockedUntil && a.lockedUntil > now)
      ).length
    };
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return accounts.filter(acc => {
      if (roleFilter !== 'all' && acc.role !== roleFilter) return false;
      if (
        q &&
        !acc.nama.toLowerCase().includes(q) &&
        !acc.username.toLowerCase().includes(q) &&
        !(acc.assignedGroup || '').toLowerCase().includes(q) &&
        !(acc.assignedTahfidzGroup || '').toLowerCase().includes(q) &&
        !(acc.assignedClass || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [accounts, roleFilter, searchTerm]);

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify('info', `${label} Disalin`, `"${text}" telah disalin ke clipboard.`);
    } catch {
      onNotify('info', label, text);
    }
  };

  const openResetModal = (acc: UserAccount) => {
    setResetTarget(acc);
    setNewPasswordInput(generateStrongPassword(10));
    setShowResetPwd(true);
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;

    const res = await authService.adminResetPassword(resetTarget.id, newPasswordInput.trim(), false);
    if (!res.ok) {
      onNotify('error', 'Gagal Mengatur Password', res.error);
      return;
    }

    setLastIssuedCreds({
      nama: resetTarget.nama,
      username: resetTarget.username,
      password: newPasswordInput.trim()
    });
    onNotify(
      'success',
      'Password Akun Diperbarui',
      `Password untuk ${resetTarget.username} berhasil direset dan dienkripsi.`
    );
    setResetTarget(null);
    onRefreshAccounts();
  };

  const handleConfirmEditAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;

    const res = authService.updateAccountMeta(editTarget.id, {
      username: editUsername,
      nama: editNama
    });
    if (!res.ok) {
      onNotify('error', 'Gagal Memperbarui Akun', res.error);
      return;
    }

    onNotify('success', 'Akun Diperbarui', `Perubahan username/nama berhasil disimpan.`);
    setEditTarget(null);
    onRefreshAccounts();
  };

  const handleToggleActive = (acc: UserAccount) => {
    const res = authService.updateAccountMeta(acc.id, { isActive: !acc.isActive });
    if (!res.ok) {
      onNotify('error', 'Tidak Dapat Mengubah Status', res.error);
      return;
    }
    onNotify(
      'success',
      acc.isActive ? 'Akun Dinonaktifkan' : 'Akun Diaktifkan',
      `Akun ${acc.username} kini ${acc.isActive ? 'nonaktif' : 'aktif kembali'}.`
    );
    onRefreshAccounts();
  };

  const handleUnlockAccount = (acc: UserAccount) => {
    const res = authService.updateAccountMeta(acc.id, { unlock: true });
    if (res.ok) {
      onNotify('success', 'Kunci Akun Dibuka', `Akun ${acc.username} sudah dapat login kembali.`);
      onRefreshAccounts();
    }
  };

  const handleDeleteExtraAccount = (acc: UserAccount) => {
    const res = authService.deleteAccount(acc.id, currentUser.accountId);
    if (!res.ok) {
      onNotify('error', 'Gagal Menghapus Akun', res.error);
      return;
    }
    onNotify('success', 'Akun Dihapus', `Akun ${acc.username} telah dihapus.`);
    onRefreshAccounts();
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await authService.createAccount({
      username: createUsername,
      password: createPassword,
      nama: createNama,
      role: createRole,
      assignedGroup: createRole === 'guru_ngaji' ? createGroup : undefined,
      assignedTahfidzGroup:
        createRole === 'guru_tahfidz'
          ? createTahfidzGroup || 'HALAQAH TAHFIDZ'
          : undefined,
      assignedClass: createRole === 'wali_kelas' ? createClass : undefined
    });

    if (!res.ok) {
      onNotify('error', 'Gagal Membuat Akun', res.error);
      return;
    }

    setLastIssuedCreds({
      nama: res.account.nama,
      username: res.account.username,
      password: createPassword
    });
    onNotify('success', 'Akun Baru Berhasil Dibuat', `Username "${res.account.username}" siap digunakan.`);
    setShowCreateModal(false);
    setCreateNama('');
    setCreateUsername('');
    setCreatePassword('');
    setCreateGroup('');
    setCreateTahfidzGroup('');
    onRefreshAccounts();
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return 'Belum pernah login';
    try {
      return new Date(iso).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  const getRoleLabel = (role: Role) => {
    switch (role) {
      case 'admin':
        return 'Administrator';
      case 'guru_ngaji':
        return 'Guru Ngaji (BTQ)';
      case 'guru_tahfidz':
        return 'Guru Tahfidz';
      case 'wali_kelas':
        return 'Wali Kelas';
    }
  };

  const pendingRequests = useMemo(
    () => accessRequests.filter(r => r.status === 'pending'),
    [accessRequests]
  );

  const getReqDraft = (req: AccessRequest) => {
    if (reqEdits[req.uid]) return reqEdits[req.uid];
    return {
      role: req.requestedRole || 'guru_ngaji',
      nama: req.nama || req.email.split('@')[0],
      assignedGroup: req.requestedRole === 'guru_ngaji' ? req.requestedNote || '' : '',
      assignedTahfidzGroup:
        req.requestedRole === 'guru_tahfidz' ? req.requestedNote || 'HALAQAH TAHFIDZ' : 'HALAQAH TAHFIDZ',
      assignedClass:
        req.requestedRole === 'wali_kelas' && HOMEROOM_CLASSES.includes(req.requestedNote.toUpperCase())
          ? req.requestedNote.toUpperCase()
          : HOMEROOM_CLASSES[0]
    };
  };

  const setReqDraftField = (
    req: AccessRequest,
    patch: Partial<{
      role: Role;
      nama: string;
      assignedGroup: string;
      assignedTahfidzGroup: string;
      assignedClass: string;
    }>
  ) => {
    const current = getReqDraft(req);
    setReqEdits(prev => ({
      ...prev,
      [req.uid]: { ...current, ...patch }
    }));
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveCloudInvite || !inviteEmail.trim() || !inviteNama.trim()) return;
    setIsCloudBusy(true);
    try {
      await onSaveCloudInvite({
        email: inviteEmail.trim().toLowerCase(),
        nama: inviteNama.trim().toUpperCase(),
        role: inviteRole,
        assignedGroup: inviteRole === 'guru_ngaji' ? inviteGroup.trim().toUpperCase() : undefined,
        assignedTahfidzGroup:
          inviteRole === 'guru_tahfidz'
            ? inviteTahfidzGroup.trim().toUpperCase() || 'HALAQAH TAHFIDZ'
            : undefined,
        assignedClass: inviteRole === 'wali_kelas' ? inviteClass : undefined
      });
      setInviteEmail('');
      setInviteNama('');
      setInviteGroup('');
    } finally {
      setIsCloudBusy(false);
    }
  };

  const handleApproveReq = async (req: AccessRequest) => {
    if (!onApproveAccessRequest) return;
    const draft = getReqDraft(req);
    setIsCloudBusy(true);
    try {
      await onApproveAccessRequest({
        request: req,
        role: draft.role,
        nama: draft.nama.trim().toUpperCase() || req.nama,
        assignedGroup: draft.role === 'guru_ngaji' ? draft.assignedGroup.trim().toUpperCase() : undefined,
        assignedTahfidzGroup:
          draft.role === 'guru_tahfidz'
            ? draft.assignedTahfidzGroup.trim().toUpperCase() || 'HALAQAH TAHFIDZ'
            : undefined,
        assignedClass: draft.role === 'wali_kelas' ? draft.assignedClass : undefined
      });
    } finally {
      setIsCloudBusy(false);
    }
  };

  const handleRejectReq = async (uid: string) => {
    if (!onRejectAccessRequest) return;
    setIsCloudBusy(true);
    try {
      await onRejectAccessRequest(uid);
    } finally {
      setIsCloudBusy(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Share Link & Cloud Multi-Account Sync Card */}
      {currentUser.role === 'admin' && typeof window !== 'undefined' && (
        <section
          className={`border rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xs ${
            cloudConnected
              ? 'bg-emerald-50/90 border-emerald-200'
              : 'bg-amber-50/90 border-amber-200'
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {cloudConnected ? (
                <Cloud className="w-4 h-4 text-emerald-700 shrink-0" />
              ) : (
                <Link2 className="w-4 h-4 text-amber-700 shrink-0" />
              )}
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-950">
                {isSupabaseConfigured
                  ? 'Sinkronisasi Cloud Terpusat Aktif (Supabase PostgreSQL & Realtime)'
                  : cloudConnected
                  ? 'Sinkronisasi Cloud Real-Time Aktif (Multi-Akun Google & Perangkat)'
                  : 'Mode Sesi Lokal — Hubungkan Akun Google Admin untuk Sinkron Cloud'}
              </h3>
            </div>
            <p className="text-[11px] text-slate-700 leading-relaxed max-w-3xl">
              {isSupabaseConfigured
                ? 'Seluruh data santri, guru BTQ/Tahfidz, capaian Tilawati, setoran Tahfidz, presensi, nilai ujian, rapor, serta akun petugas tersinkronisasi terpusat di database Supabase dan langsung terlihat di semua akun & perangkat.'
                : cloudConnected
                ? 'Setiap perubahan data siswa, capaian bacaan, hafalan tahfidz, absensi, dan rapor otomatis tersinkron secara real-time untuk semua guru, wali kelas, dan admin lain yang membuka link ini dengan Akun Google terdaftar.'
                : 'Anda sedang login memakai akun lokal. Agar link ini sinkron antar perangkat dan akun Google guru lain, login menggunakan Akun Google Admin Utama (btqtahfidzsmpm2@gmail.com).'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {cloudConnected && onPushLocalToCloud && (
              <button
                type="button"
                disabled={isCloudBusy}
                onClick={async () => {
                  setIsCloudBusy(true);
                  try {
                    await onPushLocalToCloud();
                  } finally {
                    setIsCloudBusy(false);
                  }
                }}
                className="px-3 py-2 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload Lokal ke Cloud</span>
              </button>
            )}

            {!isSupabaseConfigured && cloudConnected && onResyncCloudAccess && (
              <button
                type="button"
                disabled={isCloudBusy}
                onClick={async () => {
                  setIsCloudBusy(true);
                  try {
                    await onResyncCloudAccess();
                  } finally {
                    setIsCloudBusy(false);
                  }
                }}
                className="px-3 py-2 bg-white hover:bg-blue-50 text-blue-900 border border-blue-200 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isCloudBusy ? 'animate-spin' : ''}`} />
                <span>Sinkron Ulang Akses</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => copyText(window.location.origin, "Link Portal SIM-Qur'an")}
              className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin Link Portal</span>
            </button>
          </div>
        </section>
      )}

      {/* Pending Google Access Requests Approval Queue (Cloud Admin) */}
      {cloudConnected && currentUser.role === 'admin' && pendingRequests.length > 0 && (
        <section className="bg-amber-50/70 border border-amber-300 rounded-2xl p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-amber-700" />
              <h3 className="text-xs sm:text-sm font-extrabold text-amber-950">
                Permintaan Sinkron Akun Google Baru ({pendingRequests.length} Menunggu Persetujuan)
              </h3>
            </div>
            <span className="text-[11px] text-amber-800 font-semibold">
              Atur peran &amp; kelompok lalu klik Setujui
            </span>
          </div>

          <div className="space-y-2.5">
            {pendingRequests.map(req => {
              const draft = getReqDraft(req);
              return (
                <div
                  key={req.uid}
                  className="bg-white border border-amber-200 rounded-xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-slate-900">{req.nama}</span>
                      <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {req.email}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Permintaan: <strong>{getRoleLabel(req.requestedRole)}</strong>
                      {req.requestedNote ? ` · Keterangan: "${req.requestedNote}"` : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={draft.nama}
                      onChange={e => setReqDraftField(req, { nama: e.target.value })}
                      placeholder="Nama Lengkap"
                      className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold w-40 bg-white"
                    />

                    <select
                      value={draft.role}
                      onChange={e => setReqDraftField(req, { role: e.target.value as Role })}
                      className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold bg-white"
                    >
                      <option value="guru_ngaji">Guru Ngaji (BTQ)</option>
                      <option value="guru_tahfidz">Guru Tahfidz</option>
                      <option value="wali_kelas">Wali Kelas</option>
                      <option value="admin">Co-Admin</option>
                    </select>

                    {draft.role === 'guru_ngaji' && (
                      <input
                        type="text"
                        value={draft.assignedGroup}
                        onChange={e => setReqDraftField(req, { assignedGroup: e.target.value })}
                        placeholder="Kelompok BTQ (mis. TILAWATI 4 PI)"
                        className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs uppercase w-48 bg-white"
                      />
                    )}

                    {draft.role === 'guru_tahfidz' && (
                      <input
                        type="text"
                        value={draft.assignedTahfidzGroup}
                        onChange={e =>
                          setReqDraftField(req, { assignedTahfidzGroup: e.target.value })
                        }
                        placeholder="Halaqah Tahfidz"
                        className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs uppercase w-48 bg-white"
                      />
                    )}

                    {draft.role === 'wali_kelas' && (
                      <select
                        value={draft.assignedClass}
                        onChange={e => setReqDraftField(req, { assignedClass: e.target.value })}
                        className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold bg-white"
                      >
                        {HOMEROOM_CLASSES.map(c => (
                          <option key={c} value={c}>
                            Kelas {c}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      disabled={isCloudBusy}
                      onClick={() => handleApproveReq(req)}
                      className="px-3 py-1.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Setujui</span>
                    </button>

                    <button
                      type="button"
                      disabled={isCloudBusy}
                      onClick={() => handleRejectReq(req.uid)}
                      className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold disabled:opacity-50"
                    >
                      Tolak
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Pre-Authorized Google Emails & Invites (Firebase Cloud Admin) */}
      {!isSupabaseConfigured && cloudConnected && currentUser.role === 'admin' && onSaveCloudInvite && (
        <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-700" />
                <span>Daftar Email Google Terotorisasi (Auto-Sinkron Saat Guru / Wali Kelas Login)</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Daftarkan email Gmail Guru BTQ, Guru Tahfidz, Wali Kelas, atau Co-Admin di sini agar mereka langsung tersinkron otomatis begitu membuka link &amp; masuk Google.
              </p>
            </div>
            <span className="text-[11px] font-mono font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0">
              {staffInvites.length} Email Terdaftar
            </span>
          </div>

          <form onSubmit={handleCreateInvite} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-end">
            <div className="lg:col-span-2">
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                Email Google:
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="mis. ustadzah.siti@gmail.com"
                required
                className="w-full p-2 border border-slate-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                Nama Guru / Petugas:
              </label>
              <input
                type="text"
                value={inviteNama}
                onChange={e => setInviteNama(e.target.value)}
                placeholder="USTADZAH SITI"
                required
                className="w-full p-2 border border-slate-300 rounded-xl text-xs font-bold uppercase bg-white focus:outline-none focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">Peran:</label>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as Role)}
                className="w-full p-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white"
              >
                <option value="guru_ngaji">Guru Ngaji (BTQ)</option>
                <option value="guru_tahfidz">Guru Tahfidz</option>
                <option value="wali_kelas">Wali Kelas</option>
                <option value="admin">Co-Admin</option>
              </select>
            </div>

            <div>
              {inviteRole === 'guru_ngaji' ? (
                <>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Kelas BTQ Binaan:
                  </label>
                  <input
                    type="text"
                    value={inviteGroup}
                    onChange={e => setInviteGroup(e.target.value)}
                    placeholder="TILAWATI 4 PI"
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs uppercase bg-white"
                  />
                </>
              ) : inviteRole === 'guru_tahfidz' ? (
                <>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Halaqah Tahfidz:
                  </label>
                  <input
                    type="text"
                    value={inviteTahfidzGroup}
                    onChange={e => setInviteTahfidzGroup(e.target.value)}
                    placeholder="HALAQAH TAHFIDZ"
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs uppercase bg-white"
                  />
                </>
              ) : inviteRole === 'wali_kelas' ? (
                <>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Kelas Formal:
                  </label>
                  <select
                    value={inviteClass}
                    onChange={e => setInviteClass(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs font-bold bg-white"
                  >
                    {HOMEROOM_CLASSES.map(c => (
                      <option key={c} value={c}>
                        Kelas {c}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Lingkup:</label>
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 font-semibold">
                    Akses Penuh Admin
                  </div>
                </>
              )}
            </div>

            <div>
              <button
                type="submit"
                disabled={isCloudBusy}
                className="w-full py-2 px-3 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-2xs disabled:opacity-50"
              >
                + Daftarkan Email
              </button>
            </div>
          </form>

          {staffInvites.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Email Google</th>
                    <th className="p-2.5">Nama</th>
                    <th className="p-2.5">Peran</th>
                    <th className="p-2.5">Lingkup Akses</th>
                    <th className="p-2.5 text-center">Hapus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffInvites.map(inv => (
                    <tr key={inv.id} className="hover:bg-slate-50/70">
                      <td className="p-2.5 font-mono text-emerald-800 font-semibold">{inv.email}</td>
                      <td className="p-2.5 font-bold text-slate-900">{inv.nama}</td>
                      <td className="p-2.5 font-semibold text-slate-700">{getRoleLabel(inv.role)}</td>
                      <td className="p-2.5 text-slate-600">
                        {inv.role === 'guru_ngaji'
                          ? inv.assignedGroup || '-'
                          : inv.role === 'guru_tahfidz'
                          ? inv.assignedTahfidzGroup || 'HALAQAH TAHFIDZ'
                          : inv.role === 'wali_kelas'
                          ? `Kelas ${inv.assignedClass || '-'}`
                          : 'Administrator Penuh'}
                      </td>
                      <td className="p-2.5 text-center">
                        {onDeleteCloudInvite && (
                          <button
                            type="button"
                            disabled={isCloudBusy}
                            onClick={async () => {
                              setIsCloudBusy(true);
                              try {
                                await onDeleteCloudInvite(inv.id);
                              } finally {
                                setIsCloudBusy(false);
                              }
                            }}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="Hapus undangan akses Google ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Newly Reset/Created Credential Banner (One-time copy helper) */}
      {lastIssuedCreds && (
        <section className="bg-emerald-900 text-white rounded-2xl p-4 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-300" />
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-amber-300">
                Kredensial Siap Dibagikan — {lastIssuedCreds.nama}
              </h3>
            </div>
            <p className="text-xs text-emerald-100">
              Catat atau kirimkan detail login berikut secara pribadi kepada pengguna terkait (password disimpan terenkripsi SHA-256 dan tidak dapat dilihat lagi setelah ditutup):
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1 font-mono text-xs">
              <span className="bg-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-700">
                Username: <strong className="text-white">{lastIssuedCreds.username}</strong>
              </span>
              <span className="bg-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-700">
                Password: <strong className="text-amber-300">{lastIssuedCreds.password}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() =>
                copyText(
                  `Login SIM-Qur'an SMP Muhammadiyah 2 Surabaya\nNama: ${lastIssuedCreds.nama}\nUsername: ${lastIssuedCreds.username}\nPassword: ${lastIssuedCreds.password}`,
                  'Kredensial Login'
                )
              }
              className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-2xs"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Salin Pesan Login</span>
            </button>
            <button
              onClick={() => setLastIssuedCreds(null)}
              className="p-2 text-emerald-200 hover:text-white rounded-xl hover:bg-emerald-800"
              title="Tutup info kredensial"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* Metrics */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Total Akun Login</span>
            <Shield className="w-4 h-4 text-emerald-700" />
          </div>
          <span className="text-2xl font-black text-slate-900 font-mono tabular-nums">
            {metrics.total}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            {metrics.active} akun aktif terverifikasi
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Password Default</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <span className="text-2xl font-black text-amber-700 font-mono tabular-nums">
            {metrics.defaultPwdCount}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            Disarankan segera diganti
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Terkunci / Nonaktif</span>
            <Lock className="w-4 h-4 text-rose-600" />
          </div>
          <span className="text-2xl font-black text-rose-700 font-mono tabular-nums">
            {metrics.lockedOrDisabled}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            Proteksi akses sistem
          </span>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-medium">Aktivitas Keamanan</span>
            <History className="w-4 h-4 text-blue-600" />
          </div>
          <span className="text-2xl font-black text-blue-700 font-mono tabular-nums">
            {logs.length}
          </span>
          <span className="text-[11px] text-slate-400 block mt-0.5">
            Riwayat login & reset terbaru
          </span>
        </div>
      </section>

      {/* Sub-navigation: Accounts vs Logs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubView('accounts')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 ${
              subView === 'accounts'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Daftar Username & Akses Akun ({accounts.length})</span>
          </button>

          <button
            onClick={() => setSubView('logs')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 ${
              subView === 'logs'
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Log Aktivitas Login ({logs.length})</span>
          </button>
        </div>

        <button
          onClick={() => {
            setCreateRole('admin');
            setCreateNama('');
            setCreateUsername('');
            setCreatePassword(generateStrongPassword(10));
            setShowCreateModal(true);
          }}
          className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-xl text-xs transition-colors shadow-2xs flex items-center gap-1.5"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>+ Tambah Akun Admin / Petugas</span>
        </button>
      </div>

      {subView === 'accounts' ? (
        <section className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          {/* Filter Bar */}
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { key: 'all', label: 'Semua' },
                { key: 'admin', label: 'Admin' },
                { key: 'guru_ngaji', label: 'Guru Ngaji' },
                { key: 'guru_tahfidz', label: 'Guru Tahfidz' },
                { key: 'wali_kelas', label: 'Wali Kelas' }
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setRoleFilter(f.key as 'all' | Role)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    roleFilter === f.key
                      ? 'bg-emerald-800 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative md:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Cari nama, username, kelompok..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Accounts Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Nama Pemilik Akun</th>
                  <th className="p-3">Peran & Lingkup</th>
                  <th className="p-3">Username Login</th>
                  <th className="p-3">Keamanan Password</th>
                  <th className="p-3">Status & Login Terakhir</th>
                  <th className="p-3 text-center">Kelola Keamanan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.length > 0 ? (
                  filteredAccounts.map(acc => {
                    const isLocked = Boolean(acc.lockedUntil && acc.lockedUntil > Date.now());
                    return (
                      <tr key={acc.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-slate-900">
                            {acc.nama}
                            {acc.id === currentUser.accountId && (
                              <span className="ml-2 text-[10px] font-bold text-emerald-700">
                                (Akun Anda)
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-3">
                          <div
                            className={`font-bold ${
                              acc.role === 'admin'
                                ? 'text-indigo-700'
                                : acc.role === 'guru_ngaji'
                                ? 'text-emerald-800'
                                : acc.role === 'guru_tahfidz'
                                ? 'text-amber-700'
                                : 'text-purple-700'
                            }`}
                          >
                            {getRoleLabel(acc.role)}
                          </div>
                          {(acc.assignedGroup || acc.assignedTahfidzGroup || acc.assignedClass) && (
                            <div className="text-[11px] text-slate-500 space-y-0.5">
                              {acc.role === 'guru_ngaji' && acc.assignedGroup && (
                                <div>Kelas BTQ: {acc.assignedGroup}</div>
                              )}
                              {acc.role === 'guru_tahfidz' && (
                                <div className="text-amber-700 font-medium">
                                  Halaqah Tahfidz: {acc.assignedTahfidzGroup || acc.assignedGroup || 'HALAQAH TAHFIDZ'}
                                </div>
                              )}
                              {acc.assignedClass && <div>Kelas {acc.assignedClass}</div>}
                            </div>
                          )}
                        </td>

                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <code className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-slate-800 font-semibold">
                              {acc.username}
                            </code>
                            <button
                              onClick={() => copyText(acc.username, 'Username')}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded"
                              title="Salin username"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </td>

                        <td className="p-3">
                          {acc.isDefaultPassword ? (
                            <span className="text-amber-700 font-semibold flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              <span>Password Default</span>
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Password Kustom</span>
                            </span>
                          )}
                        </td>

                        <td className="p-3">
                          <div className="space-y-0.5">
                            {isLocked ? (
                              <span className="text-rose-700 font-bold">Terkunci Sementara</span>
                            ) : acc.isActive ? (
                              <span className="text-emerald-700 font-bold">Aktif</span>
                            ) : (
                              <span className="text-slate-500 font-bold">Nonaktif</span>
                            )}
                            <div className="text-[11px] text-slate-400">
                              {formatDateTime(acc.lastLogin)}
                            </div>
                          </div>
                        </td>

                        <td className="p-3">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openResetModal(acc)}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors"
                              title="Atur / Reset Password"
                            >
                              <KeyRound className="w-3 h-3" />
                              <span>Atur Password</span>
                            </button>

                            <button
                              onClick={() => {
                                setEditTarget(acc);
                                setEditUsername(acc.username);
                                setEditNama(acc.nama);
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Ubah Username / Nama"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {isLocked && (
                              <button
                                onClick={() => handleUnlockAccount(acc)}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title="Buka Kunci Akun"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {acc.id !== currentUser.accountId && (
                              <button
                                onClick={() => handleToggleActive(acc)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  acc.isActive
                                    ? 'text-slate-500 hover:text-rose-700 hover:bg-rose-50'
                                    : 'text-emerald-700 hover:bg-emerald-50'
                                }`}
                                title={acc.isActive ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {acc.id !== currentUser.accountId &&
                              acc.id !== 'acc-admin-primary' &&
                              !acc.teacherId &&
                              acc.role === 'admin' && (
                                <button
                                  onClick={() => handleDeleteExtraAccount(acc)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="Hapus Akun Admin Tambahan"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Tidak ada akun yang cocok dengan filter pencarian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        /* Audit Logs View */
        <section className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70">
            <h3 className="text-xs font-bold text-slate-800">
              Riwayat Aktivitas Login & Perubahan Keamanan (60 Terakhir)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3">Waktu</th>
                  <th className="p-3">Username</th>
                  <th className="p-3">Peristiwa</th>
                  <th className="p-3">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.length > 0 ? (
                  logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/60">
                      <td className="p-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {formatDateTime(log.timestamp)}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-800">{log.username}</td>
                      <td className="p-3">
                        <span
                          className={`font-bold text-[11px] ${
                            log.event === 'LOGIN_SUCCESS'
                              ? 'text-emerald-700'
                              : log.event === 'LOGIN_FAILED' || log.event === 'ACCOUNT_LOCKED'
                              ? 'text-rose-700'
                              : 'text-blue-700'
                          }`}
                        >
                          {log.event.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">{log.detail}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400">
                      Belum ada riwayat aktivitas keamanan tercatat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal 1: Reset / Set Custom Password */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Atur Password Akun</h3>
                <p className="text-[11px] text-slate-500">
                  {resetTarget.nama} · <code className="font-mono">{resetTarget.username}</code>
                </p>
              </div>
              <button
                onClick={() => setResetTarget(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmResetPassword} className="space-y-4 pt-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Password Baru:</label>
                  <button
                    type="button"
                    onClick={() => setNewPasswordInput(generateStrongPassword(10))}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Acak Password Kuat</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    type={showResetPwd ? 'text' : 'password'}
                    value={newPasswordInput}
                    onChange={e => setNewPasswordInput(e.target.value)}
                    required
                    minLength={6}
                    className="w-full pl-3 pr-9 py-2 border border-slate-300 rounded-xl text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPwd(p => !p)}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700"
                  >
                    {showResetPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {newPasswordInput && (
                  <p
                    className={`text-[11px] font-bold mt-1 ${
                      evaluatePasswordStrength(newPasswordInput).colorClass.split(' ')[0]
                    }`}
                  >
                    Kekuatan Password: {evaluatePasswordStrength(newPasswordInput).label}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="w-1/3 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  Simpan Password Baru
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Username / Name */}
      {editTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Ubah Username Akun</h3>
              <button
                onClick={() => setEditTarget(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmEditAccount} className="space-y-3 pt-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Tampilan:</label>
                <input
                  type="text"
                  value={editNama}
                  onChange={e => setEditNama(e.target.value)}
                  required
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Username Login:</label>
                <input
                  type="text"
                  value={editUsername}
                  onChange={e => setEditUsername(e.target.value)}
                  required
                  minLength={3}
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs font-mono font-bold bg-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="w-1/3 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Create Additional Account */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Tambah Akun Login Baru</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-3 pt-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Peran Akun:</label>
                <select
                  value={createRole}
                  onChange={e => setCreateRole(e.target.value as Role)}
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white"
                >
                  <option value="admin">Administrator Utama</option>
                  <option value="guru_ngaji">Guru Ngaji (Kelas BTQ)</option>
                  <option value="guru_tahfidz">Guru Tahfidz (Halaqah Tahfidz)</option>
                  <option value="wali_kelas">Wali Kelas Formal</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Lengkap:</label>
                <input
                  type="text"
                  value={createNama}
                  onChange={e => setCreateNama(e.target.value)}
                  placeholder="Misal: Ustadz Operator Koordinator"
                  required
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white"
                />
              </div>

              {createRole === 'guru_ngaji' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Kelompok / Kelas BTQ Binaan (pisahkan koma jika 2 kelas):
                  </label>
                  <input
                    type="text"
                    value={createGroup}
                    onChange={e => setCreateGroup(e.target.value)}
                    placeholder="Misal: TILAWATI 4 PA, TILAWATI 5 PA"
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs bg-white"
                  />
                </div>
              )}

              {createRole === 'guru_tahfidz' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Kelas / Halaqah Program Tahfidz:
                  </label>
                  <input
                    type="text"
                    value={createTahfidzGroup}
                    onChange={e => setCreateTahfidzGroup(e.target.value)}
                    placeholder="Misal: HALAQAH TAHFIDZ JUZ 30"
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs bg-white"
                  />
                </div>
              )}

              {createRole === 'wali_kelas' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Kelas Binaan:</label>
                  <select
                    value={createClass}
                    onChange={e => setCreateClass(e.target.value)}
                    className="w-full p-2 border border-slate-300 rounded-xl text-xs bg-white"
                  >
                    {HOMEROOM_CLASSES.map(c => (
                      <option key={c} value={c}>
                        Kelas {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Username:</label>
                <input
                  type="text"
                  value={createUsername}
                  onChange={e => setCreateUsername(e.target.value)}
                  placeholder="Misal: koordinator.btq"
                  required
                  minLength={3}
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs font-mono font-bold bg-white"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Password:</label>
                  <button
                    type="button"
                    onClick={() => setCreatePassword(generateStrongPassword(10))}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Buat Password Acak</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={createPassword}
                  onChange={e => setCreatePassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full p-2 border border-slate-300 rounded-xl text-xs font-mono font-bold bg-white"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="w-1/3 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
                >
                  Buat Akun Sekarang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
