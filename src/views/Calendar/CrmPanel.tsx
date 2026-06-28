import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Search, StickyNote, Check, MessageCircle, Phone, ChevronDown } from 'lucide-react';
import { useCalendarStore, CrmContact, CrmStage, Appointment } from '../../store/calendarStore';

interface Props {
  hostId: string;
}

const STAGES: { key: CrmStage; label: string; color: string }[] = [
  { key: 'prospect',  label: 'Prospect',  color: 'bg-ios-orange-light/15 text-ios-orange-light dark:text-ios-orange-dark' },
  { key: 'active',    label: 'Actif',     color: 'bg-ios-blue-light/15 text-ios-blue-light dark:text-ios-blue-dark' },
  { key: 'completed', label: 'Terminé',   color: 'bg-ios-green-light/15 text-ios-green-light dark:text-ios-green-dark' },
  { key: 'lost',      label: 'Perdu',     color: 'bg-ios-gray-1/15 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark' },
];
const stageMeta = (s: CrmStage) => STAGES.find(x => x.key === s) || STAGES[0];

const ContactRow: React.FC<{ contact: CrmContact; appointments: Appointment[] }> = ({ contact, appointments }) => {
  const { updateCrmContact } = useCalendarStore();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(contact.note || '');
  const [savedFlash, setSavedFlash] = useState(false);
  const m = contact.member;

  const history = useMemo(
    () => appointments.filter(a => a.member_id === contact.member_id).sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at)),
    [appointments, contact.member_id]
  );

  const saveNote = async () => {
    await updateCrmContact(contact.id, { note });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <div className="glass-card p-0 overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        {m?.avatar_url
          ? <img src={m.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
          : <div className="w-11 h-11 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 flex items-center justify-center text-ios-blue-light dark:text-ios-blue-dark font-bold shrink-0">{(m?.username || '?')[0].toUpperCase()}</div>}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{m?.full_name || m?.username}</p>
          <p className="text-xs text-ios-label-secondaryLight truncate">@{m?.username} · {history.length} RDV</p>
        </div>

        {/* Stage selector */}
        <div className="relative shrink-0">
          <select
            value={contact.stage}
            onChange={e => updateCrmContact(contact.id, { stage: e.target.value as CrmStage })}
            className={`appearance-none cursor-pointer pl-2.5 pr-7 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide focus:outline-none ${stageMeta(contact.stage).color}`}
          >
            {STAGES.map(s => <option key={s.key} value={s.key} className="text-black dark:text-white">{s.label}</option>)}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
        </div>

        <button onClick={() => setOpen(o => !o)} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full shrink-0" title="Détails">
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-black/5 dark:border-white/5 pt-3 animate-fade-in">
          {/* Note */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider flex items-center gap-1"><StickyNote className="w-3 h-3" /> Note privée</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Ajouter une note sur ce contact..." className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
            <div className="flex justify-end">
              <button onClick={saveNote} className="text-[11px] font-bold text-ios-blue-light dark:text-ios-blue-dark flex items-center gap-1 hover:underline">
                {savedFlash ? <><Check className="w-3 h-3" /> Enregistré</> : 'Enregistrer la note'}
              </button>
            </div>
          </div>

          {/* History */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider">Historique RDV</label>
            {history.length === 0 ? (
              <p className="text-xs text-ios-label-secondaryLight italic">Aucun rendez-vous.</p>
            ) : (
              <div className="space-y-1">
                {history.map(a => (
                  <div key={a.id} className="flex items-center justify-between text-xs bg-black/5 dark:bg-white/5 rounded-ios-md px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-ios-label-secondaryLight" /> {new Date(a.starts_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${stageMeta(a.status === 'confirmed' ? 'active' : a.status === 'completed' ? 'completed' : a.status === 'cancelled' ? 'lost' : 'prospect').color}`}>{a.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Link to="/messages" state={{ startWith: m }} className="flex-1 bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 text-ios-blue-light dark:text-ios-blue-dark py-2 rounded-ios-lg text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-ios-blue-light/20 transition">
              <MessageCircle className="w-3.5 h-3.5" /> Message
            </Link>
            {m && <Link to={`/profile/${m.username}`} className="flex-1 bg-black/5 dark:bg-white/5 py-2 rounded-ios-lg text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-black/10 transition">Profil</Link>}
          </div>
        </div>
      )}
    </div>
  );
};

export const CrmPanel: React.FC<Props> = ({ hostId }) => {
  const { crmContacts, fetchCrm, appointments } = useCalendarStore();
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<CrmStage | 'all'>('all');

  useEffect(() => { fetchCrm(hostId); }, [hostId, fetchCrm]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: crmContacts.length };
    STAGES.forEach(s => { c[s.key] = crmContacts.filter(x => x.stage === s.key).length; });
    return c;
  }, [crmContacts]);

  const filtered = crmContacts
    .filter(c => stageFilter === 'all' || c.stage === stageFilter)
    .filter(c => !query.trim() || (c.member?.username || '').toLowerCase().includes(query.toLowerCase()) || (c.member?.full_name || '').toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-4">
      {/* Pipeline summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STAGES.map(s => (
          <button key={s.key} onClick={() => setStageFilter(stageFilter === s.key ? 'all' : s.key)}
            className={`glass-card p-3 text-left transition-all ${stageFilter === s.key ? 'ring-2 ring-ios-blue-light/40' : ''}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-ios-label-secondaryLight">{s.label}</p>
            <p className="text-2xl font-extrabold mt-0.5">{counts[s.key] || 0}</p>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un contact..." className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-light" />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-2xl p-10 text-center">
          <Users className="w-12 h-12 text-ios-label-secondaryLight/30 mx-auto mb-3" />
          <h3 className="font-extrabold">Aucun contact</h3>
          <p className="text-sm text-ios-label-secondaryLight mt-1">Vos contacts CRM apparaîtront ici dès qu'un membre réserve un RDV.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => <ContactRow key={c.id} contact={c} appointments={appointments} />)}
        </div>
      )}
    </div>
  );
};
