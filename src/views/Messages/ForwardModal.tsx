import React, { useEffect, useState } from 'react';
import { X, Search, Send, User, Loader2 } from 'lucide-react';
import { Conversation, MemberResult } from '../../store/messageStore';

interface Props {
  conversations: Conversation[];
  myId: string;
  searchMembers: (query: string, excludeId: string) => Promise<MemberResult[]>;
  onPickConversation: (conversationId: string) => void;
  onPickMember: (member: MemberResult) => void;
  onClose: () => void;
}

const Avatar: React.FC<{ url?: string | null; name?: string | null; size?: string }> = ({ url, name, size = 'w-9 h-9' }) => (
  url
    ? <img src={url} alt="" className={`${size} rounded-full object-cover shrink-0`} />
    : <div className={`${size} rounded-full bg-gradient-to-tr from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark flex items-center justify-center text-white font-bold shrink-0`}>{name?.[0]?.toUpperCase() ?? <User className="w-4 h-4" />}</div>
);

export const ForwardModal: React.FC<Props> = ({ conversations, myId, searchMembers, onPickConversation, onPickMember, onClose }) => {
  const [query, setQuery] = useState('');
  const [members, setMembers] = useState<MemberResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setMembers([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      setMembers(await searchMembers(q, myId));
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, myId, searchMembers]);

  const filteredConvs = conversations.filter(c => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return c.other_profile?.username?.toLowerCase().includes(q) || c.other_profile?.full_name?.toLowerCase().includes(q);
  });

  // members already in a conversation (avoid duplicate listing)
  const convMemberIds = new Set(conversations.map(c => c.other_profile?.id));
  const newMembers = members.filter(m => !convMemberIds.has(m.id));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={onClose}>
      <div className="glass-panel w-full max-w-sm rounded-ios-2xl border border-white/10 shadow-ios-strong overflow-hidden animate-scale-in flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
          <h3 className="font-extrabold flex items-center gap-2"><Send className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark" /> Transférer à…</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-3 border-b border-black/5 dark:border-white/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark" />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un membre..." className="w-full bg-black/5 dark:bg-white/5 rounded-ios-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-black/5 dark:divide-white/5">
          {filteredConvs.map(c => (
            <button key={c.id} onClick={() => onPickConversation(c.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
              <Avatar url={c.other_profile?.avatar_url} name={c.other_profile?.username} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{c.other_profile?.full_name || c.other_profile?.username}</p>
                <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate">@{c.other_profile?.username}</p>
              </div>
              <Send className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark opacity-60" />
            </button>
          ))}

          {searching && <div className="py-4 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin text-ios-blue-light dark:text-ios-blue-dark" /></div>}

          {newMembers.length > 0 && (
            <>
              <p className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark bg-black/3 dark:bg-white/3">Autres membres</p>
              {newMembers.map(m => (
                <button key={m.id} onClick={() => onPickMember(m)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                  <Avatar url={m.avatar_url} name={m.username} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{m.full_name || m.username}</p>
                    <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate">@{m.username}</p>
                  </div>
                  <Send className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark opacity-60" />
                </button>
              ))}
            </>
          )}

          {!searching && filteredConvs.length === 0 && newMembers.length === 0 && (
            <p className="py-6 text-center text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Aucun résultat</p>
          )}
        </div>
      </div>
    </div>
  );
};
