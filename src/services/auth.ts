import { Role, Teacher, UserAccount, UserSession, AuthLogEntry } from '../types';
import { HOMEROOM_CLASSES } from '../data/initialData';

const KEY_ACCOUNTS = 'spemda_auth_accounts_v1';
const KEY_AUTH_LOGS = 'spemda_auth_logs_v1';
const KEY_SESSION = 'spemda_active_session_v1';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 60 * 1000; // 60 seconds cooldown after 5 failed attempts
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours session validity

export const DEFAULT_PASSWORDS = {
  admin: 'Spemda@2026',
  guru: 'GuruSpemda@2026',
  waliKelas: 'WaliSpemda@2026'
} as const;

// Pure JS SHA-256 fallback if Web Crypto subtle is unavailable
function sha256Fallback(ascii: string): string {
  const rightRotate = (value: number, amount: number) =>
    (value >>> amount) | (value << (32 - amount));

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (let i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  let padded = ascii + '\x80';
  while ((padded.length % 64) - 56) padded += '\x00';
  for (let i = 0; i < padded.length; i++) {
    const j = padded.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (let j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);

    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const a = hash[0];
      const e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);

      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));

      hash.unshift((temp1 + temp2) | 0);
      hash.pop();
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (let i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (let i = 0; i < 8; i++) {
    for (let j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

function generateSalt(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const input = `${salt}:${password}`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(input);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Fallback below
  }
  return sha256Fallback(unescape(encodeURIComponent(input)));
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function slugifyUsername(name: string, existingSet?: Set<string>): string {
  // Remove common academic titles and honorifics for cleaner usernames
  const cleaned = name
    .toLowerCase()
    .replace(/\b(s\.?pd\.?i?|s\.?ag|m\.?pd|s\.?si|s\.?kom|al-hafidz|lc|ma)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let base = cleaned.slice(0, 2).join('.');
  if (!base) {
    base = 'guru.' + Math.random().toString(36).slice(2, 6);
  }

  if (!existingSet) return base;

  let candidate = base;
  let counter = 2;
  while (existingSet.has(candidate)) {
    candidate = `${base}${counter++}`;
  }
  existingSet.add(candidate);
  return candidate;
}

export function evaluatePasswordStrength(password: string): {
  score: number;
  label: 'Sangat Lemah' | 'Lemah' | 'Sedang' | 'Kuat';
  colorClass: string;
} {
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (password.length < 6) {
    return { score: 1, label: 'Sangat Lemah', colorClass: 'text-rose-600 bg-rose-500' };
  }
  if (score <= 2) {
    return { score: 2, label: 'Lemah', colorClass: 'text-amber-600 bg-amber-500' };
  }
  if (score <= 3) {
    return { score: 3, label: 'Sedang', colorClass: 'text-blue-600 bg-blue-500' };
  }
  return { score: 4, label: 'Kuat', colorClass: 'text-emerald-700 bg-emerald-600' };
}

export function generateStrongPassword(length: number = 10): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$!';
  const all = upper + lower + digits + symbols;

  const chars = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)]
  ];

  for (let i = chars.length; i < length; i++) {
    chars.push(all[Math.floor(Math.random() * all.length)]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

export const authService = {
  getAccounts(): UserAccount[] {
    try {
      const raw = localStorage.getItem(KEY_ACCOUNTS);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // ignore
    }
    return [];
  },

  saveAccounts(accounts: UserAccount[]): void {
    try {
      localStorage.setItem(KEY_ACCOUNTS, JSON.stringify(accounts));
    } catch {
      // ignore
    }
  },

  getLogs(): AuthLogEntry[] {
    try {
      const raw = localStorage.getItem(KEY_AUTH_LOGS);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return [];
  },

  appendLog(entry: Omit<AuthLogEntry, 'id' | 'timestamp'>): void {
    const logs = this.getLogs();
    const newEntry: AuthLogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString()
    };
    const updated = [newEntry, ...logs].slice(0, 60);
    try {
      localStorage.setItem(KEY_AUTH_LOGS, JSON.stringify(updated));
    } catch {
      // ignore
    }
  },

  /**
   * Ensures Admin, Teacher (Guru Ngaji & Tahfidz), and Wali Kelas accounts exist and stay synced.
   */
  async syncAccounts(teachers: Teacher[]): Promise<UserAccount[]> {
    const existing = this.getAccounts();
    const now = new Date().toISOString();
    const accounts = [...existing];
    const usedUsernames = new Set(accounts.map(a => a.username.toLowerCase()));
    let changed = false;

    // 1. Ensure primary Admin account exists
    const hasAdmin = accounts.some(a => a.role === 'admin');
    if (!hasAdmin) {
      const salt = generateSalt();
      const passwordHash = await hashPassword(DEFAULT_PASSWORDS.admin, salt);
      const adminUsername = usedUsernames.has('admin')
        ? `admin.${Date.now().toString().slice(-3)}`
        : 'admin';
      usedUsernames.add(adminUsername);

      accounts.unshift({
        id: 'acc-admin-primary',
        username: adminUsername,
        passwordHash,
        salt,
        role: 'admin',
        nama: "Administrator Utama SIM-Qur'an",
        isActive: true,
        isDefaultPassword: true,
        failedAttempts: 0,
        createdAt: now,
        updatedAt: now
      });
      changed = true;
    }

    // 2. Sync Teacher accounts (Guru Ngaji & Guru Tahfidz)
    for (const teacher of teachers) {
      const normName = teacher.nama.trim().toUpperCase();
      const idx = accounts.findIndex(
        a =>
          (a.teacherId && a.teacherId === teacher.id) ||
          ((a.role === 'guru_ngaji' || a.role === 'guru_tahfidz') &&
            a.nama.trim().toUpperCase() === normName)
      );

      if (idx !== -1) {
        const acc = accounts[idx];
        const needsUpdate =
          acc.teacherId !== teacher.id ||
          acc.role !== teacher.role ||
          acc.nama !== normName ||
          acc.assignedGroup !== teacher.kelompokBTQ;

        if (needsUpdate) {
          accounts[idx] = {
            ...acc,
            teacherId: teacher.id,
            role: teacher.role,
            nama: normName,
            assignedGroup: teacher.kelompokBTQ,
            updatedAt: now
          };
          changed = true;
        }
      } else {
        const username = slugifyUsername(teacher.nama, usedUsernames);
        const salt = generateSalt();
        const passwordHash = await hashPassword(DEFAULT_PASSWORDS.guru, salt);
        accounts.push({
          id: `acc-tch-${teacher.id}`,
          username,
          passwordHash,
          salt,
          role: teacher.role,
          nama: normName,
          teacherId: teacher.id,
          assignedGroup: teacher.kelompokBTQ,
          isActive: true,
          isDefaultPassword: true,
          failedAttempts: 0,
          createdAt: now,
          updatedAt: now
        });
        changed = true;
      }
    }

    // Remove auto-synced teacher accounts whose teacher was deleted
    const teacherIds = new Set(teachers.map(t => t.id));
    const teacherNames = new Set(teachers.map(t => t.nama.trim().toUpperCase()));
    const filtered = accounts.filter(acc => {
      if (acc.role === 'guru_ngaji' || acc.role === 'guru_tahfidz') {
        if (acc.teacherId) {
          if (!teacherIds.has(acc.teacherId) && !teacherNames.has(acc.nama.trim().toUpperCase())) {
            changed = true;
            return false;
          }
        }
      }
      return true;
    });

    // 3. Ensure Wali Kelas accounts exist
    for (const cls of HOMEROOM_CLASSES) {
      const hasWali = filtered.some(
        a => a.role === 'wali_kelas' && a.assignedClass?.toUpperCase() === cls.toUpperCase()
      );
      if (!hasWali) {
        let username = `walikelas.${cls.toLowerCase()}`;
        if (usedUsernames.has(username)) {
          username = `wali.${cls.toLowerCase()}.${Date.now().toString().slice(-3)}`;
        }
        usedUsernames.add(username);
        const salt = generateSalt();
        const passwordHash = await hashPassword(DEFAULT_PASSWORDS.waliKelas, salt);
        filtered.push({
          id: `acc-wali-${cls.toLowerCase()}`,
          username,
          passwordHash,
          salt,
          role: 'wali_kelas',
          nama: `Wali Kelas ${cls}`,
          assignedClass: cls,
          isActive: true,
          isDefaultPassword: true,
          failedAttempts: 0,
          createdAt: now,
          updatedAt: now
        });
        changed = true;
      }
    }

    if (changed || existing.length === 0) {
      this.saveAccounts(filtered);
    }
    return filtered;
  },

  /**
   * Authenticates a user strictly by username and password.
   */
  async authenticate(
    rawUsername: string,
    password: string,
    roleFilter?: Role | 'all'
  ): Promise<
    | { ok: true; session: UserSession }
    | { ok: false; error: string; lockedSeconds?: number }
  > {
    const username = rawUsername.trim().toLowerCase();
    if (!username || !password) {
      return {
        ok: false,
        error: 'Username dan password wajib diisi.'
      };
    }

    const accounts = this.getAccounts();
    const idx = accounts.findIndex(a => a.username.toLowerCase() === username);

    if (idx === -1) {
      this.appendLog({
        username,
        event: 'LOGIN_FAILED',
        detail: 'Percobaan login dengan username tidak terdaftar.'
      });
      return {
        ok: false,
        error: 'Username atau password salah. Periksa kembali data akun Anda.'
      };
    }

    const account = accounts[idx];

    if (roleFilter && roleFilter !== 'all' && account.role !== roleFilter) {
      return {
        ok: false,
        error: `Akun "${username}" terdaftar sebagai ${account.role.replace('_', ' ').toUpperCase()}, bukan kategori peran yang dipilih.`
      };
    }

    if (!account.isActive) {
      this.appendLog({
        username: account.username,
        nama: account.nama,
        role: account.role,
        event: 'LOGIN_FAILED',
        detail: 'Percobaan login pada akun yang dinonaktifkan.'
      });
      return {
        ok: false,
        error: 'Akun ini sedang dinonaktifkan oleh Administrator. Hubungi Admin SIM-Qur\'an.'
      };
    }

    const nowMs = Date.now();
    if (account.lockedUntil && account.lockedUntil > nowMs) {
      const remainingSec = Math.ceil((account.lockedUntil - nowMs) / 1000);
      return {
        ok: false,
        error: `Akun dikunci sementara demi keamanan karena terlalu banyak percobaan gagal. Coba lagi dalam ${remainingSec} detik.`,
        lockedSeconds: remainingSec
      };
    }

    // If previous lock expired, clear failedAttempts before checking
    const currentFailed = account.lockedUntil && account.lockedUntil <= nowMs ? 0 : account.failedAttempts || 0;

    const computedHash = await hashPassword(password, account.salt);
    const isValid = constantTimeCompare(computedHash, account.passwordHash);

    if (!isValid) {
      const nextFailed = currentFailed + 1;
      if (nextFailed >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = nowMs + LOCK_DURATION_MS;
        accounts[idx] = {
          ...account,
          failedAttempts: nextFailed,
          lockedUntil,
          updatedAt: new Date().toISOString()
        };
        this.saveAccounts(accounts);
        this.appendLog({
          username: account.username,
          nama: account.nama,
          role: account.role,
          event: 'ACCOUNT_LOCKED',
          detail: `Akun dikunci 60 detik setelah ${MAX_FAILED_ATTEMPTS} kali salah password.`
        });
        return {
          ok: false,
          error: `Password salah ${MAX_FAILED_ATTEMPTS} kali. Akun dikunci sementara selama 60 detik.`,
          lockedSeconds: 60
        };
      } else {
        accounts[idx] = {
          ...account,
          failedAttempts: nextFailed,
          lockedUntil: undefined,
          updatedAt: new Date().toISOString()
        };
        this.saveAccounts(accounts);
        this.appendLog({
          username: account.username,
          nama: account.nama,
          role: account.role,
          event: 'LOGIN_FAILED',
          detail: `Password salah (percobaan ke-${nextFailed} dari ${MAX_FAILED_ATTEMPTS}).`
        });
        const remainingAttempts = MAX_FAILED_ATTEMPTS - nextFailed;
        return {
          ok: false,
          error: `Username atau password salah. Sisa percobaan sebelum kunci sementara: ${remainingAttempts} kali.`
        };
      }
    }

    // Success!
    const nowIso = new Date().toISOString();
    accounts[idx] = {
      ...account,
      failedAttempts: 0,
      lockedUntil: undefined,
      lastLogin: nowIso,
      updatedAt: nowIso
    };
    this.saveAccounts(accounts);

    this.appendLog({
      username: account.username,
      nama: account.nama,
      role: account.role,
      event: 'LOGIN_SUCCESS',
      detail: `Login berhasil ke dashboard ${account.role.replace('_', ' ')}.`
    });

    const session: UserSession = {
      accountId: account.id,
      username: account.username,
      role: account.role,
      nama: account.nama,
      assignedGroup: account.assignedGroup,
      assignedClass: account.assignedClass,
      isDefaultPassword: account.isDefaultPassword,
      loginAt: nowMs
    };

    try {
      sessionStorage.setItem(KEY_SESSION, JSON.stringify(session));
    } catch {
      // ignore
    }

    return { ok: true, session };
  },

  getSavedSession(): UserSession | null {
    try {
      const raw = sessionStorage.getItem(KEY_SESSION);
      if (!raw) return null;
      const session: UserSession = JSON.parse(raw);
      if (!session || !session.accountId || !session.loginAt) return null;

      // Expire after 8 hours
      if (Date.now() - session.loginAt > SESSION_DURATION_MS) {
        this.logout();
        return null;
      }

      // Verify account still exists & is active
      const acc = this.getAccounts().find(a => a.id === session.accountId);
      if (!acc || !acc.isActive) {
        this.logout();
        return null;
      }

      return {
        ...session,
        username: acc.username,
        nama: acc.nama,
        role: acc.role,
        assignedGroup: acc.assignedGroup,
        assignedClass: acc.assignedClass,
        isDefaultPassword: acc.isDefaultPassword
      };
    } catch {
      return null;
    }
  },

  logout(): void {
    try {
      sessionStorage.removeItem(KEY_SESSION);
    } catch {
      // ignore
    }
  },

  async changeOwnPassword(
    accountId: string,
    currentPassword: string,
    newPassword: string,
    newUsername?: string
  ): Promise<{ ok: true; updatedSession?: Partial<UserSession> } | { ok: false; error: string }> {
    const accounts = this.getAccounts();
    const idx = accounts.findIndex(a => a.id === accountId);
    if (idx === -1) {
      return { ok: false, error: 'Akun tidak ditemukan.' };
    }

    const account = accounts[idx];
    const currentHash = await hashPassword(currentPassword, account.salt);
    if (!constantTimeCompare(currentHash, account.passwordHash)) {
      return { ok: false, error: 'Password saat ini tidak sesuai.' };
    }

    if (newPassword.length < 6) {
      return { ok: false, error: 'Password baru minimal harus 6 karakter.' };
    }

    if (newPassword === currentPassword) {
      return { ok: false, error: 'Password baru harus berbeda dari password saat ini.' };
    }

    let finalUsername = account.username;
    if (newUsername && newUsername.trim()) {
      const normalized = newUsername.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (normalized.length < 3) {
        return { ok: false, error: 'Username minimal 3 karakter (huruf, angka, titik, atau strip).' };
      }
      const duplicate = accounts.some(
        a => a.id !== accountId && a.username.toLowerCase() === normalized
      );
      if (duplicate) {
        return { ok: false, error: `Username "${normalized}" sudah digunakan akun lain.` };
      }
      finalUsername = normalized;
    }

    const newSalt = generateSalt();
    const newHash = await hashPassword(newPassword, newSalt);
    const nowIso = new Date().toISOString();

    accounts[idx] = {
      ...account,
      username: finalUsername,
      passwordHash: newHash,
      salt: newSalt,
      isDefaultPassword: false,
      updatedAt: nowIso
    };
    this.saveAccounts(accounts);

    // Update sessionStorage if active
    const saved = this.getSavedSession();
    if (saved && saved.accountId === accountId) {
      try {
        sessionStorage.setItem(
          KEY_SESSION,
          JSON.stringify({
            ...saved,
            username: finalUsername,
            isDefaultPassword: false
          })
        );
      } catch {
        // ignore
      }
    }

    this.appendLog({
      username: finalUsername,
      nama: account.nama,
      role: account.role,
      event: 'PASSWORD_CHANGED',
      detail: 'Pengguna berhasil memperbarui kredensial password secara mandiri.'
    });

    return {
      ok: true,
      updatedSession: {
        username: finalUsername,
        isDefaultPassword: false
      }
    };
  },

  async adminResetPassword(
    accountId: string,
    newPassword: string,
    markAsDefault: boolean = false
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (newPassword.length < 6) {
      return { ok: false, error: 'Password minimal 6 karakter.' };
    }
    const accounts = this.getAccounts();
    const idx = accounts.findIndex(a => a.id === accountId);
    if (idx === -1) {
      return { ok: false, error: 'Akun tidak ditemukan.' };
    }

    const newSalt = generateSalt();
    const newHash = await hashPassword(newPassword, newSalt);
    accounts[idx] = {
      ...accounts[idx],
      passwordHash: newHash,
      salt: newSalt,
      isDefaultPassword: markAsDefault,
      failedAttempts: 0,
      lockedUntil: undefined,
      updatedAt: new Date().toISOString()
    };
    this.saveAccounts(accounts);

    this.appendLog({
      username: accounts[idx].username,
      nama: accounts[idx].nama,
      role: accounts[idx].role,
      event: 'PASSWORD_RESET',
      detail: 'Password direset / diperbarui oleh Administrator.'
    });

    return { ok: true };
  },

  async upsertTeacherCredentials(params: {
    teacher: Teacher;
    username?: string;
    password?: string;
  }): Promise<{ ok: true; username: string } | { ok: false; error: string }> {
    const accounts = this.getAccounts();
    const nowIso = new Date().toISOString();
    const existingIdx = accounts.findIndex(
      a =>
        a.teacherId === params.teacher.id ||
        ((a.role === 'guru_ngaji' || a.role === 'guru_tahfidz') &&
          a.nama.trim().toUpperCase() === params.teacher.nama.trim().toUpperCase())
    );

    const usedUsernames = new Set(
      accounts
        .filter((_, i) => i !== existingIdx)
        .map(a => a.username.toLowerCase())
    );

    let desiredUsername = params.username
      ? params.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
      : existingIdx !== -1
      ? accounts[existingIdx].username
      : slugifyUsername(params.teacher.nama, usedUsernames);

    if (desiredUsername.length < 3) {
      return { ok: false, error: 'Username minimal 3 karakter (huruf/angka/titik).' };
    }

    if (usedUsernames.has(desiredUsername)) {
      if (params.username) {
        return { ok: false, error: `Username "${desiredUsername}" sudah digunakan oleh akun lain.` };
      }
      desiredUsername = slugifyUsername(params.teacher.nama, usedUsernames);
    }

    if (existingIdx !== -1) {
      const current = accounts[existingIdx];
      let passwordHash = current.passwordHash;
      let salt = current.salt;
      let isDefaultPassword = current.isDefaultPassword;

      if (params.password && params.password.trim().length > 0) {
        if (params.password.trim().length < 6) {
          return { ok: false, error: 'Password guru minimal 6 karakter.' };
        }
        salt = generateSalt();
        passwordHash = await hashPassword(params.password.trim(), salt);
        isDefaultPassword = false;
      }

      accounts[existingIdx] = {
        ...current,
        username: desiredUsername,
        teacherId: params.teacher.id,
        role: params.teacher.role,
        nama: params.teacher.nama.trim().toUpperCase(),
        assignedGroup: params.teacher.kelompokBTQ,
        passwordHash,
        salt,
        isDefaultPassword,
        updatedAt: nowIso
      };
      this.saveAccounts(accounts);
      return { ok: true, username: desiredUsername };
    } else {
      const rawPassword =
        params.password && params.password.trim().length > 0
          ? params.password.trim()
          : DEFAULT_PASSWORDS.guru;

      if (rawPassword.length < 6) {
        return { ok: false, error: 'Password guru minimal 6 karakter.' };
      }

      const salt = generateSalt();
      const passwordHash = await hashPassword(rawPassword, salt);

      accounts.push({
        id: `acc-tch-${params.teacher.id}`,
        username: desiredUsername,
        passwordHash,
        salt,
        role: params.teacher.role,
        nama: params.teacher.nama.trim().toUpperCase(),
        teacherId: params.teacher.id,
        assignedGroup: params.teacher.kelompokBTQ,
        isActive: true,
        isDefaultPassword: !(params.password && params.password.trim().length > 0),
        failedAttempts: 0,
        createdAt: nowIso,
        updatedAt: nowIso
      });
      this.saveAccounts(accounts);
      this.appendLog({
        username: desiredUsername,
        nama: params.teacher.nama.toUpperCase(),
        role: params.teacher.role,
        event: 'ACCOUNT_CREATED',
        detail: `Akun guru ${params.teacher.role === 'guru_tahfidz' ? 'Tahfidz' : 'Ngaji'} dibuat.`
      });
      return { ok: true, username: desiredUsername };
    }
  },

  async createAccount(params: {
    username: string;
    password: string;
    nama: string;
    role: Role;
    assignedGroup?: string;
    assignedClass?: string;
  }): Promise<{ ok: true; account: UserAccount } | { ok: false; error: string }> {
    const cleanUsername = params.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (cleanUsername.length < 3) {
      return { ok: false, error: 'Username minimal 3 karakter (huruf, angka, titik, strip).' };
    }
    if (params.password.length < 6) {
      return { ok: false, error: 'Password minimal 6 karakter.' };
    }
    if (!params.nama.trim()) {
      return { ok: false, error: 'Nama lengkap wajib diisi.' };
    }

    const accounts = this.getAccounts();
    if (accounts.some(a => a.username.toLowerCase() === cleanUsername)) {
      return { ok: false, error: `Username "${cleanUsername}" sudah terdaftar.` };
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(params.password, salt);
    const nowIso = new Date().toISOString();

    const newAccount: UserAccount = {
      id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      username: cleanUsername,
      passwordHash,
      salt,
      role: params.role,
      nama: params.nama.trim(),
      assignedGroup: params.assignedGroup,
      assignedClass: params.assignedClass,
      isActive: true,
      isDefaultPassword: false,
      failedAttempts: 0,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    accounts.unshift(newAccount);
    this.saveAccounts(accounts);

    this.appendLog({
      username: newAccount.username,
      nama: newAccount.nama,
      role: newAccount.role,
      event: 'ACCOUNT_CREATED',
      detail: `Akun baru (${newAccount.role.replace('_', ' ')}) dibuat oleh Administrator.`
    });

    return { ok: true, account: newAccount };
  },

  updateAccountMeta(
    accountId: string,
    updates: { username?: string; nama?: string; isActive?: boolean; unlock?: boolean }
  ): { ok: true } | { ok: false; error: string } {
    const accounts = this.getAccounts();
    const idx = accounts.findIndex(a => a.id === accountId);
    if (idx === -1) return { ok: false, error: 'Akun tidak ditemukan.' };

    const current = accounts[idx];
    let nextUsername = current.username;
    if (updates.username !== undefined) {
      const clean = updates.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (clean.length < 3) {
        return { ok: false, error: 'Username minimal 3 karakter.' };
      }
      if (accounts.some(a => a.id !== accountId && a.username.toLowerCase() === clean)) {
        return { ok: false, error: `Username "${clean}" sudah digunakan.` };
      }
      nextUsername = clean;
    }

    // Prevent disabling the last active admin
    if (updates.isActive === false && current.role === 'admin') {
      const otherActiveAdmin = accounts.some(
        a => a.id !== accountId && a.role === 'admin' && a.isActive
      );
      if (!otherActiveAdmin) {
        return { ok: false, error: 'Minimal harus ada 1 akun Administrator yang aktif.' };
      }
    }

    accounts[idx] = {
      ...current,
      username: nextUsername,
      nama: updates.nama !== undefined ? updates.nama.trim() : current.nama,
      isActive: updates.isActive !== undefined ? updates.isActive : current.isActive,
      failedAttempts: updates.unlock ? 0 : current.failedAttempts,
      lockedUntil: updates.unlock ? undefined : current.lockedUntil,
      updatedAt: new Date().toISOString()
    };

    this.saveAccounts(accounts);
    return { ok: true };
  },

  deleteAccount(accountId: string, currentAccountId?: string): { ok: true } | { ok: false; error: string } {
    if (accountId === currentAccountId) {
      return { ok: false, error: 'Tidak dapat menghapus akun yang sedang digunakan untuk login.' };
    }
    const accounts = this.getAccounts();
    const target = accounts.find(a => a.id === accountId);
    if (!target) return { ok: false, error: 'Akun tidak ditemukan.' };
    if (target.role === 'admin') {
      const otherAdmin = accounts.some(a => a.id !== accountId && a.role === 'admin' && a.isActive);
      if (!otherAdmin) {
        return { ok: false, error: 'Minimal harus tersisa 1 akun Administrator aktif.' };
      }
    }
    this.saveAccounts(accounts.filter(a => a.id !== accountId));
    return { ok: true };
  }
};
