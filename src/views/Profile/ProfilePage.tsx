import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';
import { BadgeShowcase } from '../../components/BadgeShowcase';
import {
  User,
  MessageCircle,
  Calendar,
  BookOpen,
  FileText,
  Sparkles,
  Shield,
  Star,
  ArrowLeft,
} from 'lucide-react';

interface PublicProfile {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  xp: number;
  level: number;
  is_premium: boolean;
  phone: string | null;
  created_at: string;
}

interface CoursePreview {
  id: string;
  title: string;
  cover_image_url: string | null;
  price: number;
  is_premium: boolean;
}

interface PostPreview {
  id: string;
  title: string;
  created_at: string;
  likes_count: number;
  comments_count: number;
}

interface Stats {
  posts: number;
  comments: number;
  coursesCompleted: number;
}

export const ProfilePage: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { profile: me } = useAuthStore();

  const [profileData, setProfileData] = useState<PublicProfile | null>(null);
  const [courses, setCourses] = useState<CoursePreview[]>([]);
  const [recentPosts, setRecentPosts] = useState<PostPreview[]>([]);
  const [stats, setStats] = useState<Stats>({ posts: 0, comments: 0, coursesCompleted: 0 });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!username) return;
    loadProfile();
  }, [username]);

  const loadProfile = async () => {
    setLoading(true);

    const { data: p, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, role, xp, level, is_premium, phone, created_at')
      .eq('username', username)
      .single();

    if (error || !p) { setNotFound(true); setLoading(false); return; }
    setProfileData(p as PublicProfile);

    const [postsRes, commentsRes, coursesRes, progressRes] = await Promise.all([
      supabase.from('posts').select('id, title, created_at, likes_count, comments_count')
        .eq('author_id', p.id).order('created_at', { ascending: false }).limit(5),
      supabase.from('comments').select('id', { count: 'exact', head: true }).eq('author_id', p.id),
      supabase.from('courses').select('id, title, cover_image_url, price, is_premium')
        .eq('owner_id', p.id).eq('is_published', true).limit(6),
      supabase.from('lesson_progress').select('id', { count: 'exact', head: true }).eq('user_id', p.id),
    ]);

    setRecentPosts((postsRes.data ?? []) as PostPreview[]);
    setCourses((coursesRes.data ?? []) as CoursePreview[]);
    setStats({
      posts: postsRes.data?.length ?? 0,
      comments: commentsRes.count ?? 0,
      coursesCompleted: Math.floor((progressRes.count ?? 0) / 5),
    });

    setLoading(false);
  };

  const handleMessage = () => {
    navigate('/messages', { state: { startWith: profileData } });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-ios-blue-light dark:border-ios-blue-dark border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound || !profileData) {
    return (
      <div className="text-center py-20">
        <User className="w-12 h-12 mx-auto mb-3 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark opacity-40" />
        <p className="font-bold text-lg">Profil introuvable</p>
        <p className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-sm mt-1">
          L'utilisateur @{username} n'existe pas.
        </p>
        <Link to="/" className="mt-4 inline-flex items-center gap-2 text-ios-blue-light dark:text-ios-blue-dark text-sm font-semibold">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Link>
      </div>
    );
  }

  const isOwnProfile = me?.id === profileData.id;
  const nextLevelXp = Math.pow(profileData.level, 2) * 250;
  const currentLevelMinXp = Math.pow(profileData.level - 1, 2) * 250;
  const progress = Math.min(((profileData.xp - currentLevelMinXp) / (nextLevelXp - currentLevelMinXp)) * 100, 100);

  const roleLabel = profileData.role === 'admin' ? 'Administrateur' : profileData.role === 'creator' ? 'Créateur' : 'Membre';
  const joinDate = new Date(profileData.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-12">
      {/* Back */}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-blue-light dark:hover:text-ios-blue-dark transition-colors">
        <ArrowLeft className="w-4 h-4" /> Retour
      </button>

      {/* Header card */}
      <div className="glass-card p-6 rounded-ios-xl space-y-4">
        <div className="flex items-start gap-4">
          {profileData.avatar_url ? (
            <img src={profileData.avatar_url} alt={profileData.username}
              className="w-20 h-20 rounded-ios-xl object-cover border-2 border-ios-blue-light/30 dark:border-ios-blue-dark/30 shrink-0" />
          ) : (
            <div className="w-20 h-20 rounded-ios-xl bg-gradient-to-tr from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark flex items-center justify-center text-white font-bold text-3xl shrink-0">
              {profileData.username[0].toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold truncate">{profileData.full_name || profileData.username}</h1>
              {profileData.is_premium && (
                <span className="text-[9px] font-extrabold bg-gradient-to-r from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark text-white px-2 py-0.5 rounded-full animate-pulse">PRO</span>
              )}
            </div>
            <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">@{profileData.username}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 text-ios-blue-light dark:text-ios-blue-dark text-[10px] font-bold uppercase tracking-wide">
                <Shield className="w-3 h-3" />{roleLabel}
              </span>
              <span className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Membre depuis {joinDate}
              </span>
            </div>
          </div>
        </div>

        {/* XP bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="font-bold text-ios-orange-light dark:text-ios-orange-dark flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 fill-current" /> Niveau {profileData.level}
            </span>
            <span className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">{profileData.xp} XP</span>
          </div>
          <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div className="bg-ios-orange-light dark:bg-ios-orange-dark h-full rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Actions */}
        {!isOwnProfile && (
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleMessage}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-ios-lg bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 text-ios-blue-light dark:text-ios-blue-dark font-semibold text-sm hover:opacity-80 transition"
            >
              <MessageCircle className="w-4 h-4" /> Message
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Posts', value: stats.posts, icon: FileText },
          { label: 'Commentaires', value: stats.comments, icon: MessageCircle },
          { label: 'Cours complétés', value: stats.coursesCompleted, icon: BookOpen },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="glass-card p-4 rounded-ios-xl text-center">
            <Icon className="w-5 h-5 mx-auto mb-1 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark" />
            <p className="text-xl font-extrabold">{value}</p>
            <p className="text-[11px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Badges */}
      <div className="glass-card p-5 rounded-ios-xl">
        <BadgeShowcase userId={profileData.id} showLocked={isOwnProfile} />
      </div>

      {/* Courses created */}
      {courses.length > 0 && (
        <div className="glass-card p-5 rounded-ios-xl space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Cours créés
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {courses.map(course => (
              <Link key={course.id} to="/classroom" className="block group">
                <div className="rounded-ios-lg overflow-hidden border border-black/10 dark:border-white/5 hover:border-ios-blue-light/50 dark:hover:border-ios-blue-dark/50 transition">
                  {course.cover_image_url ? (
                    <img src={course.cover_image_url} alt={course.title} className="w-full h-24 object-cover" />
                  ) : (
                    <div className="w-full h-24 bg-gradient-to-br from-ios-blue-light/20 to-ios-indigo-light/20 flex items-center justify-center">
                      <BookOpen className="w-8 h-8 text-ios-blue-light/40 dark:text-ios-blue-dark/40" />
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-xs font-bold line-clamp-2 group-hover:text-ios-blue-light dark:group-hover:text-ios-blue-dark transition-colors">{course.title}</p>
                    <p className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-0.5">
                      {course.price === 0 ? 'Gratuit' : `${course.price}€`}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent posts */}
      {recentPosts.length > 0 && (
        <div className="glass-card p-5 rounded-ios-xl space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Publications récentes
          </h3>
          <div className="divide-y divide-black/5 dark:divide-white/5">
            {recentPosts.map(post => (
              <Link key={post.id} to={`/?post=${post.id}`} className="block py-2.5 hover:text-ios-blue-light dark:hover:text-ios-blue-dark transition-colors">
                <p className="text-sm font-semibold line-clamp-1">{post.title}</p>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                  <span className="flex items-center gap-1"><Star className="w-3 h-3" />{post.likes_count}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" />{post.comments_count}</span>
                  <span>{new Date(post.created_at).toLocaleDateString('fr-FR')}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
