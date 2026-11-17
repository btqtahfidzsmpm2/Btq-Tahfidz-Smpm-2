# Security Specification & TDD Audit (`security_spec.md`)

## 1. Data Invariants
1. **Default-Deny Catch-All**: All unmatched paths in Firestore are explicitly denied (`allow read, write: if false;`).
2. **Verified Identity & Anti-Spoofing**: Every authenticated read/write requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Bootstrapped Admin & Role Lookup**: `btqtahfidzsmpm2@gmail.com` with `email_verified == true` is the bootstrapped admin; additional admins require an `/admins/{uid}` document. Roles cannot be self-assigned by non-admin users.
4. **Teacher vs Wali Kelas Separation**:
   - Teachers (`guru_ngaji`, `guru_tahfidz`) and Wali Kelas (`wali_kelas`) only receive read/list access to documents where their verified email is in `resource.data.authorizedEmails`.
   - `wali_kelas` is strictly read-only (`editorEmails` omits Wali Kelas) and cannot mutate `students`, `bacaan`, `tahfidz`, or `absensi`.
   - Teachers (`guru_ngaji`, `guru_tahfidz`) may only create `bacaan`/`tahfidz`/`absensi` records referencing an existing parent `students/{nisn}` document whose `editorEmails` contains their verified email, and may only update non-structural progress/exam/attendance fields on `students/{nisn}`.
5. **No `get()`/`exists()` inside `allow list`**: Collection queries enforce `isBootstrapAdmin() || request.auth.token.email in resource.data.authorizedEmails` directly on `resource.data` without `get()` lookups.
6. **PII Isolation**: Staff directories (`/staffUsers`, `/staffDirectory`, `/accessRequests`) restrict reads to `isOwner` or `isAdmin()`. Public parent lookup (`/publicReports/{nisn}`) exposes no email/phone/address and forbids `list` (`allow list: if false`).
7. **Temporal & Structural Integrity**: All `createdAt` / `updatedAt` timestamps must equal `request.time`. All IDs validate `^[a-zA-Z0-9_-]+$` (`<= 128` chars), and all strings/arrays enforce explicit `.size()` bounds.

## 2. The "Dirty Dozen" Payloads (Expected: `PERMISSION_DENIED`)
1. **Unauthenticated List**: `GET /students` without `request.auth` -> DENIED.
2. **Email Verification Spoof**: `GET /students` with `email: "btqtahfidzsmpm2@gmail.com"` and `email_verified: false` -> DENIED.
3. **Cross-Teacher Query Scraping**: Teacher A (`guruA@gmail.com`) queries `/students` without filtering `authorizedEmails array-contains "guruA@gmail.com"` -> DENIED.
4. **Wali Kelas Grade Tampering**: `wali7d@gmail.com` (in `authorizedEmails` only, not `editorEmails`) tries `UPDATE /students/0101` changing `ujian.nilai` -> DENIED.
5. **Wali Kelas Bacaan Injection**: `wali7d@gmail.com` tries `CREATE /bacaan/b1` with `authorUid == request.auth.uid` -> DENIED.
6. **Shadow / Ghost Field Injection**: Teacher attempts `UPDATE /students/0101` adding `"isAdmin": true` or `"authorizedEmails": ["evil@gmail.com"]` -> DENIED (`affectedKeys().hasOnly(...)` & `isValidStudent`).
7. **Orphaned Bacaan Record**: Teacher attempts `CREATE /bacaan/b2` with `nisn: "NON_EXISTENT_999"` -> DENIED (`exists(.../students/...)`).
8. **ID Resource Poisoning**: User attempts `CREATE /accessRequests/<1500-char-junk-id>` -> DENIED (`isValidId` <= 128).
9. **String Overflow / Denial of Wallet**: Teacher attempts `CREATE /bacaan/b3` with `catatan` of 10,000 chars -> DENIED (`catatan.size() <= 300`).
10. **Self-Assigned Admin Escalation**: Teacher attempts `CREATE /staffUsers/$(uid)` with `role: "admin"` -> DENIED.
11. **Backdated Timestamp Spoof**: User attempts `CREATE /accessRequests/$(uid)` with client `createdAt` != `request.time` -> DENIED.
12. **Public Parent Directory Scraping**: Unauthenticated parent attempts `LIST /publicReports` -> DENIED (`allow list: if false`).
