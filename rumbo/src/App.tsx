import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';
import SignIn from './components/SignIn';
import MapView from './components/MapView';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B1020] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#00C896] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user && !isGuest) {
    return <SignIn onGuestAccess={() => setIsGuest(true)} />;
  }

  return <MapView user={user} />;
}
