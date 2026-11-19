/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  Student,
  UserSession,
  BacaanRecord,
  TahfidzRecord,
  AbsensiRecord,
  Teacher,
  UserAccount,
  AuthLogEntry,
  RaporSettings,
  RaporPrintStatus,
  RaporPrintBatchLog,
  AccessRequest,
  StaffInvite,
  Role
} from './types';
import { storage } from './services/storage';
import { authService } from './services/auth';
import { auth, BOOTSTRAP_ADMIN_EMAIL } from './services/firebase';
import { cloudDb } from './services/cloudDb';
import { isSupabaseConfigured } from './services/supabase';
import { supabaseDb } from './services/supabaseDb';
import {
  getAuthorizedStudents,
  getAuthorizedNgajiStudents,
  getAuthorizedTahfidzStudents
} from './utils/access';
import { Navbar } from './components/Navbar';
import { PublicPortal } from './components/PublicPortal';
import { TeacherDashboard } from './components/TeacherDashboard';
import { Toast, ToastMessage } from './components/Toast';
import {
  Cloud,
  Clock,
  CheckCircle2,
  RefreshCw,
  LogOut,
  ShieldAlert,
  Send
} from 'lucide-react';

// Modals
import { LoginModal } from './components/modals/LoginModal';
import { ChangePasswordModal } from './components/modals/ChangePasswordModal';
import { InputBacaanModal } from './components/modals/InputBacaanModal';
import { InputTahfidzModal } from './components/modals/InputTahfidzModal';
import { InputUjianModal } from './components/modals/InputUjianModal';
import { PresensiModal } from './components/modals/PresensiModal';
import { AddStudentModal } from './components/modals/AddStudentModal';
import { ImportDataModal } from './components/modals/ImportDataModal';
import { TeacherModal } from './components/modals/TeacherModal';
import { ConfirmDeleteModal } from './components/modals/ConfirmDeleteModal';

