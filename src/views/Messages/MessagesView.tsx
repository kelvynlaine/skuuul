import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Send, ArrowLeft, User } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useMessageStore, Conversation } from '../../store/messageStore';

export const MessagesView: React.FC = () => {
  const { profile } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    conversations,
    messages,
    fetchConversations,
    fetchMessages,
    sendMessage,
    getOrCreateConversation,
    markConversationRead,
    subscribeToConversation,
  } = useMessageStore();

  const [selected, setSelected] = useState<Conversation | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (profile) fetchConversations(profile.id);
  }, [profile?.id]);

  // Auto-open conversation from profile page "Message" button
  useEffect(() => {
    const startWith = (location.state as any)?.startWith;
    if (startWith && profile) {
      getOrCreateConversation(profile.id, startWith.id).then(async (convId) => {
        await fetchConversations(profile.id);
        // Find or construct conversation
        const conv: Conversation = {
          id: convId,
          participant_a: profile.id,
          participant_b: startWith.id,
          last_message_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          other_profile: {
            id: startWith.id,
            username: startWith.username,
            full_name: startWith.full_name,
            avatar_url: startWith.avatar_url,
          },
        };
        handleSelectConversation(conv);
      });
    }
  }, [location.state]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectConversation = async (conv: Conversation) => {
    setSelected(conv);
    await fetchMessages(conv.id);
    subscribeToConversation(conv.id);
    if (profile) markConversationRead(conv.id, profile.id);
  };

  const handleSend = async () => {
    if (!input.trim() || !selected || !profile || sending) return;
    setSending(true);
    await sendMessage(selected.id, profile.id, input.trim());
    setInput('');
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex h-[calc(100vh-10rem)] gap-4">
      {/* Conversation list */}
      <div className={`w-full md:w-72 shrink-0 glass-card rounded-ios-xl overflow-hidden flex flex-col ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="px-4 py-3 border-b border-black/5 dark:border-white/5">
          <h2 className="font-extrabold flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-ios-blue-light dark:text-ios-blue-dark" />
            Messages
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-black/5 dark:divide-white/5">
          {conversations.length === 0 ? (
            <div className="py-10 text-center px-4">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark opacity-40" />
              <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Aucune conversation</p>
              <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1">Visitez le profil d'un membre pour lui envoyer un message.</p>
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${selected?.id === conv.id ? 'bg-ios-blue-light/5 dark:bg-ios-blue-dark/8' : ''}`}
              >
                {conv.other_profile?.avatar_url ? (
                  <img src={conv.other_profile.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark flex items-center justify-center text-white font-bold shrink-0">
                    {conv.other_profile?.username?.[0]?.toUpperCase() ?? <User className="w-4 h-4" />}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold truncate">{conv.other_profile?.full_name || conv.other_profile?.username}</p>
                    {(conv.unread_count ?? 0) > 0 && (
                      <span className="shrink-0 w-5 h-5 bg-ios-blue-light dark:bg-ios-blue-dark text-white text-[10px] font-bold rounded-full flex items-center justify-center ml-1">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                  {conv.last_message && (
                    <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate mt-0.5">{conv.last_message}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message thread */}
      <div className={`flex-1 glass-card rounded-ios-xl overflow-hidden flex flex-col ${!selected ? 'hidden md:flex' : 'flex'}`}>
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
            <MessageCircle className="w-12 h-12 mb-3 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark opacity-30" />
            <p className="font-bold">Sélectionnez une conversation</p>
            <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1">
              ou visitez le profil d'un membre pour démarrer
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-black/5 dark:border-white/5 flex items-center gap-3">
              <button onClick={() => setSelected(null)} className="md:hidden p-1 -ml-1">
                <ArrowLeft className="w-5 h-5" />
              </button>
              {selected.other_profile?.avatar_url ? (
                <img src={selected.other_profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-ios-blue-light to-ios-indigo-light flex items-center justify-center text-white font-bold text-sm">
                  {selected.other_profile?.username?.[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-bold text-sm">{selected.other_profile?.full_name || selected.other_profile?.username}</p>
                <button
                  onClick={() => navigate(`/profile/${selected.other_profile?.username}`)}
                  className="text-[11px] text-ios-blue-light dark:text-ios-blue-dark hover:underline"
                >
                  @{selected.other_profile?.username}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map(msg => {
                const isMe = msg.sender_id === profile?.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${
                      isMe
                        ? 'bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-br-sm'
                        : 'bg-black/5 dark:bg-white/10 rounded-bl-sm'
                    }`}>
                      <p className="leading-relaxed">{msg.content}</p>
                      <p className={`text-[10px] mt-0.5 ${isMe ? 'text-white/60' : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}>
                        {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-black/5 dark:border-white/5 flex items-center gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Écrire un message..."
                className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="p-2.5 rounded-ios-xl bg-ios-blue-light dark:bg-ios-blue-dark text-white disabled:opacity-40 hover:opacity-90 transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
