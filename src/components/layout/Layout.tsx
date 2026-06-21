import React, { useState, useEffect, useRef } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, Profile } from '../../store/authStore';
import { supabase } from '../../services/supabase';
import { 
  Users, 
  GraduationCap, 
  Trophy, 
  Shield, 
  LogOut, 
  Menu, 
  X, 
  Sparkles, 
  Sun, 
  Moon,
  User as UserIcon,
  Video,
  UserCheck,
  Phone,
  Edit3,
  Check,
  Radio
} from 'lucide-react';

export const Layout: React.FC = () => {
  const { profile, logout, updateProfile } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editPhone, setEditPhone] = useState(profile?.phone || '');
  const [editFullName, setEditFullName] = useState(profile?.full_name || '');
  const [editIban, setEditIban] = useState(profile?.iban || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Global Call States
  const [incomingCall, setIncomingCall] = useState<Profile | null>(null);
  const activeCallRef = useRef<any>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── GLOBAL INCOMING CALL SYSTEM ──────────────────────────────────────────
  const playRingSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o1 = ctx.createOscillator(); const o2 = ctx.createOscillator(); const g = ctx.createGain();
      o1.type = 'sine'; o1.frequency.value = 440; o2.type = 'sine'; o2.frequency.value = 480;
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.2, ctx.currentTime + 1.2);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      o1.connect(g); o2.connect(g); g.connect(ctx.destination);
      o1.start(); o2.start();
      setTimeout(() => { o1.stop(); o2.stop(); ctx.close(); }, 1600);
    } catch (_) { /* blocked */ }
  };

  useEffect(() => {
    if (incomingCall) {
      ringIntervalRef.current = setInterval(playRingSound, 3000);
    } else {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
    }
    return () => { if (ringIntervalRef.current) clearInterval(ringIntervalRef.current); };
  }, [incomingCall]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`global-calls-recv-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'calls', filter: `receiver_id=eq.${profile.id}` },
        async (payload) => {
          const call = payload.new;
          if (call.status === 'dialing') {
            const { data: cp } = await supabase.from('profiles').select('*').eq('id', call.caller_id).single();
            if (cp) { 
              setIncomingCall(cp as Profile); 
              activeCallRef.current = call; 
              playRingSound(); 
            }
          }
        })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls' },
        async (payload) => {
          const call = payload.new;
          if (call.receiver_id === profile.id && activeCallRef.current?.id === call.id) {
            if (call.status === 'rejected' || call.status === 'ended') {
              setIncomingCall(null);
              activeCallRef.current = null;
            }
          }
        })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  const handleDeclineCall = async () => {
    if (activeCallRef.current) {
      await supabase.from('calls').update({ status: 'rejected' }).eq('id', activeCallRef.current.id);
    }
    setIncomingCall(null);
    activeCallRef.current = null;
  };

  const handleAcceptCall = () => {
    if (!activeCallRef.current || !incomingCall) return;
    const callRow = activeCallRef.current;
    const caller = incomingCall;
    setIncomingCall(null);
    activeCallRef.current = null;
    navigate('/live', { state: { acceptCall: true, activeCall: callRow, callerProfile: caller } });
  };

  const toggleDarkMode = () => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
    setDarkMode(!darkMode);
  };

  const navItems = [
    { path: '/', label: 'Communauté', icon: Users },
    { path: '/classroom', label: 'Classroom', icon: GraduationCap },
    { path: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    { path: '/live', label: 'Salon Live', icon: Video },
    { path: '/collaborative', label: 'Co-working', icon: Edit3 },
    { path: '/admins', label: 'Annuaire', icon: UserCheck },
  ];

  if (profile?.role === 'admin' || profile?.role === 'creator') {
    navItems.push({ 
      path: '/admin', 
      label: profile.role === 'admin' ? 'Dashboard Admin' : 'Dashboard Créateur', 
      icon: Shield 
    });
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    await updateProfile({ 
      full_name: editFullName.trim() || null, 
      phone: editPhone.trim() || null,
      iban: editIban.trim() || null
    });
    setSavingProfile(false);
    setShowEditProfile(false);
  };

  const openEditProfile = () => {
    setEditPhone(profile?.phone || '');
    setEditFullName(profile?.full_name || '');
    setEditIban(profile?.iban || '');
    setShowEditProfile(true);
    setProfileDropdownOpen(false);
  };

  // Calculate progress to next level
  // Let's assume level L requires L^2 * 250 XP in total
  // Current level threshold: (level-1)^2 * 250
  // Next level threshold: level^2 * 250
  const currentLevelMinXp = Math.pow(profile ? profile.level - 1 : 0, 2) * 250;
  const nextLevelXp = Math.pow(profile ? profile.level : 1, 2) * 250;
  const xpInCurrentLevel = (profile?.xp || 0) - currentLevelMinXp;
  const xpNeededForNextLevel = nextLevelXp - currentLevelMinXp;
  const progressPercent = Math.min(
    Math.max((xpInCurrentLevel / xpNeededForNextLevel) * 100, 0),
    100
  );

  if (profile?.is_banned) {
    return (
      <div className="min-h-screen bg-ios-background-light dark:bg-ios-background-dark text-ios-label-primaryLight dark:text-ios-label-primaryDark flex items-center justify-center p-4 relative overflow-hidden">
        {/* Decorative Blur Blobs for Premium Glassmorphism Look */}
        <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-ios-red-light/10 dark:bg-ios-red-dark/5 rounded-full filter blur-[120px] pointer-events-none z-0"></div>
        <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-ios-red-light/10 dark:bg-ios-red-dark/5 rounded-full filter blur-[120px] pointer-events-none z-0"></div>

        <div className="relative z-10 w-full max-w-md glass-panel border border-ios-red-light/20 dark:border-ios-red-dark/20 p-8 rounded-ios-xl shadow-ios-glow text-center">
          <div className="w-20 h-20 bg-ios-red-light/10 dark:bg-ios-red-dark/20 text-ios-red-light dark:text-ios-red-dark rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg animate-pulse">
            <X className="w-10 h-10" />
          </div>
          
          <h1 className="text-2xl font-extrabold mb-3 tracking-tight bg-gradient-to-r from-ios-red-light to-ios-orange-light dark:from-ios-red-dark dark:to-ios-orange-dark bg-clip-text text-transparent">
            Compte Suspendu
          </h1>
          
          <p className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-sm mb-6 leading-relaxed">
            Votre compte a été suspendu par un administrateur pour non-respect des règles de la communauté de Skuuul.
          </p>

          <div className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-ios-lg p-4 mb-6 text-xs text-left">
            <p className="font-semibold text-ios-label-primaryLight dark:text-ios-label-primaryDark mb-1">Détails :</p>
            <p className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
              Si vous pensez qu'il s'agit d'une erreur, veuillez contacter l'administrateur de Skuuul à l'adresse support@skuuul.com.
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-ios-lg bg-gradient-to-r from-ios-red-light to-ios-orange-light dark:from-ios-red-dark dark:to-ios-orange-dark text-white font-semibold text-sm hover:opacity-90 active:scale-[0.98] transition-all shadow-md cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ios-background-light dark:bg-ios-background-dark text-ios-label-primaryLight dark:text-ios-label-primaryDark transition-colors duration-300">
      
      {/* Decorative Blur Blobs for Premium Glassmorphism Look */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-ios-blue-light/10 dark:bg-ios-blue-dark/5 rounded-full filter blur-[120px] pointer-events-none z-0"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-ios-indigo-light/10 dark:bg-ios-indigo-dark/5 rounded-full filter blur-[120px] pointer-events-none z-0"></div>

      {/* Top Glassmorphic Navbar */}
      <header className="sticky top-0 z-40 w-full glass-panel border-b border-black/5 dark:border-white/5 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 font-bold text-2xl tracking-tight text-ios-blue-light dark:text-ios-blue-dark">
            <span className="bg-gradient-to-r from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark text-white p-1.5 rounded-ios-md shadow-ios-glow">
              🏫
            </span>
            <span className="font-extrabold bg-gradient-to-r from-ios-label-primaryLight to-ios-gray-1 dark:from-white dark:to-ios-gray-3 bg-clip-text text-transparent">
              Skuuul
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || 
                               (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-ios-md text-sm font-medium transition-all duration-200 ${
                    isActive 
                      ? 'bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 text-ios-blue-light dark:text-ios-blue-dark font-semibold' 
                      : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* User Status / XP Panel & Settings */}
          <div className="hidden md:flex items-center gap-4">
            
            {/* Gamification Indicator */}
            {profile && (
              <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 px-3 py-1.5 rounded-ios-lg border border-black/5 dark:border-white/5">
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-ios-orange-light dark:text-ios-orange-dark">
                    <Sparkles className="w-3.5 h-3.5 fill-current" />
                    <span>Niveau {profile.level}</span>
                  </div>
                  <span className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-medium">
                    {profile.xp} / {nextLevelXp} XP
                  </span>
                </div>
                {/* Level Circular/Bar Progress */}
                <div className="w-12 bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="bg-ios-orange-light dark:bg-ios-orange-dark h-full rounded-full transition-all duration-500" 
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Dark Mode Toggle */}
            <button 
              onClick={toggleDarkMode}
              className="p-2 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark transition-colors"
              title="Changer de thème"
            >
              {darkMode ? <Sun className="w-4 h-4 text-ios-orange-dark" /> : <Moon className="w-4 h-4" />}
            </button>



            {/* User Profile Dropdown / Logout */}
            <div className="relative">
              <button 
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 p-1 rounded-full transition-all duration-200"
              >
                {profile?.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt={profile.username} 
                    className="w-9 h-9 rounded-full object-cover border-2 border-ios-blue-light/50 dark:border-ios-blue-dark/50"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark flex items-center justify-center text-white font-bold shadow-sm">
                    {profile?.username?.[0]?.toUpperCase() || <UserIcon className="w-4 h-4" />}
                  </div>
                )}
              </button>

              {/* Dropdown Menu */}
              {profileDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40"
                    onClick={() => setProfileDropdownOpen(false)}
                  ></div>
                  <div className="absolute right-0 mt-2 w-64 glass-panel border border-black/10 dark:border-white/10 rounded-ios-xl shadow-ios-strong z-50 overflow-hidden animate-fade-in">
                    <div className="p-4 border-b border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5">
                      <div className="flex items-center gap-3 mb-2">
                        {profile?.avatar_url ? (
                          <img 
                            src={profile.avatar_url} 
                            alt={profile.username} 
                            className="w-12 h-12 rounded-full object-cover border border-black/10 dark:border-white/10"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 flex items-center justify-center text-ios-blue-light dark:text-ios-blue-dark font-bold text-lg">
                            {profile?.username?.[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="font-extrabold truncate">{profile?.full_name || profile?.username}</span>
                          <span className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark truncate">@{profile?.username}</span>
                          {profile?.phone && (
                            <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1 mt-0.5">
                              <Phone className="w-2.5 h-2.5" /> {profile.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 text-ios-blue-light dark:text-ios-blue-dark text-[10px] font-bold uppercase tracking-wider">
                          <Shield className="w-3 h-3" /> {profile?.role === 'admin' ? 'Admin' : profile?.role === 'creator' ? 'Créateur' : 'Membre'}
                        </span>
                        {profile?.is_premium && (
                          <span className="inline-flex items-center text-[9px] font-extrabold bg-gradient-to-r from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark text-white px-2 py-0.5 rounded-full shadow-[0_0_8px_rgba(0,122,255,0.4)] animate-pulse">
                            PRO
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-2 space-y-1">
                      <button 
                        onClick={openEditProfile}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-ios-label-primaryLight dark:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-ios-lg transition-colors"
                      >
                        <Edit3 className="w-4 h-4" /> Modifier mon profil
                      </button>
                      <button 
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-ios-pink-light dark:text-ios-pink-dark hover:bg-ios-pink-light/10 dark:hover:bg-ios-pink-dark/10 rounded-ios-lg transition-colors"
                      >
                        <LogOut className="w-4 h-4" /> Se déconnecter
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Edit Profile Modal */}
          {showEditProfile && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
              <div className="glass-panel w-full max-w-sm rounded-ios-2xl border border-white/10 shadow-ios-strong overflow-hidden animate-scale-in">
                <div className="p-5 border-b border-black/5 dark:border-white/5 flex justify-between items-center">
                  <h3 className="font-extrabold text-base flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-ios-blue-light" /> Modifier mon profil
                  </h3>
                  <button onClick={() => setShowEditProfile(false)} className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {/* Avatar display */}
                  <div className="flex items-center gap-3">
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt={profile?.username} className="w-14 h-14 rounded-full object-cover border border-black/10" />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-ios-blue-light/10 flex items-center justify-center text-ios-blue-light font-bold text-xl">
                        {profile?.username?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-bold text-sm">{profile?.username}</p>
                      <p className="text-xs text-ios-label-secondaryLight">Avatar géré par Gravatar / URL externe</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">Nom complet</label>
                    <input
                      type="text"
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                      placeholder="Votre nom complet..."
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">
                      <Phone className="w-3 h-3 inline mr-1" /> Numéro de téléphone
                    </label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="+33 6 12 34 56 78"
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
                    />
                    <p className="text-[10px] text-ios-label-secondaryLight font-medium">
                      Visible par les autres membres pour les appels directs.
                    </p>
                  </div>

                  {(profile?.role === 'creator' || profile?.role === 'admin') && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">
                        Votre IBAN
                      </label>
                      <input
                        type="text"
                        value={editIban}
                        onChange={(e) => setEditIban(e.target.value)}
                        placeholder="FR76 3000 6000 0001 2345 6789 012"
                        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
                      />
                      <p className="text-[10px] text-ios-label-secondaryLight font-medium">
                        Sert à recevoir directement les paiements des membres pour vos cours Classroom.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowEditProfile(false)}
                      className="flex-1 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 rounded-ios-xl text-sm font-bold transition"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      disabled={savingProfile}
                      className="flex-1 py-2.5 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-sm font-bold shadow-ios-glow hover:opacity-95 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {savingProfile ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <><Check className="w-4 h-4" /> Enregistrer</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-3 md:hidden">
            <button 
              onClick={toggleDarkMode}
              className="p-2 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4 text-ios-orange-dark" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-ios-md hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark transition-colors"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

        </div>
      </header>

      {/* Mobile Drawer menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 top-16 z-30 md:hidden glass-panel border-t border-black/5 dark:border-white/5 animate-fade-in flex flex-col p-4 gap-4">
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path || 
                               (item.path !== '/' && location.pathname.startsWith(item.path));
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-ios-lg text-base font-semibold ${
                    isActive 
                      ? 'bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 text-ios-blue-light dark:text-ios-blue-dark' 
                      : 'text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Mobile XP display */}
          {profile && (
            <div className="mt-auto bg-black/5 dark:bg-white/5 p-4 rounded-ios-xl border border-black/5 dark:border-white/5 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-ios-orange-light dark:text-ios-orange-dark flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 fill-current" /> Niveau {profile.level}
                </span>
                <span className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-medium">
                  {profile.xp} / {nextLevelXp} XP
                </span>
              </div>
              <div className="w-full bg-black/10 dark:bg-white/10 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-ios-orange-light dark:bg-ios-orange-dark h-full rounded-full transition-all duration-300" 
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Mobile Profile & Logout */}
          <div className="border-t border-black/10 dark:border-white/10 pt-4 flex flex-col gap-3">
            <div 
              onClick={() => {
                setMobileMenuOpen(false);
                openEditProfile();
              }}
              className="flex items-center justify-between p-2 rounded-ios-lg hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.98] transition-all cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {profile?.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt={profile.username} 
                    className="w-10 h-10 rounded-full object-cover border border-ios-blue-light/30"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 flex items-center justify-center text-ios-blue-light dark:text-ios-blue-dark font-bold">
                    {profile?.username?.[0]?.toUpperCase() || <UserIcon className="w-5 h-5" />}
                  </div>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold flex items-center gap-1.5 truncate">
                    {profile?.full_name || profile?.username}
                    <Edit3 className="w-3.5 h-3.5 text-ios-blue-light dark:text-ios-blue-dark inline-block shrink-0" />
                  </span>
                  <span className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-medium">
                    {profile?.role === 'admin' ? 'Administrateur' : profile?.role === 'creator' ? 'Créateur' : 'Membre'}
                  </span>
                  {profile?.phone && (
                    <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-1 mt-0.5 animate-fade-in">
                      <Phone className="w-2.5 h-2.5" /> {profile.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  openEditProfile();
                }}
                className="flex-1 flex items-center justify-center gap-2 bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 text-ios-blue-light dark:text-ios-blue-dark px-4 py-2.5 rounded-ios-lg font-bold text-sm active:scale-[0.98] transition-all"
              >
                <Edit3 className="w-4 h-4" /> Modifier profil
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="flex-1 flex items-center justify-center gap-2 bg-ios-pink-light/10 dark:bg-ios-pink-dark/15 text-ios-pink-light dark:text-ios-pink-dark px-4 py-2.5 rounded-ios-lg font-bold text-sm active:scale-[0.98] transition-all"
              >
                <LogOut className="w-4 h-4" /> Quitter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content View Outlet */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
        <Outlet />
      </main>

      {/* Global Incoming Call Widget */}
      {incomingCall && (
        <div className="fixed bottom-6 right-6 z-50 w-72 rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-scale-in" style={{ background: 'linear-gradient(145deg, rgba(30,30,40,0.98), rgba(20,20,30,0.99))' }}>
          <div className="p-5 flex flex-col items-center text-center gap-4">
            <div className="relative">
              <div className="absolute inset-[-8px] bg-blue-500/25 rounded-full animate-ping" />
              {incomingCall.avatar_url ? (
                <img src={incomingCall.avatar_url} alt={incomingCall.username} className="w-16 h-16 rounded-2xl object-cover border-2 border-blue-400 relative z-10" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-2xl relative z-10 border-2 border-blue-400">
                  {incomingCall.username[0].toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <p className="text-white font-extrabold text-sm">{incomingCall.full_name || incomingCall.username}</p>
              <p className="text-blue-400 text-xs font-semibold flex items-center justify-center gap-1 mt-0.5 animate-pulse">
                <Radio className="w-3.5 h-3.5 text-blue-500" /> Appel vidéo entrant...
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full">
              <button onClick={handleDeclineCall} className="py-2 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 font-bold text-xs hover:bg-red-500/25 transition">Refuser</button>
              <button onClick={handleAcceptCall} className="py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 font-bold text-xs hover:bg-emerald-500/25 transition animate-pulse">Accepter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
