import React from 'react';
import { signInWithGoogle } from '../firebase';
import { LogIn, Navigation } from 'lucide-react';

interface SignInProps {
  onGuestAccess: () => void;
}

export default function SignIn({ onGuestAccess }: SignInProps) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-blue-200 animate-bounce-slow">
          <Navigation size={40} className="text-white" />
        </div>
        
        <h1 className="text-4xl font-black text-gray-900 mb-3 tracking-tight">Rumbo</h1>
        <p className="text-gray-500 text-lg mb-12 font-medium">Smart mobility for your city</p>
        
        <div className="space-y-4">
          <button
            onClick={() => signInWithGoogle()}
            className="w-full py-4 px-6 bg-gray-900 text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:bg-gray-800 transition-all active:scale-95 shadow-xl"
          >
            <LogIn size={20} />
            Continue with Google
          </button>
          
          <button
            onClick={onGuestAccess}
            className="w-full py-4 px-6 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200 transition-all active:scale-95"
          >
            Try as Guest
          </button>
        </div>
        
        <div className="mt-16 pt-8 border-t border-gray-100">
          <div className="flex justify-center gap-8">
            <div className="text-center">
              <div className="text-xl font-bold text-gray-900">12k+</div>
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Users</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-gray-900">4.9</div>
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Rating</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-gray-900">100%</div>
              <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">Eco</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
