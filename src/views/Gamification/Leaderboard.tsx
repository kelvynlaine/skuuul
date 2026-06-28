import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, Profile } from '../../store/authStore';
import { UserProfileModal } from '../../components/UserProfileModal';
import { Trophy, Sparkles, Star, Zap, Crown, BadgeCheck, UserCircle2, MessageCircle, RefreshCw } from 'lucide-react';

const RoleBadge: React.FC<{ role: string; small?: boolean }> = ({ role, small }) => {
  const cls = small ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5';
  if (role === 'admin') return (
    <span className={`inline-flex items-center gap-0.5 rounded-full bg-purple-500/15 border border-purple-500/25 text-purple-500 font-bold ${cls}`}>
      <Crown className="w-2.5 h-2.5" /> Admin
    </span>
  );
  if (role === 'creator') return (
    <span className={`inline-flex items-center gap-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-500 font-bold ${cls}`}>
      <BadgeCheck className="w-2.5 h-2.5" /> Créateur
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full bg-neutral-500/10 border border-neutral-500/20 text-neutral-500 font-bold ${cls}`}>
      <UserCircle2 className="w-2.5 h-2.5" /> Membre
    </span>
  );
};

const XpBar: React.FC<{ user: Profile }> = ({ user }) => {
  const currentLevelMin = Math.pow(user.level - 1, 2) * 250;
  const nextLevelXp = Math.pow(user.level, 2) * 250;
  const progress = Math.min(Math.max(((user.xp - currentLevelMin) / (nextLevelXp - currentLevelMin)) * 100, 0), 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
      </div>
      <span className="text-[9px] font-bold text-ios-label-secondaryLight whitespace-nowrap">{Math.round(progress)}%</span>
    </div>
  );
};

export const Leaderboard: React.FC = () => {
  const navigate = useNavigate();
  const { profile, profilesList, fetchProfilesList } = useAuthStore();
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [filter, setFilter] = useState<'all' | 'creator' | 'admin' | 'user'>('all');

  useEffect(() => { fetchProfilesList(); }, [fetchProfilesList]);

  let data = [...profilesList].sort((a, b) => b.level !== a.level ? b.level - a.level : b.xp - a.xp);

  if (filter !== 'all') data = data.filter(u => u.role === filter);

  const podium = data.slice(0, 3);
  const remainder = data.slice(3);

  const podiumConfig = [
    { color: 'from-amber-400 to-orange-500', badge: '🥇', rank: '1er', border: 'border-amber-400', glow: '0 0 20px rgba(251,191,36,0.3)', size: 'w-24 h-24' },
    { color: 'from-slate-300 to-slate-400', badge: '🥈', rank: '2ème', border: 'border-slate-300', glow: '0 0 15px rgba(148,163,184,0.2)', size: 'w-20 h-20' },
    { color: 'from-amber-700 to-amber-800', badge: '🥉', rank: '3ème', border: 'border-amber-700', glow: '0 0 15px rgba(180,83,9,0.2)', size: 'w-18 h-18' },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-4xl mx-auto">

      {/* Profile Modal */}
      {selectedProfile && (
        <UserProfileModal
          user={selectedProfile}
          currentUserId={profile?.id}
          onClose={() => setSelectedProfile(null)}
        />
      )}

      {/* Title */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center gap-2 mb-2">
          <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400 animate-pulse shrink-0" />
          <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight">Classement de la Communauté</h1>
          <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-amber-400 animate-pulse shrink-0" />
        </div>
        <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-medium max-w-md mx-auto">
          Les membres les plus actifs de Skuuul. Publiez, commentez et soutenez pour grimper !
        </p>

        {/* Filter + Refresh */}
        <div className="flex items-center justify-center gap-2 flex-wrap pt-2">
          {(['all', 'creator', 'admin', 'user'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${filter === f ? 'bg-ios-blue-light/10 border-ios-blue-light/20 text-ios-blue-light dark:text-ios-blue-dark' : 'bg-black/5 dark:bg-white/5 border-black/5 text-ios-label-secondaryLight hover:bg-black/8'}`}
            >
              {f === 'all' ? '🌍 Tous' : f === 'creator' ? '🎨 Créateurs' : f === 'admin' ? '🛡️ Admins' : '👤 Membres'}
            </button>
          ))}
          <button onClick={fetchProfilesList} className="p-1.5 text-ios-label-secondaryLight hover:text-ios-label-primaryLight transition rounded-xl hover:bg-black/5">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Podium Top 3 */}
      {podium.length > 0 && (
        <div className="flex flex-col sm:flex-row items-end justify-center gap-4 pt-6 pb-2">

          {/* 2nd Place */}
          {podium[1] && (
            <div className="flex flex-col items-center order-2 sm:order-1 flex-1">
              <button onClick={() => setSelectedProfile(podium[1])} className="flex flex-col items-center group">
                <div className="relative mb-4">
                  <div className={`rounded-2xl border-2 overflow-hidden ${podiumConfig[1].border} group-hover:scale-105 transition-transform`}
                    style={{ boxShadow: podiumConfig[1].glow, width: '80px', height: '80px' }}>
                    {podium[1].avatar_url ? (
                      <img src={podium[1].avatar_url} alt={podium[1].username} className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${podiumConfig[1].color} flex items-center justify-center text-white font-bold text-2xl`}>
                        {podium[1].username[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-lg">{podiumConfig[1].badge}</span>
                </div>
                <span className="font-extrabold text-sm mt-1">{podium[1].full_name || podium[1].username}</span>
                <RoleBadge role={podium[1].role} small />
                <div className="flex items-center gap-1 text-xs text-slate-400 font-semibold mt-1">
                  <Star className="w-3 h-3 fill-current" /> Nv.{podium[1].level}
                </div>
                <span className="text-[10px] text-ios-label-secondaryLight font-semibold">{podium[1].xp} XP</span>
              </button>
            </div>
          )}

          {/* 1st Place */}
          {podium[0] && (
            <div className="flex flex-col items-center order-1 sm:order-2 flex-1 scale-110 z-10">
              <div className="text-3xl mb-1 animate-bounce">👑</div>
              <button onClick={() => setSelectedProfile(podium[0])} className="flex flex-col items-center group">
                <div className="relative mb-4">
                  <div className={`rounded-2xl border-2 overflow-hidden ${podiumConfig[0].border} group-hover:scale-105 transition-transform`}
                    style={{ boxShadow: podiumConfig[0].glow, width: '96px', height: '96px' }}>
                    {podium[0].avatar_url ? (
                      <img src={podium[0].avatar_url} alt={podium[0].username} className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${podiumConfig[0].color} flex items-center justify-center text-white font-bold text-3xl`}>
                        {podium[0].username[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-xl">{podiumConfig[0].badge}</span>
                </div>
                <span className="font-extrabold text-base mt-1 bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                  {podium[0].full_name || podium[0].username}
                </span>
                <RoleBadge role={podium[0].role} small />
                <div className="flex items-center gap-1 text-sm text-amber-400 font-bold mt-1">
                  <Sparkles className="w-4 h-4 fill-current" /> Nv.{podium[0].level}
                </div>
                <span className="text-xs font-bold text-ios-label-secondaryLight">{podium[0].xp} XP</span>
                {podium[0].is_premium && <span className="text-[9px] bg-amber-400/15 text-amber-400 border border-amber-400/25 px-1.5 py-0.5 rounded-full font-bold mt-1">⭐ PRO</span>}
              </button>
            </div>
          )}

          {/* 3rd Place */}
          {podium[2] && (
            <div className="flex flex-col items-center order-3 flex-1">
              <button onClick={() => setSelectedProfile(podium[2])} className="flex flex-col items-center group">
                <div className="relative mb-4">
                  <div className={`rounded-2xl border-2 overflow-hidden ${podiumConfig[2].border} group-hover:scale-105 transition-transform`}
                    style={{ boxShadow: podiumConfig[2].glow, width: '72px', height: '72px' }}>
                    {podium[2].avatar_url ? (
                      <img src={podium[2].avatar_url} alt={podium[2].username} className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${podiumConfig[2].color} flex items-center justify-center text-white font-bold text-xl`}>
                        {podium[2].username[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-lg">{podiumConfig[2].badge}</span>
                </div>
                <span className="font-extrabold text-sm mt-1">{podium[2].full_name || podium[2].username}</span>
                <RoleBadge role={podium[2].role} small />
                <div className="flex items-center gap-1 text-xs text-amber-700 font-semibold mt-1">
                  <Star className="w-3 h-3 fill-current" /> Nv.{podium[2].level}
                </div>
                <span className="text-[10px] text-ios-label-secondaryLight font-semibold">{podium[2].xp} XP</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Remainder list */}
      {remainder.length > 0 && (
        <div className="glass-panel border border-black/5 dark:border-white/5 rounded-2xl overflow-hidden shadow-ios-soft">
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {remainder.map((user, idx) => {
              const isSelf = user.id === profile?.id;
              const rank = idx + 4;
              return (
                <div
                  key={user.id}
                  className={`flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 transition ${isSelf ? 'bg-ios-blue-light/5 dark:bg-ios-blue-dark/8 border-l-4 border-ios-blue-light dark:border-ios-blue-dark' : 'hover:bg-black/3 dark:hover:bg-white/3'}`}
                >
                  <button onClick={() => setSelectedProfile(user)} className="flex items-center gap-2.5 sm:gap-4 flex-1 min-w-0 text-left">
                    {/* Rank */}
                    <span className="text-sm font-extrabold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark w-7 shrink-0">
                      {rank}.
                    </span>

                    {/* Avatar */}
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.username} className="w-10 h-10 rounded-xl object-cover border border-black/10 dark:border-white/10 shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/15 to-indigo-500/15 flex items-center justify-center text-blue-500 font-bold text-sm shrink-0">
                        {user.username[0].toUpperCase()}
                      </div>
                    )}

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-ios-label-primaryLight dark:text-white truncate">
                          {user.full_name || user.username}
                        </span>
                        {isSelf && (
                          <span className="text-[9px] uppercase font-extrabold tracking-wider text-ios-blue-light dark:text-ios-blue-dark bg-ios-blue-light/10 px-1.5 py-0.5 rounded-full">Vous</span>
                        )}
                        {user.is_premium && <span className="text-amber-400 text-xs">⭐</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-ios-label-secondaryLight">@{user.username}</span>
                        <RoleBadge role={user.role} small />
                      </div>
                      <div className="mt-1.5 max-w-[160px]">
                        <XpBar user={user} />
                      </div>
                    </div>
                  </button>

                  {/* Right side: stats + actions */}
                  <div className="flex items-center gap-2 sm:gap-4 ml-2 sm:ml-4 shrink-0">
                    <div className="text-right hidden sm:block">
                      <div className="flex items-center gap-1 text-xs font-bold text-amber-500 dark:text-amber-400 justify-end">
                        <Zap className="w-3 h-3 fill-current" /> Nv.{user.level}
                      </div>
                      <span className="text-[10px] font-bold text-ios-label-secondaryLight">{user.xp} XP</span>
                    </div>

                    {/* Quick actions */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/messages', { state: { startWith: user } });
                        }}
                        className="p-2 rounded-xl bg-ios-blue-light/10 border border-ios-blue-light/15 text-ios-blue-light dark:text-ios-blue-dark hover:bg-ios-blue-light/20 transition"
                        title={`Envoyer un message à ${user.full_name || user.username}`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {data.length === 0 && (
        <div className="glass-panel p-6 sm:p-12 rounded-2xl border border-black/5 text-center">
          <p className="text-ios-label-secondaryLight text-sm">Aucun membre trouvé.</p>
        </div>
      )}
    </div>
  );
};
