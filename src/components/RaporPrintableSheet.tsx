import React from 'react';
import {
  Student,
  BacaanRecord,
  TahfidzRecord,
  AbsensiRecord,
  RaporSettings,
  RaporPrintStatus
} from '../types';

interface RaporPrintableSheetProps {
  student: Student;
  bacaanList: BacaanRecord[];
  tahfidzList: TahfidzRecord[];
  absensiList: AbsensiRecord[];
  settings: RaporSettings;
  isPreview?: boolean;
}

export const RaporPrintableSheet: React.FC<RaporPrintableSheetProps> = ({
  student,
  bacaanList,
  tahfidzList,
  absensiList,
  settings,
  isPreview = false
}) => {
  const studentBacaan = bacaanList.filter(b => b.nisn === student.nisn).slice(0, 6);
  const studentTahfidz = tahfidzList.filter(t => t.nisn === student.nisn).slice(0, 6);
  const studentAbsensi = absensiList.filter(a => a.nisn === student.nisn);

  const hadirCount = studentAbsensi.filter(a => a.status === 'Hadir').length;
  const sakitCount = studentAbsensi.filter(a => a.status === 'Sakit').length;
  const izinCount = studentAbsensi.filter(a => a.status === 'Izin').length;
  const alpaCount = studentAbsensi.filter(a => a.status === 'Alpa').length;
  const totalSesi = studentAbsensi.length;
  const presensiPersen =
    totalSesi > 0 ? Math.round((hadirCount / totalSesi) * 100) : student.kehadiranPersen ?? 100;

  return (
    <article
      className={`bg-white text-slate-900 ${
        isPreview
          ? 'p-6 sm:p-8 rounded-2xl border border-slate-300 shadow-sm max-w-[210mm] mx-auto'
          : 'rapor-page-break p-2'
      }`}
    >
      {/* Kop Surat Resmi */}
      <header className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4 gap-4">
        <div className="flex items-center gap-3">
          <img
            src="/assets/logo_spemda_quran.png"
            alt="Logo SMP Muhammadiyah 2 Surabaya & Fashahah Balaghah Qur'an"
            className="h-14 w-auto object-contain"
          />
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-800">
            Laporan Hasil Belajar Al-Qur'an & Tahfidz
          </p>
          <h2 className="text-base font-black text-slate-900 tracking-tight uppercase">
            RAPOR MUTABA'AH BTQ & TAHFIDZ
          </h2>
          <p className="text-xs font-bold text-slate-800">
            SMP MUHAMMADIYAH 2 SURABAYA
          </p>
          <p className="text-[10px] text-slate-600">
            Semester {settings.semester} · Tahun Ajaran {settings.tahunAjaran} · Terakreditasi A
          </p>
        </div>
      </header>

      {/* Identitas Siswa */}
      <section className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4">
        <div className="flex justify-between gap-2 border-b border-slate-200/70 pb-1">
          <span className="text-slate-500">Nama Lengkap</span>
          <strong className="text-slate-900 uppercase text-right">{student.nama}</strong>
        </div>
        <div className="flex justify-between gap-2 border-b border-slate-200/70 pb-1">
          <span className="text-slate-500">Kelompok BTQ</span>
          <strong className="text-emerald-800 text-right">{student.kelasBTQ}</strong>
        </div>

        <div className="flex justify-between gap-2 border-b border-slate-200/70 pb-1">
          <span className="text-slate-500">NISN / Jenis Kelamin</span>
          <strong className="font-mono text-slate-900 text-right">
            {student.nisn} ({student.gender === 'L' ? 'Putra' : 'Putri'})
          </strong>
        </div>
        <div className="flex justify-between gap-2 border-b border-slate-200/70 pb-1">
          <span className="text-slate-500">Pengajar BTQ</span>
          <strong className="text-slate-900 text-right">{student.pengajar}</strong>
        </div>

        <div className="flex justify-between gap-2 border-b border-slate-200/70 pb-1">
          <span className="text-slate-500">Kelas Formal / Ruangan</span>
          <strong className="text-slate-900 text-right">
            {student.kelas} · {student.ruangan}
          </strong>
        </div>
        <div className="flex justify-between gap-2 border-b border-slate-200/70 pb-1">
          <span className="text-slate-500">Wali Kelas</span>
          <strong className="text-slate-900 text-right">{student.waliKelas || '-'}</strong>
        </div>

        {student.isTahfidz && (
          <>
            <div className="flex justify-between gap-2 pt-0.5">
              <span className="text-slate-500">Halaqah Tahfidz</span>
              <strong className="text-amber-800 text-right">
                {student.halaqahTahfidz || 'Program Tahfidz'}
              </strong>
            </div>
            <div className="flex justify-between gap-2 pt-0.5">
              <span className="text-slate-500">Pembimbing Tahfidz</span>
              <strong className="text-slate-900 text-right">
                {student.pembimbingTahfidz || student.pengajar}
              </strong>
            </div>
          </>
        )}
      </section>

      {/* 4 Ringkasan Capaian Utama */}
      <section className="grid grid-cols-4 gap-2.5 mb-4">
        <div className="p-2.5 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] text-slate-500 font-semibold block">
            Capaian Tilawati / Qur'an
          </span>
          <strong className="text-xs font-extrabold text-emerald-800 block mt-0.5">
            {student.capaianTerakhir.tingkat}
          </strong>
          <span className="text-[10px] text-slate-600 block">
            {student.capaianTerakhir.halamanAyat} · Nilai {student.capaianTerakhir.nilai}
          </span>
        </div>

        <div className="p-2.5 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] text-slate-500 font-semibold block">
            Tes Kenaikan / Munaqosyah
          </span>
          <strong className="text-xs font-extrabold text-purple-800 block mt-0.5">
            {student.ujian.natijah}
          </strong>
          <span className="text-[10px] text-slate-600 font-mono block">
            Nilai: {student.ujian.nilai} ({student.ujian.predikat})
          </span>
        </div>

        <div className="p-2.5 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] text-slate-500 font-semibold block">
            Program Tahfidz
          </span>
          <strong className="text-xs font-extrabold text-amber-800 block mt-0.5">
            {student.isTahfidz ? student.totalHafalan || 'Aktif' : 'BTQ Reguler'}
          </strong>
          <span className="text-[10px] text-slate-600 block truncate">
            {student.isTahfidz
              ? `Target: ${student.targetJuz || 'Juz 30'}`
              : 'Fokus Tilawati Remaja'}
          </span>
        </div>

        <div className="p-2.5 rounded-xl border border-slate-200 bg-white">
          <span className="text-[10px] text-slate-500 font-semibold block">
            Kehadiran Halaqah
          </span>
          <strong className="text-xs font-extrabold text-blue-800 font-mono block mt-0.5">
            {presensiPersen}% Hadir
          </strong>
          <span className="text-[10px] text-slate-600 block">
            {totalSesi > 0
              ? `H:${hadirCount} S:${sakitCount} I:${izinCount} A:${alpaCount}`
              : 'Mengikuti jadwal aktif'}
          </span>
        </div>
      </section>

      {/* Tabel Riwayat Bacaan Tilawati / Al-Qur'an */}
      <section className="mb-4 border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 flex justify-between items-center">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-800">
            A. Catatan Mutaba'ah Tilawati & Al-Qur'an
          </h3>
          <span className="text-[10px] text-slate-500 font-mono">
            {studentBacaan.length > 0 ? `${studentBacaan.length} catatan terbaru` : 'Capaian terakhir'}
          </span>
        </div>
        <table className="w-full text-[10px] text-left">
          <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
            <tr>
              <th className="py-1.5 px-2.5 font-semibold">Tanggal</th>
              <th className="py-1.5 px-2.5 font-semibold">Program / Kitab</th>
              <th className="py-1.5 px-2.5 font-semibold">Jilid / Juz</th>
              <th className="py-1.5 px-2.5 font-semibold">Halaman / Ayat</th>
              <th className="py-1.5 px-2.5 font-semibold text-center">Nilai</th>
              <th className="py-1.5 px-2.5 font-semibold">Catatan Tajwid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {studentBacaan.length > 0 ? (
              studentBacaan.map(b => (
                <tr key={b.id}>
                  <td className="py-1.5 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                    {b.tanggal}
                  </td>
                  <td className="py-1.5 px-2.5 font-medium text-slate-800">{b.tipe}</td>
                  <td className="py-1.5 px-2.5 font-semibold text-emerald-800">{b.jilid}</td>
                  <td className="py-1.5 px-2.5 text-slate-700">{b.halaman}</td>
                  <td className="py-1.5 px-2.5 text-center font-bold font-mono text-slate-900">
                    {b.nilai}
                  </td>
                  <td className="py-1.5 px-2.5 text-slate-600 italic">
                    {b.catatan || 'Bacaan lancar & tartil'}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-1.5 px-2.5 font-mono text-slate-600">
                  {student.capaianTerakhir.tanggal}
                </td>
                <td className="py-1.5 px-2.5 font-medium text-slate-800">BTQ / Al-Qur'an</td>
                <td className="py-1.5 px-2.5 font-semibold text-emerald-800">
                  {student.capaianTerakhir.tingkat}
                </td>
                <td className="py-1.5 px-2.5 text-slate-700">
                  {student.capaianTerakhir.halamanAyat}
                </td>
                <td className="py-1.5 px-2.5 text-center font-bold font-mono text-slate-900">
                  {student.capaianTerakhir.nilai}
                </td>
                <td className="py-1.5 px-2.5 text-slate-600 italic">
                  Capaian mutaba'ah semester berjalan
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Tabel Setoran Tahfidz (Khusus Peserta Tahfidz) */}
      {student.isTahfidz && (
        <section className="mb-4 border border-amber-200 rounded-xl overflow-hidden">
          <div className="bg-amber-50 px-3 py-1.5 border-b border-amber-200 flex justify-between items-center">
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-amber-950">
              B. Mutaba'ah Setoran Hafalan Program Tahfidz
            </h3>
            <span className="text-[10px] text-amber-800 font-mono">
              Target: {student.targetJuz || 'Juz 30'} · Total: {student.totalHafalan || '-'}
            </span>
          </div>
          <table className="w-full text-[10px] text-left">
            <thead className="bg-amber-50/40 text-slate-600 border-b border-amber-100">
              <tr>
                <th className="py-1.5 px-2.5 font-semibold">Tanggal</th>
                <th className="py-1.5 px-2.5 font-semibold">Surat Al-Qur'an</th>
                <th className="py-1.5 px-2.5 font-semibold">Ayat</th>
                <th className="py-1.5 px-2.5 font-semibold">Kategori</th>
                <th className="py-1.5 px-2.5 font-semibold">Kelancaran</th>
                <th className="py-1.5 px-2.5 font-semibold">Pembimbing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-100/70">
              {studentTahfidz.length > 0 ? (
                studentTahfidz.map(t => (
                  <tr key={t.id}>
                    <td className="py-1.5 px-2.5 font-mono text-slate-600 whitespace-nowrap">
                      {t.tanggal}
                    </td>
                    <td className="py-1.5 px-2.5 font-bold text-slate-900">{t.surat}</td>
                    <td className="py-1.5 px-2.5 text-slate-700">{t.ayat}</td>
                    <td className="py-1.5 px-2.5 font-semibold text-amber-800">{t.status}</td>
                    <td className="py-1.5 px-2.5 text-slate-700">{t.kelancaran}</td>
                    <td className="py-1.5 px-2.5 text-slate-600">{t.guru}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-2 px-2.5 text-slate-600">
                    Hafalan Terakhir: <strong>{student.hafalanTerakhir || '-'}</strong> · Total Hafalan:{' '}
                    <strong>{student.totalHafalan || '-'}</strong>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {/* Catatan Evaluasi Ustadz/ah */}
      <section className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 mb-5">
        <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wide">
          Catatan Evaluasi Tajwid, Makhraj & Pembinaan Ustadz/ah:
        </p>
        <p className="text-[11px] text-slate-800 mt-1 leading-relaxed">
          {student.ujian.keterangan ||
            'Alhamdulillah ananda mengikuti pembelajaran Al-Qur\'an dengan baik, menjaga adab tilawah, dan konsisten dalam muraja\'ah.'}
        </p>
      </section>

      {/* Kolom Tanda Tangan Resmi */}
      <footer className="grid grid-cols-4 gap-3 pt-2 text-center text-[10px] text-slate-800">
        <div>
          <p className="text-slate-500">&nbsp;</p>
          <p className="font-bold mt-0.5">Orang Tua / Wali Murid,</p>
          <div className="h-14" />
          <p className="font-semibold text-slate-700">( ........................................ )</p>
        </div>

        <div>
          <p className="text-slate-500">Mengetahui,</p>
          <p className="font-bold mt-0.5">Kepala Sekolah SPEMDA</p>
          <div className="h-14" />
          <p className="font-bold underline">{settings.kepalaSekolah}</p>
          <p className="text-[9px] text-slate-500">{settings.nbmKepala}</p>
        </div>

        <div>
          <p className="text-slate-500">&nbsp;</p>
          <p className="font-bold mt-0.5">Koordinator BTQ & Tahfidz</p>
          <div className="h-14" />
          <p className="font-bold underline">{settings.koordinator}</p>
          <p className="text-[9px] text-slate-500">Tim Al-Qur'an SPEMDA</p>
        </div>

        <div>
          <p className="text-slate-600">Surabaya, {settings.tanggalRapor}</p>
          <p className="font-bold mt-0.5">Ustadz/ah Pembimbing,</p>
          <div className="h-14" />
          <p className="font-bold underline">{student.pengajar}</p>
          <p className="text-[9px] text-slate-500">Pengajar {student.kelasBTQ}</p>
        </div>
      </footer>
    </article>
  );
};

interface ClassSummaryPrintableSheetProps {
  kelasLabel: string;
  students: Student[];
  printStatuses: Record<string, RaporPrintStatus>;
  settings: RaporSettings;
}

export const ClassSummaryPrintableSheet: React.FC<ClassSummaryPrintableSheetProps> = ({
  kelasLabel,
  students,
  printStatuses,
  settings
}) => {
  return (
    <article className="bg-white text-slate-900 p-2">
      <header className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4 gap-4">
        <img
          src="/assets/logo_spemda_quran.png"
          alt="Logo SMP Muhammadiyah 2 Surabaya & Fashahah Balaghah Qur'an"
          className="h-12 w-auto object-contain"
        />
        <div className="text-right">
          <h2 className="text-sm font-black uppercase text-slate-900">
            REKAPITULASI NILAI & STATUS CETAK RAPOR BTQ - TAHFIDZ
          </h2>
          <p className="text-xs font-bold text-slate-700">
            SMP MUHAMMADIYAH 2 SURABAYA · {kelasLabel}
          </p>
          <p className="text-[10px] text-slate-500">
            Semester {settings.semester} · TA {settings.tahunAjaran} · Total {students.length} Siswa
          </p>
        </div>
      </header>

      <table className="w-full text-[10px] text-left border border-slate-300">
        <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-300">
          <tr>
            <th className="p-2 border-r border-slate-200 text-center w-8">No</th>
            <th className="p-2 border-r border-slate-200">NISN</th>
            <th className="p-2 border-r border-slate-200">Nama Lengkap</th>
            <th className="p-2 border-r border-slate-200 text-center">Kls</th>
            <th className="p-2 border-r border-slate-200">Kelompok BTQ</th>
            <th className="p-2 border-r border-slate-200">Capaian Terakhir</th>
            <th className="p-2 border-r border-slate-200 text-center">Nilai</th>
            <th className="p-2 border-r border-slate-200">Natijah</th>
            <th className="p-2 text-center">Status Cetak</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {students.map((s, idx) => {
            const st = printStatuses[s.nisn];
            return (
              <tr key={s.id}>
                <td className="p-1.5 border-r border-slate-200 text-center font-mono">{idx + 1}</td>
                <td className="p-1.5 border-r border-slate-200 font-mono">{s.nisn}</td>
                <td className="p-1.5 border-r border-slate-200 font-bold uppercase">
                  {s.nama} {s.isTahfidz ? '★' : ''}
                </td>
                <td className="p-1.5 border-r border-slate-200 text-center font-semibold">{s.kelas}</td>
                <td className="p-1.5 border-r border-slate-200">{s.kelasBTQ}</td>
                <td className="p-1.5 border-r border-slate-200">
                  {s.capaianTerakhir.tingkat} ({s.capaianTerakhir.halamanAyat})
                </td>
                <td className="p-1.5 border-r border-slate-200 text-center font-mono font-bold">
                  {s.ujian.nilai} ({s.ujian.predikat})
                </td>
                <td className="p-1.5 border-r border-slate-200">{s.ujian.natijah}</td>
                <td className="p-1.5 text-center font-semibold">
                  {st ? `Sudah (${st.printCount}x)` : 'Belum'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <footer className="grid grid-cols-2 gap-8 pt-8 text-center text-[10px]">
        <div>
          <p>Mengetahui,</p>
          <p className="font-bold mt-0.5">Kepala Sekolah SPEMDA</p>
          <div className="h-14" />
          <p className="font-bold underline">{settings.kepalaSekolah}</p>
          <p className="text-slate-500">{settings.nbmKepala}</p>
        </div>
        <div>
          <p>Surabaya, {settings.tanggalRapor}</p>
          <p className="font-bold mt-0.5">Koordinator BTQ & Tahfidz</p>
          <div className="h-14" />
          <p className="font-bold underline">{settings.koordinator}</p>
          <p className="text-slate-500">Administrator SIM-Qur'an SPEMDA</p>
        </div>
      </footer>
    </article>
  );
};
