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
}

export interface ReplyPreview {
  id: string;
  content: string;
  sender_id: string;
}

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
  editMessage: (messageId: string, content: string) => Promise<void>;
  togglePin: (messageId: string) => Promise<void>;
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

    const enriched: Conversation[] = await Promise.all(
      data.map(async (conv) => {
        const otherId = conv.participant_a === userId ? conv.participant_b : conv.participant_a;

        const [{ data: prof }, { data: lastMsg }, { count: unread }] = await Promise.all([
          supabase.from('profiles')
            .select('id, username, full_name, avatar_url')
            .eq('id', otherId)
            .single(),
          supabase.from('direct_messages')
            .select('content, sender_id')
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

        return {
          ...conv,
          other_profile: prof ?? undefined,
          last_message: lastMsg?.content ?? '',
          last_message_sender: lastMsg?.sender_id ?? null,
          unread_count: unread ?? 0,
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
      const withReplies = list.map(m => {
        if (!m.reply_to_id) return m;
        const t = byId.get(m.reply_to_id);
        return { ...m, reply_preview: t ? { id: t.id, content: t.content, sender_id: t.sender_id } : null };
      });
      set({ messages: withReplies, activeConversationId: conversationId });
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

  deleteMessage: async (messageId: string) => {
    set(state => ({ messages: state.messages.filter(m => m.id !== messageId) }));
    await supabase.from('direct_messages').delete().eq('id', messageId);
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

    const { data: created } = await supabase
      .from('conversations')
      .insert({ participant_a: myId, participant_b: otherId, last_message_at: new Date(Date.now()).toISOString() })
      .select('id')
      .single();

    return created!.id;
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
            const enriched = target
              ? { ...msg, reply_preview: { id: target.id, content: target.content, sender_id: target.sender_id } }
              : msg;
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
          if (get().conversations.some(c => c.id === msg.conversation_id)) {
            if (get().activeConversationId === msg.conversation_id) return;
            set(state => ({
              conversations: state.conversations.map(c =>
                c.id === msg.conversation_id
                  ? { ...c, unread_count: (c.unread_count ?? 0) + 1, last_message: msg.content, last_message_sender: msg.sender_id, last_message_at: msg.created_at }
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
