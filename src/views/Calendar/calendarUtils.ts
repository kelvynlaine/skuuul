// ──────────────────────────────────────────────────────────────────────────
// Calendar utilities — Google Calendar links, .ics export, date helpers
// ──────────────────────────────────────────────────────────────────────────

export interface CalEntry {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;          // ISO
  endsAt?: string | null;    // ISO
}

// ── Color tokens for events (matches the ios-* palette) ──
export const EVENT_COLORS: Record<string, { dot: string; bg: string; text: string; ring: string }> = {
  blue:   { dot: 'bg-ios-blue-light dark:bg-ios-blue-dark',     bg: 'bg-ios-blue-light/10 dark:bg-ios-blue-dark/15',     text: 'text-ios-blue-light dark:text-ios-blue-dark',     ring: 'ring-ios-blue-light/30' },
  indigo: { dot: 'bg-ios-indigo-light dark:bg-ios-indigo-dark', bg: 'bg-ios-indigo-light/10 dark:bg-ios-indigo-dark/15', text: 'text-ios-indigo-light dark:text-ios-indigo-dark', ring: 'ring-ios-indigo-light/30' },
  orange: { dot: 'bg-ios-orange-light dark:bg-ios-orange-dark', bg: 'bg-ios-orange-light/10 dark:bg-ios-orange-dark/15', text: 'text-ios-orange-light dark:text-ios-orange-dark', ring: 'ring-ios-orange-light/30' },
  green:  { dot: 'bg-ios-green-light dark:bg-ios-green-dark',   bg: 'bg-ios-green-light/10 dark:bg-ios-green-dark/15',   text: 'text-ios-green-light dark:text-ios-green-dark',   ring: 'ring-ios-green-light/30' },
  pink:   { dot: 'bg-ios-pink-light dark:bg-ios-pink-dark',     bg: 'bg-ios-pink-light/10 dark:bg-ios-pink-dark/15',     text: 'text-ios-pink-light dark:text-ios-pink-dark',     ring: 'ring-ios-pink-light/30' },
};

export const colorOf = (c?: string | null) => EVENT_COLORS[c || 'blue'] || EVENT_COLORS.blue;

// ── Google Calendar formatting: YYYYMMDDTHHMMSSZ (UTC) ──
const toGCal = (iso: string): string => {
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
};

/** Build an "Add to Google Calendar" URL. */
export function googleCalendarUrl(e: CalEntry): string {
  const start = new Date(e.startsAt);
  const end = e.endsAt ? new Date(e.endsAt) : new Date(start.getTime() + 30 * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${toGCal(start.toISOString())}/${toGCal(end.toISOString())}`,
  });
  if (e.description) params.set('details', e.description);
  if (e.location) params.set('location', e.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Build an .ics file body (Apple Calendar / Outlook / Google import). */
export function buildIcs(e: CalEntry): string {
  const start = new Date(e.startsAt);
  const end = e.endsAt ? new Date(e.endsAt) : new Date(start.getTime() + 30 * 60_000);
  const uid = `${toGCal(start.toISOString())}-${Math.random().toString(36).slice(2)}@skuuul`;
  const esc = (s: string) => s.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Skuuul//Calendrier//FR',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toGCal(new Date().toISOString())}`,
    `DTSTART:${toGCal(start.toISOString())}`,
    `DTEND:${toGCal(end.toISOString())}`,
    `SUMMARY:${esc(e.title)}`,
    e.description ? `DESCRIPTION:${esc(e.description)}` : '',
    e.location ? `LOCATION:${esc(e.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

/** Trigger a browser download of the .ics file for an entry. */
export function downloadIcs(e: CalEntry): void {
  const blob = new Blob([buildIcs(e)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${e.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'evenement'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Date helpers ──
export const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
export const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Returns a 6x7 grid of dates for the month view (Monday-first). */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  // JS getDay: 0=Sun..6=Sat → convert to Monday-first index
  const startOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const fmtDayLong = (iso: string | Date) => {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
};

export const fmtRelativeDay = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Demain';
  if (diffDays === -1) return 'Hier';
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString('fr-FR', { weekday: 'long' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};

/** Produce datetime-local input value (local tz) from a Date. */
export const toLocalInput = (d: Date): string => {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
};
