import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { Mail, Lock, User, CheckCircle, ChevronDown, Eye, EyeOff } from 'lucide-react';

export const Auth: React.FC = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'user' | 'creator' | 'admin'>('user');
  const [iban, setIban] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        navigate('/');
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: username || splitEmail(email),
              full_name: fullName,
              role: role,
              ...(role === 'creator' ? { iban: iban.trim() } : {}),
            },
          },
        });
        if (signUpError) throw signUpError;
        setSuccess('Inscription réussie ! Veuillez vérifier vos e-mails pour confirmer votre compte.');
        // Auto-switch to login
        setTimeout(() => {
          setIsLogin(true);
          setSuccess(null);
        }, 3000);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const splitEmail = (val: string) => {
    return val.split('@')[0] + Math.floor(Math.random() * 1000);
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-ios-background-light dark:bg-ios-background-dark px-4 transition-colors duration-300 relative overflow-hidden">
      
      {/* Dynamic Background Blur Blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-ios-blue-light/15 dark:bg-ios-blue-dark/10 rounded-full filter blur-[150px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-ios-indigo-light/15 dark:bg-ios-indigo-dark/10 rounded-full filter blur-[150px] pointer-events-none"></div>

      <div className="w-full max-w-md glass-panel p-6 sm:p-8 rounded-ios-xl border border-black/5 dark:border-white/5 shadow-ios-strong animate-scale-in relative z-10">
        
        {/* Header Icon */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-tr from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark rounded-ios-xl flex items-center justify-center text-white text-3xl shadow-ios-glow animate-float mb-3">
            🏫
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-ios-label-primaryLight to-ios-gray-1 dark:from-white dark:to-ios-gray-3 bg-clip-text text-transparent">
            Skuuul
          </h1>
          <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1 font-medium text-center">
            {isLogin ? 'Ravi de vous revoir ! Connectez-vous.' : 'Rejoignez la communauté et apprenez.'}
          </p>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="mb-4 bg-ios-pink-light/10 dark:bg-ios-pink-dark/15 border border-ios-pink-light/20 dark:border-ios-pink-dark/20 text-ios-pink-light dark:text-ios-pink-dark p-3.5 rounded-ios-md text-xs font-semibold flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-ios-green-light/10 dark:bg-ios-green-dark/15 border border-ios-green-light/20 dark:border-ios-green-dark/20 text-ios-green-light dark:text-ios-green-dark p-3.5 rounded-ios-md text-xs font-semibold flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-ios-green-light dark:text-ios-green-dark" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {!isLogin && (
            <>
              {/* Role Selection dropdown */}
              <div>
                <label className="block text-xs font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider mb-1">
                  Je souhaite m'inscrire comme :
                </label>
                <div className="relative">
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as 'user' | 'creator' | 'admin')}
                    className="w-full glass-input pl-4 pr-10 py-3 text-sm rounded-ios-md font-medium appearance-none cursor-pointer dark:bg-neutral-900 bg-white/60 dark:text-white"
                  >
                    <option value="user" className="text-black dark:text-white dark:bg-neutral-800">👨‍🎓 Membre (Étudiant)</option>
                    <option value="creator" className="text-black dark:text-white dark:bg-neutral-800">🎓 Créateur (Formateur)</option>
                    <option value="admin" className="text-black dark:text-white dark:bg-neutral-800">🛡️ Administrateur Unique</option>
                  </select>
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight/60 dark:text-ios-label-secondaryDark/50 pointer-events-none" />
                </div>
              </div>

              {/* Conditional IBAN field for Creator */}
              {role === 'creator' && (
                <div>
                  <label className="block text-xs font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider mb-1">
                    Votre IBAN (pour recevoir les virements des membres)
                  </label>
                  <input
                    type="text"
                    required
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                    placeholder="FR76 3000 6000 0001 2345 6789 012"
                    className="w-full glass-input px-4 py-3 text-sm rounded-ios-md font-medium"
                  />
                </div>
              )}
              {/* Username field (only on signup) */}
              <div>
                <label className="block text-xs font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider mb-1">
                  Nom d'utilisateur
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight/60 dark:text-ios-label-secondaryDark/50" />
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ex: kelvyn_dev"
                    className="w-full glass-input pl-10 pr-4 py-3 text-sm rounded-ios-md font-medium"
                  />
                </div>
              </div>

              {/* Full Name field (only on signup) */}
              <div>
                <label className="block text-xs font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider mb-1">
                  Nom Complet
                </label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight/60 dark:text-ios-label-secondaryDark/50" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="ex: Kelvyn Dev"
                    className="w-full glass-input pl-10 pr-4 py-3 text-sm rounded-ios-md font-medium"
                  />
                </div>
              </div>
            </>
          )}

          {/* Email field */}
          <div>
            <label className="block text-xs font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider mb-1">
              Adresse E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight/60 dark:text-ios-label-secondaryDark/50" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ex: kelvyn@skuuul.com"
                className="w-full glass-input pl-10 pr-4 py-3 text-sm rounded-ios-md font-medium"
              />
            </div>
          </div>

          {/* Password field */}
          <div>
            <label className="block text-xs font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider mb-1">
              Mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight/60 dark:text-ios-label-secondaryDark/50" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full glass-input pl-10 pr-10 py-3 text-sm rounded-ios-md font-medium dark:text-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ios-label-secondaryLight/60 dark:text-ios-label-secondaryDark/50 hover:text-ios-label-primaryLight dark:hover:text-white transition-colors cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
              </button>
            </div>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark text-white font-bold py-3 rounded-ios-md shadow-ios-soft hover:shadow-ios-glow transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:pointer-events-none mt-2 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : isLogin ? (
              'Se connecter'
            ) : (
              'Créer un compte'
            )}
          </button>
        </form>

        {/* Switch Auth mode link */}
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-sm text-ios-blue-light dark:text-ios-blue-dark font-semibold hover:underline"
          >
            {isLogin
              ? "Pas encore inscrit ? Créer un compte"
              : 'Déjà un compte ? Se connecter'}
          </button>
        </div>


      </div>
    </div>
  );
};
