import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface Conversation {
  id: string;
  participant_a: string;
  participant_b: string;
  last_message_at: string;
  created_at: string;
  other_profile?: {
    id: string;
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  unread_count?: number;
  last_message?: string;
  last_message_sender?: string | null;
  muted?: boolean;
  archived?: boolean;
  blocked?: boolean;
}

export interface ReplyPreview {
  id: string;
  content: string;
  sender_id: string;
}

export interface MessageReaction {
  emoji: string;
  user_id: string;
}

export type AttachmentType = 'image' | 'file' | 'audio';

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  reply_to_id?: string | null;
  reply_preview?: ReplyPreview | null;
  edited_at?: string | null;
  is_pinned?: boolean;
  reactions?: MessageReaction[];
  attachment_url?: string | null;
  attachment_type?: AttachmentType | null;
  attachment_name?: string | null;
  attachment_duration?: number | null;
  pending?: boolean;
}

export interface MemberResult {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  role?: string;
}

interface MessageState {
  conversations: Conversation[];
  messages: DirectMessage[];
  activeConversationId: string | null;
  loading: boolean;
  channel: RealtimeChannel | null;
  presenceChannel: RealtimeChannel | null;
  globalChannel: RealtimeChannel | null;
  onlineUsers: Set<string>;
  typingUsers: Set<string>;

