import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  Unsubscribe,
  Timestamp
} from 'firebase/firestore';
import { signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import {
  db,
  auth,
  googleProvider,
  BOOTSTRAP_ADMIN_EMAIL,
  OperationType,
  handleFirestoreError,
  sanitizeDocId,
  clampStr,
  normalizeEmail
} from './firebase';
import {
  Student,
  Teacher,
  BacaanRecord,
  TahfidzRecord,
  AbsensiRecord,
  RaporSettings,
  RaporPrintStatus,
  RaporPrintBatchLog,
  UserSession,
  AccessRequest,
  Role,
  UjianRecord
} from '../types';
import {
  matchesTeacherName,
  splitGroupTokens,
  normalizeBtqGroupToken,
  formatBtqClassWithGender,
  detectBtqClassGender,
  isValidBtqClass
} from '../utils/access';

export interface StaffDirectoryRecord {
  id: string;
  nama: string;
  role: 'admin' | 'guru_ngaji' | 'guru_tahfidz' | 'wali_kelas';
  kelompokBTQ: string;
  kelompokTahfidz?: string;
  assignedClass?: string;
  ruangan: string;
  kontak?: string;
  email?: string;
}

export interface StudentAcl {
  authorizedEmails: string[];
  editorEmails: string[];
}

export interface CloudSnapshotCallbacks {
  onStudents: (students: Student[]) => void;
  onTeachers: (teachers: Teacher[]) => void;
  onStaffDirectory?: (items: StaffDirectoryRecord[]) => void;
  onBacaan: (records: BacaanRecord[]) => void;
  onTahfidz: (records: TahfidzRecord[]) => void;
  onAbsensi: (records: AbsensiRecord[]) => void;
  onRaporSettings?: (settings: RaporSettings) => void;
  onRaporStatuses?: (statuses: Record<string, RaporPrintStatus>) => void;
  onRaporLogs?: (logs: RaporPrintBatchLog[]) => void;
  onAccessRequests?: (requests: AccessRequest[]) => void;
  onSyncError?: (message: string) => void;
}

// Runtime ACL cache populated from live Firestore students & staffDirectory snapshots
const studentAclCache = new Map<string, StudentAcl>();
let cachedStaffDirectory: StaffDirectoryRecord[] = [];
const inFlightResolveByUid = new Map<string, Promise<GoogleResolveResult>>();

function mergeStaffDirectoryCache(items: StaffDirectoryRecord[]): void {
  const map = new Map(cachedStaffDirectory.map(item => [item.id, item]));
  items.forEach(item => map.set(item.id, item));
  cachedStaffDirectory = Array.from(map.values());
}

function buildCapaianPayload(c: Student['capaianTerakhir']) {
  const validNilai: 'A' | 'B' | 'C' = c?.nilai === 'B' || c?.nilai === 'C' ? c.nilai : 'A';
  return {
    tingkat: clampStr(c?.tingkat, 120, 'Tilawati Remaja'),
    halamanAyat: clampStr(c?.halamanAyat, 120, 'Halaman Awal'),
    tanggal: clampStr(c?.tanggal, 30, new Date().toISOString().slice(0, 10)),
    nilai: validNilai
  };
}

function buildUjianPayload(u: UjianRecord) {
  const allowedPredikat = ['MUMTAZ', 'JAYYID', 'MAQBUL', 'ROSHIB', 'A', 'B', 'C', 'D'] as const;
  const pred = allowedPredikat.includes(u?.predikat as any) ? u.predikat : 'JAYYID';
  const rawNilai = Number(u?.nilai);
  const clampedNilai = Number.isFinite(rawNilai) ? Math.min(100, Math.max(0, rawNilai)) : 80;

  const payload: Record<string, unknown> = {
    nilai: clampedNilai,
    predikat: pred,
    natijah: clampStr(u?.natijah, 120, 'Lulus')
  };
  if (u?.tanggal) payload.tanggal = clampStr(u.tanggal, 30);
  if (u?.jenis) payload.jenis = clampStr(u.jenis, 120);
  if (u?.kelulusan) payload.kelulusan = clampStr(u.kelulusan, 120);
  if (u?.keterangan) payload.keterangan = clampStr(u.keterangan, 300);
  return payload;
}

/**
 * Computes deterministic ACL email arrays matching the exact rules in firestore.rules:
 * - authorizedEmails: Admin + Guru BTQ + Guru Tahfidz + Wali Kelas (max 20)
 * - editorEmails: Admin + Guru BTQ + Guru Tahfidz ONLY (max 15, omits Wali Kelas!)
 */
export function computeStudentAcl(
  student: Pick<
    Student,
    | 'pengajar'
    | 'pembimbingTahfidz'
    | 'isTahfidz'
    | 'kelas'
    | 'kelasBTQ'
    | 'gender'
    | 'halaqahTahfidz'
    | 'waliKelas'
  >,
  staffDir: StaffDirectoryRecord[]
): StudentAcl {
  const authorized = new Set<string>([BOOTSTRAP_ADMIN_EMAIL]);
  const editors = new Set<string>([BOOTSTRAP_ADMIN_EMAIL]);

  const sBtqValid = isValidBtqClass(student.kelasBTQ);
  const sBtqNorm = sBtqValid ? formatBtqClassWithGender(student.kelasBTQ, student.gender) : '';
  const sBtqRawUpper = (student.kelasBTQ || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const sBtqGender = sBtqValid ? detectBtqClassGender(sBtqNorm, student.gender) : null;
  const rawPengajar = (student.pengajar || '').trim();
  const hasExplicitPengajar = Boolean(
    rawPengajar && rawPengajar !== '-' && rawPengajar.toUpperCase() !== 'GURU BTQ'
  );

  const rawPembimbing = (student.pembimbingTahfidz || '').trim();
  const hasExplicitPembimbing = Boolean(rawPembimbing && rawPembimbing !== '-');
  const sHalaqah = (student.halaqahTahfidz || '').trim().toUpperCase().replace(/\s+/g, ' ');

  staffDir.forEach(staff => {
    const email = normalizeEmail(staff.email);
    if (!email || !email.includes('@')) return;

    if (staff.role === 'admin') {
      authorized.add(email);
      editors.add(email);
    } else if (staff.role === 'guru_ngaji') {
      let matched = matchesTeacherName(student.pengajar, staff.nama);
      if (!matched && !hasExplicitPengajar && sBtqValid) {
        const groupTokens = splitGroupTokens(staff.kelompokBTQ).map(normalizeBtqGroupToken);
        const allowedGenders = new Set<'PI' | 'PA'>();
        groupTokens.forEach(tok => {
          const g = detectBtqClassGender(tok);
          if (g) allowedGenders.add(g);
        });
        const genderOk =
          allowedGenders.size === 0 || !sBtqGender || allowedGenders.has(sBtqGender);
        if (genderOk && groupTokens.some(token => token === sBtqNorm || token === sBtqRawUpper)) {
          matched = true;
        }
      }
      if (matched) {
        authorized.add(email);
        editors.add(email);
      }
    } else if (staff.role === 'guru_tahfidz') {
      if (student.isTahfidz) {
        let matched =
          matchesTeacherName(student.pembimbingTahfidz, staff.nama) ||
          matchesTeacherName(student.pengajar, staff.nama);
        if (!matched && !hasExplicitPembimbing && sHalaqah) {
          const tahfidzTokens = splitGroupTokens(
            staff.kelompokTahfidz || staff.kelompokBTQ
          ).map(normalizeBtqGroupToken);
          if (tahfidzTokens.some(tok => tok === sHalaqah)) {
            matched = true;
          }
        }
        if (matched) {
          authorized.add(email);
          editors.add(email);
        }
      }
    } else if (staff.role === 'wali_kelas') {
      const studentClass = (student.kelas || '').trim().toUpperCase();
      const staffClass = (staff.assignedClass || '').trim().toUpperCase();
      const classMatched = studentClass && staffClass && studentClass === staffClass;
      const nameMatched = matchesTeacherName(student.waliKelas, staff.nama);
      if (classMatched || nameMatched) {
        authorized.add(email);
      }
    }
  });

  return {
    authorizedEmails: Array.from(authorized).slice(0, 20),
    editorEmails: Array.from(editors).slice(0, 15)
  };
}

function buildStudentDocPayload(
  student: Student,
  acl: StudentAcl,
  includeCreatedAt: boolean
): Record<string, unknown> {
  const safeNisn = sanitizeDocId(student.nisn, 40);
  const payload: Record<string, unknown> = {
    id: safeNisn,
    nisn: safeNisn,
    nama: clampStr(student.nama, 150, 'SANTRI'),
    gender: student.gender === 'L' ? 'L' : 'P',
    kelas: clampStr(student.kelas, 30, '-'),
    kelasBTQ: clampStr(student.kelasBTQ, 120, '-'),
    pengajar: clampStr(student.pengajar, 120, '-'),
    ruangan: clampStr(student.ruangan, 100, '-'),
    waliKelas: clampStr(student.waliKelas, 120, '-'),
    isTahfidz: Boolean(student.isTahfidz),
    capaianTerakhir: buildCapaianPayload(student.capaianTerakhir),
    ujian: buildUjianPayload(student.ujian),
    authorizedEmails: acl.authorizedEmails,
    editorEmails: acl.editorEmails,
    updatedAt: serverTimestamp()
  };

  if (includeCreatedAt) payload.createdAt = serverTimestamp();
  if (student.pembimbingTahfidz) payload.pembimbingTahfidz = clampStr(student.pembimbingTahfidz, 120);
  if (student.halaqahTahfidz) payload.halaqahTahfidz = clampStr(student.halaqahTahfidz, 120);
  if (student.ruanganTahfidz) payload.ruanganTahfidz = clampStr(student.ruanganTahfidz, 100);
  if (student.targetJuz) payload.targetJuz = clampStr(student.targetJuz, 80);
  if (student.totalHafalan) payload.totalHafalan = clampStr(student.totalHafalan, 100);
  if (student.hafalanTerakhir) payload.hafalanTerakhir = clampStr(student.hafalanTerakhir, 150);
  if (typeof student.kehadiranPersen === 'number' && Number.isFinite(student.kehadiranPersen)) {
    payload.kehadiranPersen = Math.min(100, Math.max(0, Math.round(student.kehadiranPersen)));
  }

  return payload;
}

function buildPublicReportPayload(student: Student): Record<string, unknown> {
  const safeNisn = sanitizeDocId(student.nisn, 40);
  const payload: Record<string, unknown> = {
    nisn: safeNisn,
    nama: clampStr(student.nama, 150, 'SANTRI'),
    gender: student.gender === 'L' ? 'L' : 'P',
    kelas: clampStr(student.kelas, 30, '-'),
    kelasBTQ: clampStr(student.kelasBTQ, 120, '-'),
    pengajar: clampStr(student.pengajar, 120, '-'),
    ruangan: clampStr(student.ruangan, 100, '-'),
    waliKelas: clampStr(student.waliKelas, 120, '-'),
    isTahfidz: Boolean(student.isTahfidz),
    capaianTerakhir: buildCapaianPayload(student.capaianTerakhir),
    ujian: buildUjianPayload(student.ujian),
    updatedAt: serverTimestamp()
  };

  if (student.halaqahTahfidz) payload.halaqahTahfidz = clampStr(student.halaqahTahfidz, 120);
  if (student.targetJuz) payload.targetJuz = clampStr(student.targetJuz, 80);
  if (student.totalHafalan) payload.totalHafalan = clampStr(student.totalHafalan, 100);
  if (student.hafalanTerakhir) payload.hafalanTerakhir = clampStr(student.hafalanTerakhir, 150);
  if (typeof student.kehadiranPersen === 'number' && Number.isFinite(student.kehadiranPersen)) {
    payload.kehadiranPersen = Math.min(100, Math.max(0, Math.round(student.kehadiranPersen)));
  }

  return payload;
}

function fromDocStudent(data: Record<string, any>): Student {
  if (Array.isArray(data.authorizedEmails) && Array.isArray(data.editorEmails)) {
    studentAclCache.set(String(data.nisn), {
      authorizedEmails: data.authorizedEmails,
      editorEmails: data.editorEmails
    });
  }
  return {
    id: String(data.id || data.nisn),
    nisn: String(data.nisn),
    nama: String(data.nama || ''),
    gender: data.gender === 'L' ? 'L' : 'P',
    kelas: String(data.kelas || ''),
    kelasBTQ: String(data.kelasBTQ || '-'),
    pengajar: String(data.pengajar || '-'),
    ruangan: String(data.ruangan || '-'),
    waliKelas: String(data.waliKelas || '-'),
    isTahfidz: Boolean(data.isTahfidz),
    pembimbingTahfidz: data.pembimbingTahfidz,
    halaqahTahfidz: data.halaqahTahfidz,
    ruanganTahfidz: data.ruanganTahfidz,
    targetJuz: data.targetJuz,
    totalHafalan: data.totalHafalan,
    hafalanTerakhir: data.hafalanTerakhir,
    capaianTerakhir: data.capaianTerakhir || {
      tingkat: 'Tilawati Remaja',
      halamanAyat: '-',
      tanggal: new Date().toISOString().slice(0, 10),
      nilai: 'A'
    },
    ujian: data.ujian || {
      nilai: 80,
      predikat: 'JAYYID',
      natijah: 'Lulus'
    },
    kehadiranPersen: typeof data.kehadiranPersen === 'number' ? data.kehadiranPersen : 100
  };
}

async function resolveStudentAcl(
  nisn: string,
  fallbackStudent?: Pick<
    Student,
    | 'pengajar'
    | 'pembimbingTahfidz'
    | 'isTahfidz'
    | 'kelas'
    | 'kelasBTQ'
    | 'gender'
    | 'halaqahTahfidz'
    | 'waliKelas'
  >,
  staffDir: StaffDirectoryRecord[] = []
): Promise<StudentAcl> {
  const safeNisn = sanitizeDocId(nisn, 40);
  const cached = studentAclCache.get(safeNisn);
  if (cached && cached.authorizedEmails.length > 0 && cached.editorEmails.length > 0) {
    return cached;
  }
  try {
    const snap = await getDoc(doc(db, 'students', safeNisn));
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.authorizedEmails) && Array.isArray(data.editorEmails)) {
        const acl = {
          authorizedEmails: data.authorizedEmails as string[],
          editorEmails: data.editorEmails as string[]
        };
        studentAclCache.set(safeNisn, acl);
        return acl;
      }
    }
  } catch {
    // Fallback below
  }
  if (fallbackStudent) {
    const effectiveDir = staffDir.length > 0 ? staffDir : cachedStaffDirectory;
    return computeStudentAcl(fallbackStudent, effectiveDir);
  }
  const email = normalizeEmail(auth.currentUser?.email);
  const base = email ? [BOOTSTRAP_ADMIN_EMAIL, email] : [BOOTSTRAP_ADMIN_EMAIL];
  return {
    authorizedEmails: Array.from(new Set(base)),
    editorEmails: Array.from(new Set(base))
  };
}

