import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const BOOTSTRAP_ADMIN_EMAIL = 'btqtahfidzsmpm2@gmail.com';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
    },
    operationType,
    path
  };
  const serialized = JSON.stringify(errInfo);
  console.error('Firestore Error: ', serialized);
  throw new Error(serialized);
}

/**
 * Sanitizes any string into a Firestore-safe document ID matching ^[a-zA-Z0-9_-]+$ (1..maxLen).
 */
export function sanitizeDocId(raw: string, maxLen: number = 128): string {
  const cleaned = (raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen);
  return cleaned || `doc-${Date.now()}`;
}

export function clampStr(value: string | undefined | null, maxLen: number, fallback: string = ''): string {
  const str = (value ?? fallback).toString().trim();
  return str.slice(0, maxLen);
}

export function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase().slice(0, 150);
}

export type CloudConnectionStatus = 'checking' | 'connected' | 'offline';

let cachedConnectionStatus: CloudConnectionStatus = 'checking';

export async function testConnection(): Promise<CloudConnectionStatus> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    cachedConnectionStatus = 'connected';
    return 'connected';
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      cachedConnectionStatus = 'offline';
      console.error('Please check your Firebase configuration. Client is offline.');
      return 'offline';
    }
    // Permission / not-found still confirms server reachability
    cachedConnectionStatus = 'connected';
    return 'connected';
  }
}

export function getCachedConnectionStatus(): CloudConnectionStatus {
  return cachedConnectionStatus;
}
