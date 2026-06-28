import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

// ── Types ──
export interface MiniProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: string;
}

export interface CalendarEvent {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  location: string | null;
  meeting_url: string | null;
  starts_at: string;
  ends_at: string | null;
  color: string;
  audience: 'all' | 'members';
  is_published: boolean;
  created_at: string;
  creator?: MiniProfile | null;
  reminder_on?: boolean;        // enriched: has the current user a reminder?
}

export interface AvailabilitySlot {
  id: string;
  host_id: string;
  starts_at: string;
  ends_at: string;
  status: 'open' | 'booked' | 'cancelled';
  created_at: string;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface Appointment {
  id: string;
  slot_id: string | null;
  host_id: string;
  member_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  meeting_url: string | null;
  member_note: string | null;
  host_note: string | null;
  created_at: string;
  host?: MiniProfile | null;
  member?: MiniProfile | null;
}

export type CrmStage = 'prospect' | 'active' | 'completed' | 'lost';

export interface CrmContact {
  id: string;
  host_id: string;
  member_id: string;
  stage: CrmStage;
  note: string | null;
  created_at: string;
  updated_at: string;
  member?: MiniProfile | null;
}

const PROFILE_COLS = 'id, username, full_name, avatar_url, role';

interface CalendarState {
  events: CalendarEvent[];
  slots: AvailabilitySlot[];          // open slots of a selected host (for booking)
  mySlots: AvailabilitySlot[];        // slots owned by the current host
  appointments: Appointment[];        // appointments involving current user
  crmContacts: CrmContact[];
  hosts: MiniProfile[];               // creators/admins bookable
  loading: boolean;
  channel: RealtimeChannel | null;

  fetchEvents: () => Promise<void>;
  createEvent: (e: Partial<CalendarEvent>) => Promise<boolean>;
  updateEvent: (id: string, patch: Partial<CalendarEvent>) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  toggleReminder: (eventId: string, on: boolean) => Promise<void>;

  fetchHosts: () => Promise<void>;
  fetchMySlots: (hostId: string) => Promise<void>;
  fetchHostSlots: (hostId: string) => Promise<void>;
  createSlots: (hostId: string, slots: { starts_at: string; ends_at: string }[]) => Promise<void>;
  deleteSlot: (id: string) => Promise<void>;

  fetchAppointments: (userId: string) => Promise<void>;
  bookAppointment: (args: { slot: AvailabilitySlot; hostId: string; memberId: string; title: string; note: string }) => Promise<boolean>;
  setAppointmentStatus: (id: string, status: AppointmentStatus, meetingUrl?: string) => Promise<void>;

  fetchCrm: (hostId: string) => Promise<void>;
  updateCrmContact: (id: string, patch: Partial<Pick<CrmContact, 'stage' | 'note'>>) => Promise<void>;

