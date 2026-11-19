import { Role, Student, UserSession } from '../types';

const GENERIC_GROUP_TOKENS = new Set([
  '',
  '-',
  'BTQ REGULER',
  'HALAQAH TAHFIDZ',
  'PROGRAM TAHFIDZ',
  'KELOMPOK BINAAN'
]);

/**
 * Normalizes a teacher/user name for exact comparison without loose substring false-positives.
 */
export function normalizeTeacherName(name?: string): string {
  return (name || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/**
 * Splits multi-class group strings (e.g. "TILAWATI 4 PA, AL-QUR'AN PA")
 * into normalized uppercase tokens for matching student BTQ / Tahfidz groups.
 */
export function splitGroupTokens(groupStr?: string): string[] {
  if (!groupStr) return [];
  return groupStr
    .split(/[,&+/;|\n]+/)
    .map(t => t.trim().toUpperCase().replace(/\s+/g, ' '))
    .filter(t => t.length > 0 && !GENERIC_GROUP_TOKENS.has(t));
}

export function isValidBtqClass(kelasBTQ?: string): boolean {
  const val = (kelasBTQ || '').trim().toUpperCase();
  return val !== '' && val !== '-' && val !== 'PROGRAM TAHFIDZ';
}

/**
 * Detects whether a BTQ class belongs to Putri (PI) or Putra (PA).
 */
export function detectBtqClassGender(
  kelasBTQ?: string,
  fallbackGender?: 'L' | 'P'
): 'PI' | 'PA' | null {
  const upper = (kelasBTQ || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (/\b(PI|PUTRI)\b/.test(upper)) return 'PI';
  if (/\b(PA|PUTRA)\b/.test(upper)) return 'PA';
  if (fallbackGender === 'P') return 'PI';
  if (fallbackGender === 'L') return 'PA';
  return null;
}

/**
 * Formats a BTQ class name so Putri (PI) and Putra (PA) classes remain strictly distinct.
 */
export function formatBtqClassWithGender(
  kelasBTQ?: string,
  gender?: 'L' | 'P'
): string {
  if (!isValidBtqClass(kelasBTQ)) return '-';
  let normalized = (kelasBTQ || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\bPUTRI\b/g, 'PI')
    .replace(/\bPUTRA\b/g, 'PA');

  if (!/\b(PI|PA)\b/.test(normalized) && gender) {
    normalized = `${normalized} ${gender === 'P' ? 'PI' : 'PA'}`;
  }
  return normalized;
}

export function normalizeBtqGroupToken(token: string): string {
  return token
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\bPUTRI\b/g, 'PI')
    .replace(/\bPUTRA\b/g, 'PA');
}

export function canTeachNgaji(role: Role): boolean {
  return role === 'admin' || role === 'guru_ngaji';
}

export function canTeachTahfidz(role: Role): boolean {
  return role === 'admin' || role === 'guru_tahfidz';
}

/**
 * Exact teacher-name matching (supports comma/slash-separated co-teachers)
 * without partial substring collisions (e.g. "USTADZ AHMAD" != "USTADZ AHMAD FAUZI").
 */
export function matchesTeacherName(
  studentTeacher: string | undefined,
  userName: string
): boolean {
  const uN = normalizeTeacherName(userName);
  if (!studentTeacher || !uN) return false;
  const raw = studentTeacher.trim();
  if (!raw || raw === '-') return false;

  const tokens = raw
    .split(/[,;/&\n]+/)
    .map(t => normalizeTeacherName(t))
    .filter(t => t && t !== '-');

  return tokens.some(t => t === uN);
}

/**
 * Matches a student's BTQ/Halaqah group against a teacher's assigned multi-group string.
 */
export function matchesAssignedGroup(
  studentGroup: string | undefined,
  assignedGroup: string | undefined
): boolean {
  if (!studentGroup || !assignedGroup) return false;
  const studentNorm = normalizeBtqGroupToken(studentGroup);
  if (!studentNorm || studentNorm === '-') return false;
  const tokens = splitGroupTokens(assignedGroup).map(normalizeBtqGroupToken);
  return tokens.some(tok => tok === studentNorm);
}

/**
 * Returns students enrolled in Kelas BTQ strictly supervised by the Guru BTQ/Ngaji
 * (or all BTQ students for Admin), keeping Putri (PI) & Putra (PA) and each teacher's
 * own classes strictly isolated.
 */
export function getAuthorizedNgajiStudents(
  user: UserSession,
  students: Student[]
): Student[] {
  if (user.role === 'admin') {
    return students.filter(s => isValidBtqClass(s.kelasBTQ));
  }
  if (!canTeachNgaji(user.role)) return [];

  const groupTokens = splitGroupTokens(user.assignedGroup).map(normalizeBtqGroupToken);
  const allowedGenders = new Set<'PI' | 'PA'>();
  groupTokens.forEach(tok => {
    const g = detectBtqClassGender(tok);
    if (g) allowedGenders.add(g);
  });

  return students.filter(s => {
    if (!isValidBtqClass(s.kelasBTQ)) return false;

    const sBtqNorm = formatBtqClassWithGender(s.kelasBTQ, s.gender);
    const sBtqRawUpper = (s.kelasBTQ || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const sBtqGender = detectBtqClassGender(sBtqNorm, s.gender);

    // If the teacher's assigned classes explicitly specify PA or PI, enforce PA/PI separation
    if (allowedGenders.size > 0 && sBtqGender && !allowedGenders.has(sBtqGender)) {
      return false;
    }

    const hasExplicitTeacher = Boolean(
      s.pengajar && s.pengajar.trim() !== '' && s.pengajar.trim() !== '-'
    );

    if (hasExplicitTeacher) {
      // Strictly allow only students whose pengajar matches this logged-in Guru BTQ
      return matchesTeacherName(s.pengajar, user.nama);
    }

    // Fallback when student pengajar is not explicitly filled: require exact group token match
    return groupTokens.some(token => token === sBtqNorm || token === sBtqRawUpper);
  });
}

/**
 * Returns Tahfidz students supervised by the Guru Tahfidz (strictly s.isTahfidz === true).
 */
export function getAuthorizedTahfidzStudents(
  user: UserSession,
  students: Student[]
): Student[] {
  if (user.role === 'admin') return students.filter(s => s.isTahfidz);
  if (!canTeachTahfidz(user.role)) return [];

  const tahfidzTokens = splitGroupTokens(
    user.assignedTahfidzGroup || user.assignedGroup
  ).map(normalizeBtqGroupToken);

  return students.filter(s => {
    if (!s.isTahfidz) return false;

    const hasExplicitPembimbing = Boolean(
      s.pembimbingTahfidz &&
        s.pembimbingTahfidz.trim() &&
        s.pembimbingTahfidz.trim() !== '-'
    );

    if (hasExplicitPembimbing) {
      return matchesTeacherName(s.pembimbingTahfidz, user.nama);
    }

    const sHalaqah = (s.halaqahTahfidz || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (sHalaqah && tahfidzTokens.some(token => token === sHalaqah)) {
      return true;
    }

    return matchesTeacherName(s.pengajar, user.nama);
  });
}

/**
 * Unified student list accessible to the logged-in user strictly matching their role.
 */
export function getAuthorizedStudents(user: UserSession, students: Student[]): Student[] {
  if (user.role === 'admin') return students;
  if (user.role === 'wali_kelas') {
    const targetClass = (user.assignedClass || '').trim().toUpperCase();
    if (!targetClass) return [];
    return students.filter(s => (s.kelas || '').trim().toUpperCase() === targetClass);
  }
  if (user.role === 'guru_ngaji') {
    return getAuthorizedNgajiStudents(user, students);
  }
  if (user.role === 'guru_tahfidz') {
    return getAuthorizedTahfidzStudents(user, students);
  }
  return [];
}
