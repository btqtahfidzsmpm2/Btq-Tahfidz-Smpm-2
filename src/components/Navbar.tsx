import React from 'react';
import { UserSession } from '../types';
import { LogIn, LogOut, BookOpen } from 'lucide-react';

interface NavbarProps {
  currentView: 'public' | 'dashboard';
  onNavigate: (view: 'public' | 'dashboard') => void;
  user: UserSession | null;
  onOpenLogin: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  user,
  onOpenLogin,
  onLogout
}) => {
  return (
    <header className="bg-emerald-800 text-white shadow-md sticky top-0 z-40 no-print border-b border-emerald-900/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        
        {/* Zone 1: Single element Brand Wordmark */}
        <button
          onClick={() => onNavigate('public')}
          className="flex items-center gap-3 text-left text-white whitespace-nowrap shrink-0 hover:opacity-95 transition-opacity"
        >
          <img
            src="/assets/logo_spemda_quran.png"
            alt="Logo SMP Muhammadiyah 2 Surabaya & Fashahah Balaghah Qur'an"
            className="h-9 sm:h-10 w-auto object-contain bg-white/95 px-2 py-1 rounded-xl shadow-xs shrink-0"
          />
          <div className="flex flex-col">
            <span className="font-extrabold text-sm sm:text-base tracking-tight leading-none">
              SIM-QUR'AN SPEMDA
            </span>
            <span className="text-[10px] text-emerald-200 leading-tight">
              SMP Muhammadiyah 2 Surabaya
            </span>
          </div>
        </button>

        {/* Zone 2: 4-5 clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-emerald-100">
          <button
            onClick={() => onNavigate('public')}
            className={`transition-colors whitespace-nowrap shrink-0 pb-1 border-b-2 ${
              currentView === 'public'
                ? 'text-amber-300 border-amber-300 font-bold'
                : 'border-transparent hover:text-white'
            }`}
          >
            Portal Wali Murid
          </button>
          
          <button
            onClick={() => {
              if (!user) onOpenLogin();
              else onNavigate('dashboard');
            }}
            className={`transition-colors whitespace-nowrap shrink-0 pb-1 border-b-2 ${
              currentView === 'dashboard'
                ? 'text-amber-300 border-amber-300 font-bold'
                : 'border-transparent hover:text-white'
            }`}
          >
            Dashboard Petugas
          </button>

          <span className="text-emerald-300/40" aria-hidden="true">·</span>

          <span className="text-emerald-200/80 whitespace-nowrap shrink-0 text-[11px] font-normal">
            TP 2026/2027
          </span>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          {!user ? (
            <button
              onClick={onOpenLogin}
              className="px-3.5 py-2 text-xs font-bold text-slate-900 bg-amber-400 rounded-lg hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0 shadow-sm flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Login Petugas</span>
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-white truncate max-w-[160px] leading-tight">
                  {user.nama}
                </p>
                <p className="text-[10px] text-amber-300 font-medium uppercase tracking-wide">
                  {user.role.replace('_', ' ')}
                  {user.assignedGroup ? ` · ${user.assignedGroup}` : ''}
                  {user.assignedClass ? ` · Kelas ${user.assignedClass}` : ''}
                </p>
              </div>

              <button
                onClick={onLogout}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-700/80 hover:bg-rose-700 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
                title="Keluar"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};
