import React from 'react';
import { Profile } from '../store/authStore';
import { 
  X, Phone, Video, MessageSquare, Crown, Star,
  Zap, Calendar, BadgeCheck, UserCircle2 
} from 'lucide-react';

interface UserProfileModalProps {
  user: Profile;
  onClose: () => void;
  onCallWebRTC?: (user: Profile) => void;
  currentUserId?: string;
}

const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  if (role === 'admin') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-500 text-[10px] font-extrabold uppercase tracking-wider">
      <Crown className="w-3 h-3" /> Admin
    </span>
  );
  if (role === 'creator') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-[10px] font-extrabold uppercase tracking-wider">
      <BadgeCheck className="w-3 h-3" /> Créateur
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-500/10 border border-gray-500/20 text-gray-500 text-[10px] font-extrabold uppercase tracking-wider">
      <UserCircle2 className="w-3 h-3" /> Membre
    </span>
  );
};

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  onClose,
  onCallWebRTC,
  currentUserId,
}) => {
  const isSelf = user.id === currentUserId;

  // XP progress to next level
  const currentLevelMinXp = Math.pow(user.level - 1, 2) * 250;
  const nextLevelXp = Math.pow(user.level, 2) * 250;
  const xpInLevel = user.xp - currentLevelMinXp;
  const xpNeededForLevel = nextLevelXp - currentLevelMinXp;
  const progress = Math.min(Math.max((xpInLevel / xpNeededForLevel) * 100, 0), 100);

  const joinDate = new Date(user.created_at).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div
        className="relative w-full max-w-sm rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-scale-in"
        style={{
          background: 'linear-gradient(145deg, rgba(30,30,40,0.97) 0%, rgba(20,20,30,0.98) 100%)',
        }}
      >
        {/* Header gradient banner */}
        <div className="h-24 relative overflow-hidden" style={{
          background: user.role === 'admin'
            ? 'linear-gradient(135deg, #7c3aed, #4f46e5)'
            : user.role === 'creator'
            ? 'linear-gradient(135deg, #0ea5e9, #6366f1)'
            : 'linear-gradient(135deg, #374151, #1f2937)',
        }}>
          <div className="absolute inset-0 bg-black/20" />
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 bg-black/30 hover:bg-black/50 rounded-full text-white/80 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Avatar overlapping the banner */}
        <div className="px-6 pb-6">
          <div className="relative -mt-12 mb-4 flex items-end justify-between">
            <div className="relative">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.username}
                  className="w-20 h-20 rounded-2xl object-cover border-4 border-neutral-900 shadow-xl"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-3xl border-4 border-neutral-900 shadow-xl">
                  {user.username[0].toUpperCase()}
                </div>
              )}
              {user.is_premium && (
                <span className="absolute -bottom-1 -right-1 w-6 h-6 bg-amber-400 rounded-full flex items-center justify-center shadow-lg text-xs">
                  ⭐
                </span>
              )}
            </div>

            <RoleBadge role={user.role} />
          </div>

          {/* Name & Username */}
          <div className="mb-4">
            <h2 className="text-white text-xl font-extrabold leading-tight">
              {user.full_name || user.username}
            </h2>
            <p className="text-white/50 text-sm font-medium">@{user.username}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" />
                <span className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Niveau</span>
              </div>
              <span className="text-white font-extrabold text-lg">{user.level}</span>
              <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-white/30 text-[9px] mt-1 font-medium">{user.xp} / {nextLevelXp} XP</p>
            </div>

            <div className="bg-white/5 rounded-xl p-3 border border-white/5">
              <div className="flex items-center gap-1.5 mb-1">
                <Star className="w-3.5 h-3.5 text-blue-400 fill-current" />
                <span className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Score</span>
              </div>
              <span className="text-white font-extrabold text-lg">{user.xp}</span>
              <p className="text-white/30 text-[9px] mt-1 font-medium">points XP totaux</p>
            </div>
          </div>

          {/* Join date */}
          <div className="flex items-center gap-2 text-white/40 text-xs mb-4">
            <Calendar className="w-3.5 h-3.5" />
            <span>Membre depuis {joinDate}</span>
          </div>

          {/* Phone number */}
          {user.phone && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
              <Phone className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 text-sm font-bold">{user.phone}</span>
            </div>
          )}

          {/* Action Buttons */}
          {!isSelf && (
            <div className="flex gap-2">
              {onCallWebRTC && (
                <button
                  onClick={() => { onCallWebRTC(user); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-bold py-3 rounded-xl text-sm hover:opacity-95 transition shadow-lg"
                >
                  <Video className="w-4 h-4" /> Appel Vidéo
                </button>
              )}
              {user.phone && (
                <a
                  href={`tel:${user.phone}`}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-bold py-3 rounded-xl text-sm hover:bg-emerald-500/25 transition"
                >
                  <Phone className="w-4 h-4" /> Appeler
                </a>
              )}
              {!user.phone && !onCallWebRTC && (
                <button
                  className="flex-1 flex items-center justify-center gap-2 bg-white/5 border border-white/10 text-white/50 font-bold py-3 rounded-xl text-sm cursor-not-allowed"
                  disabled
                >
                  <MessageSquare className="w-4 h-4" /> Aucun contact disponible
                </button>
              )}
            </div>
          )}

          {isSelf && (
            <div className="text-center text-white/30 text-xs py-2">
              Il s'agit de votre propre profil
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
