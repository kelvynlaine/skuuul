import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useCommunityStore, Post } from '../../store/communityStore';
import { useCalendarStore } from '../../store/calendarStore';
import { fmtRelativeDay, fmtTime } from '../Calendar/calendarUtils';
import {
  MessageSquare,
  ThumbsUp,
  Pin,
  Send,
  Plus,
  Search,
  Sparkles,
  Trophy,
  Trash2,
  Lock,
  ArrowRight,
  Calendar as CalendarIcon,
  Bell,
  BellOff,
  Clock
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface PollWidgetProps {
  poll: {
    id: string;
    question: string;
    options: {
      id: string;
      option_text: string;
      votes_count: number;
    }[];
    user_voted_option_id?: string | null;
  };
  onVote: (optionId: string) => void;
}

const PollWidget: React.FC<PollWidgetProps> = ({ poll, onVote }) => {
  const totalVotes = poll.options.reduce((sum, opt) => sum + opt.votes_count, 0);
  const hasVoted = !!poll.user_voted_option_id;

  return (
    <div className="mt-4 p-4.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 space-y-3">
      <h5 className="font-extrabold text-xs uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-1.5">
        📊 Sondage : {poll.question}
      </h5>

      <div className="space-y-2">
        {poll.options.map((option) => {
          const percent = totalVotes > 0 ? Math.round((option.votes_count / totalVotes) * 100) : 0;
          const isSelected = poll.user_voted_option_id === option.id;

          if (hasVoted) {
            return (
              <div key={option.id} className="relative p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 overflow-hidden flex items-center justify-between">
                <div 
                  className={`absolute left-0 top-0 bottom-0 transition-all duration-1000 ${
                    isSelected 
                      ? 'bg-ios-blue-light/15 dark:bg-ios-blue-dark/25' 
                      : 'bg-black/5 dark:bg-white/5'
                  }`}
                  style={{ width: `${percent}%` }}
                />
                
                <span className={`text-xs font-bold relative z-10 flex items-center gap-1.5 ${isSelected ? 'text-ios-blue-light dark:text-ios-blue-dark' : ''}`}>
                  {isSelected && <span className="text-xs">✓</span>}
                  {option.option_text}
                </span>
                
                <span className="text-xs font-extrabold relative z-10 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                  {percent}% ({option.votes_count} {option.votes_count > 1 ? 'votes' : 'vote'})
                </span>
              </div>
            );
          } else {
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onVote(option.id)}
                className="w-full text-left p-3 rounded-xl bg-white dark:bg-neutral-800 hover:bg-ios-blue-light/5 dark:hover:bg-ios-blue-dark/5 hover:border-ios-blue-light/35 border border-black/10 dark:border-white/5 text-xs font-bold transition-all active:scale-[0.99] flex items-center justify-between"
              >
                <span>{option.option_text}</span>
                <span className="text-[10px] text-ios-blue-light dark:text-ios-blue-dark font-semibold">Voter</span>
              </button>
            );
          }
        })}
      </div>

      {totalVotes > 0 && (
        <p className="text-[10px] text-ios-label-secondaryLight/60 font-bold text-right">
          Total : {totalVotes} {totalVotes > 1 ? 'votes' : 'vote'}
        </p>
      )}
    </div>
  );
};


