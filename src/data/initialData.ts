import { Student, BacaanRecord, TahfidzRecord, AbsensiRecord, Teacher } from '../types';

export const INITIAL_STUDENTS: Student[] = [
  // --- KELAS 7D PUTRI ---
  {
    id: 'std-7d-01',
    nisn: '0082600001',
    nama: 'ADARAZAHRA AALEYAH RIFFANI',
    gender: 'P',
    kelas: '7D',
    kelasBTQ: "AL-QUR'AN PI D",
    pengajar: 'UMI KULSUM',
    ruangan: 'RUANGAN 7E',
    waliKelas: 'USTADZAH NURUL M.PD',
    isTahfidz: true,
    targetJuz: 'Juz 30 & 29',
    totalHafalan: '2 Juz (Juz 30 & 29)',
    hafalanTerakhir: 'QS. Al-Mulk: 1-30',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 15",
      halamanAyat: 'QS. Al-Isra: 1-25',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan BTQ Munaqosyah',
      nilai: 93,
      predikat: 'MUMTAZ',
      natijah: 'MUMTAZ',
      kelulusan: 'Lulus Kenaikan Tingkat',
      keterangan: 'Lancar makhraj dan tartil sangat baik'
    },
    kehadiranPersen: 100
  },
  {
    id: 'std-7d-02',
    nisn: '0082600002',
    nama: 'ADILNA FIRZANAH',
    gender: 'P',
    kelas: '7D',
    kelasBTQ: 'TILAWATI 4 PI',
    pengajar: 'TAUFIQURRAHMAN S.PD',
    ruangan: 'RUANGAN 7E',
    waliKelas: 'USTADZAH NURUL M.PD',
    isTahfidz: false,
    totalHafalan: '0 Juz',
    hafalanTerakhir: '-',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 4',
      halamanAyat: 'Halaman 12',
      tanggal: '2026-03-28',
      nilai: 'B'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan Jilid Tilawati',
      nilai: 72,
      predikat: 'B',
      natijah: 'Tetap Jilid 4',
      kelulusan: 'Mengulang / Penguatan',
      keterangan: 'Belum Lancar mad thabi\'i dan dengung ghunnah'
    },
    kehadiranPersen: 95
  },
  {
    id: 'std-7d-03',
    nisn: '0082600003',
    nama: 'AFIQAH IZZATI SYAHIDAH',
    gender: 'P',
    kelas: '7D',
    kelasBTQ: "AL-QUR'AN PI D",
    pengajar: 'UMI KULSUM',
    ruangan: 'RUANGAN 7E',
    waliKelas: 'USTADZAH NURUL M.PD',
    isTahfidz: true,
    targetJuz: 'Juz 30',
    totalHafalan: '1 Juz (Juz 30)',
    hafalanTerakhir: 'QS. An-Naba: 1-40',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 12",
      halamanAyat: 'QS. Yusuf: 1-30',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan BTQ Munaqosyah',
      nilai: 87,
      predikat: 'MUMTAZ',
      natijah: 'MUMTAZ',
      kelulusan: 'Lulus Kenaikan Tingkat',
      keterangan: 'Lancar dan tartil'
    },
    kehadiranPersen: 98
  },
  {
    id: 'std-7d-04',
    nisn: '0082600004',
    nama: 'AINAYYA FATHIYATUL IZZA',
    gender: 'P',
    kelas: '7D',
    kelasBTQ: "AL-QUR'AN PI D",
    pengajar: 'UMI KULSUM',
    ruangan: 'RUANGAN 7E',
    waliKelas: 'USTADZAH NURUL M.PD',
    isTahfidz: true,
    targetJuz: 'Juz 30',
    totalHafalan: '1 Juz (Juz 30)',
    hafalanTerakhir: 'QS. Al-Insyiqaq: 1-25',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 10",
      halamanAyat: 'QS. At-Taubah: 20-40',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan BTQ Munaqosyah',
      nilai: 89,
      predikat: 'MUMTAZ',
      natijah: 'MUMTAZ',
      kelulusan: 'Lulus Kenaikan Tingkat',
      keterangan: 'Makhraj huruf fashih dan waqaf tepat'
    },
    kehadiranPersen: 100
  },
  {
    id: 'std-7d-05',
    nisn: '0082600005',
    nama: 'ALYA RAHMAH SYARIF',
    gender: 'P',
    kelas: '7D',
    kelasBTQ: 'TILAWATI 3 PI',
    pengajar: 'NUR LAILI',
    ruangan: 'RUANGAN 7D',
    waliKelas: 'USTADZAH NURUL M.PD',
    isTahfidz: false,
    totalHafalan: '0 Juz',
    hafalanTerakhir: '-',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 3',
      halamanAyat: 'Halaman 24',
      tanggal: '2026-03-28',
      nilai: 'B'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan Jilid Tilawati',
      nilai: 78,
      predikat: 'JAYYID',
      natijah: 'Naik ke Jilid 4',
      kelulusan: 'Lulus Naik Tingkat',
      keterangan: 'Lancar, perhatikan makhraj huruf '
    },
    kehadiranPersen: 96
  },
  {
    id: 'std-7d-06',
    nisn: '0082600006',
    nama: 'ANINDYA PUTRI MAHARANI',
    gender: 'P',
    kelas: '7D',
    kelasBTQ: 'TILAWATI 4 PI',
    pengajar: 'TAUFIQURRAHMAN S.PD',
    ruangan: 'RUANGAN 7E',
    waliKelas: 'USTADZAH NURUL M.PD',
    isTahfidz: false,
    totalHafalan: '0 Juz',
    hafalanTerakhir: '-',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 4',
      halamanAyat: 'Halaman 30',
      tanggal: '2026-03-27',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan Jilid Tilawati',
      nilai: 80,
      predikat: 'JAYYID',
      natijah: 'Naik ke Jilid 5',
      kelulusan: 'Lulus Naik Tingkat',
      keterangan: 'Bacaan baik dan tartil'
    },
    kehadiranPersen: 94
  },
  {
    id: 'std-7d-07',
    nisn: '0082600007',
    nama: 'AISYAH PUTRI RAMADHANI',
    gender: 'P',
    kelas: '7D',
    kelasBTQ: "AL-QUR'AN PI D",
    pengajar: 'UMI KULSUM',
    ruangan: 'RUANGAN 7E',
    waliKelas: 'USTADZAH NURUL M.PD',
    isTahfidz: true,
    targetJuz: 'Juz 30 & 29',
    totalHafalan: '2 Juz',
    hafalanTerakhir: 'QS. Al-Qalam: 1-52',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 18",
      halamanAyat: 'QS. Al-Mu\'minun: 1-40',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan BTQ Munaqosyah',
      nilai: 95,
      predikat: 'MUMTAZ',
      natijah: 'MUMTAZ',
      kelulusan: 'Lulus Mumtaz',
      keterangan: 'Tajwid sempurna dan hafalan mutqin'
    },
    kehadiranPersen: 100
  },

  // --- KELAS 7A PUTRA ---
  {
    id: 'std-7a-01',
    nisn: '0082600011',
    nama: 'ADITYA SYAM FIRDAUS',
    gender: 'L',
    kelas: '7A',
    kelasBTQ: 'TILAWATI 3 PA',
    pengajar: 'USTADZ RIDWAN S.PD.I',
    ruangan: 'RUANGAN 7A',
    waliKelas: 'USTADZ AHMAD DAHLAN S.PD',
    isTahfidz: false,
    totalHafalan: '0 Juz',
    hafalanTerakhir: '-',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 3',
      halamanAyat: 'Halaman 18',
      tanggal: '2026-03-28',
      nilai: 'B'
    },
    ujian: {
      tanggal: '2026-03-21',
      jenis: 'Tes Kenaikan Jilid Tilawati',
      nilai: 82,
      predikat: 'JAYYID',
      natijah: 'Naik ke Jilid 4',
      kelulusan: 'Lulus Naik Tingkat',
      keterangan: 'Lancar makharijul huruf'
    },
    kehadiranPersen: 96
  },
  {
    id: 'std-7a-02',
    nisn: '0082600012',
    nama: 'AHMAD FAUZAN PRATAMA',
    gender: 'L',
    kelas: '7A',
    kelasBTQ: 'TILAWATI 4 PA',
    pengajar: 'USTADZ RIDWAN S.PD.I',
    ruangan: 'RUANGAN 7A',
    waliKelas: 'USTADZ AHMAD DAHLAN S.PD',
    isTahfidz: true,
    targetJuz: 'Juz 30 & 29',
    totalHafalan: '2 Juz (Juz 30 & 29)',
    hafalanTerakhir: 'QS. Al-Mulk: 1-15',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 4',
      halamanAyat: 'Halaman 28',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-21',
      jenis: 'Tes Kenaikan Jilid Tilawati',
      nilai: 90,
      predikat: 'MUMTAZ',
      natijah: 'Naik ke Jilid 5',
      kelulusan: 'Lulus Mumtaz',
      keterangan: 'Fashahah dan suara tartil jelas'
    },
    kehadiranPersen: 100
  },
  {
    id: 'std-7a-03',
    nisn: '0082600013',
    nama: 'MUHAMMAD AZZAM IZZUDDIN',
    gender: 'L',
    kelas: '7A',
    kelasBTQ: 'TILAWATI 4 PA',
    pengajar: 'USTADZ RIDWAN S.PD.I',
    ruangan: 'RUANGAN 7A',
    waliKelas: 'USTADZ AHMAD DAHLAN S.PD',
    isTahfidz: true,
    targetJuz: 'Juz 30 & 29',
    totalHafalan: '2 Juz',
    hafalanTerakhir: 'QS. An-Naba: 1-40',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 4',
      halamanAyat: 'Halaman 25',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-21',
      jenis: 'Tes Kenaikan Jilid Tilawati',
      nilai: 91,
      predikat: 'MUMTAZ',
      natijah: 'Naik ke Jilid 5',
      kelulusan: 'Lulus Mumtaz',
      keterangan: 'Lancar dan mutqin dalam hafalan'
    },
    kehadiranPersen: 100
  },

  // --- KELAS 7E & 7F PUTRI ---
  {
    id: 'std-7e-01',
    nisn: '0082600021',
    nama: 'CALLISTA AULIA KHANZA',
    gender: 'P',
    kelas: '7E',
    kelasBTQ: "AL-QUR'AN PI E",
    pengajar: 'SITI FATIMAH S.PD.I',
    ruangan: 'RUANGAN 7F',
    waliKelas: 'USTADZAH FITRIYAH S.PD',
    isTahfidz: true,
    targetJuz: 'Juz 30 & 29',
    totalHafalan: '2 Juz',
    hafalanTerakhir: 'QS. Al-Haqqah: 1-30',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 8",
      halamanAyat: 'QS. Al-An\'am: 50-80',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan BTQ Munaqosyah',
      nilai: 92,
      predikat: 'MUMTAZ',
      natijah: 'MUMTAZ',
      kelulusan: 'Lulus Kenaikan Tingkat',
      keterangan: 'Lancar, tajwid dan waqaf tertib'
    },
    kehadiranPersen: 98
  },
  {
    id: 'std-7e-02',
    nisn: '0082600022',
    nama: 'DANISHA NAURA PUTRI',
    gender: 'P',
    kelas: '7E',
    kelasBTQ: 'TILAWATI 3 PI',
    pengajar: 'DEWI MASITOH',
    ruangan: 'RUANGAN 7E',
    waliKelas: 'USTADZAH FITRIYAH S.PD',
    isTahfidz: false,
    totalHafalan: '0 Juz',
    hafalanTerakhir: '-',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 3',
      halamanAyat: 'Halaman 20',
      tanggal: '2026-03-28',
      nilai: 'B'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan Jilid Tilawati',
      nilai: 76,
      predikat: 'JAYYID',
      natijah: 'Naik ke Jilid 4',
      kelulusan: 'Lulus Naik Tingkat',
      keterangan: 'Cukup lancar, perhatikan huruf isti\'la'
    },
    kehadiranPersen: 92
  },
  {
    id: 'std-7f-01',
    nisn: '0082600031',
    nama: 'DZAKIRA TALITA ZAHRA',
    gender: 'P',
    kelas: '7F',
    kelasBTQ: 'TILAWATI 2 PI',
    pengajar: 'DEWI MASITOH',
    ruangan: 'RUANGAN 7F',
    waliKelas: 'USTADZAH RETNO S.PD',
    isTahfidz: false,
    totalHafalan: '0 Juz',
    hafalanTerakhir: '-',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 2',
      halamanAyat: 'Halaman 15',
      tanggal: '2026-03-27',
      nilai: 'C'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan Jilid Tilawati',
      nilai: 70,
      predikat: 'MAQBUL',
      natijah: 'Tetap Jilid 2',
      kelulusan: 'Mengulang / Penguatan',
      keterangan: 'Perlu bimbingan membaca sambung dan harakat'
    },
    kehadiranPersen: 88
  },

  // --- KELAS 8 SANTRI PUTRI (8E, 8F, 8G) ---
  {
    id: 'std-8e-01',
    nisn: '0072500041',
    nama: 'HAFIZAH NAYLA AZ-ZAHRA',
    gender: 'P',
    kelas: '8E',
    kelasBTQ: "AL-QUR'AN PI 8",
    pengajar: 'SITI FATIMAH S.PD.I',
    ruangan: 'RUANGAN 8E',
    waliKelas: 'USTADZAH ENDANG S.PD',
    isTahfidz: true,
    targetJuz: '3 Juz (30, 29, 28)',
    totalHafalan: '3 Juz',
    hafalanTerakhir: 'QS. Al-Mujadilah: 1-22',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 20",
      halamanAyat: 'QS. An-Naml: 1-50',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-22',
      jenis: 'Tasmi Juz Tahfidz',
      nilai: 94,
      predikat: 'MUMTAZ',
      natijah: 'LULUS TASMI JUZ 29',
      kelulusan: 'Lulus Mutqin',
      keterangan: 'Sangat lancar tanpa ragu'
    },
    kehadiranPersen: 100
  },
  {
    id: 'std-8f-01',
    nisn: '0072500051',
    nama: 'KAYLA AZZAHRA PURNOMO',
    gender: 'P',
    kelas: '8F',
    kelasBTQ: 'TILAWATI 4 PI',
    pengajar: 'NUR LAILI',
    ruangan: 'RUANGAN 8F',
    waliKelas: 'USTADZAH DIAN S.PD',
    isTahfidz: false,
    totalHafalan: '0 Juz',
    hafalanTerakhir: '-',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 4',
      halamanAyat: 'Halaman 22',
      tanggal: '2026-03-28',
      nilai: 'B'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan Jilid Tilawati',
      nilai: 84,
      predikat: 'JAYYID',
      natijah: 'Naik ke Jilid 5',
      kelulusan: 'Lulus Naik Tingkat',
      keterangan: 'Lancar dan tertib'
    },
    kehadiranPersen: 96
  },
  {
    id: 'std-8g-01',
    nisn: '0072500061',
    nama: 'LABIBAH SALMA AZZAHRA',
    gender: 'P',
    kelas: '8G',
    kelasBTQ: "AL-QUR'AN PI 8",
    pengajar: 'UMI KULSUM',
    ruangan: 'RUANGAN 8G',
    waliKelas: 'USTADZAH SRI WAHYUNI S.PD',
    isTahfidz: true,
    targetJuz: 'Juz 30 & 29',
    totalHafalan: '2 Juz',
    hafalanTerakhir: 'QS. Al-Ma\'arij: 1-44',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 16",
      halamanAyat: 'QS. Al-Kahfi: 1-50',
      tanggal: '2026-03-27',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-22',
      jenis: 'Tes Kenaikan BTQ Munaqosyah',
      nilai: 90,
      predikat: 'MUMTAZ',
      natijah: 'MUMTAZ',
      kelulusan: 'Lulus Mumtaz',
      keterangan: 'Makhraj mantap dan hafalan kuat'
    },
    kehadiranPersen: 98
  },

  // --- KELAS 8 SANTRI PUTRA (8A, 8B, 8C, 8D) ---
  {
    id: 'std-8a-01',
    nisn: '0072500071',
    nama: 'FAHRI KHAIRUL ANAM',
    gender: 'L',
    kelas: '8A',
    kelasBTQ: 'TILAWATI 4 PA',
    pengajar: 'M. ROFIQ S.PD.I',
    ruangan: 'RUANGAN 8A',
    waliKelas: 'USTADZ BUDI SANTOSO M.PD',
    isTahfidz: true,
    targetJuz: 'Juz 30',
    totalHafalan: '1 Juz (Juz 30)',
    hafalanTerakhir: 'QS. At-Takwir: 1-29',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 4',
      halamanAyat: 'Halaman 35',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-21',
      jenis: 'Tes Kenaikan Jilid Tilawati',
      nilai: 86,
      predikat: 'MUMTAZ',
      natijah: 'Naik ke Jilid 5',
      kelulusan: 'Lulus Mumtaz',
      keterangan: 'Lancar dan tertib'
    },
    kehadiranPersen: 100
  },
  {
    id: 'std-8b-01',
    nisn: '0072500081',
    nama: 'FARHAN MAULANA AKBAR',
    gender: 'L',
    kelas: '8B',
    kelasBTQ: 'TILAWATI 5 PA',
    pengajar: 'MOH. AMINULLAH',
    ruangan: 'RUANGAN 8B',
    waliKelas: 'USTADZ BUDI SANTOSO M.PD',
    isTahfidz: true,
    targetJuz: '3 Juz (30, 29, 1)',
    totalHafalan: '3 Juz',
    hafalanTerakhir: 'QS. Al-Baqarah: 1-50',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 5',
      halamanAyat: 'Halaman 18',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-21',
      jenis: 'Tasmi Juz Tahfidz',
      nilai: 88,
      predikat: 'MUMTAZ',
      natijah: 'LULUS MUTQIN JUZ 29',
      kelulusan: 'Lulus Mutqin',
      keterangan: 'Lancar dan fashih'
    },
    kehadiranPersen: 96
  },
  {
    id: 'std-8c-01',
    nisn: '0072500091',
    nama: 'GALIH RAKHA PRASETYA',
    gender: 'L',
    kelas: '8C',
    kelasBTQ: "AL-QUR'AN PA 8",
    pengajar: 'DANIL FIRMANSYAH',
    ruangan: 'RUANGAN 8C',
    waliKelas: 'USTADZ SUBHAN S.PD',
    isTahfidz: false,
    totalHafalan: '0 Juz',
    hafalanTerakhir: '-',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 11",
      halamanAyat: 'QS. Yunus: 1-30',
      tanggal: '2026-03-27',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-21',
      jenis: 'Tes Kenaikan BTQ Munaqosyah',
      nilai: 85,
      predikat: 'MUMTAZ',
      natijah: 'MUMTAZ',
      kelulusan: 'Lulus Kenaikan Tingkat',
      keterangan: 'Tartil dan fashahah baik'
    },
    kehadiranPersen: 94
  },
  {
    id: 'std-8d-01',
    nisn: '0072500101',
    nama: 'HABIBIE ARKANANTA',
    gender: 'L',
    kelas: '8D',
    kelasBTQ: 'TILAWATI 5 PA',
    pengajar: 'MOH. AMINULLAH',
    ruangan: 'RUANGAN 8D',
    waliKelas: 'USTADZ SUBHAN S.PD',
    isTahfidz: true,
    targetJuz: 'Juz 30 & 29',
    totalHafalan: '2 Juz',
    hafalanTerakhir: 'QS. Nuh: 1-28',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 5',
      halamanAyat: 'Halaman 35',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-21',
      jenis: 'Tes Kenaikan Jilid Tilawati',
      nilai: 91,
      predikat: 'MUMTAZ',
      natijah: 'Naik ke Al-Qur\'an',
      kelulusan: 'Khatam Tilawati Remaja',
      keterangan: 'Siap masuk materi Ghorib dan Al-Qur\'an'
    },
    kehadiranPersen: 98
  },

  // --- KELAS 9 SANTRI PUTRI (9E, 9F, 9G) ---
  {
    id: 'std-9e-01',
    nisn: '0062400111',
    nama: 'MIKAYLA ALYA NURFADILAH',
    gender: 'P',
    kelas: '9E',
    kelasBTQ: 'KHATAM AL-QUR\'AN PI',
    pengajar: 'SITI FATIMAH S.PD.I',
    ruangan: 'RUANGAN 9E',
    waliKelas: 'USTADZAH HASANAH M.PD',
    isTahfidz: true,
    targetJuz: '5 Juz (30, 29, 28, 1, 2)',
    totalHafalan: '5 Juz',
    hafalanTerakhir: 'QS. Al-Baqarah: 142-200',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 30",
      halamanAyat: 'QS. An-Nas: 1-6 (Khatam)',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-25',
      jenis: 'Munaqosyah Khatam Al-Qur\'an',
      nilai: 96,
      predikat: 'MUMTAZ',
      natijah: 'KHATAM 30 JUZ & TASMI 5 JUZ',
      kelulusan: 'Lulus Wisuda Tahfidz',
      keterangan: 'Sangat membanggakan, siap wisuda munaqosyah'
    },
    kehadiranPersen: 100
  },
  {
    id: 'std-9f-01',
    nisn: '0062400121',
    nama: 'NAJWA KHAIRA WILDA',
    gender: 'P',
    kelas: '9F',
    kelasBTQ: "AL-QUR'AN PI 9",
    pengajar: 'UMI KULSUM',
    ruangan: 'RUANGAN 9F',
    waliKelas: 'USTADZAH HASANAH M.PD',
    isTahfidz: false,
    totalHafalan: '0 Juz',
    hafalanTerakhir: '-',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 25",
      halamanAyat: 'QS. Asy-Syura: 1-30',
      tanggal: '2026-03-27',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan BTQ Munaqosyah',
      nilai: 88,
      predikat: 'JAYYID',
      natijah: 'MUMTAZ',
      kelulusan: 'Lulus Kenaikan Tingkat',
      keterangan: 'Tartil dan fashahah teratur'
    },
    kehadiranPersen: 95
  },
  {
    id: 'std-9g-01',
    nisn: '0062400131',
    nama: 'ZAHRA SHAKILA RAMADHANI',
    gender: 'P',
    kelas: '9G',
    kelasBTQ: 'KHATAM AL-QUR\'AN PI',
    pengajar: 'UMI KULSUM',
    ruangan: 'RUANGAN 9G',
    waliKelas: 'USTADZAH HASANAH M.PD',
    isTahfidz: true,
    targetJuz: '4 Juz (30, 29, 28, 1)',
    totalHafalan: '4 Juz',
    hafalanTerakhir: 'QS. Al-Baqarah: 1-100',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 28",
      halamanAyat: 'QS. Al-Mumtahanah: 1-13',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-25',
      jenis: 'Munaqosyah Khatam Al-Qur\'an',
      nilai: 95,
      predikat: 'MUMTAZ',
      natijah: 'LULUS KHATAM TAHFIDZ',
      kelulusan: 'Lulus Wisuda Tahfidz',
      keterangan: 'Lancar dan mutqin sangat memuaskan'
    },
    kehadiranPersen: 100
  },

  // --- KELAS 9 SANTRI PUTRA (9A, 9B, 9C, 9D) ---
  {
    id: 'std-9a-01',
    nisn: '0062400141',
    nama: 'ILYAS AL-FATIH',
    gender: 'L',
    kelas: '9A',
    kelasBTQ: 'KHATAM AL-QUR\'AN PA',
    pengajar: 'KHOIRUL ANWAR S.AG',
    ruangan: 'RUANGAN 9A',
    waliKelas: 'USTADZ ARIS MUNANDAR M.PD',
    isTahfidz: true,
    targetJuz: '5 Juz (30, 29, 28, 1, 2)',
    totalHafalan: '5 Juz',
    hafalanTerakhir: 'QS. Ali Imran: 1-40',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 30",
      halamanAyat: 'Khatam 30 Juz',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-25',
      jenis: 'Munaqosyah Khatam Al-Qur\'an',
      nilai: 97,
      predikat: 'MUMTAZ',
      natijah: 'KHATAM 30 JUZ & TASMI 5 JUZ',
      kelulusan: 'Lulus Wisuda Tahfidz',
      keterangan: 'Prestasi istimewa, makhraj, tajwid & ghunnah mutqin'
    },
    kehadiranPersen: 100
  },
  {
    id: 'std-9b-01',
    nisn: '0062400151',
    nama: 'JIBRIL RAFIF PRADANA',
    gender: 'L',
    kelas: '9B',
    kelasBTQ: "AL-QUR'AN PA 9",
    pengajar: 'DANIL FIRMANSYAH',
    ruangan: 'RUANGAN 9B',
    waliKelas: 'USTADZ ARIS MUNANDAR M.PD',
    isTahfidz: false,
    totalHafalan: '0 Juz',
    hafalanTerakhir: '-',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 24",
      halamanAyat: 'QS. Az-Zumar: 30-60',
      tanggal: '2026-03-27',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan BTQ Munaqosyah',
      nilai: 89,
      predikat: 'MUMTAZ',
      natijah: 'MUMTAZ',
      kelulusan: 'Lulus Kenaikan Tingkat',
      keterangan: 'Lancar dan suara tartil jelas'
    },
    kehadiranPersen: 96
  },
  {
    id: 'std-9c-01',
    nisn: '0062400161',
    nama: 'KENZIE ATHALLAH',
    gender: 'L',
    kelas: '9C',
    kelasBTQ: "AL-QUR'AN PA 9",
    pengajar: 'DANIL FIRMANSYAH',
    ruangan: 'RUANGAN 9C',
    waliKelas: 'USTADZ ARIS MUNANDAR M.PD',
    isTahfidz: true,
    targetJuz: '3 Juz (30, 29, 28)',
    totalHafalan: '3 Juz',
    hafalanTerakhir: 'QS. At-Tahrim: 1-12',
    capaianTerakhir: {
      tingkat: "Al-Qur'an Juz 26",
      halamanAyat: 'QS. Al-Ahqaf: 1-25',
      tanggal: '2026-03-28',
      nilai: 'A'
    },
    ujian: {
      tanggal: '2026-03-22',
      jenis: 'Tasmi Juz Tahfidz',
      nilai: 92,
      predikat: 'MUMTAZ',
      natijah: 'LULUS TASMI JUZ 28',
      kelulusan: 'Lulus Mutqin',
      keterangan: 'Sangat lancar, tajwid mantap'
    },
    kehadiranPersen: 98
  },
  {
    id: 'std-9d-01',
    nisn: '0062400171',
    nama: 'LUTHFI ARSYAD',
    gender: 'L',
    kelas: '9D',
    kelasBTQ: 'TILAWATI 5 PA',
    pengajar: 'MOH. AMINULLAH',
    ruangan: 'RUANGAN 9D',
    waliKelas: 'USTADZ ARIS MUNANDAR M.PD',
    isTahfidz: false,
    totalHafalan: '0 Juz',
    hafalanTerakhir: '-',
    capaianTerakhir: {
      tingkat: 'Tilawati Remaja Jilid 5',
      halamanAyat: 'Halaman 26',
      tanggal: '2026-03-27',
      nilai: 'B'
    },
    ujian: {
      tanggal: '2026-03-20',
      jenis: 'Tes Kenaikan Jilid Tilawati',
      nilai: 80,
      predikat: 'JAYYID',
      natijah: 'Naik ke Al-Qur\'an',
      kelulusan: 'Lulus Naik Tingkat',
      keterangan: 'Lancar membaca waqaf dan washal'
    },
    kehadiranPersen: 92
  }
];

