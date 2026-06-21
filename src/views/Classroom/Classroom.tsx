import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useClassroomStore, Course, Lesson } from '../../store/classroomStore';
import { 
  Play, 
  CheckCircle, 
  ChevronRight, 
  ChevronDown, 
  Lock, 
  Sparkles, 
  ArrowLeft,
  ChevronLeft,
  Tv,
  Plus,
  Upload,
  Loader,
  X,
  Trash2
} from 'lucide-react';
import confetti from 'canvas-confetti';

export const getCourseBadge = (price: number) => {
  if (price === 0) {
    return {
      text: '🌱 Graine de Savoir',
      classes: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400 border border-emerald-500/20 shadow-xs'
    };
  }
  if (price > 0 && price <= 10) {
    return {
      text: '🍬 Doux Bonbon',
      classes: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400 border border-amber-500/20 shadow-xs'
    };
  }
  if (price > 10 && price <= 50) {
    return {
      text: '🦉 Sage Hibou',
      classes: 'bg-ios-blue-light/10 text-ios-blue-light dark:bg-ios-blue-dark/20 dark:text-ios-blue-dark border border-ios-blue-light/20 shadow-xs'
    };
  }
  if (price > 50 && price <= 150) {
    return {
      text: '🔥 Super Étincelle',
      classes: 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400 border border-purple-500/20 shadow-xs'
    };
  }
  if (price > 150 && price <= 500) {
    return {
      text: '🚀 Méga Fusée',
      classes: 'bg-pink-500/10 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400 border border-pink-500/20 shadow-xs'
    };
  }
  if (price > 500 && price <= 10000) {
    return {
      text: '👑 Joyau Royal',
      classes: 'bg-gradient-to-r from-yellow-500/20 to-amber-500/20 text-amber-700 dark:text-yellow-400 border border-yellow-500/30 shadow-xs'
    };
  }
  return {
    text: '🌌 Trésor Cosmique',
    classes: 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-[0_0_12px_rgba(139,92,246,0.5)] border-0 animate-pulse'
  };
};


