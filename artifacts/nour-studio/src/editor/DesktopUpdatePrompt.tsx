import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';

type UpdateEvent =
  | { event: 'Started'; data: { contentLength?: number } }
  | { event: 'Progress'; data: { chunkLength: number } }
  | { event: 'Finished'; data: Record<string, never> };

type DesktopUpdate = {
  version: string;
  body?: string | null;
  date?: string | null;
  downloadAndInstall: (onEvent?: (event: UpdateEvent) => void) => Promise<void>;
  close?: () => Promise<void>;
};

type NativeUpdater = {
  check: () => Promise<DesktopUpdate | null>;
};

type TauriWindow = Window & {
  __TAURI__?: {
    updater?: NativeUpdater;
  };
};

const getUpdater = () => (window as TauriWindow).__TAURI__?.updater;

export default function DesktopUpdatePrompt() {
  const [update, setUpdate] = useState<DesktopUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [contentLength, setContentLength] = useState<number | null>(null);

  const checkForUpdate = useCallback(async () => {
    const updater = getUpdater();
    if (!updater || checking || installing) return;

    setChecking(true);
    try {
      const available = await updater.check();
      if (available) setUpdate(available);
    } catch (error) {
      // Update checks are best-effort. An offline launch should not interrupt editing.
      console.warn('Nour update check failed', error);
    } finally {
      setChecking(false);
    }
  }, [checking, installing]);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkForUpdate(), 1200);
    return () => window.clearTimeout(timer);
  }, [checkForUpdate]);

  useEffect(() => () => {
    if (update && !installed) void update.close?.();
  }, [installed, update]);

  const installUpdate = async () => {
    if (!update) return;

    setInstalling(true);
    setDownloadedBytes(0);
    setContentLength(null);
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          setContentLength(event.data.contentLength ?? null);
        } else if (event.event === 'Progress') {
          setDownloadedBytes((current) => current + event.data.chunkLength);
        }
      });
      setInstalled(true);
    } catch (error) {
      console.error('Nour update installation failed', error);
      setInstalling(false);
    }
  };

  if (!update) return null;

  const progress = contentLength
    ? Math.min(100, Math.round((downloadedBytes / contentLength) * 100))
    : null;

  return (
    <div className="update-backdrop" role="presentation">
      <section className="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-title">
        {!installing && !installed && (
          <button
            className="update-close"
            onClick={() => {
              void update.close?.();
              setUpdate(null);
            }}
            aria-label="Later"
          >
            <X size={16} />
          </button>
        )}
        <div className="update-icon"><Download size={19} /></div>
        <p className="update-overline">{installed ? 'UPDATE READY' : 'NOUR UPDATE'}</p>
        <h2 id="update-title">
          {installed ? 'Restart Nour to finish' : `Nour ${update.version} is ready`}
        </h2>
        <p className="update-copy">
          {installed
            ? 'The update was installed successfully. Quit and reopen Nour to start using the new version.'
            : update.body || 'A newer version of Nour is available with improvements and fixes.'}
        </p>
        {installing && (
          <div className="update-progress" aria-live="polite">
            <div className="update-progress-track"><span style={{ width: `${progress ?? 35}%` }} /></div>
            <span>{progress === null ? 'Downloading update…' : `Downloading update… ${progress}%`}</span>
          </div>
        )}
        {installed ? (
          <button className="update-primary" onClick={() => window.location.reload()}>
            <RefreshCw size={14} /> Restart window
          </button>
        ) : (
          <div className="update-actions">
            <button
              className="update-secondary"
              disabled={installing}
              onClick={() => {
                void update.close?.();
                setUpdate(null);
              }}
            >
              Later
            </button>
            <button className="update-primary" disabled={installing} onClick={() => void installUpdate()}>
              <Download size={14} /> {installing ? 'Installing…' : 'Install update'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}