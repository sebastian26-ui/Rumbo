import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
} from 'firebase/auth';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from 'firebase/app-check';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// App Check — protects Firestore + Auth from off-domain abuse. We only
// initialize when a site key is provided so local dev (without a key) still
// works.
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as
  | string
  | undefined;
if (recaptchaSiteKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    console.warn('App Check init failed', e);
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Error signing in with Google:', error);
    throw error;
  }
};

export const signUpWithEmail = async (email: string, password: string, name: string) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (name) {
    try {
      await updateProfile(result.user, { displayName: name });
    } catch (e) {
      console.warn('updateProfile failed', e);
    }
  }
  try {
    await sendEmailVerification(result.user);
  } catch (e) {
    console.warn('sendEmailVerification failed', e);
  }
  return result.user;
};

export const signInWithEmail = async (email: string, password: string) => {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const resendEmailVerification = async () => {
  if (!auth.currentUser) throw new Error('Not signed in');
  await sendEmailVerification(auth.currentUser);
};

/**
 * Self-service account deletion. Removes the user's Firestore documents
 * (top-level /users/{uid} and all known /users/{uid}/settings/* subdocs)
 * then deletes the Firebase Auth account. The auth.currentUser.delete()
 * call requires a recent sign-in — Firebase will throw
 * `auth/requires-recent-login` if the session is stale and the caller
 * must sign the user out and back in before retrying.
 */
export const deleteUserAccount = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const uid = user.uid;
  const settingsDocs: ReadonlyArray<'favorites' | 'preferences' | 'providers'> = [
    'favorites',
    'preferences',
    'providers',
  ];
  // Best-effort: missing docs are fine, but we want to surface real failures.
  for (const name of settingsDocs) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'settings', name));
    } catch (e: any) {
      if (e?.code && e.code !== 'not-found') {
        console.warn('deleteDoc failed', `users/${uid}/settings/${name}`, e);
      }
    }
  }
  try {
    await deleteDoc(doc(db, 'users', uid));
  } catch (e: any) {
    if (e?.code && e.code !== 'not-found') {
      console.warn('deleteDoc /users/{uid} failed', e);
    }
  }
  await user.delete();
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};
