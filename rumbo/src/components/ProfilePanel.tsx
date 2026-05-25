import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import { X, Star, Pencil, Trash2, Plus, LogOut, Search, Check, ShieldCheck, AlertTriangle } from 'lucide-react';
import { logout, deleteUserAccount } from '../firebase';
import { Suggestion } from '../types';
import {
  FavoritePlace,
  newFavoriteId,
  saveFavorites,
} from '../lib/favorites';

interface Props {
  open: boolean;
  onClose: () => void;
  user: User;
  favorites: FavoritePlace[];
  onFavoritesChange: (next: FavoritePlace[]) => void;
  /** Map center for autocomplete biasing. */
  mapCenter: [number, number];
}

export default function ProfilePanel({
  open,
  onClose,
  user,
  favorites,
  onFavoritesChange,
  mapCenter,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteUserAccount();
      // Auth observer in App.tsx will pick up the sign-out and route to SignIn.
    } catch (e: any) {
      if (e?.code === 'auth/requires-recent-login') {
        setDeleteError('For your security, sign out and sign back in, then try again.');
      } else {
        setDeleteError(e?.message ?? 'Could not delete your account.');
      }
      setDeleting(false);
    }
  };

  const persist = async (next: FavoritePlace[]) => {
    onFavoritesChange(next);
    await saveFavorites(user.uid, next);
  };

  const addFavorite = (fav: FavoritePlace) => {
    persist([fav, ...favorites]);
    setAdding(false);
  };

  const renameFavorite = (id: string, name: string) => {
    persist(favorites.map((f) => (f.id === id ? { ...f, name } : f)));
    setEditingId(null);
  };

  const deleteFavorite = (id: string) => {
    persist(favorites.filter((f) => f.id !== id));
  };

  const handleSignOut = async () => {
    try {
      await logout();
      onClose();
    } catch (e) {
      console.warn('signout failed', e);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed top-0 right-0 bottom-0 w-full max-w-sm bg-white z-[70] shadow-2xl flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden shrink-0">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-blue-600 font-black text-lg">
                      {(user.displayName || user.email || '?').slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-gray-900 truncate">
                    {user.displayName || 'Rumbo user'}
                  </div>
                  <div className="text-xs text-gray-500 font-medium truncate">{user.email}</div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors shrink-0"
                aria-label="Close profile"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em]">
                    Favorite places
                  </h3>
                  {!adding && (
                    <button
                      onClick={() => setAdding(true)}
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Plus size={14} /> Add
                    </button>
                  )}
                </div>

                {adding && (
                  <AddFavorite
                    mapCenter={mapCenter}
                    onCancel={() => setAdding(false)}
                    onAdd={addFavorite}
                  />
                )}

                {favorites.length === 0 && !adding && (
                  <div className="text-sm text-gray-500 font-medium bg-gray-50 border border-gray-100 rounded-2xl p-4">
                    No favorites yet. Pin places you go to often — they'll appear in search the moment you tap the search bar.
                  </div>
                )}

                <div className="space-y-2 mt-2">
                  {favorites.map((f) => (
                    <FavoriteRow
                      key={f.id}
                      fav={f}
                      editing={editingId === f.id}
                      onStartEdit={() => setEditingId(f.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onRename={(name) => renameFavorite(f.id, name)}
                      onDelete={() => deleteFavorite(f.id)}
                    />
                  ))}
                </div>
              </section>

              <section className="mt-8">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] mb-3">
                  Account
                </h3>
                <button
                  onClick={() => { window.location.hash = '#privacy'; onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 hover:bg-gray-50 text-gray-900 font-bold transition-colors mb-2"
                >
                  <ShieldCheck size={18} className="text-emerald-600" />
                  Privacy &amp; Security
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 hover:bg-gray-50 text-gray-900 font-bold transition-colors"
                >
                  <LogOut size={18} className="text-gray-500" />
                  Sign out
                </button>

                <button
                  onClick={() => { setConfirmingDelete(true); setDeleteError(null); }}
                  className="w-full mt-2 flex items-center gap-3 px-4 py-3 rounded-2xl border border-red-100 hover:bg-red-50 text-red-700 font-bold transition-colors"
                >
                  <Trash2 size={18} className="text-red-500" />
                  Delete account
                </button>
              </section>
            </div>

            {confirmingDelete && (
              <div
                className="fixed inset-0 z-[80] bg-black/40 flex items-end sm:items-center justify-center p-4"
                onClick={() => !deleting && setConfirmingDelete(false)}
              >
                <div
                  className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mb-4">
                    <AlertTriangle size={24} />
                  </div>
                  <h3 className="text-lg font-extrabold text-gray-900 mb-2">
                    Delete your Rumbo account?
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed mb-4">
                    This permanently deletes your account, favorites, preferences, and saved providers. It can't be undone.
                  </p>
                  {deleteError && (
                    <div className="text-sm text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-3">
                      {deleteError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      disabled={deleting}
                      className="flex-1 py-3 px-4 bg-gray-100 text-gray-900 font-bold rounded-2xl hover:bg-gray-200 transition-colors disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="flex-1 py-3 px-4 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 transition-colors disabled:opacity-60"
                    >
                      {deleting ? 'Deleting…' : 'Yes, delete'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ----------------------------- sub-components ----------------------------- */

interface FavoriteRowProps {
  fav: FavoritePlace;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

function FavoriteRow({
  fav,
  editing,
  onStartEdit,
  onCancelEdit,
  onRename,
  onDelete,
}: FavoriteRowProps) {
  const [draft, setDraft] = useState(fav.name);
  useEffect(() => setDraft(fav.name), [fav.name, editing]);

  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-2xl border border-gray-100 bg-white">
      <div className="w-9 h-9 rounded-xl bg-yellow-100 flex items-center justify-center shrink-0">
        <Star size={16} className="text-yellow-500 fill-yellow-500" />
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.trim()) onRename(draft.trim());
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="w-full text-sm font-bold text-gray-900 bg-gray-50 rounded-lg px-2 py-1 outline-none border border-blue-200"
          />
        ) : (
          <div className="font-bold text-sm text-gray-900 leading-tight truncate">{fav.name}</div>
        )}
        <div className="text-[11px] text-gray-500 font-medium truncate">{fav.primary}</div>
      </div>
      {editing ? (
        <button
          onClick={() => draft.trim() && onRename(draft.trim())}
          className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
          aria-label="Save name"
        >
          <Check size={16} />
        </button>
      ) : (
        <>
          <button
            onClick={onStartEdit}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50"
            aria-label="Rename"
          >
            <Pencil size={15} />
          </button>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
            aria-label="Delete"
          >
            <Trash2 size={15} />
          </button>
        </>
      )}
    </div>
  );
}

interface AddFavoriteProps {
  mapCenter: [number, number];
  onCancel: () => void;
  onAdd: (fav: FavoritePlace) => void;
}

function AddFavorite({ mapCenter, onCancel, onAdd }: AddFavoriteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Suggestion | null>(null);
  const [name, setName] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (picked) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const r = await fetch('/api/autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q, lat: mapCenter[0], lng: mapCenter[1] }),
          signal: ctrl.signal,
        });
        const data = await r.json();
        if (!ctrl.signal.aborted) {
          setResults(Array.isArray(data.suggestions) ? data.suggestions : []);
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') setResults([]);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [query, picked, mapCenter]);

  const confirm = () => {
    if (!picked || !name.trim()) return;
    onAdd({
      id: newFavoriteId(),
      name: name.trim(),
      label: picked.label,
      primary: picked.primary,
      secondary: picked.secondary,
      lat: picked.lat,
      lng: picked.lng,
      createdAt: Date.now(),
    });
  };

  if (picked) {
    return (
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 mb-3 space-y-3">
        <div className="text-xs text-blue-900">
          <div className="font-bold truncate">{picked.primary}</div>
          {picked.secondary && (
            <div className="text-blue-700/80 truncate">{picked.secondary}</div>
          )}
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && confirm()}
          placeholder="Name this place (e.g. Home, Office)"
          className="w-full px-3 py-2 rounded-xl border border-blue-200 bg-white text-sm font-medium outline-none focus:border-blue-500"
        />
        <div className="flex gap-2">
          <button
            onClick={confirm}
            disabled={!name.trim()}
            className="flex-1 py-2 px-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            Save favorite
          </button>
          <button
            onClick={() => { setPicked(null); setName(''); }}
            className="py-2 px-3 bg-white text-gray-700 text-sm font-bold rounded-xl border border-gray-200 hover:bg-gray-50"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="pl-1 text-blue-500"><Search size={16} /></div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a place to pin"
          className="flex-1 bg-transparent outline-none text-sm font-medium placeholder:text-gray-400 py-1"
        />
        <button
          onClick={onCancel}
          className="text-xs font-bold text-gray-500 hover:text-gray-900 px-2"
        >
          Cancel
        </button>
      </div>
      {loading && results.length === 0 && (
        <div className="text-xs text-gray-500 font-semibold px-1 py-2">Searching…</div>
      )}
      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <div className="text-xs text-gray-500 font-semibold px-1 py-2">No matches.</div>
      )}
      <div className="max-h-60 overflow-y-auto -mx-1">
        {results.map((s, i) => (
          <button
            key={`${s.lat},${s.lng},${i}`}
            onClick={() => setPicked(s)}
            className="w-full text-left px-3 py-2 rounded-xl hover:bg-white"
          >
            <div className="text-sm font-bold text-gray-900 truncate">{s.primary}</div>
            {s.secondary && (
              <div className="text-[11px] text-gray-500 font-medium truncate">{s.secondary}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
