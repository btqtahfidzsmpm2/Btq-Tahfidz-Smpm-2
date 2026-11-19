import {
  Student,
  BacaanRecord,
  TahfidzRecord,
  AbsensiRecord,
  UjianRecord,
  Teacher,
  RaporPrintStatus,
  RaporPrintBatchLog,
  RaporSettings
} from '../types';
import { INITIAL_STUDENTS, INITIAL_BACAAN, INITIAL_TAHFIDZ, INITIAL_ABSENSI, INITIAL_TEACHERS } from '../data/initialData';
import { formatBtqClassWithGender, isValidBtqClass } from '../utils/access';

const KEY_STUDENTS = 'spemda_students_v4_clean';
const KEY_TEACHERS = 'spemda_teachers_v2_clean';
const KEY_BACAAN = 'spemda_bacaan_v4_clean';
const KEY_TAHFIDZ = 'spemda_tahfidz_v4_clean';
const KEY_ABSENSI = 'spemda_absensi_v4_clean';
const KEY_RAPOR_STATUS = 'spemda_rapor_status_v1';
const KEY_RAPOR_LOGS = 'spemda_rapor_logs_v1';
const KEY_RAPOR_SETTINGS = 'spemda_rapor_settings_v1';
const KEY_PURGED_LEGACY = 'spemda_sample_purged_v1';
const KEY_PORTAL_CLEANED_V2 = 'spemda_portal_cleaned_v2';

function purgeLegacySampleKeysOnce() {
  try {
    if (!localStorage.getItem(KEY_PURGED_LEGACY)) {
      localStorage.removeItem('spemda_students_v3');
      localStorage.removeItem('spemda_teachers_v1');
      localStorage.removeItem('spemda_bacaan_v3');
      localStorage.removeItem('spemda_tahfidz_v3');
      localStorage.removeItem('spemda_absensi_v3');
      localStorage.setItem(KEY_PURGED_LEGACY, '1');
    }
  } catch {
    // ignore
  }
}