export default function App() {
  const [currentView, setCurrentView] = useState<'public' | 'dashboard'>('public');
  const [user, setUser] = useState<UserSession | null>(null);

  // Cloud Auth & Real-time Sync States
  const [isCloudBootstrapping, setIsCloudBootstrapping] = useState(false);
  const [cloudPending, setCloudPending] = useState<{
    uid: string;
    email: string;
    nama: string;
    existingRequest?: AccessRequest;
  } | null>(null);
  const [cloudDisabled, setCloudDisabled] = useState<{ email: string; nama: string } | null>(null);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [staffInvites, setStaffInvites] = useState<StaffInvite[]>([]);

  // Pending Access Request Form State
  const [reqNama, setReqNama] = useState('');
  const [reqRole, setReqRole] = useState<Role>('guru_ngaji');
  const [reqNote, setReqNote] = useState('');
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);

  // Core Data (Local Storage + Cloud Firestore Cache)
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [authLogs, setAuthLogs] = useState<AuthLogEntry[]>([]);
  const [bacaanList, setBacaanList] = useState<BacaanRecord[]>([]);
  const [tahfidzList, setTahfidzList] = useState<TahfidzRecord[]>([]);
  const [absensiList, setAbsensiList] = useState<AbsensiRecord[]>([]);
  const [raporSettings, setRaporSettings] = useState<RaporSettings>(() => storage.getRaporSettings());
  const [raporPrintStatuses, setRaporPrintStatuses] = useState<Record<string, RaporPrintStatus>>(() =>
    storage.getRaporPrintStatuses()
  );
  const [raporPrintLogs, setRaporPrintLogs] = useState<RaporPrintBatchLog[]>(() =>
    storage.getRaporPrintLogs()
  );

  // Selected Student for Public View
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const selectedStudentRef = useRef<Student | null>(null);
  useEffect(() => {
    selectedStudentRef.current = selectedStudent;
  }, [selectedStudent]);

  const userRef = useRef<UserSession | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const cloudUnsubRef = useRef<(() => void) | null>(null);
  const pendingUnsubRef = useRef<(() => void) | null>(null);
  const autoPushedCloudRef = useRef<boolean>(false);

  // Active student for modals
  const [modalTargetStudent, setModalTargetStudent] = useState<Student | undefined>(undefined);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);

  // Active teacher for modals
  const [teacherToEdit, setTeacherToEdit] = useState<Teacher | null>(null);

  // Delete confirmation target
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'Siswa' | 'Guru Pengajar' | 'Semua Data';
    name: string;
    idOrNisn: string;
  } | null>(null);

  // Modals state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showBacaanModal, setShowBacaanModal] = useState(false);
  const [showTahfidzModal, setShowTahfidzModal] = useState(false);
  const [showUjianModal, setShowUjianModal] = useState(false);
  const [showPresensiModal, setShowPresensiModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback(
    (type: 'success' | 'error' | 'info', title: string, description?: string) => {
      const id = Date.now().toString() + Math.random().toString(36).slice(2, 7);
      setToasts(prev => [...prev, { id, type, title, description }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4500);
    },
    []
  );

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const refreshAccounts = useCallback(() => {
    setAccounts(authService.getAccounts());
    setAuthLogs(authService.getLogs());
  }, []);

  // Reload data from localStorage
  const reloadData = useCallback(async () => {
    const stds = storage.getStudents();
    const tchs = storage.getTeachers();
    setStudents(stds);
    setTeachers(tchs);
    setBacaanList(storage.getBacaan());
    setTahfidzList(storage.getTahfidz());
    setAbsensiList(storage.getAbsensi());
    setRaporSettings(storage.getRaporSettings());
    setRaporPrintStatuses(storage.getRaporPrintStatuses());
    setRaporPrintLogs(storage.getRaporPrintLogs());

    // Keep local auth accounts synced with active teachers
    await authService.syncAccounts(tchs);
    refreshAccounts();

    // Sync selected student if any
    if (selectedStudentRef.current) {
      const refreshed = stds.find(s => s.nisn === selectedStudentRef.current?.nisn);
      if (refreshed) setSelectedStudent(refreshed);
    }
  }, [refreshAccounts]);

  // Helper to resolve & subscribe an authenticated Firebase Google user
  const activateCloudForFirebaseUser = useCallback(
    async (firebaseUser: FirebaseUser, isMountedRef: { current: boolean }) => {
      cloudUnsubRef.current?.();
      cloudUnsubRef.current = null;
      pendingUnsubRef.current?.();
      pendingUnsubRef.current = null;

      setIsCloudBootstrapping(true);
      try {
        const res = await cloudDb.bootstrapCloudSession(firebaseUser);
        if (!isMountedRef.current) return;

        if (res.status === 'authorized') {
          authService.logout();
          setCloudPending(null);
          setCloudDisabled(null);
          setUser(res.session);
          setCurrentView('dashboard');
          autoPushedCloudRef.current = false;

          cloudUnsubRef.current = cloudDb.subscribeCloudData(res.session, {
            onStudents: cloudStudents => {
              if (!isMountedRef.current) return;

              if (
                res.session.role === 'admin' &&
                cloudStudents.length === 0 &&
                !autoPushedCloudRef.current
              ) {
                const localStudents = storage.getStudents();
                const localTeachers = storage.getTeachers();
                if (localStudents.length > 0 || localTeachers.length > 0) {
                  autoPushedCloudRef.current = true;
                  cloudDb
                    .pushAllLocalToCloud({
                      students: localStudents,
                      teachers: localTeachers,
                      bacaan: storage.getBacaan(),
                      tahfidz: storage.getTahfidz(),
                      absensi: storage.getAbsensi(),
                      raporSettings: storage.getRaporSettings()
                    })
                    .then(() => {
                      addToast(
                        'success',
                        'Data Lokal Disinkronkan ke Cloud',
                        `${localStudents.length} santri & ${localTeachers.length} guru otomatis diunggah ke Cloud Real-Time.`
                      );
                    })
                    .catch(err => {
                      addToast(
                        'error',
                        'Gagal Unggah Awal ke Cloud',
                        err instanceof Error ? err.message : 'Periksa koneksi internet.'
                      );
                    });
                  return;
                }
              }

              storage.saveStudents(cloudStudents);
              setStudents(cloudStudents);
              if (selectedStudentRef.current) {
                const refreshed = cloudStudents.find(
                  s => s.nisn === selectedStudentRef.current?.nisn
                );
                if (refreshed) setSelectedStudent(refreshed);
              }
            },
            onBacaan: records => {
              if (!isMountedRef.current) return;
              storage.saveBacaan(records);
              setBacaanList(records);
            },
            onTahfidz: records => {
              if (!isMountedRef.current) return;
              storage.saveTahfidz(records);
              setTahfidzList(records);
            },
            onAbsensi: records => {
              if (!isMountedRef.current) return;
              storage.saveAbsensi(records);
              setAbsensiList(records);
            },
            onTeachers: cloudTeachers => {
              if (!isMountedRef.current) return;
              storage.saveTeachers(cloudTeachers);
              setTeachers(cloudTeachers);
              authService.syncAccounts(cloudTeachers).then(() => {
                if (isMountedRef.current) refreshAccounts();
              });
            },
            onAccessRequests: reqs => {
              if (!isMountedRef.current) return;
              setAccessRequests(reqs);
            },
            onStaffInvites: invs => {
              if (!isMountedRef.current) return;
              setStaffInvites(invs);
            },
            onRaporSettings: settings => {
              if (!isMountedRef.current) return;
              storage.saveRaporSettings(settings);
              setRaporSettings(settings);
            },
            onRaporStatuses: statuses => {
              if (!isMountedRef.current) return;
              storage.saveRaporPrintStatuses(statuses);
              setRaporPrintStatuses(statuses);
            },
            onRaporLogs: logs => {
              if (!isMountedRef.current) return;
              storage.saveRaporPrintLogs(logs);
              setRaporPrintLogs(logs);
            },
            onSyncError: err => {
              addToast('error', 'Kendala Sinkronisasi Cloud', err.message);
            }
          });
        } else if (res.status === 'needs_request') {
          authService.logout();
          setUser(null);
          setCloudDisabled(null);
          setCloudPending({
            uid: res.uid,
            email: res.email,
            nama: res.nama,
            existingRequest: res.existingRequest
          });
          setReqNama(res.existingRequest?.nama || res.nama);
          setReqRole(res.existingRequest?.requestedRole || 'guru_ngaji');
          setReqNote(res.existingRequest?.requestedNote || '');
          setCurrentView('dashboard');

          pendingUnsubRef.current = cloudDb.subscribePendingApproval(
            res.uid,
            res.email,
            () => {
              if (auth.currentUser && isMountedRef.current) {
                activateCloudForFirebaseUser(auth.currentUser, isMountedRef);
              }
            },
            updatedReq => {
              if (!isMountedRef.current) return;
              setCloudPending(prev =>
                prev ? { ...prev, existingRequest: updatedReq } : prev
              );
            }
          );
        } else {
          authService.logout();
          setUser(null);
          setCloudPending(null);
          setCloudDisabled({ email: res.email, nama: res.nama });
          setCurrentView('dashboard');
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        addToast(
          'error',
          'Gagal Menghubungkan Akun Cloud',
          err instanceof Error ? err.message : 'Pastikan koneksi internet stabil dan coba lagi.'
        );
      } finally {
        if (isMountedRef.current) {
          setIsCloudBootstrapping(false);
        }
      }
    },
    [addToast, refreshAccounts]
  );

  useEffect(() => {
    const isMountedRef = { current: true };
    let supabaseUnsub: (() => void) | null = null;

    const syncFromSupabase = async (initialBoot = false) => {
      try {
        const snap = await supabaseDb.fetchAllCloudSnapshot();
        if (!isMountedRef.current) return;

        // If brand new Supabase database is empty while local browser has data, migrate once automatically
        if (
          initialBoot &&
          snap.students.length === 0 &&
          snap.teachers.length === 0 &&
          !autoPushedCloudRef.current
        ) {
          const localStds = storage.getStudents();
          const localTchs = storage.getTeachers();
          if (localStds.length > 0 || localTchs.length > 0) {
            autoPushedCloudRef.current = true;
            await supabaseDb.pushAllLocalToCloud({
              students: localStds,
              teachers: localTchs,
              bacaan: storage.getBacaan(),
              tahfidz: storage.getTahfidz(),
              absensi: storage.getAbsensi(),
              raporSettings: storage.getRaporSettings()
            });
            const seeded = await supabaseDb.fetchAllCloudSnapshot();
            if (!isMountedRef.current) return;
            storage.saveStudents(seeded.students);
            storage.saveTeachers(seeded.teachers);
            storage.saveBacaan(seeded.bacaan);
            storage.saveTahfidz(seeded.tahfidz);
            storage.saveAbsensi(seeded.absensi);
            setStudents(seeded.students);
            setTeachers(seeded.teachers);
            setBacaanList(seeded.bacaan);
            setTahfidzList(seeded.tahfidz);
            setAbsensiList(seeded.absensi);
            await authService.syncAccounts(seeded.teachers);
            refreshAccounts();
            return;
          }
        }

        storage.saveStudents(snap.students);
        storage.saveTeachers(snap.teachers);
        storage.saveBacaan(snap.bacaan);
        storage.saveTahfidz(snap.tahfidz);
        storage.saveAbsensi(snap.absensi);
        if (snap.raporSettings) {
          storage.saveRaporSettings(snap.raporSettings);
          setRaporSettings(snap.raporSettings);
        }
        storage.saveRaporPrintStatuses(snap.raporStatuses);
        storage.saveRaporPrintLogs(snap.raporLogs);

        setStudents(snap.students);
        setTeachers(snap.teachers);
        setBacaanList(snap.bacaan);
        setTahfidzList(snap.tahfidz);
        setAbsensiList(snap.absensi);
        setRaporPrintStatuses(snap.raporStatuses);
        setRaporPrintLogs(snap.raporLogs);

        if (snap.accounts.length > 0) {
          authService.saveAccounts(snap.accounts);
        }
        await authService.syncAccounts(snap.teachers);
        setAccounts(authService.getAccounts());
        if (snap.authLogs.length > 0) {
          setAuthLogs(snap.authLogs);
        } else {
          setAuthLogs(authService.getLogs());
        }

        if (selectedStudentRef.current) {
          const refreshed = snap.students.find(
            s => s.nisn === selectedStudentRef.current?.nisn
          );
          if (refreshed) setSelectedStudent(refreshed);
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        if (initialBoot) {
          addToast(
            'error',
            'Gagal Memuat Database Supabase',
            err instanceof Error ? err.message : 'Pastikan skema SQL Supabase dan Environment Variables sudah terpasang.'
          );
        }
      }
    };

    const initLocal = async () => {
      const wasWiped = storage.ensurePortalCleanedOnce();
      if (wasWiped) {
        authService.purgeTeacherAccounts();
        setSelectedStudent(null);
      }

      storage.deduplicateStudentsByName();
      storage.normalizeTeacherRoles();
      storage.syncTeachersFromStudents(false);
      await reloadData();

      if (!isMountedRef.current) return;

      if (isSupabaseConfigured) {
        setIsCloudBootstrapping(true);
        await syncFromSupabase(true);
        if (!isMountedRef.current) return;
        setIsCloudBootstrapping(false);

        const savedSession = authService.getSavedSession();
        if (savedSession) {
          setUser(savedSession);
        }
        supabaseUnsub = supabaseDb.subscribeRealtime(() => {
          void syncFromSupabase(false);
        });
        return;
      }

      // Firebase mode: only restore local session if Google Cloud auth isn't currently active
      if (!auth.currentUser) {
        const savedSession = authService.getSavedSession();
        if (savedSession) {
          setUser(savedSession);
        } else if (wasWiped) {
          setUser(null);
          setCurrentView('public');
        }
      }
    };
    void initLocal();

    // Real-time Firebase Google Auth listener (used when Supabase is not configured or for Google login)
    const unsubAuth = onAuthStateChanged(auth, firebaseUser => {
      if (!isMountedRef.current || isSupabaseConfigured) return;

      if (firebaseUser && firebaseUser.email) {
        activateCloudForFirebaseUser(firebaseUser, isMountedRef);
      } else {
        cloudUnsubRef.current?.();
        cloudUnsubRef.current = null;
        pendingUnsubRef.current?.();
        pendingUnsubRef.current = null;
        setCloudPending(null);
        setCloudDisabled(null);
        setAccessRequests([]);
        setStaffInvites([]);
        setIsCloudBootstrapping(false);

        if (userRef.current?.authProvider === 'google') {
          setUser(null);
        }
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubAuth();
      supabaseUnsub?.();
      cloudUnsubRef.current?.();
      pendingUnsubRef.current?.();
    };
  }, [activateCloudForFirebaseUser, addToast, refreshAccounts, reloadData]);

  const handleSyncTeachers = async () => {
    const res = storage.syncTeachersFromStudents(true);
    await reloadData();
    if (cloudDb.isCloudAuthenticated()) {
      try {
        await Promise.all(res.teachers.map(t => cloudDb.upsertTeacherCloud(t)));
      } catch (err) {
        addToast(
          'error',
          'Gagal Sinkronisasi Guru ke Cloud',
          err instanceof Error ? err.message : 'Terjadi kesalahan Cloud Firestore.'
        );
      }
    }
    addToast(
      'success',
      'Guru Berhasil Disinkronkan',
      `Data guru telah diperbarui. ${res.teachers.length} guru pengajar dimuat dan disinkronkan.`
    );
  };

  const handleDeduplicateStudents = async () => {
    const res = storage.deduplicateStudentsByName();
    await reloadData();
    if (res.removedCount > 0) {
      if (cloudDb.isCloudAuthenticated()) {
        try {
          await cloudDb.pushAllLocalToCloud({
            students: storage.getStudents(),
            teachers: storage.getTeachers(),
            bacaan: storage.getBacaan(),
            tahfidz: storage.getTahfidz(),
            absensi: storage.getAbsensi(),
            raporSettings: storage.getRaporSettings()
          });
        } catch (err) {
          addToast(
            'error',
            'Gagal Sinkronisasi Cloud Setelah Deduplikasi',
            err instanceof Error ? err.message : 'Coba tekan sinkron ulang.'
          );
        }
      }
      addToast(
        'success',
        'Pembersihan Data Dobel Berhasil',
        `Berhasil menghapus ${res.removedCount} siswa yang namanya dobel. Kini terdapat ${res.uniqueCount} santri unik.`
      );
    } else {
      addToast(
        'info',
        'Data Sudah Bersih',
        `Seluruh ${res.uniqueCount} santri telah memiliki nama unik (tidak ada duplikat).`
      );
    }
  };

  const handleLogin = (session: UserSession) => {
    setUser(session);
    setCurrentView('dashboard');
    refreshAccounts();
    addToast(
      'success',
      'Login Berhasil',
      `Selamat datang, ${session.nama} (${session.role.replace(/_/g, ' ').toUpperCase()}).`
    );
  };

  const handleLogout = async () => {
    const wasGoogle = user?.authProvider === 'google' || cloudDb.isCloudAuthenticated();
    authService.logout();
    if (wasGoogle) {
      try {
        await cloudDb.signOutGoogle();
      } catch {
        // ignore signOut errors
      }
    }
    cloudUnsubRef.current?.();
    cloudUnsubRef.current = null;
    pendingUnsubRef.current?.();
    pendingUnsubRef.current = null;
    setCloudPending(null);
    setCloudDisabled(null);
    setUser(null);
    setSelectedStudent(null);
    setCurrentView('public');
    addToast('info', 'Telah Keluar', 'Anda telah keluar dari portal pengajar.');
  };

  const handleSubmitAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloudPending) return;
    if (!reqNama.trim()) {
      addToast('error', 'Nama Wajib Diisi', 'Masukkan nama lengkap Anda agar mudah diverifikasi Admin.');
      return;
    }

    setIsSubmittingReq(true);
    try {
      await cloudDb.submitAccessRequest({
        nama: reqNama.trim(),
        requestedRole: reqRole,
        requestedNote: reqNote.trim() || '-'
      });
      addToast(
        'success',
        'Permintaan Akses Terkirim',
        `Menunggu persetujuan Admin (${BOOTSTRAP_ADMIN_EMAIL}). Halaman ini otomatis terbuka begitu disetujui.`
      );
    } catch (err) {
      addToast(
        'error',
        'Gagal Mengirim Permintaan',
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menghubungi Cloud.'
      );
    } finally {
      setIsSubmittingReq(false);
    }
  };

  const handleRecheckCloudStatus = async () => {
    if (!auth.currentUser) {
      setShowLoginModal(true);
      return;
    }
    const ref = { current: true };
    await activateCloudForFirebaseUser(auth.currentUser, ref);
  };

  // Admin Cloud Approval & Invite Handlers
  const handleApproveAccessRequest = async (params: {
    request: AccessRequest;
    role: Role;
    nama: string;
    assignedGroup?: string;
    assignedTahfidzGroup?: string;
    assignedClass?: string;
  }) => {
    try {
      await cloudDb.approveAccessRequest(params);
      addToast(
        'success',
        'Akun Google Disetujui',
        `${params.request.email} kini dapat sinkron real-time sebagai ${params.role.replace(/_/g, ' ')}.`
      );
    } catch (err) {
      addToast(
        'error',
        'Gagal Menyetujui Akses',
        err instanceof Error ? err.message : 'Terjadi kesalahan Cloud Firestore.'
      );
    }
  };

  const handleRejectAccessRequest = async (uid: string) => {
    try {
      await cloudDb.rejectAccessRequest(uid);
      addToast('info', 'Permintaan Ditolak', 'Permintaan akses Google tersebut telah ditolak.');
    } catch (err) {
      addToast(
        'error',
        'Gagal Menolak Permintaan',
        err instanceof Error ? err.message : 'Terjadi kesalahan Cloud Firestore.'
      );
    }
  };

  const handleSaveCloudInvite = async (params: {
    email: string;
    nama: string;
    role: Role;
    assignedGroup?: string;
    assignedTahfidzGroup?: string;
    assignedClass?: string;
  }) => {
    try {
      await cloudDb.upsertStaffInviteAndSync(params);
      addToast(
        'success',
        'Email Google Diotorisasi',
        `${params.email} terdaftar & siap sinkron otomatis saat membuka link portal.`
      );
    } catch (err) {
      addToast(
        'error',
        'Gagal Menyimpan Undangan Email',
        err instanceof Error ? err.message : 'Terjadi kesalahan Cloud Firestore.'
      );
    }
  };

  const handleDeleteCloudInvite = async (inviteId: string) => {
    try {
      await cloudDb.deleteStaffInviteCloud(inviteId);
      addToast('info', 'Otorisasi Dihapus', 'Email tersebut dihapus dari daftar undangan Cloud.');
    } catch (err) {
      addToast(
        'error',
        'Gagal Menghapus Otorisasi',
        err instanceof Error ? err.message : 'Terjadi kesalahan Cloud Firestore.'
      );
    }
  };

  const handleResyncCloudAccess = async () => {
    try {
      await cloudDb.resyncAllCloudAccess();
      addToast(
        'success',
        'Akses Cloud Disinkronkan',
        'Seluruh daftar siswa, bacaan, tahfidz, & presensi telah diselaraskan ke semua email guru & wali kelas.'
      );
    } catch (err) {
      addToast(
        'error',
        'Gagal Sinkron Ulang Akses',
        err instanceof Error ? err.message : 'Terjadi kesalahan Cloud Firestore.'
      );
    }
  };

  const handlePushLocalToCloud = async () => {
    try {
      const localStudents = storage.getStudents();
      const localTeachers = storage.getTeachers();
      await cloudDb.pushAllLocalToCloud({
        students: localStudents,
        teachers: localTeachers,
        bacaan: storage.getBacaan(),
        tahfidz: storage.getTahfidz(),
        absensi: storage.getAbsensi(),
        raporSettings: storage.getRaporSettings()
      });
      await cloudDb.resyncAllCloudAccess();
      addToast(
        'success',
        'Berhasil Unggah Data Lokal ke Cloud',
        `${localStudents.length} santri dan ${localTeachers.length} guru kini tersedia real-time di semua akun.`
      );
    } catch (err) {
      addToast(
        'error',
        'Gagal Mengunggah ke Cloud',
        err instanceof Error ? err.message : 'Terjadi kesalahan Cloud Firestore.'
      );
    }
  };

  const handleViewStudentReport = (student: Student) => {
    setSelectedStudent(student);
    setCurrentView('public');
    addToast('info', 'Membuka Rapor Siswa', `Menampilkan rekapitulasi data ${student.nama}.`);
  };

  // Student Delete & Edit Handlers
  const handleDeleteStudent = (student: Student) => {
    setDeleteTarget({
      type: 'Siswa',
      name: `${student.nama} (${student.kelas} · NISN: ${student.nisn})`,
      idOrNisn: student.nisn
    });
    setShowDeleteConfirm(true);
  };

  const handleEditStudent = (student: Student) => {
    setStudentToEdit(student);
    setShowAddStudentModal(true);
  };

  // Teacher Add, Edit, Delete Handlers
  const handleAddTeacher = () => {
    setTeacherToEdit(null);
    setShowTeacherModal(true);
  };

  const handleEditTeacher = (teacher: Teacher) => {
    setTeacherToEdit(teacher);
    setShowTeacherModal(true);
  };

  const handleDeleteTeacher = (teacher: Teacher) => {
    setDeleteTarget({
      type: 'Guru Pengajar',
      name: `${teacher.nama} (${teacher.kelompokBTQ} · ${teacher.ruangan})`,
      idOrNisn: teacher.id
    });
    setShowDeleteConfirm(true);
  };

  const handleRequestClearAllData = () => {
    setDeleteTarget({
      type: 'Semua Data',
      name: `Seluruh ${students.length} data siswa, ${teachers.length} guru pengajar, riwayat bacaan, tahfidz, dan absensi`,
      idOrNisn: 'ALL'
    });
    setShowDeleteConfirm(true);
  };

  // Execute Confirmed Delete in Real Time (Local + Cloud)
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    try {
      if (deleteTarget.type === 'Semua Data') {
        if (cloudDb.isCloudAuthenticated()) {
          await cloudDb.clearAllCloudData();
        }
        storage.clearAllData();
        authService.purgeTeacherAccounts();
        setSelectedStudent(null);
        addToast(
          'success',
          'Semua Data Dikosongkan',
          'Seluruh data siswa, guru BTQ/Tahfidz, bacaan, tahfidz, rapor, dan presensi telah dihapus dari perangkat & Cloud.'
        );
      } else if (deleteTarget.type === 'Siswa') {
        if (cloudDb.isCloudAuthenticated()) {
          await cloudDb.deleteStudentCloud(deleteTarget.idOrNisn);
        }
        storage.deleteStudent(deleteTarget.idOrNisn);
        addToast(
          'success',
          'Data Siswa Berhasil Dihapus',
          `Data ${deleteTarget.name} telah dihapus dari sistem & Cloud.`
        );
      } else if (deleteTarget.type === 'Guru Pengajar') {
        if (cloudDb.isCloudAuthenticated()) {
          await cloudDb.deleteTeacherCloud(deleteTarget.idOrNisn);
        }
        storage.deleteTeacher(deleteTarget.idOrNisn);
        addToast(
          'success',
          'Guru Pengajar Berhasil Dihapus',
          `Data ${deleteTarget.name} telah dihapus dari sistem & Cloud.`
        );
      }
    } catch (err) {
      addToast(
        'error',
        'Kendala Menghapus Data Cloud',
        err instanceof Error ? err.message : 'Data lokal tetap diperbarui.'
      );
    }

    await reloadData();
    setDeleteTarget(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800 print:bg-white">
      {/* Navbar with 3-zone contract */}
      <Navbar
        currentView={currentView}
        onNavigate={view => setCurrentView(view)}
        user={user}
        cloudConnected={user?.authProvider === 'google' || isSupabaseConfigured}
        onConnectCloud={() => setShowLoginModal(true)}
        onOpenLogin={() => setShowLoginModal(true)}
        onOpenChangePassword={() => setShowChangePasswordModal(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 print:p-0 print:max-w-none print:m-0">
        {currentView === 'public' ? (
          <PublicPortal
            students={students}
            bacaanList={bacaanList}
            tahfidzList={tahfidzList}
            absensiList={absensiList}
            selectedStudent={selectedStudent}
            onSelectStudent={setSelectedStudent}
            onNotify={addToast}
          />
        ) : isCloudBootstrapping ? (
          <div className="max-w-xl mx-auto my-8 bg-white rounded-2xl border border-slate-200 shadow-xs p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              Menghubungkan &amp; Menyinkronkan Data Cloud...
            </h2>
            <p className="text-xs text-slate-500">
              Sedang memverifikasi otorisasi akun Google dan memuat data real-time sekolah.
            </p>
          </div>
        ) : user ? (
          <TeacherDashboard
            user={user}
            students={students}
            teachers={teachers}
            bacaanList={bacaanList}
            tahfidzList={tahfidzList}
            absensiList={absensiList}
            accounts={accounts}
            authLogs={authLogs}
            raporSettings={raporSettings}
            raporPrintStatuses={raporPrintStatuses}
            raporPrintLogs={raporPrintLogs}
            cloudConnected={user.authProvider === 'google' || isSupabaseConfigured}
            accessRequests={accessRequests}
            staffInvites={staffInvites}
            onApproveAccessRequest={handleApproveAccessRequest}
            onRejectAccessRequest={handleRejectAccessRequest}
            onSaveCloudInvite={handleSaveCloudInvite}
            onDeleteCloudInvite={handleDeleteCloudInvite}
            onResyncCloudAccess={handleResyncCloudAccess}
            onPushLocalToCloud={handlePushLocalToCloud}
            onRefreshAccounts={refreshAccounts}
            onOpenChangePasswordModal={() => setShowChangePasswordModal(true)}
            onOpenBacaanModal={student => {
              setModalTargetStudent(student);
              setShowBacaanModal(true);
            }}
            onOpenTahfidzModal={student => {
              setModalTargetStudent(student);
              setShowTahfidzModal(true);
            }}
            onOpenUjianModal={student => {
              setModalTargetStudent(student);
              setShowUjianModal(true);
            }}
            onOpenPresensiModal={() => setShowPresensiModal(true)}
            onOpenAddStudentModal={() => {
              setStudentToEdit(null);
              setShowAddStudentModal(true);
            }}
            onOpenEditStudentModal={handleEditStudent}
            onDeleteStudent={handleDeleteStudent}
            onOpenAddTeacherModal={handleAddTeacher}
            onOpenEditTeacherModal={handleEditTeacher}
            onDeleteTeacher={handleDeleteTeacher}
            onOpenImportModal={() => setShowImportModal(true)}
            onViewStudentReport={handleViewStudentReport}
            onSyncTeachersFromStudents={handleSyncTeachers}
            onDeduplicateStudents={handleDeduplicateStudents}
            onClearAllData={handleRequestClearAllData}
            onDataUpdated={reloadData}
            onNotify={addToast}
          />
        ) : cloudDisabled ? (
          <div className="max-w-lg mx-auto my-8 bg-white rounded-2xl border border-rose-200 shadow-xs p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Akses Akun Cloud Dinonaktifkan
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                Akun <strong>{cloudDisabled.email}</strong> ({cloudDisabled.nama}) saat ini berstatus nonaktif. Hubungi Admin utama (<strong>{BOOTSTRAP_ADMIN_EMAIL}</strong>) untuk mengaktifkan kembali akses Anda.
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar dari Akun Google
            </button>
          </div>
        ) : cloudPending ? (
          <div className="max-w-xl mx-auto my-6 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="bg-emerald-900 text-white p-6 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-white/10 rounded-xl shrink-0">
                  <Cloud className="w-6 h-6 text-amber-300" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold">
                    Sinkronisasi Akun Google ke Portal Sekolah
                  </h2>
                  <p className="text-xs text-emerald-200 mt-0.5">
                    Terhubung sebagai <strong className="text-white">{cloudPending.email}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                Keluar
              </button>
            </div>

            <div className="p-6 space-y-5">
              {cloudPending.existingRequest?.status === 'rejected' ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-1">
                  <p className="font-bold">Permintaan Akses Sebelumnya Ditolak Admin</p>
                  <p>
                    Silakan perbaiki keterangan peran/kelompok/kelas di bawah lalu kirim ulang permintaan atau hubungi Admin (<strong>{BOOTSTRAP_ADMIN_EMAIL}</strong>).
                  </p>
                </div>
              ) : cloudPending.existingRequest ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Menunggu Verifikasi Admin Utama ({BOOTSTRAP_ADMIN_EMAIL})</p>
                    <p className="text-amber-800">
                      Permintaan Anda telah masuk ke dasbor Admin. Begitu Admin menekan <strong>Setujui</strong> atau menambahkan email Anda, halaman ini akan terbuka otomatis secara real-time.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Langkah Terakhir Agar Data Tersinkron</p>
                    <p className="text-emerald-800">
                      Akun Google Anda belum terdaftar otomatis. Isi identitas &amp; tugas Anda di bawah ini agar Admin dapat mengaktifkan sinkronisasi kelas/kelompok Anda dalam 1 klik.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmitAccessRequest} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Lengkap Guru / Wali Kelas
                  </label>
                  <input
                    type="text"
                    required
                    value={reqNama}
                    onChange={e => setReqNama(e.target.value)}
                    placeholder="Contoh: UST. AHMAD FAUZI, S.Pd"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Peran Tugas di Sekolah
                  </label>
                  <select
                    value={reqRole}
                    onChange={e => setReqRole(e.target.value as Role)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="guru_ngaji">Guru BTQ (Kelas BTQ Putra/Putri)</option>
                    <option value="guru_tahfidz">Guru Tahfidz (Halaqah Tahfidz)</option>
                    <option value="wali_kelas">Wali Kelas (Pantau Kelas)</option>
                    <option value="admin">Admin Koordinator</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Keterangan Kelompok BTQ / Halaqah / Kelas
                  </label>
                  <input
                    type="text"
                    value={reqNote}
                    onChange={e => setReqNote(e.target.value)}
                    placeholder="Contoh: 7 PI 1 / HALAQAH TAHFIDZ 2 / Wali Kelas 7A"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleRecheckCloudStatus}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Cek Status Sinkronisasi
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingReq}
                    className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isSubmittingReq
                      ? 'Mengirim...'
                      : cloudPending.existingRequest
                      ? 'Perbarui Permintaan Akses'
                      : 'Kirim Permintaan Akses Cloud'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
            <p className="text-sm text-slate-600">
              Silakan masuk dengan Akun Google (Sinkron Cloud) atau akun pengajar untuk mengakses ruang kerja.
            </p>
            <button
              onClick={() => setShowLoginModal(true)}
              className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-2xs transition-colors"
            >
              Masuk / Sinkron Cloud
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500 no-print mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>
            &copy; 2026 SMP Muhammadiyah 2 Surabaya · SIM-Qur&apos;an &amp; Tahfidz Terpadu.
          </p>
          <div className="flex items-center gap-3 text-slate-400">
            <span>Tilawati Remaja</span>
            <span aria-hidden="true">·</span>
            <span>Munaqosyah Al-Qur&apos;an</span>
            <span aria-hidden="true">·</span>
            <span>Tahfidzul Qur&apos;an</span>
          </div>
        </div>
      </footer>

      {/* Interactive Modals */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLogin}
        onGoogleLoginSuccess={() => setCurrentView('dashboard')}
      />

      {user && (
        <>
          <ChangePasswordModal
            isOpen={showChangePasswordModal}
            onClose={() => setShowChangePasswordModal(false)}
            user={user}
            onSuccess={updated => {
              setUser(prev => (prev ? { ...prev, ...updated } : null));
              refreshAccounts();
            }}
            onNotify={addToast}
          />
          {user.role !== 'wali_kelas' && (
            <>
              <InputBacaanModal
                isOpen={showBacaanModal}
                onClose={() => {
                  setShowBacaanModal(false);
                  setModalTargetStudent(undefined);
                }}
                students={getAuthorizedNgajiStudents(user, students)}
                initialStudent={modalTargetStudent}
                user={user}
                onSuccess={reloadData}
                onNotify={addToast}
              />

              <InputTahfidzModal
                isOpen={showTahfidzModal}
                onClose={() => {
                  setShowTahfidzModal(false);
                  setModalTargetStudent(undefined);
                }}
                students={getAuthorizedTahfidzStudents(user, students)}
                initialStudent={modalTargetStudent}
                user={user}
                onSuccess={reloadData}
                onNotify={addToast}
              />

              <InputUjianModal
                isOpen={showUjianModal}
                onClose={() => {
                  setShowUjianModal(false);
                  setModalTargetStudent(undefined);
                }}
                students={getAuthorizedStudents(user, students)}
                initialStudent={modalTargetStudent}
                onSuccess={reloadData}
                onNotify={addToast}
              />

              <PresensiModal
                isOpen={showPresensiModal}
                onClose={() => setShowPresensiModal(false)}
                user={user}
                students={getAuthorizedStudents(user, students)}
                onSuccess={reloadData}
                onNotify={addToast}
              />
            </>
          )}

          {user.role === 'admin' && (
            <>
              <AddStudentModal
                isOpen={showAddStudentModal}
                studentToEdit={studentToEdit}
                teachersList={teachers.map(t => t.nama)}
                onClose={() => {
                  setShowAddStudentModal(false);
                  setStudentToEdit(null);
                }}
                onSuccess={() => reloadData()}
                onNotify={addToast}
              />

              <ImportDataModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onSuccess={() => reloadData()}
                onNotify={addToast}
              />

              <TeacherModal
                isOpen={showTeacherModal}
                teacherToEdit={teacherToEdit}
                onClose={() => {
                  setShowTeacherModal(false);
                  setTeacherToEdit(null);
                }}
                onSuccess={() => reloadData()}
                onNotify={addToast}
              />

              <ConfirmDeleteModal
                isOpen={showDeleteConfirm}
                onClose={() => {
                  setShowDeleteConfirm(false);
                  setDeleteTarget(null);
                }}
                onConfirm={handleConfirmDelete}
                title={
                  deleteTarget?.type === 'Semua Data'
                    ? 'Kosongkan Semua Data'
                    : deleteTarget?.type === 'Siswa'
                    ? 'Hapus Data Siswa'
                    : 'Hapus Guru Pengajar'
                }
                itemName={deleteTarget?.name || ''}
                itemType={deleteTarget?.type || 'Siswa'}
              />
            </>
          )}
        </>
      )}

      {/* In-app Toast notifications */}
      <Toast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}
