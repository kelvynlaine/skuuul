import React, { useEffect, useState } from 'react';
import { Award } from 'lucide-react';
import { supabase } from '../services/supabase';

interface Badge {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  xp_reward: number;
}

interface UserBadge {
  badge_id: string;
  earned_at: string;
  badges: Badge;
}

interface Props {
  userId: string;
  showLocked?: boolean;
}

export const BadgeShowcase: React.FC<Props> = ({ userId, showLocked = true }) => {
  const [earned, setEarned] = useState<UserBadge[]>([]);
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [{ data: earnedData }, { data: allData }] = await Promise.all([
        supabase
          .from('user_badges')
          .select('badge_id, earned_at, badges(*)')
          .eq('user_id', userId),
        supabase.from('badges').select('*').order('xp_reward', { ascending: true }),
      ]);
      if (earnedData) setEarned(earnedData as unknown as UserBadge[]);
      if (allData) setAllBadges(allData as Badge[]);
      setLoading(false);
    };
    fetchData();
  }, [userId]);

  if (loading) return null;

  const earnedIds = new Set(earned.map(e => e.badge_id));
  const displayBadges = showLocked ? allBadges : allBadges.filter(b => earnedIds.has(b.id));

  if (displayBadges.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-1.5">
        <Award className="w-3.5 h-3.5" />
        Badges ({earned.length}/{allBadges.length})
      </h3>
      <div className="flex flex-wrap gap-2">
        {displayBadges.map(badge => {
          const isEarned = earnedIds.has(badge.id);
          const earnedEntry = earned.find(e => e.badge_id === badge.id);
          return (
            <div
              key={badge.id}
              className="relative"
              onMouseEnter={() => setTooltip(badge.id)}
              onMouseLeave={() => setTooltip(null)}
            >
              <div className={`w-11 h-11 rounded-ios-lg flex items-center justify-center text-xl border transition-all ${
                isEarned
                  ? 'bg-ios-orange-light/10 dark:bg-ios-orange-dark/15 border-ios-orange-light/30 dark:border-ios-orange-dark/30 shadow-sm'
                  : 'bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/5 opacity-35 grayscale'
              }`}>
                {badge.icon}
              </div>
              {tooltip === badge.id && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 w-44 bg-ios-label-primaryLight dark:bg-[#1c1c1e] text-ios-label-primaryDark text-[11px] rounded-ios-lg px-3 py-2 shadow-xl border border-white/10 pointer-events-none">
                  <p className="font-bold">{badge.icon} {badge.name}</p>
                  <p className="text-ios-gray-3 mt-0.5 leading-snug">{badge.description}</p>
                  {isEarned && earnedEntry && (
                    <p className="text-ios-green-dark mt-1 font-semibold">
                      +{badge.xp_reward} XP obtenu
                    </p>
                  )}
                  {!isEarned && (
                    <p className="text-ios-gray-1 mt-1">Non débloqué</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
