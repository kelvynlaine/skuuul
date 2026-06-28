import React, { useEffect, useState } from 'react';
import { X, Phone, Check, Loader2, Search, ChevronLeft, Shield, Sparkles } from 'lucide-react';
import { useCalendarStore, MiniProfile, AvailabilitySlot } from '../../store/calendarStore';
import { fmtRelativeDay, fmtTime } from './calendarUtils';

interface Props {
  myId: string;
  preselectHost?: MiniProfile | null;
  onClose: () => void;
  onBooked: () => void;
}

const Avatar: React.FC<{ p: MiniProfile; size?: string }> = ({ p, size = 'w-10 h-10' }) => (
  p.avatar_url
    ? <img src={p.avatar_url} alt="" className={`${size} rounded-full object-cover shrink-0`} />
    : <div className={`${size} rounded-full bg-gradient-to-tr from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark flex items-center justify-center text-white font-bold shrink-0`}>{p.username[0].toUpperCase()}</div>
);

export const BookingModal: React.FC<Props> = ({ myId, preselectHost, onClose, onBooked }) => {
  const { hosts, fetchHosts, slots, fetchHostSlots, bookAppointment } = useCalendarStore();
  const [host, setHost] = useState<MiniProfile | null>(preselectHost ?? null);
  const [query, setQuery] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [note, setNote] = useState('');
  const [booking, setBooking] = useState(false);

  useEffect(() => { if (hosts.length === 0) fetchHosts(); }, [hosts.length, fetchHosts]);

  useEffect(() => {
    if (!host) return;
    setLoadingSlots(true);
    setSelectedSlot(null);
    fetchHostSlots(host.id).finally(() => setLoadingSlots(false));
  }, [host, fetchHostSlots]);

  const filteredHosts = hosts.filter(h => h.id !== myId && (
    !query.trim() ||
    h.username.toLowerCase().includes(query.toLowerCase()) ||
    (h.full_name || '').toLowerCase().includes(query.toLowerCase())
  ));

  // group open slots by day
  const slotsByDay = slots.reduce<Record<string, AvailabilitySlot[]>>((acc, s) => {
    const key = new Date(s.starts_at).toDateString();
    (acc[key] ||= []).push(s);
    return acc;
  }, {});

  const confirm = async () => {
    if (!host || !selectedSlot) return;
    setBooking(true);
    const ok = await bookAppointment({ slot: selectedSlot, hostId: host.id, memberId: myId, title: `Call avec ${host.full_name || host.username}`, note });
    setBooking(false);
    if (ok) { onBooked(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="glass-panel w-full max-w-md rounded-ios-2xl border border-white/10 shadow-ios-strong overflow-hidden animate-scale-in flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
          <h3 className="font-extrabold flex items-center gap-2">
            {host && <button onClick={() => setHost(null)} className="p-1 -ml-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"><ChevronLeft className="w-4 h-4" /></button>}
            <Phone className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark" /> Réserver un call
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"><X className="w-4 h-4" /></button>
        </div>

        {/* Step 1 — pick a host */}
        {!host && (
          <>
            <div className="p-3 border-b border-black/5 dark:border-white/5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight" />
                <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un créateur..." className="w-full bg-black/5 dark:bg-white/5 rounded-ios-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-black/5 dark:divide-white/5">
              {filteredHosts.length === 0 && <p className="py-8 text-center text-sm text-ios-label-secondaryLight">Aucun créateur disponible</p>}
              {filteredHosts.map(h => (
                <button key={h.id} onClick={() => setHost(h)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <Avatar p={h} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {h.full_name || h.username}
                      {h.role === 'admin'
                        ? <Shield className="w-3 h-3 text-ios-blue-light dark:text-ios-blue-dark" />
                        : <Sparkles className="w-3 h-3 text-ios-orange-light dark:text-ios-orange-dark fill-current" />}
                    </p>
                    <p className="text-xs text-ios-label-secondaryLight truncate">@{h.username}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 2 — pick a slot + note */}
        {host && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 flex items-center gap-3 bg-black/3 dark:bg-white/3 border-b border-black/5 dark:border-white/5">
              <Avatar p={host} />
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{host.full_name || host.username}</p>
                <p className="text-xs text-ios-label-secondaryLight truncate">@{host.username}</p>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {loadingSlots ? (
                <div className="py-8 text-center"><Loader2 className="w-6 h-6 mx-auto animate-spin text-ios-blue-light dark:text-ios-blue-dark" /></div>
              ) : slots.length === 0 ? (
                <p className="py-6 text-center text-sm text-ios-label-secondaryLight">Aucun créneau disponible pour le moment. Revenez plus tard.</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(slotsByDay).map(([day, daySlots]) => (
                    <div key={day}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-ios-label-secondaryLight mb-2 capitalize">{fmtRelativeDay(daySlots[0].starts_at)}</p>
                      <div className="flex flex-wrap gap-2">
                        {daySlots.map(s => (
                          <button key={s.id} onClick={() => setSelectedSlot(s)}
                            className={`px-3 py-2 rounded-ios-lg text-xs font-bold transition-all ${selectedSlot?.id === s.id ? 'bg-ios-blue-light dark:bg-ios-blue-dark text-white shadow-ios-glow' : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10'}`}>
                            {fmtTime(s.starts_at)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedSlot && (
                <div className="space-y-1 pt-2 animate-fade-in">
                  <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">Message (optionnel)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Décrivez le sujet de votre call..." className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
                </div>
              )}
            </div>
          </div>
        )}

        {host && selectedSlot && (
          <div className="p-4 border-t border-black/5 dark:border-white/5">
            <button onClick={confirm} disabled={booking} className="w-full py-2.5 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-sm font-bold shadow-ios-glow hover:opacity-95 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {booking ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Demander le RDV — {fmtTime(selectedSlot.starts_at)}</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
