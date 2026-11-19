import React, { useState, useMemo } from 'react';
import {
  Role,
  UserAccount,
  UserSession,
  AuthLogEntry,
  Teacher,
  Student,
  AccessRequest
} from '../types';
import { authService, generateStrongPassword, evaluatePasswordStrength } from '../services/auth';
import { cloudDb, StaffDirectoryRecord } from '../services/cloudDb';
import { sanitizeDocId, normalizeEmail } from '../services/firebase';
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
  Cloud,
  UserCheck,
  XCircle,
  Mail
} from 'lucide-react';

interface AccountSecurityPanelProps {
  currentUser: UserSession;
  accounts: UserAccount[];
  logs: AuthLogEntry[];
  teachers?: Teacher[];
  staffDirectory?: StaffDirectoryRecord[];
  accessRequests?: AccessRequest[];
  students?: Student[];
  onRefreshAccounts: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, desc?: string) => void;
}

interface PendingApprovalDraft {
  role: 'admin' | 'guru_ngaji' | 'guru_tahfidz' | 'wali_kelas';
  teacherId: string;
  assignedClass: string;
  customNama: string;
  customGroup: string;
}

export const AccountSecurityPanel: React.FC<AccountSecurityPanelProps> = ({
  currentUser,
  accounts,
  logs,
  teachers = [],
  staffDirectory = [],
  accessRequests = [],
  students = [],
  onRefreshAccounts,
  onNotify
}) => {
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [subView, setSubView] = useState<'accounts' | 'logs'>('accounts');

  // Cloud Access Request Approval State
  const [approvalDrafts, setApprovalDrafts] = useState<Record<string, PendingApprovalDraft>>({});
  const [processingReqUid, setProcessingReqUid] = useState<string | null>(null);

  // Wali Kelas Gmail Binding State
  const [showWaliBinding, setShowWaliBinding] = useState(false);
  const [waliClass, setWaliClass] = useState(HOMEROOM_CLASSES[0]);
  const [waliNama, setWaliNama] = useState('');
  const [waliEmail, setWaliEmail] = useState('');
  const [isSavingWali, setIsSavingWali] = useState(false);

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

  const waliDirectoryEntries = useMemo(
    () => staffDirectory.filter(s => s.role === 'wali_kelas' && Boolean(s.email)),
    [staffDirectory]
  );

  const getDraftForRequest = (req: AccessRequest): PendingApprovalDraft => {
    const existing = approvalDrafts[req.uid];
    if (existing) return existing;

    const reqNameLower = req.nama.trim().toLowerCase();
    const matchedTeacher = teachers.find(
      t =>
        t.role === req.requestedRole &&
        (t.nama.trim().toLowerCase() === reqNameLower ||
          t.nama.trim().toLowerCase().includes(reqNameLower) ||
          reqNameLower.includes(t.nama.trim().toLowerCase()))
    );

    const matchedClass =
      HOMEROOM_CLASSES.find(c =>
        req.requestedNote.toUpperCase().includes(c.toUpperCase())
      ) || HOMEROOM_CLASSES[0];

    return {
      role: req.requestedRole,
      teacherId: matchedTeacher?.id || '',
      assignedClass: matchedClass,
      customNama: req.nama,
      customGroup: req.requestedNote || ''
    };
  };

  const updateDraftForRequest = (
    req: AccessRequest,
    patch: Partial<PendingApprovalDraft>
  ) => {
    const current = getDraftForRequest(req);
    setApprovalDrafts(prev => ({
      ...prev,
      [req.uid]: { ...current, ...patch }
    }));
  };

  const handleApproveRequest = async (req: AccessRequest) => {
    if (processingReqUid) return;
    const draft = getDraftForRequest(req);
    setProcessingReqUid(req.uid);

    try {
      const effectiveDir = [...staffDirectory];
      let teacherId = draft.teacherId || undefined;
      let pickedTeacher: Teacher | undefined;
      let nama = draft.customNama.trim() || req.nama;
      let assignedGroup: string | undefined;
      let assignedTahfidzGroup: string | undefined;
      let assignedClass: string | undefined;

      if (draft.role === 'admin') {
        assignedGroup = '-';
      } else if (draft.role === 'wali_kelas') {
        assignedClass = draft.assignedClass;
      } else {
        pickedTeacher = teachers.find(t => t.id === draft.teacherId);
        if (pickedTeacher) {
          teacherId = pickedTeacher.id;
          nama = pickedTeacher.nama;
          assignedGroup = pickedTeacher.kelompokBTQ;
          assignedTahfidzGroup = pickedTeacher.kelompokTahfidz;
        } else {
          // Create new staffDirectory record so email ACL computes cleanly
          const newTeacherId = sanitizeDocId(
            `${draft.role === 'guru_tahfidz' ? 'tch-tahfidz' : 'tch-btq'}-${nama.toLowerCase()}`,
            128
          );
          teacherId = newTeacherId;
          if (draft.role === 'guru_tahfidz') {
            assignedTahfidzGroup = draft.customGroup.trim() || 'HALAQAH TAHFIDZ';
          } else {
            assignedGroup = draft.customGroup.trim() || '-';
          }
          const newDirEntry: StaffDirectoryRecord = {
            id: newTeacherId,
            nama,
            role: draft.role,
            kelompokBTQ: assignedGroup || '-',
            kelompokTahfidz: assignedTahfidzGroup,
            ruangan: '-',
            email: normalizeEmail(req.email)
          };
          await cloudDb.saveStaffDirectoryBatch([newDirEntry]);
          effectiveDir.push(newDirEntry);
        }
      }

      await cloudDb.approveAccessRequestCloud({
        request: req,
        targetRole: draft.role,
        nama,
        teacherId,
        teacherRecord: pickedTeacher,
        assignedGroup,
        assignedTahfidzGroup,
        assignedClass,
        allStudents: students,
        staffDir: effectiveDir
      });

      onNotify(
        'success',
        'Akses Google Disetujui',
        `${req.email} telah ditautkan sebagai ${getRoleLabel(draft.role)} (${nama}) dan siap login real-time.`
      );
    } catch (err: any) {
      onNotify('error', 'Gagal Menyetujui Akses', err?.message || 'Terjadi kendala saat menyimpan ke Cloud.');
    } finally {
      setProcessingReqUid(null);
    }
  };

  const handleRejectRequest = async (req: AccessRequest) => {
    if (processingReqUid) return;
    setProcessingReqUid(req.uid);
    try {
      await cloudDb.rejectAccessRequestCloud(req.uid);
      onNotify('info', 'Permintaan Ditolak', `Permintaan akses dari ${req.email} telah ditolak.`);
    } catch (err: any) {
      onNotify('error', 'Gagal Menolak Permintaan', err?.message || 'Terjadi kendala jaringan.');
    } finally {
      setProcessingReqUid(null);
    }
  };

  const handleSaveWaliGmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = normalizeEmail(waliEmail);
    if (!cleanEmail || !cleanEmail.includes('@')) {
      onNotify('error', 'Email Tidak Valid', 'Masukkan alamat Gmail Wali Kelas yang valid.');
      return;
    }

    setIsSavingWali(true);
    try {
      const waliId = sanitizeDocId(`wali-${waliClass.toLowerCase()}`, 128);
      const waliEntry: StaffDirectoryRecord = {
        id: waliId,
        nama: waliNama.trim() || `Wali Kelas ${waliClass}`,
        role: 'wali_kelas',
        kelompokBTQ: '-',
        assignedClass: waliClass,
        ruangan: `KELAS ${waliClass}`,
        email: cleanEmail
      };

      await cloudDb.saveStaffDirectoryBatch([waliEntry]);

      const nextDir = [...staffDirectory];
      const idx = nextDir.findIndex(d => d.id === waliId);
      if (idx !== -1) nextDir[idx] = waliEntry;
      else nextDir.push(waliEntry);

      await cloudDb.recomputeAllPermissionsCloud(students, nextDir);

      onNotify(
        'success',
        'Email Wali Kelas Ditautkan',
        `Wali Kelas ${waliClass} (${cleanEmail}) kini dapat login via Google dalam mode pantau read-only.`
      );
      setWaliNama('');
      setWaliEmail('');
    } catch (err: any) {
      onNotify('error', 'Gagal Menautkan Wali Kelas', err?.message || 'Gagal menyimpan ke Cloud.');
    } finally {
      setIsSavingWali(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* CLOUD GOOGLE ACCESS REQUESTS & WALI KELAS BINDING (ADMIN CLOUD) */}
      {currentUser.role === 'admin' && currentUser.authProvider === 'google' && (
        <div className="space-y-4">
          {/* Cloud Multi-Account Sync Guide & Share Link Card */}
          <section className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Cloud className="w-4 h-4 text-emerald-700 shrink-0" />
                <h3 className="text-xs sm:text-sm font-extrabold text-emerald-950">
                  Sinkronisasi Multi-Akun Cloud Real-Time Aktif
                </h3>
              </div>
              <p className="text-[11px] text-emerald-900 leading-relaxed">
                Total <strong>{students.length} siswa</strong> tersinkron di Cloud.{' '}
                <strong>{teachers.filter(t => Boolean(t.email)).length}/{teachers.length}</strong> Guru &amp;{' '}
                <strong>{waliDirectoryEntries.length}</strong> Wali Kelas sudah memiliki email Google tertaut. Agar bisa sinkron di akun/perangkat lain, pengguna wajib klik <strong>Masuk dengan Akun Google</strong> (bukan username lokal).
              </p>
            </div>
            {typeof window !== 'undefined' && (
              <button
                type="button"
                onClick={() => copyText(window.location.origin, 'Link Portal SIM-Qur\'an')}
                className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shrink-0 shadow-2xs"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Link Portal</span>
              </button>
            )}
          </section>

          {pendingRequests.length > 0 && (
            <section className="bg-sky-50/90 border border-sky-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-sky-700 text-white flex items-center justify-center shrink-0">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-extrabold text-sky-950">
                      Permintaan Akses Google Masuk ({pendingRequests.length})
                    </h3>
                    <p className="text-[11px] text-sky-800">
                      Guru atau Wali Kelas yang login via Google menunggu penautan akun agar dapat mengakses data siswa binaannya secara real-time.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {pendingRequests.map(req => {
                  const draft = getDraftForRequest(req);
                  const matchingTeachers = teachers.filter(t => t.role === draft.role);
                  const isBusy = processingReqUid === req.uid;

                  return (
                    <div
                      key={req.uid}
                      className="bg-white rounded-xl border border-sky-200 p-3.5 space-y-3 shadow-2xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-slate-900">{req.nama}</span>
                            <code className="text-[11px] px-2 py-0.5 bg-sky-50 text-sky-900 border border-sky-200 rounded font-mono">
                              {req.email}
                            </code>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Mengajukan: <strong className="uppercase">{getRoleLabel(req.requestedRole)}</strong> · Catatan: <strong className="text-slate-700">{req.requestedNote || '-'}</strong>
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleRejectRequest(req)}
                            className="px-2.5 py-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1 disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Tolak</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleApproveRequest(req)}
                            className="px-3 py-1.5 text-[11px] font-bold text-white bg-emerald-800 hover:bg-emerald-700 rounded-lg flex items-center gap-1 shadow-2xs disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>{isBusy ? 'Memproses...' : 'Setujui & Tautkan Akun'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            Peran Tujuan
                          </label>
                          <select
                            value={draft.role}
                            onChange={e =>
                              updateDraftForRequest(req, {
                                role: e.target.value as 'admin' | 'guru_ngaji' | 'guru_tahfidz' | 'wali_kelas',
                                teacherId: ''
                              })
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
                          >
                            <option value="guru_ngaji">Guru Ngaji (BTQ)</option>
                            <option value="guru_tahfidz">Guru Tahfidz</option>
                            <option value="wali_kelas">Wali Kelas (Read-Only)</option>
                            <option value="admin">Administrator Tambahan (Co-Admin)</option>
                          </select>
                        </div>

                        {draft.role === 'admin' ? (
                          <div className="sm:col-span-2 flex items-center text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                            Akun ini akan mendapat akses penuh Administrator Cloud untuk seluruh siswa dan guru.
                          </div>
                        ) : draft.role === 'wali_kelas' ? (
                          <>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                Kelas Formal Binaan
                              </label>
                              <select
                                value={draft.assignedClass}
                                onChange={e =>
                                  updateDraftForRequest(req, { assignedClass: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
                              >
                                {HOMEROOM_CLASSES.map(c => (
                                  <option key={c} value={c}>
                                    Kelas {c}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                Nama Wali Kelas
                              </label>
                              <input
                                type="text"
                                value={draft.customNama}
                                onChange={e =>
                                  updateDraftForRequest(req, { customNama: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                Tautkan ke Guru Terdaftar
                              </label>
                              <select
                                value={draft.teacherId}
                                onChange={e =>
                                  updateDraftForRequest(req, { teacherId: e.target.value })
                                }
                                className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
                              >
                                <option value="">+ Buat Guru Baru</option>
                                {matchingTeachers.map(t => (
                                  <option key={t.id} value={t.id}>
                                    {t.nama} ({t.role === 'guru_tahfidz' ? t.kelompokTahfidz || t.kelompokBTQ : t.kelompokBTQ})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {!draft.teacherId && (
                              <div>
                                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                                  Kelompok / Halaqah Baru
                                </label>
                                <input
                                  type="text"
                                  value={draft.customGroup}
                                  onChange={e =>
                                    updateDraftForRequest(req, { customGroup: e.target.value })
                                  }
                                  placeholder="Contoh: TILAWATI 4 PI"
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                                />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Wali Kelas Google Binding Section */}
          <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-slate-900">
                    Tautkan Email Google Wali Kelas (Mode Pantau Read-Only)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {waliDirectoryEntries.length > 0
                      ? `${waliDirectoryEntries.length} Wali Kelas sudah terhubung dengan akun Google.`
                      : 'Daftarkan Gmail Wali Kelas agar bisa memantau report dan absensi kelasnya secara online.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowWaliBinding(prev => !prev)}
                className="px-3 py-1.5 text-xs font-bold text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl shrink-0"
              >
                {showWaliBinding ? 'Tutup Form Wali Kelas' : '+ Atur Email Google Wali Kelas'}
              </button>
            </div>

            {waliDirectoryEntries.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {waliDirectoryEntries.map(w => (
                  <span
                    key={w.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50/70 border border-purple-200 rounded-lg text-[11px] text-purple-950"
                  >
                    <strong className="font-bold">Kls {w.assignedClass}:</strong>
                    <span>{w.nama}</span>
                    <code className="text-[10px] text-purple-700 font-mono">({w.email})</code>
                  </span>
                ))}
              </div>
            )}

            {showWaliBinding && (
              <form
                onSubmit={handleSaveWaliGmail}
                className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-3 border-t border-slate-100 items-end"
              >
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Kelas Formal:
                  </label>
                  <select
                    value={waliClass}
                    onChange={e => setWaliClass(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white"
                  >
                    {HOMEROOM_CLASSES.map(c => (
                      <option key={c} value={c}>
                        Kelas {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Nama Wali Kelas:
                  </label>
                  <input
                    type="text"
                    required
                    value={waliNama}
                    onChange={e => setWaliNama(e.target.value)}
                    placeholder="Contoh: Ustadz Ahmad, S.Pd"
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Email Google (Gmail):
                  </label>
                  <input
                    type="email"
                    required
                    value={waliEmail}
                    onChange={e => setWaliEmail(e.target.value)}
                    placeholder="walikelas@gmail.com"
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-xl text-xs font-mono bg-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSavingWali}
                  className="py-2 px-3 bg-purple-700 hover:bg-purple-800 disabled:bg-slate-400 text-white font-bold rounded-xl text-xs shadow-2xs"
                >
                  {isSavingWali ? 'Menyimpan...' : 'Simpan & Tautkan'}
                </button>
              </form>
            )}
          </section>
        </div>
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
