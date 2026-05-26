import React, { useState, useEffect, lazy, Suspense } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import SignIn from './components/SignIn';
import MapView from './components/MapView';
import InstallButton from './components/InstallButton';
import { loadUserProfile } from './lib/userPrefs';

const Onboarding = lazy(() => import('./components/Onboarding'));
const PrivacySecurity = lazy(() => import('./components/PrivacySecurity'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const VerifyEmail = lazy(() => import('./components/VerifyEmail'));

function Spinner() {
  return (
    <div className="min-h-screen bg-[#0B1020] flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-[#00C896] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  // emailVerified is captured as state so VerifyEmail can flip it without
  // forcing a full reload.
  const [emailVerified, setEmailVerified] = useState(true);
  // Hash route for the static legal pages. Keeps the URL shareable
  // (#privacy, #terms) without pulling in a full router for two pages.
  const [hash, setHash] = useState(() =>
    typeof window === 'undefined' ? '' : window.location.hash,
  );

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      // Password users must verify; Google sign-in users are pre-verified
      // and arrive with emailVerified === true.
      const passwordUser =
        currentUser?.providerData?.[0]?.providerId === 'password';
      setEmailVerified(
        !currentUser || !passwordUser || currentUser.emailVerified,
      );
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Whenever a verified user signs in, check whether they've completed onboarding.
  useEffect(() => {
    if (!user || !emailVerified) {
      setNeedsOnboarding(false);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    loadUserProfile(user.uid)
      .then((profile) => {
        if (cancelled) return;
        setNeedsOnboarding(!profile?.onboardingComplete);
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, emailVerified]);

  // Static legal pages — reachable from any auth state, including signed-out.
  if (hash === '#privacy' || hash === '#privacy-security') {
    return (
      <>
        <Suspense fallback={<Spinner />}>
          <PrivacySecurity onBack={() => { window.location.hash = ''; }} />
        </Suspense>
      </>
    );
  }
  if (hash === '#terms') {
    return (
      <>
        <Suspense fallback={<Spinner />}>
          <TermsOfService onBack={() => { window.location.hash = ''; }} />
        </Suspense>
      </>
    );
  }

  if (loading || (user && emailVerified && profileLoading)) {
    return <Spinner />;
  }

  if (!user) {
    return <SignIn />;
  }

  if (user && !emailVerified) {
    return (
      <>
        <Suspense fallback={<Spinner />}>
          <VerifyEmail user={user} onVerified={() => setEmailVerified(true)} />
        </Suspense>
      </>
    );
  }

  if (user && needsOnboarding) {
    return (
      <>
        <Suspense fallback={<Spinner />}>
          <Onboarding
            user={user}
            onComplete={() => setNeedsOnboarding(false)}
          />
        </Suspense>
      </>
    );
  }

  return (
    <>
      <MapView user={user} />
      <InstallButton />
    </>
  );
}