type BatchOp =
  | { type: 'set'; ref: ReturnType<typeof doc>; data: Record<string, unknown>; merge?: boolean }
  | { type: 'update'; ref: ReturnType<typeof doc>; data: Record<string, unknown> }
  | { type: 'delete'; ref: ReturnType<typeof doc> };

async function executeBatchOps(ops: BatchOp[], pathLabel: string): Promise<void> {
  const CHUNK_SIZE = 400;
  for (let i = 0; i < ops.length; i += CHUNK_SIZE) {
    const chunk = ops.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(op => {
      if (op.type === 'set') {
        batch.set(op.ref, op.data, op.merge ? { merge: true } : {});
      } else if (op.type === 'update') {
        batch.update(op.ref, op.data);
      } else {
        batch.delete(op.ref);
      }
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, pathLabel);
    }
  }
}

export interface GoogleResolveResult {
  status: 'authorized' | 'unlinked' | 'disabled' | 'unverified';
  session?: UserSession;
  pendingRequest?: AccessRequest | null;
  firebaseUser: FirebaseUser;
}

export const cloudDb = {
  isCloudAuthenticated(): boolean {
    return Boolean(auth.currentUser && auth.currentUser.emailVerified && auth.currentUser.email);
  },

  getCachedStaffDirectory(): StaffDirectoryRecord[] {
    return cachedStaffDirectory;
  },

  async signInWithGoogle(): Promise<FirebaseUser> {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  },

  async signOutGoogle(): Promise<void> {
    await signOut(auth);
  },

  /**
   * Resolves the authenticated Google account into an authorized SIM-Qur'an role session,
   * checking Bootstrap Admin, /admins/{uid}, /staffUsers/{uid}, and /staffDirectory email bindings.
   */
  resolveGoogleUserSession(fbUser: FirebaseUser): Promise<GoogleResolveResult> {
    if (!fbUser.emailVerified || !fbUser.email) {
      return Promise.resolve({ status: 'unverified', firebaseUser: fbUser });
    }

    const uid = sanitizeDocId(fbUser.uid, 128);
    const existingPromise = inFlightResolveByUid.get(uid);
    if (existingPromise) {
      return existingPromise;
    }

    const resolvePromise = this._resolveGoogleUserSessionInternal(fbUser, uid).finally(() => {
      inFlightResolveByUid.delete(uid);
    });
    inFlightResolveByUid.set(uid, resolvePromise);
    return resolvePromise;
  },

  async _resolveGoogleUserSessionInternal(
    fbUser: FirebaseUser,
    uid: string
  ): Promise<GoogleResolveResult> {
    const email = normalizeEmail(fbUser.email);
    const displayName = clampStr(fbUser.displayName || email.split('@')[0], 120, 'Petugas');

    // 1. Bootstrap Admin email check
    if (email === BOOTSTRAP_ADMIN_EMAIL) {
      try {
        const adminRef = doc(db, 'admins', uid);
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          try {
            await setDoc(adminRef, {
              uid,
              email,
              nama: displayName,
              createdAt: serverTimestamp()
            });
          } catch (writeErr) {
            // Re-check if another concurrent tab/listener created admins/{uid}
            const recheck = await getDoc(adminRef);
            if (!recheck.exists()) {
              throw writeErr;
            }
          }
        }
      } catch (error) {
        // Bootstrap Admin is also authorized directly by email in firestore.rules (isBootstrapAdmin()),
        // so log cleanly without blocking admin login on transient network/registry hiccups.
        console.warn('Bootstrap admins/{uid} registry sync note:', error);
      }

      return {
        status: 'authorized',
        firebaseUser: fbUser,
        session: {
          accountId: uid,
          authUid: uid,
          authProvider: 'google',
          email,
          username: email.split('@')[0],
          role: 'admin',
          nama: displayName,
          isDefaultPassword: false,
          loginAt: Date.now()
        }
      };
    }

    // 2. Check /admins/{uid}
    try {
      const adminSnap = await getDoc(doc(db, 'admins', uid));
      if (adminSnap.exists()) {
        const data = adminSnap.data();
        return {
          status: 'authorized',
          firebaseUser: fbUser,
          session: {
            accountId: uid,
            authUid: uid,
            authProvider: 'google',
            email,
            username: email.split('@')[0],
            role: 'admin',
            nama: String(data.nama || displayName),
            isDefaultPassword: false,
            loginAt: Date.now()
          }
        };
      }
    } catch {
      // Non-admin read denial on admins/{uid} shouldn't happen since owner get is allowed, ignore gracefully
    }

    // 3. Check /staffUsers/{uid}
    try {
      const staffSnap = await getDoc(doc(db, 'staffUsers', uid));
      if (staffSnap.exists()) {
        const data = staffSnap.data();
        if (data.isActive === false) {
          return { status: 'disabled', firebaseUser: fbUser };
        }
        return {
          status: 'authorized',
          firebaseUser: fbUser,
          session: {
            accountId: uid,
            authUid: uid,
            authProvider: 'google',
            email,
            username: email.split('@')[0],
            role: data.role as Role,
            nama: String(data.nama || displayName),
            assignedGroup: data.assignedGroup,
            assignedTahfidzGroup: data.assignedTahfidzGroup,
            assignedClass: data.assignedClass,
            isDefaultPassword: false,
            loginAt: Date.now()
          }
        };
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `staffUsers/${uid}`);
    }

    // 4. Fallback: check /staffDirectory by pre-registered email (added by Admin beforehand)
    try {
      const qDir = query(collection(db, 'staffDirectory'), where('email', '==', email));
      const dirSnap = await getDocs(qDir);
      if (!dirSnap.empty) {
        const docs = dirSnap.docs.map(d => d.data());
        const first = docs[0];
        const role = first.role as Role;
        // Pre-registered non-admin directory entries can log in immediately;
        // Co-Admins still require /admins/{uid} approval via Bootstrap Admin for write rules.
        if (role !== 'admin') {
          const combinedBtq = Array.from(
            new Set(docs.map(d => String(d.kelompokBTQ || '')).filter(v => v && v !== '-'))
          ).join(', ');
          const combinedTahfidz = Array.from(
            new Set(docs.map(d => String(d.kelompokTahfidz || '')).filter(Boolean))
          ).join(', ');

          return {
            status: 'authorized',
            firebaseUser: fbUser,
            session: {
              accountId: uid,
              authUid: uid,
              authProvider: 'google',
              email,
              username: email.split('@')[0],
              role,
              nama: String(first.nama || displayName),
              assignedGroup: combinedBtq || first.kelompokBTQ,
              assignedTahfidzGroup: combinedTahfidz || first.kelompokTahfidz,
              assignedClass: first.assignedClass,
              isDefaultPassword: false,
              loginAt: Date.now()
            }
          };
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'staffDirectory');
    }

    // 5. Check existing access request if any
    let pendingRequest: AccessRequest | null = null;
    try {
      const reqSnap = await getDoc(doc(db, 'accessRequests', uid));
      if (reqSnap.exists()) {
        const d = reqSnap.data();
        pendingRequest = {
          uid: String(d.uid),
          email: String(d.email),
          nama: String(d.nama),
          requestedRole: d.requestedRole,
          requestedNote: String(d.requestedNote || ''),
          status: d.status
        };
      }
    } catch {
      // Ignore if none
    }

    return {
      status: 'unlinked',
      firebaseUser: fbUser,
      pendingRequest
    };
  },

  async submitAccessRequest(params: {
    fbUser: FirebaseUser;
    nama: string;
    requestedRole: 'admin' | 'guru_ngaji' | 'guru_tahfidz' | 'wali_kelas';
    requestedNote: string;
  }): Promise<AccessRequest> {
    const uid = sanitizeDocId(params.fbUser.uid, 128);
    const email = normalizeEmail(params.fbUser.email);
    const ref = doc(db, 'accessRequests', uid);
    const nama = clampStr(params.nama, 120, 'Guru');
    const requestedNote = clampStr(params.requestedNote, 200, '-');

    try {
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data().status === 'pending') {
        await updateDoc(ref, {
          nama,
          requestedRole: params.requestedRole,
          requestedNote,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(ref, {
          uid,
          email,
          nama,
          requestedRole: params.requestedRole,
          requestedNote,
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `accessRequests/${uid}`);
    }

    return {
      uid,
      email,
      nama,
      requestedRole: params.requestedRole,
      requestedNote,
      status: 'pending'
    };
  },

  /**
   * Starts real-time Firestore onSnapshot listeners strictly scoped by user role.
   */
  subscribeCloudData(session: UserSession, callbacks: CloudSnapshotCallbacks): Unsubscribe {
    const unsubs: Unsubscribe[] = [];
    const email = normalizeEmail(session.email || auth.currentUser?.email);
    const isAdmin = session.role === 'admin';
    const isBootstrap = isAdmin && email === BOOTSTRAP_ADMIN_EMAIL;

    const onError = (path: string) => (err: Error) => {
      // Suppress transient errors when user just signed out
      if (!auth.currentUser) return;
      console.error(`Snapshot listener error at ${path}:`, err);
      callbacks.onSyncError?.(err.message);
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch {
        // Error already logged cleanly as JSON; surface via onSyncError toast without blanking UI on background listen
      }
    };

    // 1. Students listener (Bootstrap Admin gets full collection; Co-Admin & Teachers use authorizedEmails array-contains)
    const studentsQuery = isBootstrap
      ? collection(db, 'students')
      : query(collection(db, 'students'), where('authorizedEmails', 'array-contains', email));

    unsubs.push(
      onSnapshot(
        studentsQuery,
        snap => {
          const list = snap.docs.map(d => fromDocStudent(d.data()));
          callbacks.onStudents(list);
        },
        onError('students')
      )
    );

    // 2. Staff directory listener (Teachers & Wali Kelas)
    const dirQuery = isBootstrap
      ? collection(db, 'staffDirectory')
      : query(collection(db, 'staffDirectory'), where('email', '==', email));

    unsubs.push(
      onSnapshot(
        dirQuery,
        snap => {
          const allDir: StaffDirectoryRecord[] = snap.docs.map(d => {
            const data = d.data();
            return {
              id: String(data.id || d.id),
              nama: String(data.nama || ''),
              role: data.role,
              kelompokBTQ: String(data.kelompokBTQ || '-'),
              kelompokTahfidz: data.kelompokTahfidz,
              assignedClass: data.assignedClass,
              ruangan: String(data.ruangan || '-'),
              kontak: data.kontak,
              email: data.email
            };
          });
          if (isAdmin) {
            cachedStaffDirectory = allDir;
          } else {
            mergeStaffDirectoryCache(allDir);
          }
          callbacks.onStaffDirectory?.(allDir);

          const teachersOnly: Teacher[] = allDir
            .filter(item => item.role === 'guru_ngaji' || item.role === 'guru_tahfidz')
            .map(item => ({
              id: item.id,
              nama: item.nama,
              role: item.role === 'guru_tahfidz' ? 'guru_tahfidz' : 'guru_ngaji',
              kelompokBTQ: item.kelompokBTQ,
              kelompokTahfidz: item.kelompokTahfidz,
              ruangan: item.ruangan,
              kontak: item.kontak,
              email: item.email
            }));
          callbacks.onTeachers(teachersOnly);
        },
        onError('staffDirectory')
      )
    );

    // 3. Bacaan listener
    const bacaanQuery = isBootstrap
      ? collection(db, 'bacaan')
      : query(collection(db, 'bacaan'), where('authorizedEmails', 'array-contains', email));

    unsubs.push(
      onSnapshot(
        bacaanQuery,
        snap => {
          const list: BacaanRecord[] = snap.docs.map(d => {
            const data = d.data();
            return {
              id: String(data.id || d.id),
              nisn: String(data.nisn),
              tanggal: String(data.tanggal),
              tipe: data.tipe,
              jilid: String(data.jilid || ''),
              halaman: String(data.halaman || ''),
              nilai: data.nilai,
              catatan: data.catatan,
              pengajar: String(data.pengajar || '')
            };
          });
          list.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
          callbacks.onBacaan(list);
        },
        onError('bacaan')
      )
    );

    // 4. Tahfidz listener
    const tahfidzQuery = isBootstrap
      ? collection(db, 'tahfidz')
      : query(collection(db, 'tahfidz'), where('authorizedEmails', 'array-contains', email));

    unsubs.push(
      onSnapshot(
        tahfidzQuery,
        snap => {
          const list: TahfidzRecord[] = snap.docs.map(d => {
            const data = d.data();
            return {
              id: String(data.id || d.id),
              nisn: String(data.nisn),
              tanggal: String(data.tanggal),
              surat: String(data.surat || ''),
              ayat: String(data.ayat || ''),
              status: data.status,
              kelancaran: data.kelancaran,
              guru: String(data.guru || ''),
              catatan: data.catatan
            };
          });
          list.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
          callbacks.onTahfidz(list);
        },
        onError('tahfidz')
      )
    );

    // 5. Absensi listener
    const absensiQuery = isBootstrap
      ? collection(db, 'absensi')
      : query(collection(db, 'absensi'), where('authorizedEmails', 'array-contains', email));

    unsubs.push(
      onSnapshot(
        absensiQuery,
        snap => {
          const list: AbsensiRecord[] = snap.docs.map(d => {
            const data = d.data();
            return {
              id: String(data.id || d.id),
              nisn: String(data.nisn),
              tanggal: String(data.tanggal),
              sesi: data.sesi,
              status: data.status,
              keterangan: data.keterangan
            };
          });
          list.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
          callbacks.onAbsensi(list);
        },
        onError('absensi')
      )
    );

    // 6. Admin raporConfig/main get listener (allowed for all verified Admins)
    if (isAdmin) {
      unsubs.push(
        onSnapshot(
          doc(db, 'raporConfig', 'main'),
          snap => {
            if (snap.exists()) {
              const d = snap.data();
              callbacks.onRaporSettings?.({
                tahunAjaran: String(d.tahunAjaran || '2026/2027'),
                semester: String(d.semester || 'Ganjil'),
                tanggalRapor: String(d.tanggalRapor || ''),
                kepalaSekolah: String(d.kepalaSekolah || ''),
                nbmKepala: String(d.nbmKepala || ''),
                koordinator: String(d.koordinator || '')
              });
            }
          },
          onError('raporConfig/main')
        )
      );
    }

    // 7. Bootstrap-Admin-only list listeners: raporStatuses, raporLogs, accessRequests
    if (isBootstrap) {

      unsubs.push(
        onSnapshot(
          collection(db, 'raporStatuses'),
          snap => {
            const map: Record<string, RaporPrintStatus> = {};
            snap.docs.forEach(d => {
              const data = d.data();
              map[String(data.nisn)] = {
                nisn: String(data.nisn),
                printCount: Number(data.printCount || 0),
                lastPrintedAt: String(data.lastPrintedAt || ''),
                lastPrintedBy: String(data.lastPrintedBy || ''),
                semester: String(data.semester || ''),
                tahunAjaran: String(data.tahunAjaran || '')
              };
            });
            callbacks.onRaporStatuses?.(map);
          },
          onError('raporStatuses')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'raporLogs'),
          snap => {
            const logs: RaporPrintBatchLog[] = snap.docs.map(d => {
              const data = d.data();
              return {
                id: String(data.id || d.id),
                printedAt: String(data.printedAt || ''),
                printedBy: String(data.printedBy || ''),
                kelasLabel: String(data.kelasLabel || ''),
                jenisCetak: data.jenisCetak,
                totalRapor: Number(data.totalRapor || 0),
                semester: String(data.semester || ''),
                tahunAjaran: String(data.tahunAjaran || ''),
                nisnList: Array.isArray(data.nisnList) ? data.nisnList : []
              };
            });
            logs.sort((a, b) => b.printedAt.localeCompare(a.printedAt));
            callbacks.onRaporLogs?.(logs);
          },
          onError('raporLogs')
        )
      );

      unsubs.push(
        onSnapshot(
          collection(db, 'accessRequests'),
          snap => {
            const reqs: AccessRequest[] = snap.docs.map(d => {
              const data = d.data();
              return {
                uid: String(data.uid || d.id),
                email: String(data.email || ''),
                nama: String(data.nama || ''),
                requestedRole: data.requestedRole,
                requestedNote: String(data.requestedNote || ''),
                status: data.status
              };
            });
            callbacks.onAccessRequests?.(reqs);
          },
          onError('accessRequests')
        )
      );
    }

    return () => {
      unsubs.forEach(u => u());
    };
  },

  /**
   * Unauthenticated parent lookup by exact NISN from /publicReports/{nisn}.
   */
  async fetchPublicStudentByNisn(rawNisn: string): Promise<Student | null> {
    const safeNisn = sanitizeDocId(rawNisn, 40);
    if (!safeNisn) return null;
    try {
      const snap = await getDoc(doc(db, 'publicReports', safeNisn));
      if (!snap.exists()) return null;
      const d = snap.data();
      return {
        id: safeNisn,
        nisn: safeNisn,
        nama: String(d.nama || ''),
        gender: d.gender === 'L' ? 'L' : 'P',
        kelas: String(d.kelas || ''),
        kelasBTQ: String(d.kelasBTQ || '-'),
        pengajar: String(d.pengajar || '-'),
        ruangan: String(d.ruangan || '-'),
        waliKelas: String(d.waliKelas || '-'),
        isTahfidz: Boolean(d.isTahfidz),
        halaqahTahfidz: d.halaqahTahfidz,
        targetJuz: d.targetJuz,
        totalHafalan: d.totalHafalan,
        hafalanTerakhir: d.hafalanTerakhir,
        capaianTerakhir: d.capaianTerakhir,
        ujian: d.ujian,
        kehadiranPersen: typeof d.kehadiranPersen === 'number' ? d.kehadiranPersen : 100
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `publicReports/${safeNisn}`);
    }
  },

  /**
   * Admin: Upserts one or more students + publicReports atomically.
   */
  async syncStudentsBatch(
    studentsList: Student[],
    staffDir: StaffDirectoryRecord[],
    isUpdate: boolean = false
  ): Promise<void> {
    if (!this.isCloudAuthenticated() || studentsList.length === 0) return;

    const effectiveDir = staffDir.length > 0 ? staffDir : cachedStaffDirectory;
    const ops: BatchOp[] = [];
    for (const s of studentsList) {
      const safeNisn = sanitizeDocId(s.nisn, 40);
      const acl = computeStudentAcl(s, effectiveDir);
      studentAclCache.set(safeNisn, acl);

      const studentRef = doc(db, 'students', safeNisn);
      if (isUpdate) {
        try {
          const existing = await getDoc(studentRef);
          if (existing.exists()) {
            const payload = buildStudentDocPayload(s, acl, false);
            payload.createdAt = existing.data().createdAt || Timestamp.now();
            ops.push({ type: 'set', ref: studentRef, data: payload });
          } else {
            ops.push({ type: 'set', ref: studentRef, data: buildStudentDocPayload(s, acl, true) });
          }
        } catch {
          ops.push({ type: 'set', ref: studentRef, data: buildStudentDocPayload(s, acl, true) });
        }
      } else {
        // Check if exists so createdAt is preserved cleanly
        try {
          const existing = await getDoc(studentRef);
          if (existing.exists()) {
            const payload = buildStudentDocPayload(s, acl, false);
            payload.createdAt = existing.data().createdAt || Timestamp.now();
            ops.push({ type: 'set', ref: studentRef, data: payload });
          } else {
            ops.push({ type: 'set', ref: studentRef, data: buildStudentDocPayload(s, acl, true) });
          }
        } catch {
          ops.push({ type: 'set', ref: studentRef, data: buildStudentDocPayload(s, acl, true) });
        }
      }

      const publicRef = doc(db, 'publicReports', safeNisn);
      ops.push({ type: 'set', ref: publicRef, data: buildPublicReportPayload(s) });
    }

    await executeBatchOps(ops, 'students');
  },

  async deleteStudentCloud(nisn: string): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    const safeNisn = sanitizeDocId(nisn, 40);
    const ops: BatchOp[] = [
      { type: 'delete', ref: doc(db, 'students', safeNisn) },
      { type: 'delete', ref: doc(db, 'publicReports', safeNisn) }
    ];

    try {
      const [bSnap, tSnap, aSnap] = await Promise.all([
        getDocs(query(collection(db, 'bacaan'), where('nisn', '==', safeNisn))),
        getDocs(query(collection(db, 'tahfidz'), where('nisn', '==', safeNisn))),
        getDocs(query(collection(db, 'absensi'), where('nisn', '==', safeNisn)))
      ]);
      bSnap.docs.forEach(d => ops.push({ type: 'delete', ref: d.ref }));
      tSnap.docs.forEach(d => ops.push({ type: 'delete', ref: d.ref }));
      aSnap.docs.forEach(d => ops.push({ type: 'delete', ref: d.ref }));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `students/${safeNisn}`);
    }

    await executeBatchOps(ops, `students/${safeNisn}`);
  },

  /**
   * Teacher / Admin progress-only update on student + publicReport (matches Tier 2 rules).
   */
  async updateStudentProgressCloud(
    student: Student
  ): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    const safeNisn = sanitizeDocId(student.nisn, 40);
    const studentRef = doc(db, 'students', safeNisn);
    const updateFields: Record<string, unknown> = {
      capaianTerakhir: buildCapaianPayload(student.capaianTerakhir),
      ujian: buildUjianPayload(student.ujian),
      updatedAt: serverTimestamp()
    };
    if (student.hafalanTerakhir !== undefined) {
      updateFields.hafalanTerakhir = clampStr(student.hafalanTerakhir, 150);
    }
    if (student.totalHafalan !== undefined) {
      updateFields.totalHafalan = clampStr(student.totalHafalan, 100);
    }
    if (student.targetJuz !== undefined) {
      updateFields.targetJuz = clampStr(student.targetJuz, 80);
    }
    if (typeof student.kehadiranPersen === 'number') {
      updateFields.kehadiranPersen = Math.min(100, Math.max(0, Math.round(student.kehadiranPersen)));
    }

    try {
      await updateDoc(studentRef, updateFields);
      await setDoc(doc(db, 'publicReports', safeNisn), buildPublicReportPayload(student));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `students/${safeNisn}`);
    }
  },

  async saveStaffDirectoryBatch(items: StaffDirectoryRecord[]): Promise<void> {
    if (!this.isCloudAuthenticated() || items.length === 0) return;
    const ops: BatchOp[] = [];
    for (const item of items) {
      const safeId = sanitizeDocId(item.id, 128);
      const ref = doc(db, 'staffDirectory', safeId);
      let createdAtVal: unknown = serverTimestamp();
      try {
        const snap = await getDoc(ref);
        if (snap.exists() && snap.data().createdAt) {
          createdAtVal = snap.data().createdAt;
        }
      } catch {
        // use serverTimestamp
      }

      const payload: Record<string, unknown> = {
        id: safeId,
        nama: clampStr(item.nama, 120, 'Guru'),
        role: item.role,
        kelompokBTQ: clampStr(item.kelompokBTQ, 200, '-'),
        ruangan: clampStr(item.ruangan, 100, '-'),
        createdAt: createdAtVal,
        updatedAt: serverTimestamp()
      };
      if (item.kelompokTahfidz) payload.kelompokTahfidz = clampStr(item.kelompokTahfidz, 200);
      if (item.assignedClass) payload.assignedClass = clampStr(item.assignedClass, 30);
      if (item.kontak) payload.kontak = clampStr(item.kontak, 40);
      const cleanEmail = normalizeEmail(item.email);
      if (cleanEmail && cleanEmail.includes('@')) payload.email = cleanEmail;

      ops.push({ type: 'set', ref, data: payload });
    }
    await executeBatchOps(ops, 'staffDirectory');
    mergeStaffDirectoryCache(items);
  },

  async deleteStaffDirectoryDoc(id: string): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    const safeId = sanitizeDocId(id, 128);
    try {
      await deleteDoc(doc(db, 'staffDirectory', safeId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `staffDirectory/${safeId}`);
    }
  },

  /**
   * Upserts a single Bacaan record + updates student's capaianTerakhir & publicReport.
   */
  async upsertBacaanCloud(
    record: BacaanRecord,
    student?: Student,
    staffDir: StaffDirectoryRecord[] = []
  ): Promise<void> {
    if (!this.isCloudAuthenticated() || !auth.currentUser) return;
    const uid = sanitizeDocId(auth.currentUser.uid, 128);
    const safeId = sanitizeDocId(record.id, 128);
    const safeNisn = sanitizeDocId(record.nisn, 40);
    const acl = await resolveStudentAcl(safeNisn, student, staffDir);

    const ref = doc(db, 'bacaan', safeId);
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, {
          tanggal: clampStr(record.tanggal, 30),
          tipe: record.tipe,
          jilid: clampStr(record.jilid, 100),
          halaman: clampStr(record.halaman, 100),
          nilai: record.nilai,
          catatan: clampStr(record.catatan || "Mutaba'ah harian", 300),
          pengajar: clampStr(record.pengajar, 120),
          authorUid: uid,
          updatedAt: serverTimestamp()
        });
      } else {
        const payload: Record<string, unknown> = {
          id: safeId,
          nisn: safeNisn,
          tanggal: clampStr(record.tanggal, 30),
          tipe: record.tipe,
          jilid: clampStr(record.jilid, 100),
          halaman: clampStr(record.halaman, 100),
          nilai: record.nilai,
          pengajar: clampStr(record.pengajar, 120),
          authorUid: uid,
          authorizedEmails: acl.authorizedEmails,
          editorEmails: acl.editorEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        if (record.catatan) payload.catatan = clampStr(record.catatan, 300);
        await setDoc(ref, payload);
      }

      if (student) {
        await this.updateStudentProgressCloud(student);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bacaan/${safeId}`);
    }
  },

  async saveBatchBacaanCloud(
    items: Array<{ bacaan: BacaanRecord; absensi?: AbsensiRecord; student: Student }>,
    staffDir: StaffDirectoryRecord[] = []
  ): Promise<void> {
    if (!this.isCloudAuthenticated() || !auth.currentUser || items.length === 0) return;
    const uid = sanitizeDocId(auth.currentUser.uid, 128);
    const ops: BatchOp[] = [];

    for (const { bacaan, absensi, student } of items) {
      const safeNisn = sanitizeDocId(student.nisn, 40);
      const safeBacaanId = sanitizeDocId(bacaan.id, 128);
      const acl = await resolveStudentAcl(safeNisn, student, staffDir);

      // 1. Bacaan doc
      const bRef = doc(db, 'bacaan', safeBacaanId);
      let bExists = false;
      try {
        bExists = (await getDoc(bRef)).exists();
      } catch {
        bExists = false;
      }

      if (bExists) {
        ops.push({
          type: 'update',
          ref: bRef,
          data: {
            tanggal: clampStr(bacaan.tanggal, 30),
            tipe: bacaan.tipe,
            jilid: clampStr(bacaan.jilid, 100),
            halaman: clampStr(bacaan.halaman, 100),
            nilai: bacaan.nilai,
            catatan: clampStr(bacaan.catatan || "Mutaba'ah harian", 300),
            pengajar: clampStr(bacaan.pengajar, 120),
            authorUid: uid,
            updatedAt: serverTimestamp()
          }
        });
      } else {
        const bData: Record<string, unknown> = {
          id: safeBacaanId,
          nisn: safeNisn,
          tanggal: clampStr(bacaan.tanggal, 30),
          tipe: bacaan.tipe,
          jilid: clampStr(bacaan.jilid, 100),
          halaman: clampStr(bacaan.halaman, 100),
          nilai: bacaan.nilai,
          pengajar: clampStr(bacaan.pengajar, 120),
          authorUid: uid,
          authorizedEmails: acl.authorizedEmails,
          editorEmails: acl.editorEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        if (bacaan.catatan) bData.catatan = clampStr(bacaan.catatan, 300);
        ops.push({ type: 'set', ref: bRef, data: bData });
      }

      // 2. Absensi doc (if provided)
      if (absensi) {
        const safeAbsId = sanitizeDocId(absensi.id, 128);
        const aRef = doc(db, 'absensi', safeAbsId);
        let aExists = false;
        try {
          aExists = (await getDoc(aRef)).exists();
        } catch {
          aExists = false;
        }
        if (aExists) {
          ops.push({
            type: 'update',
            ref: aRef,
            data: {
              tanggal: clampStr(absensi.tanggal, 30),
              sesi: absensi.sesi,
              status: absensi.status,
              keterangan: clampStr(absensi.keterangan || 'Sesi Halaqah', 200),
              authorUid: uid,
              updatedAt: serverTimestamp()
            }
          });
        } else {
          const aData: Record<string, unknown> = {
            id: safeAbsId,
            nisn: safeNisn,
            tanggal: clampStr(absensi.tanggal, 30),
            sesi: absensi.sesi,
            status: absensi.status,
            authorUid: uid,
            authorizedEmails: acl.authorizedEmails,
            editorEmails: acl.editorEmails,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          };
          if (absensi.keterangan) aData.keterangan = clampStr(absensi.keterangan, 200);
          ops.push({ type: 'set', ref: aRef, data: aData });
        }
      }

      // 3. Student progress + publicReport
      const sRef = doc(db, 'students', safeNisn);
      ops.push({
        type: 'update',
        ref: sRef,
        data: {
          capaianTerakhir: buildCapaianPayload(student.capaianTerakhir),
          kehadiranPersen:
            typeof student.kehadiranPersen === 'number'
              ? Math.min(100, Math.max(0, Math.round(student.kehadiranPersen)))
              : 100,
          updatedAt: serverTimestamp()
        }
      });
      ops.push({
        type: 'set',
        ref: doc(db, 'publicReports', safeNisn),
        data: buildPublicReportPayload(student)
      });
    }

    await executeBatchOps(ops, 'bacaan_batch');
  },

  async addTahfidzCloud(
    record: TahfidzRecord,
    student?: Student,
    staffDir: StaffDirectoryRecord[] = []
  ): Promise<void> {
    if (!this.isCloudAuthenticated() || !auth.currentUser) return;
    const uid = sanitizeDocId(auth.currentUser.uid, 128);
    const safeId = sanitizeDocId(record.id, 128);
    const safeNisn = sanitizeDocId(record.nisn, 40);
    const acl = await resolveStudentAcl(safeNisn, student, staffDir);

    const ref = doc(db, 'tahfidz', safeId);
    const payload: Record<string, unknown> = {
      id: safeId,
      nisn: safeNisn,
      tanggal: clampStr(record.tanggal, 30),
      surat: clampStr(record.surat, 120),
      ayat: clampStr(record.ayat, 100),
      status: record.status,
      kelancaran: record.kelancaran,
      guru: clampStr(record.guru, 120),
      authorUid: uid,
      authorizedEmails: acl.authorizedEmails,
      editorEmails: acl.editorEmails,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    if (record.catatan) payload.catatan = clampStr(record.catatan, 300);

    try {
      await setDoc(ref, payload);
      if (student) {
        await this.updateStudentProgressCloud(student);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tahfidz/${safeId}`);
    }
  },

  async saveTahfidzBatchCloud(
    records: TahfidzRecord[],
    studentsMap: Map<string, Student>,
    staffDir: StaffDirectoryRecord[] = []
  ): Promise<void> {
    if (!this.isCloudAuthenticated() || !auth.currentUser || records.length === 0) return;
    const uid = sanitizeDocId(auth.currentUser.uid, 128);
    const ops: BatchOp[] = [];

    for (const record of records) {
      const safeId = sanitizeDocId(record.id, 128);
      const safeNisn = sanitizeDocId(record.nisn, 40);
      const student = studentsMap.get(safeNisn);
      const acl = await resolveStudentAcl(safeNisn, student, staffDir);
      const payload: Record<string, unknown> = {
        id: safeId,
        nisn: safeNisn,
        tanggal: clampStr(record.tanggal, 30),
        surat: clampStr(record.surat, 120),
        ayat: clampStr(record.ayat, 100),
        status: record.status,
        kelancaran: record.kelancaran,
        guru: clampStr(record.guru, 120),
        authorUid: uid,
        authorizedEmails: acl.authorizedEmails,
        editorEmails: acl.editorEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (record.catatan) payload.catatan = clampStr(record.catatan, 300);
      ops.push({ type: 'set', ref: doc(db, 'tahfidz', safeId), data: payload });
    }
    await executeBatchOps(ops, 'tahfidz');
  },

  async saveAbsensiBatchCloud(
    records: AbsensiRecord[],
    updatedStudents: Student[],
    staffDir: StaffDirectoryRecord[] = []
  ): Promise<void> {
    if (!this.isCloudAuthenticated() || !auth.currentUser || records.length === 0) return;
    const uid = sanitizeDocId(auth.currentUser.uid, 128);
    const studentMap = new Map(updatedStudents.map(s => [sanitizeDocId(s.nisn, 40), s]));
    const ops: BatchOp[] = [];

    for (const rec of records) {
      const safeId = sanitizeDocId(rec.id, 128);
      const safeNisn = sanitizeDocId(rec.nisn, 40);
      const student = studentMap.get(safeNisn);
      const acl = await resolveStudentAcl(safeNisn, student, staffDir);
      const aRef = doc(db, 'absensi', safeId);

      let exists = false;
      try {
        exists = (await getDoc(aRef)).exists();
      } catch {
        exists = false;
      }

      if (exists) {
        ops.push({
          type: 'update',
          ref: aRef,
          data: {
            tanggal: clampStr(rec.tanggal, 30),
            sesi: rec.sesi,
            status: rec.status,
            keterangan: clampStr(rec.keterangan || 'Sesi Halaqah', 200),
            authorUid: uid,
            updatedAt: serverTimestamp()
          }
        });
      } else {
        const payload: Record<string, unknown> = {
          id: safeId,
          nisn: safeNisn,
          tanggal: clampStr(rec.tanggal, 30),
          sesi: rec.sesi,
          status: rec.status,
          authorUid: uid,
          authorizedEmails: acl.authorizedEmails,
          editorEmails: acl.editorEmails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        if (rec.keterangan) payload.keterangan = clampStr(rec.keterangan, 200);
        ops.push({ type: 'set', ref: aRef, data: payload });
      }

      if (student) {
        ops.push({
          type: 'update',
          ref: doc(db, 'students', safeNisn),
          data: {
            kehadiranPersen:
              typeof student.kehadiranPersen === 'number'
                ? Math.min(100, Math.max(0, Math.round(student.kehadiranPersen)))
                : 100,
            updatedAt: serverTimestamp()
          }
        });
        ops.push({
          type: 'set',
          ref: doc(db, 'publicReports', safeNisn),
          data: buildPublicReportPayload(student)
        });
      }
    }

    await executeBatchOps(ops, 'absensi');
  },

  async deleteAbsensiEntryCloud(
    recordId: string,
    updatedStudent?: Student
  ): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    const safeId = sanitizeDocId(recordId, 128);
    try {
      await deleteDoc(doc(db, 'absensi', safeId));
      if (updatedStudent) {
        await this.updateStudentProgressCloud(updatedStudent);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `absensi/${safeId}`);
    }
  },

  async saveRaporSettingsCloud(settings: RaporSettings): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    try {
      await setDoc(doc(db, 'raporConfig', 'main'), {
        tahunAjaran: clampStr(settings.tahunAjaran, 40, '2026/2027'),
        semester: clampStr(settings.semester, 30, 'Ganjil'),
        tanggalRapor: clampStr(settings.tanggalRapor, 60),
        kepalaSekolah: clampStr(settings.kepalaSekolah, 120),
        nbmKepala: clampStr(settings.nbmKepala, 60),
        koordinator: clampStr(settings.koordinator, 120),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'raporConfig/main');
    }
  },

  async recordRaporPrintBatchCloud(
    updatedStatuses: RaporPrintStatus[],
    newLog: RaporPrintBatchLog
  ): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    const ops: BatchOp[] = [];

    updatedStatuses.forEach(st => {
      const safeNisn = sanitizeDocId(st.nisn, 40);
      ops.push({
        type: 'set',
        ref: doc(db, 'raporStatuses', safeNisn),
        data: {
          nisn: safeNisn,
          printCount: Number(st.printCount || 0),
          lastPrintedAt: clampStr(st.lastPrintedAt, 50),
          lastPrintedBy: clampStr(st.lastPrintedBy, 120),
          semester: clampStr(st.semester, 30),
          tahunAjaran: clampStr(st.tahunAjaran, 40),
          updatedAt: serverTimestamp()
        }
      });
    });

    const safeLogId = sanitizeDocId(newLog.id, 128);
    ops.push({
      type: 'set',
      ref: doc(db, 'raporLogs', safeLogId),
      data: {
        id: safeLogId,
        printedAt: clampStr(newLog.printedAt, 50),
        printedBy: clampStr(newLog.printedBy, 120),
        kelasLabel: clampStr(newLog.kelasLabel, 60),
        jenisCetak: clampStr(newLog.jenisCetak, 80),
        totalRapor: Number(newLog.totalRapor || 0),
        semester: clampStr(newLog.semester, 30),
        tahunAjaran: clampStr(newLog.tahunAjaran, 40),
        nisnList: newLog.nisnList.slice(0, 500).map(n => sanitizeDocId(n, 40)),
        createdAt: serverTimestamp()
      }
    });

    await executeBatchOps(ops, 'raporLogs');
  },

  async resetStudentRaporStatusCloud(nisn: string): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    const safeNisn = sanitizeDocId(nisn, 40);
    try {
      await deleteDoc(doc(db, 'raporStatuses', safeNisn));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `raporStatuses/${safeNisn}`);
    }
  },

  async resetAllRaporStatusesCloud(): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    try {
      const snap = await getDocs(collection(db, 'raporStatuses'));
      if (snap.empty) return;
      const ops: BatchOp[] = snap.docs.map(d => ({ type: 'delete', ref: d.ref }));
      await executeBatchOps(ops, 'raporStatuses');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'raporStatuses');
    }
  },

  /**
   * Recomputes authorizedEmails & editorEmails across students, bacaan, tahfidz, and absensi
   * whenever Admin links/updates a Teacher or Wali Kelas Google email.
   */
  async recomputeAllPermissionsCloud(
    studentsList: Student[],
    staffDir: StaffDirectoryRecord[]
  ): Promise<void> {
    if (!this.isCloudAuthenticated()) return;

    const aclByNisn = new Map<string, StudentAcl>();
    const ops: BatchOp[] = [];

    studentsList.forEach(s => {
      const safeNisn = sanitizeDocId(s.nisn, 40);
      const acl = computeStudentAcl(s, staffDir);
      aclByNisn.set(safeNisn, acl);
      studentAclCache.set(safeNisn, acl);
      ops.push({
        type: 'update',
        ref: doc(db, 'students', safeNisn),
        data: {
          authorizedEmails: acl.authorizedEmails,
          editorEmails: acl.editorEmails,
          updatedAt: serverTimestamp()
        }
      });
    });

    try {
      const [bSnap, tSnap, aSnap] = await Promise.all([
        getDocs(collection(db, 'bacaan')),
        getDocs(collection(db, 'tahfidz')),
        getDocs(collection(db, 'absensi'))
      ]);

      [...bSnap.docs, ...tSnap.docs, ...aSnap.docs].forEach(d => {
        const nisn = sanitizeDocId(String(d.data().nisn || ''), 40);
        const acl = aclByNisn.get(nisn);
        if (acl) {
          ops.push({
            type: 'update',
            ref: d.ref,
            data: {
              authorizedEmails: acl.authorizedEmails,
              editorEmails: acl.editorEmails,
              updatedAt: serverTimestamp()
            }
          });
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'recompute_acl');
    }

    await executeBatchOps(ops, 'recompute_acl');
  },

  /**
   * Admin: Approves an access request from a Google-authenticated teacher or Wali Kelas,
   * writes /staffUsers/{uid}, updates /staffDirectory, marks /accessRequests/{uid} approved,
   * and propagates student ACL permissions immediately.
   */
  async approveAccessRequestCloud(params: {
    request: AccessRequest;
    targetRole: Role;
    nama: string;
    teacherId?: string;
    teacherRecord?: Teacher;
    assignedGroup?: string;
    assignedTahfidzGroup?: string;
    assignedClass?: string;
    allStudents: Student[];
    staffDir: StaffDirectoryRecord[];
  }): Promise<StaffDirectoryRecord[]> {
    const uid = sanitizeDocId(params.request.uid, 128);
    const email = normalizeEmail(params.request.email);
    const ops: BatchOp[] = [];

    // 0. If approving as Co-Admin, register /admins/{uid} (only allowed for Bootstrap Admin)
    if (params.targetRole === 'admin') {
      const adminRef = doc(db, 'admins', uid);
      try {
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          ops.push({
            type: 'set',
            ref: adminRef,
            data: {
              uid,
              email,
              nama: clampStr(params.nama, 120),
              createdAt: serverTimestamp()
            }
          });
        }
      } catch {
        ops.push({
          type: 'set',
          ref: adminRef,
          data: {
            uid,
            email,
            nama: clampStr(params.nama, 120),
            createdAt: serverTimestamp()
          }
        });
      }
    }

    // 1. Create/Update /staffUsers/{uid}
    const staffUserRef = doc(db, 'staffUsers', uid);
    let existingCreatedAt: unknown = serverTimestamp();
    try {
      const snap = await getDoc(staffUserRef);
      if (snap.exists() && snap.data().createdAt) {
        existingCreatedAt = snap.data().createdAt;
      }
    } catch {
      // ignore
    }

    const staffUserPayload: Record<string, unknown> = {
      uid,
      email,
      nama: clampStr(params.nama, 120),
      role: params.targetRole,
      isActive: true,
      createdAt: existingCreatedAt,
      updatedAt: serverTimestamp()
    };
    if (params.teacherId) staffUserPayload.teacherId = sanitizeDocId(params.teacherId, 128);
    if (params.assignedGroup) staffUserPayload.assignedGroup = clampStr(params.assignedGroup, 200);
    if (params.assignedTahfidzGroup) {
      staffUserPayload.assignedTahfidzGroup = clampStr(params.assignedTahfidzGroup, 200);
    }
    if (params.assignedClass) staffUserPayload.assignedClass = clampStr(params.assignedClass, 30);

    ops.push({ type: 'set', ref: staffUserRef, data: staffUserPayload });

    // 2. Mark /accessRequests/{uid} as approved
    ops.push({
      type: 'update',
      ref: doc(db, 'accessRequests', uid),
      data: {
        status: 'approved',
        updatedAt: serverTimestamp()
      }
    });

    // 3. Upsert matching /staffDirectory entry with Google email
    const nextDir = [...params.staffDir];
    if (params.targetRole === 'admin') {
      const adminDirId = sanitizeDocId(`admin-${uid}`, 128);
      const adminDirEntry: StaffDirectoryRecord = {
        id: adminDirId,
        nama: clampStr(params.nama, 120),
        role: 'admin',
        kelompokBTQ: '-',
        ruangan: 'ADMIN CLOUD',
        email
      };
      const idx = nextDir.findIndex(d => d.id === adminDirId);
      if (idx !== -1) nextDir[idx] = adminDirEntry;
      else nextDir.push(adminDirEntry);
      await this.saveStaffDirectoryBatch([adminDirEntry]);
    } else if (params.teacherId) {
      const safeTeacherId = sanitizeDocId(params.teacherId, 128);
      const idx = nextDir.findIndex(d => d.id === safeTeacherId || d.id === params.teacherId);
      if (idx !== -1) {
        const updatedEntry: StaffDirectoryRecord = { ...nextDir[idx], id: safeTeacherId, email };
        nextDir[idx] = updatedEntry;
        await this.saveStaffDirectoryBatch([updatedEntry]);
      } else if (params.teacherRecord) {
        const newEntry: StaffDirectoryRecord = {
          id: safeTeacherId,
          nama: params.teacherRecord.nama,
          role: params.teacherRecord.role,
          kelompokBTQ: params.teacherRecord.kelompokBTQ || '-',
          kelompokTahfidz: params.teacherRecord.kelompokTahfidz,
          ruangan: params.teacherRecord.ruangan || '-',
          kontak: params.teacherRecord.kontak,
          email
        };
        nextDir.push(newEntry);
        await this.saveStaffDirectoryBatch([newEntry]);
      }
    } else if (params.targetRole === 'wali_kelas' && params.assignedClass) {
      const waliId = sanitizeDocId(`wali-${params.assignedClass.toLowerCase()}`, 128);
      const waliEntry: StaffDirectoryRecord = {
        id: waliId,
        nama: clampStr(params.nama, 120),
        role: 'wali_kelas',
        kelompokBTQ: '-',
        assignedClass: clampStr(params.assignedClass, 30),
        ruangan: `KELAS ${params.assignedClass}`,
        email
      };
      const idx = nextDir.findIndex(d => d.id === waliId);
      if (idx !== -1) nextDir[idx] = waliEntry;
      else nextDir.push(waliEntry);

      await this.saveStaffDirectoryBatch([waliEntry]);
    }

    await executeBatchOps(ops, `accessRequests/${uid}`);
    cachedStaffDirectory = nextDir;
    await this.recomputeAllPermissionsCloud(params.allStudents, nextDir);
    return nextDir;
  },

  async rejectAccessRequestCloud(uid: string): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    const safeUid = sanitizeDocId(uid, 128);
    try {
      await updateDoc(doc(db, 'accessRequests', safeUid), {
        status: 'rejected',
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `accessRequests/${safeUid}`);
    }
  },

  /**
   * Pushes all local dataset into Cloud Firestore (for Admin initial migration / sync).
   */
  async pushLocalDatasetToCloud(params: {
    students: Student[];
    teachers: Teacher[];
    bacaanList: BacaanRecord[];
    tahfidzList: TahfidzRecord[];
    absensiList: AbsensiRecord[];
    settings: RaporSettings;
    staffDirExtra?: StaffDirectoryRecord[];
  }): Promise<void> {
    if (!this.isCloudAuthenticated() || !auth.currentUser) return;
    const uid = sanitizeDocId(auth.currentUser.uid, 128);

    const staffDir: StaffDirectoryRecord[] = [
      ...params.teachers.map(t => ({
        id: sanitizeDocId(t.id, 128),
        nama: t.nama,
        role: t.role,
        kelompokBTQ: t.kelompokBTQ || '-',
        kelompokTahfidz: t.kelompokTahfidz,
        ruangan: t.ruangan || '-',
        kontak: t.kontak,
        email: t.email
      })),
      ...(params.staffDirExtra || [])
    ];

    if (staffDir.length > 0) {
      await this.saveStaffDirectoryBatch(staffDir);
    }

    if (params.students.length > 0) {
      await this.syncStudentsBatch(params.students, staffDir, false);
    }

    const studentMap = new Map(params.students.map(s => [sanitizeDocId(s.nisn, 40), s]));
    const childOps: BatchOp[] = [];

    params.bacaanList.forEach(b => {
      const safeId = sanitizeDocId(b.id, 128);
      const safeNisn = sanitizeDocId(b.nisn, 40);
      const st = studentMap.get(safeNisn);
      if (!st) return;
      const acl = computeStudentAcl(st, staffDir);
      const payload: Record<string, unknown> = {
        id: safeId,
        nisn: safeNisn,
        tanggal: clampStr(b.tanggal, 30),
        tipe: b.tipe,
        jilid: clampStr(b.jilid, 100),
        halaman: clampStr(b.halaman, 100),
        nilai: b.nilai,
        pengajar: clampStr(b.pengajar, 120),
        authorUid: uid,
        authorizedEmails: acl.authorizedEmails,
        editorEmails: acl.editorEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (b.catatan) payload.catatan = clampStr(b.catatan, 300);
      childOps.push({ type: 'set', ref: doc(db, 'bacaan', safeId), data: payload });
    });

    params.tahfidzList.forEach(t => {
      const safeId = sanitizeDocId(t.id, 128);
      const safeNisn = sanitizeDocId(t.nisn, 40);
      const st = studentMap.get(safeNisn);
      if (!st) return;
      const acl = computeStudentAcl(st, staffDir);
      const payload: Record<string, unknown> = {
        id: safeId,
        nisn: safeNisn,
        tanggal: clampStr(t.tanggal, 30),
        surat: clampStr(t.surat, 120),
        ayat: clampStr(t.ayat, 100),
        status: t.status,
        kelancaran: t.kelancaran,
        guru: clampStr(t.guru, 120),
        authorUid: uid,
        authorizedEmails: acl.authorizedEmails,
        editorEmails: acl.editorEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (t.catatan) payload.catatan = clampStr(t.catatan, 300);
      childOps.push({ type: 'set', ref: doc(db, 'tahfidz', safeId), data: payload });
    });

    params.absensiList.forEach(a => {
      const safeId = sanitizeDocId(`${a.nisn}_${a.tanggal}_${a.sesi}`, 128);
      const safeNisn = sanitizeDocId(a.nisn, 40);
      const st = studentMap.get(safeNisn);
      if (!st) return;
      const acl = computeStudentAcl(st, staffDir);
      const payload: Record<string, unknown> = {
        id: safeId,
        nisn: safeNisn,
        tanggal: clampStr(a.tanggal, 30),
        sesi: a.sesi,
        status: a.status,
        authorUid: uid,
        authorizedEmails: acl.authorizedEmails,
        editorEmails: acl.editorEmails,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      if (a.keterangan) payload.keterangan = clampStr(a.keterangan, 200);
      childOps.push({ type: 'set', ref: doc(db, 'absensi', safeId), data: payload });
    });

    if (childOps.length > 0) {
      await executeBatchOps(childOps, 'cloud_initial_sync');
    }

    await this.saveRaporSettingsCloud(params.settings);
  },

  /**
   * Clears all collections in Firestore (Admin only).
   */
  async clearAllCloudData(): Promise<void> {
    if (!this.isCloudAuthenticated()) return;
    const colNames = [
      'students',
      'staffDirectory',
      'bacaan',
      'tahfidz',
      'absensi',
      'raporStatuses',
      'raporLogs',
      'publicReports'
    ];
    const ops: BatchOp[] = [];
    for (const colName of colNames) {
      try {
        const snap = await getDocs(collection(db, colName));
        snap.docs.forEach(d => ops.push({ type: 'delete', ref: d.ref }));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, colName);
      }
    }
    studentAclCache.clear();
    cachedStaffDirectory = [];
    if (ops.length > 0) {
      await executeBatchOps(ops, 'clear_all');
    }
  }
};
