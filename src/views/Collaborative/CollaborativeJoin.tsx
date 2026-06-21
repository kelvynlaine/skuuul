import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCollaborativeStore } from '../../store/collaborativeStore';
import { Sparkles } from 'lucide-react';

export const CollaborativeJoin: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { joinCanvas } = useCollaborativeStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const processJoin = async () => {
      if (!id) {
        setError("Code d'invitation manquant.");
        return;
      }
      
      const success = await joinCanvas(id);
      if (success) {
        navigate(`/collaborative/${id}`);
      } else {
        setError("Impossible de rejoindre ce projet collaboratif. Le lien est peut-être expiré ou invalide.");
      }
    };
    
    processJoin();
  }, [id, joinCanvas, navigate]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 relative z-10 animate-fade-in">
      <div className="glass-panel max-w-sm w-full p-8 rounded-ios-2xl border border-black/5 dark:border-white/5 shadow-ios-strong text-center space-y-6">
        
        {error ? (
          <>
            <div className="w-16 h-16 bg-ios-pink-light/10 text-ios-pink-light dark:bg-ios-pink-dark/15 dark:text-ios-pink-dark rounded-full flex items-center justify-center text-2xl mx-auto">
              ⚠️
            </div>
            <h3 className="font-extrabold text-lg">Échec de l'invitation</h3>
            <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark leading-relaxed">
              {error}
            </p>
            <button
              onClick={() => navigate('/collaborative')}
              className="w-full py-3 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 rounded-ios-xl text-sm font-bold transition"
            >
              Retour au tableau de bord
            </button>
          </>
        ) : (
          <>
            <div className="relative w-16 h-16 bg-ios-blue-light/10 text-ios-blue-light dark:bg-ios-blue-dark/15 dark:text-ios-blue-dark rounded-full flex items-center justify-center text-2xl mx-auto animate-pulse">
              <Sparkles className="w-8 h-8 animate-spin" style={{ animationDuration: '3s' }} />
            </div>
            <h3 className="font-extrabold text-lg">Vérification de l'invitation...</h3>
            <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark leading-relaxed">
              Veuillez patienter pendant que nous vous ajoutons au projet collaboratif.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
