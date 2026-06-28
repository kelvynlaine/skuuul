import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  MessageCircle, Send, ArrowLeft, User, Search, X, Trash2, Check, CheckCheck,
  PenSquare, Loader2, Reply, Pencil, Pin, PinOff, ChevronUp, ChevronDown,
  Smile, Paperclip, Mic, FileText, Download,
  MoreVertical, Bell, BellOff, Archive, ArchiveRestore, Ban, Forward,
  Users, UserPlus, BarChart3, Plus,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useMessageStore, Conversation, MemberResult, DirectMessage } from '../../store/messageStore';
import { PollWidget } from '../../components/PollWidget';
import { VoiceRecorder } from './VoiceRecorder';
import { AudioPlayer } from './AudioPlayer';
import { ForwardModal } from './ForwardModal';

const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

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
    sendAttachment,
    uploadDmMedia,
    editMessage,
    togglePin,
    toggleReaction,
    forwardMessage,
    toggleMute,
    toggleArchive,
    blockUser,
    unblockUser,
    deleteMessage,
    createGroup,
    sendPoll,
    castMessagePollVote,
    getOrCreateConversation,
    markConversationRead,
    searchMembers,
    subscribeToConversation,
    unsubscribeFromConversation,
    broadcastTyping,
    initPresence,
  } = useMessageStore();

  const isHost = profile?.role === 'creator' || profile?.role === 'admin';

  const [selected, setSelected] = useState<Conversation | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [convSearch, setConvSearch] = useState('');
  const [memberResults, setMemberResults] = useState<MemberResult[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);

  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [threadSearchOpen, setThreadSearchOpen] = useState(false);
  const [threadQuery, setThreadQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);

  // Lot 2 state
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Lot 3 state
  const [showArchived, setShowArchived] = useState(false);
  const [convMenuOpen, setConvMenuOpen] = useState(false);
  const [forwardFor, setForwardFor] = useState<DirectMessage | null>(null);

  // Groupes
  const [groupMode, setGroupMode] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState<MemberResult[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Sondages
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [sendingPoll, setSendingPoll] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Scroll uniquement à l'arrivée d'un nouveau message (ou son remplacement),
  // pas à chaque événement de frappe — sinon la liste « saute » / scintille.
  useEffect(() => {
    if (!threadSearchOpen) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.id, threadSearchOpen]);

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
    setReactionPickerFor(null); setRecording(false);
  };

  const openConversation = useCallback(async (conv: Conversation) => {
    setSelected(conv);
    setNewChatOpen(false);
    setConvSearch('');
    setReplyTo(null); setEditingId(null); setInput('');
    setThreadSearchOpen(false); setThreadQuery(''); setRecording(false);
    setPollOpen(false); setPollQuestion(''); setPollOptions(['', '']);
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
        id: member.id, username: member.username, full_name: member.full_name, avatar_url: member.avatar_url,
      },
    });
  };

  const startReply = (msg: DirectMessage) => { setEditingId(null); setReplyTo(msg); setReactionPickerFor(null); setTimeout(() => inputRef.current?.focus(), 50); };
  const startEdit = (msg: DirectMessage) => { setReplyTo(null); setEditingId(msg.id); setInput(msg.content); setReactionPickerFor(null); setTimeout(() => inputRef.current?.focus(), 50); };
  const cancelComposerExtra = () => { setReplyTo(null); if (editingId) { setEditingId(null); setInput(''); } };

  const handleSend = async () => {
    if (!input.trim() || !selected || !profile || sending) return;
    const text = input.trim();
    setSending(true);
    if (editingId) { await editMessage(editingId, text); setEditingId(null); }
    else { await sendMessage(selected.id, profile.id, text, replyTo?.id ?? null); setReplyTo(null); }
    setInput('');
    setSending(false);
    inputRef.current?.focus();
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selected || !profile) return;
    const isImg = file.type.startsWith('image/');
    setUploading(true);
    const url = await uploadDmMedia(file, file.name);
    if (url) await sendAttachment(selected.id, profile.id, { url, type: isImg ? 'image' : 'file', name: file.name });
    setUploading(false);
  };

  const onVoiceSend = async (blob: Blob, dur: number) => {
    setRecording(false);
    if (!selected || !profile) return;
    setUploading(true);
    const url = await uploadDmMedia(blob, `voice-${Date.now()}.webm`);
    if (url) await sendAttachment(selected.id, profile.id, { url, type: 'audio', duration: dur });
    setUploading(false);
  };

  const react = (messageId: string, emoji: string) => {
    if (!profile) return;
    toggleReaction(messageId, emoji, profile.id);
    setReactionPickerFor(null);
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

  const archivedCount = conversations.filter(c => c.archived).length;
  const filteredConvs = conversations.filter(c => {
    if ((c.archived ?? false) !== showArchived) return false;
    if (!convSearch.trim() || newChatOpen) return true;
    const q = convSearch.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.other_profile?.username?.toLowerCase().includes(q) ||
      c.other_profile?.full_name?.toLowerCase().includes(q) ||
      c.last_message?.toLowerCase().includes(q)
    );
  });

  const otherOnline = selected?.other_profile && onlineUsers.has(selected.other_profile.id);
  const isTyping = selected?.other_profile && typingUsers.has(selected.other_profile.id);
  const pinned = useMemo(() => messages.filter(m => m.is_pinned), [messages]);

  // Live conversation (reflects store updates for mute/archive/block)
  const liveConv = (selected && conversations.find(c => c.id === selected.id)) || selected;
  const isBlocked = !!liveConv?.blocked;

  const doForwardToConversation = async (targetConvId: string) => {
    if (!forwardFor || !profile) return;
    await forwardMessage(forwardFor, targetConvId, profile.id);
    setForwardFor(null);
  };
  const doForwardToMember = async (member: MemberResult) => {
    if (!forwardFor || !profile) return;
    const convId = await getOrCreateConversation(profile.id, member.id);
    await forwardMessage(forwardFor, convId, profile.id);
    await fetchConversations(profile.id);
    setForwardFor(null);
  };

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
    id === profile?.id ? 'Vous'
      : selected?.is_group ? groupSenderName(id)
      : (selected?.other_profile?.full_name || selected?.other_profile?.username || 'Membre');

  const groupedReactions = (msg: DirectMessage) => {
    const acc: Record<string, { count: number; mine: boolean }> = {};
    (msg.reactions ?? []).forEach(r => {
      if (!acc[r.emoji]) acc[r.emoji] = { count: 0, mine: false };
      acc[r.emoji].count++;
      if (r.user_id === profile?.id) acc[r.emoji].mine = true;
    });
    return Object.entries(acc);
  };

  const renderAvatar = (
    prof: { username: string; avatar_url: string | null } | undefined,
    size: string, showStatus = false, online = false,
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

  // ── Helpers groupe ──
  const convTitle = (c?: Conversation | null) =>
    c?.is_group ? (c.name || 'Groupe') : (c?.other_profile?.full_name || c?.other_profile?.username || 'Conversation');

  const renderConvAvatar = (c: Conversation, size: string, showStatus = false, online = false) => {
    if (c.is_group) {
      return (
        <div className={`${size} shrink-0 rounded-full bg-gradient-to-tr from-ios-indigo-light to-ios-blue-light dark:from-ios-indigo-dark dark:to-ios-blue-dark flex items-center justify-center text-white`}>
          <Users className="w-1/2 h-1/2" />
        </div>
      );
    }
    return renderAvatar(c.other_profile, size, showStatus, online);
  };

  const groupSenderName = (senderId: string): string => {
    if (senderId === profile?.id) return 'Vous';
    const m = selected?.members?.find(x => x.id === senderId);
    return m?.full_name || m?.username || 'Membre';
  };

  const toggleGroupMember = (m: MemberResult) => {
    setGroupMembers(prev => prev.some(x => x.id === m.id) ? prev.filter(x => x.id !== m.id) : [...prev, m]);
  };

  const handleCreateGroup = async () => {
    if (!profile || !groupName.trim() || groupMembers.length < 1 || creatingGroup) return;
    setCreatingGroup(true);
    const convId = await createGroup(groupName.trim(), groupMembers.map(m => m.id), profile.id);
    setCreatingGroup(false);
    if (convId) {
      setGroupMode(false); setGroupName(''); setGroupMembers([]); setNewChatOpen(false); setConvSearch('');
      const conv = useMessageStore.getState().conversations.find(c => c.id === convId);
      if (conv) openConversation(conv);
    }
  };

  const handleSendPoll = async () => {
    if (!selected || !profile) return;
    const opts = pollOptions.map(o => o.trim()).filter(Boolean);
    if (!pollQuestion.trim() || opts.length < 2 || sendingPoll) return;
    setSendingPoll(true);
    await sendPoll(selected.id, profile.id, pollQuestion.trim(), opts);
    setSendingPoll(false);
    setPollOpen(false); setPollQuestion(''); setPollOptions(['', '']);
  };

  const ActionToolbar: React.FC<{ msg: DirectMessage; isMe: boolean }> = ({ msg, isMe }) => (
    <div className="flex items-center opacity-0 group-hover:opacity-100 transition shrink-0 self-center">
      <button onClick={() => setReactionPickerFor(p => p === msg.id ? null : msg.id)} className="p-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-orange-light dark:hover:text-ios-orange-dark" title="Réagir"><Smile className="w-3.5 h-3.5" /></button>
      <button onClick={() => startReply(msg)} className="p-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-blue-light dark:hover:text-ios-blue-dark" title="Répondre"><Reply className="w-3.5 h-3.5" /></button>
      <button onClick={() => { setForwardFor(msg); setReactionPickerFor(null); }} className="p-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-blue-light dark:hover:text-ios-blue-dark" title="Transférer"><Forward className="w-3.5 h-3.5" /></button>
      <button onClick={() => togglePin(msg.id)} className="p-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-orange-light dark:hover:text-ios-orange-dark" title={msg.is_pinned ? 'Désépingler' : 'Épingler'}>{msg.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}</button>
      {isMe && msg.attachment_type == null && (
        <button onClick={() => startEdit(msg)} className="p-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-blue-light dark:hover:text-ios-blue-dark" title="Modifier"><Pencil className="w-3.5 h-3.5" /></button>
      )}
      {isMe && (
        <button onClick={() => deleteMessage(msg.id)} className="p-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-red-light dark:hover:text-ios-red-dark" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
      )}
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-9rem)] md:h-[calc(100vh-10rem)] gap-0 md:gap-4 -mx-3 md:mx-0">
      {/* ──────────── Conversation list / sidebar ──────────── */}
      <div className={`w-full md:w-80 shrink-0 glass-card md:rounded-ios-xl rounded-none overflow-hidden flex flex-col ${selected ? 'hidden md:flex' : 'flex'}`}>
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

        {!newChatOpen && (archivedCount > 0 || showArchived) && (
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`px-4 py-2 border-b border-black/5 dark:border-white/5 flex items-center gap-2 text-xs font-semibold transition ${showArchived ? 'text-ios-blue-light dark:text-ios-blue-dark bg-ios-blue-light/5 dark:bg-ios-blue-dark/8' : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/5 dark:hover:bg-white/5'}`}
          >
            <Archive className="w-3.5 h-3.5" />
            {showArchived ? 'Retour aux conversations' : `Archivées (${archivedCount})`}
          </button>
        )}

        <div className="flex-1 overflow-y-auto">
          {newChatOpen ? (
            <div>
              {/* Bascule 1:1 / Groupe (créateurs & admins) */}
              {isHost && (
                <div className="flex gap-1 p-2 border-b border-black/5 dark:border-white/5">
                  <button onClick={() => setGroupMode(false)} className={`flex-1 py-1.5 rounded-ios-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${!groupMode ? 'bg-ios-blue-light dark:bg-ios-blue-dark text-white' : 'bg-black/5 dark:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}>
                    <User className="w-3.5 h-3.5" /> Privé
                  </button>
                  <button onClick={() => setGroupMode(true)} className={`flex-1 py-1.5 rounded-ios-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${groupMode ? 'bg-ios-indigo-light dark:bg-ios-indigo-dark text-white' : 'bg-black/5 dark:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}>
                    <Users className="w-3.5 h-3.5" /> Groupe
                  </button>
                </div>
              )}

              {/* Création de groupe */}
              {isHost && groupMode && (
                <div className="p-3 border-b border-black/5 dark:border-white/5 space-y-2">
                  <input
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                    placeholder="Nom du groupe"
                    className="w-full bg-black/5 dark:bg-white/5 rounded-ios-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-ios-indigo-light"
                  />
                  {groupMembers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {groupMembers.map(m => (
                        <span key={m.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-ios-indigo-light/15 text-ios-indigo-light dark:text-ios-indigo-dark text-[11px] font-bold">
                          {m.full_name || m.username}
                          <button onClick={() => toggleGroupMember(m)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={handleCreateGroup}
                    disabled={!groupName.trim() || groupMembers.length < 1 || creatingGroup}
                    className="w-full py-2 rounded-ios-lg bg-ios-indigo-light dark:bg-ios-indigo-dark text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-95 transition"
                  >
                    {creatingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Créer le groupe ({groupMembers.length})</>}
                  </button>
                </div>
              )}

              <div className="divide-y divide-black/5 dark:divide-white/5">
                {searchingMembers && (<div className="py-6 text-center"><Loader2 className="w-5 h-5 mx-auto animate-spin text-ios-blue-light dark:text-ios-blue-dark" /></div>)}
                {!searchingMembers && convSearch.trim().length >= 1 && memberResults.length === 0 && (<p className="py-6 text-center text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Aucun membre trouvé</p>)}
                {!searchingMembers && convSearch.trim().length < 1 && (<p className="py-6 px-4 text-center text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">{groupMode ? 'Recherchez des membres à ajouter au groupe' : 'Tapez un nom ou @username pour démarrer une conversation'}</p>)}
                {memberResults.map(m => {
                  const picked = groupMembers.some(x => x.id === m.id);
                  return (
                    <button key={m.id} onClick={() => groupMode ? toggleGroupMember(m) : startConversationWith(m)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                      {renderAvatar(m, 'w-10 h-10', true, onlineUsers.has(m.id))}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{m.full_name || m.username}</p>
                        <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate">@{m.username}</p>
                      </div>
                      {groupMode
                        ? (picked ? <Check className="w-4 h-4 text-ios-indigo-light dark:text-ios-indigo-dark" /> : <UserPlus className="w-4 h-4 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark opacity-60" />)
                        : <Send className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark opacity-60" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : filteredConvs.length === 0 ? (
            <div className="py-10 text-center px-4">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark opacity-40" />
              <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">{convSearch ? 'Aucun résultat' : 'Aucune conversation'}</p>
              {!convSearch && (<button onClick={() => setNewChatOpen(true)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ios-blue-light dark:text-ios-blue-dark"><PenSquare className="w-4 h-4" /> Démarrer une conversation</button>)}
            </div>
          ) : (
            <div className="divide-y divide-black/5 dark:divide-white/5">
              {filteredConvs.map(conv => {
                const online = conv.other_profile && onlineUsers.has(conv.other_profile.id);
                const unread = (conv.unread_count ?? 0) > 0;
                return (
                  <button key={conv.id} onClick={() => openConversation(conv)} className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${selected?.id === conv.id ? 'bg-ios-blue-light/5 dark:bg-ios-blue-dark/8' : ''}`}>
                    {renderConvAvatar(conv, 'w-11 h-11', !conv.is_group, !!online)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm truncate flex items-center gap-1.5 ${unread && !conv.muted ? 'font-extrabold' : 'font-semibold'}`}>
                          {conv.is_group && <Users className="w-3 h-3 shrink-0 text-ios-indigo-light dark:text-ios-indigo-dark" />}
                          <span className="truncate">{convTitle(conv)}</span>
                          {conv.muted && <BellOff className="w-3 h-3 shrink-0 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark" />}
                          {conv.blocked && <Ban className="w-3 h-3 shrink-0 text-ios-red-light dark:text-ios-red-dark" />}
                        </p>
                        <span className="shrink-0 text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">{conv.last_message_at && new Date(conv.last_message_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className={`text-xs truncate ${unread ? 'text-ios-label-primaryLight dark:text-ios-label-primaryDark font-medium' : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}>{conv.last_message_sender === profile?.id && conv.last_message ? 'Vous : ' : ''}{conv.last_message || 'Nouvelle conversation'}</p>
                        {unread && (<span className="shrink-0 min-w-[18px] h-[18px] px-1 bg-ios-blue-light dark:bg-ios-blue-dark text-white text-[10px] font-bold rounded-full flex items-center justify-center">{conv.unread_count}</span>)}
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
            <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1 max-w-xs">Sélectionnez une conversation ou démarrez-en une nouvelle pour discuter en privé.</p>
            <button onClick={() => setNewChatOpen(true)} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-ios-lg bg-ios-blue-light dark:bg-ios-blue-dark text-white text-sm font-semibold hover:opacity-90 transition"><PenSquare className="w-4 h-4" /> Nouvelle conversation</button>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-3 md:px-4 py-3 border-b border-black/5 dark:border-white/5 flex items-center gap-3">
              <button onClick={() => { setSelected(null); unsubscribeFromConversation(); resetThreadExtras(); }} className="md:hidden p-1 -ml-1"><ArrowLeft className="w-5 h-5" /></button>
              {renderConvAvatar(selected, 'w-9 h-9', !selected.is_group, !!otherOnline)}
              {selected.is_group ? (
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-ios-indigo-light dark:text-ios-indigo-dark shrink-0" /> {convTitle(selected)}</p>
                  <p className="text-[11px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate">
                    {(selected.members?.length ?? 0)} membre{(selected.members?.length ?? 0) > 1 ? 's' : ''}
                    {selected.members && selected.members.length > 0 ? ' · ' + selected.members.map(m => m.full_name || m.username).slice(0, 3).join(', ') : ''}
                  </p>
                </div>
              ) : (
                <button onClick={() => navigate(`/profile/${selected.other_profile?.username}`)} className="flex-1 min-w-0 text-left">
                  <p className="font-bold text-sm truncate">{selected.other_profile?.full_name || selected.other_profile?.username}</p>
                  <p className="text-[11px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                    {isTyping ? <span className="text-ios-blue-light dark:text-ios-blue-dark font-medium">en train d'écrire…</span>
                      : otherOnline ? <span className="text-ios-green-light dark:text-ios-green-dark font-medium">en ligne</span>
                      : `@${selected.other_profile?.username}`}
                  </p>
                </button>
              )}
              <button onClick={() => { setThreadSearchOpen(o => !o); setThreadQuery(''); setMatchIndex(0); }} className={`p-2 rounded-ios-lg transition shrink-0 ${threadSearchOpen ? 'bg-ios-blue-light dark:bg-ios-blue-dark text-white' : 'hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`} title="Rechercher dans la conversation"><Search className="w-4 h-4" /></button>

              {/* Conversation menu */}
              <div className="relative shrink-0">
                <button onClick={() => setConvMenuOpen(o => !o)} className={`p-2 rounded-ios-lg transition ${convMenuOpen ? 'bg-black/5 dark:bg-white/5' : 'hover:bg-black/5 dark:hover:bg-white/5'} text-ios-label-secondaryLight dark:text-ios-label-secondaryDark`} title="Options"><MoreVertical className="w-4 h-4" /></button>
                {convMenuOpen && profile && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setConvMenuOpen(false)} />
                    <div className="absolute right-0 mt-2 w-56 glass-panel border border-black/10 dark:border-white/10 rounded-ios-xl shadow-ios-strong z-50 overflow-hidden animate-fade-in p-1.5">
                      <button onClick={() => { toggleMute(selected.id, profile.id); setConvMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/5">
                        {liveConv?.muted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                        {liveConv?.muted ? 'Réactiver les notifications' : 'Mettre en sourdine'}
                      </button>
                      <button onClick={() => { toggleArchive(selected.id, profile.id); setConvMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/5">
                        {liveConv?.archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                        {liveConv?.archived ? 'Désarchiver' : 'Archiver'}
                      </button>
                      {selected.other_profile && (
                        <button
                          onClick={() => { isBlocked ? unblockUser(profile.id, selected.other_profile!.id) : blockUser(profile.id, selected.other_profile!.id); setConvMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-ios-lg text-sm font-semibold text-ios-red-light dark:text-ios-red-dark hover:bg-ios-red-light/10 dark:hover:bg-ios-red-dark/10"
                        >
                          <Ban className="w-4 h-4" />
                          {isBlocked ? 'Débloquer' : 'Bloquer'}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* In-thread search */}
            {threadSearchOpen && (
              <div className="px-3 md:px-4 py-2 border-b border-black/5 dark:border-white/5 flex items-center gap-2 bg-black/3 dark:bg-white/3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark" />
                  <input autoFocus type="text" value={threadQuery} onChange={e => { setThreadQuery(e.target.value); setMatchIndex(0); }} placeholder="Rechercher dans ce fil..." className="w-full bg-black/5 dark:bg-white/5 rounded-ios-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
                </div>
                <span className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark tabular-nums min-w-[3rem] text-center">{matches.length > 0 ? `${matchIndex + 1}/${matches.length}` : '0/0'}</span>
                <button onClick={() => gotoMatch(-1)} disabled={matches.length === 0} className="p-1.5 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                <button onClick={() => gotoMatch(1)} disabled={matches.length === 0} className="p-1.5 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                <button onClick={() => { setThreadSearchOpen(false); setThreadQuery(''); }} className="p-1.5 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5"><X className="w-4 h-4" /></button>
              </div>
            )}

            {/* Pinned banner */}
            {pinned.length > 0 && !threadSearchOpen && (
              <button onClick={() => flashMessage(pinned[pinned.length - 1].id)} className="px-3 md:px-4 py-2 border-b border-black/5 dark:border-white/5 flex items-center gap-2 bg-ios-orange-light/5 dark:bg-ios-orange-dark/10 text-left hover:bg-ios-orange-light/10 dark:hover:bg-ios-orange-dark/15 transition">
                <Pin className="w-3.5 h-3.5 text-ios-orange-light dark:text-ios-orange-dark shrink-0 fill-current" />
                <span className="text-[11px] font-bold text-ios-orange-light dark:text-ios-orange-dark shrink-0">{pinned.length > 1 ? `${pinned.length} épinglés` : 'Épinglé'}</span>
                <span className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate">{pinned[pinned.length - 1].content || 'Pièce jointe'}</span>
              </button>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-1">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  {renderConvAvatar(selected, 'w-16 h-16')}
                  <p className="font-bold mt-3">{convTitle(selected)}</p>
                  <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1">{selected.is_group ? 'Lancez la discussion du groupe 👋' : 'Dites bonjour 👋'}</p>
                </div>
              )}
              {messages.map((msg, i) => {
                const isMe = msg.sender_id === profile?.id;
                const prev = messages[i - 1];
                const showDay = !prev || dayLabel(prev.created_at) !== dayLabel(msg.created_at);
                const grouped = prev && prev.sender_id === msg.sender_id && !showDay &&
                  (new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 120000);
                const highlighted = highlightId === msg.id;
                const reactions = groupedReactions(msg);
                return (
                  <React.Fragment key={msg.id}>
                    {showDay && (<div className="flex justify-center my-3"><span className="text-[10px] font-semibold px-3 py-1 rounded-full bg-black/5 dark:bg-white/10 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">{dayLabel(msg.created_at)}</span></div>)}
                    <div ref={el => { messageRefs.current[msg.id] = el; }} className={`group relative flex items-end gap-1 ${isMe ? 'justify-end' : 'justify-start'} ${grouped ? 'mt-0.5' : 'mt-2'} rounded-2xl transition-colors ${highlighted ? 'ring-2 ring-ios-orange-light dark:ring-ios-orange-dark ring-offset-2 ring-offset-transparent' : ''}`}>
                      {/* Reaction picker popover */}
                      {reactionPickerFor === msg.id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setReactionPickerFor(null)} />
                          <div className={`absolute -top-9 z-40 flex items-center gap-0.5 px-1.5 py-1 rounded-full glass-panel border border-black/10 dark:border-white/10 shadow-ios-strong ${isMe ? 'right-0' : 'left-0'}`}>
                            {REACTIONS.map(e => (<button key={e} onClick={() => react(msg.id, e)} className="text-lg hover:scale-125 transition-transform px-0.5">{e}</button>))}
                          </div>
                        </>
                      )}

                      {isMe && <ActionToolbar msg={msg} isMe={isMe} />}

                      <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[80%] md:max-w-[70%]`}>
                        {!isMe && selected.is_group && !grouped && (
                          <span className="text-[10px] font-bold text-ios-indigo-light dark:text-ios-indigo-dark mb-0.5 px-1">{groupSenderName(msg.sender_id)}</span>
                        )}
                        <div className={`relative px-3 py-2 text-sm ${
                          isMe ? `bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-2xl ${grouped ? 'rounded-tr-md' : ''} rounded-br-md`
                               : `bg-black/5 dark:bg-white/10 rounded-2xl ${grouped ? 'rounded-tl-md' : ''} rounded-bl-md`
                        } ${msg.pending ? 'opacity-60' : ''}`}>
                          {msg.is_pinned && (<Pin className={`absolute -top-1.5 ${isMe ? '-left-1.5' : '-right-1.5'} w-3 h-3 text-ios-orange-light dark:text-ios-orange-dark fill-current`} />)}

                          {msg.reply_preview && (
                            <button onClick={() => flashMessage(msg.reply_preview!.id)} className={`block w-full text-left mb-1 pl-2 border-l-2 rounded-sm ${isMe ? 'border-white/50' : 'border-ios-blue-light dark:border-ios-blue-dark'}`}>
                              <p className={`text-[10px] font-bold ${isMe ? 'text-white/80' : 'text-ios-blue-light dark:text-ios-blue-dark'}`}>{senderLabel(msg.reply_preview.sender_id)}</p>
                              <p className={`text-[11px] truncate ${isMe ? 'text-white/70' : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}>{msg.reply_preview.content || 'Pièce jointe'}</p>
                            </button>
                          )}

                          {/* Attachment */}
                          {msg.attachment_type === 'image' && msg.attachment_url && (
                            <img src={msg.attachment_url} alt="" onClick={() => setLightbox(msg.attachment_url!)} className="rounded-lg max-h-60 max-w-full cursor-pointer mb-1 object-cover" />
                          )}
                          {msg.attachment_type === 'audio' && msg.attachment_url && (
                            <div className="my-0.5"><AudioPlayer url={msg.attachment_url} duration={msg.attachment_duration} mine={isMe} /></div>
                          )}
                          {msg.attachment_type === 'file' && msg.attachment_url && (
                            <a href={msg.attachment_url} target="_blank" rel="noreferrer" download className={`flex items-center gap-2 my-0.5 px-2 py-1.5 rounded-lg ${isMe ? 'bg-white/15 hover:bg-white/25' : 'bg-black/5 dark:bg-white/10 hover:bg-black/10'}`}>
                              <FileText className="w-5 h-5 shrink-0" />
                              <span className="text-xs font-medium truncate max-w-[160px]">{msg.attachment_name || 'Fichier'}</span>
                              <Download className="w-3.5 h-3.5 shrink-0 opacity-70" />
                            </a>
                          )}

                          {msg.content && !msg.poll && (<p className="leading-relaxed whitespace-pre-wrap break-words">{threadSearchOpen && threadQuery ? renderHighlighted(msg.content, threadQuery) : msg.content}</p>)}

                          {/* Sondage */}
                          {msg.poll && (
                            <div className="min-w-[220px] text-ios-label-primaryLight dark:text-ios-label-primaryDark">
                              <PollWidget compact poll={msg.poll} onVote={(optionId) => profile && castMessagePollVote(msg.poll!.id, optionId, profile.id)} />
                            </div>
                          )}

                          <p className={`text-[10px] mt-0.5 flex items-center gap-1 justify-end ${isMe ? 'text-white/60' : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}>
                            {msg.edited_at && <span className="italic">modifié</span>}
                            {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            {isMe && (msg.pending ? <Loader2 className="w-3 h-3 animate-spin" /> : msg.is_read ? <CheckCheck className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />)}
                          </p>
                        </div>

                        {/* Reaction pills */}
                        {reactions.length > 0 && (
                          <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                            {reactions.map(([emoji, { count, mine }]) => (
                              <button key={emoji} onClick={() => react(msg.id, emoji)} className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border transition ${mine ? 'bg-ios-blue-light/15 dark:bg-ios-blue-dark/25 border-ios-blue-light/40 dark:border-ios-blue-dark/40' : 'bg-black/5 dark:bg-white/10 border-transparent hover:bg-black/10'}`}>
                                <span>{emoji}</span><span className="font-semibold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">{count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {!isMe && <ActionToolbar msg={msg} isMe={isMe} />}
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
                {editingId ? <Pencil className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark shrink-0" /> : <Reply className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-ios-blue-light dark:text-ios-blue-dark">{editingId ? 'Modification du message' : `Réponse à ${replyTo ? senderLabel(replyTo.sender_id) : ''}`}</p>
                  {replyTo && !editingId && (<p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate">{replyTo.content || 'Pièce jointe'}</p>)}
                </div>
                <button onClick={cancelComposerExtra} className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5"><X className="w-4 h-4" /></button>
              </div>
            )}

            {/* Formulaire de sondage */}
            {pollOpen && !isBlocked && (
              <div className="px-3 md:px-4 py-3 border-t border-black/5 dark:border-white/5 bg-black/3 dark:bg-white/3 space-y-2 animate-slide-up">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold flex items-center gap-1.5 text-ios-indigo-light dark:text-ios-indigo-dark"><BarChart3 className="w-4 h-4" /> Nouveau sondage</p>
                  <button onClick={() => { setPollOpen(false); setPollQuestion(''); setPollOptions(['', '']); }} className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5"><X className="w-4 h-4" /></button>
                </div>
                <input
                  value={pollQuestion}
                  onChange={e => setPollQuestion(e.target.value)}
                  placeholder="Votre question..."
                  className="w-full bg-black/5 dark:bg-white/5 rounded-ios-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-ios-indigo-light"
                />
                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      value={opt}
                      onChange={e => { const next = [...pollOptions]; next[idx] = e.target.value; setPollOptions(next); }}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 bg-black/5 dark:bg-white/5 rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-indigo-light"
                    />
                    {pollOptions.length > 2 && (
                      <button onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))} className="p-1.5 text-ios-red-light dark:text-ios-red-dark hover:bg-ios-red-light/10 rounded-full"><X className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  {pollOptions.length < 6 ? (
                    <button onClick={() => setPollOptions([...pollOptions, ''])} className="text-[11px] font-bold text-ios-indigo-light dark:text-ios-indigo-dark hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Ajouter une option</button>
                  ) : <span />}
                  <button
                    onClick={handleSendPoll}
                    disabled={!pollQuestion.trim() || pollOptions.map(o => o.trim()).filter(Boolean).length < 2 || sendingPoll}
                    className="px-4 py-2 rounded-ios-lg bg-ios-indigo-light dark:bg-ios-indigo-dark text-white text-sm font-bold flex items-center gap-2 disabled:opacity-40 hover:opacity-95 transition"
                  >
                    {sendingPoll ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Envoyer le sondage</>}
                  </button>
                </div>
              </div>
            )}

            {/* Composer (or blocked banner) */}
            {isBlocked ? (
              <div className="p-3 border-t border-black/5 dark:border-white/5 flex items-center justify-center gap-3 text-sm">
                <span className="flex items-center gap-2 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                  <Ban className="w-4 h-4 text-ios-red-light dark:text-ios-red-dark" />
                  Vous avez bloqué @{selected.other_profile?.username}
                </span>
                <button
                  onClick={() => profile && selected.other_profile && unblockUser(profile.id, selected.other_profile.id)}
                  className="px-3 py-1.5 rounded-ios-lg bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 text-ios-blue-light dark:text-ios-blue-dark font-semibold text-xs hover:opacity-80"
                >
                  Débloquer
                </button>
              </div>
            ) : (
            <div className="p-2.5 md:p-3 border-t border-black/5 dark:border-white/5 flex items-end gap-2">
              {recording ? (
                <VoiceRecorder onSend={onVoiceSend} onCancel={() => setRecording(false)} />
              ) : (
                <>
                  <input ref={fileInputRef} type="file" hidden accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip" onChange={onPickFile} />
                  {!editingId && (
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-2.5 rounded-full text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40 shrink-0" title="Joindre un fichier">
                      {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
                    </button>
                  )}
                  {!editingId && (
                    <button onClick={() => setPollOpen(o => !o)} className={`p-2.5 rounded-full shrink-0 transition ${pollOpen ? 'bg-ios-indigo-light dark:bg-ios-indigo-dark text-white' : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/5 dark:hover:bg-white/5'}`} title="Créer un sondage">
                      <BarChart3 className="w-5 h-5" />
                    </button>
                  )}
                  <input ref={inputRef} type="text" value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} placeholder={editingId ? 'Modifier le message...' : 'Écrire un message...'} className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light" />
                  {input.trim() || editingId ? (
                    <button onClick={handleSend} disabled={!input.trim() || sending} className="p-2.5 rounded-full bg-ios-blue-light dark:bg-ios-blue-dark text-white disabled:opacity-40 hover:opacity-90 transition shrink-0" title={editingId ? 'Enregistrer' : 'Envoyer'}>
                      {editingId ? <Check className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    </button>
                  ) : (
                    <button onClick={() => setRecording(true)} className="p-2.5 rounded-full bg-ios-blue-light dark:bg-ios-blue-dark text-white hover:opacity-90 transition shrink-0" title="Message vocal">
                      <Mic className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
            </div>
            )}
          </>
        )}
      </div>

      {/* Forward modal */}
      {forwardFor && profile && (
        <ForwardModal
          conversations={conversations}
          myId={profile.id}
          searchMembers={searchMembers}
          onPickConversation={doForwardToConversation}
          onPickMember={doForwardToMember}
          onClose={() => setForwardFor(null)}
        />
      )}

      {/* Image lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain" />
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><X className="w-5 h-5" /></button>
        </div>
      )}
    </div>
  );
};
