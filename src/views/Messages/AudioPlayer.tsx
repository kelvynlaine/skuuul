import React, { useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

interface Props {
  url: string;
  duration?: number | null;
  mine?: boolean;
}

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export const AudioPlayer: React.FC<Props> = ({ url, duration, mine }) => {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (playing) a.pause();
    else a.play();
  };

  const pct = total > 0 ? Math.min((cur / total) * 100, 100) : 0;
  const track = mine ? 'bg-white/30' : 'bg-black/15 dark:bg-white/20';
  const fill = mine ? 'bg-white' : 'bg-ios-blue-light dark:bg-ios-blue-dark';

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <button
        onClick={toggle}
        className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${mine ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-ios-blue-light/15 dark:bg-ios-blue-dark/25 text-ios-blue-light dark:text-ios-blue-dark hover:opacity-80'}`}
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className={`h-1.5 rounded-full ${track} overflow-hidden`}>
          <div className={`h-full ${fill} rounded-full`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-[10px] ${mine ? 'text-white/70' : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}>
          {fmt(playing || cur > 0 ? cur : total)}
        </span>
      </div>
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCur(0); }}
        onLoadedMetadata={e => { const d = (e.target as HTMLAudioElement).duration; if (isFinite(d) && d > 0) setTotal(d); }}
        onTimeUpdate={e => setCur((e.target as HTMLAudioElement).currentTime)}
      />
    </div>
  );
};
