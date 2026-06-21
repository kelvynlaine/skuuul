import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useCollaborativeStore } from '../../store/collaborativeStore';
import { supabase } from '../../services/supabase';
import { 
  Plus, 
  Trash2, 
  Check, 
  FileText, 
  ArrowRight, 
  Sparkles,
  Link as LinkIcon 
} from 'lucide-react';

const cleanMarkdown = (md: string): string => {
  let text = md;
  // Remove headers (#, ##, etc.)
  text = text.replace(/^#+\s+/gm, '');
  // Remove bold/italic (*, **, _, __)
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  // Remove links [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  // Remove table vertical bars and clean separator rows
  text = text.replace(/\|/g, ' ');
  text = text.replace(/[-]{3,}/g, '');
  // Remove code blocks
  text = text.replace(/```[^`]*```/g, '');
  text = text.replace(/`([^`]+)`/g, '$1');
  return text;
};

const getPreviewText = (htmlContent: string) => {
  if (!htmlContent) return "Document vide.";
  let text = htmlContent;
  
  // Replace block elements with space to avoid word concatenation
  text = text.replace(/<\/div>/gi, ' ')
             .replace(/<\/p>/gi, ' ')
             .replace(/<br\s*\/?>/gi, ' ')
             .replace(/<\/li>/gi, ' ')
             .replace(/<\/td>/gi, ' ')
             .replace(/<\/tr>/gi, ' ');
             
  // Replace all other tags
  text = text.replace(/<[^>]*>/g, '');
  
  // Clean markdown syntax characters
  text = cleanMarkdown(text);
  
  // Replace multiple spaces/newlines with a single space
  text = text.replace(/\s+/g, ' ');
  
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>');
             
  return text.trim() || "Document vide.";
};

export const CollaborativeList: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuthStore();
  const { canvases, loading, fetchCanvases, createCanvas, deleteCanvas } = useCollaborativeStore();
  
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchCanvases();

    const channel = supabase
      .channel('collaborative_list_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'collaborative_canvases' },
        () => {
          fetchCanvases();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'canvas_participants' },
        () => {
          fetchCanvases();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCanvases]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newId = await createCanvas(newTitle.trim());
    if (newId) {
      setNewTitle('');
      setIsCreating(false);
      navigate(`/collaborative/${newId}`);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Voulez-vous vraiment supprimer ce canva ? Tout le contenu sera définitivement effacé.")) {
      await deleteCanvas(id);
    }
  };

  const handleCopyLink = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const joinUrl = `${window.location.origin}/collaborative/join/${id}`;
    navigator.clipboard.writeText(joinUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isCreatorOrAdmin = profile?.role === 'creator' || profile?.role === 'admin';

  return (
    <div className="space-y-8 animate-fade-in relative z-10">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-ios-label-primaryLight to-ios-gray-1 dark:from-white dark:to-ios-gray-3 bg-clip-text text-transparent flex items-center gap-2">
            📝 Co-working & Documents Partagés
          </h1>
          <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1.5 font-medium">
            Collaborez en temps réel, rédigez vos cours, exercices et projets à plusieurs.
          </p>
        </div>

        {isCreatorOrAdmin && (
          <button
            onClick={() => setIsCreating(true)}
            className="bg-ios-blue-light dark:bg-ios-blue-dark text-white px-5 py-3 rounded-ios-xl text-sm font-extrabold flex items-center justify-center gap-2 hover:opacity-95 shadow-ios-glow transition duration-200 active:scale-95"
          >
            <Plus className="w-4 h-4" /> Créer un Canva
          </button>
        )}
      </div>

      {/* Grid of Canvases */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-10 h-10 border-4 border-ios-blue-light dark:border-ios-blue-dark border-t-transparent rounded-full animate-spin"></div>
          <p className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-sm">Chargement des espaces de travail...</p>
        </div>
      ) : canvases.length === 0 ? (
        <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-2xl p-12 text-center shadow-ios-soft">
          <FileText className="w-14 h-14 text-ios-label-secondaryLight/30 dark:text-ios-label-secondaryDark/30 mx-auto mb-4" />
          <h3 className="font-extrabold text-lg">Aucun projet pour le moment</h3>
          <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1.5 max-w-md mx-auto">
            {isCreatorOrAdmin 
              ? "Commencez dès aujourd'hui par créer un nouveau document et invitez des membres à collaborer !"
              : "Vous n'avez pas encore rejoint de projet collaboratif. Demandez un lien d'invitation à un créateur !"
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {canvases.map((canvas) => {
            const isOwner = canvas.creator_id === profile?.id;
            return (
              <div
                key={canvas.id}
                onClick={() => navigate(`/collaborative/${canvas.id}`)}
                className="glass-card p-6 flex flex-col gap-4 group cursor-pointer hover:border-ios-blue-light/30 dark:hover:border-ios-blue-dark/40 hover:shadow-ios-glow duration-300 relative transition-all"
              >
                <div className="flex justify-between items-start">
                  <div className="p-2.5 rounded-xl bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 text-ios-blue-light dark:text-ios-blue-dark group-hover:scale-110 transition duration-300">
                    <FileText className="w-6 h-6" />
                  </div>
                  
                  {/* Delete button (Owner / Admin only) */}
                  {(isOwner || profile?.role === 'admin') && (
                    <button
                      onClick={(e) => handleDelete(e, canvas.id)}
                      className="opacity-0 group-hover:opacity-100 hover:bg-ios-pink-light/10 dark:hover:bg-ios-pink-dark/15 p-1.5 rounded-ios-md text-ios-pink-light dark:text-ios-pink-dark transition-all duration-200"
                      title="Supprimer ce canva"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div>
                  <h3 className="font-extrabold text-base text-ios-label-primaryLight dark:text-white line-clamp-1 group-hover:text-ios-blue-light dark:group-hover:text-ios-blue-dark transition duration-200">
                    {canvas.title}
                  </h3>
                  <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-medium mt-1">
                    Créé par <span className="font-bold">@{canvas.creator?.username}</span>
                  </p>
                </div>

                {/* Character preview */}
                <div className="text-xs text-ios-label-secondaryLight/70 dark:text-ios-label-secondaryDark/60 line-clamp-2 min-h-[2rem] bg-black/5 dark:bg-white/5 p-2 rounded-ios-sm font-medium">
                  {getPreviewText(canvas.content)}
                </div>

                <div className="border-t border-black/5 dark:border-white/5 pt-4 mt-auto flex items-center justify-between">
                  {/* Copy invite link button */}
                  <button
                    onClick={(e) => handleCopyLink(e, canvas.id)}
                    className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ios-blue-light dark:text-ios-blue-dark hover:opacity-85 transition bg-ios-blue-light/5 dark:bg-ios-blue-dark/10 px-2.5 py-1.5 rounded-ios-md"
                    title="Copier le lien d'invitation"
                  >
                    {copiedId === canvas.id ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Copié !</span>
                      </>
                    ) : (
                      <>
                        <LinkIcon className="w-3.5 h-3.5" />
                        <span>Inviter</span>
                      </>
                    )}
                  </button>

                  <span className="text-xs font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-1">
                    Ouvrir <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition duration-300" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Creation Modal dialog */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
          <form onSubmit={handleCreate} className="glass-panel w-full max-w-md rounded-ios-2xl border border-white/10 shadow-ios-strong overflow-hidden animate-scale-in">
            <div className="p-5 border-b border-black/5 dark:border-white/5 flex justify-between items-center">
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-ios-blue-light" /> Nouveau Canva Collaboratif
              </h3>
              <button 
                type="button" 
                onClick={() => setIsCreating(false)} 
                className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
              >
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider block">Titre du document</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="ex: Résumé Algèbre Linéaire, Projet Web..."
                  className="w-full glass-input px-3.5 py-3 text-sm rounded-ios-md font-medium"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="flex-1 py-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-ios-xl text-sm font-bold transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-sm font-extrabold shadow-ios-glow hover:opacity-95 transition"
                >
                  Créer et Éditer
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
