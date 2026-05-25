import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Floating "Install Rumbo" button. Listens for `beforeinstallprompt` on
 * Chromium-based browsers (Android Chrome, Edge, Brave). iOS Safari does
 * NOT fire this event — there, users install via Share -> Add to Home Screen,
 * which is documented in the Privacy page and onboarding.
 *
 * The button hides itself once the app is running in standalone mode
 * (display-mode: standalone) so installed users don't see it.
 */
export default function InstallButton() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS Safari exposes a non-standard `standalone` flag.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) {
      setHidden(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setEvt(null);
      setHidden(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt as EventListener);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt as EventListener);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (hidden || !evt) return null;

  const handleInstall = async () => {
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      if (choice.outcome === 'accepted') setHidden(true);
    } finally {
      setEvt(null);
    }
  };

  return (
    <button
      onClick={handleInstall}
      className="fixed bottom-24 right-4 z-[55] flex items-center gap-2 px-4 py-3 bg-blue-600 text-white text-sm font-bold rounded-full shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95"
      aria-label="Install Rumbo"
    >
      <Download size={16} />
      Install Rumbo
    </button>
  );
}
