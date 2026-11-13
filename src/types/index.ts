export type Role = 'admin' | 'guru_ngaji' | 'guru_tahfidz' | 'wali_kelas';

export interface UserSession {
  accountId: string;
  username: string;
  role: Role;
  nama: string;
  assignedGroup?: string; // For guru_ngaji (e.g., "AL-QUR'AN PI D" or "UMI KULSUM")
  assignedClass?: string; // For wali_kelas (e.g., "7D" or "7A")
  isDefaultPassword?: boolean;
  loginAt: number;
}

export interface UserAccount {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  role: Role;
  nama: string;
  teacherId?: string;
  assignedGroup?: string;
  assignedClass?: string;
  isActive: boolean;
  isDefaultPassword: boolean;
  failedAttempts: number;
  lockedUntil?: number;
  lastLogin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthLogEntry {
  id: string;
  timestamp: string;
  username: string;
  nama?: string;
  role?: Role;
  event: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'ACCOUNT_LOCKED' | 'PASSWORD_CHANGED' | 'PASSWORD_RESET' | 'ACCOUNT_CREATED';
  detail: string;
}

export interface Teacher {
  id: string;
  nama: string;
  role: 'guru_ngaji' | 'guru_tahfidz';
  kelompokBTQ: string;
  ruangan: string;
  kontak?: string;
}

export interface UjianRecord {
  tanggal?: string;
  jenis?: string; // e.g. "Tes Kenaikan Jilid", "Munaqosyah Tilawati", "Tasmi Juz 30"
  nilai: number; // 0 - 100
  predikat: 'MUMTAZ' | 'JAYYID' | 'MAQBUL' | 'ROSHIB' | 'A' | 'B' | 'C' | 'D';
  natijah: string; // e.g. "MUMTAZ", "Tetap Jilid 4", "Naik ke Jilid 5", "Lulus Khatam"
  kelulusan?: string;
  keterangan?: string; // e.g. "Lancar makhraj dan tartil", "Perhatikan mad thabi'i"
}

export interface Student {
  id: string;
  nisn: string;
  nama: string;
  gender: 'L' | 'P';
  kelas: string; // e.g. "7D", "7A", "8E", "9G"
  kelasBTQ: string; // e.g. "AL-QUR'AN PI D", "TILAWATI 4 PI", "TILAWATI 3 PA", "QUR'AN PA"
  pengajar: string; // e.g. "UMI KULSUM", "TAUFIQURRAHMAN S.PD", "USTADZ RIDWAN S.PD.I"
  ruangan: string; // e.g. "RUANGAN 7E", "RUANGAN 7A", "LAB PAI"
  waliKelas: string; // e.g. "USTADZAH NURUL M.PD"
  isTahfidz: boolean;
  targetJuz?: string; // e.g. "Juz 30 & 29"
  totalHafalan?: string; // e.g. "2 Juz (Juz 30 & 29)"
  hafalanTerakhir?: string; // e.g. "QS. Al-Mulk: 1-15"
  capaianTerakhir: {
    tingkat: string; // e.g. "Tilawati Remaja Jilid 4", "Al-Qur'an Juz 15"
    halamanAyat: string; // e.g. "Hal. 18", "Ayat 1-20"
    tanggal: string;
    nilai: 'A' | 'B' | 'C';
  };
  ujian: UjianRecord;
  kehadiranPersen?: number;
}

export interface BacaanRecord {
  id: string;
  nisn: string;
  tanggal: string;
  tipe: 'Tilawati Remaja' | 'Al-Qur\'an';
  jilid: string; // e.g. "Jilid 4" or "Juz 15"
  halaman: string; // e.g. "Hal. 18" or "Ayat 1-20"
  nilai: 'A' | 'B' | 'C';
  catatan?: string;
  pengajar: string;
}

export interface TahfidzRecord {
  id: string;
  nisn: string;
  tanggal: string;
  surat: string; // e.g. "QS. Al-Mulk"
  ayat: string; // e.g. "Ayat 1-15"
  status: 'Ziyadah' | 'Muroja\'ah' | 'Mutqin';
  kelancaran: 'Sangat Lancar (Mumtaz)' | 'Lancar (Jayyid Jiddan)' | 'Cukup (Jayyid)';
  guru: string;
  catatan?: string;
}

export interface AbsensiRecord {
  id: string;
  nisn: string;
  tanggal: string;
  sesi: 'btq' | 'tahfidz';
  status: 'Hadir' | 'Sakit' | 'Izin' | 'Alpa';
  keterangan?: string;
}
