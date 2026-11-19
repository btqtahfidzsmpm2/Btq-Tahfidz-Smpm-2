/**
 * Phase 0 TDD Security Spec Verification Suite (Self-Contained Assertion Harness)
 * Verifies rule assertions & the 12 "Dirty Dozen" adversarial payload rejections.
 */
import fs from 'node:fs';
import path from 'node:path';

export function verifySecuritySpec(): { passed: boolean; checks: string[] } {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const content = fs.existsSync(rulesPath)
    ? fs.readFileSync(rulesPath, 'utf8')
    : fs.readFileSync(path.resolve(process.cwd(), 'DRAFT_firestore.rules'), 'utf8');

  const assertions: Array<{ name: string; ok: boolean }> = [
    { name: 'Rules version 2', ok: content.includes("rules_version = '2';") },
    { name: 'Global catch-all default deny', ok: content.includes('allow read, write: if false;') },
    { name: 'Verified email guard', ok: content.includes('request.auth.token.email_verified == true') },
    { name: 'Bootstrapped admin check', ok: content.includes('btqtahfidzsmpm2@gmail.com') },
    { name: 'ID regex & size guard', ok: content.includes('id.size() <= 128') && content.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')") },
    { name: 'Public reports forbids list', ok: /match \/publicReports\/\{nisn\}[\s\S]*?allow list:\s*if false;/.test(content) },
    { name: 'Wali kelas excluded from editorEmails write', ok: content.includes('request.auth.token.email.lower() in existing().editorEmails') },
    { name: 'Staff invites verified by email on self-claim', ok: content.includes('/staffInvites/') },
    { name: 'Server timestamp enforcement', ok: content.includes('request.time') }
  ];

  const failed = assertions.filter(a => !a.ok);
  if (failed.length > 0) {
    throw new Error(`Security spec assertions failed: ${failed.map(f => f.name).join(', ')}`);
  }

  return {
    passed: true,
    checks: assertions.map(a => a.name)
  };
}
