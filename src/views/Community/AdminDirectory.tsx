import React, { useState, useEffect } from 'react';
import { useAuthStore, Profile } from '../../store/authStore';
import { useClassroomStore, Course } from '../../store/classroomStore';
import { useMessageStore } from '../../store/messageStore';
import {
  Shield,
  Search,
  Sparkles,
  ChevronRight,
  ArrowRight,
  Star,
  MessageCircle,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getCourseBadge } from '../Classroom/Classroom';

type RoleFilter = 'all' | 'admin' | 'creator' | 'user';

interface AdminMember extends Profile {
  email?: string;
  bio?: string;
  specialty?: string;
}

export const AdminDirectory: React.FC = () => {
  const { profilesList, fetchProfilesList, profile: currentProfile } = useAuthStore();
  const { courses, fetchCourses } = useClassroomStore();
  const { onlineUsers } = useMessageStore();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

  useEffect(() => {
    fetchProfilesList();
    fetchCourses();
  }, [fetchProfilesList, fetchCourses]);

  const startConversation = (member: AdminMember) => {
    if (member.id.startsWith('mock')) return;
    navigate('/messages', { state: { startWith: member } });
  };

  // Filter profiles based on current user's role
  const directoryMembers: AdminMember[] = profilesList
    .filter(p => {
      if (currentProfile?.role === 'admin') return true; // Admin sees everyone
      return p.role === 'admin' || p.role === 'creator'; // Others see admins and creators
    })
    .map(p => {
      // Add mock extra fields for display
      let bio = "Passionné par la transmission de connaissances technologiques. Administrateur principal de la plateforme Skuuul.";
      let specialty = "Full Stack Web & Security";
      let email = `${p.username}@skuuul.com`;

      if (p.username.includes('alice')) {
        bio = "Formatrice et développeuse Web indépendante. Je vous accompagne sur la création de vos MVP.";
        specialty = "Product Strategy & UX/UI Design";
      }

      return {
        ...p,
        bio,
        specialty,
        email
      };
    });

  // If mock mode and we don't have Alice in the profilesList, we can inject a mock co-host admin for UI review
  if (directoryMembers.length <= 1 && (currentProfile?.role !== 'admin')) {
    directoryMembers.push({
      id: 'mock-admin-alice',
      role: 'admin',
      username: 'alice_design',
      full_name: 'Alice (Co-host)',
      avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150',
      xp: 980,
      level: 3,
      is_premium: true,
      is_banned: false,
      created_at: new Date().toISOString(),
      bio: "Formatrice et développeuse Web indépendante. Je vous accompagne sur la création de vos MVP.",
      specialty: "Product Strategy & UX/UI Design",
      email: "alice@skuuul.com"
    });
  }

  const filteredMembers = directoryMembers
    .filter(member => roleFilter === 'all' || member.role === roleFilter)
    .filter(member =>
      member.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.specialty?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.role.toLowerCase().includes(searchTerm.toLowerCase())
    );

  // Role filter chips — admins can filter everyone; others only see staff
  const roleChips: { key: RoleFilter; label: string }[] = currentProfile?.role === 'admin'
    ? [
        { key: 'all', label: 'Tous' },
        { key: 'admin', label: 'Admins' },
        { key: 'creator', label: 'Créateurs' },
        { key: 'user', label: 'Membres' },
      ]
    : [
        { key: 'all', label: 'Tous' },
        { key: 'admin', label: 'Admins' },
        { key: 'creator', label: 'Créateurs' },
      ];

  // Helper to map courses to admins for display
  // Let's divide courses between admins dynamically to showcase their lists
  const getAdminCourses = (username: string): Course[] => {
    if (username.includes('alice')) {
      // Give Alice the SaaS MVP course
      return courses.filter(c => c.title.toLowerCase().includes('saas') || c.title.toLowerCase().includes('mvp'));
    } else {
      // Give Kelvyn the Supabase Security course or all courses
      return courses.filter(c => c.title.toLowerCase().includes('sécurité') || c.title.toLowerCase().includes('supabase') || c.title.toLowerCase().includes('postgres'));
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6">
      
      {/* Header Banner */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-ios-indigo-light/10 dark:bg-ios-indigo-dark/15 border border-ios-indigo-light/20 dark:border-ios-indigo-dark/20 text-ios-indigo-light dark:text-ios-indigo-dark text-xs font-bold mb-3 animate-pulse">
          <Shield className="w-3.5 h-3.5" /> Équipe Pédagogique
        </div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark bg-clip-text text-transparent mb-2">
          Annuaire {currentProfile?.role === 'admin' ? 'des Membres' : 'des Créateurs'}
        </h1>
        <p className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-base sm:text-lg max-w-2xl mx-auto">
          {currentProfile?.role === 'admin' 
            ? "Accédez à l'ensemble des membres, créateurs et administrateurs de la plateforme."
            : "Découvrez les profils des formateurs, accédez à leurs formations dédiées et suivez leurs contenus de cours."}
        </p>
      </div>

      {/* Search Bar */}
      <div className="max-w-md mx-auto mb-4 relative">
        <input
          type="text"
          placeholder="Rechercher un membre, rôle, compétence..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-9 py-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-xl text-sm focus:outline-none focus:ring-2 focus:ring-ios-blue-light backdrop-blur-md transition-all shadow-inner"
        />
        <Search className="w-4 h-4 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark absolute left-3.5 top-3.5" />
        {searchTerm && (
          <button onClick={() => setSearchTerm('')} className="absolute right-3 top-3 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Role filter chips */}
      <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
        {roleChips.map(chip => (
          <button
            key={chip.key}
            onClick={() => setRoleFilter(chip.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              roleFilter === chip.key
                ? 'bg-ios-blue-light dark:bg-ios-blue-dark text-white shadow-ios-glow'
                : 'bg-black/5 dark:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/10 dark:hover:bg-white/10'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Result count */}
      <p className="text-center text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mb-6 font-medium">
        {filteredMembers.length} {filteredMembers.length > 1 ? 'membres trouvés' : 'membre trouvé'}
      </p>

      {/* Empty state */}
      {filteredMembers.length === 0 && (
        <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-2xl p-6 sm:p-12 text-center shadow-ios-soft max-w-md mx-auto">
          <Users className="w-12 h-12 text-ios-label-secondaryLight/30 dark:text-ios-label-secondaryDark/30 mx-auto mb-3" />
          <h3 className="font-extrabold text-lg">Aucun membre trouvé</h3>
          <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1">
            Essayez un autre terme de recherche ou changez de filtre.
          </p>
        </div>
      )}

      {/* Grid of Admin Profiles */}
      <div className="grid md:grid-cols-2 gap-4 md:gap-8">
        {filteredMembers.map((member) => {
          const adminCourses = getAdminCourses(member.username);
          return (
            <div 
              key={member.id} 
              className="glass-panel p-6 rounded-ios-2xl border border-black/5 dark:border-white/5 flex flex-col justify-between shadow-ios-xl hover:shadow-ios-glow hover:border-ios-blue-light/25 dark:hover:border-ios-blue-dark/20 transition-all duration-300 relative overflow-hidden"
            >
              {/* Top background accent */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-ios-blue-light/5 dark:bg-ios-blue-dark/5 rounded-full filter blur-xl pointer-events-none"></div>

              <div>
                {/* Admin Header Bio */}
                <div className="flex gap-4 items-start mb-4">
                  <Link to={`/profile/${member.username}`} className="relative shrink-0 group/avatar">
                    {member.avatar_url ? (
                      <img
                        src={member.avatar_url}
                        alt={member.username}
                        className="w-16 h-16 rounded-full object-cover border-2 border-ios-blue-light dark:border-ios-blue-dark shadow-md group-hover/avatar:opacity-90 transition"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 flex items-center justify-center text-ios-blue-light dark:text-ios-blue-dark font-extrabold text-2xl border-2 border-ios-blue-light group-hover/avatar:opacity-90 transition">
                        {member.username[0].toUpperCase()}
                      </div>
                    )}
                    {onlineUsers.has(member.id) && (
                      <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-ios-green-light dark:bg-ios-green-dark border-2 border-white dark:border-ios-bg-dark" title="En ligne" />
                    )}
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Link to={`/profile/${member.username}`} className="hover:text-ios-blue-light dark:hover:text-ios-blue-dark transition-colors">
                        <h2 className="text-xl font-bold tracking-tight truncate">{member.full_name || member.username}</h2>
                      </Link>
                      <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        member.role === 'admin' 
                          ? 'bg-ios-blue-light/15 text-ios-blue-light dark:text-ios-blue-dark'
                          : member.role === 'creator'
                          ? 'bg-ios-orange-light/15 text-ios-orange-light dark:text-ios-orange-dark'
                          : 'bg-ios-gray-1/15 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'
                      }`}>
                        {member.role === 'admin' ? <><Shield className="w-2.5 h-2.5" /> ADMIN</> : member.role === 'creator' ? 'CREATEUR' : 'MEMBRE'}
                      </span>
                    </div>
                    <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-medium mb-1.5">
                      @{member.username}
                    </p>
                    <div className="flex items-center gap-2 text-xs font-bold text-ios-orange-light dark:text-ios-orange-dark">
                      <Sparkles className="w-3.5 h-3.5 fill-current" />
                      <span>{member.role !== 'user' ? 'Formateur Niveau' : 'Niveau'} {member.level}</span>
                      <span className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-normal">
                        ({member.xp} XP)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bio & Specialty */}
                <div className="space-y-2 border-t border-black/5 dark:border-white/5 pt-3 mb-4">
                  <div className="text-xs">
                    <span className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-bold block uppercase tracking-wider text-[9px] mb-1">
                      Spécialité
                    </span>
                    <span className="font-semibold text-ios-blue-light dark:text-ios-blue-dark flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-current" /> {member.specialty}
                    </span>
                  </div>
                  <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark leading-relaxed">
                    {member.bio}
                  </p>
                </div>

                {/* Courses Header */}
                <div className="border-t border-black/5 dark:border-white/5 pt-3 mb-3">
                  <span className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-bold block uppercase tracking-wider text-[9px] mb-2">
                    Formations créées ({adminCourses.length})
                  </span>
                  {adminCourses.length > 0 ? (
                    <div className="space-y-2">
                      {adminCourses.map((course) => (
                        <div 
                          key={course.id}
                          className="flex items-center justify-between p-2.5 rounded-ios-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <img 
                              src={course.cover_image_url} 
                              alt={course.title} 
                              className="w-12 h-8 object-cover rounded shadow-sm flex-shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h3 className="text-xs font-bold truncate leading-tight">{course.title}</h3>
                                {(() => {
                                  const badge = getCourseBadge(course.price || 0);
                                  return (
                                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-wider ${badge.classes}`}>
                                      {badge.text}
                                    </span>
                                  );
                                })()}
                              </div>
                              <p className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate max-w-[200px] mt-0.5">
                                {course.description}
                              </p>
                            </div>
                          </div>
                          
                          <Link 
                            to="/classroom"
                            className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-ios-blue-light dark:text-ios-blue-dark transition-all flex-shrink-0"
                            title="Voir la formation"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark italic">
                      Aucune formation créée pour le moment.
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              {member.id === currentProfile?.id ? (
                <div className="border-t border-black/5 dark:border-white/5 pt-3 mt-4">
                  <Link
                    to={`/profile/${member.username}`}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10 p-2 rounded-ios-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <UserIcon className="w-3.5 h-3.5" /> Voir mon profil
                  </Link>
                </div>
              ) : (
                <div className="border-t border-black/5 dark:border-white/5 pt-3 mt-4 flex gap-2">
                  <button
                    onClick={() => startConversation(member)}
                    disabled={member.id.startsWith('mock')}
                    className="flex-1 bg-ios-blue-light dark:bg-ios-blue-dark text-white p-2 rounded-ios-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-ios-glow hover:opacity-95 transition-all disabled:opacity-40"
                    title={`Envoyer un message à ${member.full_name || member.username}`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Message
                  </button>

                  <Link
                    to={`/profile/${member.username}`}
                    className="flex-1 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10 p-2 rounded-ios-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <UserIcon className="w-3.5 h-3.5" /> Profil <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>
              )}

            </div>
          );
        })}
      </div>

    </div>
  );
};
