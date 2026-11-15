import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Student,
  BacaanRecord,
  TahfidzRecord,
  AbsensiRecord,
  RaporSettings,
  RaporPrintStatus
} from '../types';

interface LoadedImageInfo {
  dataUrl: string;
  width: number;
  height: number;
}

async function loadLogoDataUrl(): Promise<LoadedImageInfo | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: canvas.width,
          height: canvas.height
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = '/assets/logo_spemda_quran.png';
  });
}

function safeFileSegment(text: string): string {
  return text
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Generates and downloads an official A4 PDF containing 1 page per student
 * for either a single student or a full class batch.
 */
export async function downloadRaporPdf(params: {
  students: Student[];
  bacaanList: BacaanRecord[];
  tahfidzList: TahfidzRecord[];
  absensiList: AbsensiRecord[];
  settings: RaporSettings;
  fileLabel: string;
}): Promise<string> {
  const { students, bacaanList, tahfidzList, absensiList, settings, fileLabel } = params;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const logo = await loadLogoDataUrl();
  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2; // 186mm

  students.forEach((student, index) => {
    if (index > 0) {
      doc.addPage();
    }

    let y = 12;

    // 1. Kop Surat
    if (logo && logo.width > 0 && logo.height > 0) {
      const targetH = 15;
      const targetW = Math.min(68, (logo.width / logo.height) * targetH);
      doc.addImage(logo.dataUrl, 'PNG', marginX, y, targetW, targetH);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(6, 95, 70);
    doc.text("LAPORAN HASIL BELAJAR AL-QUR'AN & TAHFIDZ", pageWidth - marginX, y + 3, {
      align: 'right'
    });

    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text("RAPOR MUTABA'AH BTQ & TAHFIDZ", pageWidth - marginX, y + 8.5, {
      align: 'right'
    });

    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    doc.text('SMP MUHAMMADIYAH 2 SURABAYA', pageWidth - marginX, y + 13, {
      align: 'right'
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Semester ${settings.semester} · Tahun Ajaran ${settings.tahunAjaran} · Terakreditasi A`,
      pageWidth - marginX,
      y + 17,
      { align: 'right' }
    );

    y += 20;
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.6);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 4;

    // 2. Identitas Siswa
    const idBoxHeight = student.isTahfidz ? 25 : 19.5;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.roundedRect(marginX, y, contentWidth, idBoxHeight, 2, 2, 'FD');

    const col1X = marginX + 3;
    const col1ValX = marginX + 34;
    const col2X = marginX + 96;
    const col2ValX = marginX + 128;

    const drawMetaRow = (rowY: number, l1: string, v1: string, l2: string, v2: string) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(l1, col1X, rowY);
      doc.text(l2, col2X, rowY);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(`: ${v1}`, col1ValX, rowY, { maxWidth: 58 });
      doc.text(`: ${v2}`, col2ValX, rowY, { maxWidth: 54 });
    };

    drawMetaRow(
      y + 5,
      'Nama Lengkap',
      student.nama.toUpperCase(),
      'Kelompok BTQ',
      student.kelasBTQ
    );
    drawMetaRow(
      y + 10.5,
      'NISN / JK',
      `${student.nisn} (${student.gender === 'L' ? 'Putra' : 'Putri'})`,
      'Pengajar BTQ',
      student.pengajar
    );
    drawMetaRow(
      y + 16,
      'Kelas / Ruangan',
      `${student.kelas} · ${student.ruangan}`,
      'Wali Kelas',
      student.waliKelas || '-'
    );
    if (student.isTahfidz) {
      drawMetaRow(
        y + 21.5,
        'Halaqah Tahfidz',
        student.halaqahTahfidz || 'Program Tahfidz',
        'Pembimbing',
        student.pembimbingTahfidz || student.pengajar
      );
    }

    y += idBoxHeight + 4;

    // 3. 4 Kartu Ringkasan Capaian
    const studentAbsensi = absensiList.filter(a => a.nisn === student.nisn);
    const hadirCount = studentAbsensi.filter(a => a.status === 'Hadir').length;
    const sakitCount = studentAbsensi.filter(a => a.status === 'Sakit').length;
    const izinCount = studentAbsensi.filter(a => a.status === 'Izin').length;
    const alpaCount = studentAbsensi.filter(a => a.status === 'Alpa').length;
    const totalSesi = studentAbsensi.length;
    const presensiPersen =
      totalSesi > 0 ? Math.round((hadirCount / totalSesi) * 100) : student.kehadiranPersen ?? 100;

    const cardGap = 3;
    const cardW = (contentWidth - cardGap * 3) / 4;
    const cardH = 17.5;

    const cards = [
      {
        label: "Capaian Tilawati / Qur'an",
        value: student.capaianTerakhir.tingkat,
        sub: `${student.capaianTerakhir.halamanAyat} · Nilai ${student.capaianTerakhir.nilai}`,
        color: [6, 95, 70] as [number, number, number]
      },
      {
        label: 'Tes Munaqosyah',
        value: student.ujian.natijah,
        sub: `Nilai: ${student.ujian.nilai} (${student.ujian.predikat})`,
        color: [107, 33, 168] as [number, number, number]
      },
      {
        label: 'Program Tahfidz',
        value: student.isTahfidz ? student.totalHafalan || 'Aktif' : 'BTQ Reguler',
        sub: student.isTahfidz ? `Target: ${student.targetJuz || 'Juz 30'}` : 'Fokus Tilawati',
        color: [180, 83, 9] as [number, number, number]
      },
      {
        label: 'Kehadiran Halaqah',
        value: `${presensiPersen}% Hadir`,
        sub:
          totalSesi > 0
            ? `H:${hadirCount} S:${sakitCount} I:${izinCount} A:${alpaCount}`
            : 'Mengikuti jadwal aktif',
        color: [29, 78, 216] as [number, number, number]
      }
    ];

    cards.forEach((c, cIdx) => {
      const cx = marginX + cIdx * (cardW + cardGap);
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(c.label, cx + 2.5, y + 4.5, { maxWidth: cardW - 5 });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...c.color);
      doc.text(c.value || '-', cx + 2.5, y + 10, { maxWidth: cardW - 5 });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(c.sub, cx + 2.5, y + 14.5, { maxWidth: cardW - 5 });
    });

    y += cardH + 5;

    // 4. Tabel A: Mutaba'ah Tilawati & Al-Qur'an
    const studentBacaan = bacaanList.filter(b => b.nisn === student.nisn).slice(0, 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text("A. CATATAN MUTABA'AH TILAWATI & AL-QUR'AN", marginX, y);
    y += 2;

    const bacaanRows =
      studentBacaan.length > 0
        ? studentBacaan.map(b => [
            b.tanggal,
            b.tipe,
            b.jilid,
            b.halaman,
            b.nilai,
            b.catatan || 'Bacaan lancar & tartil'
          ])
        : [
            [
              student.capaianTerakhir.tanggal,
              "BTQ / Al-Qur'an",
              student.capaianTerakhir.tingkat,
              student.capaianTerakhir.halamanAyat,
              student.capaianTerakhir.nilai,
              "Capaian mutaba'ah semester berjalan"
            ]
          ];

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [['Tanggal', 'Program / Kitab', 'Jilid / Juz', 'Halaman / Ayat', 'Nilai', 'Catatan Tajwid']],
      body: bacaanRows,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59] },
      headStyles: { fillColor: [6, 95, 70], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 22 },
        4: { halign: 'center', cellWidth: 14, fontStyle: 'bold' }
      }
    });

    y = ((doc as any).lastAutoTable?.finalY || y + 20) + 5;

    // 5. Tabel B: Setoran Tahfidz (Jika Peserta Tahfidz)
    if (student.isTahfidz) {
      const studentTahfidz = tahfidzList.filter(t => t.nisn === student.nisn).slice(0, 5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(146, 64, 14);
      doc.text("B. MUTABA'AH SETORAN HAFALAN PROGRAM TAHFIDZ", marginX, y);
      y += 2;

      const tahfidzRows =
        studentTahfidz.length > 0
          ? studentTahfidz.map(t => [
              t.tanggal,
              t.surat,
              t.ayat,
              t.status,
              t.kelancaran,
              t.guru
            ])
          : [
              [
                '-',
                student.hafalanTerakhir || '-',
                `Target: ${student.targetJuz || 'Juz 30'}`,
                'Aktif',
                student.totalHafalan || '-',
                student.pembimbingTahfidz || student.pengajar
              ]
            ];

      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['Tanggal', "Surat Al-Qur'an", 'Ayat', 'Kategori', 'Kelancaran', 'Pembimbing']],
        body: tahfidzRows,
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2, textColor: [30, 41, 59] },
        headStyles: { fillColor: [180, 83, 9], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 22 }
        }
      });

      y = ((doc as any).lastAutoTable?.finalY || y + 20) + 5;
    }

    // 6. Catatan Evaluasi Ustadz/ah
    const catatanText =
      student.ujian.keterangan ||
      "Alhamdulillah ananda mengikuti pembelajaran Al-Qur'an dengan baik, menjaga adab tilawah, dan konsisten dalam muraja'ah.";
    const splitNotes = doc.splitTextToSize(catatanText, contentWidth - 6);
    const noteBoxH = Math.max(15, 8 + splitNotes.length * 4);

    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(253, 230, 138);
    doc.roundedRect(marginX, y, contentWidth, noteBoxH, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 53, 15);
    doc.text('CATATAN EVALUASI TAJWID, MAKHRAJ & PEMBINAAN USTADZ/AH:', marginX + 3, y + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(splitNotes, marginX + 3, y + 9.5);

    // 7. Kolom Tanda Tangan Resmi (positioned safely below notes, max y=250)
    const sigY = Math.min(248, Math.max(y + noteBoxH + 10, 215));
    const sigColW = contentWidth / 4;
    const sigCenters = [
      marginX + sigColW * 0.5,
      marginX + sigColW * 1.5,
      marginX + sigColW * 2.5,
      marginX + sigColW * 3.5
    ];

    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);

    // Col 1: Wali Murid
    doc.setFont('helvetica', 'bold');
    doc.text('Orang Tua / Wali Murid,', sigCenters[0], sigY + 4, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text('( .............................. )', sigCenters[0], sigY + 21, { align: 'center' });

    // Col 2: Kepala Sekolah
    doc.setFont('helvetica', 'normal');
    doc.text('Mengetahui,', sigCenters[1], sigY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text('Kepala Sekolah SPEMDA', sigCenters[1], sigY + 4, { align: 'center' });
    doc.text(settings.kepalaSekolah, sigCenters[1], sigY + 21, {
      align: 'center',
      maxWidth: sigColW - 4
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(settings.nbmKepala, sigCenters[1], sigY + 25, { align: 'center' });

    // Col 3: Koordinator
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Koordinator BTQ & Tahfidz', sigCenters[2], sigY + 4, { align: 'center' });
    doc.text(settings.koordinator, sigCenters[2], sigY + 21, {
      align: 'center',
      maxWidth: sigColW - 4
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text("Tim Al-Qur'an SPEMDA", sigCenters[2], sigY + 25, { align: 'center' });

    // Col 4: Pengajar
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(`Surabaya, ${settings.tanggalRapor}`, sigCenters[3], sigY, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text('Ustadz/ah Pembimbing,', sigCenters[3], sigY + 4, { align: 'center' });
    doc.text(student.pengajar, sigCenters[3], sigY + 21, {
      align: 'center',
      maxWidth: sigColW - 4
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(`Pengajar ${student.kelasBTQ}`, sigCenters[3], sigY + 25, {
      align: 'center',
      maxWidth: sigColW - 4
    });
  });

  const dateSuffix = new Date().toISOString().slice(0, 10);
  const fileName = `Rapor_Mutabaah_${safeFileSegment(fileLabel)}_${dateSuffix}.pdf`;
  doc.save(fileName);
  return fileName;
}

/**
 * Generates and downloads a PDF summary ledger of student report grades & print statuses for a class.
 */
export async function downloadClassSummaryPdf(params: {
  kelasLabel: string;
  students: Student[];
  printStatuses: Record<string, RaporPrintStatus>;
  settings: RaporSettings;
}): Promise<string> {
  const { kelasLabel, students, printStatuses, settings } = params;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const logo = await loadLogoDataUrl();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;
  let y = 12;

  if (logo && logo.width > 0 && logo.height > 0) {
    const targetH = 13;
    const targetW = Math.min(60, (logo.width / logo.height) * targetH);
    doc.addImage(logo.dataUrl, 'PNG', marginX, y, targetW, targetH);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text('REKAPITULASI NILAI & STATUS RAPOR BTQ - TAHFIDZ', pageWidth - marginX, y + 4.5, {
    align: 'right'
  });

  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`SMP MUHAMMADIYAH 2 SURABAYA · ${kelasLabel.toUpperCase()}`, pageWidth - marginX, y + 9.5, {
    align: 'right'
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Semester ${settings.semester} · TA ${settings.tahunAjaran} · Total ${students.length} Siswa`,
    pageWidth - marginX,
    y + 13.5,
    { align: 'right' }
  );

  y += 17;
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 4;

  const rows = students.map((s, idx) => {
    const st = printStatuses[s.nisn];
    return [
      String(idx + 1),
      s.nisn,
      `${s.nama}${s.isTahfidz ? ' ★' : ''}`,
      s.kelas,
      s.kelasBTQ,
      `${s.capaianTerakhir.tingkat} (${s.capaianTerakhir.halamanAyat})`,
      `${s.ujian.nilai} (${s.ujian.predikat})`,
      s.ujian.natijah,
      st ? `Sudah (${st.printCount}x)` : 'Belum'
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [['No', 'NISN', 'Nama Lengkap', 'Kls', 'Kelompok BTQ', 'Capaian', 'Nilai', 'Natijah', 'Status']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.6, textColor: [30, 41, 59] },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      3: { halign: 'center', cellWidth: 10 },
      6: { halign: 'center', cellWidth: 18 },
      8: { halign: 'center', cellWidth: 16 }
    }
  });

  const fileName = `Rekap_Rapor_${safeFileSegment(kelasLabel)}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
  return fileName;
}
