import { Student, BacaanRecord, TahfidzRecord, AbsensiRecord, UjianRecord, Teacher } from '../types';
import { INITIAL_STUDENTS, INITIAL_BACAAN, INITIAL_TAHFIDZ, INITIAL_ABSENSI, INITIAL_TEACHERS } from '../data/initialData';

const KEY_STUDENTS = 'spemda_students_v3';
const KEY_TEACHERS = 'spemda_teachers_v1';
const KEY_BACAAN = 'spemda_bacaan_v3';
const KEY_TAHFIDZ = 'spemda_tahfidz_v3';
const KEY_ABSENSI = 'spemda_absensi_v3';

export const storage = {
  getStudents(): Student[] {
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
    const list = this.getAbsensi();
    const newRecords: AbsensiRecord[] = nisnList.map(nisn => ({
      id: 'abs-' + Date.now() + '-' + nisn,
      nisn,
      tanggal,
      sesi,
      status: 'Hadir'
    }));
    this.saveAbsensi([...newRecords, ...list]);
  },

  addStudent(student: Omit<Student, 'id'>): Student {
    const students = this.getStudents();
    const newStudent: Student = {
      ...student,
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
      students[idx] = {
        ...students[idx],
        ...updatedData
      };
      this.saveStudents(students);
    }
  },

  getTeachers(): Teacher[] {
    try {
      const data = localStorage.getItem(KEY_TEACHERS);
      if (data) {
        const parsed: Teacher[] = JSON.parse(data);
        if (parsed.length > 0) return parsed;
      }
    } catch {
      // fallback
    }

    // Auto-sync teachers directly from current student dataset
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
   * Syncs real teachers directly from the current student dataset (imported from template).
   * Purges sample teachers that do not exist in the student records if replaceOld is true.
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
    existingTeachers.forEach(t => existingMap.set(t.nama.trim().toUpperCase(), t));

    // Aggregate teachers from student records
    const teacherDataMap = new Map<string, {
      nama: string;
      kelasBTQSet: Set<string>;
      ruanganSet: Set<string>;
      hasTahfidz: boolean;
      hasNonTahfidz: boolean;
      studentCount: number;
    }>();

    students.forEach(s => {
      const rawName = (s.pengajar || '').trim();
      if (!rawName || rawName === '-' || rawName.toLowerCase() === 'belum ada') return;
      const key = rawName.toUpperCase();

      if (!teacherDataMap.has(key)) {
        teacherDataMap.set(key, {
          nama: rawName.toUpperCase(),
          kelasBTQSet: new Set<string>(),
          ruanganSet: new Set<string>(),
          hasTahfidz: false,
          hasNonTahfidz: false,
          studentCount: 0
        });
      }

      const tData = teacherDataMap.get(key)!;
      tData.studentCount++;
      if (s.kelasBTQ && s.kelasBTQ.trim() && s.kelasBTQ !== '-') {
        tData.kelasBTQSet.add(s.kelasBTQ.trim());
      }
      if (s.ruangan && s.ruangan.trim() && s.ruangan !== '-') {
        tData.ruanganSet.add(s.ruangan.trim());
      }
      if (s.isTahfidz) {
        tData.hasTahfidz = true;
      } else {
        tData.hasNonTahfidz = true;
      }
    });

    // Check tahfidz records
    const tahfidzRecords = this.getTahfidz();
    tahfidzRecords.forEach(r => {
      if (r.guru && r.guru.trim() && r.guru !== '-') {
        const key = r.guru.trim().toUpperCase();
        if (!teacherDataMap.has(key)) {
          teacherDataMap.set(key, {
            nama: key,
            kelasBTQSet: new Set<string>(['HALAQAH TAHFIDZ']),
            ruanganSet: new Set<string>(['MASJID AL-IKHLAS']),
            hasTahfidz: true,
            hasNonTahfidz: false,
            studentCount: 1
          });
        } else {
          teacherDataMap.get(key)!.hasTahfidz = true;
        }
      }
    });

    const syncedTeachers: Teacher[] = [];
    let counter = 1;

    teacherDataMap.forEach((data, key) => {
      const existing = existingMap.get(key);

      // Identify role
      const isTahfidzRole =
        (data.hasTahfidz && !data.hasNonTahfidz) ||
        key.includes('HAFIDZ') ||
        key.includes('TAHFIDZ') ||
        (existing && existing.role === 'guru_tahfidz');

      const role: 'guru_ngaji' | 'guru_tahfidz' = isTahfidzRole ? 'guru_tahfidz' : 'guru_ngaji';

      const kelompokArr = Array.from(data.kelasBTQSet);
      const ruanganArr = Array.from(data.ruanganSet);

      const kelompokBTQ = kelompokArr.length > 0
        ? kelompokArr.slice(0, 3).join(' & ')
        : (existing?.kelompokBTQ || (role === 'guru_tahfidz' ? 'HALAQAH TAHFIDZ' : 'BTQ REGULER'));

      const ruangan = ruanganArr.length > 0
        ? ruanganArr.slice(0, 2).join(' / ')
        : (existing?.ruangan || 'RUANGAN KELAS');

      syncedTeachers.push({
        id: existing?.id || `tch-${Date.now()}-${counter++}`,
        nama: data.nama,
        role,
        kelompokBTQ,
        ruangan,
        kontak: existing?.kontak || undefined
      });
    });

    // Sort by role then name
    syncedTeachers.sort((a, b) => {
      if (a.role !== b.role) return a.role === 'guru_ngaji' ? -1 : 1;
      return a.nama.localeCompare(b.nama);
    });

    if (replaceOld || existingTeachers.length === 0) {
      this.saveTeachers(syncedTeachers);
      return { total: syncedTeachers.length, teachers: syncedTeachers };
    } else {
      // Keep any manually added teachers that might not have students yet
      const finalTeachers = [...syncedTeachers];
      existingTeachers.forEach(et => {
        if (!syncedTeachers.some(st => st.nama.toUpperCase() === et.nama.toUpperCase())) {
          finalTeachers.push(et);
        }
      });
      this.saveTeachers(finalTeachers);
      return { total: finalTeachers.length, teachers: finalTeachers };
    }
  },

  /**
   * Deduplicates all student records in the database so each student name exists exactly once.
   * If there are duplicate student entries with the same name (case-insensitive, trimmed, normalized spaces),
   * merges and keeps the most complete record, deleting all duplicate rows.
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
        // Merge attributes to retain the best data
        const merged: Student = { ...existing };

        // Retain non-empty fields
        if (!merged.nisn || merged.nisn === '-' || merged.nisn.length < 5) {
          if (student.nisn && student.nisn !== '-') merged.nisn = student.nisn;
        }
        if (student.isTahfidz) merged.isTahfidz = true;
        if (student.targetJuz && (!merged.targetJuz || merged.targetJuz === '-')) {
          merged.targetJuz = student.targetJuz;
        }
        if (student.totalHafalan && (!merged.totalHafalan || merged.totalHafalan === '0 Juz')) {
          merged.totalHafalan = student.totalHafalan;
        }
        if (student.hafalanTerakhir && (!merged.hafalanTerakhir || merged.hafalanTerakhir === '-')) {
          merged.hafalanTerakhir = student.hafalanTerakhir;
        }

        // Keep the higher exam grade if available
        if ((student.ujian?.nilai || 0) > (merged.ujian?.nilai || 0)) {
          merged.ujian = student.ujian;
        }

        // Keep the latest reading progress
        if (student.capaianTerakhir?.tanggal &&
            (!merged.capaianTerakhir?.tanggal || student.capaianTerakhir.tanggal >= merged.capaianTerakhir.tanggal)) {
          merged.capaianTerakhir = student.capaianTerakhir;
        }

        // Keep the higher attendance
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
      this.syncTeachersFromStudents(true);
    }

    return {
      removedCount,
      originalCount,
      uniqueCount: uniqueStudents.length
    };
  },

  importStudentsBatch(incoming: Omit<Student, 'id'>[]): { added: number; updated: number; total: number; teachersCount: number } {
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

    incoming.forEach((inc, idx) => {
      const normName = (inc.nama || '').trim().toUpperCase().replace(/\s+/g, ' ');
      const existingNisn = studentMap.has(inc.nisn) ? inc.nisn : nameToNisnMap.get(normName);

      const existingStudent = existingNisn ? studentMap.get(existingNisn) : undefined;
      if (existingStudent) {
        // Update existing record
        const updatedStudent: Student = {
          ...existingStudent,
          ...inc,
          id: existingStudent.id,
          nisn: existingStudent.nisn
        };
        studentMap.set(existingStudent.nisn, updatedStudent);
        nameToNisnMap.set(normName, existingStudent.nisn);
        updated++;
      } else {
        // Add new record
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

    // Automatically sync teachers from the newly imported dataset and purge old sample teachers
    const syncedTeachers = this.syncTeachersFromStudents(true);

    return { added, updated, total: result.length, teachersCount: syncedTeachers.total };
  },

  /**
   * Saves batch reading evaluations and updates attendance in real-time.
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
    const bacaanList = this.getBacaan();
    const absensiList = this.getAbsensi();

    const newBacaanRecords: BacaanRecord[] = [];
    const newAbsensiRecords: AbsensiRecord[] = [];

    evaluations.forEach((item, idx) => {
      // 1. Add Bacaan record
      newBacaanRecords.push({
        id: `b-${Date.now()}-${idx}-${item.nisn}`,
        nisn: item.nisn,
        tanggal: item.tanggal,
        tipe: item.tipe,
        jilid: item.jilid,
        halaman: item.halaman,
        nilai: item.nilai,
        catatan: item.catatan || 'Mutaba\'ah harian kelompok',
        pengajar
      });

      // 2. Update Student's capaianTerakhir
      const sIdx = students.findIndex(s => s.nisn === item.nisn);
      if (sIdx !== -1) {
        students[sIdx].capaianTerakhir = {
          tingkat: `${item.tipe} ${item.jilid}`.trim(),
          halamanAyat: item.halaman,
          tanggal: item.tanggal,
          nilai: item.nilai
        };
      }

      // 3. Add or update Absensi record if provided
      if (item.statusPresensi) {
        newAbsensiRecords.push({
          id: `abs-${Date.now()}-${idx}-${item.nisn}`,
          nisn: item.nisn,
          tanggal: item.tanggal,
          sesi: 'btq',
          status: item.statusPresensi,
          keterangan: `Sesi BTQ ${item.tipe}`
        });
      }
    });

    this.saveStudents(students);
    this.saveBacaan([...newBacaanRecords, ...bacaanList]);
    if (newAbsensiRecords.length > 0) {
      this.saveAbsensi([...newAbsensiRecords, ...absensiList]);
    }

    return { savedCount: evaluations.length };
  },

  /**
   * Updates a single student's evaluation in real time directly from table input.
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
    const students = this.getStudents();
    const sIdx = students.findIndex(s => s.nisn === item.nisn);
    if (sIdx !== -1) {
      students[sIdx].capaianTerakhir = {
        tingkat: `${item.tipe} ${item.jilid}`.trim(),
        halamanAyat: item.halaman,
        tanggal: item.tanggal,
        nilai: item.nilai
      };
      this.saveStudents(students);
    }

    // Add reading record
    const bacaanList = this.getBacaan();
    const newRecord: BacaanRecord = {
      id: `b-${Date.now()}-${item.nisn}`,
      nisn: item.nisn,
      tanggal: item.tanggal,
      tipe: item.tipe,
      jilid: item.jilid,
      halaman: item.halaman,
      nilai: item.nilai,
      catatan: item.catatan || 'Penilaian mutaba\'ah tabel real-time',
      pengajar
    };
    this.saveBacaan([newRecord, ...bacaanList]);

    // Record attendance if provided
    if (item.statusPresensi) {
      const absensiList = this.getAbsensi();
      const newAbs: AbsensiRecord = {
        id: `abs-${Date.now()}-${item.nisn}`,
        nisn: item.nisn,
        tanggal: item.tanggal,
        sesi: 'btq',
        status: item.statusPresensi
      };
      this.saveAbsensi([newAbs, ...absensiList]);
    }
  },

  resetAll(): void {
    localStorage.setItem(KEY_STUDENTS, JSON.stringify(INITIAL_STUDENTS));
    localStorage.setItem(KEY_TEACHERS, JSON.stringify(INITIAL_TEACHERS));
    localStorage.setItem(KEY_BACAAN, JSON.stringify(INITIAL_BACAAN));
    localStorage.setItem(KEY_TAHFIDZ, JSON.stringify(INITIAL_TAHFIDZ));
    localStorage.setItem(KEY_ABSENSI, JSON.stringify(INITIAL_ABSENSI));
    this.syncTeachersFromStudents(true);
  }
};