  fetchConversations: (userId: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, senderId: string, content: string, replyToId?: string | null) => Promise<void>;
  sendAttachment: (conversationId: string, senderId: string, att: { url: string; type: AttachmentType; name?: string; duration?: number }, content?: string) => Promise<void>;
  uploadDmMedia: (file: File | Blob, filename: string) => Promise<string | null>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  togglePin: (messageId: string) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string, userId: string) => Promise<void>;
  forwardMessage: (message: DirectMessage, targetConversationId: string, senderId: string) => Promise<void>;
  toggleMute: (conversationId: string, userId: string) => Promise<void>;
  toggleArchive: (conversationId: string, userId: string) => Promise<void>;
  blockUser: (blockerId: string, blockedId: string) => Promise<void>;
  unblockUser: (blockerId: string, blockedId: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  getOrCreateConversation: (myId: string, otherId: string) => Promise<string>;
  markConversationRead: (conversationId: string, userId: string) => Promise<void>;
  searchMembers: (query: string, excludeId: string) => Promise<MemberResult[]>;
  subscribeToConversation: (conversationId: string, myId: string) => void;
  unsubscribeFromConversation: () => void;
  broadcastTyping: (myId: string) => void;
  initPresence: (userId: string) => void;
  teardownPresence: () => void;
  initGlobalUnread: (userId: string) => void;
  teardownGlobalUnread: () => void;
  setActiveConversation: (id: string | null) => void;
  totalUnread: () => number;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  conversations: [],
  messages: [],
  activeConversationId: null,
  loading: false,
  channel: null,
  presenceChannel: null,
  globalChannel: null,
  onlineUsers: new Set(),
  typingUsers: new Set(),

  fetchConversations: async (userId: string) => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`participant_a.eq.${userId},participant_b.eq.${userId}`)
      .order('last_message_at', { ascending: false });

    if (error || !data) { set({ loading: false }); return; }

    // Per-user settings (mute/archive) + my block list, fetched once
    const [{ data: settingsRows }, { data: blockedRows }] = await Promise.all([
      supabase.from('conversation_settings').select('conversation_id, muted, archived').eq('user_id', userId),
      supabase.from('blocked_users').select('blocked_id').eq('blocker_id', userId),
    ]);
    const settingsMap = new Map((settingsRows ?? []).map((s: any) => [s.conversation_id, s]));
    const blockedSet = new Set((blockedRows ?? []).map((b: any) => b.blocked_id));

    const enriched: Conversation[] = await Promise.all(
      data.map(async (conv) => {
        const otherId = conv.participant_a === userId ? conv.participant_b : conv.participant_a;

        const [{ data: prof }, { data: lastMsg }, { count: unread }] = await Promise.all([
          supabase.from('profiles')
            .select('id, username, full_name, avatar_url')
            .eq('id', otherId)
            .maybeSingle(),
          supabase.from('direct_messages')
            .select('content, sender_id, attachment_type')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase.from('direct_messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('is_read', false)
            .neq('sender_id', userId),
        ]);

        const attLabel = lastMsg?.attachment_type === 'image' ? '📷 Photo'
          : lastMsg?.attachment_type === 'audio' ? '🎤 Message vocal'
          : lastMsg?.attachment_type === 'file' ? '📎 Fichier' : '';
        const settings = settingsMap.get(conv.id);
        return {
          ...conv,
          other_profile: prof ?? undefined,
          last_message: lastMsg?.content || attLabel,
          last_message_sender: lastMsg?.sender_id ?? null,
          unread_count: unread ?? 0,
          muted: settings?.muted ?? false,
          archived: settings?.archived ?? false,
          blocked: blockedSet.has(otherId),
        };
      })
    );

    set({ conversations: enriched, loading: false });
  },

  fetchMessages: async (conversationId: string) => {
    const { data } = await supabase
      .from('direct_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (data) {
      const list = data as DirectMessage[];
      const byId = new Map(list.map(m => [m.id, m]));

      // Fetch reactions for these messages
      const ids = list.map(m => m.id);
      const reactionsByMsg = new Map<string, MessageReaction[]>();
      if (ids.length > 0) {
        const { data: reacts } = await supabase
          .from('message_reactions')
          .select('message_id, emoji, user_id')
          .in('message_id', ids);
        (reacts ?? []).forEach((r: any) => {
          const arr = reactionsByMsg.get(r.message_id) ?? [];
          arr.push({ emoji: r.emoji, user_id: r.user_id });
          reactionsByMsg.set(r.message_id, arr);
        });
      }

      const enriched = list.map(m => ({
        ...m,
        reactions: reactionsByMsg.get(m.id) ?? [],
        reply_preview: m.reply_to_id
          ? (() => { const t = byId.get(m.reply_to_id!); return t ? { id: t.id, content: t.content, sender_id: t.sender_id } : null; })()
          : null,
      }));
      set({ messages: enriched, activeConversationId: conversationId });
    }
  },

  sendMessage: async (conversationId: string, senderId: string, content: string, replyToId?: string | null) => {
    // Optimistic insert for instant feedback
    const tempId = `temp-${conversationId}-${content.length}-${content.slice(0, 8)}`;
    const replyTarget = replyToId ? get().messages.find(m => m.id === replyToId) : null;
    const optimistic: DirectMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      is_read: false,
      created_at: new Date(Date.now()).toISOString(),
      reply_to_id: replyToId ?? null,
      reply_preview: replyTarget ? { id: replyTarget.id, content: replyTarget.content, sender_id: replyTarget.sender_id } : null,
      pending: true,
    };
    set(state => ({ messages: [...state.messages, optimistic] }));

    const { data } = await supabase.from('direct_messages').insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      reply_to_id: replyToId ?? null,
    }).select().single();

    if (data) {
      const saved = { ...(data as DirectMessage), reply_preview: optimistic.reply_preview };
      set(state => ({
        messages: state.messages
          .filter(m => m.id !== tempId && m.id !== saved.id)
          .concat(saved),
        conversations: state.conversations.map(c =>
          c.id === conversationId
            ? { ...c, last_message: content, last_message_sender: senderId, last_message_at: saved.created_at }
            : c
        ).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()),
      }));
    } else {
      // rollback on failure
      set(state => ({ messages: state.messages.filter(m => m.id !== tempId) }));
    }
  },

  editMessage: async (messageId: string, content: string) => {
    const editedAt = new Date(Date.now()).toISOString();
    set(state => ({
      messages: state.messages.map(m => m.id === messageId ? { ...m, content, edited_at: editedAt } : m),
    }));
    await supabase.from('direct_messages').update({ content, edited_at: editedAt }).eq('id', messageId);
  },

  togglePin: async (messageId: string) => {
    const current = get().messages.find(m => m.id === messageId);
    if (!current) return;
    const next = !current.is_pinned;
    set(state => ({
      messages: state.messages.map(m => m.id === messageId ? { ...m, is_pinned: next } : m),
    }));
    await supabase.from('direct_messages').update({ is_pinned: next }).eq('id', messageId);
  },

  toggleReaction: async (messageId: string, emoji: string, userId: string) => {
    const msg = get().messages.find(m => m.id === messageId);
    if (!msg) return;
    const has = (msg.reactions ?? []).some(r => r.emoji === emoji && r.user_id === userId);
    // optimistic
    set(state => ({
      messages: state.messages.map(m => {
        if (m.id !== messageId) return m;
        const reactions = m.reactions ?? [];
        return {
          ...m,
          reactions: has
            ? reactions.filter(r => !(r.emoji === emoji && r.user_id === userId))
            : [...reactions, { emoji, user_id: userId }],
        };
      }),
    }));
    if (has) {
      await supabase.from('message_reactions').delete()
        .eq('message_id', messageId).eq('user_id', userId).eq('emoji', emoji);
    } else {
      await supabase.from('message_reactions').insert({ message_id: messageId, user_id: userId, emoji });
    }
  },

  uploadDmMedia: async (file: File | Blob, filename: string) => {
    try {
      const ext = filename.includes('.') ? filename.split('.').pop() : 'bin';
      const path = `uploads/${Math.random().toString(36).slice(2)}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('dm-media').upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from('dm-media').getPublicUrl(path);
      return data.publicUrl;
    } catch (e) {
      console.error('DM media upload failed:', e);
      return null;
    }
  },

  sendAttachment: async (conversationId, senderId, att, content = '') => {
    const tempId = `temp-att-${Date.now()}`;
    const optimistic: DirectMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      is_read: false,
      created_at: new Date(Date.now()).toISOString(),
      attachment_url: att.url,
      attachment_type: att.type,
      attachment_name: att.name ?? null,
      attachment_duration: att.duration ?? null,
      reactions: [],
      pending: true,
    };
    set(state => ({ messages: [...state.messages, optimistic] }));

    const { data } = await supabase.from('direct_messages').insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      attachment_url: att.url,
      attachment_type: att.type,
      attachment_name: att.name ?? null,
      attachment_duration: att.duration ?? null,
    }).select().single();

    const preview = att.type === 'image' ? '📷 Photo' : att.type === 'audio' ? '🎤 Message vocal' : '📎 Fichier';
    if (data) {
      const saved = { ...(data as DirectMessage), reactions: [] };
      set(state => ({
        messages: state.messages.filter(m => m.id !== tempId && m.id !== saved.id).concat(saved),
        conversations: state.conversations.map(c =>
          c.id === conversationId
            ? { ...c, last_message: content || preview, last_message_sender: senderId, last_message_at: saved.created_at }
            : c
        ).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()),
      }));
    } else {
      set(state => ({ messages: state.messages.filter(m => m.id !== tempId) }));
    }
  },

  deleteMessage: async (messageId: string) => {
    set(state => ({ messages: state.messages.filter(m => m.id !== messageId) }));
    await supabase.from('direct_messages').delete().eq('id', messageId);
  },

  forwardMessage: async (message, targetConversationId, senderId) => {
    const { data } = await supabase.from('direct_messages').insert({
      conversation_id: targetConversationId,
      sender_id: senderId,
      content: message.content || '',
      attachment_url: message.attachment_url ?? null,
      attachment_type: message.attachment_type ?? null,
      attachment_name: message.attachment_name ?? null,
      attachment_duration: message.attachment_duration ?? null,
    }).select().single();

    if (data) {
      const saved = data as DirectMessage;
      const preview = saved.content
        || (saved.attachment_type === 'image' ? '📷 Photo' : saved.attachment_type === 'audio' ? '🎤 Message vocal' : '📎 Fichier');
      set(state => ({
        messages: state.activeConversationId === targetConversationId
          ? [...state.messages, { ...saved, reactions: [] }]
          : state.messages,
        conversations: state.conversations.map(c =>
          c.id === targetConversationId
            ? { ...c, last_message: preview, last_message_sender: senderId, last_message_at: saved.created_at }
            : c
        ).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()),
      }));
    }
  },

  toggleMute: async (conversationId, userId) => {
    const conv = get().conversations.find(c => c.id === conversationId);
    const next = !conv?.muted;
    set(state => ({ conversations: state.conversations.map(c => c.id === conversationId ? { ...c, muted: next } : c) }));
    await supabase.from('conversation_settings').upsert(
      { user_id: userId, conversation_id: conversationId, muted: next, archived: conv?.archived ?? false },
      { onConflict: 'user_id,conversation_id' }
    );
  },

  toggleArchive: async (conversationId, userId) => {
    const conv = get().conversations.find(c => c.id === conversationId);
    const next = !conv?.archived;
    set(state => ({ conversations: state.conversations.map(c => c.id === conversationId ? { ...c, archived: next } : c) }));
    await supabase.from('conversation_settings').upsert(
      { user_id: userId, conversation_id: conversationId, archived: next, muted: conv?.muted ?? false },
      { onConflict: 'user_id,conversation_id' }
    );
  },

  blockUser: async (blockerId, blockedId) => {
    set(state => ({ conversations: state.conversations.map(c => c.other_profile?.id === blockedId ? { ...c, blocked: true } : c) }));
    await supabase.from('blocked_users').insert({ blocker_id: blockerId, blocked_id: blockedId });
  },

  unblockUser: async (blockerId, blockedId) => {
    set(state => ({ conversations: state.conversations.map(c => c.other_profile?.id === blockedId ? { ...c, blocked: false } : c) }));
    await supabase.from('blocked_users').delete().eq('blocker_id', blockerId).eq('blocked_id', blockedId);
  },

  getOrCreateConversation: async (myId: string, otherId: string) => {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(participant_a.eq.${myId},participant_b.eq.${otherId}),and(participant_a.eq.${otherId},participant_b.eq.${myId})`
      )
      .maybeSingle();

    if (existing) return existing.id;

    const { data: created, error } = await supabase
      .from('conversations')
      .insert({ participant_a: myId, participant_b: otherId, last_message_at: new Date(Date.now()).toISOString() })
      .select('id')
      .maybeSingle();

    if (error || !created) {
      console.error('getOrCreateConversation: insert failed', error);
      throw new Error(error?.message || 'Impossible de créer la conversation');
    }
    return created.id;
  },

  markConversationRead: async (conversationId: string, userId: string) => {
    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId ? { ...c, unread_count: 0 } : c
      ),
    }));
    await supabase
      .from('direct_messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('is_read', false)
      .neq('sender_id', userId);
  },

  searchMembers: async (query: string, excludeId: string) => {
    const q = query.trim();
    if (q.length < 1) return [];
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, role')
      .neq('id', excludeId)
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(8);
    return (data ?? []) as MemberResult[];
  },

  subscribeToConversation: (conversationId: string, myId: string) => {
    const existing = get().channel;
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(`dm-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const msg = payload.new as DirectMessage;
          set(state => {
            if (state.messages.some(m => m.id === msg.id)) return state;
            // drop matching optimistic temp
            const cleaned = state.messages.filter(
              m => !(m.pending && m.content === msg.content && m.sender_id === msg.sender_id)
            );
            const target = msg.reply_to_id ? cleaned.find(m => m.id === msg.reply_to_id) : null;
            const enriched = {
              ...msg,
              reactions: [],
              reply_preview: target ? { id: target.id, content: target.content, sender_id: target.sender_id } : null,
            };
            return { messages: [...cleaned, enriched] };
          });
          // auto-mark incoming as read since the thread is open
          if (msg.sender_id !== myId) {
            supabase.from('direct_messages').update({ is_read: true }).eq('id', msg.id);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const upd = payload.new as DirectMessage;
          set(state => ({
            messages: state.messages.map(m =>
              m.id === upd.id
                ? { ...m, content: upd.content, edited_at: upd.edited_at, is_pinned: upd.is_pinned, is_read: upd.is_read }
                : m
            ),
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const old = payload.old as { id: string };
          set(state => ({ messages: state.messages.filter(m => m.id !== old.id) }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const r = payload.new as { message_id: string; user_id: string; emoji: string };
          set(state => {
            if (!state.messages.some(m => m.id === r.message_id)) return state;
            return {
              messages: state.messages.map(m => {
                if (m.id !== r.message_id) return m;
                const reactions = m.reactions ?? [];
                if (reactions.some(x => x.emoji === r.emoji && x.user_id === r.user_id)) return m;
                return { ...m, reactions: [...reactions, { emoji: r.emoji, user_id: r.user_id }] };
              }),
            };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const r = payload.old as { message_id: string; user_id: string; emoji: string };
          set(state => ({
            messages: state.messages.map(m =>
              m.id === r.message_id
                ? { ...m, reactions: (m.reactions ?? []).filter(x => !(x.emoji === r.emoji && x.user_id === r.user_id)) }
                : m
            ),
          }));
        }
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        const uid = (payload.payload as { userId: string }).userId;
        if (uid === myId) return;
        set(state => {
          const next = new Set(state.typingUsers);
          next.add(uid);
          return { typingUsers: next };
        });
        // typing indicator auto-expires
        setTimeout(() => {
          set(state => {
            const next = new Set(state.typingUsers);
            next.delete(uid);
            return { typingUsers: next };
          });
        }, 3000);
      })
      .subscribe();

    set({ channel, typingUsers: new Set() });
  },

  unsubscribeFromConversation: () => {
    const channel = get().channel;
    if (channel) { supabase.removeChannel(channel); set({ channel: null, typingUsers: new Set() }); }
  },

  broadcastTyping: (myId: string) => {
    const channel = get().channel;
    if (channel) {
      channel.send({ type: 'broadcast', event: 'typing', payload: { userId: myId } });
    }
  },

  initPresence: (userId: string) => {
    const existing = get().presenceChannel;
    if (existing) return;

    const channel = supabase.channel('online-users', {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        set({ onlineUsers: new Set(Object.keys(state)) });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date(Date.now()).toISOString() });
        }
      });

    set({ presenceChannel: channel });
  },

  teardownPresence: () => {
    const channel = get().presenceChannel;
    if (channel) { supabase.removeChannel(channel); set({ presenceChannel: null, onlineUsers: new Set() }); }
  },

  initGlobalUnread: (userId: string) => {
    if (get().globalChannel) return;
    get().fetchConversations(userId);

    const channel = supabase
      .channel(`global-dm-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        (payload) => {
          const msg = payload.new as DirectMessage;
          if (msg.sender_id === userId) return;
          // Only count messages in conversations the user belongs to
          const conv = get().conversations.find(c => c.id === msg.conversation_id);
          if (conv) {
            if (get().activeConversationId === msg.conversation_id) return;
            const muted = conv.muted;
            const preview = msg.content
              || (msg.attachment_type === 'image' ? '📷 Photo' : msg.attachment_type === 'audio' ? '🎤 Message vocal' : msg.attachment_type === 'file' ? '📎 Fichier' : '');
            set(state => ({
              conversations: state.conversations.map(c =>
                c.id === msg.conversation_id
                  ? { ...c, unread_count: muted ? (c.unread_count ?? 0) : (c.unread_count ?? 0) + 1, last_message: preview, last_message_sender: msg.sender_id, last_message_at: msg.created_at }
                  : c
              ).sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()),
            }));
          } else {
            // New conversation started by someone else — refresh list
            get().fetchConversations(userId);
          }
        }
      )
      .subscribe();

    set({ globalChannel: channel });
  },

  teardownGlobalUnread: () => {
    const channel = get().globalChannel;
    if (channel) { supabase.removeChannel(channel); set({ globalChannel: null }); }
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),

  totalUnread: () => get().conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0),
}));