export const INITIAL_BACAAN: BacaanRecord[] = [
  {
    id: 'b-01',
    nisn: '0082600001',
    tanggal: '2026-03-28',
    tipe: "Al-Qur'an",
    jilid: 'Juz 15',
    halaman: 'QS. Al-Isra: 1-25',
    nilai: 'A',
    catatan: 'Makhraj huruf fashih dan tartil',
    pengajar: 'UMI KULSUM'
  },
  {
    id: 'b-02',
    nisn: '0082600001',
    tanggal: '2026-03-27',
    tipe: "Al-Qur'an",
    jilid: 'Juz 14',
    halaman: 'QS. An-Nahl: 80-128',
    nilai: 'A',
    catatan: 'Lancar dan waqaf tepat',
    pengajar: 'UMI KULSUM'
  },
  {
    id: 'b-03',
    nisn: '0082600002',
    tanggal: '2026-03-28',
    tipe: 'Tilawati Remaja',
    jilid: 'Jilid 4',
    halaman: 'Halaman 12',
    nilai: 'B',
    catatan: 'Perhatikan panjang mad thabi\'i 2 harakat',
    pengajar: 'TAUFIQURRAHMAN S.PD'
  },
  {
    id: 'b-04',
    nisn: '0082600002',
    tanggal: '2026-03-27',
    tipe: 'Tilawati Remaja',
    jilid: 'Jilid 4',
    halaman: 'Halaman 11',
    nilai: 'B',
    catatan: 'Dengung ghunnah perlu diperjelas',
    pengajar: 'TAUFIQURRAHMAN S.PD'
  },
  {
    id: 'b-05',
    nisn: '0082600011',
    tanggal: '2026-03-28',
    tipe: 'Tilawati Remaja',
    jilid: 'Jilid 3',
    halaman: 'Halaman 18',
    nilai: 'B',
    catatan: 'Bagus, latihan huruf ro tebal dan tipis',
    pengajar: 'USTADZ RIDWAN S.PD.I'
  },
  {
    id: 'b-06',
    nisn: '0082600012',
    tanggal: '2026-03-28',
    tipe: 'Tilawati Remaja',
    jilid: 'Jilid 4',
    halaman: 'Halaman 28',
    nilai: 'A',
    catatan: 'Bacaan tartil, makhraj sangat baik',
    pengajar: 'USTADZ RIDWAN S.PD.I'
  },
  {
    id: 'b-07',
    nisn: '0082600013',
    tanggal: '2026-03-28',
    tipe: 'Tilawati Remaja',
    jilid: 'Jilid 4',
    halaman: 'Halaman 25',
    nilai: 'A',
    catatan: 'Lancar dan tertib',
    pengajar: 'USTADZ RIDWAN S.PD.I'
  }
];