export const Classroom: React.FC = () => {
  const { profile, redirectToStripeCheckout, hasActiveSubscription } = useAuthStore();
  const { 
    courses, 
    modules, 
    lessons, 
    completedLessons, 
    userPurchases,
    fetchCourses, 
    fetchCourseContent, 
    fetchProgress, 
    toggleLessonCompletion,
    fetchUserPurchases,
    requestCoursePurchase
  } = useClassroomStore();

  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  
  const [xpNotify, setXpNotify] = useState<number | null>(null);
  const [isSubmittingProgress, setIsSubmittingProgress] = useState(false);

  // Admin modals state
  const [showCreateCourseModal, setShowCreateCourseModal] = useState(false);
  const [showCreateModuleModal, setShowCreateModuleModal] = useState(false);
  const [showCreateLessonModal, setShowCreateLessonModal] = useState(false);
  const [selectedModuleIdForLessonCreate, setSelectedModuleIdForLessonCreate] = useState<string | null>(null);
  const [paymentModalCourse, setPaymentModalCourse] = useState<Course | null>(null);
  const [transferRefCode, setTransferRefCode] = useState('');
  const [requestingPayment, setRequestingPayment] = useState(false);



  // Form states
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDesc, setCourseDesc] = useState('');
  const [courseCover, setCourseCover] = useState('https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600');
  const [coursePrice, setCoursePrice] = useState<number>(0);
  const [uploadingCourseCover, setUploadingCourseCover] = useState(false);

  const [moduleTitle, setModuleTitle] = useState('');
  
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonContent, setLessonContent] = useState('');
  const [lessonVideoUrl, setLessonVideoUrl] = useState('https://player.vimeo.com/video/502163294');
  const [uploadingLessonVideo, setUploadingLessonVideo] = useState(false);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseTitle.trim()) return;
    const { createCourse } = useClassroomStore.getState();
    const newCourse = await createCourse({
      title: courseTitle,
      description: courseDesc,
      cover_image_url: courseCover,
      is_published: true,
      is_premium: coursePrice > 0,
      price: coursePrice,
    });
    if (newCourse) {
      setCourseTitle('');
      setCourseDesc('');
      setCourseCover('https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600');
      setCoursePrice(0);
      setShowCreateCourseModal(false);
      alert('Cours créé avec succès !');
    } else {
      alert('Erreur lors de la création du cours.');
    }
  };

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moduleTitle.trim() || !selectedCourse) return;
    const { createModule } = useClassroomStore.getState();
    const newModule = await createModule({
      course_id: selectedCourse.id,
      title: moduleTitle,
      order_index: modules.length + 1,
    });
    if (newModule) {
      setModuleTitle('');
      setShowCreateModuleModal(false);
      alert('Module créé avec succès !');
      // Refresh course content
      await fetchCourseContent(selectedCourse.id);
    } else {
      alert('Erreur lors de la création du module.');
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonTitle.trim() || !selectedModuleIdForLessonCreate || !selectedCourse) return;
    const { createLesson } = useClassroomStore.getState();
    const currentLessons = lessons[selectedModuleIdForLessonCreate] || [];
    const newLesson = await createLesson({
      module_id: selectedModuleIdForLessonCreate,
      title: lessonTitle,
      content: lessonContent,
      video_url: lessonVideoUrl,
      order_index: currentLessons.length + 1,
    });
    if (newLesson) {
      setLessonTitle('');
      setLessonContent('');
      setLessonVideoUrl('https://player.vimeo.com/video/502163294');
      setSelectedModuleIdForLessonCreate(null);
      setShowCreateLessonModal(false);
      alert('Leçon créée avec succès !');
      // Refresh course content
      await fetchCourseContent(selectedCourse.id);
    } else {
      alert('Erreur lors de la création de la leçon.');
    }
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!window.confirm('Voulez-vous vraiment supprimer ce module et toutes ses leçons ?')) return;
    const { deleteModule } = useClassroomStore.getState();
    const success = await deleteModule(moduleId);
    if (success && selectedCourse) {
      alert('Module supprimé.');
      // Update selected lesson if it was in the deleted module
      const deletedModuleLessons = lessons[moduleId] || [];
      if (selectedLesson && deletedModuleLessons.some(l => l.id === selectedLesson.id)) {
        setSelectedLesson(null);
      }
      await fetchCourseContent(selectedCourse.id);
    } else {
      alert('Erreur lors de la suppression du module.');
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!window.confirm('Voulez-vous vraiment supprimer ce cours, ainsi que tous ses modules et leçons ?')) return;
    const { deleteCourse } = useClassroomStore.getState();
    const success = await deleteCourse(courseId);
    if (success) {
      alert('Cours supprimé.');
      if (selectedCourse?.id === courseId) {
        setSelectedCourse(null);
      }
    } else {
      alert('Erreur lors de la suppression du cours.');
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'course' | 'lesson') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const { uploadMedia } = useClassroomStore.getState();
    if (target === 'course') {
      setUploadingCourseCover(true);
      const url = await uploadMedia(file);
      if (url) {
        setCourseCover(url);
      } else {
        alert("Erreur lors de l'upload de l'image.");
      }
      setUploadingCourseCover(false);
    } else {
      setUploadingLessonVideo(true);
      const url = await uploadMedia(file);
      if (url) {
        setLessonVideoUrl(url);
      } else {
        alert("Erreur lors de l'upload de la vidéo/audio.");
      }
      setUploadingLessonVideo(false);
    }
  };

  useEffect(() => {
    fetchCourses();
    fetchProgress();
    fetchUserPurchases();
  }, [fetchCourses, fetchProgress, fetchUserPurchases]);

  // Listen to Stripe Redirect Parameters (success / cancel)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const courseId = params.get('course_id');

    if (payment) {
      // Clear URL query parameters
      window.history.replaceState({}, document.title, window.location.pathname);

      if (payment === 'success') {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 }
        });
        alert("🎉 Votre paiement a été validé avec succès ! Votre accès à la formation est débloqué à vie.");
        
        // Refresh purchases to unlock UI
        fetchUserPurchases().then(() => {
          if (courseId) {
            const course = courses.find(c => c.id === courseId);
            if (course) {
              setSelectedCourse(course);
              fetchCourseContent(course.id);
            }
          }
        });
      } else if (payment === 'cancel') {
        alert("❌ Le paiement via Stripe a été annulé.");
      }
    }
  }, [window.location.search, fetchUserPurchases, courses]);

  // Load modules & lessons when course is opened
  const handleSelectCourse = async (course: Course) => {
    const isOwner = course.owner_id === profile?.id;
    const isAdmin = profile?.role === 'admin';
    const priceVal = course.price || 0;
    
    const approvedPurchase = userPurchases.find(p => p.course_id === course.id && p.status === 'approved');
    const isLocked = priceVal > 0 && !isAdmin && !isOwner && !approvedPurchase;
    
    if (isLocked) {
      setTransferRefCode('SKU-' + Math.random().toString(36).substring(2, 8).toUpperCase());
      setPaymentModalCourse(course);
      return;
    }

    setSelectedCourse(course);
    await fetchCourseContent(course.id);
  };

  // Set default first lesson when modules load
  useEffect(() => {
    if (selectedCourse && modules.length > 0) {
      // Expand all modules by default
      const expansions: Record<string, boolean> = {};
      modules.forEach(m => { expansions[m.id] = true; });
      setExpandedModules(expansions);

      // Select first lesson of first module
      const firstMod = modules[0];
      const modLessons = lessons[firstMod.id] || [];
      if (modLessons.length > 0) {
        setSelectedLesson(modLessons[0]);
      }
    }
  }, [modules, selectedCourse]);

  const toggleModule = (modId: string) => {
    setExpandedModules(prev => ({
      ...prev,
      [modId]: !prev[modId]
    }));
  };

  const handleLessonCheck = async (lessonId: string) => {
    if (isSubmittingProgress) return;
    setIsSubmittingProgress(true);

    const { completed, xpGained } = await toggleLessonCompletion(lessonId);
    
    if (completed && xpGained > 0) {
      setXpNotify(xpGained);
      setTimeout(() => setXpNotify(null), 3000);

      // Check level-up from state updates
      const currentAuth = useAuthStore.getState();
      const currentLevel = currentAuth.profile?.level || 1;
      
      // If XP threshold crossed
      const nextLvlXp = Math.pow(currentLevel, 2) * 250;
      if (currentAuth.profile && currentAuth.profile.xp >= nextLvlXp) {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 }
        });
      }
    }

    setIsSubmittingProgress(false);
  };

  // Find next and previous lessons for navigation
  const getNeighborLessons = () => {
    if (!selectedCourse || !selectedLesson) return { prev: null, next: null };
    
    // Flatten all lessons across active modules in order
    const flatLessons: Lesson[] = [];
    modules.forEach(m => {
      flatLessons.push(...(lessons[m.id] || []));
    });

    const index = flatLessons.findIndex(l => l.id === selectedLesson.id);
    if (index === -1) return { prev: null, next: null };

    return {
      prev: index > 0 ? flatLessons[index - 1] : null,
      next: index < flatLessons.length - 1 ? flatLessons[index + 1] : null,
    };
  };

  const { prev: prevLesson, next: nextLesson } = getNeighborLessons();

  // Calculate course completion progress percentage
  const getCourseProgress = (courseId: string) => {
    // Find modules for this course
    const courseModules = modules.filter(m => m.course_id === courseId);
      
    const lessonIds: string[] = [];
    courseModules.forEach(m => {
      const modLessons = lessons[m.id] || [];
      lessonIds.push(...modLessons.map(l => l.id));
    });

    if (lessonIds.length === 0) return 0;
    
    const completedCount = lessonIds.filter(id => completedLessons.has(id)).length;
    return Math.round((completedCount / lessonIds.length) * 100);
  };

  // Back from course view to grid view
  const handleBackToCourses = () => {
    setSelectedCourse(null);
    setSelectedLesson(null);
  };

  return (
    <div className="relative">
      
      {/* Floating XP Gain Badge notification */}
      {xpNotify && (
        <div className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-ios-green-light to-ios-green-dark text-white px-5 py-3 rounded-ios-xl shadow-ios-strong border border-white/20 animate-slide-up flex items-center gap-2">
          <Sparkles className="w-5 h-5 fill-current animate-bounce" />
          <div className="flex flex-col">
            <span className="text-sm font-bold">Leçon Terminée !</span>
            <span className="text-xs font-semibold">+{xpNotify} XP ajoutés à votre profil</span>
          </div>
        </div>
      )}

      {/* Grid View: Select Course */}
      {!selectedCourse ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Classroom</h1>
              <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1 font-medium">
                Suivez votre progression et développez vos compétences à votre rythme.
              </p>
            </div>
            
            {/* Creator subscription warning at page level */}
            {profile?.role === 'creator' && !hasActiveSubscription && (
              <div className="bg-ios-orange-light/10 border border-ios-orange-light/20 text-ios-orange-light p-3 rounded-ios-lg text-xs font-bold flex items-center gap-3">
                <span>⚠️ Abonnement requis pour créer des formations</span>
                <button 
                  onClick={redirectToStripeCheckout}
                  className="bg-ios-orange-light text-white px-3 py-1.5 rounded text-[10px] uppercase tracking-wider hover:opacity-90 transition active:scale-95"
                >
                  S'abonner via Stripe
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {courses.map((course) => {
              const purchase = userPurchases.find(p => p.course_id === course.id);
              const isApproved = purchase?.status === 'approved';
              const isPending = purchase?.status === 'pending';
              const isRejected = purchase?.status === 'rejected';
              const priceVal = course.price || 0;
              const isOwner = course.owner_id === profile?.id;
              const isAdmin = profile?.role === 'admin';
              
              const isLocked = priceVal > 0 && !isAdmin && !isOwner && !isApproved;
              const progress = getCourseProgress(course.id);
              
              return (
                <div 
                  key={course.id} 
                  onClick={() => handleSelectCourse(course)}
                  className="glass-card flex flex-col h-full overflow-hidden cursor-pointer"
                >
                  {/* Cover image */}
                  <div className="h-48 relative overflow-hidden bg-black/10">
                    <img 
                      src={course.cover_image_url} 
                      alt={course.title} 
                      className="w-full h-full object-cover transition duration-300 hover:scale-105"
                    />
                    {isLocked && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2">
                        {isPending ? (
                          <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-center">
                            <Loader className="w-6 h-6 text-ios-orange-light animate-spin" />
                            <span className="text-[11px] uppercase font-extrabold tracking-wider text-ios-orange-light">Validation en cours</span>
                            <span className="text-[9px] text-white/60 font-mono">{purchase?.transfer_reference}</span>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm("Voulez-vous vraiment annuler cette demande de virement en cours ?")) {
                                  const { cancelCoursePurchase } = useClassroomStore.getState();
                                  const success = await cancelCoursePurchase(course.id);
                                  if (success) {
                                    alert("La demande de transaction en cours a été annulée. Vous pouvez maintenant payer par Carte Bancaire.");
                                  } else {
                                    alert("Erreur lors de l'annulation de la demande.");
                                  }
                                }
                              }}
                              className="mt-1 bg-white/10 hover:bg-white/20 active:scale-95 border border-white/20 text-white rounded-ios-lg px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider transition-all"
                            >
                              Annuler la transaction
                            </button>
                          </div>
                        ) : isRejected ? (
                          <>
                            <X className="w-8 h-8 text-ios-red-light" />
                            <span className="text-xs uppercase font-extrabold tracking-wider text-ios-red-light">Virement Rejeté</span>
                            <span className="text-[10px] text-white/70">Cliquez pour corriger</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-8 h-8 text-ios-blue-light" />
                            <span className="text-xs uppercase font-extrabold tracking-wider">Achat Direct : {priceVal}€</span>
                            <span className="text-[9px] text-white/70 uppercase">Par virement bancaire</span>
                          </>
                        )}
                      </div>
                    )}
                    {priceVal > 0 && !isLocked && (
                      <div className="absolute top-4 left-4 bg-ios-green-light/95 text-white font-bold text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full shadow-ios-soft">
                        Débloqué ({priceVal}€)
                      </div>
                    )}
                  </div>

                  {/* Body details */}
                  <div className="p-6 flex flex-col flex-grow gap-3 justify-between">
                    <div className="space-y-2">
                      {/* Price Tier Badge */}
                      {(() => {
                        const badge = getCourseBadge(priceVal);
                        return (
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${badge.classes}`}>
                              {badge.text}
                            </span>
                            {priceVal > 0 && (
                              <span className="text-[10px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                                • {priceVal}€
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <h3 className="font-extrabold text-lg leading-snug text-left">{course.title}</h3>
                      <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark leading-relaxed line-clamp-2 text-left">
                        {course.description}
                      </p>
                    </div>

                    {/* Progress indicator or Admin Action */}
                    <div className="space-y-1.5 pt-2">
                      {!isLocked && (
                        <>
                          <div className="flex justify-between items-center text-[10px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                            <span>Progression</span>
                            <span>{progress}%</span>
                          </div>
                          <div className="w-full bg-black/10 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-ios-blue-light dark:bg-ios-blue-dark h-full rounded-full transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                        </>
                      )}

                      {(profile?.role === 'admin' || (profile?.role === 'creator' && course.owner_id === profile?.id)) && (
                        <div className="pt-2 border-t border-black/5 dark:border-white/5 flex justify-end">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCourse(course.id);
                            }}
                            className="p-2 text-ios-red-light dark:text-ios-red-dark hover:bg-ios-red-light/10 dark:hover:bg-ios-red-dark/10 rounded-full transition"
                            title="Supprimer ce cours"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Admin Create Course Button */}
            {(profile?.role === 'admin' || profile?.role === 'creator') && (
              <div 
                onClick={() => {
                  if (profile?.role === 'creator' && !hasActiveSubscription) {
                    alert("Vous devez avoir un abonnement Skuuul Pro actif pour créer des formations.");
                    redirectToStripeCheckout();
                    return;
                  }
                  setShowCreateCourseModal(true);
                }}
                className={`glass-card flex flex-col items-center justify-center h-full min-h-[300px] border-dashed border-2 transition cursor-pointer gap-2 p-6 ${
                  profile?.role === 'creator' && !hasActiveSubscription
                    ? 'border-ios-orange-light/30 bg-ios-orange-light/5 hover:border-ios-orange-light/60'
                    : 'border-ios-blue-light/30 dark:border-ios-blue-dark/20 hover:border-ios-blue-light/60 hover:bg-ios-blue-light/5 dark:hover:bg-ios-blue-dark/5'
                }`}
              >
                {profile?.role === 'creator' && !hasActiveSubscription ? (
                  <>
                    <Lock className="w-8 h-8 text-ios-orange-light animate-pulse" />
                    <span className="font-extrabold text-sm text-ios-orange-light">Abonnement Requis</span>
                    <span className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-center">
                      Souscrivez à Skuuul Pro pour commencer à héberger vos cours.
                    </span>
                  </>
                ) : (
                  <>
                    <Plus className="w-8 h-8 text-ios-blue-light dark:text-ios-blue-dark" />
                    <span className="font-extrabold text-sm text-ios-blue-light dark:text-ios-blue-dark">Créer un nouveau cours</span>
                    <span className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-center">
                      Formez vos membres en publiant de nouvelles formations
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Course Detail View with video player & modular layout */
        <div className="flex flex-col gap-6">
          
          {/* Header Bar */}
          <div className="flex items-center gap-3">
            <button 
              onClick={handleBackToCourses}
              className="p-2 bg-black/5 dark:bg-white/5 rounded-ios-lg hover:bg-black/10 dark:hover:bg-white/10 transition text-ios-label-secondaryLight dark:text-ios-label-secondaryDark"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-ios-blue-light dark:text-ios-blue-dark">Classroom / Cours</span>
              <h2 className="font-extrabold text-xl leading-none">{selectedCourse.title}</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Lesson list Accordions */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-5 shadow-ios-soft space-y-4">
                <h3 className="font-extrabold text-sm text-ios-label-primaryLight dark:text-white uppercase tracking-wider">
                  Modules du Cours
                </h3>

                <div className="flex flex-col gap-2.5">
                  {modules.map((mod) => {
                    const isExpanded = expandedModules[mod.id];
                    const modLessons = lessons[mod.id] || [];

                    return (
                      <div key={mod.id} className="border border-black/5 dark:border-white/5 rounded-ios-lg overflow-hidden bg-black/5 dark:bg-white/5">
                        
                        {/* Module Header Title Button & Actions */}
                        <div className="flex items-center bg-black/5 dark:bg-white/5 transition hover:bg-black/10 dark:hover:bg-white/10">
                          <button
                            onClick={() => toggleModule(mod.id)}
                            className="flex-grow p-4 flex items-center justify-between font-bold text-sm text-left"
                          >
                            <span className="leading-tight">{mod.title}</span>
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          
                          {(profile?.role === 'admin' || (profile?.role === 'creator' && selectedCourse?.owner_id === profile?.id)) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteModule(mod.id);
                              }}
                              className="p-4 text-ios-red-light dark:text-ios-red-dark hover:opacity-70 transition"
                              title="Supprimer ce module"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {/* Lessons List inside module */}
                        {isExpanded && (
                          <div className="divide-y divide-black/5 dark:divide-white/5">
                            {modLessons.length === 0 ? (
                              <p className="p-4 text-xs italic text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Aucune leçon.</p>
                            ) : (
                              modLessons.map((les) => {
                                const isCompleted = completedLessons.has(les.id);
                                const isCurrent = selectedLesson?.id === les.id;

                                return (
                                  <div 
                                    key={les.id}
                                    className={`flex items-center justify-between p-3.5 pl-6 gap-2 text-xs font-semibold cursor-pointer transition ${
                                      isCurrent 
                                        ? 'bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 text-ios-blue-light dark:text-ios-blue-dark border-l-4 border-ios-blue-light dark:border-ios-blue-dark'
                                        : 'hover:bg-black/5 dark:hover:bg-white/5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'
                                    }`}
                                  >
                                    <div 
                                      onClick={() => setSelectedLesson(les)}
                                      className="flex items-center gap-2.5 flex-grow py-1"
                                    >
                                      <Play className={`w-3.5 h-3.5 ${isCurrent ? 'text-ios-blue-light dark:text-ios-blue-dark' : 'text-ios-label-secondaryLight/50'}`} />
                                      <span className="line-clamp-1">{les.title}</span>
                                    </div>
                                    
                                    {/* Progress Check box */}
                                    <button
                                      disabled={isSubmittingProgress}
                                      onClick={() => handleLessonCheck(les.id)}
                                      className={`p-1 rounded-full transition hover:bg-black/10 dark:hover:bg-white/10 ${
                                        isCompleted ? 'text-ios-green-light dark:text-ios-green-dark' : 'text-ios-label-secondaryLight/30 dark:text-ios-label-secondaryDark/20'
                                      }`}
                                    >
                                      <CheckCircle className="w-5 h-5 fill-current" />
                                    </button>
                                  </div>
                                );
                              })
                            )}
                            
                            {/* Admin Add Lesson Row */}
                            {(profile?.role === 'admin' || (profile?.role === 'creator' && selectedCourse?.owner_id === profile?.id)) && (
                              <div 
                                onClick={() => {
                                  setSelectedModuleIdForLessonCreate(mod.id);
                                  setShowCreateLessonModal(true);
                                }}
                                className="flex items-center justify-center p-3 text-xs font-bold text-ios-blue-light dark:text-ios-blue-dark hover:bg-ios-blue-light/5 dark:hover:bg-ios-blue-dark/5 cursor-pointer border-t border-black/5 dark:border-white/5 transition"
                              >
                                <Plus className="w-3.5 h-3.5 mr-1" /> Ajouter une leçon
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    );
                  })}

                  {/* Admin Add Module Button */}
                  {(profile?.role === 'admin' || (profile?.role === 'creator' && selectedCourse?.owner_id === profile?.id)) && (
                    <button 
                      onClick={() => setShowCreateModuleModal(true)}
                      className="w-full py-3 mt-2 border-dashed border-2 border-ios-blue-light/30 dark:border-ios-blue-dark/20 text-ios-blue-light dark:text-ios-blue-dark hover:border-ios-blue-light/60 hover:bg-ios-blue-light/5 dark:hover:bg-ios-blue-dark/5 text-xs font-bold rounded-ios-lg transition flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" /> Ajouter un module
                    </button>
                  )}
                </div>

              </div>
            </div>

            {/* Right Column: Selected Lesson Video Player & Content */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              {selectedLesson ? (
                <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl overflow-hidden shadow-ios-soft flex flex-col">
                  
                  {/* Mock Video Screen player */}
                  <div className="relative aspect-video bg-black flex items-center justify-center">
                    <iframe
                      src={selectedLesson.video_url}
                      className="w-full h-full border-0 absolute inset-0"
                      allow="autoplay; fullscreen; picture-in-picture"
                      allowFullScreen
                      title={selectedLesson.title}
                    ></iframe>
                  </div>

                  {/* Details and Navigation */}
                  <div className="p-6 space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="font-extrabold text-xl leading-tight text-ios-label-primaryLight dark:text-white">
                        {selectedLesson.title}
                      </h2>

                      {/* Complete checkbox */}
                      <button
                        onClick={() => handleLessonCheck(selectedLesson.id)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-ios-lg text-xs font-bold transition shadow-ios-soft ${
                          completedLessons.has(selectedLesson.id)
                            ? 'bg-ios-green-light/10 dark:bg-ios-green-dark/20 text-ios-green-light dark:text-ios-green-dark border border-ios-green-light/25'
                            : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark'
                        }`}
                      >
                        <CheckCircle className="w-4 h-4 fill-current" />
                        {completedLessons.has(selectedLesson.id) ? 'Complétée' : 'Marquer terminée'}
                      </button>
                    </div>

                    <p className="text-sm leading-relaxed text-ios-label-secondaryLight dark:text-ios-label-secondaryDark whitespace-pre-wrap border-t border-black/5 dark:border-white/5 pt-4">
                      {selectedLesson.content}
                    </p>

                    {/* Footer Nav Controls */}
                    <div className="flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-5 mt-4">
                      {prevLesson ? (
                        <button
                          onClick={() => setSelectedLesson(prevLesson)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-ios-md text-xs font-bold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark transition"
                        >
                          <ChevronLeft className="w-4 h-4" /> Leçon précédente
                        </button>
                      ) : (
                        <div />
                      )}

                      {nextLesson ? (
                        <button
                          onClick={() => {
                            // If marking current lesson completed
                            if (!completedLessons.has(selectedLesson.id)) {
                              handleLessonCheck(selectedLesson.id);
                            }
                            setSelectedLesson(nextLesson);
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-ios-md text-xs font-bold bg-ios-blue-light dark:bg-ios-blue-dark hover:opacity-95 text-white transition shadow-ios-soft"
                        >
                          Leçon suivante <ChevronRight className="w-4 h-4" />
                        </button>
                      ) : (
                        <div />
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-16 text-center shadow-ios-soft flex flex-col items-center gap-3">
                  <Tv className="w-12 h-12 text-ios-label-secondaryLight/40 dark:text-ios-label-secondaryDark/40" />
                  <h4 className="font-bold text-lg">Sélectionnez une leçon</h4>
                  <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                    Choisissez un module à gauche puis cliquez sur une leçon pour lancer la vidéo.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Admin Creator Dialog Popups */}

      {/* 1. Create Course Modal */}
      {showCreateCourseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 rounded-ios-2xl border border-black/5 dark:border-white/5 shadow-ios-strong animate-fade-in flex flex-col gap-4">
            <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/5">
              <h3 className="text-lg font-extrabold flex items-center gap-1.5">
                🏫 Créer un cours
              </h3>
              <button 
                onClick={() => setShowCreateCourseModal(false)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Titre du cours</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Apprendre TypeScript de A à Z"
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Description</label>
                <textarea 
                  rows={3}
                  required
                  placeholder="Une courte introduction de ce que les membres vont apprendre..."
                  value={courseDesc}
                  onChange={(e) => setCourseDesc(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark block">Image de couverture</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="text" 
                    placeholder="URL de l'image..."
                    value={courseCover}
                    onChange={(e) => setCourseCover(e.target.value)}
                    className="flex-grow bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
                  />
                  <label className="bg-ios-blue-light dark:bg-ios-blue-dark text-white px-3 py-2 rounded-ios-lg text-xs font-bold cursor-pointer hover:opacity-90 flex items-center gap-1.5 shadow-ios-glow">
                    {uploadingCourseCover ? (
                      <Loader className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        Uploader
                      </>
                    )}
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => handleMediaUpload(e, 'course')}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-3 pt-2 text-left">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark block">
                    Tarif d'accès à la formation (EUR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1000000"
                    value={coursePrice}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setCoursePrice(isNaN(val) ? 0 : Math.min(1000000, Math.max(0, val)));
                    }}
                    className="w-24 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-md px-2 py-1 text-xs font-bold text-right text-ios-blue-light dark:text-ios-blue-dark focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
                  />
                </div>
                
                <div className="flex items-center gap-3">
                  <input 
                    type="range" 
                    min="0" 
                    max="10000" 
                    step="1"
                    value={Math.min(10000, coursePrice)}
                    onChange={(e) => setCoursePrice(parseInt(e.target.value))}
                    className="flex-grow h-1.5 bg-black/10 dark:bg-white/10 rounded-lg appearance-none cursor-pointer accent-ios-blue-light dark:accent-ios-blue-dark"
                  />
                  <span className="text-[10px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark min-w-[32px] text-right">
                    {coursePrice === 0 ? 'Gratuit' : coursePrice > 10000 ? 'Max+' : `${coursePrice}€`}
                  </span>
                </div>

                {/* Live Badge Preview */}
                <div className="flex items-center justify-between p-2.5 rounded-ios-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 transition-all duration-200">
                  <span className="text-[10px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider">
                    Badge de formation obtenu :
                  </span>
                  {(() => {
                    const badge = getCourseBadge(coursePrice);
                    return (
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider transition-all duration-300 transform scale-105 shadow-ios-soft ${badge.classes}`}>
                        {badge.text}
                      </span>
                    );
                  })()}
                </div>

                <span className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark block font-medium">
                  {coursePrice === 0 
                    ? 'Cette formation sera librement accessible par tous les membres.' 
                    : 'Les membres devront réaliser un virement de ce montant pour débloquer l\'accès.'
                  }
                </span>
              </div>

              <div className="pt-4 flex gap-2">
                <button 
                  type="button"
                  onClick={() => setShowCreateCourseModal(false)}
                  className="flex-1 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-ios-xl text-sm font-bold transition"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2.5 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-sm font-bold shadow-ios-glow hover:opacity-95 transition"
                >
                  Créer le cours
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Create Module Modal */}
      {showCreateModuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 rounded-ios-2xl border border-black/5 dark:border-white/5 shadow-ios-strong animate-fade-in flex flex-col gap-4">
            <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/5">
              <h3 className="text-base font-extrabold flex items-center gap-1.5">
                📦 Ajouter un module
              </h3>
              <button 
                onClick={() => setShowCreateModuleModal(false)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateModule} className="space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Titre du module</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: 1. Introduction et configuration"
                  value={moduleTitle}
                  onChange={(e) => setModuleTitle(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button 
                  type="button"
                  onClick={() => setShowCreateModuleModal(false)}
                  className="flex-1 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-ios-xl text-xs font-bold transition"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-xs font-bold shadow-ios-glow hover:opacity-95 transition"
                >
                  Ajouter le module
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Create Lesson Modal */}
      {showCreateLessonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 rounded-ios-2xl border border-black/5 dark:border-white/5 shadow-ios-strong animate-fade-in flex flex-col gap-4">
            <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/5">
              <h3 className="text-base font-extrabold flex items-center gap-1.5">
                🎥 Ajouter une leçon
              </h3>
              <button 
                onClick={() => {
                  setShowCreateLessonModal(false);
                  setSelectedModuleIdForLessonCreate(null);
                }}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateLesson} className="space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Titre de la leçon</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Configuration initiale de l'environnement"
                  value={lessonTitle}
                  onChange={(e) => setLessonTitle(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Description / Notes de cours</label>
                <textarea 
                  rows={4}
                  required
                  placeholder="Notes et instructions de cours (format Markdown supporté)..."
                  value={lessonContent}
                  onChange={(e) => setLessonContent(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark block">Vidéo de la formation</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="text" 
                    placeholder="URL ou lien embed (Vimeo, YouTube)..."
                    value={lessonVideoUrl}
                    onChange={(e) => setLessonVideoUrl(e.target.value)}
                    className="flex-grow bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
                  />
                  <label className="bg-ios-blue-light dark:bg-ios-blue-dark text-white px-3 py-2 rounded-ios-lg text-xs font-bold cursor-pointer hover:opacity-90 flex items-center gap-1.5 shadow-ios-glow">
                    {uploadingLessonVideo ? (
                      <Loader className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        Uploader
                      </>
                    )}
                    <input 
                      type="file" 
                      accept="video/*,audio/*"
                      onChange={(e) => handleMediaUpload(e, 'lesson')}
                      className="hidden"
                    />
                  </label>
                </div>
                <span className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark block font-medium">
                  Uploadez vos propres vidéos et fichiers audios de formation directement dans le bucket sécurisé Supabase.
                </span>
              </div>

              <div className="pt-2 flex gap-2">
                <button 
                  type="button"
                  onClick={() => {
                    setShowCreateLessonModal(false);
                    setSelectedModuleIdForLessonCreate(null);
                  }}
                  className="flex-1 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-ios-xl text-xs font-bold transition"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-xs font-bold shadow-ios-glow hover:opacity-95 transition"
                >
                  Créer la leçon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Bank Transfer Payment Modal for Unlocking Resources */}
      {paymentModalCourse && (() => {
        const creatorName = paymentModalCourse.profiles?.full_name || paymentModalCourse.profiles?.username || 'Créateur Skuuul';
        const priceVal = paymentModalCourse.price || 0;
        const iban = paymentModalCourse.profiles?.iban;
        const phone = paymentModalCourse.profiles?.phone;
        const purchase = userPurchases.find(p => p.course_id === paymentModalCourse.id);
        const isRejected = purchase?.status === 'rejected';

        const handleConfirmPayment = async (e: React.FormEvent) => {
          e.preventDefault();
          setRequestingPayment(true);
          
          try {
            const result = await requestCoursePurchase(paymentModalCourse.id, priceVal, transferRefCode);
            if (result) {
              alert("Votre demande d'accès a bien été envoyée au créateur. Le cours sera débloqué une fois le virement reçu et validé.");
              setPaymentModalCourse(null);
              await fetchUserPurchases();
            } else {
              throw new Error("Impossible d'enregistrer votre demande. Veuillez réessayer.");
            }
          } catch (err: any) {
            alert(err.message || "Erreur lors de l'enregistrement de la demande.");
          } finally {
            setRequestingPayment(false);
          }
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="glass-panel w-full max-w-md p-6 rounded-ios-2xl border border-white/10 shadow-ios-strong animate-scale-in flex flex-col gap-4 text-left">
              <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/5 bg-transparent">
                <h3 className="text-lg font-extrabold flex items-center gap-1.5">
                  🔑 Débloquer la ressource
                </h3>
                <button 
                  onClick={() => setPaymentModalCourse(null)}
                  className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
                  disabled={requestingPayment}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Course info header */}
              <div className="flex items-center justify-between gap-3 bg-black/5 dark:bg-white/5 p-3 rounded-ios-xl border border-black/5">
                <div className="flex gap-3 items-center min-w-0">
                  <img 
                    src={paymentModalCourse.cover_image_url} 
                    alt={paymentModalCourse.title} 
                    className="w-16 h-16 object-cover rounded-ios-lg flex-shrink-0"
                  />
                  <div className="flex flex-col justify-center min-w-0">
                    <h4 className="font-extrabold text-sm truncate">{paymentModalCourse.title}</h4>
                    <span className="text-ios-blue-light dark:text-ios-blue-dark font-extrabold text-xs mt-1">
                      Prix de la formation : {priceVal}€
                    </span>
                  </div>
                </div>
                {(() => {
                  const badge = getCourseBadge(priceVal);
                  return (
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider flex-shrink-0 shadow-ios-soft ${badge.classes}`}>
                      {badge.text}
                    </span>
                  );
                })()}
              </div>

              {isRejected ? (
                <div className="space-y-4">
                  <div className="bg-ios-red-light/10 dark:bg-ios-red-dark/20 border border-ios-red-light/20 p-4 rounded-ios-xl text-xs space-y-2 text-center text-ios-red-light dark:text-ios-red-dark">
                    <p className="font-extrabold text-sm flex items-center justify-center gap-1.5">
                      ❌ Demande rejetée
                    </p>
                    <p className="leading-relaxed font-medium">
                      Votre précédente demande d'accès avec la référence <strong>{purchase.transfer_reference}</strong> a été rejetée par le créateur.
                    </p>
                    <p className="leading-relaxed font-medium">
                      Veuillez vérifier que vous avez bien effectué le virement avec le bon montant et la bonne référence, puis recommencez.
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button 
                      type="button"
                      onClick={() => setPaymentModalCourse(null)}
                      className="flex-grow py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 rounded-ios-xl text-xs font-bold transition"
                    >
                      Retour
                    </button>
                    <button 
                      type="button"
                      onClick={async () => {
                        const { cancelCoursePurchase } = useClassroomStore.getState();
                        const success = await cancelCoursePurchase(paymentModalCourse.id);
                        if (success) {
                          setTransferRefCode('SKU-' + Math.random().toString(36).substring(2, 8).toUpperCase());
                        } else {
                          alert("Erreur lors de la réinitialisation de la demande.");
                        }
                      }}
                      className="flex-grow py-2.5 bg-ios-orange-light text-white rounded-ios-xl text-xs font-bold shadow-ios-glow hover:opacity-95 transition"
                    >
                      Recommencer la demande
                    </button>
                  </div>
                </div>
              ) : !iban ? (
                <div className="space-y-4">
                  <div className="bg-ios-red-light/10 dark:bg-ios-red-dark/20 border border-ios-red-light/20 p-4 rounded-ios-xl text-xs space-y-2 text-center text-ios-red-light dark:text-ios-red-dark">
                    <p className="font-extrabold text-sm flex items-center justify-center gap-1.5">
                      ⚠️ Coordonnées manquantes
                    </p>
                    <p className="leading-relaxed font-medium">
                      Ce créateur n'a pas encore configuré ses coordonnées de virement (IBAN / Wero). Veuillez le contacter pour qu'il puisse ajouter son IBAN sur la plateforme.
                    </p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button 
                      type="button"
                      onClick={() => setPaymentModalCourse(null)}
                      className="w-full py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 rounded-ios-xl text-xs font-bold transition"
                    >
                      Retour
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleConfirmPayment} className="space-y-4">
                  <div className="bg-ios-blue-light/5 dark:bg-ios-blue-dark/10 border border-ios-blue-light/20 p-4 rounded-ios-xl text-xs space-y-2">
                    <p className="font-bold flex items-center gap-1.5 text-ios-blue-light">
                      🏦 Virement bancaire direct (IBAN / Wero)
                    </p>
                    <p className="leading-relaxed font-medium text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                      Effectuez un virement bancaire ou un transfert Wero de **{priceVal}€** au créateur avec les coordonnées ci-dessous :
                    </p>
                  </div>

                  <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-xl p-4 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-ios-label-secondaryLight">Bénéficiaire :</span>
                      <span className="font-extrabold text-slate-800 dark:text-white">{creatorName}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-ios-label-secondaryLight">IBAN :</span>
                      <span className="font-mono font-bold select-all bg-black/10 dark:bg-white/10 px-2 py-1 rounded text-slate-800 dark:text-white">{iban}</span>
                    </div>
                    {phone && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-ios-label-secondaryLight">Wero (Mobile) :</span>
                        <span className="font-mono font-bold select-all bg-black/10 dark:bg-white/10 px-2 py-1 rounded text-slate-800 dark:text-white">{phone}</span>
                      </div>
                    )}
                    <div className="border-t border-black/5 dark:border-white/5 pt-3 flex justify-between items-center text-xs">
                      <span className="font-semibold text-ios-label-secondaryLight">Référence à indiquer :</span>
                      <span className="font-mono font-extrabold select-all bg-ios-orange-light/10 dark:bg-ios-orange-dark/20 text-ios-orange-light dark:text-ios-orange-dark px-2.5 py-1 rounded border border-ios-orange-light/20">{transferRefCode}</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark leading-snug font-medium italic">
                    🔒 Une fois le virement effectué, cliquez sur le bouton ci-dessous pour demander l'accès. Le créateur validera votre inscription dès réception des fonds.
                  </p>

                  <div className="flex gap-2 pt-2">
                    <button 
                      type="button"
                      onClick={() => setPaymentModalCourse(null)}
                      className="flex-grow py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 rounded-ios-xl text-xs font-bold transition"
                    >
                      Retour
                    </button>
                    <button 
                      type="submit"
                      disabled={requestingPayment}
                      className="flex-grow py-2.5 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-xs font-bold shadow-ios-glow hover:opacity-95 transition flex items-center justify-center gap-1.5"
                    >
                      {requestingPayment ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Envoi...
                        </>
                      ) : (
                        "Demander l'accès après virement"
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        );
      })()}

    </div>
  );
};
