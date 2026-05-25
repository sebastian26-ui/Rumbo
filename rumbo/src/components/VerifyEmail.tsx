import React, { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { Mail, RefreshCw, LogOut } from 'lucide-react';
import { auth, logout, resendEmailVerification } from '../firebase';

interface Props {
  user: User;
  onVerified: () => void;
}

export default function VerifyEmail({ user, onVerified }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Poll Firebase every 5s for verification status. When the user clicks the
  // link in their email, this picks up the change and lets them in.
  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        await auth.currentUser?.reload();
        if (cancelled) return;
        if (auth.currentUser?.emailVerified) {
          onVerified();
        }
      } catch {
        /* ignore — network blip */
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [onVerified]);

  const handleResend = async () => {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await resendEmailVerification();
      setMessage('Verification email sent. Check your inbox (and spam folder).');
    } catch (e: any) {
      setError(e?.message ?? 'Could not resend verification email.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckNow = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await auth.currentUser?.reload();
      if (auth.currentUser?.emailVerified) {
        onVerified();
        return;
      }
      setError('Still not verified. Click the link in the email we sent.');
    } catch (e: any) {
      setError(e?.message ?? 'Could not check verification status.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch {
      /* surfaced by the auth observer */
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-blue-100 rounded-[2rem] flex items-center justify-center mx-auto mb-8">
          <Mail size={40} className="text-blue-600" />
        </div>
        <h1 className="text-3xl font-black text-gray-900 mb-3 tracking-tight">
          Check your inbox
        </h1>
        <p className="text-gray-500 text-base mb-2 font-medium">
          We sent a verification link to
        </p>
        <p className="text-gray-900 font-bold text-base mb-8 break-all">
          {user.email}
        </p>
        <p className="text-sm text-gray-500 mb-8 font-medium">
          Click the link to activate your account. This page will refresh automatically once you verify.
        </p>

        {message && (
          <div className="text-sm text-emerald-700 font-medium bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 mb-4">
            {message}
          </div>
        )}
        {error && (
          <div className="text-sm text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleCheckNow}
            disabled={submitting}
            className="w-full py-4 px-6 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition-all active:scale-95 shadow-xl shadow-blue-200 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <RefreshCw size={18} />
            I've verified — let me in
          </button>
          <button
            onClick={handleResend}
            disabled={submitting}
            className="w-full py-4 px-6 bg-white text-gray-900 font-bold rounded-2xl border border-gray-200 hover:bg-gray-50 transition-all active:scale-95 disabled:opacity-60"
          >
            Resend verification email
          </button>
          <button
            onClick={handleSignOut}
            disabled={submitting}
            className="w-full py-4 px-6 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
