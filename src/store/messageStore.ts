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
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface MessageState {
  conversations: Conversation[];
  messages: DirectMessage[];
  activeConversationId: string | null;
  loading: boolean;
  channel: RealtimeChannel | null;

  fetchConversations: (userId: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, senderId: string, content: string) => Promise<void>;
  getOrCreateConversation: (myId: string, otherId: string) => Promise<string>;
  markConversationRead: (conversationId: string, userId: string) => Promise<void>;
  subscribeToConversation: (conversationId: string) => void;
  unsubscribeFromConversation: () => void;
  setActiveConversation: (id: string | null) => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  conversations: [],
  messages: [],
  activeConversationId: null,
  loading: false,
  channel: null,

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

        const [{ data: prof }, { data: msgs }] = await Promise.all([
          supabase.from('profiles')
            .select('id, username, full_name, avatar_url')
            .eq('id', otherId)
            .single(),
          supabase.from('direct_messages')
            .select('content, is_read, sender_id')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1),
        ]);

        const unread = msgs?.filter(m => !m.is_read && m.sender_id !== userId).length ?? 0;

        return {
          ...conv,
          other_profile: prof ?? undefined,
          last_message: msgs?.[0]?.content ?? '',
          unread_count: unread,
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

    if (data) set({ messages: data as DirectMessage[], activeConversationId: conversationId });
  },

  sendMessage: async (conversationId: string, senderId: string, content: string) => {
    const { data } = await supabase.from('direct_messages').insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
    }).select().single();

    if (data) {
      set(state => ({ messages: [...state.messages, data as DirectMessage] }));
    }
  },

  getOrCreateConversation: async (myId: string, otherId: string) => {
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(participant_a.eq.${myId},participant_b.eq.${otherId}),and(participant_a.eq.${otherId},participant_b.eq.${myId})`
      )
      .single();

    if (existing) return existing.id;

    const { data: created } = await supabase
      .from('conversations')
      .insert({ participant_a: myId, participant_b: otherId })
      .select('id')
      .single();

    return created!.id;
  },

  markConversationRead: async (conversationId: string, userId: string) => {
    await supabase
      .from('direct_messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId);
  },

  subscribeToConversation: (conversationId: string) => {
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
            return { messages: [...state.messages, msg] };
          });
        }
      )
      .subscribe();

    set({ channel });
  },

  unsubscribeFromConversation: () => {
    const channel = get().channel;
    if (channel) { supabase.removeChannel(channel); set({ channel: null }); }
  },

  setActiveConversation: (id) => set({ activeConversationId: id }),
}));
