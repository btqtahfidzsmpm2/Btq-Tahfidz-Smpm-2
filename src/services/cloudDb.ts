import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth, db, googleProvider, BOOTSTRAP_ADMIN_EMAIL, testConnection } from './firebase';
import { isSupabaseConfigured } from './supabase';
import { supabaseDb } from './supabaseDb';
import {
  AbsensiRecord,
  AccessRequest,
  BacaanRecord,
  PublicStudentReport,
  RaporPrintBatchLog,
  RaporPrintStatus,
  RaporSettings,
  Role,
  StaffDirectoryEntry,
  StaffInvite,
  Student,
  TahfidzRecord,
  Teacher,
  UserSession
} from '../types';
import { isValidBtqClass, matchesAssignedGroup, matchesTeacherName } from '../utils/access';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errMessage = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
  },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function toSafeDocId(raw: string, fallbackPrefix = 'doc'): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120);
  if (!cleaned) {
    return `${fallbackPrefix}_${Date.now()}`;
  }
  return cleaned;
}

function clampStr(value: unknown, maxLen: number, fallback = ''): string {
  const str = value === undefined || value === null ? fallback : String(value);
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v !== undefined) {
      out[k] = v;
    }
  });
  return out;
}

function mapTimestampToIso(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val;
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (typeof (val as { toDate?: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

// In-memory Cloud RBAC / Access caches for fast permission computation
let _cachedAdminEmails: Set<string> = new Set([BOOTSTRAP_ADMIN_EMAIL]);
let _cachedStaffDirectory: StaffDirectoryEntry[] = [];
let _cachedStaffUsers: Array<{
  uid: string;
  email: string;
  nama: string;
  role: Role;
  teacherId?: string;
  assignedGroup?: string;
  assignedTahfidzGroup?: string;
  assignedClass?: string;
  isActive: boolean;
}> = [];
let _cachedInvites: StaffInvite[] = [];
const _cachedStudentAccessByNisn = new Map<
  string,
  { authorizedEmails: string[]; editorEmails: string[] }
>();

function getAdminEmailsList(): string[] {
  const set = new Set<string>([BOOTSTRAP_ADMIN_EMAIL]);
  _cachedAdminEmails.forEach(e => {
    const clean = normalizeEmail(e);
    if (clean) set.add(clean);
  });
  _cachedStaffUsers.forEach(u => {
    if (u.role === 'admin' && u.isActive && u.email) {
      set.add(normalizeEmail(u.email));
    }
  });
  _cachedInvites.forEach(inv => {
    if (inv.role === 'admin' && inv.email) {
      set.add(normalizeEmail(inv.email));
    }
  });
  return Array.from(set).slice(0, 20);
}

function computeStudentAccessLists(student: Student): {
  authorizedEmails: string[];
  editorEmails: string[];
} {
  const adminEmails = getAdminEmailsList();
  const editors = new Set<string>(adminEmails);
  const authorized = new Set<string>(adminEmails);

  const hasBtq = isValidBtqClass(student.kelasBTQ);

  // Match Staff Directory
  _cachedStaffDirectory.forEach(entry => {
    const email = normalizeEmail(entry.email);
    if (!email) return;

    if (entry.role === 'admin') {
      editors.add(email);
      authorized.add(email);
      return;
    }

    if (entry.role === 'guru_ngaji' && hasBtq) {
      if (
        matchesTeacherName(student.pengajar, entry.nama) ||
        (entry.kelompokBTQ && matchesAssignedGroup(student.kelasBTQ, entry.kelompokBTQ))
      ) {
        editors.add(email);
        authorized.add(email);
      }
      return;
    }

    if (entry.role === 'guru_tahfidz' && student.isTahfidz) {
      if (
        matchesTeacherName(student.pembimbingTahfidz, entry.nama) ||
        (entry.kelompokTahfidz &&
          student.halaqahTahfidz &&
          matchesAssignedGroup(student.halaqahTahfidz, entry.kelompokTahfidz))
      ) {
        editors.add(email);
        authorized.add(email);
      }
      return;
    }

    if (entry.role === 'wali_kelas') {
      const targetClass = (entry.assignedClass || entry.kelompokBTQ || '').trim().toUpperCase();
      if (targetClass && student.kelas.trim().toUpperCase() === targetClass) {
        authorized.add(email);
      }
    }
  });

  // Match Active Staff Users
  _cachedStaffUsers.forEach(u => {
    if (!u.isActive) return;
    const email = normalizeEmail(u.email);
    if (!email) return;

    if (u.role === 'admin') {
      editors.add(email);
      authorized.add(email);
      return;
    }

    if (u.role === 'guru_ngaji' && hasBtq) {
      if (
        matchesTeacherName(student.pengajar, u.nama) ||
        (u.assignedGroup && matchesAssignedGroup(student.kelasBTQ, u.assignedGroup))
      ) {
        editors.add(email);
        authorized.add(email);
      }
      return;
    }

    if (u.role === 'guru_tahfidz' && student.isTahfidz) {
      if (
        matchesTeacherName(student.pembimbingTahfidz, u.nama) ||
        (u.assignedTahfidzGroup &&
          student.halaqahTahfidz &&
          matchesAssignedGroup(student.halaqahTahfidz, u.assignedTahfidzGroup))
      ) {
        editors.add(email);
        authorized.add(email);
      }
      return;
    }

    if (u.role === 'wali_kelas') {
      const targetClass = (u.assignedClass || '').trim().toUpperCase();
      if (targetClass && student.kelas.trim().toUpperCase() === targetClass) {
        authorized.add(email);
      }
    }
  });

  // Match Pending Pre-Authorized Invites (so freshly imported teachers have access immediately upon claiming)
  _cachedInvites.forEach(inv => {
    const email = normalizeEmail(inv.email);
    if (!email) return;

    if (inv.role === 'admin') {
      editors.add(email);
      authorized.add(email);
      return;
    }

    if (inv.role === 'guru_ngaji' && hasBtq) {
      if (
        matchesTeacherName(student.pengajar, inv.nama) ||
        (inv.assignedGroup && matchesAssignedGroup(student.kelasBTQ, inv.assignedGroup))
      ) {
        editors.add(email);
        authorized.add(email);
      }
      return;
    }

    if (inv.role === 'guru_tahfidz' && student.isTahfidz) {
      if (
        matchesTeacherName(student.pembimbingTahfidz, inv.nama) ||
        (inv.assignedTahfidzGroup &&
          student.halaqahTahfidz &&
          matchesAssignedGroup(student.halaqahTahfidz, inv.assignedTahfidzGroup))
      ) {
        editors.add(email);
        authorized.add(email);
      }
      return;
    }

    if (inv.role === 'wali_kelas') {
      const targetClass = (inv.assignedClass || '').trim().toUpperCase();
      if (targetClass && student.kelas.trim().toUpperCase() === targetClass) {
        authorized.add(email);
      }
    }
  });

  return {
    authorizedEmails: Array.from(authorized).slice(0, 50),
    editorEmails: Array.from(editors).slice(0, 30)
  };
}

async function getStudentAccessForWrite(nisn: string): Promise<{
  authorizedEmails: string[];
  editorEmails: string[];
}> {
  const safeNisn = toSafeDocId(nisn, 'std');
  const cached = _cachedStudentAccessByNisn.get(safeNisn);
  if (cached && cached.authorizedEmails.length > 0 && cached.editorEmails.length > 0) {
    return cached;
  }

  try {
    const snap = await getDoc(doc(db, 'students', safeNisn));
    if (snap.exists()) {
      const d = snap.data();
      const res = {
        authorizedEmails: Array.isArray(d.authorizedEmails)
          ? (d.authorizedEmails as string[]).slice(0, 50)
          : getAdminEmailsList(),
        editorEmails: Array.isArray(d.editorEmails)
          ? (d.editorEmails as string[]).slice(0, 30)
          : getAdminEmailsList()
      };
      _cachedStudentAccessByNisn.set(safeNisn, res);
      return res;
    }
  } catch {
    // fallback below
  }

  const fallback = getAdminEmailsList();
  return { authorizedEmails: fallback, editorEmails: fallback };
}

function buildStudentDocPayload(
  student: Student,
  access: { authorizedEmails: string[]; editorEmails: string[] },
  isUpdate: boolean,
  existingCreatedAt?: unknown
): Record<string, unknown> {
  const safeNisn = toSafeDocId(student.nisn, 'std');
  const safeId = toSafeDocId(student.id || safeNisn, 'std');

  const payload = stripUndefined({
    id: safeId,
    nisn: safeNisn,
    nama: clampStr(student.nama, 150, 'SISWA'),
    gender: student.gender === 'L' ? 'L' : 'P',
    kelas: clampStr(student.kelas, 30, '-'),
    kelasBTQ: clampStr(student.kelasBTQ, 120, '-'),
    pengajar: clampStr(student.pengajar, 120, '-'),
    ruangan: clampStr(student.ruangan, 100, '-'),
    waliKelas: clampStr(student.waliKelas, 120, '-'),
    isTahfidz: Boolean(student.isTahfidz),
    pembimbingTahfidz: student.pembimbingTahfidz
      ? clampStr(student.pembimbingTahfidz, 120)
      : undefined,
    halaqahTahfidz: student.halaqahTahfidz
      ? clampStr(student.halaqahTahfidz, 120)
      : undefined,
    ruanganTahfidz: student.ruanganTahfidz
      ? clampStr(student.ruanganTahfidz, 100)
      : undefined,
    targetJuz: student.targetJuz ? clampStr(student.targetJuz, 80) : undefined,
    totalHafalan: student.totalHafalan ? clampStr(student.totalHafalan, 100) : undefined,
    hafalanTerakhir: student.hafalanTerakhir ? clampStr(student.hafalanTerakhir, 150) : undefined,
    capaianTerakhir: {
      tingkat: clampStr(student.capaianTerakhir?.tingkat, 120, '-'),
      halamanAyat: clampStr(student.capaianTerakhir?.halamanAyat, 120, '-'),
      tanggal: clampStr(student.capaianTerakhir?.tanggal, 30, new Date().toISOString().slice(0, 10)),
      nilai: (['A', 'B', 'C'].includes(student.capaianTerakhir?.nilai)
        ? student.capaianTerakhir.nilai
        : 'A') as 'A' | 'B' | 'C'
    },
    ujian: stripUndefined({
      tanggal: student.ujian?.tanggal ? clampStr(student.ujian.tanggal, 30) : undefined,
      jenis: student.ujian?.jenis ? clampStr(student.ujian.jenis, 120) : undefined,
      nilai: Math.min(100, Math.max(0, Number(student.ujian?.nilai ?? 80))),
      predikat: (['MUMTAZ', 'JAYYID', 'MAQBUL', 'ROSHIB', 'A', 'B', 'C', 'D'].includes(
        student.ujian?.predikat
      )
        ? student.ujian.predikat
        : 'JAYYID') as Student['ujian']['predikat'],
      natijah: clampStr(student.ujian?.natijah, 120, '-'),
      kelulusan: student.ujian?.kelulusan ? clampStr(student.ujian.kelulusan, 120) : undefined,
      keterangan: student.ujian?.keterangan ? clampStr(student.ujian.keterangan, 300) : undefined
    }),
    kehadiranPersen:
      typeof student.kehadiranPersen === 'number'
        ? Math.min(100, Math.max(0, Math.round(student.kehadiranPersen)))
        : 100,
    authorizedEmails: access.authorizedEmails.slice(0, 50),
    editorEmails: access.editorEmails.slice(0, 30),
    createdAt: isUpdate && existingCreatedAt ? existingCreatedAt : serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return payload;
}

function buildPublicReportPayload(
  student: Student,
  bacaanForStudent: BacaanRecord[],
  tahfidzForStudent: TahfidzRecord[],
  absensiForStudent: AbsensiRecord[]
): Record<string, unknown> {
  const safeNisn = toSafeDocId(student.nisn, 'std');

  const recentBacaan = [...bacaanForStudent]
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
    .slice(0, 12)
    .map(b =>
      stripUndefined({
        id: toSafeDocId(b.id, 'b'),
        nisn: safeNisn,
        tanggal: clampStr(b.tanggal, 30),
        tipe: b.tipe,
        jilid: clampStr(b.jilid, 100),
        halaman: clampStr(b.halaman, 100),
        nilai: b.nilai,
        catatan: b.catatan ? clampStr(b.catatan, 250) : undefined,
        pengajar: clampStr(b.pengajar, 120)
      })
    );

  const recentTahfidz = [...tahfidzForStudent]
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
    .slice(0, 12)
    .map(t =>
      stripUndefined({
        id: toSafeDocId(t.id, 't'),
        nisn: safeNisn,
        tanggal: clampStr(t.tanggal, 30),
        surat: clampStr(t.surat, 120),
        ayat: clampStr(t.ayat, 100),
        status: t.status,
        kelancaran: t.kelancaran,
        guru: clampStr(t.guru, 120),
        catatan: t.catatan ? clampStr(t.catatan, 250) : undefined
      })
    );

  const hadir = absensiForStudent.filter(a => a.status === 'Hadir').length;
  const sakit = absensiForStudent.filter(a => a.status === 'Sakit').length;
  const izin = absensiForStudent.filter(a => a.status === 'Izin').length;
  const alpa = absensiForStudent.filter(a => a.status === 'Alpa').length;
  const totalAbs = absensiForStudent.length;
  const persen =
    totalAbs > 0
      ? Math.round((hadir / totalAbs) * 100)
      : Math.min(100, Math.max(0, Math.round(student.kehadiranPersen ?? 100)));

  return stripUndefined({
    nisn: safeNisn,
    nama: clampStr(student.nama, 150, 'SISWA'),
    gender: student.gender === 'L' ? 'L' : 'P',
    kelas: clampStr(student.kelas, 30, '-'),
    kelasBTQ: clampStr(student.kelasBTQ, 120, '-'),
    pengajar: clampStr(student.pengajar, 120, '-'),
    ruangan: clampStr(student.ruangan, 100, '-'),
    waliKelas: clampStr(student.waliKelas, 120, '-'),
    isTahfidz: Boolean(student.isTahfidz),
    pembimbingTahfidz: student.pembimbingTahfidz
      ? clampStr(student.pembimbingTahfidz, 120)
      : undefined,
    halaqahTahfidz: student.halaqahTahfidz
      ? clampStr(student.halaqahTahfidz, 120)
      : undefined,
    targetJuz: student.targetJuz ? clampStr(student.targetJuz, 80) : undefined,
    totalHafalan: student.totalHafalan ? clampStr(student.totalHafalan, 100) : undefined,
    hafalanTerakhir: student.hafalanTerakhir ? clampStr(student.hafalanTerakhir, 150) : undefined,
    capaianTerakhir: {
      tingkat: clampStr(student.capaianTerakhir?.tingkat, 120, '-'),
      halamanAyat: clampStr(student.capaianTerakhir?.halamanAyat, 120, '-'),
      tanggal: clampStr(student.capaianTerakhir?.tanggal, 30, new Date().toISOString().slice(0, 10)),
      nilai: (['A', 'B', 'C'].includes(student.capaianTerakhir?.nilai)
        ? student.capaianTerakhir.nilai
        : 'A') as 'A' | 'B' | 'C'
    },
    ujian: stripUndefined({
      tanggal: student.ujian?.tanggal ? clampStr(student.ujian.tanggal, 30) : undefined,
      jenis: student.ujian?.jenis ? clampStr(student.ujian.jenis, 120) : undefined,
      nilai: Math.min(100, Math.max(0, Number(student.ujian?.nilai ?? 80))),
      predikat: (['MUMTAZ', 'JAYYID', 'MAQBUL', 'ROSHIB', 'A', 'B', 'C', 'D'].includes(
        student.ujian?.predikat
      )
        ? student.ujian.predikat
        : 'JAYYID') as Student['ujian']['predikat'],
      natijah: clampStr(student.ujian?.natijah, 120, '-'),
      kelulusan: student.ujian?.kelulusan ? clampStr(student.ujian.kelulusan, 120) : undefined,
      keterangan: student.ujian?.keterangan ? clampStr(student.ujian.keterangan, 300) : undefined
    }),
    kehadiranPersen: persen,
    recentBacaan,
    recentTahfidz,
    absensiSummary: { hadir, sakit, izin, alpa, persen },
    updatedAt: serverTimestamp()
  });
}

async function commitBatchedWrites(
  ops: Array<(batch: ReturnType<typeof writeBatch>) => void>
): Promise<void> {
  const CHUNK_SIZE = 350;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    const slice = ops.slice(i, i + CHUNK_SIZE);
    slice.forEach(fn => fn(batch));
    await batch.commit();
  }
}

export type CloudBootstrapResult =
  | { status: 'authorized'; session: UserSession }
  | {
      status: 'needs_request';
      uid: string;
      email: string;
      nama: string;
      existingRequest?: AccessRequest;
    }
  | { status: 'disabled'; email: string; nama: string };

export const cloudDb = {
  isSupabaseMode(): boolean {
    return isSupabaseConfigured;
  },

  isCloudAuthenticated(): boolean {
    if (isSupabaseConfigured) return true;
    return Boolean(auth.currentUser && auth.currentUser.email);
  },

  getCurrentEmail(): string | null {
    return auth.currentUser?.email ? normalizeEmail(auth.currentUser.email) : null;
  },

  async signInWithGoogle(): Promise<FirebaseUser> {
    await testConnection();
    const res = await signInWithPopup(auth, googleProvider);
    return res.user;
  },

  async signOutGoogle(): Promise<void> {
    if (!auth.currentUser) return;
    await signOut(auth);
  },

  async checkHealth(): Promise<boolean> {
    if (isSupabaseConfigured) {
      return supabaseDb.checkHealth();
    }
    return testConnection();
  },

  /**
   * Resolves verified Google account permissions:
   * 1. Bootstrap Admin (btqtahfidzsmpm2@gmail.com) -> auto-initializes /admins/{uid} & /staffUsers/{uid}
   * 2. Existing /staffUsers/{uid} or /admins/{uid} -> enters dashboard immediately
   * 3. Matching pre-authorized /staffInvites -> auto-claims /staffUsers/{uid} (and /admins/{uid} if admin) & enters dashboard!
   * 4. Otherwise -> checks /accessRequests/{uid} so user can submit/wait for 1-click admin approval
   */
  async bootstrapCloudSession(firebaseUser: FirebaseUser): Promise<CloudBootstrapResult> {
    const email = normalizeEmail(firebaseUser.email);
    const uid = toSafeDocId(firebaseUser.uid, 'uid');
    const displayNama = clampStr(
      firebaseUser.displayName || email.split('@')[0] || 'Pengguna Cloud',
      120
    );

    await testConnection();

    // 1. Bootstrap Admin
    if (email === BOOTSTRAP_ADMIN_EMAIL) {
      try {
        const adminRef = doc(db, 'admins', uid);
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          await setDoc(adminRef, {
            uid,
            email,
            nama: "Administrator Utama SIM-Qur'an",
            createdAt: serverTimestamp()
          });
        }

        const staffRef = doc(db, 'staffUsers', uid);
        const staffSnap = await getDoc(staffRef);
        if (!staffSnap.exists()) {
          await setDoc(staffRef, {
            uid,
            email,
            nama: "Administrator Utama SIM-Qur'an",
            role: 'admin',
            adminEmails: [BOOTSTRAP_ADMIN_EMAIL],
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `admins/${uid}`);
      }

      return {
        status: 'authorized',
        session: {
          accountId: uid,
          authUid: uid,
          authProvider: 'google',
          email,
          username: email,
          role: 'admin',
          nama: "Administrator Utama SIM-Qur'an",
          loginAt: Date.now()
        }
      };
    }

    // 2. Check existing /staffUsers/{uid}
    let staffData: Record<string, unknown> | null = null;
    try {
      const staffSnap = await getDoc(doc(db, 'staffUsers', uid));
      if (staffSnap.exists()) {
        staffData = staffSnap.data();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `staffUsers/${uid}`);
    }

    if (staffData) {
      if (staffData.isActive === false) {
        return {
          status: 'disabled',
          email,
          nama: clampStr(staffData.nama, 120, displayNama)
        };
      }
      const role = (staffData.role as Role) || 'guru_ngaji';
      return {
        status: 'authorized',
        session: {
          accountId: uid,
          authUid: uid,
          authProvider: 'google',
          email,
          username: email,
          role,
          nama: clampStr(staffData.nama, 120, displayNama),
          assignedGroup: staffData.assignedGroup ? String(staffData.assignedGroup) : undefined,
          assignedTahfidzGroup: staffData.assignedTahfidzGroup
            ? String(staffData.assignedTahfidzGroup)
            : undefined,
          assignedClass: staffData.assignedClass ? String(staffData.assignedClass) : undefined,
          loginAt: Date.now()
        }
      };
    }

    // 3. Check /admins/{uid}
    try {
      const adminSnap = await getDoc(doc(db, 'admins', uid));
      if (adminSnap.exists()) {
        const d = adminSnap.data();
        return {
          status: 'authorized',
          session: {
            accountId: uid,
            authUid: uid,
            authProvider: 'google',
            email,
            username: email,
            role: 'admin',
            nama: clampStr(d.nama, 120, displayNama),
            loginAt: Date.now()
          }
        };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `admins/${uid}`);
    }

    // 4. Auto-claim pre-authorized /staffInvites matching email
    try {
      const inviteQ = query(collection(db, 'staffInvites'), where('email', '==', email));
      const inviteSnap = await getDocs(inviteQ);
      if (!inviteSnap.empty) {
        const inviteDoc = inviteSnap.docs[0];
        const inv = inviteDoc.data();
        const inviteId = toSafeDocId(inv.id || inviteDoc.id, 'inv');
        const invRole = (inv.role as Role) || 'guru_ngaji';
        const invNama = clampStr(inv.nama, 120, displayNama);

        if (invRole === 'admin') {
          const adminCheck = await getDoc(doc(db, 'admins', uid));
          if (!adminCheck.exists()) {
            await setDoc(doc(db, 'admins', uid), {
              uid,
              email,
              nama: invNama,
              inviteId,
              createdAt: serverTimestamp()
            });
          }
        }

        const staffPayload = stripUndefined({
          uid,
          email,
          nama: invNama,
          role: invRole,
          teacherId: inv.teacherId ? clampStr(inv.teacherId, 128) : undefined,
          assignedGroup: inv.assignedGroup ? clampStr(inv.assignedGroup, 200) : undefined,
          assignedTahfidzGroup: inv.assignedTahfidzGroup
            ? clampStr(inv.assignedTahfidzGroup, 200)
            : undefined,
          assignedClass: inv.assignedClass ? clampStr(inv.assignedClass, 30) : undefined,
          inviteId,
          adminEmails: Array.isArray(inv.adminEmails)
            ? (inv.adminEmails as string[]).slice(0, 20)
            : [BOOTSTRAP_ADMIN_EMAIL],
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        await setDoc(doc(db, 'staffUsers', uid), staffPayload);

        // Clean up any leftover access request owned by this UID
        try {
          await deleteDoc(doc(db, 'accessRequests', uid));
        } catch {
          // ignore if none exists
        }

        return {
          status: 'authorized',
          session: {
            accountId: uid,
            authUid: uid,
            authProvider: 'google',
            email,
            username: email,
            role: invRole,
            nama: invNama,
            assignedGroup: inv.assignedGroup ? String(inv.assignedGroup) : undefined,
            assignedTahfidzGroup: inv.assignedTahfidzGroup
              ? String(inv.assignedTahfidzGroup)
              : undefined,
            assignedClass: inv.assignedClass ? String(inv.assignedClass) : undefined,
            loginAt: Date.now()
          }
        };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `staffInvites/${email}`);
    }

    // 5. No invite yet — check if they already submitted an access request
    let existingRequest: AccessRequest | undefined;
    try {
      const reqSnap = await getDoc(doc(db, 'accessRequests', uid));
      if (reqSnap.exists()) {
        const d = reqSnap.data();
        existingRequest = {
          uid: String(d.uid || uid),
          email: String(d.email || email),
          nama: String(d.nama || displayNama),
          requestedRole: (d.requestedRole as Role) || 'guru_ngaji',
          requestedNote: String(d.requestedNote || ''),
          status: (d.status as AccessRequest['status']) || 'pending',
          createdAt: mapTimestampToIso(d.createdAt),
          updatedAt: mapTimestampToIso(d.updatedAt)
        };
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `accessRequests/${uid}`);
    }

    return {
      status: 'needs_request',
      uid,
      email,
      nama: displayNama,
      existingRequest
    };
  },

  /**
   * Watches /staffUsers/{uid} and /staffInvites (matching email) while the user is waiting
   * on the pending approval screen so they enter the synced app the instant Admin approves.
   */
  subscribePendingApproval(
    uid: string,
    email: string,
    onGranted: () => void,
    onRequestUpdated?: (req: AccessRequest | undefined) => void
  ): () => void {
    const safeUid = toSafeDocId(uid, 'uid');
    const cleanEmail = normalizeEmail(email);

    const unsubStaff = onSnapshot(
      doc(db, 'staffUsers', safeUid),
      snap => {
        if (snap.exists() && snap.data()?.isActive !== false) {
          onGranted();
        }
      },
      err => {
        console.warn('Staff wait listener warning:', err.message);
      }
    );

    const unsubInvites = onSnapshot(
      query(collection(db, 'staffInvites'), where('email', '==', cleanEmail)),
      snap => {
        if (!snap.empty) {
          onGranted();
        }
      },
      err => {
        console.warn('Invite wait listener warning:', err.message);
      }
    );

    const unsubReq = onSnapshot(
      doc(db, 'accessRequests', safeUid),
      snap => {
        if (!onRequestUpdated) return;
        if (!snap.exists()) {
          onRequestUpdated(undefined);
          return;
        }
        const d = snap.data();
        onRequestUpdated({
          uid: String(d.uid || safeUid),
          email: String(d.email || cleanEmail),
          nama: String(d.nama || ''),
          requestedRole: (d.requestedRole as Role) || 'guru_ngaji',
          requestedNote: String(d.requestedNote || ''),
          status: (d.status as AccessRequest['status']) || 'pending',
          createdAt: mapTimestampToIso(d.createdAt),
          updatedAt: mapTimestampToIso(d.updatedAt)
        });
      },
      err => {
        console.warn('Access request listener warning:', err.message);
      }
    );

    return () => {
      unsubStaff();
      unsubInvites();
      unsubReq();
    };
  },

  async submitAccessRequest(params: {
    nama: string;
    requestedRole: Role;
    requestedNote: string;
  }): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email) {
      throw new Error('Silakan login dengan Akun Google terlebih dahulu.');
    }
    const uid = toSafeDocId(user.uid, 'uid');
    const email = normalizeEmail(user.email);
    const reqRef = doc(db, 'accessRequests', uid);

    try {
      const existing = await getDoc(reqRef);
      if (existing.exists()) {
        await updateDoc(reqRef, {
          nama: clampStr(params.nama, 120, email.split('@')[0]),
          requestedRole: params.requestedRole,
          requestedNote: clampStr(params.requestedNote, 200, '-'),
          status: 'pending',
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(reqRef, {
          uid,
          email,
          nama: clampStr(params.nama, 120, email.split('@')[0]),
          requestedRole: params.requestedRole,
          requestedNote: clampStr(params.requestedNote, 200, '-'),
          status: 'pending',
          adminEmails: [BOOTSTRAP_ADMIN_EMAIL],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `accessRequests/${uid}`);
    }
  },

  /**
   * Starts real-time Firestore listeners for the authenticated user session.
   */
  subscribeCloudData(
    session: UserSession,
    callbacks: {
      onStudents: (students: Student[]) => void;
      onBacaan: (records: BacaanRecord[]) => void;
      onTahfidz: (records: TahfidzRecord[]) => void;
      onAbsensi: (records: AbsensiRecord[]) => void;
      onTeachers: (teachers: Teacher[]) => void;
      onAccessRequests?: (requests: AccessRequest[]) => void;
      onStaffInvites?: (invites: StaffInvite[]) => void;
      onStaffDirectory?: (entries: StaffDirectoryEntry[]) => void;
      onRaporSettings?: (settings: RaporSettings) => void;
      onRaporStatuses?: (statuses: Record<string, RaporPrintStatus>) => void;
      onRaporLogs?: (logs: RaporPrintBatchLog[]) => void;
      onSyncError?: (error: Error) => void;
    }
  ): () => void {
    const cleanEmail = normalizeEmail(session.email || auth.currentUser?.email);
    const isAdmin = session.role === 'admin';
    const unsubs: Array<() => void> = [];

    const reportErr = (err: unknown, op: OperationType, path: string) => {
      try {
        handleFirestoreError(err, op, path);
      } catch (wrapped) {
        callbacks.onSyncError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    };

    // 1. Students listener
    const studentsQuery = isAdmin
      ? collection(db, 'students')
      : query(collection(db, 'students'), where('authorizedEmails', 'array-contains', cleanEmail));

    unsubs.push(
      onSnapshot(
        studentsQuery,
        snap => {
          const list: Student[] = snap.docs.map(d => {
            const data = d.data();
            const safeNisn = String(data.nisn || d.id);
            _cachedStudentAccessByNisn.set(toSafeDocId(safeNisn, 'std'), {
              authorizedEmails: Array.isArray(data.authorizedEmails)
                ? (data.authorizedEmails as string[])
                : [BOOTSTRAP_ADMIN_EMAIL],
              editorEmails: Array.isArray(data.editorEmails)
                ? (data.editorEmails as string[])
                : [BOOTSTRAP_ADMIN_EMAIL]
            });

            return {
              id: String(data.id || d.id),
              nisn: safeNisn,
              nama: String(data.nama || ''),
              gender: data.gender === 'L' ? 'L' : 'P',
              kelas: String(data.kelas || '-'),
              kelasBTQ: String(data.kelasBTQ || '-'),
              pengajar: String(data.pengajar || '-'),
              ruangan: String(data.ruangan || '-'),
              waliKelas: String(data.waliKelas || '-'),
              isTahfidz: Boolean(data.isTahfidz),
              pembimbingTahfidz: data.pembimbingTahfidz ? String(data.pembimbingTahfidz) : undefined,
              halaqahTahfidz: data.halaqahTahfidz ? String(data.halaqahTahfidz) : undefined,
              ruanganTahfidz: data.ruanganTahfidz ? String(data.ruanganTahfidz) : undefined,
              targetJuz: data.targetJuz ? String(data.targetJuz) : undefined,
              totalHafalan: data.totalHafalan ? String(data.totalHafalan) : undefined,
              hafalanTerakhir: data.hafalanTerakhir ? String(data.hafalanTerakhir) : undefined,
              capaianTerakhir: data.capaianTerakhir || {
                tingkat: '-',
                halamanAyat: '-',
                tanggal: new Date().toISOString().slice(0, 10),
                nilai: 'A'
              },
              ujian: data.ujian || {
                nilai: 80,
                predikat: 'JAYYID',
                natijah: '-'
              },
              kehadiranPersen:
                typeof data.kehadiranPersen === 'number' ? data.kehadiranPersen : 100
            };
          });
          callbacks.onStudents(list);
        },
        err => reportErr(err, OperationType.LIST, 'students')
      )
    );

    // 2. Bacaan listener
    const bacaanQuery = isAdmin
      ? collection(db, 'bacaan')
      : query(collection(db, 'bacaan'), where('authorizedEmails', 'array-contains', cleanEmail));

    unsubs.push(
      onSnapshot(
        bacaanQuery,
        snap => {
          const list: BacaanRecord[] = snap.docs
            .map(d => {
              const data = d.data();
              return {
                id: String(data.id || d.id),
                nisn: String(data.nisn || ''),
                tanggal: String(data.tanggal || ''),
                tipe: (data.tipe === "Al-Qur'an" ? "Al-Qur'an" : 'Tilawati Remaja') as BacaanRecord['tipe'],
                jilid: String(data.jilid || ''),
                halaman: String(data.halaman || ''),
                nilai: (['A', 'B', 'C'].includes(data.nilai) ? data.nilai : 'A') as 'A' | 'B' | 'C',
                catatan: data.catatan ? String(data.catatan) : undefined,
                pengajar: String(data.pengajar || '')
              };
            })
            .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
          callbacks.onBacaan(list);
        },
        err => reportErr(err, OperationType.LIST, 'bacaan')
      )
    );

    // 3. Tahfidz listener
    const tahfidzQuery = isAdmin
      ? collection(db, 'tahfidz')
      : query(collection(db, 'tahfidz'), where('authorizedEmails', 'array-contains', cleanEmail));

    unsubs.push(
      onSnapshot(
        tahfidzQuery,
        snap => {
          const list: TahfidzRecord[] = snap.docs
            .map(d => {
              const data = d.data();
              return {
                id: String(data.id || d.id),
                nisn: String(data.nisn || ''),
                tanggal: String(data.tanggal || ''),
                surat: String(data.surat || ''),
                ayat: String(data.ayat || ''),
                status: (data.status || 'Ziyadah') as TahfidzRecord['status'],
                kelancaran: (data.kelancaran || 'Sangat Lancar (Mumtaz)') as TahfidzRecord['kelancaran'],
                guru: String(data.guru || ''),
                catatan: data.catatan ? String(data.catatan) : undefined
              };
            })
            .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
          callbacks.onTahfidz(list);
        },
        err => reportErr(err, OperationType.LIST, 'tahfidz')
      )
    );

    // 4. Absensi listener
    const absensiQuery = isAdmin
      ? collection(db, 'absensi')
      : query(collection(db, 'absensi'), where('authorizedEmails', 'array-contains', cleanEmail));

    unsubs.push(
      onSnapshot(
        absensiQuery,
        snap => {
          const list: AbsensiRecord[] = snap.docs
            .map(d => {
              const data = d.data();
              return {
                id: String(data.id || d.id),
                nisn: String(data.nisn || ''),
                tanggal: String(data.tanggal || ''),
                sesi: (data.sesi === 'tahfidz' ? 'tahfidz' : 'btq') as 'btq' | 'tahfidz',
                status: (data.status || 'Hadir') as AbsensiRecord['status'],
                keterangan: data.keterangan ? String(data.keterangan) : undefined
              };
            })
            .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
          callbacks.onAbsensi(list);
        },
        err => reportErr(err, OperationType.LIST, 'absensi')
      )
    );

    // 5. Staff Directory (Teachers + Wali Kelas)
    const dirQuery = isAdmin
      ? collection(db, 'staffDirectory')
      : query(collection(db, 'staffDirectory'), where('email', '==', cleanEmail));

    unsubs.push(
      onSnapshot(
        dirQuery,
        snap => {
          const entries: StaffDirectoryEntry[] = snap.docs.map(d => {
            const data = d.data();
            return {
              id: String(data.id || d.id),
              nama: String(data.nama || ''),
              role: (data.role as Role) || 'guru_ngaji',
              kelompokBTQ: String(data.kelompokBTQ || '-'),
              kelompokTahfidz: data.kelompokTahfidz ? String(data.kelompokTahfidz) : undefined,
              assignedClass: data.assignedClass ? String(data.assignedClass) : undefined,
              ruangan: String(data.ruangan || '-'),
              kontak: data.kontak ? String(data.kontak) : undefined,
              email: data.email ? normalizeEmail(String(data.email)) : undefined
            };
          });

          if (isAdmin) {
            _cachedStaffDirectory = entries;
          }

          const teachers: Teacher[] = entries
            .filter(e => e.role === 'guru_ngaji' || e.role === 'guru_tahfidz')
            .map(e => ({
              id: e.id,
              nama: e.nama,
              role: e.role as 'guru_ngaji' | 'guru_tahfidz',
              kelompokBTQ: e.kelompokBTQ,
              kelompokTahfidz: e.kelompokTahfidz,
              ruangan: e.ruangan,
              kontak: e.kontak,
              email: e.email
            }))
            .sort((a, b) => {
              if (a.role !== b.role) return a.role.localeCompare(b.role);
              return a.nama.localeCompare(b.nama);
            });

          callbacks.onTeachers(teachers);
          callbacks.onStaffDirectory?.(entries);
        },
        err => reportErr(err, OperationType.LIST, 'staffDirectory')
      )
    );

    // 6. Admin-only real-time listeners (requests, invites, staffUsers, admins, rapor)
    if (isAdmin) {
      unsubs.push(
        onSnapshot(
          collection(db, 'admins'),
          snap => {
            const set = new Set<string>([BOOTSTRAP_ADMIN_EMAIL]);
            snap.docs.forEach(d => {
              const em = normalizeEmail(d.data()?.email);
              if (em) set.add(em);
            });
            _cachedAdminEmails = set;
          },
          () => {
            // Non-bootstrap admins may not be allowed to list admins collection depending on rules
          }
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'staffUsers'),
          snap => {
            _cachedStaffUsers = snap.docs.map(d => {
              const data = d.data();
              return {
                uid: String(data.uid || d.id),
                email: normalizeEmail(data.email),
                nama: String(data.nama || ''),
                role: (data.role as Role) || 'guru_ngaji',
                teacherId: data.teacherId ? String(data.teacherId) : undefined,
                assignedGroup: data.assignedGroup ? String(data.assignedGroup) : undefined,
                assignedTahfidzGroup: data.assignedTahfidzGroup
                  ? String(data.assignedTahfidzGroup)
                  : undefined,
                assignedClass: data.assignedClass ? String(data.assignedClass) : undefined,
                isActive: data.isActive !== false
              };
            });
          },
          err => reportErr(err, OperationType.LIST, 'staffUsers')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'staffInvites'),
          snap => {
            const list: StaffInvite[] = snap.docs.map(d => {
              const data = d.data();
              return {
                id: String(data.id || d.id),
                email: normalizeEmail(data.email),
                nama: String(data.nama || ''),
                role: (data.role as Role) || 'guru_ngaji',
                teacherId: data.teacherId ? String(data.teacherId) : undefined,
                assignedGroup: data.assignedGroup ? String(data.assignedGroup) : undefined,
                assignedTahfidzGroup: data.assignedTahfidzGroup
                  ? String(data.assignedTahfidzGroup)
                  : undefined,
                assignedClass: data.assignedClass ? String(data.assignedClass) : undefined
              };
            });
            _cachedInvites = list;
            callbacks.onStaffInvites?.(list);
          },
          err => reportErr(err, OperationType.LIST, 'staffInvites')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'accessRequests'),
          snap => {
            const list: AccessRequest[] = snap.docs.map(d => {
              const data = d.data();
              return {
                uid: String(data.uid || d.id),
                email: normalizeEmail(data.email),
                nama: String(data.nama || ''),
                requestedRole: (data.requestedRole as Role) || 'guru_ngaji',
                requestedNote: String(data.requestedNote || ''),
                status: (data.status as AccessRequest['status']) || 'pending',
                createdAt: mapTimestampToIso(data.createdAt),
                updatedAt: mapTimestampToIso(data.updatedAt)
              };
            });
            callbacks.onAccessRequests?.(list);
          },
          err => reportErr(err, OperationType.LIST, 'accessRequests')
        )
      );

      unsubs.push(
        onSnapshot(
          doc(db, 'raporConfig', 'main'),
          snap => {
            if (!snap.exists()) return;
            const d = snap.data();
            callbacks.onRaporSettings?.({
              tahunAjaran: String(d.tahunAjaran || '2026/2027'),
              semester: String(d.semester || 'Ganjil'),
              tanggalRapor: String(d.tanggalRapor || ''),
              kepalaSekolah: String(d.kepalaSekolah || ''),
              nbmKepala: String(d.nbmKepala || ''),
              koordinator: String(d.koordinator || '')
            });
          },
          err => reportErr(err, OperationType.GET, 'raporConfig/main')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'raporStatuses'),
          snap => {
            const map: Record<string, RaporPrintStatus> = {};
            snap.docs.forEach(d => {
              const data = d.data();
              const nisn = String(data.nisn || d.id);
              map[nisn] = {
                nisn,
                printCount: Number(data.printCount || 0),
                lastPrintedAt: String(data.lastPrintedAt || ''),
                lastPrintedBy: String(data.lastPrintedBy || ''),
                semester: String(data.semester || ''),
                tahunAjaran: String(data.tahunAjaran || '')
              };
            });
            callbacks.onRaporStatuses?.(map);
          },
          err => reportErr(err, OperationType.LIST, 'raporStatuses')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'raporLogs'),
          snap => {
            const logs: RaporPrintBatchLog[] = snap.docs
              .map(d => {
                const data = d.data();
                return {
                  id: String(data.id || d.id),
                  printedAt: String(data.printedAt || ''),
                  printedBy: String(data.printedBy || ''),
                  kelasLabel: String(data.kelasLabel || ''),
                  jenisCetak: (data.jenisCetak || 'Rapor Siswa (Massal)') as RaporPrintBatchLog['jenisCetak'],
                  totalRapor: Number(data.totalRapor || 0),
                  semester: String(data.semester || ''),
                  tahunAjaran: String(data.tahunAjaran || ''),
                  nisnList: Array.isArray(data.nisnList) ? (data.nisnList as string[]) : []
                };
              })
              .sort((a, b) => b.printedAt.localeCompare(a.printedAt));
            callbacks.onRaporLogs?.(logs);
          },
          err => reportErr(err, OperationType.LIST, 'raporLogs')
        )
      );
    }

    return () => {
      unsubs.forEach(fn => {
        try {
          fn();
        } catch {
          // ignore
        }
      });
    };
  },

  /**
   * Public NISN or Student Name lookup for parents on any browser/device without requiring login.
   */
  async searchPublicStudents(rawQuery: string): Promise<PublicStudentReport[]> {
    if (isSupabaseConfigured) {
      return supabaseDb.searchPublicStudents(rawQuery);
    }
    const cleaned = rawQuery.trim();
    if (/^[a-zA-Z0-9_-]{4,40}$/.test(cleaned)) {
      const single = await this.getPublicReportByNisn(cleaned);
      return single ? [single] : [];
    }
    return [];
  },

  /**
   * Public NISN lookup for parents on any browser/device without requiring login.
   */
  async getPublicReportByNisn(nisn: string): Promise<PublicStudentReport | null> {
    if (isSupabaseConfigured) {
      return supabaseDb.getPublicReportByNisn(nisn);
    }
    const safeNisn = toSafeDocId(nisn, 'std');
    try {
      const snap = await getDoc(doc(db, 'publicReports', safeNisn));
      if (!snap.exists()) return null;
      const d = snap.data();
      const student: Student = {
        id: safeNisn,
        nisn: safeNisn,
        nama: String(d.nama || ''),
        gender: d.gender === 'L' ? 'L' : 'P',
        kelas: String(d.kelas || '-'),
        kelasBTQ: String(d.kelasBTQ || '-'),
        pengajar: String(d.pengajar || '-'),
        ruangan: String(d.ruangan || '-'),
        waliKelas: String(d.waliKelas || '-'),
        isTahfidz: Boolean(d.isTahfidz),
        pembimbingTahfidz: d.pembimbingTahfidz ? String(d.pembimbingTahfidz) : undefined,
        halaqahTahfidz: d.halaqahTahfidz ? String(d.halaqahTahfidz) : undefined,
        targetJuz: d.targetJuz ? String(d.targetJuz) : undefined,
        totalHafalan: d.totalHafalan ? String(d.totalHafalan) : undefined,
        hafalanTerakhir: d.hafalanTerakhir ? String(d.hafalanTerakhir) : undefined,
        capaianTerakhir: d.capaianTerakhir || {
          tingkat: '-',
          halamanAyat: '-',
          tanggal: new Date().toISOString().slice(0, 10),
          nilai: 'A'
        },
        ujian: d.ujian || {
          nilai: 80,
          predikat: 'JAYYID',
          natijah: '-'
        },
        kehadiranPersen: typeof d.kehadiranPersen === 'number' ? d.kehadiranPersen : 100
      };

      const recentBacaan: BacaanRecord[] = Array.isArray(d.recentBacaan)
        ? d.recentBacaan.map((b: Record<string, unknown>) => ({
            id: String(b.id || ''),
            nisn: String(b.nisn || safeNisn),
            tanggal: String(b.tanggal || ''),
            tipe: (b.tipe === "Al-Qur'an" ? "Al-Qur'an" : 'Tilawati Remaja') as BacaanRecord['tipe'],
            jilid: String(b.jilid || ''),
            halaman: String(b.halaman || ''),
            nilai: (['A', 'B', 'C'].includes(String(b.nilai)) ? b.nilai : 'A') as 'A' | 'B' | 'C',
            catatan: b.catatan ? String(b.catatan) : undefined,
            pengajar: String(b.pengajar || '')
          }))
        : [];

      const recentTahfidz: TahfidzRecord[] = Array.isArray(d.recentTahfidz)
        ? d.recentTahfidz.map((t: Record<string, unknown>) => ({
            id: String(t.id || ''),
            nisn: String(t.nisn || safeNisn),
            tanggal: String(t.tanggal || ''),
            surat: String(t.surat || ''),
            ayat: String(t.ayat || ''),
            status: (t.status || 'Ziyadah') as TahfidzRecord['status'],
            kelancaran: (t.kelancaran || 'Sangat Lancar (Mumtaz)') as TahfidzRecord['kelancaran'],
            guru: String(t.guru || ''),
            catatan: t.catatan ? String(t.catatan) : undefined
          }))
        : [];

      return {
        student,
        recentBacaan,
        recentTahfidz,
        absensiSummary: d.absensiSummary as PublicStudentReport['absensiSummary']
      };
    } catch {
      return null;
    }
  },

  async upsertStudentCloud(
    student: Student,
    bacaanList: BacaanRecord[] = [],
    tahfidzList: TahfidzRecord[] = [],
    absensiList: AbsensiRecord[] = []
  ): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.upsertStudent(student);
      return;
    }
    if (!this.isCloudAuthenticated()) return;
    const safeNisn = toSafeDocId(student.nisn, 'std');
    const studentRef = doc(db, 'students', safeNisn);
    const pubRef = doc(db, 'publicReports', safeNisn);

    try {
      const existing = await getDoc(studentRef);
      const access = existing.exists() && auth.currentUser?.email && normalizeEmail(auth.currentUser.email) !== BOOTSTRAP_ADMIN_EMAIL && !_cachedAdminEmails.has(normalizeEmail(auth.currentUser.email))
        ? {
            authorizedEmails: Array.isArray(existing.data().authorizedEmails)
              ? (existing.data().authorizedEmails as string[])
              : getAdminEmailsList(),
            editorEmails: Array.isArray(existing.data().editorEmails)
              ? (existing.data().editorEmails as string[])
              : getAdminEmailsList()
          }
        : computeStudentAccessLists(student);

      const payload = buildStudentDocPayload(
        student,
        access,
        existing.exists(),
        existing.exists() ? existing.data().createdAt : undefined
      );
      await setDoc(studentRef, payload);
      _cachedStudentAccessByNisn.set(safeNisn, access);

      const pubPayload = buildPublicReportPayload(
        student,
        bacaanList.filter(b => b.nisn === student.nisn),
        tahfidzList.filter(t => t.nisn === student.nisn),
        absensiList.filter(a => a.nisn === student.nisn)
      );
      await setDoc(pubRef, pubPayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `students/${safeNisn}`);
    }
  },

  async upsertTeacherCloud(teacher: Teacher): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.upsertTeacher(teacher);
      return;
    }
    if (!this.isCloudAuthenticated()) return;
    const safeId = toSafeDocId(teacher.id, 'tch');
    const dirRef = doc(db, 'staffDirectory', safeId);
    const adminEmails = getAdminEmailsList();
    const cleanEmail = teacher.email ? normalizeEmail(teacher.email) : undefined;

    try {
      const existing = await getDoc(dirRef);
      const payload = stripUndefined({
        id: safeId,
        nama: clampStr(teacher.nama.toUpperCase(), 120, 'GURU'),
        role: teacher.role,
        kelompokBTQ: clampStr(teacher.kelompokBTQ, 200, '-'),
        kelompokTahfidz: teacher.kelompokTahfidz
          ? clampStr(teacher.kelompokTahfidz, 200)
          : undefined,
        ruangan: clampStr(teacher.ruangan, 100, '-'),
        kontak: teacher.kontak ? clampStr(teacher.kontak, 40) : undefined,
        email: cleanEmail ? clampStr(cleanEmail, 150) : undefined,
        adminEmails,
        createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await setDoc(dirRef, payload);

      if (cleanEmail) {
        const inviteId = toSafeDocId(`inv_${cleanEmail}`, 'inv');
        const invRef = doc(db, 'staffInvites', inviteId);
        const existingInv = await getDoc(invRef);
        await setDoc(
          invRef,
          stripUndefined({
            id: inviteId,
            email: clampStr(cleanEmail, 150),
            nama: clampStr(teacher.nama.toUpperCase(), 120, 'GURU'),
            role: teacher.role,
            teacherId: safeId,
            assignedGroup: teacher.role === 'guru_ngaji' ? clampStr(teacher.kelompokBTQ, 200) : undefined,
            assignedTahfidzGroup:
              teacher.role === 'guru_tahfidz'
                ? clampStr(teacher.kelompokTahfidz || teacher.kelompokBTQ, 200)
                : undefined,
            adminEmails,
            createdAt: existingInv.exists() ? existingInv.data().createdAt : serverTimestamp(),
            updatedAt: serverTimestamp()
          })
        );
      }

      await this.resyncAllCloudAccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `staffDirectory/${safeId}`);
    }
  },

  async deleteTeacherCloud(teacherId: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.deleteTeacher(teacherId);
      return;
    }
    if (!this.isCloudAuthenticated()) return;
    const safeId = toSafeDocId(teacherId, 'tch');
    try {
      await deleteDoc(doc(db, 'staffDirectory', safeId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `staffDirectory/${safeId}`);
    }
  },

  async saveBacaanCloud(
    record: BacaanRecord,
    student?: Student,
    allBacaanForStudent: BacaanRecord[] = [],
    allTahfidzForStudent: TahfidzRecord[] = [],
    allAbsensiForStudent: AbsensiRecord[] = []
  ): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.saveBacaan(record, student);
      return;
    }
    if (!this.isCloudAuthenticated() || !auth.currentUser) return;
    const safeId = toSafeDocId(record.id, 'b');
    const safeNisn = toSafeDocId(record.nisn, 'std');
    const uid = toSafeDocId(auth.currentUser.uid, 'uid');
    const access = await getStudentAccessForWrite(safeNisn);
    const ref = doc(db, 'bacaan', safeId);

    try {
      const existing = await getDoc(ref);
      const payload = stripUndefined({
        id: safeId,
        nisn: safeNisn,
        tanggal: clampStr(record.tanggal, 30),
        tipe: record.tipe,
        jilid: clampStr(record.jilid, 100),
        halaman: clampStr(record.halaman, 100),
        nilai: record.nilai,
        catatan: record.catatan ? clampStr(record.catatan, 300) : undefined,
        pengajar: clampStr(record.pengajar, 120, 'Guru'),
        authorUid: uid,
        authorizedEmails: existing.exists()
          ? existing.data().authorizedEmails
          : access.authorizedEmails,
        editorEmails: existing.exists() ? existing.data().editorEmails : access.editorEmails,
        createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await setDoc(ref, payload);

      if (student) {
        const sRef = doc(db, 'students', safeNisn);
        await updateDoc(sRef, {
          capaianTerakhir: {
            tingkat: clampStr(`${record.tipe} ${record.jilid}`.trim(), 120),
            halamanAyat: clampStr(record.halaman, 120),
            tanggal: clampStr(record.tanggal, 30),
            nilai: record.nilai
          },
          updatedAt: serverTimestamp()
        });
        await setDoc(
          doc(db, 'publicReports', safeNisn),
          buildPublicReportPayload(
            student,
            allBacaanForStudent.length > 0 ? allBacaanForStudent : [record],
            allTahfidzForStudent,
            allAbsensiForStudent
          )
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `bacaan/${safeId}`);
    }
  },

  async saveTahfidzCloud(
    record: TahfidzRecord,
    student?: Student,
    allBacaanForStudent: BacaanRecord[] = [],
    allTahfidzForStudent: TahfidzRecord[] = [],
    allAbsensiForStudent: AbsensiRecord[] = []
  ): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.saveTahfidz(record, student);
      return;
    }
    if (!this.isCloudAuthenticated() || !auth.currentUser) return;
    const safeId = toSafeDocId(record.id, 't');
    const safeNisn = toSafeDocId(record.nisn, 'std');
    const uid = toSafeDocId(auth.currentUser.uid, 'uid');
    const access = await getStudentAccessForWrite(safeNisn);
    const ref = doc(db, 'tahfidz', safeId);

    try {
      const existing = await getDoc(ref);
      const payload = stripUndefined({
        id: safeId,
        nisn: safeNisn,
        tanggal: clampStr(record.tanggal, 30),
        surat: clampStr(record.surat, 120),
        ayat: clampStr(record.ayat, 100),
        status: record.status,
        kelancaran: record.kelancaran,
        guru: clampStr(record.guru, 120, 'Guru Tahfidz'),
        catatan: record.catatan ? clampStr(record.catatan, 300) : undefined,
        authorUid: uid,
        authorizedEmails: existing.exists()
          ? existing.data().authorizedEmails
          : access.authorizedEmails,
        editorEmails: existing.exists() ? existing.data().editorEmails : access.editorEmails,
        createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      await setDoc(ref, payload);

      if (student) {
        const sRef = doc(db, 'students', safeNisn);
        await updateDoc(sRef, {
          hafalanTerakhir: clampStr(`${record.surat}: ${record.ayat}`, 150),
          updatedAt: serverTimestamp()
        });
        await setDoc(
          doc(db, 'publicReports', safeNisn),
          buildPublicReportPayload(
            student,
            allBacaanForStudent,
            allTahfidzForStudent.length > 0 ? allTahfidzForStudent : [record],
            allAbsensiForStudent
          )
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `tahfidz/${safeId}`);
    }
  },

  async saveUjianCloud(
    student: Student,
    allBacaanForStudent: BacaanRecord[] = [],
    allTahfidzForStudent: TahfidzRecord[] = [],
    allAbsensiForStudent: AbsensiRecord[] = []
  ): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.saveUjian(student);
      return;
    }
    if (!this.isCloudAuthenticated()) return;
    const safeNisn = toSafeDocId(student.nisn, 'std');
    try {
      await updateDoc(doc(db, 'students', safeNisn), {
        ujian: stripUndefined({
          tanggal: student.ujian.tanggal ? clampStr(student.ujian.tanggal, 30) : undefined,
          jenis: student.ujian.jenis ? clampStr(student.ujian.jenis, 120) : undefined,
          nilai: Math.min(100, Math.max(0, Number(student.ujian.nilai ?? 80))),
          predikat: student.ujian.predikat,
          natijah: clampStr(student.ujian.natijah, 120, '-'),
          kelulusan: student.ujian.kelulusan
            ? clampStr(student.ujian.kelulusan, 120)
            : undefined,
          keterangan: student.ujian.keterangan
            ? clampStr(student.ujian.keterangan, 300)
            : undefined
        }),
        updatedAt: serverTimestamp()
      });

      await setDoc(
        doc(db, 'publicReports', safeNisn),
        buildPublicReportPayload(
          student,
          allBacaanForStudent,
          allTahfidzForStudent,
          allAbsensiForStudent
        )
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `students/${safeNisn}`);
    }
  },

  async saveAbsensiBatchCloud(params: {
    records: AbsensiRecord[];
    updatedStudents: Student[];
    allBacaan: BacaanRecord[];
    allTahfidz: TahfidzRecord[];
    allAbsensi: AbsensiRecord[];
  }): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.saveAbsensiBatch(params.records, params.updatedStudents);
      return;
    }
    if (!this.isCloudAuthenticated() || !auth.currentUser) return;
    const uid = toSafeDocId(auth.currentUser.uid, 'uid');
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

    try {
      for (const rec of params.records) {
        const safeId = toSafeDocId(rec.id, 'abs');
        const safeNisn = toSafeDocId(rec.nisn, 'std');
        const access = await getStudentAccessForWrite(safeNisn);
        const absRef = doc(db, 'absensi', safeId);
        const existing = await getDoc(absRef);

        ops.push(batch => {
          batch.set(
            absRef,
            stripUndefined({
              id: safeId,
              nisn: safeNisn,
              tanggal: clampStr(rec.tanggal, 30),
              sesi: rec.sesi,
              status: rec.status,
              keterangan: rec.keterangan ? clampStr(rec.keterangan, 200) : undefined,
              authorUid: uid,
              authorizedEmails: existing.exists()
                ? existing.data().authorizedEmails
                : access.authorizedEmails,
              editorEmails: existing.exists()
                ? existing.data().editorEmails
                : access.editorEmails,
              createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
              updatedAt: serverTimestamp()
            })
          );
        });
      }

      for (const st of params.updatedStudents) {
        const safeNisn = toSafeDocId(st.nisn, 'std');
        ops.push(batch => {
          batch.update(doc(db, 'students', safeNisn), {
            kehadiranPersen: Math.min(100, Math.max(0, Math.round(st.kehadiranPersen ?? 100))),
            updatedAt: serverTimestamp()
          });
          batch.set(
            doc(db, 'publicReports', safeNisn),
            buildPublicReportPayload(
              st,
              params.allBacaan.filter(b => b.nisn === st.nisn),
              params.allTahfidz.filter(t => t.nisn === st.nisn),
              params.allAbsensi.filter(a => a.nisn === st.nisn)
            )
          );
        });
      }

      await commitBatchedWrites(ops);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'absensi/batch');
    }
  },

  async deleteAbsensiCloud(
    nisn: string,
    sesi: 'btq' | 'tahfidz',
    tanggal: string,
    updatedStudent?: Student,
    allBacaan: BacaanRecord[] = [],
    allTahfidz: TahfidzRecord[] = [],
    allAbsensi: AbsensiRecord[] = []
  ): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.deleteAbsensi(nisn, sesi, tanggal, updatedStudent);
      return;
    }
    if (!this.isCloudAuthenticated()) return;
    const safeId = toSafeDocId(`${nisn}_${tanggal}_${sesi}`, 'abs');
    const safeNisn = toSafeDocId(nisn, 'std');
    try {
      await deleteDoc(doc(db, 'absensi', safeId));
      if (updatedStudent) {
        await updateDoc(doc(db, 'students', safeNisn), {
          kehadiranPersen: Math.min(
            100,
            Math.max(0, Math.round(updatedStudent.kehadiranPersen ?? 100))
          ),
          updatedAt: serverTimestamp()
        });
        await setDoc(
          doc(db, 'publicReports', safeNisn),
          buildPublicReportPayload(
            updatedStudent,
            allBacaan.filter(b => b.nisn === updatedStudent.nisn),
            allTahfidz.filter(t => t.nisn === updatedStudent.nisn),
            allAbsensi.filter(a => a.nisn === updatedStudent.nisn)
          )
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `absensi/${safeId}`);
    }
  },

  async saveBatchBacaanEvaluationsCloud(params: {
    bacaanRecords: BacaanRecord[];
    absensiRecords: AbsensiRecord[];
    updatedStudents: Student[];
    allBacaan: BacaanRecord[];
    allTahfidz: TahfidzRecord[];
    allAbsensi: AbsensiRecord[];
  }): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.saveBatchBacaanEvaluations({
        bacaanRecords: params.bacaanRecords,
        absensiRecords: params.absensiRecords,
        updatedStudents: params.updatedStudents
      });
      return;
    }
    if (!this.isCloudAuthenticated() || !auth.currentUser) return;
    const uid = toSafeDocId(auth.currentUser.uid, 'uid');
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

    try {
      for (const b of params.bacaanRecords) {
        const safeId = toSafeDocId(b.id, 'b');
        const safeNisn = toSafeDocId(b.nisn, 'std');
        const access = await getStudentAccessForWrite(safeNisn);
        const ref = doc(db, 'bacaan', safeId);
        const existing = await getDoc(ref);

        ops.push(batch => {
          batch.set(
            ref,
            stripUndefined({
              id: safeId,
              nisn: safeNisn,
              tanggal: clampStr(b.tanggal, 30),
              tipe: b.tipe,
              jilid: clampStr(b.jilid, 100),
              halaman: clampStr(b.halaman, 100),
              nilai: b.nilai,
              catatan: b.catatan ? clampStr(b.catatan, 300) : undefined,
              pengajar: clampStr(b.pengajar, 120, 'Guru'),
              authorUid: uid,
              authorizedEmails: existing.exists()
                ? existing.data().authorizedEmails
                : access.authorizedEmails,
              editorEmails: existing.exists()
                ? existing.data().editorEmails
                : access.editorEmails,
              createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
              updatedAt: serverTimestamp()
            })
          );
        });
      }

      for (const a of params.absensiRecords) {
        const safeId = toSafeDocId(a.id, 'abs');
        const safeNisn = toSafeDocId(a.nisn, 'std');
        const access = await getStudentAccessForWrite(safeNisn);
        const ref = doc(db, 'absensi', safeId);
        const existing = await getDoc(ref);

        ops.push(batch => {
          batch.set(
            ref,
            stripUndefined({
              id: safeId,
              nisn: safeNisn,
              tanggal: clampStr(a.tanggal, 30),
              sesi: a.sesi,
              status: a.status,
              keterangan: a.keterangan ? clampStr(a.keterangan, 200) : undefined,
              authorUid: uid,
              authorizedEmails: existing.exists()
                ? existing.data().authorizedEmails
                : access.authorizedEmails,
              editorEmails: existing.exists()
                ? existing.data().editorEmails
                : access.editorEmails,
              createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
              updatedAt: serverTimestamp()
            })
          );
        });
      }

      for (const st of params.updatedStudents) {
        const safeNisn = toSafeDocId(st.nisn, 'std');
        ops.push(batch => {
          batch.update(doc(db, 'students', safeNisn), {
            capaianTerakhir: {
              tingkat: clampStr(st.capaianTerakhir.tingkat, 120),
              halamanAyat: clampStr(st.capaianTerakhir.halamanAyat, 120),
              tanggal: clampStr(st.capaianTerakhir.tanggal, 30),
              nilai: st.capaianTerakhir.nilai
            },
            kehadiranPersen: Math.min(100, Math.max(0, Math.round(st.kehadiranPersen ?? 100))),
            updatedAt: serverTimestamp()
          });
          batch.set(
            doc(db, 'publicReports', safeNisn),
            buildPublicReportPayload(
              st,
              params.allBacaan.filter(x => x.nisn === st.nisn),
              params.allTahfidz.filter(x => x.nisn === st.nisn),
              params.allAbsensi.filter(x => x.nisn === st.nisn)
            )
          );
        });
      }

      await commitBatchedWrites(ops);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bacaan/batch');
    }
  },

  async deleteStudentCloud(nisn: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.deleteStudent(nisn);
      return;
    }
    if (!this.isCloudAuthenticated()) return;
    const safeNisn = toSafeDocId(nisn, 'std');
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [
      batch => batch.delete(doc(db, 'students', safeNisn)),
      batch => batch.delete(doc(db, 'publicReports', safeNisn)),
      batch => batch.delete(doc(db, 'raporStatuses', safeNisn))
    ];

    try {
      const [bSnap, tSnap, aSnap] = await Promise.all([
        getDocs(query(collection(db, 'bacaan'), where('nisn', '==', safeNisn))),
        getDocs(query(collection(db, 'tahfidz'), where('nisn', '==', safeNisn))),
        getDocs(query(collection(db, 'absensi'), where('nisn', '==', safeNisn)))
      ]);
      bSnap.forEach(d => ops.push(batch => batch.delete(d.ref)));
      tSnap.forEach(d => ops.push(batch => batch.delete(d.ref)));
      aSnap.forEach(d => ops.push(batch => batch.delete(d.ref)));

      await commitBatchedWrites(ops);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `students/${safeNisn}`);
    }
  },

  async clearAllCloudData(): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.clearAllData();
      return;
    }
    if (!this.isCloudAuthenticated()) return;
    try {
      const colNames = [
        'students',
        'bacaan',
        'tahfidz',
        'absensi',
        'staffDirectory',
        'raporStatuses',
        'raporLogs'
      ] as const;

      const snaps = await Promise.all(colNames.map(c => getDocs(collection(db, c))));
      const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
      snaps.forEach((snap, idx) => {
        snap.docs.forEach(d => {
          ops.push(batch => batch.delete(d.ref));
          if (colNames[idx] === 'students') {
            ops.push(batch => batch.delete(doc(db, 'publicReports', d.id)));
          }
        });
      });

      await commitBatchedWrites(ops);
      _cachedStudentAccessByNisn.clear();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'clearAll');
    }
  },

  async pushAllLocalToCloud(params: {
    students: Student[];
    teachers: Teacher[];
    bacaan: BacaanRecord[];
    tahfidz: TahfidzRecord[];
    absensi: AbsensiRecord[];
    raporSettings?: RaporSettings;
  }): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.pushAllLocalToCloud(params);
      return;
    }
    if (!this.isCloudAuthenticated() || !auth.currentUser) return;
    const uid = toSafeDocId(auth.currentUser.uid, 'uid');
    const adminEmails = getAdminEmailsList();
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

    try {
      // 1. Teachers & Staff Invites
      for (const t of params.teachers) {
        const safeId = toSafeDocId(t.id, 'tch');
        const cleanEmail = t.email ? normalizeEmail(t.email) : undefined;
        ops.push(batch => {
          batch.set(
            doc(db, 'staffDirectory', safeId),
            stripUndefined({
              id: safeId,
              nama: clampStr(t.nama.toUpperCase(), 120, 'GURU'),
              role: t.role,
              kelompokBTQ: clampStr(t.kelompokBTQ, 200, '-'),
              kelompokTahfidz: t.kelompokTahfidz ? clampStr(t.kelompokTahfidz, 200) : undefined,
              ruangan: clampStr(t.ruangan, 100, '-'),
              kontak: t.kontak ? clampStr(t.kontak, 40) : undefined,
              email: cleanEmail ? clampStr(cleanEmail, 150) : undefined,
              adminEmails,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            })
          );
        });

        if (cleanEmail) {
          const inviteId = toSafeDocId(`inv_${cleanEmail}`, 'inv');
          ops.push(batch => {
            batch.set(
              doc(db, 'staffInvites', inviteId),
              stripUndefined({
                id: inviteId,
                email: clampStr(cleanEmail, 150),
                nama: clampStr(t.nama.toUpperCase(), 120, 'GURU'),
                role: t.role,
                teacherId: safeId,
                assignedGroup: t.role === 'guru_ngaji' ? clampStr(t.kelompokBTQ, 200) : undefined,
                assignedTahfidzGroup:
                  t.role === 'guru_tahfidz'
                    ? clampStr(t.kelompokTahfidz || t.kelompokBTQ, 200)
                    : undefined,
                adminEmails,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
              })
            );
          });
        }
      }

      // 2. Students + Public Reports
      const studentAccessMap = new Map<
        string,
        { authorizedEmails: string[]; editorEmails: string[] }
      >();

      for (const s of params.students) {
        const safeNisn = toSafeDocId(s.nisn, 'std');
        const access = computeStudentAccessLists(s);
        studentAccessMap.set(safeNisn, access);
        _cachedStudentAccessByNisn.set(safeNisn, access);

        ops.push(batch => {
          batch.set(doc(db, 'students', safeNisn), buildStudentDocPayload(s, access, false));
          batch.set(
            doc(db, 'publicReports', safeNisn),
            buildPublicReportPayload(
              s,
              params.bacaan.filter(b => b.nisn === s.nisn),
              params.tahfidz.filter(t => t.nisn === s.nisn),
              params.absensi.filter(a => a.nisn === s.nisn)
            )
          );
        });
      }

      // 3. Bacaan
      for (const b of params.bacaan) {
        const safeId = toSafeDocId(b.id, 'b');
        const safeNisn = toSafeDocId(b.nisn, 'std');
        if (!studentAccessMap.has(safeNisn)) continue;
        const access = studentAccessMap.get(safeNisn)!;
        ops.push(batch => {
          batch.set(
            doc(db, 'bacaan', safeId),
            stripUndefined({
              id: safeId,
              nisn: safeNisn,
              tanggal: clampStr(b.tanggal, 30),
              tipe: b.tipe,
              jilid: clampStr(b.jilid, 100),
              halaman: clampStr(b.halaman, 100),
              nilai: b.nilai,
              catatan: b.catatan ? clampStr(b.catatan, 300) : undefined,
              pengajar: clampStr(b.pengajar, 120, 'Guru'),
              authorUid: uid,
              authorizedEmails: access.authorizedEmails,
              editorEmails: access.editorEmails,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            })
          );
        });
      }

      // 4. Tahfidz
      for (const t of params.tahfidz) {
        const safeId = toSafeDocId(t.id, 't');
        const safeNisn = toSafeDocId(t.nisn, 'std');
        if (!studentAccessMap.has(safeNisn)) continue;
        const access = studentAccessMap.get(safeNisn)!;
        ops.push(batch => {
          batch.set(
            doc(db, 'tahfidz', safeId),
            stripUndefined({
              id: safeId,
              nisn: safeNisn,
              tanggal: clampStr(t.tanggal, 30),
              surat: clampStr(t.surat, 120),
              ayat: clampStr(t.ayat, 100),
              status: t.status,
              kelancaran: t.kelancaran,
              guru: clampStr(t.guru, 120, 'Guru Tahfidz'),
              catatan: t.catatan ? clampStr(t.catatan, 300) : undefined,
              authorUid: uid,
              authorizedEmails: access.authorizedEmails,
              editorEmails: access.editorEmails,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            })
          );
        });
      }

      // 5. Absensi
      for (const a of params.absensi) {
        const safeId = toSafeDocId(a.id, 'abs');
        const safeNisn = toSafeDocId(a.nisn, 'std');
        if (!studentAccessMap.has(safeNisn)) continue;
        const access = studentAccessMap.get(safeNisn)!;
        ops.push(batch => {
          batch.set(
            doc(db, 'absensi', safeId),
            stripUndefined({
              id: safeId,
              nisn: safeNisn,
              tanggal: clampStr(a.tanggal, 30),
              sesi: a.sesi,
              status: a.status,
              keterangan: a.keterangan ? clampStr(a.keterangan, 200) : undefined,
              authorUid: uid,
              authorizedEmails: access.authorizedEmails,
              editorEmails: access.editorEmails,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            })
          );
        });
      }

      // 6. Rapor Settings
      if (params.raporSettings) {
        ops.push(batch => {
          batch.set(doc(db, 'raporConfig', 'main'), {
            tahunAjaran: clampStr(params.raporSettings!.tahunAjaran, 40),
            semester: clampStr(params.raporSettings!.semester, 30),
            tanggalRapor: clampStr(params.raporSettings!.tanggalRapor, 60),
            kepalaSekolah: clampStr(params.raporSettings!.kepalaSekolah, 120),
            nbmKepala: clampStr(params.raporSettings!.nbmKepala, 60),
            koordinator: clampStr(params.raporSettings!.koordinator, 120),
            adminEmails,
            updatedAt: serverTimestamp()
          });
        });
      }

      await commitBatchedWrites(ops);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'pushAllLocalToCloud');
    }
  },

  /**
   * Recomputes authorizedEmails, editorEmails, and adminEmails across all Cloud collections
   * so newly approved / invited Google accounts synchronize immediately.
   */
  async resyncAllCloudAccess(): Promise<void> {
    if (isSupabaseConfigured) return;
    if (!this.isCloudAuthenticated()) return;

    try {
      const [
        adminsSnap,
        staffSnap,
        invitesSnap,
        dirSnap,
        reqSnap,
        studentsSnap,
        bacaanSnap,
        tahfidzSnap,
        absensiSnap,
        raporCfgSnap,
        raporStSnap,
        raporLogSnap
      ] = await Promise.all([
        getDocs(collection(db, 'admins')).catch(() => null),
        getDocs(collection(db, 'staffUsers')).catch(() => null),
        getDocs(collection(db, 'staffInvites')).catch(() => null),
        getDocs(collection(db, 'staffDirectory')).catch(() => null),
        getDocs(collection(db, 'accessRequests')).catch(() => null),
        getDocs(collection(db, 'students')).catch(() => null),
        getDocs(collection(db, 'bacaan')).catch(() => null),
        getDocs(collection(db, 'tahfidz')).catch(() => null),
        getDocs(collection(db, 'absensi')).catch(() => null),
        getDoc(doc(db, 'raporConfig', 'main')).catch(() => null),
        getDocs(collection(db, 'raporStatuses')).catch(() => null),
        getDocs(collection(db, 'raporLogs')).catch(() => null)
      ]);

      if (adminsSnap) {
        const set = new Set<string>([BOOTSTRAP_ADMIN_EMAIL]);
        adminsSnap.docs.forEach(d => {
          const em = normalizeEmail(d.data().email);
          if (em) set.add(em);
        });
        _cachedAdminEmails = set;
      }

      if (staffSnap) {
        _cachedStaffUsers = staffSnap.docs.map(d => {
          const data = d.data();
          return {
            uid: String(data.uid || d.id),
            email: normalizeEmail(data.email),
            nama: String(data.nama || ''),
            role: (data.role as Role) || 'guru_ngaji',
            teacherId: data.teacherId ? String(data.teacherId) : undefined,
            assignedGroup: data.assignedGroup ? String(data.assignedGroup) : undefined,
            assignedTahfidzGroup: data.assignedTahfidzGroup
              ? String(data.assignedTahfidzGroup)
              : undefined,
            assignedClass: data.assignedClass ? String(data.assignedClass) : undefined,
            isActive: data.isActive !== false
          };
        });
      }

      if (invitesSnap) {
        _cachedInvites = invitesSnap.docs.map(d => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            email: normalizeEmail(data.email),
            nama: String(data.nama || ''),
            role: (data.role as Role) || 'guru_ngaji',
            teacherId: data.teacherId ? String(data.teacherId) : undefined,
            assignedGroup: data.assignedGroup ? String(data.assignedGroup) : undefined,
            assignedTahfidzGroup: data.assignedTahfidzGroup
              ? String(data.assignedTahfidzGroup)
              : undefined,
            assignedClass: data.assignedClass ? String(data.assignedClass) : undefined
          };
        });
      }

      if (dirSnap) {
        _cachedStaffDirectory = dirSnap.docs.map(d => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            nama: String(data.nama || ''),
            role: (data.role as Role) || 'guru_ngaji',
            kelompokBTQ: String(data.kelompokBTQ || '-'),
            kelompokTahfidz: data.kelompokTahfidz ? String(data.kelompokTahfidz) : undefined,
            assignedClass: data.assignedClass ? String(data.assignedClass) : undefined,
            ruangan: String(data.ruangan || '-'),
            kontak: data.kontak ? String(data.kontak) : undefined,
            email: data.email ? normalizeEmail(String(data.email)) : undefined
          };
        });
      }

      const adminEmails = getAdminEmailsList();
      const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

      // Sync adminEmails on shared admin docs
      staffSnap?.docs.forEach(d => {
        ops.push(batch => batch.update(d.ref, { adminEmails, updatedAt: serverTimestamp() }));
      });
      invitesSnap?.docs.forEach(d => {
        ops.push(batch => batch.update(d.ref, { adminEmails, updatedAt: serverTimestamp() }));
      });
      dirSnap?.docs.forEach(d => {
        ops.push(batch => batch.update(d.ref, { adminEmails, updatedAt: serverTimestamp() }));
      });
      reqSnap?.docs.forEach(d => {
        ops.push(batch => batch.update(d.ref, { adminEmails, updatedAt: serverTimestamp() }));
      });
      if (raporCfgSnap?.exists()) {
        ops.push(batch =>
          batch.update(raporCfgSnap.ref, { adminEmails, updatedAt: serverTimestamp() })
        );
      }
      raporStSnap?.docs.forEach(d => {
        ops.push(batch => batch.update(d.ref, { adminEmails, updatedAt: serverTimestamp() }));
      });
      raporLogSnap?.docs.forEach(d => {
        ops.push(batch => batch.update(d.ref, { adminEmails }));
      });

      // Compute & sync student/bacaan/tahfidz/absensi access arrays
      const accessByNisn = new Map<
        string,
        { authorizedEmails: string[]; editorEmails: string[] }
      >();

      studentsSnap?.docs.forEach(d => {
        const data = d.data();
        const safeNisn = toSafeDocId(String(data.nisn || d.id), 'std');
        const st: Student = {
          id: String(data.id || d.id),
          nisn: safeNisn,
          nama: String(data.nama || ''),
          gender: data.gender === 'L' ? 'L' : 'P',
          kelas: String(data.kelas || '-'),
          kelasBTQ: String(data.kelasBTQ || '-'),
          pengajar: String(data.pengajar || '-'),
          ruangan: String(data.ruangan || '-'),
          waliKelas: String(data.waliKelas || '-'),
          isTahfidz: Boolean(data.isTahfidz),
          pembimbingTahfidz: data.pembimbingTahfidz ? String(data.pembimbingTahfidz) : undefined,
          halaqahTahfidz: data.halaqahTahfidz ? String(data.halaqahTahfidz) : undefined,
          capaianTerakhir: data.capaianTerakhir,
          ujian: data.ujian
        };
        const access = computeStudentAccessLists(st);
        accessByNisn.set(safeNisn, access);
        _cachedStudentAccessByNisn.set(safeNisn, access);

        ops.push(batch =>
          batch.update(d.ref, {
            authorizedEmails: access.authorizedEmails,
            editorEmails: access.editorEmails,
            updatedAt: serverTimestamp()
          })
        );
      });

      const uid = auth.currentUser ? toSafeDocId(auth.currentUser.uid, 'uid') : 'admin';

      bacaanSnap?.docs.forEach(d => {
        const nisn = toSafeDocId(String(d.data().nisn || ''), 'std');
        const access = accessByNisn.get(nisn);
        if (!access) return;
        ops.push(batch =>
          batch.update(d.ref, {
            authorizedEmails: access.authorizedEmails,
            editorEmails: access.editorEmails,
            authorUid: uid,
            updatedAt: serverTimestamp()
          })
        );
      });

      tahfidzSnap?.docs.forEach(d => {
        const nisn = toSafeDocId(String(d.data().nisn || ''), 'std');
        const access = accessByNisn.get(nisn);
        if (!access) return;
        ops.push(batch =>
          batch.update(d.ref, {
            authorizedEmails: access.authorizedEmails,
            editorEmails: access.editorEmails,
            authorUid: uid,
            updatedAt: serverTimestamp()
          })
        );
      });

      absensiSnap?.docs.forEach(d => {
        const nisn = toSafeDocId(String(d.data().nisn || ''), 'std');
        const access = accessByNisn.get(nisn);
        if (!access) return;
        ops.push(batch =>
          batch.update(d.ref, {
            authorizedEmails: access.authorizedEmails,
            editorEmails: access.editorEmails,
            authorUid: uid,
            updatedAt: serverTimestamp()
          })
        );
      });

      await commitBatchedWrites(ops);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'resyncAllCloudAccess');
    }
  },

  async approveAccessRequest(params: {
    request: AccessRequest;
    role: Role;
    nama: string;
    assignedGroup?: string;
    assignedTahfidzGroup?: string;
    assignedClass?: string;
  }): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    const reqUid = toSafeDocId(params.request.uid, 'uid');
    const cleanEmail = normalizeEmail(params.request.email);
    const adminEmails = getAdminEmailsList();
    const cleanNama = clampStr(params.nama.trim() || params.request.nama, 120);
    const inviteId = toSafeDocId(`inv_${cleanEmail}`, 'inv');

    try {
      // 1. Mark request approved
      await updateDoc(doc(db, 'accessRequests', reqUid), {
        status: 'approved',
        adminEmails,
        updatedAt: serverTimestamp()
      });

      // 2. Upsert invite
      const invRef = doc(db, 'staffInvites', inviteId);
      const existingInv = await getDoc(invRef);
      await setDoc(
        invRef,
        stripUndefined({
          id: inviteId,
          email: cleanEmail,
          nama: cleanNama,
          role: params.role,
          assignedGroup:
            params.role === 'guru_ngaji' && params.assignedGroup
              ? clampStr(params.assignedGroup, 200)
              : undefined,
          assignedTahfidzGroup:
            params.role === 'guru_tahfidz' && params.assignedTahfidzGroup
              ? clampStr(params.assignedTahfidzGroup, 200)
              : undefined,
          assignedClass:
            params.role === 'wali_kelas' && params.assignedClass
              ? clampStr(params.assignedClass, 30)
              : undefined,
          adminEmails,
          createdAt: existingInv.exists() ? existingInv.data().createdAt : serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      );

      // 3. Create /admins/{uid} if admin
      if (params.role === 'admin') {
        const admRef = doc(db, 'admins', reqUid);
        const admSnap = await getDoc(admRef);
        if (!admSnap.exists()) {
          await setDoc(admRef, {
            uid: reqUid,
            email: cleanEmail,
            nama: cleanNama,
            inviteId,
            createdAt: serverTimestamp()
          });
        }
      }

      // 4. Create or update /staffUsers/{uid}
      const staffRef = doc(db, 'staffUsers', reqUid);
      const staffSnap = await getDoc(staffRef);
      await setDoc(
        staffRef,
        stripUndefined({
          uid: reqUid,
          email: cleanEmail,
          nama: cleanNama,
          role: params.role,
          assignedGroup:
            params.role === 'guru_ngaji' && params.assignedGroup
              ? clampStr(params.assignedGroup, 200)
              : undefined,
          assignedTahfidzGroup:
            params.role === 'guru_tahfidz' && params.assignedTahfidzGroup
              ? clampStr(params.assignedTahfidzGroup, 200)
              : undefined,
          assignedClass:
            params.role === 'wali_kelas' && params.assignedClass
              ? clampStr(params.assignedClass, 30)
              : undefined,
          inviteId,
          adminEmails,
          isActive: true,
          createdAt: staffSnap.exists() ? staffSnap.data().createdAt : serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      );

      // 5. Upsert staffDirectory entry so Wali Kelas / Guru Ngaji / Tahfidz stays synced
      const dirId = toSafeDocId(`staff_${cleanEmail}`, 'stf');
      const dirRef = doc(db, 'staffDirectory', dirId);
      const dirSnap = await getDoc(dirRef);
      await setDoc(
        dirRef,
        stripUndefined({
          id: dirId,
          nama: cleanNama,
          role: params.role,
          kelompokBTQ:
            params.role === 'guru_ngaji'
              ? clampStr(params.assignedGroup || 'BTQ', 200)
              : params.role === 'wali_kelas'
              ? clampStr(params.assignedClass || '-', 200)
              : clampStr(params.assignedTahfidzGroup || 'HALAQAH TAHFIDZ', 200),
          kelompokTahfidz:
            params.role === 'guru_tahfidz'
              ? clampStr(params.assignedTahfidzGroup || 'HALAQAH TAHFIDZ', 200)
              : undefined,
          assignedClass:
            params.role === 'wali_kelas' && params.assignedClass
              ? clampStr(params.assignedClass, 30)
              : undefined,
          ruangan: '-',
          email: cleanEmail,
          adminEmails,
          createdAt: dirSnap.exists() ? dirSnap.data().createdAt : serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      );

      // 6. Resync student & history permissions across Firestore
      await this.resyncAllCloudAccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `accessRequests/${reqUid}`);
    }
  },

  async rejectAccessRequest(uid: string): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    const safeUid = toSafeDocId(uid, 'uid');
    try {
      await updateDoc(doc(db, 'accessRequests', safeUid), {
        status: 'rejected',
        adminEmails: getAdminEmailsList(),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `accessRequests/${safeUid}`);
    }
  },

  async upsertStaffInviteAndSync(params: {
    email: string;
    nama: string;
    role: Role;
    assignedGroup?: string;
    assignedTahfidzGroup?: string;
    assignedClass?: string;
  }): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    const cleanEmail = normalizeEmail(params.email);
    const inviteId = toSafeDocId(`inv_${cleanEmail}`, 'inv');
    const dirId = toSafeDocId(`staff_${cleanEmail}`, 'stf');
    const adminEmails = getAdminEmailsList();
    const cleanNama = clampStr(params.nama.trim(), 120, cleanEmail.split('@')[0]);

    try {
      const invRef = doc(db, 'staffInvites', inviteId);
      const existingInv = await getDoc(invRef);
      await setDoc(
        invRef,
        stripUndefined({
          id: inviteId,
          email: cleanEmail,
          nama: cleanNama,
          role: params.role,
          assignedGroup:
            params.role === 'guru_ngaji' && params.assignedGroup
              ? clampStr(params.assignedGroup, 200)
              : undefined,
          assignedTahfidzGroup:
            params.role === 'guru_tahfidz' && params.assignedTahfidzGroup
              ? clampStr(params.assignedTahfidzGroup, 200)
              : undefined,
          assignedClass:
            params.role === 'wali_kelas' && params.assignedClass
              ? clampStr(params.assignedClass, 30)
              : undefined,
          adminEmails,
          createdAt: existingInv.exists() ? existingInv.data().createdAt : serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      );

      const dirRef = doc(db, 'staffDirectory', dirId);
      const existingDir = await getDoc(dirRef);
      await setDoc(
        dirRef,
        stripUndefined({
          id: dirId,
          nama: cleanNama,
          role: params.role,
          kelompokBTQ:
            params.role === 'guru_ngaji'
              ? clampStr(params.assignedGroup || 'BTQ', 200)
              : params.role === 'wali_kelas'
              ? clampStr(params.assignedClass || '-', 200)
              : clampStr(params.assignedTahfidzGroup || 'HALAQAH TAHFIDZ', 200),
          kelompokTahfidz:
            params.role === 'guru_tahfidz'
              ? clampStr(params.assignedTahfidzGroup || 'HALAQAH TAHFIDZ', 200)
              : undefined,
          assignedClass:
            params.role === 'wali_kelas' && params.assignedClass
              ? clampStr(params.assignedClass, 30)
              : undefined,
          ruangan: '-',
          email: cleanEmail,
          adminEmails,
          createdAt: existingDir.exists() ? existingDir.data().createdAt : serverTimestamp(),
          updatedAt: serverTimestamp()
        })
      );

      await this.resyncAllCloudAccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `staffInvites/${inviteId}`);
    }
  },

  async deleteStaffInviteCloud(inviteId: string): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    const safeId = toSafeDocId(inviteId, 'inv');
    try {
      await deleteDoc(doc(db, 'staffInvites', safeId));
      await this.resyncAllCloudAccess();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `staffInvites/${safeId}`);
    }
  },

  async saveRaporSettingsCloud(settings: RaporSettings): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.saveRaporSettings(settings);
      return;
    }
    if (!this.isCloudAuthenticated()) return;
    try {
      await setDoc(doc(db, 'raporConfig', 'main'), {
        tahunAjaran: clampStr(settings.tahunAjaran, 40),
        semester: clampStr(settings.semester, 30),
        tanggalRapor: clampStr(settings.tanggalRapor, 60),
        kepalaSekolah: clampStr(settings.kepalaSekolah, 120),
        nbmKepala: clampStr(settings.nbmKepala, 60),
        koordinator: clampStr(settings.koordinator, 120),
        adminEmails: getAdminEmailsList(),
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'raporConfig/main');
    }
  },

  async saveRaporPrintBatchCloud(params: {
    updatedStatuses: RaporPrintStatus[];
    newLog: RaporPrintBatchLog;
  }): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.saveRaporPrintBatch(params);
      return;
    }
    if (!this.isCloudAuthenticated()) return;
    const adminEmails = getAdminEmailsList();
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

    try {
      params.updatedStatuses.forEach(st => {
        const safeNisn = toSafeDocId(st.nisn, 'std');
        ops.push(batch => {
          batch.set(doc(db, 'raporStatuses', safeNisn), {
            nisn: safeNisn,
            printCount: st.printCount,
            lastPrintedAt: clampStr(st.lastPrintedAt, 50),
            lastPrintedBy: clampStr(st.lastPrintedBy, 120),
            semester: clampStr(st.semester, 30),
            tahunAjaran: clampStr(st.tahunAjaran, 40),
            adminEmails,
            updatedAt: serverTimestamp()
          });
        });
      });

      const safeLogId = toSafeDocId(params.newLog.id, 'rlog');
      ops.push(batch => {
        batch.set(doc(db, 'raporLogs', safeLogId), {
          id: safeLogId,
          printedAt: clampStr(params.newLog.printedAt, 50),
          printedBy: clampStr(params.newLog.printedBy, 120),
          kelasLabel: clampStr(params.newLog.kelasLabel, 60),
          jenisCetak: clampStr(params.newLog.jenisCetak, 80),
          totalRapor: params.newLog.totalRapor,
          semester: clampStr(params.newLog.semester, 30),
          tahunAjaran: clampStr(params.newLog.tahunAjaran, 40),
          nisnList: params.newLog.nisnList.slice(0, 500).map(n => clampStr(n, 40)),
          adminEmails,
          createdAt: serverTimestamp()
        });
      });

      await commitBatchedWrites(ops);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'raporLogs/batch');
    }
  },

  async resetStudentRaporStatusCloud(nisn: string): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.resetStudentRaporStatus(nisn);
      return;
    }
    if (!this.isCloudAuthenticated()) return;
    const safeNisn = toSafeDocId(nisn, 'std');
    try {
      await deleteDoc(doc(db, 'raporStatuses', safeNisn));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `raporStatuses/${safeNisn}`);
    }
  },

  async resetAllRaporStatusesCloud(): Promise<void> {
    if (isSupabaseConfigured) {
      await supabaseDb.resetAllRaporStatuses();
      return;
    }
    if (!this.isCloudAuthenticated()) return;
    try {
      const snap = await getDocs(collection(db, 'raporStatuses'));
      const ops = snap.docs.map(d => (batch: ReturnType<typeof writeBatch>) => batch.delete(d.ref));
      await commitBatchedWrites(ops);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'raporStatuses/all');
    }
  }
};