export const Community: React.FC = () => {
  const { user, profile, addXp, redirectToStripeCheckout, hasActiveSubscription } = useAuthStore();
  const { 
    posts, 
    categories, 
    commentsByPost, 
    loading, 
    fetchCategories, 
    fetchPosts, 
    fetchComments, 
    createPost, 
    toggleLike, 
    addComment,
    deletePost,
    deleteComment,
    castVote
  } = useCommunityStore();

  const { events, fetchEvents, toggleReminder } = useCalendarStore();

  const [selectedCategory, setSelectedCategory] = useState('cat-all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create Post States
  const [isCreating, setIsCreating] = useState(false);
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postCategory, setPostCategory] = useState('');

  // Active Post / Comments Drawer States
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [commentText, setCommentText] = useState('');

  // Create Poll States
  const [addPoll, setAddPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  // XP notification trigger
  const [xpEarnedNotify, setXpEarnedNotify] = useState<number | null>(null);

  useEffect(() => {
    fetchCategories();
    fetchEvents();
  }, [fetchCategories, fetchEvents]);

  // Next upcoming event for the community announcement banner
  const nextEvent = events
    .filter(e => new Date(e.ends_at || e.starts_at) >= new Date())
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))[0];

  useEffect(() => {
    fetchPosts(selectedCategory);
  }, [selectedCategory, fetchPosts]);

  // Load comments if a post is opened
  useEffect(() => {
    if (activePost) {
      fetchComments(activePost.id);
    }
  }, [activePost, fetchComments]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle || !postContent || !postCategory) return;

    let pollData = undefined;
    if (addPoll && pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2) {
      pollData = {
        question: pollQuestion.trim(),
        options: pollOptions.filter(o => o.trim())
      };
    }

    const success = await createPost(postTitle, postContent, postCategory, pollData);
    if (success) {
      setPostTitle('');
      setPostContent('');
      setPostCategory('');
      setAddPoll(false);
      setPollQuestion('');
      setPollOptions(['', '']);
      setIsCreating(false);
      triggerXpNotification(15);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText || !activePost) return;

    const success = await addComment(activePost.id, commentText);
    if (success) {
      setCommentText('');
      triggerXpNotification(5);
      // Update activePost comments count locally
      setActivePost(prev => prev ? { ...prev, comments_count: prev.comments_count + 1 } : null);
    }
  };

  const triggerXpNotification = async (amount: number) => {
    setXpEarnedNotify(amount);
    setTimeout(() => setXpEarnedNotify(null), 3000);

    // Run Auth store XP increment logic which computes level ups
    const result = await addXp(amount);
    if (result.leveledUp) {
      // Confetti burst on level up!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  };

  // Filter posts by search query
  const filteredPosts = posts.filter(post => 
    post.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    post.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8 relative">
      
      {/* Floating XP Gain Badge notification */}
      {xpEarnedNotify && (
        <div className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-ios-orange-light to-ios-orange-dark text-white px-5 py-3 rounded-ios-xl shadow-ios-strong border border-white/20 animate-slide-up flex items-center gap-2">
          <Sparkles className="w-5 h-5 fill-current animate-bounce" />
          <div className="flex flex-col">
            <span className="text-sm font-bold">XP Gagné !</span>
            <span className="text-xs font-semibold">+{xpEarnedNotify} XP ajoutés à votre profil</span>
          </div>
        </div>
      )}

      {/* Main forum feed space */}
      <div className="lg:col-span-8 flex flex-col gap-6">
        
        {/* Search Bar & Create Post Button */}
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative w-full flex-grow">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight/50 dark:text-ios-label-secondaryDark/50" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher des posts..."
              className="w-full glass-input pl-10 pr-4 py-3 text-sm rounded-ios-lg font-medium"
            />
          </div>
          <button
            onClick={() => {
              setIsCreating(!isCreating);
              if (categories.length > 1) {
                setPostCategory(categories[1].id);
              }
            }}
            className="w-full sm:w-auto bg-ios-blue-light dark:bg-ios-blue-dark hover:shadow-ios-glow text-white font-bold px-5 py-3 rounded-ios-lg flex items-center justify-center gap-2 transition-all active:scale-95 whitespace-nowrap shadow-ios-soft"
          >
            <Plus className="w-4 h-4" />
            Créer un Post
          </button>
        </div>

        {/* Create Post Accordion Form */}
        {isCreating && (
          <form onSubmit={handleCreatePost} className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-6 shadow-ios-soft space-y-4 animate-slide-up">
            <h3 className="font-bold text-lg text-ios-blue-light dark:text-ios-blue-dark">Nouvelle discussion</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase mb-1">Titre</label>
                <input
                  type="text"
                  required
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder="De quoi voulez-vous parler ?"
                  className="w-full glass-input px-3.5 py-2.5 text-sm rounded-ios-md font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase mb-1">Catégorie</label>
                <select
                  value={postCategory}
                  onChange={(e) => setPostCategory(e.target.value)}
                  className="w-full glass-input px-3.5 py-2.5 text-sm rounded-ios-md font-semibold text-black dark:text-white"
                >
                  {categories.filter(c => c.slug !== 'all').map(c => (
                    <option key={c.id} value={c.id} className="text-black dark:text-white">{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase mb-1">Contenu</label>
              <textarea
                required
                rows={4}
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder="Rédigez votre message ici..."
                className="w-full glass-input px-3.5 py-2.5 text-sm rounded-ios-md font-medium"
              ></textarea>
            </div>

            {/* Creators and Admins can create polls */}
            {(profile?.role === 'admin' || profile?.role === 'creator') && (
              <div className="border-t border-black/5 dark:border-white/5 pt-4 space-y-3 text-left">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="add-poll-toggle"
                    checked={addPoll}
                    onChange={(e) => setAddPoll(e.target.checked)}
                    className="rounded border-black/15 dark:border-white/5 text-ios-blue-light focus:ring-ios-blue-light w-4 h-4"
                  />
                  <label htmlFor="add-poll-toggle" className="text-xs font-bold select-none cursor-pointer">
                    📊 Ajouter un sondage à ce post
                  </label>
                </div>

                {addPoll && (
                  <div className="pl-6 space-y-3">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-extrabold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Question du sondage</label>
                      <input
                        type="text"
                        required
                        value={pollQuestion}
                        onChange={(e) => setPollQuestion(e.target.value)}
                        placeholder="Ex: Quelle techno préférez-vous ?"
                        className="w-full glass-input px-3 py-2 text-xs rounded-ios-md font-medium"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[10px] font-extrabold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Options de réponse</label>
                      {pollOptions.map((opt, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <input
                            type="text"
                            required
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...pollOptions];
                              newOpts[idx] = e.target.value;
                              setPollOptions(newOpts);
                            }}
                            placeholder={`Option ${idx + 1}...`}
                            className="flex-grow glass-input px-3 py-2 text-xs rounded-ios-md font-medium"
                          />
                          {pollOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newOpts = pollOptions.filter((_, i) => i !== idx);
                                setPollOptions(newOpts);
                              }}
                              className="px-2.5 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-ios-md text-[10px] font-bold transition"
                            >
                              Retirer
                            </button>
                          )}
                        </div>
                      ))}

                      {pollOptions.length < 6 && (
                        <button
                          type="button"
                          onClick={() => setPollOptions([...pollOptions, ''])}
                          className="text-[10px] text-ios-blue-light dark:text-ios-blue-dark font-extrabold hover:underline"
                        >
                          + Ajouter une option de réponse
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2.5 rounded-ios-md text-sm font-bold hover:bg-black/5 dark:hover:bg-white/5 transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="bg-ios-blue-light dark:bg-ios-blue-dark text-white px-5 py-2.5 rounded-ios-md text-sm font-bold hover:opacity-90 active:scale-95 transition"
              >
                Publier (+15 XP)
              </button>
            </div>
          </form>
        )}

        {/* Categories horizontally scrollable selector */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-4.5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-200 ${
                selectedCategory === c.id
                  ? 'bg-ios-blue-light dark:bg-ios-blue-dark text-white shadow-ios-soft'
                  : 'bg-black/5 dark:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/10 dark:hover:bg-white/10'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {/* Feed Posts */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-10 h-10 border-4 border-ios-blue-light dark:border-ios-blue-dark border-t-transparent rounded-full animate-spin"></div>
            <p className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-sm">Mise à jour du flux...</p>
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-6 sm:p-10 text-center shadow-ios-soft">
            <MessageSquare className="w-12 h-12 text-ios-label-secondaryLight/40 dark:text-ios-label-secondaryDark/40 mx-auto mb-3" />
            <h4 className="font-bold text-lg">Aucun post pour le moment</h4>
            <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1">
              Soyez le premier à poser une question ou partager un résultat !
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredPosts.map((post) => (
              <div 
                key={post.id} 
                className="glass-card p-6 flex flex-col gap-4 relative group"
              >
                {/* Pinned badge */}
                {post.is_pinned && (
                  <div className="absolute top-6 right-6 flex items-center gap-1 text-[10px] uppercase font-bold text-ios-blue-light dark:text-ios-blue-dark bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 px-2.5 py-1 rounded-full">
                    <Pin className="w-3 h-3 fill-current rotate-45" /> Epinglé
                  </div>
                )}

                {/* Author Info header */}
                <div className="flex items-center gap-3">
                  {post.author.avatar_url ? (
                    <img 
                      src={post.author.avatar_url} 
                      alt={post.author.username} 
                      className="w-10 h-10 rounded-full object-cover border border-black/10 dark:border-white/10"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 flex items-center justify-center text-ios-blue-light dark:text-ios-blue-dark font-bold">
                      {post.author.username[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold">{post.author.full_name || post.author.username}</span>
                      {post.author.is_premium && (
                        <span className="inline-flex items-center text-[9px] font-extrabold bg-gradient-to-r from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark text-white px-1.5 py-0.5 rounded-full shadow-[0_0_8px_rgba(0,122,255,0.4)] animate-pulse">
                          PRO
                        </span>
                      )}
                      <span className="text-[10px] font-bold bg-ios-orange-light/10 dark:bg-ios-orange-dark/15 text-ios-orange-light dark:text-ios-orange-dark px-1.5 py-0.5 rounded-ios-sm">
                        Niv. {post.author.level}
                      </span>
                    </div>
                    <span className="text-[11px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-semibold">
                      Publié il y a {formatTimeAgo(post.created_at)}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div>
                  <h4 
                    onClick={() => setActivePost(post)}
                    className="font-bold text-lg text-ios-label-primaryLight dark:text-white mb-2 cursor-pointer hover:text-ios-blue-light dark:hover:text-ios-blue-dark hover:underline transition"
                  >
                    {post.title}
                  </h4>
                  <p className="text-sm leading-relaxed text-ios-label-secondaryLight dark:text-ios-label-secondaryDark line-clamp-3 whitespace-pre-wrap">
                    {post.content}
                  </p>
                  {post.poll && (
                    <PollWidget poll={post.poll} onVote={(optionId) => castVote(post.poll!.id, optionId)} />
                  )}
                </div>

                {/* Footer Interactions */}
                <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-4 mt-2">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleLike(post.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition ${
                        post.liked_by_user
                          ? 'bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 text-ios-blue-light dark:text-ios-blue-dark'
                          : 'hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'
                      }`}
                    >
                      <ThumbsUp className={`w-3.5 h-3.5 ${post.liked_by_user ? 'fill-current' : ''}`} />
                      {post.likes_count}
                    </button>
                    <button
                      onClick={() => setActivePost(post)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark transition"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      {post.comments_count} commentaires
                    </button>
                  </div>

                  <span className="text-xs bg-black/5 dark:bg-white/5 px-2.5 py-1 rounded-ios-sm font-semibold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                    {post.category.name}
                  </span>
                </div>

                {/* Delete button (only visible to author or admin) */}
                {(user?.id === post.author_id || profile?.role === 'admin') && (
                  <button
                    onClick={() => {
                      if(confirm("Supprimer ce post ?")) {
                        deletePost(post.id);
                      }
                    }}
                    className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 hover:bg-ios-pink-light/10 dark:hover:bg-ios-pink-dark/15 p-2 rounded-ios-md text-ios-pink-light dark:text-ios-pink-dark transition-all"
                    title="Supprimer le post"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Right Column Sidebar info & Gamification widgets */}
      <div className="lg:col-span-4 flex flex-col gap-6">

        {/* Next Community Event announcement banner */}
        {nextEvent && (
          <div className="glass-panel border border-ios-indigo-light/20 dark:border-ios-indigo-dark/20 rounded-ios-xl p-5 shadow-ios-soft flex flex-col gap-3 relative overflow-hidden animate-slide-up">
            <div className="absolute right-[-15px] top-[-15px] w-28 h-28 bg-ios-indigo-light/10 dark:bg-ios-indigo-dark/10 rounded-full filter blur-xl pointer-events-none" />
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase font-extrabold tracking-widest text-ios-indigo-light dark:text-ios-indigo-dark">
                <CalendarIcon className="w-3.5 h-3.5" /> Prochain événement
              </span>
              <span className="text-[10px] font-bold bg-ios-indigo-light/10 dark:bg-ios-indigo-dark/15 text-ios-indigo-light dark:text-ios-indigo-dark px-2 py-0.5 rounded-full capitalize">
                {fmtRelativeDay(nextEvent.starts_at)}
              </span>
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">{nextEvent.title}</h3>
              <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1 flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> {fmtTime(nextEvent.starts_at)}
                {nextEvent.creator && <span className="truncate">· par {nextEvent.creator.full_name || nextEvent.creator.username}</span>}
              </p>
              {nextEvent.description && (
                <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-2 line-clamp-2">{nextEvent.description}</p>
              )}
            </div>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => toggleReminder(nextEvent.id, !nextEvent.reminder_on)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-ios-lg text-xs font-bold transition-all active:scale-95 ${
                  nextEvent.reminder_on
                    ? 'bg-ios-orange-light/15 text-ios-orange-light dark:text-ios-orange-dark'
                    : 'bg-ios-indigo-light dark:bg-ios-indigo-dark text-white shadow-ios-glow hover:opacity-95'
                }`}
              >
                {nextEvent.reminder_on ? <><Bell className="w-3.5 h-3.5 fill-current" /> Rappel activé</> : <><BellOff className="w-3.5 h-3.5" /> Me le rappeler</>}
              </button>
              <Link to="/calendrier" className="flex items-center justify-center gap-1 px-3 py-2 rounded-ios-lg text-xs font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition active:scale-95">
                Voir <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Level Up details box */}
        <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-6 shadow-ios-soft flex flex-col gap-4 relative overflow-hidden">
          <div className="absolute right-[-10px] top-[-10px] w-24 h-24 bg-ios-orange-light/10 dark:bg-ios-orange-dark/10 rounded-full filter blur-[10px] pointer-events-none"></div>
          
          <h3 className="font-extrabold text-lg flex items-center gap-2 text-ios-orange-light dark:text-ios-orange-dark">
            <Sparkles className="w-5 h-5 fill-current" /> Gamification
          </h3>
          <p className="text-xs leading-relaxed text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
            Gagnez de l'XP en participant ! Chaque contribution vous rapproche du niveau supérieur et débloque de nouvelles fonctionnalités.
          </p>

          <div className="grid grid-cols-2 gap-3 text-center mt-2 border-t border-black/5 dark:border-white/5 pt-3">
            <div className="bg-black/5 dark:bg-white/5 p-2.5 rounded-ios-md">
              <span className="text-[10px] uppercase font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Créer un post</span>
              <p className="text-sm font-bold text-ios-blue-light dark:text-ios-blue-dark mt-0.5">+15 XP</p>
            </div>
            <div className="bg-black/5 dark:bg-white/5 p-2.5 rounded-ios-md">
              <span className="text-[10px] uppercase font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Écrire un comm.</span>
              <p className="text-sm font-bold text-ios-blue-light dark:text-ios-blue-dark mt-0.5">+5 XP</p>
            </div>
          </div>
        </div>

        {/* Community Premium Paywall Banner */}
        {!hasActiveSubscription && profile?.role !== 'admin' && profile?.role !== 'creator' && (
          <div className="bg-gradient-to-tr from-ios-indigo-light to-ios-blue-light dark:from-ios-indigo-dark dark:to-ios-blue-dark border border-white/10 rounded-ios-xl p-6 text-white shadow-ios-strong relative flex flex-col gap-3">
            <div className="absolute right-4 top-4 bg-white/20 p-2 rounded-full backdrop-blur-md">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <span className="text-xs uppercase font-extrabold tracking-widest text-white/80">Skuuul Pro</span>
            <h3 className="font-extrabold text-xl leading-tight">Débloquez le Groupe Privé</h3>
            <p className="text-xs text-white/90 leading-relaxed">
              Accédez aux salons vocaux hebdomadaires, au canal de chat privé et à l\'intégralité du catalogue Classroom premium.
            </p>
            <button 
              onClick={redirectToStripeCheckout}
              className="bg-white text-ios-indigo-light dark:text-ios-indigo-dark font-bold px-4 py-2.5 rounded-ios-lg text-sm mt-2 transition hover:bg-white/95 active:scale-95 flex items-center justify-center gap-2"
            >
              S\'abonner (49€/mois) <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Short Leaderboard widget */}
        <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-6 shadow-ios-soft flex flex-col gap-4">
          <h3 className="font-extrabold text-lg flex items-center gap-2 text-ios-blue-light dark:text-ios-blue-dark">
            <Trophy className="w-5 h-5 text-ios-orange-light dark:text-ios-orange-dark" /> Membres Actifs
          </h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 px-3 py-2 rounded-ios-lg">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-extrabold text-ios-orange-light">1.</span>
                <span className="text-xs font-bold">kelvyn_admin</span>
              </div>
              <span className="text-[10px] font-bold bg-ios-orange-light/10 text-ios-orange-light px-2 py-0.5 rounded-full">
                Niv. 4 (1450 XP)
              </span>
            </div>
            <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 px-3 py-2 rounded-ios-lg">
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-extrabold text-ios-gray-1 dark:text-ios-gray-3">2.</span>
                <span className="text-xs font-bold">jane_doe</span>
              </div>
              <span className="text-[10px] font-bold bg-ios-orange-light/10 text-ios-orange-light px-2 py-0.5 rounded-full">
                Niv. 2 (120 XP)
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Detail Post & Comments Modal Drawer */}
      {activePost && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs">
          
          {/* Backdrop click close */}
          <div className="absolute inset-0 cursor-pointer" onClick={() => setActivePost(null)}></div>
          
          <div className="relative w-full max-w-2xl h-full bg-white dark:bg-[#1c1c1e] shadow-2xl flex flex-col border-l border-black/10 dark:border-white/10 animate-slide-up">
            
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-black/5 dark:border-white/5">
              <span className="text-xs font-extrabold bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 text-ios-blue-light dark:text-ios-blue-dark px-3 py-1 rounded-full">
                Discussion - {activePost.category.name}
              </span>
              <button 
                onClick={() => setActivePost(null)}
                className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-ios-label-secondaryLight dark:text-ios-label-secondaryDark transition font-semibold"
              >
                Fermer
              </button>
            </div>

            {/* Post details body scroll area */}
            <div className="flex-grow overflow-y-auto p-6 space-y-6">
              
              {/* Actual post */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  {activePost.author.avatar_url ? (
                    <img 
                      src={activePost.author.avatar_url} 
                      alt={activePost.author.username} 
                      className="w-10 h-10 rounded-full object-cover border border-black/10 dark:border-white/10"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 flex items-center justify-center text-ios-blue-light dark:text-ios-blue-dark font-bold">
                      {activePost.author.username[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-extrabold">{activePost.author.full_name || activePost.author.username}</span>
                      {activePost.author.is_premium && (
                        <span className="inline-flex items-center text-[9px] font-extrabold bg-gradient-to-r from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark text-white px-1.5 py-0.5 rounded-full shadow-[0_0_8px_rgba(0,122,255,0.4)] animate-pulse">
                          PRO
                        </span>
                      )}
                      <span className="text-[10px] font-bold bg-ios-orange-light/10 text-ios-orange-light px-1.5 py-0.5 rounded">
                        Niv. {activePost.author.level}
                      </span>
                    </div>
                    <span className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-medium">
                      Publié il y a {formatTimeAgo(activePost.created_at)}
                    </span>
                  </div>
                </div>

                <h2 className="text-xl font-extrabold text-ios-label-primaryLight dark:text-white leading-tight">
                  {activePost.title}
                </h2>

                <p className="text-sm leading-relaxed text-ios-label-secondaryLight dark:text-ios-label-secondaryDark whitespace-pre-wrap">
                  {activePost.content}
                </p>
                {activePost.poll && (
                  <PollWidget 
                    poll={activePost.poll} 
                    onVote={async (optionId) => {
                      const success = await castVote(activePost.poll!.id, optionId);
                      if (success) {
                        const updatedPost = useCommunityStore.getState().posts.find(p => p.id === activePost.id);
                        if (updatedPost) setActivePost(updatedPost);
                      }
                    }}
                  />
                )}
              </div>

              {/* Comments Section */}
              <div className="border-t border-black/5 dark:border-white/5 pt-6 space-y-4">
                <h3 className="font-extrabold text-base">Commentaires ({activePost.comments_count})</h3>
                
                {/* List of comments */}
                <div className="space-y-4">
                  {(commentsByPost[activePost.id] || []).length === 0 ? (
                    <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark italic">
                      Aucun commentaire sous ce post. Exprimez-vous !
                    </p>
                  ) : (
                    (commentsByPost[activePost.id] || []).map((comm) => (
                      <div key={comm.id} className="bg-black/5 dark:bg-white/5 p-4 rounded-ios-lg flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {comm.author.avatar_url ? (
                              <img 
                                src={comm.author.avatar_url} 
                                alt={comm.author.username} 
                                className="w-6 h-6 rounded-full object-cover border border-black/10 dark:border-white/10"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 flex items-center justify-center text-[10px] text-ios-blue-light dark:text-ios-blue-dark font-bold">
                                {comm.author.username[0].toUpperCase()}
                              </div>
                            )}
                            <span className="text-xs font-bold">{comm.author.full_name || comm.author.username}</span>
                            {comm.author.is_premium && (
                              <span className="inline-flex items-center text-[8px] font-extrabold bg-gradient-to-r from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark text-white px-1.5 py-0.2 rounded-full shadow-[0_0_6px_rgba(0,122,255,0.3)] animate-pulse">
                                PRO
                              </span>
                            )}
                            <span className="text-[9px] font-semibold bg-ios-orange-light/10 text-ios-orange-light px-1 py-0.2 rounded-ios-sm">
                              Niv. {comm.author.level}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-medium">
                              Il y a {formatTimeAgo(comm.created_at)}
                            </span>
                            {(user?.id === comm.author_id || profile?.role === 'admin' || profile?.role === 'creator') && (
                              <button
                                onClick={async () => {
                                  if (confirm("Supprimer ce commentaire ?")) {
                                    const success = await deleteComment(activePost.id, comm.id);
                                    if (success) {
                                      setActivePost(prev => prev ? { ...prev, comments_count: prev.comments_count - 1 } : null);
                                    }
                                  }
                                }}
                                className="text-ios-pink-light dark:text-ios-pink-dark hover:bg-ios-pink-light/10 dark:hover:bg-ios-pink-dark/15 p-1 rounded-ios-sm transition-all"
                                title="Supprimer le commentaire"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs leading-relaxed text-ios-label-secondaryLight dark:text-ios-label-secondaryDark whitespace-pre-wrap">
                          {comm.content}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* Comment Form input pinned at bottom */}
            <form onSubmit={handleAddComment} className="p-4 border-t border-black/5 dark:border-white/5 bg-white dark:bg-[#1c1c1e] flex gap-3">
              <input
                type="text"
                required
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Écrivez un commentaire... (+5 XP)"
                className="flex-grow glass-input px-3.5 py-2.5 text-xs rounded-ios-md font-medium"
              />
              <button 
                type="submit"
                className="bg-ios-blue-light dark:bg-ios-blue-dark text-white p-2.5 rounded-ios-md flex items-center justify-center hover:opacity-90 active:scale-95 transition"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};

// Simple date parser helper
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMin < 60) {
    return `${Math.max(1, diffMin)} min`;
  } else if (diffHrs < 24) {
    return `${diffHrs} h`;
  } else {
    return `${diffDays} j`;
  }
}
