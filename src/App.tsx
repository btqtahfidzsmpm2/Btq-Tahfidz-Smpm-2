/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Student,
  UserSession,
  BacaanRecord,
  TahfidzRecord,
  AbsensiRecord,
  Teacher,
  UserAccount,
  AuthLogEntry
} from './types';
import { storage } from './services/storage';
import { authService } from './services/auth';
import { Navbar } from './components/Navbar';
import { PublicPortal } from './components/PublicPortal';
import { TeacherDashboard } from './components/TeacherDashboard';
import { Toast, ToastMessage } from './components/Toast';

// Modals
import { LoginModal } from './components/modals/LoginModal';
import { ChangePasswordModal } from './components/modals/ChangePasswordModal';
import { InputBacaanModal } from './components/modals/InputBacaanModal';
import { InputTahfidzModal } from './components/modals/InputTahfidzModal';
import { InputUjianModal } from './components/modals/InputUjianModal';
import { PresensiModal } from './components/modals/PresensiModal';
import { AddStudentModal } from './components/modals/AddStudentModal';
import { ImportDataModal } from './components/modals/ImportDataModal';
import { TeacherModal } from './components/modals/TeacherModal';
import { ConfirmDeleteModal } from './components/modals/ConfirmDeleteModal';

export default function App() {
  const [currentView, setCurrentView] = useState<'public' | 'dashboard'>('public');
  const [user, setUser] = useState<UserSession | null>(null);

  // Core Data
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [authLogs, setAuthLogs] = useState<AuthLogEntry[]>([]);
  const [bacaanList, setBacaanList] = useState<BacaanRecord[]>([]);
  const [tahfidzList, setTahfidzList] = useState<TahfidzRecord[]>([]);
  const [absensiList, setAbsensiList] = useState<AbsensiRecord[]>([]);

  // Selected Student for Public View
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  // Active student for modals
  const [modalTargetStudent, setModalTargetStudent] = useState<Student | undefined>(undefined);
  const [studentToEdit, setStudentToEdit] = useState<Student | null>(null);

  // Active teacher for modals
  const [teacherToEdit, setTeacherToEdit] = useState<Teacher | null>(null);

  // Delete confirmation target
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'Siswa' | 'Guru Pengajar';
    name: string;
    idOrNisn: string;
  } | null>(null);

  // Modals state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showBacaanModal, setShowBacaanModal] = useState(false);
  const [showTahfidzModal, setShowTahfidzModal] = useState(false);
  const [showUjianModal, setShowUjianModal] = useState(false);
  const [showPresensiModal, setShowPresensiModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showTeacherModal, setShowTeacherModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: 'success' | 'error' | 'info', title: string, description?: string) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 7);
    setToasts(prev => [...prev, { id, type, title, description }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const refreshAccounts = () => {
    setAccounts(authService.getAccounts());
    setAuthLogs(authService.getLogs());
  };

  // Reload data from storage
  const reloadData = async () => {
    const stds = storage.getStudents();
    const tchs = storage.getTeachers();
    setStudents(stds);
    setTeachers(tchs);
    setBacaanList(storage.getBacaan());
    setTahfidzList(storage.getTahfidz());
    setAbsensiList(storage.getAbsensi());

    // Keep auth accounts synced with active teachers
    await authService.syncAccounts(tchs);
    refreshAccounts();

    // Sync selected student if any
    if (selectedStudent) {
      const refreshed = stds.find(s => s.nisn === selectedStudent.nisn);
      if (refreshed) setSelectedStudent(refreshed);
    }
  };

  useEffect(() => {
    const init = async () => {
      // 1. Deduplicate students so each name exists exactly once
      storage.deduplicateStudentsByName();
      // 2. Purge any orphan sample teachers and synchronize real teachers from student records
      storage.syncTeachersFromStudents(true);
      await reloadData();

      // 3. Restore active validated session if available
      const savedSession = authService.getSavedSession();
      if (savedSession) {
        setUser(savedSession);
      }
    };
    init();
  }, []);

  const handleSyncTeachers = () => {
    const res = storage.syncTeachersFromStudents(true);
    reloadData();
    addToast(
      'success',
      'Guru Berhasil Disinkronkan',
      `Guru contoh telah dibersihkan. ${res.teachers.length} guru pengajar riil berhasil dimuat dari data siswa terimpor.`
    );
  };

  const handleDeduplicateStudents = () => {
    const res = storage.deduplicateStudentsByName();
    reloadData();
    if (res.removedCount > 0) {
      addToast(
        'success',
        'Pembersihan Data Dobel Berhasil',
        `Berhasil menghapus ${res.removedCount} siswa yang namanya dobel. Kini terdapat ${res.uniqueCount} santri unik.`
      );
    } else {
      addToast(
        'info',
        'Data Sudah Bersih',
        `Seluruh ${res.uniqueCount} santri telah memiliki nama unik (tidak ada duplikat).`
      );
    }
  };

  const handleLogin = (session: UserSession) => {
    setUser(session);
    setCurrentView('dashboard');
    refreshAccounts();
    addToast(
      'success',
      'Login Berhasil',
      `Selamat datang, ${session.nama} (${session.role.replace('_', ' ').toUpperCase()}).`
    );
  };

  const handleLogout = () => {
    authService.logout();
    setUser(null);
    setCurrentView('public');
    addToast('info', 'Telah Keluar', 'Anda telah keluar dari portal pengajar.');
  };

  const handleViewStudentReport = (student: Student) => {
    setSelectedStudent(student);
    setCurrentView('public');
    addToast('info', 'Membuka Rapor Siswa', `Menampilkan rekapitulasi data ${student.nama}.`);
  };

  // Student Delete & Edit Handlers
  const handleDeleteStudent = (student: Student) => {
    setDeleteTarget({
      type: 'Siswa',
      name: `${student.nama} (${student.kelas} · NISN: ${student.nisn})`,
      idOrNisn: student.nisn
    });
    setShowDeleteConfirm(true);
  };

  const handleEditStudent = (student: Student) => {
    setStudentToEdit(student);
    setShowAddStudentModal(true);
  };

  // Teacher Add, Edit, Delete Handlers
  const handleAddTeacher = () => {
    setTeacherToEdit(null);
    setShowTeacherModal(true);
  };

  const handleEditTeacher = (teacher: Teacher) => {
    setTeacherToEdit(teacher);
    setShowTeacherModal(true);
  };

  const handleDeleteTeacher = (teacher: Teacher) => {
    setDeleteTarget({
      type: 'Guru Pengajar',
      name: `${teacher.nama} (${teacher.kelompokBTQ} · ${teacher.ruangan})`,
      idOrNisn: teacher.id
    });
    setShowDeleteConfirm(true);
  };

  // Execute Confirmed Delete in Real Time
  const handleConfirmDelete = () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'Siswa') {
      storage.deleteStudent(deleteTarget.idOrNisn);
      addToast(
        'success',
        'Data Siswa Berhasil Dihapus',
        `Data ${deleteTarget.name} telah dihapus dari sistem secara real time.`
      );
    } else if (deleteTarget.type === 'Guru Pengajar') {
      storage.deleteTeacher(deleteTarget.idOrNisn);
      addToast(
        'success',
        'Guru Pengajar Berhasil Dihapus',
        `Data ${deleteTarget.name} telah dihapus dari sistem secara real time.`
      );
    }

    reloadData();
    setDeleteTarget(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-800">
      
      {/* Navbar with 3-zone contract */}
      <Navbar
        currentView={currentView}
        onNavigate={view => setCurrentView(view)}
        user={user}
        onOpenLogin={() => setShowLoginModal(true)}
        onOpenChangePassword={() => setShowChangePasswordModal(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {currentView === 'public' ? (
          <PublicPortal
            students={students}
            bacaanList={bacaanList}
            tahfidzList={tahfidzList}
            absensiList={absensiList}
            selectedStudent={selectedStudent}
            onSelectStudent={setSelectedStudent}
            onNotify={addToast}
          />
        ) : user ? (
          <TeacherDashboard
            user={user}
            students={students}
            teachers={teachers}
            accounts={accounts}
            authLogs={authLogs}
            onRefreshAccounts={refreshAccounts}
            onOpenChangePasswordModal={() => setShowChangePasswordModal(true)}
            onOpenBacaanModal={student => {
              setModalTargetStudent(student);
              setShowBacaanModal(true);
            }}
            onOpenTahfidzModal={student => {
              setModalTargetStudent(student);
              setShowTahfidzModal(true);
            }}
            onOpenUjianModal={student => {
              setModalTargetStudent(student);
              setShowUjianModal(true);
            }}
            onOpenPresensiModal={() => setShowPresensiModal(true)}
            onOpenAddStudentModal={() => {
              setStudentToEdit(null);
              setShowAddStudentModal(true);
            }}
            onOpenEditStudentModal={handleEditStudent}
            onDeleteStudent={handleDeleteStudent}
            onOpenAddTeacherModal={handleAddTeacher}
            onOpenEditTeacherModal={handleEditTeacher}
            onDeleteTeacher={handleDeleteTeacher}
            onOpenImportModal={() => setShowImportModal(true)}
            onViewStudentReport={handleViewStudentReport}
            onSyncTeachersFromStudents={handleSyncTeachers}
            onDeduplicateStudents={handleDeduplicateStudents}
            onDataUpdated={reloadData}
            onNotify={addToast}
          />
        ) : (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
            <p className="text-sm text-slate-600 mb-3">
              Silakan login terlebih dahulu untuk mengakses ruang kerja pengajar dan wali kelas.
            </p>
            <button
              onClick={() => setShowLoginModal(true)}
              className="px-4 py-2 bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-2xs"
            >
              Buka Dialog Login
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500 no-print mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>
            &copy; 2026 SMP Muhammadiyah 2 Surabaya · SIM-Qur'an & Tahfidz Terpadu.
          </p>
          <div className="flex items-center gap-3 text-slate-400">
            <span>Tilawati Remaja</span>
            <span aria-hidden="true">·</span>
            <span>Munaqosyah Al-Qur'an</span>
            <span aria-hidden="true">·</span>
            <span>Tahfidzul Qur'an</span>
          </div>
        </div>
      </footer>

      {/* Interactive Modals */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onLogin={handleLogin}
      />

      {user && (
        <>
          <ChangePasswordModal
            isOpen={showChangePasswordModal}
            onClose={() => setShowChangePasswordModal(false)}
            user={user}
            onSuccess={updated => {
              setUser(prev => (prev ? { ...prev, ...updated } : null));
              refreshAccounts();
            }}
            onNotify={addToast}
          />
          <InputBacaanModal
            isOpen={showBacaanModal}
            onClose={() => {
              setShowBacaanModal(false);
              setModalTargetStudent(undefined);
            }}
            students={students}
            initialStudent={modalTargetStudent}
            user={user}
            onSuccess={reloadData}
            onNotify={addToast}
          />

          <InputTahfidzModal
            isOpen={showTahfidzModal}
            onClose={() => {
              setShowTahfidzModal(false);
              setModalTargetStudent(undefined);
            }}
            students={students}
            initialStudent={modalTargetStudent}
            user={user}
            onSuccess={reloadData}
            onNotify={addToast}
          />

          <InputUjianModal
            isOpen={showUjianModal}
            onClose={() => {
              setShowUjianModal(false);
              setModalTargetStudent(undefined);
            }}
            students={students}
            initialStudent={modalTargetStudent}
            onSuccess={reloadData}
            onNotify={addToast}
          />

          <PresensiModal
            isOpen={showPresensiModal}
            onClose={() => setShowPresensiModal(false)}
            students={
              user.role === 'admin'
                ? students
                : user.role === 'guru_ngaji'
                ? students.filter(
                    s =>
                      s.pengajar.toLowerCase().includes(user.nama.toLowerCase()) ||
                      (user.assignedGroup && s.kelasBTQ.toLowerCase().includes(user.assignedGroup.toLowerCase()))
                  )
                : user.role === 'guru_tahfidz'
                ? students.filter(s => s.isTahfidz)
                : students.filter(s => s.kelas === (user.assignedClass || '7D'))
            }
            onSuccess={reloadData}
            onNotify={addToast}
          />

          <AddStudentModal
            isOpen={showAddStudentModal}
            studentToEdit={studentToEdit}
            teachersList={teachers.map(t => t.nama)}
            onClose={() => {
              setShowAddStudentModal(false);
              setStudentToEdit(null);
            }}
            onSuccess={() => reloadData()}
            onNotify={addToast}
          />

          <ImportDataModal
            isOpen={showImportModal}
            onClose={() => setShowImportModal(false)}
            onSuccess={() => reloadData()}
            onNotify={addToast}
          />

          <TeacherModal
            isOpen={showTeacherModal}
            teacherToEdit={teacherToEdit}
            onClose={() => {
              setShowTeacherModal(false);
              setTeacherToEdit(null);
            }}
            onSuccess={() => reloadData()}
            onNotify={addToast}
          />

          <ConfirmDeleteModal
            isOpen={showDeleteConfirm}
            onClose={() => {
              setShowDeleteConfirm(false);
              setDeleteTarget(null);
            }}
            onConfirm={handleConfirmDelete}
            title={deleteTarget?.type === 'Siswa' ? 'Hapus Data Siswa' : 'Hapus Guru Pengajar'}
            itemName={deleteTarget?.name || ''}
            itemType={deleteTarget?.type || 'Siswa'}
          />
        </>
      )}

      {/* In-app Toast notifications */}
      <Toast toasts={toasts} onDismiss={removeToast} />

    </div>
  );
}
