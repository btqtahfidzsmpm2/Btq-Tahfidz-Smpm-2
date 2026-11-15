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
 * Splits multi-class group strings (e.g. "TILAWATI 4 PA, AL-QUR'AN PA")
 * into normalized uppercase tokens for matching student BTQ / Tahfidz groups.
 */
export function splitGroupTokens(groupStr?: string): string[] {
  if (!groupStr) return [];
  return groupStr
    .split(/[,&+/;|\n]+/)
    .map(t => t.trim().toUpperCase())
    .filter(t => t.length > 0 && !GENERIC_GROUP_TOKENS.has(t));
}

export function isValidBtqClass(kelasBTQ?: string): boolean {
  const val = (kelasBTQ || '').trim().toUpperCase();
  return val !== '' && val !== '-' && val !== 'PROGRAM TAHFIDZ';
}

export function canTeachNgaji(role: Role): boolean {
  return role === 'admin' || role === 'guru_ngaji';
}

export function canTeachTahfidz(role: Role): boolean {
  return role === 'admin' || role === 'guru_tahfidz';
}

export function matchesTeacherName(studentTeacher: string | undefined, userName: string): boolean {
  const sT = (studentTeacher || '').trim().toLowerCase();
  const uN = (userName || '').trim().toLowerCase();
  if (!sT || !uN || sT === '-') return false;
  return sT === uN || sT.includes(uN) || uN.includes(sT);
}

/**
 * Returns students enrolled in Kelas BTQ supervised by the Guru Ngaji (or all BTQ students for Admin).
 */
export function getAuthorizedNgajiStudents(user: UserSession, students: Student[]): Student[] {
  if (user.role === 'admin') {
    return students.filter(s => isValidBtqClass(s.kelasBTQ));
  }
  if (!canTeachNgaji(user.role)) return [];

  const groupTokens = splitGroupTokens(user.assignedGroup);

  return students.filter(s => {
    if (!isValidBtqClass(s.kelasBTQ)) return false;

    const byTeacher = matchesTeacherName(s.pengajar, user.nama);
    const sGroup = (s.kelasBTQ || '').trim().toUpperCase();
    const byGroup = groupTokens.some(
      token => sGroup === token || sGroup.includes(token) || token.includes(sGroup)
    );

    return byTeacher || byGroup;
  });
}

/**
 * Returns Tahfidz students supervised by the Guru Tahfidz (strictly s.isTahfidz === true).
 */
export function getAuthorizedTahfidzStudents(user: UserSession, students: Student[]): Student[] {
  if (user.role === 'admin') return students.filter(s => s.isTahfidz);
  if (!canTeachTahfidz(user.role)) return [];

  const tahfidzTokens = splitGroupTokens(user.assignedTahfidzGroup || user.assignedGroup);

  return students.filter(s => {
    if (!s.isTahfidz) return false;

    const hasExplicitPembimbing = Boolean(
      s.pembimbingTahfidz && s.pembimbingTahfidz.trim() && s.pembimbingTahfidz.trim() !== '-'
    );

    const byPembimbing = matchesTeacherName(s.pembimbingTahfidz, user.nama);
    const byPengajarFallback = !hasExplicitPembimbing && matchesTeacherName(s.pengajar, user.nama);

    const sHalaqah = (s.halaqahTahfidz || '').trim().toUpperCase();
    const byHalaqah =
      sHalaqah !== '' &&
      tahfidzTokens.some(
        token => sHalaqah === token || sHalaqah.includes(token) || token.includes(sHalaqah)
      );

    if (byPembimbing || byPengajarFallback || byHalaqah) return true;

    // Fallback: if no students in DB specify a matching pembimbingTahfidz and teacher has no specific halaqah token
    const anySpecificAssigned = students.some(
      st => st.isTahfidz && matchesTeacherName(st.pembimbingTahfidz, user.nama)
    );
    return !anySpecificAssigned && tahfidzTokens.length === 0 && !hasExplicitPembimbing;
  });
}

/**
 * Unified student list accessible to the logged-in user strictly matching their role.
 */
export function getAuthorizedStudents(user: UserSession, students: Student[]): Student[] {
  if (user.role === 'admin') return students;
  if (user.role === 'wali_kelas') {
    return students.filter(s => s.kelas === (user.assignedClass || '7D'));
  }
  if (user.role === 'guru_ngaji') {
    return getAuthorizedNgajiStudents(user, students);
  }
  if (user.role === 'guru_tahfidz') {
    return getAuthorizedTahfidzStudents(user, students);
  }
  return [];
}