export const storage = {
  getStudents(): Student[] {
    purgeLegacySampleKeysOnce();
    try {
      const data = localStorage.getItem(KEY_STUDENTS);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // fallback
    }
    localStorage.setItem(KEY_STUDENTS, JSON.stringify(INITIAL_STUDENTS));
    return INITIAL_STUDENTS;
  },

  saveStudents(students: Student[]): void {
    try {
      localStorage.setItem(KEY_STUDENTS, JSON.stringify(students));
    } catch {
      // ignore
    }
  },

  getBacaan(): BacaanRecord[] {
    try {
      const data = localStorage.getItem(KEY_BACAAN);
      if (data) return JSON.parse(data);
    } catch {
      // ignore
    }
    localStorage.setItem(KEY_BACAAN, JSON.stringify(INITIAL_BACAAN));
    return INITIAL_BACAAN;
  },

  saveBacaan(records: BacaanRecord[]): void {
    try {
      localStorage.setItem(KEY_BACAAN, JSON.stringify(records));
    } catch {
      // ignore
    }
  },

  getTahfidz(): TahfidzRecord[] {
    try {
      const data = localStorage.getItem(KEY_TAHFIDZ);
      if (data) return JSON.parse(data);
    } catch {
      // ignore
    }
    localStorage.setItem(KEY_TAHFIDZ, JSON.stringify(INITIAL_TAHFIDZ));
    return INITIAL_TAHFIDZ;
  },

  saveTahfidz(records: TahfidzRecord[]): void {
    try {
      localStorage.setItem(KEY_TAHFIDZ, JSON.stringify(records));
    } catch {
      // ignore
    }
  },

  getAbsensi(): AbsensiRecord[] {
    try {
      const data = localStorage.getItem(KEY_ABSENSI);
      if (data) return JSON.parse(data);
    } catch {
      // ignore
    }
    localStorage.setItem(KEY_ABSENSI, JSON.stringify(INITIAL_ABSENSI));
    return INITIAL_ABSENSI;
  },

  saveAbsensi(records: AbsensiRecord[]): void {
    try {
      localStorage.setItem(KEY_ABSENSI, JSON.stringify(records));
    } catch {
      // ignore
    }
  },

  addBacaan(record: Omit<BacaanRecord, 'id'>): BacaanRecord {
    const list = this.getBacaan();
    const newRecord: BacaanRecord = { ...record, id: 'b-' + Date.now() };
    const updated = [newRecord, ...list];
    this.saveBacaan(updated);

    // Also update student's capaianTerakhir
    const students = this.getStudents();
    const studentIdx = students.findIndex(s => s.nisn === record.nisn);
    if (studentIdx !== -1) {
      students[studentIdx].capaianTerakhir = {
        tingkat: `${record.tipe} ${record.jilid}`,
        halamanAyat: record.halaman,
        tanggal: record.tanggal,
        nilai: record.nilai
      };
      this.saveStudents(students);
    }

    return newRecord;
  },

  addTahfidz(record: Omit<TahfidzRecord, 'id'>): TahfidzRecord {
    const list = this.getTahfidz();
    const newRecord: TahfidzRecord = { ...record, id: 't-' + Date.now() };
    const updated = [newRecord, ...list];
    this.saveTahfidz(updated);

    // Update student's hafalanTerakhir
    const students = this.getStudents();
    const studentIdx = students.findIndex(s => s.nisn === record.nisn);
    if (studentIdx !== -1) {
      students[studentIdx].hafalanTerakhir = `${record.surat}: ${record.ayat}`;
      this.saveStudents(students);
    }

    return newRecord;
  },

  updateUjian(nisn: string, ujian: UjianRecord): void {
    const students = this.getStudents();
    const studentIdx = students.findIndex(s => s.nisn === nisn);
    if (studentIdx !== -1) {
      students[studentIdx].ujian = ujian;
      this.saveStudents(students);
    }
  },

  recordAttendanceBatch(nisnList: string[], sesi: 'btq' | 'tahfidz', tanggal: string): void {
    this.saveAttendanceBatch(
      nisnList.map(nisn => ({ nisn, status: 'Hadir' as const })),
      sesi,
      tanggal
    );
  },

  /**
   * Upserts daily attendance per (nisn, tanggal, sesi) and recalculates student kehadiranPersen.
   */
  saveAttendanceBatch(
    entries: Array<{ nisn: string; status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa' }>,
    sesi: 'btq' | 'tahfidz',
    tanggal: string
  ): { savedCount: number } {
    if (entries.length === 0) return { savedCount: 0 };

    const absensiList = [...this.getAbsensi()];
    const students = this.getStudents();

    entries.forEach((entry, idx) => {
      const existingIdx = absensiList.findIndex(
        a => a.nisn === entry.nisn && a.tanggal === tanggal && a.sesi === sesi
      );
      const record: AbsensiRecord = {
        id:
          existingIdx !== -1
            ? absensiList[existingIdx].id
            : `${entry.nisn}_${tanggal}_${sesi}`,
        nisn: entry.nisn,
        tanggal,
        sesi,
        status: entry.status,
        keterangan: sesi === 'btq' ? 'Sesi Halaqah BTQ' : 'Sesi Halaqah Tahfidz'
      };

      if (existingIdx !== -1) {
        absensiList[existingIdx] = record;
      } else {
        absensiList.unshift(record);
      }

      const sIdx = students.findIndex(s => s.nisn === entry.nisn);
      if (sIdx !== -1) {
        const studentAbs = absensiList.filter(a => a.nisn === entry.nisn);
        if (studentAbs.length > 0) {
          const hadirCount = studentAbs.filter(a => a.status === 'Hadir').length;
          students[sIdx].kehadiranPersen = Math.round((hadirCount / studentAbs.length) * 100);
        }
      }
    });

    this.saveAbsensi(absensiList);
    this.saveStudents(students);
    return { savedCount: entries.length };
  },

  deleteAttendanceEntry(
    nisn: string,
    sesi: 'btq' | 'tahfidz',
    tanggal: string
  ): void {
    const absensiList = this.getAbsensi().filter(
      a => !(a.nisn === nisn && a.tanggal === tanggal && a.sesi === sesi)
    );
    this.saveAbsensi(absensiList);

    const students = this.getStudents();
    const sIdx = students.findIndex(s => s.nisn === nisn);
    if (sIdx !== -1) {
      const studentAbs = absensiList.filter(a => a.nisn === nisn);
      if (studentAbs.length > 0) {
        const hadirCount = studentAbs.filter(a => a.status === 'Hadir').length;
        students[sIdx].kehadiranPersen = Math.round((hadirCount / studentAbs.length) * 100);
      } else {
        students[sIdx].kehadiranPersen = 100;
      }
      this.saveStudents(students);
    }
  },

  addStudent(student: Omit<Student, 'id'>): Student {
    const students = this.getStudents();
    const normalizedBtq = isValidBtqClass(student.kelasBTQ)
      ? formatBtqClassWithGender(student.kelasBTQ, student.gender)
      : '-';
    const newStudent: Student = {
      ...student,
      kelasBTQ: normalizedBtq,
      id: 'std-' + Date.now()
    };
    const updated = [newStudent, ...students];
    this.saveStudents(updated);
    return newStudent;
  },

  deleteStudent(nisn: string): void {
    const students = this.getStudents();
    const updated = students.filter(s => s.nisn !== nisn);
    this.saveStudents(updated);

    // Also clean up reading and tahfidz history for clean consistency
    const bacaan = this.getBacaan().filter(b => b.nisn !== nisn);
    this.saveBacaan(bacaan);
    const tahfidz = this.getTahfidz().filter(t => t.nisn !== nisn);
    this.saveTahfidz(tahfidz);
    const absensi = this.getAbsensi().filter(a => a.nisn !== nisn);
    this.saveAbsensi(absensi);
  },

  updateStudent(nisn: string, updatedData: Partial<Student>): void {
    const students = this.getStudents();
    const idx = students.findIndex(s => s.nisn === nisn);
    if (idx !== -1) {
      const mergedGender = updatedData.gender || students[idx].gender;
      const mergedRawBtq =
        updatedData.kelasBTQ !== undefined ? updatedData.kelasBTQ : students[idx].kelasBTQ;
      const normalizedBtq = isValidBtqClass(mergedRawBtq)
        ? formatBtqClassWithGender(mergedRawBtq, mergedGender)
        : '-';
      students[idx] = {
        ...students[idx],
        ...updatedData,
        kelasBTQ: normalizedBtq
      };
      this.saveStudents(students);
    }
  },

  getTeachers(): Teacher[] {
    purgeLegacySampleKeysOnce();
    try {
      const data = localStorage.getItem(KEY_TEACHERS);
      if (data) {
        return JSON.parse(data);
      }
    } catch {
      // fallback
    }

    // Auto-sync teachers directly from current student dataset if any exist
    const synced = this.syncTeachersFromStudents(true);
    if (synced.teachers.length > 0) {
      return synced.teachers;
    }

    localStorage.setItem(KEY_TEACHERS, JSON.stringify(INITIAL_TEACHERS));
    return INITIAL_TEACHERS;
  },

  saveTeachers(teachers: Teacher[]): void {
    try {
      localStorage.setItem(KEY_TEACHERS, JSON.stringify(teachers));
    } catch {
      // ignore
    }
  },

  addTeacher(teacher: Omit<Teacher, 'id'>): Teacher {
    const teachers = this.getTeachers();
    const newTeacher: Teacher = {
      ...teacher,
      id: 'tch-' + Date.now()
    };
    const updated = [newTeacher, ...teachers];
    this.saveTeachers(updated);
    return newTeacher;
  },

  updateTeacher(id: string, updatedData: Partial<Teacher>): void {
    const teachers = this.getTeachers();
    const idx = teachers.findIndex(t => t.id === id);
    if (idx !== -1) {
      teachers[idx] = {
        ...teachers[idx],
        ...updatedData
      };
      this.saveTeachers(teachers);
    }
  },

  deleteTeacher(id: string): void {
    const teachers = this.getTeachers();
    const updated = teachers.filter(t => t.id !== id);
    this.saveTeachers(updated);
  },

  /**
   * Normalizes legacy 'guru_ngaji_tahfidz' teachers into separate 'guru_ngaji' / 'guru_tahfidz'
   * records and ensures Kelas BTQ & Kelas Tahfidz stay cleanly separated.
   */
  normalizeTeacherRoles(): { updatedCount: number } {
    let updatedCount = 0;
    try {
      // 1. Clean up students where kelasBTQ was set to 'PROGRAM TAHFIDZ' and normalize PI/PA
      const students = this.getStudents();
      let studentsChanged = false;
      const cleanedStudents = students.map(s => {
        if (s.kelasBTQ?.trim().toUpperCase() === 'PROGRAM TAHFIDZ') {
          studentsChanged = true;
          return {
            ...s,
            kelasBTQ: '-',
            pengajar: s.pengajar && s.pengajar !== s.pembimbingTahfidz ? s.pengajar : '-',
            halaqahTahfidz: s.halaqahTahfidz || 'HALAQAH TAHFIDZ',
            pembimbingTahfidz: s.pembimbingTahfidz || (s.pengajar && s.pengajar !== '-' ? s.pengajar : undefined)
          };
        }
        if (isValidBtqClass(s.kelasBTQ)) {
          const normBtq = formatBtqClassWithGender(s.kelasBTQ, s.gender);
          if (normBtq !== s.kelasBTQ) {
            studentsChanged = true;
            return {
              ...s,
              kelasBTQ: normBtq
            };
          }
        }
        return s;
      });
      if (studentsChanged) {
        this.saveStudents(cleanedStudents);
      }

      // 2. Split or migrate any legacy 'guru_ngaji_tahfidz' teacher records
      const raw = localStorage.getItem(KEY_TEACHERS);
      if (!raw) return { updatedCount: 0 };
      const teachers: Array<Omit<Teacher, 'role'> & { role: string }> = JSON.parse(raw);
      const nextTeachers: Teacher[] = [];

      teachers.forEach(t => {
        if (t.role === 'guru_ngaji_tahfidz') {
          updatedCount++;
          const hasValidBTQ =
            Boolean(t.kelompokBTQ && t.kelompokBTQ.trim() !== '-' && t.kelompokBTQ.trim().toUpperCase() !== 'HALAQAH TAHFIDZ');
          if (hasValidBTQ) {
            nextTeachers.push({
              id: t.id,
              nama: t.nama,
              role: 'guru_ngaji',
              kelompokBTQ: t.kelompokBTQ,
              ruangan: t.ruangan,
              kontak: t.kontak
            });
          }
          nextTeachers.push({
            id: hasValidBTQ ? `${t.id}-tahfidz` : t.id,
            nama: t.nama,
            role: 'guru_tahfidz',
            kelompokBTQ: t.kelompokTahfidz || 'HALAQAH TAHFIDZ',
            kelompokTahfidz: t.kelompokTahfidz || 'HALAQAH TAHFIDZ',
            ruangan: t.ruangan,
            kontak: t.kontak
          });
        } else if (t.role === 'guru_tahfidz') {
          nextTeachers.push({
            ...t,
            role: 'guru_tahfidz'
          });
        } else {
          nextTeachers.push({
            ...t,
            role: 'guru_ngaji'
          });
        }
      });

      if (updatedCount > 0) {
        this.saveTeachers(nextTeachers);
      }
      return { updatedCount };
    } catch {
      return { updatedCount: 0 };
    }
  },

  /**
   * Syncs real teachers directly from the current student dataset while keeping
   * Guru Ngaji (Kelas BTQ) and Guru Tahfidz (Halaqah Tahfidz) strictly separate.
   */
  syncTeachersFromStudents(replaceOld: boolean = true): { total: number; teachers: Teacher[] } {
    const students = this.getStudents();
    let existingTeachers: Teacher[] = [];
    try {
      const raw = localStorage.getItem(KEY_TEACHERS);
      if (raw) existingTeachers = JSON.parse(raw);
    } catch {
      existingTeachers = [];
    }

    const existingMap = new Map<string, Teacher>();
    existingTeachers.forEach(t => {
      const roleKey: Teacher['role'] =
        t.role === 'guru_tahfidz' ? 'guru_tahfidz' : 'guru_ngaji';
      existingMap.set(`${t.nama.trim().toUpperCase()}::${roleKey}`, t);
    });

    const ngajiMap = new Map<
      string,
      { nama: string; kelasBTQSet: Set<string>; ruanganSet: Set<string> }
    >();
    const tahfidzMap = new Map<
      string,
      { nama: string; halaqahSet: Set<string>; ruanganSet: Set<string> }
    >();

    const ensureNgajiBucket = (rawName: string) => {
      const key = rawName.trim().toUpperCase();
      if (!ngajiMap.has(key)) {
        ngajiMap.set(key, {
          nama: key,
          kelasBTQSet: new Set<string>(),
          ruanganSet: new Set<string>()
        });
      }
      return ngajiMap.get(key)!;
    };

    const ensureTahfidzBucket = (rawName: string) => {
      const key = rawName.trim().toUpperCase();
      if (!tahfidzMap.has(key)) {
        tahfidzMap.set(key, {
          nama: key,
          halaqahSet: new Set<string>(),
          ruanganSet: new Set<string>()
        });
      }
      return tahfidzMap.get(key)!;
    };

    students.forEach(s => {
      const btqUpper = (s.kelasBTQ || '').trim().toUpperCase();
      const hasRealBTQClass = btqUpper !== '' && btqUpper !== '-' && btqUpper !== 'PROGRAM TAHFIDZ';

      // 1. Guru Ngaji (from Kelas BTQ & Pengajar BTQ)
      const rawNgajiTeacher = (s.pengajar || '').trim();
      if (
        hasRealBTQClass &&
        rawNgajiTeacher &&
        rawNgajiTeacher !== '-' &&
        rawNgajiTeacher.toLowerCase() !== 'belum ada'
      ) {
        const nData = ensureNgajiBucket(rawNgajiTeacher);
        nData.kelasBTQSet.add(s.kelasBTQ.trim());
        if (s.ruangan && s.ruangan.trim() && s.ruangan !== '-') {
          nData.ruanganSet.add(s.ruangan.trim());
        }
      }

      // 2. Guru Tahfidz (strictly from Program Tahfidz / Pembimbing Tahfidz)
      if (s.isTahfidz) {
        const rawTahfidzTeacher = (s.pembimbingTahfidz || '').trim();
        const fallbackMentor =
          !hasRealBTQClass && rawNgajiTeacher && rawNgajiTeacher !== '-' ? rawNgajiTeacher : '';
        const finalMentor = rawTahfidzTeacher && rawTahfidzTeacher !== '-' ? rawTahfidzTeacher : fallbackMentor;

        if (finalMentor) {
          const tData = ensureTahfidzBucket(finalMentor);
          if (s.halaqahTahfidz && s.halaqahTahfidz.trim() && s.halaqahTahfidz !== '-') {
            tData.halaqahSet.add(s.halaqahTahfidz.trim());
          } else {
            tData.halaqahSet.add('HALAQAH TAHFIDZ');
          }
          const room = s.ruanganTahfidz || s.ruangan;
          if (room && room.trim() && room !== '-') {
            tData.ruanganSet.add(room.trim());
          }
        }
      }
    });

    // 3. Check tahfidz setoran records
    const tahfidzRecords = this.getTahfidz();
    tahfidzRecords.forEach(r => {
      if (r.guru && r.guru.trim() && r.guru !== '-') {
        const tData = ensureTahfidzBucket(r.guru);
        if (tData.halaqahSet.size === 0) {
          tData.halaqahSet.add('HALAQAH TAHFIDZ');
        }
      }
    });

    const syncedTeachers: Teacher[] = [];
    let counter = 1;

    ngajiMap.forEach((data, key) => {
      const existing = existingMap.get(`${key}::guru_ngaji`);
      if (existing?.kelompokBTQ && existing.kelompokBTQ !== 'BTQ REGULER' && existing.kelompokBTQ !== '-') {
        existing.kelompokBTQ
          .split(/[,&+/;]+/)
          .map(x => x.trim())
          .filter(x => x && x.toUpperCase() !== 'HALAQAH TAHFIDZ' && x.toUpperCase() !== 'PROGRAM TAHFIDZ')
          .forEach(x => data.kelasBTQSet.add(x));
      }

      const kelompokArr = Array.from(data.kelasBTQSet);
      const ruanganArr = Array.from(data.ruanganSet);

      syncedTeachers.push({
        id: existing?.id || `tch-ngaji-${Date.now()}-${counter++}`,
        nama: data.nama,
        role: 'guru_ngaji',
        kelompokBTQ: kelompokArr.length > 0 ? kelompokArr.join(', ') : existing?.kelompokBTQ || 'BTQ REGULER',
        ruangan: ruanganArr.length > 0 ? ruanganArr.slice(0, 3).join(' / ') : existing?.ruangan || 'RUANGAN KELAS',
        kontak: existing?.kontak || undefined
      });
    });

    tahfidzMap.forEach((data, key) => {
      const existing = existingMap.get(`${key}::guru_tahfidz`);
      if (existing?.kelompokTahfidz) {
        data.halaqahSet.add(existing.kelompokTahfidz);
      }

      const halaqahArr = Array.from(data.halaqahSet);
      const ruanganArr = Array.from(data.ruanganSet);
      const halaqahStr = halaqahArr.length > 0 ? halaqahArr.join(', ') : 'HALAQAH TAHFIDZ';

      syncedTeachers.push({
        id: existing?.id || `tch-tahfidz-${Date.now()}-${counter++}`,
        nama: data.nama,
        role: 'guru_tahfidz',
        kelompokBTQ: halaqahStr,
        kelompokTahfidz: halaqahStr,
        ruangan: ruanganArr.length > 0 ? ruanganArr.slice(0, 3).join(' / ') : existing?.ruangan || 'RUANGAN TAHFIDZ',
        kontak: existing?.kontak || undefined
      });
    });

    // Sort by role then name
    syncedTeachers.sort((a, b) => {
      if (a.role !== b.role) return a.role.localeCompare(b.role);
      return a.nama.localeCompare(b.nama);
    });

    if (replaceOld || existingTeachers.length === 0) {
      this.saveTeachers(syncedTeachers);
      return { total: syncedTeachers.length, teachers: syncedTeachers };
    } else {
      const finalTeachers = [...syncedTeachers];
      existingTeachers.forEach(et => {
        const normalizedRole: Teacher['role'] =
          et.role === 'guru_tahfidz' ? 'guru_tahfidz' : 'guru_ngaji';
        if (
          !syncedTeachers.some(
            st => st.nama.toUpperCase() === et.nama.toUpperCase() && st.role === normalizedRole
          )
        ) {
          finalTeachers.push({ ...et, role: normalizedRole });
        }
      });
      this.saveTeachers(finalTeachers);
      return { total: finalTeachers.length, teachers: finalTeachers };
    }
  },

  /**
   * Deduplicates all student records in the database so each student name exists exactly once.
   */
  deduplicateStudentsByName(): { removedCount: number; originalCount: number; uniqueCount: number } {
    const students = this.getStudents();
    const originalCount = students.length;

    const nameMap = new Map<string, Student>();

    students.forEach(student => {
      const normName = (student.nama || '').trim().toUpperCase().replace(/\s+/g, ' ');
      if (!normName) return;

      const existing = nameMap.get(normName);
      if (!existing) {
        nameMap.set(normName, { ...student });
      } else {
        const merged: Student = { ...existing };

        if (!merged.nisn || merged.nisn === '-' || merged.nisn.length < 5) {
          if (student.nisn && student.nisn !== '-') merged.nisn = student.nisn;
        }
        if (student.isTahfidz) merged.isTahfidz = true;
        if (student.pembimbingTahfidz && !merged.pembimbingTahfidz) {
          merged.pembimbingTahfidz = student.pembimbingTahfidz;
        }
        if (student.halaqahTahfidz && !merged.halaqahTahfidz) {
          merged.halaqahTahfidz = student.halaqahTahfidz;
        }
        if (student.ruanganTahfidz && !merged.ruanganTahfidz) {
          merged.ruanganTahfidz = student.ruanganTahfidz;
        }
        if (student.targetJuz && (!merged.targetJuz || merged.targetJuz === '-')) {
          merged.targetJuz = student.targetJuz;
        }
        if (student.totalHafalan && (!merged.totalHafalan || merged.totalHafalan === '0 Juz')) {
          merged.totalHafalan = student.totalHafalan;
        }
        if (student.hafalanTerakhir && (!merged.hafalanTerakhir || merged.hafalanTerakhir === '-')) {
          merged.hafalanTerakhir = student.hafalanTerakhir;
        }

        if ((student.ujian?.nilai || 0) > (merged.ujian?.nilai || 0)) {
          merged.ujian = student.ujian;
        }

        if (
          student.capaianTerakhir?.tanggal &&
          (!merged.capaianTerakhir?.tanggal || student.capaianTerakhir.tanggal >= merged.capaianTerakhir.tanggal)
        ) {
          merged.capaianTerakhir = student.capaianTerakhir;
        }

        if ((student.kehadiranPersen || 0) > (merged.kehadiranPersen || 0)) {
          merged.kehadiranPersen = student.kehadiranPersen;
        }

        nameMap.set(normName, merged);
      }
    });

    const uniqueStudents = Array.from(nameMap.values());
    const removedCount = originalCount - uniqueStudents.length;

    if (removedCount > 0) {
      this.saveStudents(uniqueStudents);
      this.syncTeachersFromStudents(false);
    }

    return {
      removedCount,
      originalCount,
      uniqueCount: uniqueStudents.length
    };
  },

  importStudentsBatch(incoming: Omit<Student, 'id'>[]): { added: number; updated: number; total: number; teachersCount: number; teachers: Teacher[] } {
    const existing = this.getStudents();
    let added = 0;
    let updated = 0;

    const studentMap = new Map<string, Student>();
    const nameToNisnMap = new Map<string, string>();

    existing.forEach(s => {
      studentMap.set(s.nisn, s);
      const norm = (s.nama || '').trim().toUpperCase().replace(/\s+/g, ' ');
      nameToNisnMap.set(norm, s.nisn);
    });

    incoming.forEach((rawInc, idx) => {
      const normalizedBtq = isValidBtqClass(rawInc.kelasBTQ)
        ? formatBtqClassWithGender(rawInc.kelasBTQ, rawInc.gender)
        : '-';
      const inc: Omit<Student, 'id'> = {
        ...rawInc,
        kelasBTQ: normalizedBtq
      };
      const normName = (inc.nama || '').trim().toUpperCase().replace(/\s+/g, ' ');
      const existingNisn = studentMap.has(inc.nisn) ? inc.nisn : nameToNisnMap.get(normName);

      const existingStudent = existingNisn ? studentMap.get(existingNisn) : undefined;
      if (existingStudent) {
        // Update Ngaji/BTQ info while preserving existing Tahfidz program details
        const updatedStudent: Student = {
          ...existingStudent,
          ...inc,
          id: existingStudent.id,
          nisn: existingStudent.nisn,
          isTahfidz: existingStudent.isTahfidz || inc.isTahfidz,
          pembimbingTahfidz: existingStudent.pembimbingTahfidz || inc.pembimbingTahfidz,
          halaqahTahfidz: existingStudent.halaqahTahfidz || inc.halaqahTahfidz,
          ruanganTahfidz: existingStudent.ruanganTahfidz || inc.ruanganTahfidz,
          targetJuz: inc.targetJuz || existingStudent.targetJuz,
          totalHafalan: existingStudent.totalHafalan || inc.totalHafalan,
          hafalanTerakhir: existingStudent.hafalanTerakhir || inc.hafalanTerakhir
        };
        studentMap.set(existingStudent.nisn, updatedStudent);
        nameToNisnMap.set(normName, existingStudent.nisn);
        updated++;
      } else {
        const newId = `std-import-${Date.now()}-${idx}`;
        const newStudent: Student = {
          ...inc,
          id: newId
        };
        studentMap.set(inc.nisn, newStudent);
        nameToNisnMap.set(normName, inc.nisn);
        added++;
      }
    });

    const result = Array.from(studentMap.values());
    this.saveStudents(result);

    // Sync teachers cleanly (preserving manually added/imported teachers)
    const syncedTeachers = this.syncTeachersFromStudents(false);

    return {
      added,
      updated,
      total: result.length,
      teachersCount: syncedTeachers.total,
      teachers: syncedTeachers.teachers
    };
  },

  /**
   * Dedicated batch import for Teachers strictly separated by role ('guru_ngaji' vs 'guru_tahfidz').
   */
  importTeachersBatch(
    incoming: Array<{
      nama: string;
      kelompok: string;
      ruangan: string;
      kontak?: string;
    }>,
    role: 'guru_ngaji' | 'guru_tahfidz'
  ): { added: number; updated: number; total: number; teachers: Teacher[] } {
    const existing = this.getTeachers();
    const map = new Map<string, Teacher>();
    existing.forEach(t => {
      const normalizedRole: Teacher['role'] =
        t.role === 'guru_tahfidz' ? 'guru_tahfidz' : 'guru_ngaji';
      map.set(`${t.nama.trim().toUpperCase()}::${normalizedRole}`, {
        ...t,
        role: normalizedRole
      });
    });

    let added = 0;
    let updated = 0;

    incoming.forEach((inc, idx) => {
      const cleanName = inc.nama.trim().toUpperCase();
      if (!cleanName) return;
      const key = `${cleanName}::${role}`;
      const existingTeacher = map.get(key);
      const cleanGroup =
        inc.kelompok.trim() || (role === 'guru_tahfidz' ? 'HALAQAH TAHFIDZ' : 'BTQ REGULER');
      const cleanRoom =
        inc.ruangan.trim() || (role === 'guru_tahfidz' ? 'RUANGAN TAHFIDZ' : 'RUANGAN KELAS');

      if (existingTeacher) {
        map.set(key, {
          ...existingTeacher,
          role,
          kelompokBTQ: cleanGroup,
          kelompokTahfidz: role === 'guru_tahfidz' ? cleanGroup : existingTeacher.kelompokTahfidz,
          ruangan: cleanRoom,
          kontak: inc.kontak?.trim() || existingTeacher.kontak
        });
        updated++;
      } else {
        map.set(key, {
          id: `tch-${role === 'guru_tahfidz' ? 'thf' : 'btq'}-${Date.now()}-${idx}`,
          nama: cleanName,
          role,
          kelompokBTQ: cleanGroup,
          kelompokTahfidz: role === 'guru_tahfidz' ? cleanGroup : undefined,
          ruangan: cleanRoom,
          kontak: inc.kontak?.trim() || undefined
        });
        added++;
      }
    });

    const result = Array.from(map.values()).sort((a, b) => {
      if (a.role !== b.role) return a.role.localeCompare(b.role);
      return a.nama.localeCompare(b.nama);
    });
    this.saveTeachers(result);
    return { added, updated, total: result.length, teachers: result };
  },

  /**
   * Dedicated batch import for Program Tahfidz students (separate format from Ngaji/BTQ).
   * Merges seamlessly with existing Ngaji student records and upgrades shared teachers into 1 unified account.
   */
  importTahfidzBatch(
    incoming: Array<{
      nisn: string;
      nama: string;
      gender: 'L' | 'P';
      kelas: string;
      halaqahTahfidz: string;
      pembimbingTahfidz: string;
      ruanganTahfidz: string;
      targetJuz: string;
      totalHafalan: string;
      hafalanTerakhir: string;
      kelancaran: 'Sangat Lancar (Mumtaz)' | 'Lancar (Jayyid Jiddan)' | 'Cukup (Jayyid)';
      catatan?: string;
    }>
  ): {
    added: number;
    merged: number;
    total: number;
    teachersCount: number;
    teachers: Teacher[];
    newTahfidzRecords: TahfidzRecord[];
  } {
    const existing = this.getStudents();
    const existingTahfidz = this.getTahfidz();
    const today = new Date().toISOString().slice(0, 10);

    let added = 0;
    let merged = 0;

    const studentMap = new Map<string, Student>();
    const nameToNisnMap = new Map<string, string>();

    existing.forEach(s => {
      studentMap.set(s.nisn, s);
      const norm = (s.nama || '').trim().toUpperCase().replace(/\s+/g, ' ');
      nameToNisnMap.set(norm, s.nisn);
    });

    const newTahfidzRecords: TahfidzRecord[] = [];

    incoming.forEach((inc, idx) => {
      const normName = (inc.nama || '').trim().toUpperCase().replace(/\s+/g, ' ');
      const existingNisn = studentMap.has(inc.nisn) ? inc.nisn : nameToNisnMap.get(normName);
      const existingStudent = existingNisn ? studentMap.get(existingNisn) : undefined;
      const targetNisn = existingStudent ? existingStudent.nisn : inc.nisn;

      if (existingStudent) {
        // Merge Tahfidz data into existing student WITHOUT overwriting their Ngaji kelasBTQ or pengajar
        const updatedStudent: Student = {
          ...existingStudent,
          isTahfidz: true,
          pembimbingTahfidz: inc.pembimbingTahfidz.toUpperCase(),
          halaqahTahfidz: inc.halaqahTahfidz,
          ruanganTahfidz: inc.ruanganTahfidz,
          targetJuz: inc.targetJuz || existingStudent.targetJuz || 'Juz 30',
          totalHafalan: inc.totalHafalan || existingStudent.totalHafalan || '1 Juz',
          hafalanTerakhir: inc.hafalanTerakhir || existingStudent.hafalanTerakhir || 'Setoran awal'
        };
        studentMap.set(existingStudent.nisn, updatedStudent);
        nameToNisnMap.set(normName, existingStudent.nisn);
        merged++;
      } else {
        const newStudent: Student = {
          id: `std-tahfidz-${Date.now()}-${idx}`,
          nisn: inc.nisn,
          nama: normName,
          gender: inc.gender,
          kelas: inc.kelas,
          kelasBTQ: '-',
          pengajar: '-',
          ruangan: '-',
          waliKelas: '-',
          isTahfidz: true,
          pembimbingTahfidz: inc.pembimbingTahfidz.toUpperCase(),
          halaqahTahfidz: inc.halaqahTahfidz,
          ruanganTahfidz: inc.ruanganTahfidz,
          targetJuz: inc.targetJuz || 'Juz 30',
          totalHafalan: inc.totalHafalan || '0 Juz',
          hafalanTerakhir: inc.hafalanTerakhir || 'Setoran awal',
          capaianTerakhir: {
            tingkat: inc.halaqahTahfidz || 'Program Tahfidz',
            halamanAyat: inc.hafalanTerakhir || '-',
            tanggal: today,
            nilai: 'A'
          },
          ujian: {
            tanggal: today,
            jenis: 'Munaqosyah Tahfidz',
            nilai: inc.kelancaran.includes('Mumtaz') ? 92 : inc.kelancaran.includes('Jayyid Jiddan') ? 85 : 78,
            predikat: inc.kelancaran.includes('Mumtaz') ? 'MUMTAZ' : 'JAYYID',
            natijah: 'Lulus Program Tahfidz',
            kelulusan: 'Aktif Halaqah Tahfidz',
            keterangan: inc.catatan || 'Import data program tahfidz'
          },
          kehadiranPersen: 100
        };
        studentMap.set(inc.nisn, newStudent);
        nameToNisnMap.set(normName, inc.nisn);
        added++;
      }

      // Add initial TahfidzRecord if hafalanTerakhir is specified
      if (inc.hafalanTerakhir && inc.hafalanTerakhir !== '-') {
        const parts = inc.hafalanTerakhir.split(':');
        newTahfidzRecords.push({
          id: `t-imp-${Date.now()}-${idx}-${targetNisn}`,
          nisn: targetNisn,
          tanggal: today,
          surat: (parts[0] || inc.hafalanTerakhir).trim(),
          ayat: (parts[1] || 'Ayat 1-10').trim(),
          status: 'Ziyadah',
          kelancaran: inc.kelancaran,
          guru: inc.pembimbingTahfidz.toUpperCase(),
          catatan: inc.catatan || 'Data awal program tahfidz'
        });
      }
    });

    const result = Array.from(studentMap.values());
    this.saveStudents(result);
    if (newTahfidzRecords.length > 0) {
      this.saveTahfidz([...newTahfidzRecords, ...existingTahfidz]);
    }

    // Automatically sync & merge teachers (e.g., Guru Ngaji + Tahfidz becomes 1 unified account)
    const syncedTeachers = this.syncTeachersFromStudents(false);

    return {
      added,
      merged,
      total: result.length,
      teachersCount: syncedTeachers.total,
      teachers: syncedTeachers.teachers,
      newTahfidzRecords
    };
  },

  /**
   * Saves batch reading evaluations and updates attendance in real-time (upserting per nisn + tanggal).
   */
  saveBatchBacaanEvaluations(
    evaluations: Array<{
      nisn: string;
      tanggal: string;
      tipe: 'Tilawati Remaja' | "Al-Qur'an";
      jilid: string;
      halaman: string;
      nilai: 'A' | 'B' | 'C';
      catatan?: string;
      statusPresensi?: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa';
    }>,
    pengajar: string
  ): { savedCount: number } {
    if (evaluations.length === 0) return { savedCount: 0 };

    const students = this.getStudents();
    const bacaanList = [...this.getBacaan()];
    const absensiList = [...this.getAbsensi()];

    evaluations.forEach((item, idx) => {
      // 1. Upsert Bacaan record for (nisn, tanggal)
      const existingBacaanIdx = bacaanList.findIndex(
        b => b.nisn === item.nisn && b.tanggal === item.tanggal
      );
      const recordData: BacaanRecord = {
        id:
          existingBacaanIdx !== -1
            ? bacaanList[existingBacaanIdx].id
            : `b-${item.nisn}-${item.tanggal}`,
        nisn: item.nisn,
        tanggal: item.tanggal,
        tipe: item.tipe,
        jilid: item.jilid,
        halaman: item.halaman,
        nilai: item.nilai,
        catatan: item.catatan || "Mutaba'ah harian kelompok",
        pengajar
      };

      if (existingBacaanIdx !== -1) {
        bacaanList[existingBacaanIdx] = recordData;
      } else {
        bacaanList.unshift(recordData);
      }

      // 2. Upsert Absensi record if provided
      if (item.statusPresensi) {
        const existingAbsIdx = absensiList.findIndex(
          a => a.nisn === item.nisn && a.tanggal === item.tanggal && a.sesi === 'btq'
        );
        const absData: AbsensiRecord = {
          id:
            existingAbsIdx !== -1
              ? absensiList[existingAbsIdx].id
              : `${item.nisn}_${item.tanggal}_btq`,
          nisn: item.nisn,
          tanggal: item.tanggal,
          sesi: 'btq',
          status: item.statusPresensi,
          keterangan: `Sesi BTQ ${item.tipe}`
        };

        if (existingAbsIdx !== -1) {
          absensiList[existingAbsIdx] = absData;
        } else {
          absensiList.unshift(absData);
        }
      }

      // 3. Update Student's capaianTerakhir & kehadiranPersen
      const sIdx = students.findIndex(s => s.nisn === item.nisn);
      if (sIdx !== -1) {
        students[sIdx].capaianTerakhir = {
          tingkat: `${item.tipe} ${item.jilid}`.trim(),
          halamanAyat: item.halaman,
          tanggal: item.tanggal,
          nilai: item.nilai
        };
        const studentAbs = absensiList.filter(a => a.nisn === item.nisn);
        if (studentAbs.length > 0) {
          const hadirCount = studentAbs.filter(a => a.status === 'Hadir').length;
          students[sIdx].kehadiranPersen = Math.round((hadirCount / studentAbs.length) * 100);
        }
      }
    });

    this.saveStudents(students);
    this.saveBacaan(bacaanList);
    this.saveAbsensi(absensiList);

    return { savedCount: evaluations.length };
  },

  /**
   * Updates a single student's evaluation in real time directly from table input (upserts per nisn + tanggal).
   */
  updateSingleStudentEvaluation(
    item: {
      nisn: string;
      tanggal: string;
      tipe: 'Tilawati Remaja' | "Al-Qur'an";
      jilid: string;
      halaman: string;
      nilai: 'A' | 'B' | 'C';
      catatan?: string;
      statusPresensi?: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa';
    },
    pengajar: string
  ): void {
    this.saveBatchBacaanEvaluations([item], pengajar);
  },

  getRaporSettings(): RaporSettings {
    const defaults: RaporSettings = {
      tahunAjaran: '2026/2027',
      semester: 'Ganjil',
      tanggalRapor: new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }),
      kepalaSekolah: 'Ustadzah Dra. Ida Indahwati Waliulu',
      nbmKepala: 'NBM. 883.219',
      koordinator: 'Ustadz Khoirul Anwar, S.Ag'
    };
    try {
      const raw = localStorage.getItem(KEY_RAPOR_SETTINGS);
      if (raw) {
        return { ...defaults, ...JSON.parse(raw) };
      }
    } catch {
      // ignore
    }
    return defaults;
  },

  saveRaporSettings(settings: RaporSettings): void {
    try {
      localStorage.setItem(KEY_RAPOR_SETTINGS, JSON.stringify(settings));
    } catch {
      // ignore
    }
  },

  getRaporPrintStatuses(): Record<string, RaporPrintStatus> {
    try {
      const raw = localStorage.getItem(KEY_RAPOR_STATUS);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return {};
  },

  saveRaporPrintStatuses(map: Record<string, RaporPrintStatus>): void {
    try {
      localStorage.setItem(KEY_RAPOR_STATUS, JSON.stringify(map));
    } catch {
      // ignore
    }
  },

  getRaporPrintLogs(): RaporPrintBatchLog[] {
    try {
      const raw = localStorage.getItem(KEY_RAPOR_LOGS);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return [];
  },

  saveRaporPrintLogs(logs: RaporPrintBatchLog[]): void {
    try {
      localStorage.setItem(KEY_RAPOR_LOGS, JSON.stringify(logs));
    } catch {
      // ignore
    }
  },

  recordRaporPrintBatch(params: {
    students: Student[];
    printedBy: string;
    kelasLabel: string;
    jenisCetak: RaporPrintBatchLog['jenisCetak'];
    semester: string;
    tahunAjaran: string;
  }): { updatedStatuses: RaporPrintStatus[]; newLog: RaporPrintBatchLog } {
    const nowIso = new Date().toISOString();
    const statuses = this.getRaporPrintStatuses();
    const updatedStatuses: RaporPrintStatus[] = [];

    if (
      params.jenisCetak !== 'Rekapitulasi Nilai Kelas' &&
      params.jenisCetak !== 'Download Rekap Nilai (PDF)'
    ) {
      params.students.forEach(s => {
        const prev = statuses[s.nisn];
        const nextStatus: RaporPrintStatus = {
          nisn: s.nisn,
          printCount: (prev?.printCount || 0) + 1,
          lastPrintedAt: nowIso,
          lastPrintedBy: params.printedBy,
          semester: params.semester,
          tahunAjaran: params.tahunAjaran
        };
        statuses[s.nisn] = nextStatus;
        updatedStatuses.push(nextStatus);
      });
      this.saveRaporPrintStatuses(statuses);
    }

    const logs = this.getRaporPrintLogs();
    const newLog: RaporPrintBatchLog = {
      id: `rapor-log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      printedAt: nowIso,
      printedBy: params.printedBy,
      kelasLabel: params.kelasLabel,
      jenisCetak: params.jenisCetak,
      totalRapor: params.students.length,
      semester: params.semester,
      tahunAjaran: params.tahunAjaran,
      nisnList: params.students.map(s => s.nisn)
    };
    this.saveRaporPrintLogs([newLog, ...logs].slice(0, 100));
    return { updatedStatuses, newLog };
  },

  resetStudentRaporStatus(nisn: string): void {
    const statuses = this.getRaporPrintStatuses();
    if (statuses[nisn]) {
      delete statuses[nisn];
      this.saveRaporPrintStatuses(statuses);
    }
  },

  resetAllRaporStatuses(): void {
    this.saveRaporPrintStatuses({});
  },

  ensurePortalCleanedOnce(): boolean {
    try {
      if (localStorage.getItem(KEY_PORTAL_CLEANED_V2) !== '1') {
        this.clearAllData();
        localStorage.removeItem('spemda_students_v3');
        localStorage.removeItem('spemda_teachers_v1');
        localStorage.removeItem('spemda_bacaan_v3');
        localStorage.removeItem('spemda_tahfidz_v3');
        localStorage.removeItem('spemda_absensi_v3');
        localStorage.setItem(KEY_PORTAL_CLEANED_V2, '1');
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  },

  clearAllData(): void {
    localStorage.setItem(KEY_STUDENTS, JSON.stringify([]));
    localStorage.setItem(KEY_TEACHERS, JSON.stringify([]));
    localStorage.setItem(KEY_BACAAN, JSON.stringify([]));
    localStorage.setItem(KEY_TAHFIDZ, JSON.stringify([]));
    localStorage.setItem(KEY_ABSENSI, JSON.stringify([]));
    localStorage.setItem(KEY_RAPOR_STATUS, JSON.stringify({}));
    localStorage.setItem(KEY_RAPOR_LOGS, JSON.stringify([]));
  },

  resetAll(): void {
    this.clearAllData();
  }
};