export const INITIAL_TAHFIDZ: TahfidzRecord[] = [
  {
    id: 't-01',
    nisn: '0082600001',
    tanggal: '2026-03-28',
    surat: 'QS. Al-Mulk',
    ayat: 'Ayat 1-30',
    status: 'Mutqin',
    kelancaran: 'Sangat Lancar (Mumtaz)',
    guru: 'USTADZ HAMDAN AL-HAFIDZ',
    catatan: 'Selesai tasmi surat Al-Mulk dengan mumtaz'
  },
  {
    id: 't-02',
    nisn: '0082600001',
    tanggal: '2026-03-26',
    surat: 'QS. Al-Qalam',
    ayat: 'Ayat 1-25',
    status: 'Ziyadah',
    kelancaran: 'Sangat Lancar (Mumtaz)',
    guru: 'USTADZ HAMDAN AL-HAFIDZ',
    catatan: 'Setoran hafalan baru lancar'
  },
  {
    id: 't-03',
    nisn: '0082600003',
    tanggal: '2026-03-28',
    surat: 'QS. An-Naba',
    ayat: 'Ayat 1-40',
    status: 'Mutqin',
    kelancaran: 'Sangat Lancar (Mumtaz)',
    guru: 'KHOIRUL ANWAR S.AG',
    catatan: 'Hafalan Juz 30 telah mutqin'
  },
  {
    id: 't-04',
    nisn: '0082600012',
    tanggal: '2026-03-28',
    surat: 'QS. Al-Mulk',
    ayat: 'Ayat 1-15',
    status: 'Ziyadah',
    kelancaran: 'Sangat Lancar (Mumtaz)',
    guru: 'USTADZ HAMDAN AL-HAFIDZ',
    catatan: 'Ziyadah awal Juz 29'
  },
  {
    id: 't-05',
    nisn: '0082600013',
    tanggal: '2026-03-28',
    surat: 'QS. An-Naba',
    ayat: 'Ayat 1-40',
    status: 'Muroja\'ah',
    kelancaran: 'Sangat Lancar (Mumtaz)',
    guru: 'USTADZ HAMDAN AL-HAFIDZ',
    catatan: 'Murojaah persiapan tasmi'
  },
  {
    id: 't-06',
    nisn: '0072500041',
    tanggal: '2026-03-28',
    surat: 'QS. Al-Mujadilah',
    ayat: 'Ayat 1-22',
    status: 'Mutqin',
    kelancaran: 'Sangat Lancar (Mumtaz)',
    guru: 'USTADZ HAMDAN AL-HAFIDZ',
    catatan: 'Tasmi Juz 28 mutqin'
  },
  {
    id: 't-07',
    nisn: '0062400111',
    tanggal: '2026-03-28',
    surat: 'QS. Al-Baqarah',
    ayat: 'Ayat 142-200',
    status: 'Ziyadah',
    kelancaran: 'Sangat Lancar (Mumtaz)',
    guru: 'KHOIRUL ANWAR S.AG',
    catatan: 'Setoran hafalan Juz 2 lancar mumtaz'
  }
];

