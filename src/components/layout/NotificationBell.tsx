import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, CheckCheck, MessageCircle, Heart, AtSign, ShoppingBag, Wallet, Award } from 'lucide-react';
import { useNotificationStore, Notification } from '../../store/notificationStore';

const typeIcon: Record<string, React.ReactNode> = {
  comment:           <MessageCircle className="w-4 h-4 text-ios-blue-light dark:text-ios-blue-dark" />,
  like:              <Heart className="w-4 h-4 text-ios-pink-light dark:text-ios-pink-dark" />,
  mention:           <AtSign className="w-4 h-4 text-ios-indigo-light dark:text-ios-indigo-dark" />,
  purchase_approved: <ShoppingBag className="w-4 h-4 text-ios-green-light dark:text-ios-green-dark" />,
  purchase_rejected: <ShoppingBag className="w-4 h-4 text-ios-pink-light dark:text-ios-pink-dark" />,
  payout_approved:   <Wallet className="w-4 h-4 text-ios-green-light dark:text-ios-green-dark" />,
  payout_rejected:   <Wallet className="w-4 h-4 text-ios-pink-light dark:text-ios-pink-dark" />,
  badge_earned:      <Award className="w-4 h-4 text-ios-orange-light dark:text-ios-orange-dark" />,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'À l\'instant';
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

export const NotificationBell: React.FC = () => {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { notifications, unreadCount, fetchNotifications, markAsRead, markAllRead } = useNotificationStore();

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleClick = async (notif: Notification) => {
    if (!notif.is_read) await markAsRead(notif.id);
    setOpen(false);
    if (notif.link) navigate(notif.link);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark transition-colors"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-ios-pink-light dark:bg-ios-pink-dark text-white text-[9px] font-extrabold rounded-full flex items-center justify-center px-1 shadow-md">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 glass-panel border border-black/10 dark:border-white/10 rounded-ios-xl shadow-ios-strong z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5">
            <h3 className="font-extrabold text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-[11px] text-ios-blue-light dark:text-ios-blue-dark font-semibold hover:underline"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Tout marquer lu
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-black/5 dark:divide-white/5">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-8 h-8 mx-auto mb-2 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark opacity-40" />
                <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                  Aucune notification
                </p>
              </div>
            ) : (
              notifications.map(notif => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${
                    !notif.is_read ? 'bg-ios-blue-light/5 dark:bg-ios-blue-dark/8' : ''
                  }`}
                >
                  <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center">
                    {typeIcon[notif.type] ?? <Bell className="w-4 h-4 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-xs font-semibold leading-snug ${!notif.is_read ? 'text-ios-label-primaryLight dark:text-ios-label-primaryDark' : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'}`}>
                        {notif.title}
                      </p>
                      {!notif.is_read && (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-ios-blue-light dark:bg-ios-blue-dark mt-0.5" />
                      )}
                    </div>
                    {notif.body && (
                      <p className="text-[11px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-0.5 line-clamp-2">
                        {notif.body}
                      </p>
                    )}
                    <p className="text-[10px] text-ios-gray-1 dark:text-ios-gray-3 mt-1">
                      {timeAgo(notif.created_at)}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-black/5 dark:border-white/5 text-center">
              <button
                onClick={() => {
                  markAllRead();
                  setOpen(false);
                }}
                className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-blue-light dark:hover:text-ios-blue-dark flex items-center gap-1 mx-auto transition-colors"
              >
                <Check className="w-3 h-3" />
                Effacer toutes les notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
