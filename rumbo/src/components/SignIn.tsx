import React, { useState } from 'react';
import { signInWithGoogle, signUpWithEmail, signInWithEmail } from '../firebase';
import { LogIn, ArrowLeft } from 'lucide-react';
import disposableDomains from 'disposable-email-domains';

const DISPOSABLE = new Set<string>(disposableDomains as string[]);

function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return DISPOSABLE.has(email.slice(at + 1).toLowerCase());
}

// Rumbo brand palette pulled from the logo.
const BRAND_BG = '#8DAEBD';
const BRAND_DARK = '#202F47';
const BRAND_HOVER = '#7A9DAD';

type View = 'landing' | 'signup' | 'signin';

export default function SignIn() {
  const [view, setView] = useState<View>('landing');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [city, setCity] = useState('Santiago');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!name.trim() || !trimmedEmail || password.length < 8) {
      setError('Please enter your name, a valid email, and a password (8+ characters).');
      return;
    }
    if (isDisposableEmail(trimmedEmail)) {
      setError('Please use a real, non-disposable email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signUpWithEmail(trimmedEmail, password, name.trim());
      // Onboarding (provider selection) is handled by App after auth state changes.
    } catch (err: any) {
      setError(err?.message ?? 'Could not create your account.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (err: any) {
      setError(err?.message ?? 'Could not sign you in.');
    } finally {
      setSubmitting(false);
    }
  };

  if (view === 'signup' || view === 'signin') {
    const isSignUp = view === 'signup';
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full">
          <button
            onClick={() => { setView('landing'); setError(null); }}
            className="flex items-center gap-2 text-gray-500 font-bold mb-8 hover:text-gray-900"
          >
            <ArrowLeft size={18} /> Back
          </button>

          <h1
            className="text-3xl font-black mb-2 tracking-tight"
            style={{ color: BRAND_DARK }}
          >
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-gray-500 mb-8 font-medium">
            {isSignUp
              ? 'A few quick details and you’re in.'
              : 'Sign in to your Rumbo account.'}
          </p>

          <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="space-y-4">
            {isSignUp && (
              <>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    style={{ borderColor: 'transparent' }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_BG)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = '')}
                    className="w-full mt-1 px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none font-medium"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Santiago"
                    onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_BG)}
                    onBlur={(e) => (e.currentTarget.style.borderColor = '')}
                    className="w-full mt-1 px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none font-medium"
                  />
                </div>
              </>
            )}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_BG)}
                onBlur={(e) => (e.currentTarget.style.borderColor = '')}
                className="w-full mt-1 px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none font-medium"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                onFocus={(e) => (e.currentTarget.style.borderColor = BRAND_BG)}
                onBlur={(e) => (e.currentTarget.style.borderColor = '')}
                className="w-full mt-1 px-4 py-3 rounded-2xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none font-medium"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{ backgroundColor: BRAND_BG }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND_BG)}
              className="w-full py-4 px-6 text-white font-bold rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl disabled:opacity-60"
            >
              {submitting ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500 font-medium">
            {isSignUp ? (
              <>Already have an account?{' '}
                <button
                  onClick={() => { setView('signin'); setError(null); }}
                  style={{ color: BRAND_DARK }}
                  className="font-bold hover:underline"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>New to Rumbo?{' '}
                <button
                  onClick={() => { setView('signup'); setError(null); }}
                  style={{ color: BRAND_DARK }}
                  className="font-bold hover:underline"
                >
                  Create an account
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full text-center">
        <div className="w-24 h-24 mx-auto mb-8 animate-bounce-slow rounded-[2.5rem] overflow-hidden shadow-2xl">
          <img src="/logo.png" alt="Rumbo Logo" className="w-full h-full object-cover" />
        </div>

        <h1
          className="text-4xl font-black mb-3 tracking-tight"
          style={{ color: BRAND_DARK }}
        >
          Rumbo
        </h1>
        <p className="text-gray-500 text-lg mb-12 font-medium">Smart mobility for your city</p>

        <div className="space-y-3">
          <button
            onClick={() => setView('signup')}
            style={{ backgroundColor: BRAND_BG }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = BRAND_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = BRAND_BG)}
            className="w-full py-4 px-6 text-white font-bold rounded-2xl transition-all active:scale-95 shadow-xl"
          >
            Create an account
          </button>
          <button
            onClick={() => setView('signin')}
            style={{ color: BRAND_DARK }}
            className="w-full py-4 px-6 bg-white font-bold rounded-2xl border border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
          >
            I already have an account
          </button>
          <button
            onClick={() => signInWithGoogle()}
            style={{ backgroundColor: BRAND_DARK }}
            className="w-full py-4 px-6 text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 transition-all active:scale-95 shadow-xl"
          >
            <LogIn size={20} />
            Continue with Google
          </button>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-100">
          <div className="flex justify-center gap-8">
            <div className="text-center">
              <div
                className="text-xl font-bold"
                style={{ color: BRAND_DARK }}
              >
                100%
              </div>
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Eco</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
