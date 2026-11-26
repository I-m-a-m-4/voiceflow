'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { RefreshCw, ArrowUpCircle, Download, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { isMeetingRecordingActive } from '@/lib/meeting-state';

/**
 * TauriUpdater Component
 *
 * Automatically checks GitHub Releases (`latest.json`) on startup, every 15 minutes,
 * and right after meetings end. Downloads updates silently in the background via
 * `update.download(...)` so Windows never force-closes the app mid-session, then
 * presents a one-click "Restart to Update" button that runs `install()` + `relaunch()`.
 */
export function TauriUpdater() {
  const { toast } = useToast();
  const [updateReady, setUpdateReady] = useState(false);
  const [newVersion, setNewVersion] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  const pendingUpdateRef = useRef<Update | null>(null);
  const isCheckingRef = useRef(false);
  const downloadedVersionRef = useRef<string>('');

  const checkAndDownloadUpdate = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return;
    if (isMeetingRecordingActive() || isCheckingRef.current || pendingUpdateRef.current) return;

    isCheckingRef.current = true;
    try {
      const update = await check();
      if (!update) return;
      if (downloadedVersionRef.current === update.version) return;

      setNewVersion(update.version);
      setIsDownloading(true);
      setDownloadProgress(0);

      toast({
        title: `Update v${update.version} Found`,
        description: 'Downloading automatically in the background. You can keep working until it is ready to restart.',
        duration: 6000,
      });

      let downloaded = 0;
      let totalSize: number | null = null;

      await update.download((event) => {
        switch (event.event) {
          case 'Started':
            totalSize = event.data.contentLength ?? null;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (totalSize && totalSize > 0) {
              setDownloadProgress(Math.min(99, Math.round((downloaded / totalSize) * 100)));
            }
            break;
          case 'Finished':
            setDownloadProgress(100);
            break;
        }
      });

      pendingUpdateRef.current = update;
      downloadedVersionRef.current = update.version;
      setIsDownloading(false);
      setUpdateReady(true);

      toast({
        title: `Voiceflow v${update.version} Ready`,
        description: 'Update downloaded. Click "Restart to Update" whenever you are ready.',
        variant: 'success',
        duration: 10000,
      });
    } catch (error) {
      setIsDownloading(false);
      console.warn('Auto-update check/download note:', error);
    } finally {
      isCheckingRef.current = false;
    }
  }, [toast]);

  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return;

    // Initial check shortly after launch so UI mounts smoothly first
    const startupTimer = setTimeout(() => {
      void checkAndDownloadUpdate();
    }, 3500);

    // Periodic check every 15 minutes so new GitHub releases are picked up rapidly
    const interval = setInterval(() => {
      void checkAndDownloadUpdate();
    }, 15 * 60 * 1000);

    // Hide banner during active meetings & re-check immediately when a recording stops
    const onRecordState = (e: any) => {
      const rec = Boolean(e?.detail?.isRecording);
      setIsRecording(rec);
      if (!rec) {
        setTimeout(() => void checkAndDownloadUpdate(), 2000);
      }
    };
    window.addEventListener('voiceflow-record-state', onRecordState);

    return () => {
      clearTimeout(startupTimer);
      clearInterval(interval);
      window.removeEventListener('voiceflow-record-state', onRecordState);
    };
  }, [checkAndDownloadUpdate]);

  const handleRestartToUpdate = async () => {
    if (isInstalling) return;
    setIsInstalling(true);
    try {
      if (pendingUpdateRef.current) {
        await pendingUpdateRef.current.install();
      }
      await relaunch();
    } catch (err) {
      console.error('Failed to install & relaunch update:', err);
      setIsInstalling(false);
      toast({
        variant: 'destructive',
        title: 'Restart Failed',
        description: 'Please close and reopen Voiceflow to finish applying the update.',
      });
    }
  };

  if (isRecording || isMeetingRecordingActive()) return null;

  return (
    <AnimatePresence>
      {(updateReady || isDownloading) && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] no-print"
        >
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-2xl flex items-center gap-3 border border-white/20 backdrop-blur-md">
            {isDownloading ? (
              <div className="flex items-center gap-3 min-w-[220px]">
                <Download className="h-4 w-4 animate-bounce shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                    <span>Updating to v{newVersion}</span>
                    <span>{downloadProgress}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-white"
                      initial={{ width: 0 }}
                      animate={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <ArrowUpCircle className="h-5 w-5 animate-pulse shrink-0" />
                <span className="text-sm font-medium whitespace-nowrap">
                  Voiceflow v{newVersion} Ready
                </span>
                <div className="h-4 w-[1px] bg-white/30 mx-0.5" />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isInstalling}
                  onClick={handleRestartToUpdate}
                  className="h-8 rounded-full px-4 font-bold text-xs whitespace-nowrap"
                >
                  {isInstalling ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      INSTALLING...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-1.5 h-3 w-3" />
                      RESTART TO UPDATE
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