  subscribe: (userId: string) => void;
  unsubscribe: () => void;
}

export const useCalendarStore = create<CalendarState>((set, get) => ({
  events: [],
  slots: [],
  mySlots: [],
  appointments: [],
  crmContacts: [],
  hosts: [],
  loading: false,
  channel: null,

  // ── EVENTS ──
  fetchEvents: async () => {
    set({ loading: true });
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('calendar_events')
      .select(`*, creator:profiles!calendar_events_creator_id_fkey(${PROFILE_COLS})`)
      .eq('is_published', true)
      .order('starts_at', { ascending: true });
    if (error) { console.error(error); set({ loading: false }); return; }

    let reminders: Set<string> = new Set();
    if (user) {
      const { data: rem } = await supabase.from('event_reminders').select('event_id').eq('user_id', user.id);
      reminders = new Set((rem || []).map(r => r.event_id));
    }
    const events = (data || []).map(e => ({ ...e, reminder_on: reminders.has(e.id) })) as CalendarEvent[];
    set({ events, loading: false });
  },

  createEvent: async (e) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { error } = await supabase.from('calendar_events').insert({
      creator_id: user.id,
      title: e.title,
      description: e.description ?? null,
      location: e.location ?? null,
      meeting_url: e.meeting_url ?? null,
      starts_at: e.starts_at,
      ends_at: e.ends_at ?? null,
      color: e.color ?? 'blue',
      audience: e.audience ?? 'all',
      is_published: true,
    });
    if (error) { console.error(error); alert("Impossible de créer l'événement : " + error.message); return false; }
    await get().fetchEvents();
    return true;
  },

  updateEvent: async (id, patch) => {
    const { error } = await supabase.from('calendar_events').update(patch).eq('id', id);
    if (error) { console.error(error); return; }
    set(s => ({ events: s.events.map(ev => ev.id === id ? { ...ev, ...patch } : ev) }));
  },

  deleteEvent: async (id) => {
    const { error } = await supabase.from('calendar_events').delete().eq('id', id);
    if (error) { console.error(error); return; }
    set(s => ({ events: s.events.filter(ev => ev.id !== id) }));
  },

  toggleReminder: async (eventId, on) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    set(s => ({ events: s.events.map(ev => ev.id === eventId ? { ...ev, reminder_on: on } : ev) }));
    if (on) {
      const { error } = await supabase.from('event_reminders').insert({ event_id: eventId, user_id: user.id });
      if (error && error.code !== '23505') { console.error(error); }
    } else {
      await supabase.from('event_reminders').delete().eq('event_id', eventId).eq('user_id', user.id);
    }
  },

  // ── HOSTS & SLOTS ──
  fetchHosts: async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLS)
      .in('role', ['creator', 'admin'])
      .order('role', { ascending: true });
    if (error) { console.error(error); return; }
    set({ hosts: (data || []) as MiniProfile[] });
  },

  fetchMySlots: async (hostId) => {
    const { data, error } = await supabase
      .from('availability_slots')
      .select('*')
      .eq('host_id', hostId)
      .gte('ends_at', new Date().toISOString())
      .order('starts_at', { ascending: true });
    if (error) { console.error(error); return; }
    set({ mySlots: (data || []) as AvailabilitySlot[] });
  },

  fetchHostSlots: async (hostId) => {
    const { data, error } = await supabase
      .from('availability_slots')
      .select('*')
      .eq('host_id', hostId)
      .eq('status', 'open')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true });
    if (error) { console.error(error); return; }
    set({ slots: (data || []) as AvailabilitySlot[] });
  },

  createSlots: async (hostId, slots) => {
    const rows = slots.map(s => ({ host_id: hostId, starts_at: s.starts_at, ends_at: s.ends_at, status: 'open' }));
    const { error } = await supabase.from('availability_slots').insert(rows);
    if (error) { console.error(error); alert('Erreur création créneaux : ' + error.message); return; }
    await get().fetchMySlots(hostId);
  },

  deleteSlot: async (id) => {
    const { error } = await supabase.from('availability_slots').delete().eq('id', id);
    if (error) { console.error(error); return; }
    set(s => ({ mySlots: s.mySlots.filter(sl => sl.id !== id), slots: s.slots.filter(sl => sl.id !== id) }));
  },

  // ── APPOINTMENTS ──
  fetchAppointments: async (userId) => {
    const { data, error } = await supabase
      .from('appointments')
      .select(`*,
        host:profiles!appointments_host_id_fkey(${PROFILE_COLS}),
        member:profiles!appointments_member_id_fkey(${PROFILE_COLS})`)
      .or(`host_id.eq.${userId},member_id.eq.${userId}`)
      .order('starts_at', { ascending: true });
    if (error) { console.error(error); return; }
    set({ appointments: (data || []) as Appointment[] });
  },

  bookAppointment: async ({ slot, hostId, memberId, title, note }) => {
    const { error } = await supabase.from('appointments').insert({
      slot_id: slot.id,
      host_id: hostId,
      member_id: memberId,
      title: title || 'Call',
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      status: 'pending',
      member_note: note || null,
    });
    if (error) { console.error(error); alert('Réservation impossible : ' + error.message); return false; }
    // refresh open slots for that host + my appointments
    await get().fetchHostSlots(hostId);
    await get().fetchAppointments(memberId);
    return true;
  },

  setAppointmentStatus: async (id, status, meetingUrl) => {
    const patch: Record<string, unknown> = { status };
    if (meetingUrl !== undefined) patch.meeting_url = meetingUrl;
    const { error } = await supabase.from('appointments').update(patch).eq('id', id);
    if (error) { console.error(error); alert('Erreur : ' + error.message); return; }
    set(s => ({ appointments: s.appointments.map(a => a.id === id ? { ...a, status, ...(meetingUrl !== undefined ? { meeting_url: meetingUrl } : {}) } : a) }));
  },

  // ── CRM ──
  fetchCrm: async (hostId) => {
    const { data, error } = await supabase
      .from('crm_contacts')
      .select(`*, member:profiles!crm_contacts_member_id_fkey(${PROFILE_COLS})`)
      .eq('host_id', hostId)
      .order('updated_at', { ascending: false });
    if (error) { console.error(error); return; }
    set({ crmContacts: (data || []) as CrmContact[] });
  },

  updateCrmContact: async (id, patch) => {
    const { error } = await supabase.from('crm_contacts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { console.error(error); return; }
    set(s => ({ crmContacts: s.crmContacts.map(c => c.id === id ? { ...c, ...patch } : c) }));
  },

  // ── REALTIME ──
  subscribe: (userId) => {
    if (get().channel) return;
    const channel = supabase
      .channel(`calendar-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendar_events' }, () => {
        get().fetchEvents();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        get().fetchAppointments(userId);
      })
      .subscribe();
    set({ channel });
  },

  unsubscribe: () => {
    const { channel } = get();
    if (channel) { supabase.removeChannel(channel); set({ channel: null }); }
  },
}));
