import { useEffect, useState } from 'react';

const DISMISS_KEY = 'kas-darul-falah-install-dismissed-v1';
const DISMISS_DAYS = 7;

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

function dismissedRecently() {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    if (isIOS()) {
      setIos(true);
      setVisible(true);
    }
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* abaikan */
    }
    setVisible(false);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setVisible(false);
    setDeferredPrompt(null);
  };

  return (
    <div className="install-prompt" role="dialog" aria-label="Install aplikasi">
      <div className="install-prompt-icon">DF</div>
      <div className="install-prompt-text">
        <strong>Install aplikasi Kas Darul Falah</strong>
        <span>Pasang di HP supaya cepat dibuka, seperti aplikasi biasa.</span>
      </div>
      {ios && !deferredPrompt ? (
        <button className="primary-button install-prompt-button" type="button" onClick={() => setShowIosHelp((v) => !v)}>
          Cara Install
        </button>
      ) : (
        <button className="primary-button install-prompt-button" type="button" onClick={handleInstall}>
          Install
        </button>
      )}
      <button className="install-prompt-close" type="button" onClick={dismiss} aria-label="Tutup">
        ×
      </button>
      {showIosHelp && (
        <p className="install-prompt-ios-help">
          Ketuk tombol <strong>Bagikan</strong> di Safari, lalu pilih <strong>Tambahkan ke Layar Utama</strong>.
        </p>
      )}
    </div>
  );
}