export const INITIAL_ABSENSI: AbsensiRecord[] = [
  { id: 'abs-1', nisn: '0082600001', tanggal: '2026-03-28', sesi: 'btq', status: 'Hadir' },
  { id: 'abs-2', nisn: '0082600002', tanggal: '2026-03-28', sesi: 'btq', status: 'Hadir' },
  { id: 'abs-3', nisn: '0082600003', tanggal: '2026-03-28', sesi: 'btq', status: 'Hadir' },
  { id: 'abs-4', nisn: '0082600011', tanggal: '2026-03-28', sesi: 'btq', status: 'Hadir' },
  { id: 'abs-5', nisn: '0082600012', tanggal: '2026-03-28', sesi: 'btq', status: 'Hadir' },
  { id: 'abs-6', nisn: '0082600013', tanggal: '2026-03-28', sesi: 'btq', status: 'Hadir' },
  { id: 'abs-7', nisn: '0072500041', tanggal: '2026-03-28', sesi: 'tahfidz', status: 'Hadir' },
  { id: 'abs-8', nisn: '0062400111', tanggal: '2026-03-28', sesi: 'tahfidz', status: 'Hadir' }
];

export const INITIAL_TEACHERS: Teacher[] = [
  { id: 'tch-1', nama: 'UMI KULSUM', role: 'guru_ngaji', kelompokBTQ: "AL-QUR'AN PI D", ruangan: 'RUANGAN 7E' },
  { id: 'tch-2', nama: 'TAUFIQURRAHMAN S.PD', role: 'guru_ngaji', kelompokBTQ: 'TILAWATI 4 PI', ruangan: 'RUANGAN 7E' },
  { id: 'tch-3', nama: 'USTADZ RIDWAN S.PD.I', role: 'guru_ngaji', kelompokBTQ: 'TILAWATI 4 PA', ruangan: 'RUANGAN 7A' },
  { id: 'tch-4', nama: 'SITI FATIMAH S.PD.I', role: 'guru_ngaji', kelompokBTQ: "AL-QUR'AN PI 8 & 9", ruangan: 'RUANGAN 8E' },
  { id: 'tch-5', nama: 'NUR LAILI', role: 'guru_ngaji', kelompokBTQ: 'TILAWATI 3 & 4 PI', ruangan: 'RUANGAN 7D' },
  { id: 'tch-6', nama: 'DEWI MASITOH', role: 'guru_ngaji', kelompokBTQ: 'TILAWATI 2 & 3 PI', ruangan: 'RUANGAN 7F' },
  { id: 'tch-7', nama: 'M. ROFIQ S.PD.I', role: 'guru_ngaji', kelompokBTQ: 'TILAWATI 4 PA', ruangan: 'RUANGAN 8A' },
  { id: 'tch-8', nama: 'MOH. AMINULLAH', role: 'guru_ngaji', kelompokBTQ: 'TILAWATI 5 PA', ruangan: 'RUANGAN 8B' },
  { id: 'tch-9', nama: 'DANIL FIRMANSYAH', role: 'guru_ngaji', kelompokBTQ: "AL-QUR'AN PA 8 & 9", ruangan: 'RUANGAN 8C' },
  { id: 'tch-10', nama: 'USTADZ HAMDAN AL-HAFIDZ', role: 'guru_tahfidz', kelompokBTQ: 'HALAQAH TAHFIDZ JUZ 30 & 29', ruangan: 'MASJID AL-IKHLAS' },
  { id: 'tch-11', nama: 'KHOIRUL ANWAR S.AG', role: 'guru_tahfidz', kelompokBTQ: 'HALAQAH TAHFIDZ LANJUTAN', ruangan: 'RUANGAN 9A' }
];

export const TEACHERS_LIST = INITIAL_TEACHERS.map(t => t.nama);

export const HOMEROOM_CLASSES = [
  '7D', '7E', '7F', '7A', '7B', '7C',
  '8E', '8F', '8G', '8A', '8B', '8C', '8D',
  '9E', '9F', '9G', '9A', '9B', '9C', '9D'
];
