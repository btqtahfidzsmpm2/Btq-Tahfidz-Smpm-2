import { AbsensiRecord, Student } from '../types';

export interface MonthDayInfo {
  day: number;
  dayStr: string;
  dateStr: string; // YYYY-MM-DD
  weekdayShort: string;
  isSunday: boolean;
  isWeekend: boolean;
}

export interface StudentAttendanceSummary {
  nisn: string;
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  totalTidakMasuk: number;
  totalPertemuan: number;
  persentase: number;
  flagLevel: 'kritis' | 'waspada' | 'aman';
  flagLabel: string;
  flagReason: string;
}

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember'
];

const WEEKDAYS_SHORT_ID = ['Mg', 'Sn', 'Sl', 'Rb', 'Km', 'Jm', 'Sb'];

export function getCurrentMonthStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function formatMonthLabel(monthStr: string): string {
  const [yStr, mStr] = monthStr.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m || m < 1 || m > 12) return monthStr;
  return `${MONTH_NAMES_ID[m - 1]} ${y}`;
}

export function shiftMonthStr(monthStr: string, delta: number): string {
  const [yStr, mStr] = monthStr.split('-');
  const y = Number(yStr) || new Date().getFullYear();
  const m = Number(mStr) || new Date().getMonth() + 1;
  const dt = new Date(y, m - 1 + delta, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthDays(monthStr: string): MonthDayInfo[] {
  const [yStr, mStr] = monthStr.split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const month = Number(mStr) || new Date().getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const days: MonthDayInfo[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    const dow = dt.getDay();
    const dayStr = String(d).padStart(2, '0');
    days.push({
      day: d,
      dayStr,
      dateStr: `${year}-${String(month).padStart(2, '0')}-${dayStr}`,
      weekdayShort: WEEKDAYS_SHORT_ID[dow],
      isSunday: dow === 0,
      isWeekend: dow === 0 || dow === 6
    });
  }

  return days;
}

/**
 * Computes monthly (or overall) attendance breakdown and flags students who are
 * frequently absent ("Sering Tidak Masuk") so Admin & Wali Kelas can spot them instantly.
 */
export function computeStudentAttendanceSummary(
  student: Student,
  absensiList: AbsensiRecord[],
  options?: {
    monthPrefix?: string; // e.g. '2026-11'
    sesi?: 'all' | 'btq' | 'tahfidz';
  }
): StudentAttendanceSummary {
  const monthPrefix = options?.monthPrefix;
  const sesi = options?.sesi || 'all';

  const records = absensiList.filter(a => {
    if (a.nisn !== student.nisn) return false;
    if (monthPrefix && !a.tanggal.startsWith(monthPrefix)) return false;
    if (sesi !== 'all' && a.sesi !== sesi) return false;
    return true;
  });

  let hadir = 0;
  let sakit = 0;
  let izin = 0;
  let alpa = 0;

  records.forEach(r => {
    if (r.status === 'Hadir') hadir += 1;
    else if (r.status === 'Sakit') sakit += 1;
    else if (r.status === 'Izin') izin += 1;
    else if (r.status === 'Alpa') alpa += 1;
  });

  const totalTidakMasuk = sakit + izin + alpa;
  const totalPertemuan = hadir + totalTidakMasuk;

  const persentase =
    totalPertemuan > 0
      ? Math.round((hadir / totalPertemuan) * 100)
      : student.kehadiranPersen ?? 100;

  let flagLevel: 'kritis' | 'waspada' | 'aman' = 'aman';
  let flagLabel = 'Kehadiran Baik';
  let flagReason = '';

  const buildReason = () => {
    const parts: string[] = [];
    if (alpa > 0) parts.push(`Alpa ${alpa}×`);
    if (sakit > 0) parts.push(`Sakit ${sakit}×`);
    if (izin > 0) parts.push(`Izin ${izin}×`);
    if (totalPertemuan > 0 && persentase < 85) parts.push(`Hadir ${persentase}%`);
    return parts.join(' · ');
  };

  if (alpa >= 2 || (totalPertemuan >= 4 && persentase < 75)) {
    flagLevel = 'kritis';
    flagLabel = alpa >= 2 ? 'Sering Alpa' : 'Sering Tidak Masuk';
    flagReason = buildReason() || `Kehadiran ${persentase}% (< 75%)`;
  } else if (
    totalTidakMasuk >= 3 ||
    (totalPertemuan >= 3 && persentase < 85) ||
    (totalPertemuan === 0 && !monthPrefix && (student.kehadiranPersen ?? 100) < 80)
  ) {
    flagLevel = 'waspada';
    flagLabel = 'Sering Tidak Masuk';
    flagReason = buildReason() || `Kehadiran ${persentase}% (< 85%)`;
  }

  return {
    nisn: student.nisn,
    hadir,
    sakit,
    izin,
    alpa,
    totalTidakMasuk,
    totalPertemuan,
    persentase,
    flagLevel,
    flagLabel,
    flagReason
  };
}
