import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useCalendarStore, CalendarEvent, Appointment, AvailabilitySlot, MiniProfile } from '../../store/calendarStore';
import {
  Calendar as CalendarIcon, Plus, Phone, Clock, Users as UsersIcon, ChevronLeft, ChevronRight,
  Video, MapPin, Bell, BellOff, CalendarPlus, Download, Check, X, Trash2, Briefcase,
} from 'lucide-react';
import {
  MONTHS_FR, DAYS_FR, monthGrid, sameDay, colorOf, fmtTime, fmtRelativeDay, fmtDayLong,
  googleCalendarUrl, downloadIcs, toLocalInput,
} from './calendarUtils';
import { EventModal } from './EventModal';
import { BookingModal } from './BookingModal';
import { CrmPanel } from './CrmPanel';

type Tab = 'agenda' | 'appointments' | 'slots' | 'crm';

export const CalendarView: React.FC = () => {
  const { profile } = useAuthStore();
  const location = useLocation();
  const {
    events, appointments, mySlots,
    fetchEvents, fetchAppointments, fetchMySlots, toggleReminder, deleteEvent,
    subscribe, unsubscribe,
  } = useCalendarStore();

  const isHost = profile?.role === 'creator' || profile?.role === 'admin';
  const [tab, setTab] = useState<Tab>('agenda');
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date>(today);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [bookingHost, setBookingHost] = useState<MiniProfile | null>(null);

  useEffect(() => {
    if (!profile?.id) return;
    fetchEvents();
    fetchAppointments(profile.id);
    if (isHost) fetchMySlots(profile.id);
    subscribe(profile.id);
    return () => unsubscribe();
  }, [profile?.id]);

  // open booking pre-filled when navigated from directory/CRM with a host
  useEffect(() => {
    const st = location.state as { bookWith?: MiniProfile } | null;
    if (st?.bookWith) { setBookingHost(st.bookWith); setShowBooking(true); }
  }, [location.state]);

  // ── items by day for grid markers ──
  const grid = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const eventsOn = (d: Date) => events.filter(e => sameDay(new Date(e.starts_at), d));
  const apptsOn = (d: Date) => appointments.filter(a => sameDay(new Date(a.starts_at), d) && a.status !== 'cancelled');

  const dayEvents = eventsOn(selectedDay);
  const dayAppts = apptsOn(selectedDay);

  const upcomingAppts = appointments
    .filter(a => a.status !== 'cancelled' && new Date(a.ends_at) >= new Date())
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  const pastAppts = appointments
    .filter(a => a.status === 'cancelled' || new Date(a.ends_at) < new Date())
    .sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));

  const tabs: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }>; show: boolean }[] = [
    { key: 'agenda', label: 'Agenda', icon: CalendarIcon, show: true },
    { key: 'appointments', label: 'Mes RDV', icon: Phone, show: true },
    { key: 'slots', label: 'Mes créneaux', icon: Clock, show: isHost },
    { key: 'crm', label: 'CRM', icon: Briefcase, show: isHost },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 border border-ios-blue-light/20 text-ios-blue-light dark:text-ios-blue-dark text-xs font-bold mb-3">
            <CalendarIcon className="w-3.5 h-3.5" /> Calendrier & RDV
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark bg-clip-text text-transparent">
            Votre agenda Skuuul
          </h1>
          <p className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-sm sm:text-base mt-1">
            {isHost ? 'Gérez vos événements, créneaux et le suivi de vos membres.' : 'Réservez un call avec un créateur et suivez les événements de la communauté.'}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => { setBookingHost(null); setShowBooking(true); }} className="bg-ios-blue-light dark:bg-ios-blue-dark text-white font-bold px-4 py-2.5 rounded-ios-lg flex items-center gap-2 shadow-ios-glow hover:opacity-95 active:scale-95 transition text-sm">
            <Phone className="w-4 h-4" /> Réserver un call
          </button>
          {isHost && (
            <button onClick={() => setShowEventModal(true)} className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 font-bold px-4 py-2.5 rounded-ios-lg flex items-center gap-2 hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition text-sm">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Événement</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-none">
        {tabs.filter(t => t.show).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap flex items-center gap-2 transition-all ${tab === t.key ? 'bg-ios-blue-light dark:bg-ios-blue-dark text-white shadow-ios-soft' : 'bg-black/5 dark:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/10 dark:hover:bg-white/10'}`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ── AGENDA TAB ── */}
      {tab === 'agenda' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Month grid */}
          <div className="lg:col-span-8 glass-panel border border-black/5 dark:border-white/5 rounded-ios-2xl p-4 sm:p-5 shadow-ios-soft">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-extrabold capitalize">{MONTHS_FR[cursor.getMonth()]} {cursor.getFullYear()}</h2>
              <div className="flex items-center gap-1">
                <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="p-2 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => { const t = new Date(); setCursor(new Date(t.getFullYear(), t.getMonth(), 1)); setSelectedDay(t); }} className="px-3 py-1.5 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5 text-xs font-bold">Aujourd'hui</button>
                <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="p-2 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {DAYS_FR.map(d => <div key={d} className="text-center text-[10px] font-bold uppercase text-ios-label-secondaryLight py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {grid.map((d, i) => {
                const inMonth = d.getMonth() === cursor.getMonth();
                const isToday = sameDay(d, today);
                const isSelected = sameDay(d, selectedDay);
                const evs = eventsOn(d);
                const aps = apptsOn(d);
                const markers = [...evs.map(e => colorOf(e.color).dot), ...aps.map(() => 'bg-ios-green-light dark:bg-ios-green-dark')].slice(0, 4);
                return (
                  <button key={i} onClick={() => setSelectedDay(d)}
                    className={`aspect-square sm:aspect-auto sm:min-h-[64px] rounded-ios-lg p-1.5 flex flex-col items-center sm:items-start gap-1 transition-all border ${isSelected ? 'border-ios-blue-light/50 bg-ios-blue-light/10 dark:bg-ios-blue-dark/15' : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5'} ${!inMonth ? 'opacity-35' : ''}`}>
                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-ios-blue-light dark:bg-ios-blue-dark text-white' : ''}`}>{d.getDate()}</span>
                    {markers.length > 0 && (
                      <div className="flex flex-wrap gap-0.5 justify-center sm:justify-start">
                        {markers.map((m, k) => <span key={k} className={`w-1.5 h-1.5 rounded-full ${m}`} />)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-black/5 dark:border-white/5 text-[10px] text-ios-label-secondaryLight">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ios-blue-light dark:bg-ios-blue-dark" /> Événement</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ios-green-light dark:bg-ios-green-dark" /> RDV call</span>
            </div>
          </div>

          {/* Selected day detail */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="font-extrabold capitalize px-1">{fmtDayLong(selectedDay)}</h3>
            {dayEvents.length === 0 && dayAppts.length === 0 && (
              <div className="glass-card p-6 text-center">
                <CalendarIcon className="w-10 h-10 text-ios-label-secondaryLight/30 mx-auto mb-2" />
                <p className="text-sm text-ios-label-secondaryLight">Rien de prévu ce jour.</p>
              </div>
            )}
            {dayAppts.map(a => <AppointmentCard key={a.id} appt={a} meId={profile!.id} />)}
            {dayEvents.map(e => <EventCard key={e.id} event={e} canManage={isHost && e.creator_id === profile?.id} onReminder={toggleReminder} onDelete={deleteEvent} />)}
          </div>
        </div>
      )}

      {/* ── APPOINTMENTS TAB ── */}
      {tab === 'appointments' && (
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="font-extrabold flex items-center gap-2"><Clock className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark" /> À venir ({upcomingAppts.length})</h3>
            {upcomingAppts.length === 0 ? (
              <div className="glass-card p-6 text-center text-sm text-ios-label-secondaryLight">Aucun RDV à venir. <button onClick={() => { setBookingHost(null); setShowBooking(true); }} className="text-ios-blue-light dark:text-ios-blue-dark font-bold hover:underline">Réserver un call</button></div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">{upcomingAppts.map(a => <AppointmentCard key={a.id} appt={a} meId={profile!.id} detailed />)}</div>
            )}
          </section>
          {pastAppts.length > 0 && (
            <section className="space-y-3">
              <h3 className="font-extrabold flex items-center gap-2 text-ios-label-secondaryLight"><Check className="w-4 h-4" /> Historique ({pastAppts.length})</h3>
              <div className="grid sm:grid-cols-2 gap-3 opacity-80">{pastAppts.slice(0, 10).map(a => <AppointmentCard key={a.id} appt={a} meId={profile!.id} detailed />)}</div>
            </section>
          )}
        </div>
      )}

      {/* ── SLOTS TAB ── */}
      {tab === 'slots' && isHost && <SlotsManager hostId={profile!.id} slots={mySlots} />}

      {/* ── CRM TAB ── */}
      {tab === 'crm' && isHost && <CrmPanel hostId={profile!.id} />}

      {/* Modals */}
      {showEventModal && <EventModal defaultDate={selectedDay} onClose={() => setShowEventModal(false)} />}
      {showBooking && profile && <BookingModal myId={profile.id} preselectHost={bookingHost} onClose={() => setShowBooking(false)} onBooked={() => fetchAppointments(profile.id)} />}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Event card
// ──────────────────────────────────────────────────────────────────────────
const EventCard: React.FC<{
  event: CalendarEvent;
  canManage: boolean;
  onReminder: (id: string, on: boolean) => void;
  onDelete: (id: string) => void;
}> = ({ event, canManage, onReminder, onDelete }) => {
  const c = colorOf(event.color);
  const calEntry = { title: event.title, description: event.description, location: event.location, startsAt: event.starts_at, endsAt: event.ends_at };
  return (
    <div className={`glass-card p-4 border-l-4 ${c.dot.replace('bg-', 'border-')}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">{event.title}</p>
          <p className="text-xs text-ios-label-secondaryLight mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtTime(event.starts_at)}{event.ends_at ? ` – ${fmtTime(event.ends_at)}` : ''}</p>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${c.bg} ${c.text}`}>{event.audience === 'all' ? 'Communauté' : 'Membres'}</span>
      </div>
      {event.description && <p className="text-xs text-ios-label-secondaryLight mt-2 line-clamp-2">{event.description}</p>}
      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-ios-label-secondaryLight">
        {event.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {event.location}</span>}
        {event.meeting_url && <a href={event.meeting_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-ios-blue-light dark:text-ios-blue-dark font-semibold hover:underline"><Video className="w-3 h-3" /> Visio</a>}
      </div>
      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-black/5 dark:border-white/5">
        <button onClick={() => onReminder(event.id, !event.reminder_on)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-ios-md text-[11px] font-bold transition ${event.reminder_on ? 'bg-ios-orange-light/15 text-ios-orange-light dark:text-ios-orange-dark' : 'bg-black/5 dark:bg-white/5 hover:bg-black/10'}`}>
          {event.reminder_on ? <><Bell className="w-3 h-3 fill-current" /> Rappel activé</> : <><BellOff className="w-3 h-3" /> Me rappeler</>}
        </button>
        <a href={googleCalendarUrl(calEntry)} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-ios-md text-[11px] font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 transition"><CalendarPlus className="w-3 h-3" /> Google</a>
        <button onClick={() => downloadIcs(calEntry)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-ios-md text-[11px] font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 transition"><Download className="w-3 h-3" /> .ics</button>
        {canManage && <button onClick={() => { if (confirm('Supprimer cet événement ?')) onDelete(event.id); }} className="flex items-center gap-1 px-2.5 py-1.5 rounded-ios-md text-[11px] font-bold text-ios-pink-light dark:text-ios-pink-dark hover:bg-ios-pink-light/10 transition ml-auto"><Trash2 className="w-3 h-3" /></button>}
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Appointment card
// ──────────────────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, string> = {
  pending:   'bg-ios-orange-light/15 text-ios-orange-light dark:text-ios-orange-dark',
  confirmed: 'bg-ios-green-light/15 text-ios-green-light dark:text-ios-green-dark',
  cancelled: 'bg-ios-pink-light/15 text-ios-pink-light dark:text-ios-pink-dark',
  completed: 'bg-ios-blue-light/15 text-ios-blue-light dark:text-ios-blue-dark',
};
const STATUS_LABEL: Record<string, string> = { pending: 'En attente', confirmed: 'Confirmé', cancelled: 'Annulé', completed: 'Terminé' };

const AppointmentCard: React.FC<{ appt: Appointment; meId: string; detailed?: boolean }> = ({ appt, meId, detailed }) => {
  const { setAppointmentStatus } = useCalendarStore();
  const iAmHost = appt.host_id === meId;
  const other = iAmHost ? appt.member : appt.host;
  const calEntry = { title: appt.title || 'Call Skuuul', description: appt.member_note, startsAt: appt.starts_at, endsAt: appt.ends_at };

  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-3">
        {other?.avatar_url
          ? <img src={other.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
          : <div className="w-10 h-10 rounded-full bg-ios-green-light/15 flex items-center justify-center text-ios-green-light dark:text-ios-green-dark font-bold shrink-0"><Phone className="w-4 h-4" /></div>}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{other?.full_name || other?.username}</p>
          <p className="text-xs text-ios-label-secondaryLight flex items-center gap-1"><Clock className="w-3 h-3" /> {fmtRelativeDay(appt.starts_at)} · {fmtTime(appt.starts_at)}</p>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${STATUS_STYLE[appt.status]}`}>{STATUS_LABEL[appt.status]}</span>
      </div>

      {detailed && appt.member_note && <p className="text-xs text-ios-label-secondaryLight mt-2 bg-black/5 dark:bg-white/5 rounded-ios-md p-2">{appt.member_note}</p>}
      {appt.meeting_url && appt.status === 'confirmed' && (
        <a href={appt.meeting_url} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-ios-blue-light dark:text-ios-blue-dark bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 rounded-ios-md py-2 hover:bg-ios-blue-light/20 transition"><Video className="w-3.5 h-3.5" /> Rejoindre la visio</a>
      )}

      {/* Actions */}
      {appt.status !== 'cancelled' && appt.status !== 'completed' && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-black/5 dark:border-white/5">
          {iAmHost && appt.status === 'pending' && (
            <button onClick={() => { const url = prompt('Lien de la visio (optionnel) :', appt.meeting_url || ''); setAppointmentStatus(appt.id, 'confirmed', url || undefined); }} className="flex-1 bg-ios-green-light/15 text-ios-green-light dark:text-ios-green-dark py-1.5 rounded-ios-md text-[11px] font-bold hover:bg-ios-green-light/25 transition flex items-center justify-center gap-1"><Check className="w-3 h-3" /> Confirmer</button>
          )}
          {iAmHost && appt.status === 'confirmed' && (
            <button onClick={() => setAppointmentStatus(appt.id, 'completed')} className="flex-1 bg-ios-blue-light/15 text-ios-blue-light dark:text-ios-blue-dark py-1.5 rounded-ios-md text-[11px] font-bold hover:bg-ios-blue-light/25 transition">Marquer terminé</button>
          )}
          <button onClick={() => { if (confirm('Annuler ce RDV ?')) setAppointmentStatus(appt.id, 'cancelled'); }} className="flex items-center justify-center gap-1 px-3 bg-ios-pink-light/10 text-ios-pink-light dark:text-ios-pink-dark py-1.5 rounded-ios-md text-[11px] font-bold hover:bg-ios-pink-light/20 transition"><X className="w-3 h-3" /> Annuler</button>
          <a href={googleCalendarUrl(calEntry)} target="_blank" rel="noreferrer" className="flex items-center justify-center px-2.5 bg-black/5 dark:bg-white/5 py-1.5 rounded-ios-md text-[11px] font-bold hover:bg-black/10 transition" title="Ajouter à Google Agenda"><CalendarPlus className="w-3 h-3" /></a>
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Slots manager (host opens bookable slots)
// ──────────────────────────────────────────────────────────────────────────
const SlotsManager: React.FC<{ hostId: string; slots: AvailabilitySlot[] }> = ({ hostId, slots }) => {
  const { createSlots, deleteSlot } = useCalendarStore();
  const now = new Date();
  const def = new Date(now.getTime() + 24 * 60 * 60_000);
  def.setMinutes(0, 0, 0); def.setHours(10);
  const [start, setStart] = useState(toLocalInput(def));
  const [duration, setDuration] = useState(30);
  const [count, setCount] = useState(1);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    setSaving(true);
    const base = new Date(start);
    const rows = Array.from({ length: count }, (_, i) => {
      const s = new Date(base.getTime() + i * duration * 60_000);
      const e = new Date(s.getTime() + duration * 60_000);
      return { starts_at: s.toISOString(), ends_at: e.toISOString() };
    });
    await createSlots(hostId, rows);
    setSaving(false);
  };

  const open = slots.filter(s => s.status === 'open');
  const booked = slots.filter(s => s.status === 'booked');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5">
        <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-2xl p-5 shadow-ios-soft space-y-4">
          <h3 className="font-extrabold flex items-center gap-2"><Plus className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark" /> Ouvrir des créneaux</h3>
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">Début du premier créneau</label>
            <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">Durée (min)</label>
              <select value={duration} onChange={e => setDuration(+e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light">
                {[15, 30, 45, 60, 90].map(d => <option key={d} value={d}>{d} min</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">Nombre</label>
              <select value={count} onChange={e => setCount(+e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light">
                {[1, 2, 3, 4, 6, 8].map(d => <option key={d} value={d}>{d} créneau{d > 1 ? 'x' : ''}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-ios-label-secondaryLight">Les créneaux consécutifs seront créés à la suite (ex : 3 × 30 min = 10:00, 10:30, 11:00).</p>
          <button onClick={add} disabled={saving} className="w-full py-2.5 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-sm font-bold shadow-ios-glow hover:opacity-95 transition disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Check className="w-4 h-4" /> Créer les créneaux</>}
          </button>
        </div>
      </div>

      <div className="lg:col-span-7 space-y-4">
        <div>
          <h3 className="font-extrabold mb-2 flex items-center gap-2"><Clock className="w-4 h-4 text-ios-green-light dark:text-ios-green-dark" /> Créneaux ouverts ({open.length})</h3>
          {open.length === 0 ? (
            <div className="glass-card p-5 text-center text-sm text-ios-label-secondaryLight">Aucun créneau ouvert. Créez-en pour que les membres puissent réserver.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {open.map(s => (
                <div key={s.id} className="glass-card p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold capitalize truncate">{fmtRelativeDay(s.starts_at)}</p>
                    <p className="text-[11px] text-ios-label-secondaryLight">{fmtTime(s.starts_at)}</p>
                  </div>
                  <button onClick={() => deleteSlot(s.id)} className="p-1 text-ios-pink-light dark:text-ios-pink-dark hover:bg-ios-pink-light/10 rounded-full shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        {booked.length > 0 && (
          <div>
            <h3 className="font-extrabold mb-2 flex items-center gap-2 text-ios-label-secondaryLight"><UsersIcon className="w-4 h-4" /> Réservés ({booked.length})</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 opacity-70">
              {booked.map(s => (
                <div key={s.id} className="glass-card p-3">
                  <p className="text-xs font-bold capitalize truncate">{fmtRelativeDay(s.starts_at)}</p>
                  <p className="text-[11px] text-ios-label-secondaryLight">{fmtTime(s.starts_at)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
