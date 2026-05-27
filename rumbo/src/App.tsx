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
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Whenever a user signs in, check whether they've completed onboarding.
  useEffect(() => {
    if (!user) {
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
  }, [user]);

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

  if (loading || (user && profileLoading)) {
    return <Spinner />;
  }

  if (!user) {
    return <SignIn />;
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
