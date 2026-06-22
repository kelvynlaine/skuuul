import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  MessageCircle, Send, ArrowLeft, User, Search, X, Trash2, Check, CheckCheck,
  PenSquare, Loader2, Reply, Pencil, Pin, PinOff, ChevronUp, ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useMessageStore, Conversation, MemberResult, DirectMessage } from '../../store/messageStore';

const isToday = (d: Date) => {
  const n = new Date();
  return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
};
const isYesterday = (d: Date) => {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return d.getDate() === y.getDate() && d.getMonth() === y.getMonth() && d.getFullYear() === y.getFullYear();
};
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return "Aujourd'hui";
  if (isYesterday(d)) return 'Hier';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

// Highlight occurrences of `query` inside `text`
const renderHighlighted = (text: string, query: string): React.ReactNode => {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="bg-ios-orange-light/50 dark:bg-ios-orange-dark/50 text-inherit rounded px-0.5">{part}</mark>
      : part
  );
};

export const MessagesView: React.FC = () => {
  const { profile } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    conversations,
    messages,
    onlineUsers,
    typingUsers,
    fetchConversations,
    fetchMessages,
    sendMessage,
    editMessage,
    togglePin,
    deleteMessage,
    getOrCreateConversation,
    markConversationRead,
    searchMembers,
    subscribeToConversation,
    unsubscribeFromConversation,
    broadcastTyping,
    initPresence,
  } = useMessageStore();

  const [selected, setSelected] = useState<Conversation | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [convSearch, setConvSearch] = useState('');
  const [memberResults, setMemberResults] = useState<MemberResult[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);

  // Lot 1 state
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadQuery, setThreadQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (profile) {
      fetchConversations(profile.id);
      initPresence(profile.id);
    }
    return () => { unsubscribeFromConversation(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Auto-open conversation from profile page "Message" button
  useEffect(() => {
    const startWith = (location.state as any)?.startWith;
    if (startWith && profile) {
      getOrCreateConversation(profile.id, startWith.id).then(async (convId) => {
        await fetchConversations(profile.id);
        const conv: Conversation = {
          id: convId,
          participant_a: profile.id,
          participant_b: startWith.id,
          last_message_at: new Date(Date.now()).toISOString(),
          created_at: new Date(Date.now()).toISOString(),
          other_profile: {
            id: startWith.id,
            username: startWith.username,
            full_name: startWith.full_name,
            avatar_url: startWith.avatar_url,
          },
        };
        openConversation(conv);
        navigate('.', { replace: true, state: {} });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  useEffect(() => {
    if (!threadSearchOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers, threadSearchOpen]);

  // Debounced member search for "new conversation"
  useEffect(() => {
    if (!newChatOpen || !profile) return;
    const q = convSearch.trim();
    if (q.length < 1) { setMemberResults([]); return; }
    setSearchingMembers(true);
    const t = setTimeout(async () => {
      const res = await searchMembers(q, profile.id);
      setMemberResults(res);
      setSearchingMembers(false);
    }, 250);
    return () => clearTimeout(t);
  }, [convSearch, newChatOpen, profile, searchMembers]);

  const flashMessage = useCallback((id: string) => {
    messageRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(id);
    setTimeout(() => setHighlightId(curr => (curr === id ? null : curr)), 1600);
  }, []);

  const resetThreadExtras = () => {
    setReplyTo(null); setEditingId(null); setInput('');
    setThreadSearchOpen(false); setThreadQuery(''); setMatchIndex(0);
  };

  const openConversation = useCallback(async (conv: Conversation) => {
    setSelected(conv);
    setNewChatOpen(false);
    setConvSearch('');
    setReplyTo(null); setEditingId(null); setInput('');
    setThreadSearchOpen(false); setThreadQuery('');
    await fetchMessages(conv.id);
    subscribeToConversation(conv.id, profile!.id);
    if (profile) markConversationRead(conv.id, profile.id);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [fetchMessages, subscribeToConversation, markConversationRead, profile]);

  const startConversationWith = async (member: MemberResult) => {
    if (!profile) return;
    const convId = await getOrCreateConversation(profile.id, member.id);
    await fetchConversations(profile.id);
    openConversation({
      id: convId,
      participant_a: profile.id,
      participant_b: member.id,
      last_message_at: new Date(Date.now()).toISOString(),
      created_at: new Date(Date.now()).toISOString(),
      other_profile: {
        id: member.id,
        username: member.username,
        full_name: member.full_name,
        avatar_url: member.avatar_url,
      },
    });
  };

  const startReply = (msg: DirectMessage) => {
    setEditingId(null);
    setReplyTo(msg);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const startEdit = (msg: DirectMessage) => {
    setReplyTo(null);
    setEditingId(msg.id);
    setInput(msg.content);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const cancelComposerExtra = () => {
    setReplyTo(null);
    if (editingId) { setEditingId(null); setInput(''); }
  };

  const handleSend = async () => {
    if (!input.trim() || !selected || !profile || sending) return;
    const text = input.trim();
    setSending(true);
    if (editingId) {
      await editMessage(editingId, text);
      setEditingId(null);
    } else {
      await sendMessage(selected.id, profile.id, text, replyTo?.id ?? null);
      setReplyTo(null);
    }
    setInput('');
    setSending(false);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (selected && profile && !editingId) {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      broadcastTyping(profile.id);
      typingTimerRef.current = setTimeout(() => {}, 1500);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') cancelComposerExtra();
  };

  // Filter conversation list by local search
  const filteredConvs = conversations.filter(c => {
    if (!convSearch.trim() || newChatOpen) return true;
    const q = convSearch.toLowerCase();
    return (
      c.other_profile?.username?.toLowerCase().includes(q) ||
      c.other_profile?.full_name?.toLowerCase().includes(q) ||
      c.last_message?.toLowerCase().includes(q)
    );
  });

  const otherOnline = selected?.other_profile && onlineUsers.has(selected.other_profile.id);
  const isTyping = selected?.other_profile && typingUsers.has(selected.other_profile.id);

  const pinned = useMemo(() => messages.filter(m => m.is_pinned), [messages]);

  // Thread search matches
  const matches = useMemo(() => {
    const q = threadQuery.trim().toLowerCase();
    if (!q) return [] as DirectMessage[];
    return messages.filter(m => m.content.toLowerCase().includes(q));
  }, [threadQuery, messages]);

  useEffect(() => {
    if (matches.length === 0) return;
    const idx = Math.min(matchIndex, matches.length - 1);
    flashMessage(matches[idx].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchIndex, threadQuery]);

  const gotoMatch = (dir: 1 | -1) => {
    if (matches.length === 0) return;
    setMatchIndex(i => (i + dir + matches.length) % matches.length);
  };

  const senderLabel = (id: string) =>
    id === profile?.id ? 'Vous' : (selected?.other_profile?.full_name || selected?.other_profile?.username || 'Membre');

  const renderAvatar = (
    prof: { username: string; avatar_url: string | null } | undefined,
    size: string,
    showStatus = false,
    online = false,
  ) => (
    <div className="relative shrink-0">
      {prof?.avatar_url ? (
        <img src={prof.avatar_url} alt="" className={`${size} rounded-full object-cover`} />
      ) : (
        <div className={`${size} rounded-full bg-gradient-to-tr from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark flex items-center justify-center text-white font-bold`}>
          {prof?.username?.[0]?.toUpperCase() ?? <User className="w-4 h-4" />}
        </div>
      )}
      {showStatus && (
        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-ios-bg-dark ${online ? 'bg-ios-green-light dark:bg-ios-green-dark' : 'bg-ios-gray-light dark:bg-ios-gray-dark'}`} />
      )}
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-9rem)] md:h-[calc(100vh-10rem)] gap-0 md:gap-4 -mx-3 md:mx-0">
      {/* ──────────── Conversation list / sidebar ──────────── */}
      <div className={`w-full md:w-80 shrink-0 glass-card md:rounded-ios-xl rounded-none overflow-hidden flex flex-col ${selected ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
          <h2 className="font-extrabold flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-ios-blue-light dark:text-ios-blue-dark" />
            Messages
          </h2>
          <button
            onClick={() => { setNewChatOpen(v => !v); setConvSearch(''); setMemberResults([]); }}
            className={`p-2 rounded-ios-lg transition ${newChatOpen ? 'bg-ios-blue-light dark:bg-ios-blue-dark text-white' : 'bg-black/5 dark:bg-white/5 text-ios-blue-light dark:text-ios-blue-dark hover:opacity-80'}`}
            title="Nouvelle conversation"
          >
            <PenSquare className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-3 py-2.5 border-b border-black/5 dark:border-white/5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark" />
            <input
              type="text"
              value={convSearch}
              onChange={e => setConvSearch(e.target.value)}
              placeholder={newChatOpen ? 'Rechercher un membre...' : 'Rechercher une conversation...'}
              autoFocus={newChatOpen}
              className="w-full bg-black/5 dark:bg-white/5 rounded-ios-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
            />
            {convSearch && (
              <button onClick={() => setConvSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:opacity-70">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* List body */}
        <div className="flex-1 overflow-y-auto">
          {newChatOpen ? (
            /* ── New conversation: member search results ── */
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {searchingMembers && (
                <div className="py-6 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin text-ios-blue-light dark:text-ios-blue-dark" /></div>
              )}
              {!searchingMembers && convSearch.trim().length >= 1 && memberResults.length === 0 && (
                <p className="py-6 text-center text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Aucun membre trouvé</p>
              )}
              {!searchingMembers && convSearch.trim().length < 1 && (
                <p className="py-6 px-4 text-center text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Tapez un nom ou @username pour démarrer une conversation</p>
              )}
              {memberResults.map(m => (
                <button
                  key={m.id}
                  onClick={() => startConversationWith(m)}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  {renderAvatar(m, 'w-10 h-10', true, onlineUsers.has(m.id))}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{m.full_name || m.username}</p>
                    <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate">@{m.username}</p>
                  </div>
                  <Send className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark opacity-60" />
                </button>
              ))}
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="py-10 text-center px-4">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark opacity-40" />
              <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                {convSearch ? 'Aucun résultat' : 'Aucune conversation'}
              </p>
              {!convSearch && (
                <button onClick={() => setNewChatOpen(true)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ios-blue-light dark:text-ios-blue-dark">
                  <PenSquare className="w-4 h-4" /> Démarrer une conversation
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {filteredConvs.map(conv => {
                const online = conv.other_profile && onlineUsers.has(conv.other_profile.id);
                const unread = (conv.unread_count ?? 0) > 0;
                return (
                  <button
                    key={conv.id}
                    onClick={() => openConversation(conv)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${selected?.id === conv.id ? 'bg-ios-blue-light/5 dark:bg-ios-blue-dark/8' : ''}`}
                  >
                    {renderAvatar(conv.other_profile, 'w-11 h-11', true, !!online)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm truncate ${unread ? 'font-extrabold' : 'font-semibold'}`}>{conv.other_profile?.full_name || conv.other_profile?.username}</p>
                        <span className="shrink-0 text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                          {conv.last_message_at && new Date(conv.last_message_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className={`text-xs truncate ${unread ? 'text-ios-label-primaryLight dark:text-ios-label-primaryDark font-medium' : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}>
                          {conv.last_message_sender === profile?.id && conv.last_message ? 'Vous : ' : ''}{conv.last_message || 'Nouvelle conversation'}
                        </p>
                        {unread && (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-1 bg-ios-blue-light dark:bg-ios-blue-dark text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ──────────── Message thread ──────────── */}
      <div className={`flex-1 glass-card md:rounded-ios-xl rounded-none overflow-hidden flex flex-col ${!selected ? 'hidden md:flex' : 'flex'}`}>
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <MessageCircle className="w-12 h-12 mb-3 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark opacity-30" />
            <p className="font-bold">Vos messages</p>
            <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1 max-w-xs">
              Sélectionnez une conversation ou démarrez-en une nouvelle pour discuter en privé.
            </p>
            <button onClick={() => setNewChatOpen(true)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-ios-lg bg-ios-blue-light dark:bg-ios-blue-dark text-white text-sm font-semibold hover:opacity-90 transition">
              <PenSquare className="w-4 h-4" /> Nouvelle conversation
            </button>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-3 md:px-4 py-3 border-b border-black/5 dark:border-white/5 flex items-center gap-3">
              <button onClick={() => { setSelected(null); unsubscribeFromConversation(); resetThreadExtras(); }} className="md:hidden p-1 -ml-1">
                <ArrowLeft className="w-5 h-5" />
              </button>
              {renderAvatar(selected.other_profile, 'w-9 h-9', true, !!otherOnline)}
              <button
                onClick={() => navigate(`/profile/${selected.other_profile?.username}`)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="font-bold text-sm truncate">{selected.other_profile?.full_name || selected.other_profile?.username}</p>
                <p className="text-[11px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                  {isTyping ? (
                    <span className="text-ios-blue-light dark:text-ios-blue-dark font-medium">en train d'écrire…</span>
                  ) : otherOnline ? (
                    <span className="text-ios-green-light dark:text-ios-green-dark font-medium">en ligne</span>
                  ) : (
                    `@${selected.other_profile?.username}`
                  )}
                </p>
              </button>
              <button
                onClick={() => { setThreadSearchOpen(o => !o); setThreadQuery(''); setMatchIndex(0); }}
                className={`p-2 rounded-ios-lg transition shrink-0 ${threadSearchOpen ? 'bg-ios-blue-light dark:bg-ios-blue-dark text-white' : 'hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}
                title="Rechercher dans la conversation"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>

            {/* In-thread search bar */}
            {threadSearchOpen && (
              <div className="px-3 md:px-4 py-2 border-b border-black/5 dark:border-white/5 flex items-center gap-2 bg-black/3 dark:bg-white/3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark" />
                  <input
                    autoFocus
                    type="text"
                    value={threadQuery}
                    onChange={e => { setThreadQuery(e.target.value); setMatchIndex(0); }}
                    placeholder="Rechercher dans ce fil..."
                    className="w-full bg-black/5 dark:bg-white/5 rounded-ios-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
                  />
                </div>
                <span className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark tabular-nums min-w-[3rem] text-center">
                  {matches.length > 0 ? `${matchIndex + 1}/${matches.length}` : '0/0'}
                </span>
                <button onClick={() => gotoMatch(-1)} disabled={matches.length === 0} className="p-1.5 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                <button onClick={() => gotoMatch(1)} disabled={matches.length === 0} className="p-1.5 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                <button onClick={() => { setThreadSearchOpen(false); setThreadQuery(''); }} className="p-1.5 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5"><X className="w-4 h-4" /></button>
              </div>
            )}

            {/* Pinned banner */}
            {pinned.length > 0 && !threadSearchOpen && (
              <button
                onClick={() => flashMessage(pinned[pinned.length - 1].id)}
                className="px-3 md:px-4 py-2 border-b border-black/5 dark:border-white/5 flex items-center gap-2 bg-ios-orange-light/5 dark:bg-ios-orange-dark/10 text-left hover:bg-ios-orange-light/10 dark:hover:bg-ios-orange-dark/15 transition"
              >
                <Pin className="w-3.5 h-3.5 text-ios-orange-light dark:text-ios-orange-dark shrink-0 fill-current" />
                <span className="text-[11px] font-bold text-ios-orange-light dark:text-ios-orange-dark shrink-0">
                  {pinned.length > 1 ? `${pinned.length} épinglés` : 'Épinglé'}
                </span>
                <span className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate">
                  {pinned[pinned.length - 1].content || 'Pièce jointe'}
                </span>
              </button>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-1">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  {renderAvatar(selected.other_profile, 'w-16 h-16')}
                  <p className="font-bold mt-3">{selected.other_profile?.full_name || selected.other_profile?.username}</p>
                  <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1">Dites bonjour 👋</p>
                </div>
              )}
              {messages.map((msg, i) => {
                const isMe = msg.sender_id === profile?.id;
                const prev = messages[i - 1];
                const showDay = !prev || dayLabel(prev.created_at) !== dayLabel(msg.created_at);
                const grouped = prev && prev.sender_id === msg.sender_id && !showDay &&
                  (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 120000);
                const highlighted = highlightId === msg.id;
                return (
                  <React.Fragment key={msg.id}>
                    {showDay && (
                      <div className="flex justify-center my-3">
                        <span className="text-[10px] font-semibold px-3 py-1 rounded-full bg-black/5 dark:bg-white/10 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                          {dayLabel(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <div
                      ref={el => { messageRefs.current[msg.id] = el; }}
                      className={`group flex items-end gap-1 ${isMe ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-2'} rounded-2xl transition-colors ${highlighted ? 'ring-2 ring-ios-orange-light dark:ring-ios-orange-dark ring-offset-2 ring-offset-transparent' : ''}`}
                    >
                      {/* Action toolbar (left of my messages) */}
                      {isMe && (
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition shrink-0">
                          <button onClick={() => startReply(msg)} className="p-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-blue-light dark:hover:text-ios-blue-dark" title="Répondre"><Reply className="w-3.5 h-3.5" /></button>
                          <button onClick={() => togglePin(msg.id)} className="p-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-orange-light dark:hover:text-ios-orange-dark" title={msg.is_pinned ? 'Désépingler' : 'Épingler'}>{msg.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}</button>
                          <button onClick={() => startEdit(msg)} className="p-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-blue-light dark:hover:text-ios-blue-dark" title="Modifier"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteMessage(msg.id)} className="p-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-red-light dark:hover:text-ios-red-dark" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      )}

                      <div className={`relative max-w-[80%] md:max-w-[70%] px-3 py-2 text-sm ${
                        isMe
                          ? `bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-2xl ${grouped ? 'rounded-tr-md' : ''} rounded-br-md`
                          : `bg-black/5 dark:bg-white/10 rounded-2xl ${grouped ? 'rounded-tl-md' : ''} rounded-bl-md`
                      } ${msg.pending ? 'opacity-60' : ''}`}>
                        {msg.is_pinned && (
                          <Pin className={`absolute -top-1.5 ${isMe ? '-left-1.5' : '-right-1.5'} w-3 h-3 text-ios-orange-light dark:text-ios-orange-dark fill-current`} />
                        )}
                        {/* Quoted reply */}
                        {msg.reply_preview && (
                          <button
                            onClick={() => flashMessage(msg.reply_preview!.id)}
                            className={`block w-full text-left mb-1 pl-2 border-l-2 rounded-sm ${isMe ? 'border-white/50' : 'border-ios-blue-light dark:border-ios-blue-dark'}`}
                          >
                            <p className={`text-[10px] font-bold ${isMe ? 'text-white/80' : 'text-ios-blue-light dark:text-ios-blue-dark'}`}>{senderLabel(msg.reply_preview.sender_id)}</p>
                            <p className={`text-[11px] truncate ${isMe ? 'text-white/70' : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}>{msg.reply_preview.content || 'Pièce jointe'}</p>
                          </button>
                        )}
                        <p className="leading-relaxed whitespace-pre-wrap break-words">
                          {threadSearchOpen && threadQuery ? renderHighlighted(msg.content, threadQuery) : msg.content}
                        </p>
                        <p className={`text-[10px] mt-0.5 flex items-center gap-1 justify-end ${isMe ? 'text-white/60' : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}>
                          {msg.edited_at && <span className="italic">modifié</span>}
                          {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          {isMe && (msg.pending ? <Loader2 className="w-3 h-3 animate-spin" /> : msg.is_read ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />)}
                        </p>
                      </div>

                      {/* Action toolbar (right of others' messages) */}
                      {!isMe && (
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition shrink-0">
                          <button onClick={() => startReply(msg)} className="p-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-blue-light dark:hover:text-ios-blue-dark" title="Répondre"><Reply className="w-3.5 h-3.5" /></button>
                          <button onClick={() => togglePin(msg.id)} className="p-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-orange-light dark:hover:text-ios-orange-dark" title={msg.is_pinned ? 'Désépingler' : 'Épingler'}>{msg.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}</button>
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
              {isTyping && (
                <div className="flex justify-start mt-2">
                  <div className="bg-black/5 dark:bg-white/10 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-ios-label-secondaryLight dark:bg-ios-label-secondaryDark animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-ios-label-secondaryLight dark:bg-ios-label-secondaryDark animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-ios-label-secondaryLight dark:bg-ios-label-secondaryDark animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply / edit indicator */}
            {(replyTo || editingId) && (
              <div className="px-3 md:px-4 py-2 border-t border-black/5 dark:border-white/5 flex items-center gap-2 bg-black/3 dark:bg-white/3">
                {editingId ? (
                  <Pencil className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark shrink-0" />
                ) : (
                  <Reply className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-ios-blue-light dark:text-ios-blue-dark">
                    {editingId ? 'Modification du message' : `Réponse à ${replyTo ? senderLabel(replyTo.sender_id) : ''}`}
                  </p>
                  {replyTo && !editingId && (
                    <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate">{replyTo.content || 'Pièce jointe'}</p>
                  )}
                </div>
                <button onClick={cancelComposerExtra} className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5"><X className="w-4 h-4" /></button>
              </div>
            )}

            {/* Input */}
            <div className="p-2.5 md:p-3 border-t border-black/5 dark:border-white/5 flex items-end gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={editingId ? 'Modifier le message...' : 'Écrire un message...'}
                className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="p-2.5 rounded-full bg-ios-blue-light dark:bg-ios-blue-dark text-white disabled:opacity-40 hover:opacity-90 transition shrink-0"
                title={editingId ? 'Enregistrer' : 'Envoyer'}
              >
                {editingId ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
