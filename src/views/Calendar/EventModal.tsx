import React, { useState } from 'react';
import { X, CalendarPlus, Check, MapPin, Video, Megaphone } from 'lucide-react';
import { useCalendarStore } from '../../store/calendarStore';
import { EVENT_COLORS, toLocalInput } from './calendarUtils';

interface Props {
  defaultDate?: Date | null;
  onClose: () => void;
}

const COLOR_KEYS = ['blue', 'indigo', 'orange', 'green', 'pink'];

export const EventModal: React.FC<Props> = ({ defaultDate, onClose }) => {
  const { createEvent } = useCalendarStore();
  const base = defaultDate ?? new Date();
  const start = new Date(base);
  if (!defaultDate) start.setHours(start.getHours() + 1, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60_000);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [startsAt, setStartsAt] = useState(toLocalInput(start));
  const [endsAt, setEndsAt] = useState(toLocalInput(end));
  const [color, setColor] = useState('blue');
  const [audience, setAudience] = useState<'all' | 'members'>('all');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const ok = await createEvent({
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      meeting_url: meetingUrl.trim() || null,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      color,
      audience,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="glass-panel w-full max-w-lg rounded-ios-2xl border border-white/10 shadow-ios-strong overflow-hidden animate-scale-in flex flex-col max-h-[90vh]"
      >
        <div className="p-5 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
          <h3 className="font-extrabold flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark" /> Nouvel événement
          </h3>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">Titre</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} required placeholder="Ex : Masterclass React" className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Détails de l'événement..." className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">Début</label>
              <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} required className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">Fin</label>
              <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider flex items-center gap-1"><MapPin className="w-3 h-3" /> Lieu</label>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="En ligne / Paris..." className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider flex items-center gap-1"><Video className="w-3 h-3" /> Lien visio</label>
              <input value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)} placeholder="https://meet..." className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">Couleur</label>
            <div className="flex gap-2">
              {COLOR_KEYS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full ${EVENT_COLORS[c].dot} transition-all ${color === c ? 'ring-2 ring-offset-2 ring-offset-transparent ring-current scale-110' : 'opacity-60 hover:opacity-100'}`}
                  aria-label={c} />
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider flex items-center gap-1"><Megaphone className="w-3 h-3" /> Audience</label>
            <div className="flex gap-2">
              {(['all', 'members'] as const).map(a => (
                <button key={a} type="button" onClick={() => setAudience(a)}
                  className={`flex-1 px-3 py-2 rounded-ios-lg text-xs font-bold transition-all ${audience === a ? 'bg-ios-blue-light dark:bg-ios-blue-dark text-white shadow-ios-glow' : 'bg-black/5 dark:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}>
                  {a === 'all' ? 'Toute la communauté' : 'Membres uniquement'}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-ios-label-secondaryLight">Une notification d'annonce est envoyée à l'audience choisie.</p>
          </div>
        </div>

        <div className="p-4 border-t border-black/5 dark:border-white/5 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 rounded-ios-xl text-sm font-bold transition">Annuler</button>
          <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-sm font-bold shadow-ios-glow hover:opacity-95 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Publier</>}
          </button>
        </div>
      </form>
    </div>
  );
};
