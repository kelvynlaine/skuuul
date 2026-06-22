import React, { useEffect, useRef, useState } from 'react';
import { X, Send, Trash2 } from 'lucide-react';

interface Props {
  onSend: (blob: Blob, durationSec: number) => void;
  onCancel: () => void;
}

/** Inline voice recorder using the MediaRecorder API. Auto-starts on mount. */
export const VoiceRecorder: React.FC<Props> = ({ onSend, onCancel }) => {
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const resolveRef = useRef<((b: Blob) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const mr = new MediaRecorder(stream);
        mediaRef.current = mr;
        mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
          resolveRef.current?.(blob);
        };
        mr.start();
        timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
      } catch {
        setError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const stopAndGet = (): Promise<Blob> => new Promise(res => {
    resolveRef.current = res;
    if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
    else res(new Blob(chunksRef.current));
  });

  const finish = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const blob = await stopAndGet();
    streamRef.current?.getTracks().forEach(t => t.stop());
    onSend(blob, seconds);
  };

  const cancel = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRef.current && mediaRef.current.state !== 'inactive') mediaRef.current.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    onCancel();
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-between gap-2 text-sm text-ios-red-light dark:text-ios-red-dark px-2">
        <span>Micro indisponible (autorisation refusée)</span>
        <button onClick={onCancel} className="p-1"><X className="w-4 h-4" /></button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center gap-3">
      <button onClick={cancel} className="p-2 rounded-full text-ios-red-light dark:text-ios-red-dark hover:bg-ios-red-light/10" title="Annuler">
        <Trash2 className="w-4 h-4" />
      </button>
      <div className="flex-1 flex items-center gap-2 bg-black/5 dark:bg-white/5 rounded-full px-4 py-2.5">
        <span className="w-2.5 h-2.5 rounded-full bg-ios-red-light dark:bg-ios-red-dark animate-pulse shrink-0" />
        <span className="text-sm font-mono tabular-nums">{mm}:{ss}</span>
        <span className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex-1">Enregistrement…</span>
      </div>
      <button onClick={finish} className="p-2.5 rounded-full bg-ios-blue-light dark:bg-ios-blue-dark text-white hover:opacity-90 shrink-0" title="Envoyer">
        <Send className="w-4 h-4" />
      </button>
    </div>
  );
};
