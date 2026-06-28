import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore, Profile } from '../../store/authStore';
import { useCommunityStore, Category } from '../../store/communityStore';
import { useCollaborativeStore, Canvas, CanvasAuditLog } from '../../store/collaborativeStore';
import { useClassroomStore } from '../../store/classroomStore';
import { supabase } from '../../services/supabase';
import { 
  Shield, 
  Users, 
  Sparkles, 
  Download, 
  Database, 
  Search, 
  Edit2, 
  Trash2, 
  X, 
  Ban, 
  UserCheck, 
  FolderPlus,
  MessageSquare,
  TrendingUp,
  Phone,
  Clock,
  FileText,
  Activity,
  BookOpen,
  Heart,
  PhoneCall
} from 'lucide-react';

export const Admin: React.FC = () => {
  const { 
    profile, 
    profilesList, 
    fetchProfile,
    fetchProfilesList, 
    adminUpdateUserXp, 
    adminUpdateUserPremiumStatus, 
    adminToggleUserBan,
    adminUpdateUserRole,
    adminUpdateCrmNotes
  } = useAuthStore();

  const { 
    categories, 
    fetchCategories, 
    createCategory, 
    updateCategory, 
    deleteCategory 
  } = useCommunityStore();

  const isCreator = profile?.role === 'creator';
  const isAdmin = profile?.role === 'admin';

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'crm' | 'rooms' | 'stats' | 'canvases' | 'payments'>('crm');
  const [pendingPurchases, setPendingPurchases] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
  const [adminPayoutRequests, setAdminPayoutRequests] = useState<any[]>([]);
  const [payoutAmount, setPayoutAmount] = useState<string>('');
  const [payoutIban, setPayoutIban] = useState<string>(profile?.iban || '');
  const [submittingPayout, setSubmittingPayout] = useState(false);

  // Collaborative canvases state
  const [adminCanvases, setAdminCanvases] = useState<Canvas[]>([]);
  const [adminLogs, setAdminLogs] = useState<CanvasAuditLog[]>([]);
  const [loadingCanvases, setLoadingCanvases] = useState(false);
  const [canvasSearch, setCanvasSearch] = useState('');

  const { fetchAllCanvasesAdmin, fetchAllAuditLogs, deleteCanvas } = useCollaborativeStore();

  const loadPendingPayments = async () => {
    setLoadingPayments(true);
    const { fetchPendingPurchasesForCreator, fetchPayoutRequests, adminFetchAllPayoutRequests } = useClassroomStore.getState();
    const data = await fetchPendingPurchasesForCreator();
    setPendingPurchases(data || []);

    if (profile?.id) {
      await fetchProfile(profile.id);
    }

    if (isCreator || isAdmin) {
      await fetchPayoutRequests();
      setPayoutRequests(useClassroomStore.getState().payoutRequests);
    }

    if (isAdmin) {
      const allPayouts = await adminFetchAllPayoutRequests();
      setAdminPayoutRequests(allPayouts || []);
    }
    setLoadingPayments(false);
  };

  const handleUpdatePurchaseStatus = async (purchaseId: string, status: 'approved' | 'rejected') => {
    const confirmMsg = status === 'approved' 
      ? "Voulez-vous vraiment approuver cet achat ? Cela donnera accès à la formation à l'utilisateur."
      : "Voulez-vous vraiment rejeter cet achat ?";
    if (!confirmMsg || !window.confirm(confirmMsg)) return;

    const { updatePurchaseStatus } = useClassroomStore.getState();
    const success = await updatePurchaseStatus(purchaseId, status);
    if (success) {
      alert(status === 'approved' ? "Accès à la formation validé avec succès !" : "Demande d'accès rejetée.");
      await loadPendingPayments();
    } else {
      alert("Erreur lors de la mise à jour du statut de l'achat.");
    }
  };

  const handleRequestPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(payoutAmount);
    if (isNaN(amt) || amt <= 0) {
      alert("Le montant doit être supérieur à 0.");
      return;
    }
    const currentBalance = profile?.balance || 0;
    if (amt > currentBalance) {
      alert(`Solde insuffisant. Votre solde actuel est de ${currentBalance}€.`);
      return;
    }
    if (!payoutIban.trim()) {
      alert("Veuillez saisir un IBAN ou Numéro de téléphone (Wero).");
      return;
    }

    setSubmittingPayout(true);
    const { createPayoutRequest } = useClassroomStore.getState();
    const success = await createPayoutRequest(amt, payoutIban.trim());
    setSubmittingPayout(false);
    
    if (success) {
      alert("Votre demande de virement a été enregistrée avec succès. Elle est en attente de traitement par l'administration.");
      setPayoutAmount('');
      await loadPendingPayments();
    }
  };

  const handleAdminUpdatePayoutStatus = async (payoutId: string, status: 'approved' | 'rejected') => {
    const confirmMessage = status === 'approved' 
      ? "Confirmez-vous avoir effectué le virement bancaire sur l'IBAN ou Wero indiqué ?" 
      : "Voulez-vous rejeter cette demande de virement et recréditer le solde du créateur ?";
    
    if (confirm(confirmMessage)) {
      const { adminUpdatePayoutStatus } = useClassroomStore.getState();
      const success = await adminUpdatePayoutStatus(payoutId, status);
      if (success) {
        alert(status === 'approved' ? "Demande validée et marquée comme payée." : "Demande rejetée. Le solde a été remboursé.");
        await loadPendingPayments();
      } else {
        alert("Erreur lors de la mise à jour de la demande.");
      }
    }
  };

  // Sync IBAN default when profile loads
  useEffect(() => {
    if (profile?.iban) {
      setPayoutIban(profile.iban);
    }
  }, [profile]);

  useEffect(() => {
    if (activeTab === 'payments') {
      loadPendingPayments();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'canvases' && isAdmin) {
      const loadCanvasesData = async () => {
        setLoadingCanvases(true);
        const canvasesData = await fetchAllCanvasesAdmin();
        const logsData = await fetchAllAuditLogs();
        setAdminCanvases(canvasesData || []);
        setAdminLogs(logsData || []);
        setLoadingCanvases(false);
      };
      loadCanvasesData();
    }
  }, [activeTab, fetchAllCanvasesAdmin, fetchAllAuditLogs, isAdmin]);

  const handleAdminDeleteCanvas = async (canvasId: string) => {
    if (confirm("Voulez-vous supprimer ce canva au nom de l'administration ?")) {
      const success = await deleteCanvas(canvasId);
      if (success) {
        setAdminCanvases(prev => prev.filter(c => c.id !== canvasId));
        const logsData = await fetchAllAuditLogs();
        setAdminLogs(logsData || []);
      }
    }
  };

  // CRM States
  const [crmSearch, setCrmSearch] = useState('');
  const [filterSub, setFilterSub] = useState<'all' | 'premium' | 'standard'>('all');
  const [filterLevel, setFilterLevel] = useState<'all' | '1' | '2' | '3' | '4'>('all');
  const [filterBan, setFilterBan] = useState<'all' | 'banned' | 'active'>('all');
  const [editingUserXp, setEditingUserXp] = useState<Profile | null>(null);
  const [xpInput, setXpInput] = useState(0);

  // CRM user detail states
  const [selectedCrmUser, setSelectedCrmUser] = useState<Profile | null>(null);
  const [crmUserNotes, setCrmUserNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [activeCrmTab, setActiveCrmTab] = useState<'profile' | 'courses' | 'transactions' | 'publications' | 'logs'>('profile');
  const [crmUserLogs, setCrmUserLogs] = useState<any[]>([]);
  const [loadingCrmUserLogs, setLoadingCrmUserLogs] = useState(false);
  
  // Analytics stats loaded dynamically
  const [crmUserStats, setCrmUserStats] = useState<{ lessons: number; posts: number; comments: number; purchases: any[] } | null>(null);
  const [loadingCrmUserStats, setLoadingCrmUserStats] = useState(false);

  // Expanded CRM client details state
  const [crmUserCoursesProgress, setCrmUserCoursesProgress] = useState<any[]>([]);
  const [crmUserPosts, setCrmUserPosts] = useState<any[]>([]);
  const [crmUserComments, setCrmUserComments] = useState<any[]>([]);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  // Categories States
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [categoryDesc, setCategoryDesc] = useState('');

  // Load selected CRM user stats dynamically
  useEffect(() => {
    if (!selectedCrmUser) {
      setCrmUserStats(null);
      setCrmUserLogs([]);
      setCrmUserCoursesProgress([]);
      setCrmUserPosts([]);
      setCrmUserComments([]);
      return;
    }

    const loadUserStats = async () => {
      setLoadingCrmUserStats(true);
      setLoadingCrmUserLogs(true);
      try {
        // Fetch completed lessons count
        const { count: lessonsCount, error: lessonsError } = await supabase
          .from('lesson_progress')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', selectedCrmUser.id);
        if (lessonsError) throw lessonsError;

        // Fetch posts count
        const { count: postsCount, error: postsError } = await supabase
          .from('posts')
          .select('*', { count: 'exact', head: true })
          .eq('author_id', selectedCrmUser.id);
        if (postsError) throw postsError;

        // Fetch comments count
        const { count: commentsCount, error: commentsError } = await supabase
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .eq('author_id', selectedCrmUser.id);
        if (commentsError) throw commentsError;

        // Fetch course purchases count & details
        const { data: purchasesData, error: purchasesError } = await supabase
          .from('course_purchases')
          .select('id, amount, transfer_reference, status, created_at, courses:course_id (title, owner_id)')
          .eq('user_id', selectedCrmUser.id);
        if (purchasesError) throw purchasesError;

        let userPurchasesList = purchasesData || [];
        if (isCreator) {
          userPurchasesList = userPurchasesList.filter((p: any) => {
            const courseObj = p.courses;
            const ownerId = Array.isArray(courseObj) ? courseObj[0]?.owner_id : courseObj?.owner_id;
            return ownerId === profile?.id;
          });
        }

        setCrmUserStats({
          lessons: lessonsCount || 0,
          posts: postsCount || 0,
          comments: commentsCount || 0,
          purchases: userPurchasesList
        });

        // 1. Fetch detailed course progress (Progression Cours)
        const { data: coursesData } = await supabase
          .from('courses')
          .select('id, title, is_published');
        const { data: modulesData } = await supabase
          .from('modules')
          .select('id, course_id');
        const { data: lessonsData } = await supabase
          .from('lessons')
          .select('id, module_id');
        const { data: progressData } = await supabase
          .from('lesson_progress')
          .select('completed_at, lesson_id, lessons:lesson_id (title, modules:module_id (courses:course_id (title)))')
          .eq('user_id', selectedCrmUser.id);

        const completedLessonIds = new Set(progressData?.map(p => p.lesson_id) || []);
        
        const coursesProgress = (coursesData || []).map(course => {
          const courseModuleIds = (modulesData || [])
            .filter(m => m.course_id === course.id)
            .map(m => m.id);
            
          const courseLessons = (lessonsData || [])
            .filter(l => courseModuleIds.includes(l.module_id));
            
          const totalLessons = courseLessons.length;
          const completedCount = courseLessons.filter(l => completedLessonIds.has(l.id)).length;
          
          return {
            id: course.id,
            title: course.title,
            completedLessons: completedCount,
            totalLessons: totalLessons,
            percent: totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0
          };
        });
        setCrmUserCoursesProgress(coursesProgress);

        // 2. Fetch publications (posts & comments)
        const { data: userPosts } = await supabase
          .from('posts')
          .select('id, title, created_at, likes_count, comments_count, category_id, categories:category_id (name)')
          .eq('author_id', selectedCrmUser.id)
          .order('created_at', { ascending: false });

        const { data: userComments } = await supabase
          .from('comments')
          .select('id, content, created_at, post_id, posts:post_id (title)')
          .eq('author_id', selectedCrmUser.id)
          .order('created_at', { ascending: false });

        setCrmUserPosts(userPosts || []);
        setCrmUserComments(userComments || []);

        // 3. Fetch canvas audit logs
        const { data: canvasLogsData } = await supabase
          .from('canvas_audit_logs')
          .select('action, details, created_at, collaborative_canvases:canvas_id (title)')
          .eq('user_id', selectedCrmUser.id);

        // 4. Fetch payout requests
        const { data: payoutsData } = await supabase
          .from('payout_requests')
          .select('id, amount, status, created_at')
          .eq('user_id', selectedCrmUser.id);

        const logsList: any[] = [];

        if (progressData) {
          progressData.forEach((item: any) => {
            const lessonTitle = Array.isArray(item.lessons) ? item.lessons[0]?.title : item.lessons?.title || 'Leçon';
            const courseTitle = Array.isArray(item.lessons?.modules?.courses) 
              ? item.lessons?.modules?.courses[0]?.title 
              : item.lessons?.modules?.courses?.title || 'Formation';
            logsList.push({
              id: `lesson-${item.completed_at}-${lessonTitle}`,
              type: 'lesson',
              title: `Leçon terminée : ${lessonTitle}`,
              description: `A validé et complété la leçon du cours "${courseTitle}".`,
              date: item.completed_at || new Date().toISOString(),
              badgeColor: 'bg-ios-green-light/10 text-ios-green-light dark:bg-ios-green-dark/20 dark:text-ios-green-dark border-ios-green-light/15'
            });
          });
        }

        if (canvasLogsData) {
          canvasLogsData.forEach((item: any) => {
            const canvasTitle = Array.isArray(item.collaborative_canvases) 
              ? item.collaborative_canvases[0]?.title 
              : item.collaborative_canvases?.title || 'Tableau';
            logsList.push({
              id: `canvas-${item.created_at}-${item.action}`,
              type: 'canvas',
              title: `Coworking : ${item.action}`,
              description: `${item.details} sur le canva "${canvasTitle}".`,
              date: item.created_at,
              badgeColor: 'bg-ios-indigo-light/10 text-ios-indigo-light dark:bg-ios-indigo-dark/20 dark:text-ios-indigo-dark border-ios-indigo-light/15'
            });
          });
        }

        if (payoutsData) {
          payoutsData.forEach((item: any) => {
            logsList.push({
              id: `payout-${item.id}`,
              type: 'payout',
              title: `Demande de virement`,
              description: `A demandé un retrait de ${item.amount} € (Statut: ${item.status === 'approved' ? 'Validé' : item.status === 'pending' ? 'En attente' : 'Rejeté'}).`,
              date: item.created_at,
              status: item.status,
              badgeColor: item.status === 'approved'
                ? 'bg-ios-green-light/10 text-ios-green-light border-ios-green-light/15'
                : item.status === 'pending'
                  ? 'bg-ios-orange-light/10 text-ios-orange-light border-ios-orange-light/15'
                  : 'bg-ios-red-light/10 text-ios-red-light border-ios-red-light/15'
            });
          });
        }

        if (userPurchasesList) {
          userPurchasesList.forEach((item: any) => {
            const courseObj = item.courses;
            const courseTitle = Array.isArray(courseObj) ? courseObj[0]?.title : courseObj?.title || 'Formation';
            logsList.push({
              id: `purchase-${item.id}`,
              type: 'purchase',
              title: `Achat déclaré`,
              description: `Achat déclaré pour "${courseTitle}" (Ref: ${item.transfer_reference}, Statut: ${item.status === 'approved' ? 'Validé' : item.status === 'pending' ? 'Attente' : 'Rejeté'}).`,
              date: item.created_at,
              status: item.status,
              badgeColor: item.status === 'approved'
                ? 'bg-ios-green-light/10 text-ios-green-light border-ios-green-light/15'
                : item.status === 'pending'
                  ? 'bg-ios-orange-light/10 text-ios-orange-light border-ios-orange-light/15'
                  : 'bg-ios-red-light/10 text-ios-red-light border-ios-red-light/15'
            });
          });
        }

        if (userPosts) {
          userPosts.forEach((item: any) => {
            const categoryName = Array.isArray(item.categories) 
              ? item.categories[0]?.name 
              : item.categories?.name || 'Général';
            logsList.push({
              id: `post-${item.id}`,
              type: 'post',
              title: `Nouveau post publié`,
              description: `A publié le post "${item.title}" dans le salon "${categoryName}".`,
              date: item.created_at,
              badgeColor: 'bg-ios-blue-light/10 text-ios-blue-light dark:bg-ios-blue-dark/20 dark:text-ios-blue-dark border-ios-blue-light/15'
            });
          });
        }

        if (userComments) {
          userComments.forEach((item: any) => {
            const postTitle = Array.isArray(item.posts) 
              ? item.posts[0]?.title 
              : item.posts?.title || 'Publication';
            logsList.push({
              id: `comment-${item.id}`,
              type: 'comment',
              title: `Commentaire ajouté`,
              description: `A répondu "${item.content.length > 60 ? item.content.slice(0, 60) + '...' : item.content}" sur le post "${postTitle}".`,
              date: item.created_at,
              badgeColor: 'bg-ios-pink-light/10 text-ios-pink-light dark:bg-ios-pink-dark/20 dark:text-ios-pink-dark border-ios-pink-light/15'
            });
          });
        }

        // Sort by date descending
        logsList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setCrmUserLogs(logsList);

      } catch (e) {
        console.error("Failed to load user CRM stats:", e);
        setCrmUserStats({ lessons: 0, posts: 0, comments: 0, purchases: [] });
        setCrmUserLogs([]);
      } finally {
        setLoadingCrmUserStats(false);
        setLoadingCrmUserLogs(false);
      }
    };

    loadUserStats();
  }, [selectedCrmUser, isCreator, profile?.id]);

  // Fetch initial data
  useEffect(() => {
    fetchProfilesList();
    fetchCategories();
  }, [fetchProfilesList, fetchCategories]);

  // Restrict creator CRM view to students only (role === 'user')
  const baseMembers = isCreator 
    ? profilesList.filter(p => p.role === 'user') 
    : profilesList;

  // CRM Filtering logic
  const filteredMembers = baseMembers.filter(member => {
    // Search filter
    const matchesSearch = 
      member.full_name?.toLowerCase().includes(crmSearch.toLowerCase()) ||
      member.username.toLowerCase().includes(crmSearch.toLowerCase()) ||
      (member.id && member.id.toLowerCase().includes(crmSearch.toLowerCase()));

    // Subscription status filter
    const matchesSub = 
      filterSub === 'all' || 
      (filterSub === 'premium' && member.is_premium) || 
      (filterSub === 'standard' && !member.is_premium);

    // Level filter
    const matchesLevel = 
      filterLevel === 'all' || 
      (filterLevel === '4' && member.level >= 4) ||
      member.level.toString() === filterLevel;

    // Ban status filter
    const matchesBan = 
      filterBan === 'all' || 
      (filterBan === 'banned' && member.is_banned) || 
      (filterBan === 'active' && !member.is_banned);

    return matchesSearch && matchesSub && matchesLevel && matchesBan;
  });

  // Export filtered list to CSV
  const handleExportCSV = () => {
    const headers = ['ID', 'Username', 'FullName', 'Role', 'Level', 'XP', 'IsPremium', 'IsBanned', 'RegistrationDate'];
    
    const rows = filteredMembers.map(m => [
      m.id,
      m.username,
      m.full_name || '',
      m.role,
      m.level.toString(),
      m.xp.toString(),
      m.is_premium ? 'Oui' : 'Non',
      m.is_banned ? 'Oui' : 'Non',
      new Date(m.created_at).toLocaleDateString('fr-FR')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(field => `"${field.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${isCreator ? 'creator' : 'admin'}_crm_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // XP update submit
  const handleSaveXp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserXp) return;
    
    const success = await adminUpdateUserXp(editingUserXp.id, xpInput);
    if (success) {
      setEditingUserXp(null);
      alert('XP de l\'utilisateur mis à jour avec succès !');
    } else {
      alert('Erreur lors de la mise à jour des XP.');
    }
  };

  // Toggle Premium action (Admins only)
  const handleTogglePremium = async (userId: string, currentStatus: boolean) => {
    if (!isAdmin) {
      alert("Seuls les administrateurs de la plateforme peuvent modifier manuellement le statut Premium.");
      return;
    }
    const success = await adminUpdateUserPremiumStatus(userId, !currentStatus);
    if (!success) {
      alert('Erreur lors du changement de statut premium.');
    }
  };

  // Toggle Ban action (Admins only)
  const handleToggleBan = async (userId: string) => {
    if (!isAdmin) {
      alert("Seuls les administrateurs de la plateforme peuvent bannir ou débannir des membres.");
      return;
    }
    if (userId === profile?.id) {
      alert('Vous ne pouvez pas vous bannir vous-même !');
      return;
    }
    const success = await adminToggleUserBan(userId);
    if (!success) {
      alert('Erreur lors du changement de statut de bannissement.');
    }
  };

  // Change Role action (Admins only)
  const handleRoleChange = async (userId: string, newRole: 'user' | 'creator' | 'admin') => {
    if (!isAdmin) return false;
    if (userId === profile?.id) {
      alert('Vous ne pouvez pas modifier votre propre rôle !');
      return false;
    }
    const success = await adminUpdateUserRole(userId, newRole);
    if (success) {
      alert('Rôle mis à jour avec succès !');
      return true;
    } else {
      alert('Erreur de mise à jour du rôle.');
      return false;
    }
  };

  // Add/Edit category submit
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;

    if (editingCategory) {
      const success = await updateCategory(editingCategory.id, {
        name: categoryName,
        description: categoryDesc,
      });
      if (success) {
        setCategoryName('');
        setCategoryDesc('');
        setEditingCategory(null);
        setShowCategoryModal(false);
        alert('Catégorie mise à jour !');
      } else {
        alert('Erreur de mise à jour.');
      }
    } else {
      const success = await createCategory(categoryName, categoryDesc);
      if (success) {
        setCategoryName('');
        setCategoryDesc('');
        setShowCategoryModal(false);
        alert('Catégorie créée avec succès !');
      } else {
        alert('Erreur de création de catégorie.');
      }
    }
  };

  // Delete category action
  const handleDeleteCategory = async (catId: string, catName: string) => {
    if (catId === 'cat-all') {
      alert("La catégorie générale par défaut ne peut pas être supprimée.");
      return;
    }
    if (confirm(`Voulez-vous vraiment supprimer la catégorie "${catName}" ? Les posts associés ne seront plus rattachés.`)) {
      const success = await deleteCategory(catId);
      if (success) {
        alert('Catégorie supprimée.');
      } else {
        alert('Erreur de suppression.');
      }
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Title Dashboard */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Shield className="w-6 h-6 sm:w-8 sm:h-8 text-ios-blue-light dark:text-ios-blue-dark shrink-0" />
            {isCreator ? "Tableau de Bord Créateur" : "Tableau de Bord Admin"}
          </h1>
          <p className="text-sm text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1 font-medium">
            {isCreator 
              ? "Gérez vos étudiants, attribuez des points de participation XP et suivez vos formations en ligne."
              : "Gérez les rôles, les abonnements Stripe, configurez les catégories de forums et accédez aux sauvegardes."}
          </p>
        </div>

        {activeTab === 'crm' && (
          <button 
            onClick={handleExportCSV}
            className="bg-ios-blue-light dark:bg-ios-blue-dark text-white font-bold px-4 py-2.5 rounded-ios-lg text-sm transition shadow-ios-soft active:scale-95 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Exporter CSV
          </button>
        )}
      </div>

      {/* Tabs Layout */}
      {(isAdmin || isCreator) && (
        <div className="flex border-b border-black/10 dark:border-white/5 pb-px gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('crm')}
            className={`px-4 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'crm' 
                ? 'border-ios-blue-light text-ios-blue-light dark:border-ios-blue-dark dark:text-ios-blue-dark' 
                : 'border-transparent text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/5 dark:hover:bg-white/5 rounded-ios-md'
            }`}
          >
            Membres & CRM Clients
          </button>
          <button
            onClick={() => setActiveTab('payments')}
            className={`px-4 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'payments' 
                ? 'border-ios-blue-light text-ios-blue-light dark:border-ios-blue-dark dark:text-ios-blue-dark' 
                : 'border-transparent text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/5 dark:hover:bg-white/5 rounded-ios-md'
            }`}
          >
            Suivi des Ventes 📊
          </button>
          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('rooms')}
                className={`px-4 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === 'rooms' 
                    ? 'border-ios-blue-light text-ios-blue-light dark:border-ios-blue-dark dark:text-ios-blue-dark' 
                    : 'border-transparent text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/5 dark:hover:bg-white/5 rounded-ios-md'
                }`}
              >
                Catégories de Salons
              </button>
              <button
                onClick={() => setActiveTab('stats')}
                className={`px-4 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === 'stats' 
                    ? 'border-ios-blue-light text-ios-blue-light dark:border-ios-blue-dark dark:text-ios-blue-dark' 
                    : 'border-transparent text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/5 dark:hover:bg-white/5 rounded-ios-md'
                }`}
              >
                Sauvegardes & Stats
              </button>
              <button
                onClick={() => setActiveTab('canvases')}
                className={`px-4 py-2 text-sm font-extrabold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === 'canvases' 
                    ? 'border-ios-blue-light text-ios-blue-light dark:border-ios-blue-dark dark:text-ios-blue-dark' 
                    : 'border-transparent text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:bg-black/5 dark:hover:bg-white/5 rounded-ios-md'
                }`}
              >
                Canvases & Logs
              </button>
            </>
          )}
        </div>
      )}

      {/* Tab 1: CRM Workspace */}
      {activeTab === 'crm' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* CRM Dashboard KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-4.5 shadow-ios-soft flex items-center gap-3.5 bg-black/[0.01] dark:bg-white/[0.01]">
              <div className="p-2.5 bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 text-ios-blue-light dark:text-ios-blue-dark rounded-ios-lg">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider">Membres Actifs</span>
                <h4 className="font-extrabold text-xl mt-0.5">{baseMembers.filter(m => !m.is_banned).length}</h4>
              </div>
            </div>

            <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-4.5 shadow-ios-soft flex items-center gap-3.5 bg-black/[0.01] dark:bg-white/[0.01]">
              <div className="p-2.5 bg-ios-indigo-light/10 dark:bg-ios-indigo-dark/15 text-ios-indigo-light dark:text-ios-indigo-dark rounded-ios-lg">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider">Abonnés Premium Pro</span>
                <h4 className="font-extrabold text-xl mt-0.5">{baseMembers.filter(m => m.is_premium).length}</h4>
              </div>
            </div>

            <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-4.5 shadow-ios-soft flex items-center gap-3.5 bg-black/[0.01] dark:bg-white/[0.01]">
              <div className="p-2.5 bg-ios-orange-light/10 dark:bg-ios-orange-dark/15 text-ios-orange-light dark:text-ios-orange-dark rounded-ios-lg">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider">Conversion Premium</span>
                <h4 className="font-extrabold text-xl mt-0.5">
                  {baseMembers.length > 0 
                    ? `${Math.round((baseMembers.filter(m => m.is_premium).length / baseMembers.length) * 100)}%`
                    : '0%'}
                </h4>
              </div>
            </div>

            <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-4.5 shadow-ios-soft flex items-center gap-3.5 bg-black/[0.01] dark:bg-white/[0.01]">
              <div className="p-2.5 bg-ios-green-light/10 dark:bg-ios-green-dark/15 text-ios-green-light dark:text-ios-green-dark rounded-ios-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider">Moyenne XP</span>
                <h4 className="font-extrabold text-xl mt-0.5">
                  {baseMembers.length > 0 
                    ? Math.round(baseMembers.reduce((acc, curr) => acc + curr.xp, 0) / baseMembers.length).toLocaleString('fr-FR')
                    : '0'}
                </h4>
              </div>
            </div>
          </div>
          
          {/* CRM Filters Controls */}
          <div className="glass-panel p-4 rounded-ios-2xl border border-black/5 dark:border-white/5 flex flex-col md:flex-row gap-4 items-center justify-between shadow-ios-soft">
            {/* Search */}
            <div className="relative w-full md:w-80">
              <input 
                type="text" 
                placeholder="Rechercher nom, pseudo, email..." 
                value={crmSearch}
                onChange={(e) => setCrmSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-xl text-xs focus:outline-none focus:ring-1 focus:ring-ios-blue-light backdrop-blur-md"
              />
              <Search className="w-3.5 h-3.5 text-ios-label-secondaryLight/50 absolute left-3 top-3" />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-bold text-ios-label-secondaryLight/70 dark:text-ios-label-secondaryDark/60">Abonnement :</span>
                <select 
                  value={filterSub} 
                  onChange={(e) => setFilterSub(e.target.value as any)}
                  className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-2 py-1 font-semibold outline-none text-xs"
                >
                  <option value="all">Tous</option>
                  <option value="premium">Premium Pro</option>
                  <option value="standard">Standard</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-bold text-ios-label-secondaryLight/70 dark:text-ios-label-secondaryDark/60">Niveau :</span>
                <select 
                  value={filterLevel} 
                  onChange={(e) => setFilterLevel(e.target.value as any)}
                  className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-2 py-1 font-semibold outline-none text-xs"
                >
                  <option value="all">Tous</option>
                  <option value="1">Niveau 1</option>
                  <option value="2">Niveau 2</option>
                  <option value="3">Niveau 3</option>
                  <option value="4">Niveau 4+</option>
                </select>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-bold text-ios-label-secondaryLight/70 dark:text-ios-label-secondaryDark/60">Statut :</span>
                  <select 
                    value={filterBan} 
                    onChange={(e) => setFilterBan(e.target.value as any)}
                    className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-2 py-1 font-semibold outline-none text-xs"
                  >
                    <option value="all">Tous</option>
                    <option value="active">Actif</option>
                    <option value="banned">Banni</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* CRM Client Table Grid */}
          <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-2xl overflow-hidden shadow-ios-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-black/5 dark:border-white/5 text-[11px] font-bold uppercase tracking-wider text-ios-label-secondaryLight/70 dark:text-ios-label-secondaryDark/60 bg-black/[0.02] dark:bg-white/[0.01]">
                    <th className="p-4 pl-6">Client / Membre</th>
                    <th className="p-4">Rôle</th>
                    <th className="p-4">Abonnement</th>
                    <th className="p-4">Niveau / XP</th>
                    <th className="p-4">Statut Compte</th>
                    <th className="p-4 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5 text-xs font-semibold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-ios-label-secondaryLight dark:text-ios-label-secondaryDark italic">
                        Aucun membre ne correspond à vos critères de recherche.
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((member) => (
                      <tr 
                        key={member.id} 
                        onClick={() => {
                          setSelectedCrmUser(member);
                          setCrmUserNotes(member.crm_notes || '');
                          setActiveCrmTab('profile');
                        }}
                        className={`hover:bg-black/[0.02] dark:hover:bg-white/[0.02] cursor-pointer transition ${
                          member.is_banned ? 'opacity-60 bg-ios-red-light/5' : ''
                        }`}
                      >
                        <td className="p-4 pl-6 flex items-center gap-3">
                          {member.avatar_url ? (
                            <img src={member.avatar_url} alt={member.username} className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 flex items-center justify-center font-bold text-ios-blue-light dark:text-ios-blue-dark">
                              {member.username[0].toUpperCase()}
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className="font-extrabold text-ios-label-primaryLight dark:text-white">
                              {member.full_name || member.username}
                            </span>
                            <span className="text-[10px] text-ios-label-secondaryLight/60">@{member.username}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          {isAdmin && member.id !== profile?.id ? (
                            <select
                              onClick={(e) => e.stopPropagation()}
                              value={member.role}
                              onChange={(e) => handleRoleChange(member.id, e.target.value as any)}
                              className="bg-black/5 dark:bg-white/10 dark:text-white border border-black/10 dark:border-white/5 rounded px-2 py-0.5 font-bold text-[10px] outline-none"
                            >
                              <option value="user">Membre</option>
                              <option value="creator">Créateur</option>
                              <option value="admin">Admin</option>
                            </select>
                          ) : (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              member.role === 'admin' 
                                ? 'bg-ios-pink-light/10 text-ios-pink-light dark:bg-ios-pink-dark/15 dark:text-ios-pink-dark' 
                                : member.role === 'creator'
                                  ? 'bg-ios-blue-light/10 text-ios-blue-light dark:bg-ios-blue-dark/20 dark:text-ios-blue-dark'
                                  : 'bg-black/5 dark:bg-white/5 text-ios-label-secondaryLight'
                            }`}>
                              {member.role === 'admin' ? 'Admin' : member.role === 'creator' ? 'Créateur' : 'Membre'}
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          {isAdmin ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTogglePremium(member.id, member.is_premium);
                              }}
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold transition-all border ${
                                member.is_premium 
                                  ? 'bg-gradient-to-r from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark text-white border-transparent shadow-ios-soft' 
                                  : 'bg-black/5 dark:bg-white/5 border-transparent text-ios-label-secondaryLight hover:bg-black/10 dark:hover:bg-white/10'
                              }`}
                              title="Changer le statut Premium"
                            >
                              {member.is_premium ? 'PRO ACTIVE' : 'STANDARD'}
                            </button>
                          ) : (
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border border-transparent ${
                              member.is_premium 
                                ? 'bg-gradient-to-r from-ios-blue-light to-ios-indigo-light dark:from-ios-blue-dark dark:to-ios-indigo-dark text-white shadow-ios-soft' 
                                : 'bg-black/5 dark:bg-white/5 text-ios-label-secondaryLight'
                            }`}>
                              {member.is_premium ? 'PRO ACTIVE' : 'STANDARD'}
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold">Niv. {member.level}</span>
                            <span className="text-[10px] text-ios-label-secondaryLight/60">{member.xp} XP total</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold ${
                            member.is_banned 
                              ? 'text-ios-red-light dark:text-ios-red-dark' 
                              : 'text-ios-green-light dark:text-ios-green-dark'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${member.is_banned ? 'bg-ios-red-light' : 'bg-ios-green-light animate-pulse'}`}></span>
                            {member.is_banned ? 'BANNI' : 'ACTIF'}
                          </span>
                        </td>
                        <td className="p-4 pr-6 text-right">
                          <div className="flex justify-end gap-2">
                            {/* Update XP Button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingUserXp(member);
                                setXpInput(member.xp);
                              }}
                              className="p-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full text-ios-blue-light dark:text-ios-blue-dark transition-all"
                              title="Assigner des XP"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Ban Toggle Button (Admins only) */}
                            {isAdmin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleBan(member.id);
                                }}
                                className={`p-1.5 rounded-full transition-all ${
                                  member.is_banned 
                                    ? 'bg-ios-green-light/10 text-ios-green-light hover:bg-ios-green-light/20' 
                                    : 'bg-ios-red-light/10 text-ios-red-light hover:bg-ios-red-light/20'
                                }`}
                                title={member.is_banned ? 'Débannir' : 'Bannir'}
                              >
                                {member.is_banned ? <UserCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Rooms Customization (Community Categories) */}
      {activeTab === 'rooms' && isAdmin && (
        <div className="space-y-6 animate-fade-in">
          
          <div className="flex justify-between items-center bg-black/5 dark:bg-white/5 p-4 rounded-ios-xl border border-black/5 dark:border-white/5">
            <div>
              <h3 className="font-extrabold text-sm uppercase tracking-wider text-ios-blue-light dark:text-ios-blue-dark">Salons de discussion</h3>
              <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1">
                Créez de nouvelles catégories thématiques pour segmenter les forums d'échange.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingCategory(null);
                setCategoryName('');
                setCategoryDesc('');
                setShowCategoryModal(true);
              }}
              className="bg-ios-blue-light dark:bg-ios-blue-dark text-white text-xs font-bold px-3 py-2 rounded-ios-lg shadow-ios-glow flex items-center gap-1.5 hover:opacity-95"
            >
              <FolderPlus className="w-4 h-4" />
              Créer une catégorie
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map((cat) => (
              <div 
                key={cat.id}
                className="glass-panel p-5 rounded-ios-xl border border-black/5 dark:border-white/5 flex justify-between gap-4 items-start shadow-ios-soft hover:shadow-ios-soft/80 transition"
              >
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm">{cat.name}</span>
                    <span className="text-[10px] font-mono text-ios-label-secondaryLight/60 bg-black/5 px-2 py-0.5 rounded-full truncate">
                      slug: {cat.slug}
                    </span>
                  </div>
                  <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-medium leading-relaxed">
                    {cat.description || "Aucune description de salon spécifiée."}
                  </p>
                </div>

                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      setEditingCategory(cat);
                      setCategoryName(cat.name);
                      setCategoryDesc(cat.description || '');
                      setShowCategoryModal(true);
                    }}
                    className="p-2 bg-black/5 dark:bg-white/5 text-ios-blue-light hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-all"
                    title="Modifier la catégorie"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteCategory(cat.id, cat.name)}
                    className="p-2 bg-ios-red-light/10 text-ios-red-light hover:bg-ios-red-light/20 rounded-full transition-all"
                    title="Supprimer la catégorie"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* Tab 3: Stats & Backup Details */}
      {activeTab === 'stats' && isAdmin && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Stats Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Total Members */}
            <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-5 shadow-ios-soft flex items-center gap-4">
              <div className="p-3 bg-ios-blue-light/10 dark:bg-ios-blue-dark/15 text-ios-blue-light dark:text-ios-blue-dark rounded-ios-lg">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider">Membres</span>
                <h3 className="font-extrabold text-2xl mt-0.5">{profilesList.length}</h3>
              </div>
            </div>

            {/* Total categories */}
            <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-5 shadow-ios-soft flex items-center gap-4">
              <div className="p-3 bg-ios-indigo-light/10 dark:bg-ios-indigo-dark/15 text-ios-indigo-light dark:text-ios-indigo-dark rounded-ios-lg">
                <MessageSquare className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider">Salons de discussion</span>
                <h3 className="font-extrabold text-2xl mt-0.5">{categories.length}</h3>
              </div>
            </div>

            {/* Premium Subscribers count */}
            <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-5 shadow-ios-soft flex items-center gap-4">
              <div className="p-3 bg-ios-green-light/10 dark:bg-ios-green-dark/15 text-ios-green-light dark:text-ios-green-dark rounded-ios-lg">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider">Abonnés Premium Pro</span>
                <h3 className="font-extrabold text-2xl mt-0.5">
                  {profilesList.filter(p => p.is_premium).length}
                </h3>
              </div>
            </div>

            {/* Total level XP cumulative */}
            <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-5 shadow-ios-soft flex items-center gap-4">
              <div className="p-3 bg-ios-orange-light/10 dark:bg-ios-orange-dark/15 text-ios-orange-light dark:text-ios-orange-dark rounded-ios-lg">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark uppercase tracking-wider">XP Total Cumulé</span>
                <h3 className="font-extrabold text-2xl mt-0.5">
                  {profilesList.reduce((acc, curr) => acc + curr.xp, 0).toLocaleString('fr-FR')}
                </h3>
              </div>
            </div>

          </div>

          {/* Backup Database details */}
          <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-6 shadow-ios-soft flex flex-col sm:flex-row items-start gap-4 bg-ios-orange-light/5 dark:bg-ios-orange-dark/5">
            <div className="p-2.5 bg-ios-orange-light/10 dark:bg-ios-orange-dark/15 text-ios-orange-light dark:text-ios-orange-dark rounded-ios-lg">
              <Database className="w-5 h-5" />
            </div>
            <div className="space-y-2 flex-grow">
              <h4 className="font-extrabold text-sm text-ios-orange-light dark:text-ios-orange-dark">
                Sécurité & Restauration de Base de Données
              </h4>
              <p className="text-xs leading-relaxed text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                Pour effectuer des exports ou des restaurations complètes en ligne de commande :
              </p>
              <div className="bg-black/20 dark:bg-black/60 p-3.5 rounded-ios-lg font-mono text-[10px] text-ios-label-primaryDark overflow-x-auto border border-white/5 space-y-1">
                <div># Exporter les tables Postgres en fichier dump compressé</div>
                <div className="text-ios-blue-light dark:text-ios-blue-dark">$ pg_dump -h db.eoodcrcmqpovqpzilrik.supabase.co -U postgres -F c -b -v -f backup.dump</div>
                <div className="pt-2"># Restaurer le fichier dump vers l'instance Supabase</div>
                <div className="text-ios-blue-light dark:text-ios-blue-dark">$ pg_restore -h db.eoodcrcmqpovqpzilrik.supabase.co -U postgres -d postgres -v backup.dump</div>
              </div>
              <p className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark italic pt-1">
                Remarque : Les politiques RLS (Row Level Security) et les structures de clés étrangères sont préservées lors des dumps.
              </p>
            </div>
          </div>

        </div>
      )}

      {/* Tab 4: Canvases Mod & Platform Audit Logs */}
      {activeTab === 'canvases' && isAdmin && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Canvases Moderation List */}
            <div className="lg:col-span-7 glass-panel p-5 border border-black/5 dark:border-white/5 rounded-ios-2xl shadow-ios-soft space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="font-extrabold text-base flex items-center gap-2">
                  <FileText className="w-5 h-5 text-ios-blue-light" /> Documents de la plateforme
                </h3>
                
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-label-secondaryLight/50" />
                  <input
                    type="text"
                    placeholder="Rechercher un document..."
                    value={canvasSearch}
                    onChange={(e) => setCanvasSearch(e.target.value)}
                    className="glass-input pl-9 pr-4 py-2 text-xs rounded-ios-md font-medium"
                  />
                </div>
              </div>

              {loadingCanvases ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <div className="w-6 h-6 border-2 border-ios-blue-light border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs text-ios-label-secondaryLight">Chargement des documents...</span>
                </div>
              ) : adminCanvases.length === 0 ? (
                <p className="text-xs text-ios-label-secondaryLight/60 italic text-center py-8">
                  Aucun canva créé sur la plateforme.
                </p>
              ) : (
                <div className="overflow-x-auto border border-black/5 dark:border-white/5 rounded-ios-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-black/5 dark:bg-white/5 border-b border-black/5 dark:border-white/5 text-[10px] uppercase font-bold tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                        <th className="p-4 pl-6">Document</th>
                        <th className="p-4">Créateur</th>
                        <th className="p-4">Créé le</th>
                        <th className="p-4 pr-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 dark:divide-white/5 text-xs">
                      {adminCanvases
                        .filter(c => c.title.toLowerCase().includes(canvasSearch.toLowerCase()))
                        .map((canvas) => (
                          <tr key={canvas.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition duration-150">
                            <td className="p-4 pl-6 font-bold text-ios-label-primaryLight dark:text-white">
                              {canvas.title}
                            </td>
                            <td className="p-4 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark font-medium">
                              @{canvas.creator?.username}
                            </td>
                            <td className="p-4 text-ios-label-secondaryLight/60 dark:text-ios-label-secondaryDark/50 font-mono text-[10px]">
                              {new Date(canvas.created_at).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="p-4 pr-6 text-right">
                              <button
                                onClick={() => handleAdminDeleteCanvas(canvas.id)}
                                className="p-1.5 hover:bg-ios-pink-light/10 text-ios-pink-light dark:hover:bg-ios-pink-dark/15 rounded transition"
                                title="Supprimer le document"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Platform Audit Logs */}
            <div className="lg:col-span-5 glass-panel p-5 border border-black/5 dark:border-white/5 rounded-ios-2xl shadow-ios-soft space-y-4">
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <Clock className="w-5 h-5 text-ios-indigo-light" /> Flux d'activité Plateforme (Audit)
              </h3>
              
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1.5 divide-y divide-black/5 dark:divide-white/5">
                {loadingCanvases ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 animate-pulse">
                    <span className="text-xs text-ios-label-secondaryLight">Chargement des logs...</span>
                  </div>
                ) : adminLogs.length === 0 ? (
                  <p className="text-xs text-ios-label-secondaryLight/60 italic text-center py-8">
                    Aucun log d'activité disponible.
                  </p>
                ) : (
                  adminLogs.map((log) => (
                    <div key={log.id} className="pt-2.5 first:pt-0 flex flex-col gap-0.5">
                      <p className="text-xs text-ios-label-primaryLight dark:text-ios-label-primaryDark leading-normal font-medium">
                        {log.details}
                      </p>
                      <div className="flex justify-between items-center text-[9px] text-ios-label-secondaryLight/60 dark:text-ios-label-secondaryDark/50 font-medium">
                        <span>@{log.user?.username}</span>
                        <span>
                          {new Date(log.created_at).toLocaleString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
          </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div className="space-y-8 animate-fade-in text-left">
          {/* Header */}
          <div className="flex justify-between items-center bg-black/5 dark:bg-white/5 p-5 rounded-ios-xl border border-black/5">
            <div>
              <h2 className="text-xl font-extrabold flex items-center gap-2">
                💰 Portefeuille & Suivi des Ventes
              </h2>
              <p className="text-xs text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1 font-medium">
                Gérez vos gains cumulés, demandez vos virements bancaires, et suivez l'activité des ventes de vos formations en temps réel.
              </p>
            </div>
            <button
              onClick={loadPendingPayments}
              disabled={loadingPayments}
              className="p-2.5 bg-black/5 dark:bg-white/5 rounded-full hover:bg-black/10 transition"
              title="Rafraîchir"
            >
              {loadingPayments ? (
                <div className="w-5 h-5 border-2 border-ios-blue-light border-t-transparent rounded-full animate-spin" />
              ) : (
                "🔄"
              )}
            </button>
          </div>

          {/* Solde & Retraits Section for Creators & Admins */}
          {(isCreator || isAdmin) && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Solde Card & Request Payout Form */}
              <div className="md:col-span-5 flex flex-col gap-6">
                <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-2xl p-6 shadow-ios-soft bg-gradient-to-br from-ios-blue-light/10 to-indigo-600/5 dark:from-ios-blue-dark/20 dark:to-indigo-500/10 animate-scale-in">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                    Solde disponible sur la plateforme
                  </span>
                  <div className="text-4xl font-black mt-2 text-transparent bg-clip-text bg-gradient-to-r from-ios-blue-light to-indigo-600 dark:from-ios-blue-dark dark:to-indigo-400">
                    {profile?.balance || 0} €
                  </div>
                  <p className="text-[10px] text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-2 font-medium">
                    Cet argent provient des ventes réelles de vos formations par carte bancaire. Vous pouvez demander son virement vers votre IBAN à tout moment.
                  </p>
                </div>

                {/* Form to Request Payout */}
                <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-5 shadow-ios-soft">
                  <h3 className="font-extrabold text-sm uppercase tracking-wider mb-4 text-ios-blue-light dark:text-ios-blue-dark">
                    Demander un Virement (IBAN / Wero)
                  </h3>
                  <form onSubmit={handleRequestPayout} className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark block">
                        Montant du virement (€)
                      </label>
                      <input 
                        type="number"
                        min="1"
                        step="1"
                        required
                        disabled={submittingPayout || (profile?.balance || 0) <= 0}
                        placeholder="Montant en euros..."
                        value={payoutAmount}
                        onChange={(e) => setPayoutAmount(e.target.value)}
                        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark block">
                        IBAN de destination ou Numéro (Wero)
                      </label>
                      <input 
                        type="text"
                        required
                        disabled={submittingPayout || (profile?.balance || 0) <= 0}
                        placeholder="FR76 3000... ou +33 6..."
                        value={payoutIban}
                        onChange={(e) => setPayoutIban(e.target.value)}
                        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light font-mono"
                      />
                    </div>

                    <button 
                      type="submit"
                      disabled={submittingPayout || (profile?.balance || 0) <= 0 || !payoutAmount}
                      className="w-full py-2.5 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-xs font-bold shadow-ios-glow hover:opacity-95 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {submittingPayout ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Traitement...
                        </>
                      ) : (
                        "Demander le virement"
                      )}
                    </button>
                  </form>
                </div>
              </div>

              {/* Creator Payout Requests History */}
              <div className="md:col-span-7">
                <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-2xl p-5 shadow-ios-soft h-full flex flex-col justify-between">
                  <div className="w-full">
                    <h3 className="font-extrabold text-sm text-ios-label-primaryLight dark:text-ios-label-primaryDark uppercase tracking-wider mb-4">
                      Historique des Demandes de Retrait
                    </h3>

                    {payoutRequests.length === 0 ? (
                      <p className="text-xs italic text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-center py-12">
                        Aucune demande de virement enregistrée.
                      </p>
                    ) : (
                      <div className="overflow-x-auto max-h-[300px]">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="border-b border-black/10 dark:border-white/5 text-[9px] uppercase font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark pb-2">
                              <th className="pb-2 pr-2">Date</th>
                              <th className="pb-2 pr-2">Montant</th>
                              <th className="pb-2 pr-2">IBAN</th>
                              <th className="pb-2 text-right">Statut</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black/5 dark:divide-white/5">
                            {payoutRequests.map((req) => (
                              <tr key={req.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                                <td className="py-2.5 pr-2 text-ios-label-secondaryLight">{new Date(req.created_at).toLocaleDateString('fr-FR')}</td>
                                <td className="py-2.5 pr-2 font-bold text-ios-blue-light dark:text-ios-blue-dark">{req.amount}€</td>
                                <td className="py-2.5 pr-2 font-mono text-[10px] text-ellipsis overflow-hidden max-w-[120px]" title={req.iban}>{req.iban}</td>
                                <td className="py-2.5 text-right">
                                  {req.status === 'pending' && (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-ios-orange-light/10 text-ios-orange-light border border-ios-orange-light/20">
                                      En attente
                                    </span>
                                  )}
                                  {req.status === 'approved' && (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-ios-green-light/10 text-ios-green-light border border-ios-green-light/20">
                                      Payé
                                    </span>
                                  )}
                                  {req.status === 'rejected' && (
                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-ios-red-light/10 text-ios-red-light border border-ios-red-light/20">
                                      Rejeté
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Admin Platform Payouts Dashboard */}
          {isAdmin && (
            <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-2xl p-5 shadow-ios-soft space-y-4">
              <h3 className="font-extrabold text-sm text-ios-red-light dark:text-ios-red-dark uppercase tracking-wider">
                🛡️ Administration - Demandes de retrait en attente (Virements à effectuer)
              </h3>

              {adminPayoutRequests.length === 0 ? (
                <p className="text-xs italic text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-center py-6">
                  Aucune demande de virement en attente sur la plateforme.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-black/10 dark:border-white/5 text-[9px] uppercase font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                        <th className="pb-3 pr-3">Créateur</th>
                        <th className="pb-3 pr-3">Montant</th>
                        <th className="pb-3 pr-3">IBAN de destination</th>
                        <th className="pb-3 pr-3">Date de demande</th>
                        <th className="pb-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 dark:divide-white/5">
                      {adminPayoutRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                          <td className="py-3 pr-3">
                            <span className="font-bold block text-sm leading-tight">
                              {req.profiles?.full_name || req.profiles?.username}
                            </span>
                            <span className="block text-[9px] text-ios-label-secondaryLight font-mono">@{req.profiles?.username}</span>
                          </td>
                          <td className="py-3 pr-3 font-bold text-sm text-ios-blue-light dark:text-ios-blue-dark">{req.amount}€</td>
                          <td className="py-3 pr-3 font-mono text-[10px] select-all bg-black/5 dark:bg-white/5 p-1.5 rounded">{req.iban}</td>
                          <td className="py-3 pr-3 text-ios-label-secondaryLight">{new Date(req.created_at).toLocaleString('fr-FR')}</td>
                          <td className="py-3 text-right">
                            {req.status === 'pending' ? (
                              <div className="flex gap-2 justify-end">
                                <button 
                                  onClick={() => handleAdminUpdatePayoutStatus(req.id, 'rejected')}
                                  className="px-2.5 py-1 bg-ios-red-light/10 text-ios-red-light hover:bg-ios-red-light/20 rounded-ios-lg font-bold transition text-[10px]"
                                >
                                  Rejeter
                                </button>
                                <button 
                                  onClick={() => handleAdminUpdatePayoutStatus(req.id, 'approved')}
                                  className="px-2.5 py-1 bg-ios-green-light text-white hover:opacity-90 rounded-ios-lg font-bold transition text-[10px] shadow-ios-soft"
                                >
                                  Marquer Payé ✓
                                </button>
                              </div>
                            ) : (
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${
                                req.status === 'approved' 
                                  ? 'bg-ios-green-light/10 text-ios-green-light border border-ios-green-light/20' 
                                  : 'bg-ios-red-light/10 text-ios-red-light border border-ios-red-light/20'
                              }`}>
                                {req.status === 'approved' ? 'Payé' : 'Rejeté'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Active Sales/Unlocks Tracking */}
          <div className="glass-panel border border-black/5 dark:border-white/5 rounded-ios-xl p-5 shadow-ios-soft space-y-4">
            <h3 className="font-extrabold text-sm text-ios-green-light uppercase tracking-wider">
              Historique des Ventes de Formations
            </h3>

            {pendingPurchases.length === 0 ? (
              <p className="text-xs italic text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-center py-6">
                Aucun achat de formation enregistré pour le moment.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-black/10 dark:border-white/5 text-[10px] uppercase font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                      <th className="pb-3 pr-4">Membre</th>
                      <th className="pb-3 pr-4">Formation</th>
                      <th className="pb-3 pr-4">Référence Virement</th>
                      <th className="pb-3 pr-4">Montant</th>
                      <th className="pb-3 pr-4">Date d'achat</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5">
                    {[...pendingPurchases]
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((p) => (
                        <tr key={p.id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                          <td className="py-3.5 pr-4">
                            <span className="font-bold block leading-tight">
                              {p.profiles?.full_name || p.profiles?.username}
                            </span>
                            <span className="block text-[10px] text-ios-label-secondaryLight font-medium font-mono">@{p.profiles?.username}</span>
                          </td>
                          <td className="py-3.5 pr-4 font-semibold text-xs leading-normal">{p.courses?.title}</td>
                          <td className="py-3.5 pr-4 font-mono text-[10px] text-ios-blue-light dark:text-ios-blue-dark max-w-[150px] truncate select-all" title={p.transfer_reference}>{p.transfer_reference}</td>
                          <td className="py-3.5 pr-4 font-bold text-ios-green-light dark:text-ios-green-dark">{p.amount}€</td>
                          <td className="py-3.5 pr-4 text-xs text-ios-label-secondaryLight">{new Date(p.created_at).toLocaleString('fr-FR')}</td>
                          <td className="py-3.5 text-right font-medium">
                            {p.status === 'approved' && (
                              <span className="inline-flex px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-ios-green-light/10 text-ios-green-light dark:bg-ios-green-dark/20 dark:text-ios-green-dark border border-ios-green-light/20">
                                Validé ✓
                              </span>
                            )}
                            {p.status === 'rejected' && (
                              <span className="inline-flex px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-ios-red-light/10 text-ios-red-light dark:bg-ios-red-dark/20 dark:text-ios-red-dark border border-ios-red-light/20">
                                Rejeté ✗
                              </span>
                            )}
                            {p.status === 'pending' && (
                              <div className="flex gap-2 justify-end">
                                <button 
                                  onClick={() => handleUpdatePurchaseStatus(p.id, 'rejected')}
                                  className="px-2.5 py-1 bg-ios-red-light/10 text-ios-red-light hover:bg-ios-red-light/20 rounded-ios-lg font-bold transition text-[10px]"
                                >
                                  Rejeter
                                </button>
                                <button 
                                  onClick={() => handleUpdatePurchaseStatus(p.id, 'approved')}
                                  className="px-2.5 py-1 bg-ios-green-light text-white hover:opacity-90 rounded-ios-lg font-bold transition text-[10px] shadow-ios-soft"
                                >
                                  Valider ✓
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CRM XP Edit Modal Dialog */}
      {editingUserXp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-sm p-6 rounded-ios-2xl border border-black/5 dark:border-white/5 shadow-ios-strong animate-fade-in flex flex-col gap-4">
            <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/5">
              <h3 className="text-base font-extrabold flex items-center gap-1.5">
                ⚡ Assigner des XP
              </h3>
              <button 
                onClick={() => setEditingUserXp(null)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveXp} className="space-y-4">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark block">
                  Utilisateur : <strong>@{editingUserXp.username}</strong>
                </span>
                <span className="text-[11px] font-semibold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark block">
                  Niveau actuel : Niv. {editingUserXp.level} ({editingUserXp.xp} XP)
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark block">Total des points XP</label>
                <input 
                  type="number" 
                  min="0"
                  required
                  value={xpInput}
                  onChange={(e) => setXpInput(parseInt(e.target.value) || 0)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button 
                  type="button"
                  onClick={() => setEditingUserXp(null)}
                  className="flex-1 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-ios-xl text-xs font-bold transition"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-xs font-bold shadow-ios-glow hover:opacity-95 transition"
                >
                  Sauvegarder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Detailed CRM Member Modal */}
      {selectedCrmUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-2xl rounded-ios-2xl border border-black/5 dark:border-white/5 shadow-ios-strong overflow-hidden animate-scale-in flex flex-col">
            
            {/* Header */}
            <div className="p-5 border-b border-black/5 dark:border-white/5 flex justify-between items-center bg-black/5 dark:bg-white/5">
              <h3 className="font-extrabold text-base flex items-center gap-2">
                👤 Fiche CRM Client : {selectedCrmUser.full_name || selectedCrmUser.username}
              </h3>
              <button 
                onClick={() => setSelectedCrmUser(null)} 
                className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Switched Header */}
            <div className="flex px-6 border-b border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 gap-2 sm:gap-4 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveCrmTab('profile')}
                className={`py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeCrmTab === 'profile'
                    ? 'border-ios-blue-light text-ios-blue-light dark:border-ios-blue-dark dark:text-ios-blue-dark'
                    : 'border-transparent text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-label-primaryLight dark:hover:text-white'
                }`}
              >
                👤 Profil & Notes
              </button>
              <button
                type="button"
                onClick={() => setActiveCrmTab('courses')}
                className={`py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeCrmTab === 'courses'
                    ? 'border-ios-blue-light text-ios-blue-light dark:border-ios-blue-dark dark:text-ios-blue-dark'
                    : 'border-transparent text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-label-primaryLight dark:hover:text-white'
                }`}
              >
                🎓 Progression Cours
              </button>
              <button
                type="button"
                onClick={() => setActiveCrmTab('transactions')}
                className={`py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeCrmTab === 'transactions'
                    ? 'border-ios-blue-light text-ios-blue-light dark:border-ios-blue-dark dark:text-ios-blue-dark'
                    : 'border-transparent text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-label-primaryLight dark:hover:text-white'
                }`}
              >
                🛍️ Transactions
              </button>
              <button
                type="button"
                onClick={() => setActiveCrmTab('publications')}
                className={`py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeCrmTab === 'publications'
                    ? 'border-ios-blue-light text-ios-blue-light dark:border-ios-blue-dark dark:text-ios-blue-dark'
                    : 'border-transparent text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-label-primaryLight dark:hover:text-white'
                }`}
              >
                📝 Publications
              </button>
              <button
                type="button"
                onClick={() => setActiveCrmTab('logs')}
                className={`py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeCrmTab === 'logs'
                    ? 'border-ios-blue-light text-ios-blue-light dark:border-ios-blue-dark dark:text-ios-blue-dark'
                    : 'border-transparent text-ios-label-secondaryLight dark:text-ios-label-secondaryDark hover:text-ios-label-primaryLight dark:hover:text-white'
                }`}
              >
                📜 Activité & Logs
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh] flex-grow">
              
              {/* Profile Card Summary */}
              <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start p-4 bg-black/5 dark:bg-white/5 rounded-ios-xl border border-black/5 dark:border-white/5 text-left">
                {selectedCrmUser.avatar_url ? (
                  <img src={selectedCrmUser.avatar_url} alt={selectedCrmUser.username} className="w-16 h-16 rounded-full object-cover border-2 border-ios-blue-light" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-ios-blue-light/10 dark:bg-ios-blue-dark/20 flex items-center justify-center text-2xl font-bold text-ios-blue-light dark:text-ios-blue-dark border-2 border-ios-blue-light">
                    {selectedCrmUser.username[0].toUpperCase()}
                  </div>
                )}
                
                <div className="flex-grow text-center sm:text-left space-y-1">
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                    <span className="font-extrabold text-lg text-ios-label-primaryLight dark:text-white">
                      {selectedCrmUser.full_name || selectedCrmUser.username}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                      selectedCrmUser.role === 'admin' 
                        ? 'bg-ios-pink-light/10 text-ios-pink-light dark:bg-ios-pink-dark/15 dark:text-ios-pink-dark' 
                        : selectedCrmUser.role === 'creator'
                          ? 'bg-ios-blue-light/10 text-ios-blue-light dark:bg-ios-blue-dark/20 dark:text-ios-blue-dark'
                          : 'bg-black/5 dark:bg-white/5 text-ios-label-secondaryLight'
                    }`}>
                      {selectedCrmUser.role === 'admin' ? 'Admin' : selectedCrmUser.role === 'creator' ? 'Créateur' : 'Membre'}
                    </span>
                    {selectedCrmUser.is_premium && (
                      <span className="text-[9px] font-extrabold bg-gradient-to-r from-ios-blue-light to-ios-indigo-light text-white px-2 py-0.5 rounded-full shadow-ios-soft">
                        PRO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ios-label-secondaryLight">Pseudonyme : @{selectedCrmUser.username}</p>
                  <p className="text-xs text-ios-label-secondaryLight">ID Compte : <code className="font-mono text-[10px] select-all bg-black/5 px-1 py-0.5 rounded">{selectedCrmUser.id}</code></p>
                  <p className="text-xs text-ios-label-secondaryLight">Inscription : {new Date(selectedCrmUser.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                </div>
              </div>

              {/* Tab Content 1: PROFILE & NOTES */}
              {activeCrmTab === 'profile' && (
                <div className="space-y-6">
                  {/* Dynamic Stats Row */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-ios-xl p-3.5 text-center space-y-1">
                      <span className="text-[9px] uppercase font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Cours validés</span>
                      <p className="font-extrabold text-lg">
                        {loadingCrmUserStats ? '...' : crmUserStats?.lessons || 0}
                      </p>
                    </div>
                    <div className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-ios-xl p-3.5 text-center space-y-1">
                      <span className="text-[9px] uppercase font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Posts Forum</span>
                      <p className="font-extrabold text-lg">
                        {loadingCrmUserStats ? '...' : crmUserStats?.posts || 0}
                      </p>
                    </div>
                    <div className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-ios-xl p-3.5 text-center space-y-1">
                      <span className="text-[9px] uppercase font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Commentaires</span>
                      <p className="font-extrabold text-lg">
                        {loadingCrmUserStats ? '...' : crmUserStats?.comments || 0}
                      </p>
                    </div>
                  </div>

                  {/* Contact details */}
                  <div className="space-y-2 text-left">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Informations de contact</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Phone */}
                      <div className="p-3 bg-black/5 dark:bg-white/5 rounded-ios-xl border border-black/5 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-ios-blue-light" />
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-ios-label-secondaryLight">Téléphone</span>
                            <span className="text-xs font-semibold">{selectedCrmUser.phone || 'Non renseigné'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Messagerie */}
                      <div className="p-3 bg-black/5 dark:bg-white/5 rounded-ios-xl border border-black/5 dark:border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-ios-indigo-light" />
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-ios-label-secondaryLight">Messagerie</span>
                            <span className="text-xs font-semibold">@{selectedCrmUser.username}</span>
                          </div>
                        </div>
                        <Link
                          to="/messages"
                          state={{ startWith: selectedCrmUser }}
                          onClick={() => setSelectedCrmUser(null)}
                          className="px-2.5 py-1.5 bg-ios-indigo-light/10 text-ios-indigo-light hover:bg-ios-indigo-light/20 text-[10px] font-bold rounded-ios-md transition"
                        >
                          Message
                        </Link>
                      </div>
                    </div>
                  </div>

                  {/* Private CRM Coaching Notes */}
                  <div className="space-y-2 text-left">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-1.5">
                      📝 Notes de suivi coaching privées
                    </h4>
                    <textarea
                      rows={4}
                      value={crmUserNotes}
                      onChange={(e) => setCrmUserNotes(e.target.value)}
                      placeholder="Inscrivez les notes de suivi coaching, les objectifs à atteindre ou les remarques importantes sur cet étudiant..."
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-ios-blue-light resize-none font-medium text-ios-label-primaryLight dark:text-white"
                    />
                    <div className="flex justify-end">
                      <button
                        disabled={savingNotes}
                        onClick={async () => {
                          setSavingNotes(true);
                          const success = await adminUpdateCrmNotes(selectedCrmUser.id, crmUserNotes);
                          setSavingNotes(false);
                          if (success) {
                            alert("Notes de coaching enregistrées avec succès !");
                            setSelectedCrmUser(prev => prev ? { ...prev, crm_notes: crmUserNotes } : null);
                          } else {
                            alert("Erreur lors de la sauvegarde des notes.");
                          }
                        }}
                        className="bg-ios-blue-light dark:bg-ios-blue-dark text-white text-xs font-bold px-3 py-2 rounded-ios-lg shadow-ios-soft hover:opacity-95 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        {savingNotes ? 'Enregistrement...' : 'Enregistrer les notes'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Content: COURSES PROGRESSION */}
              {activeCrmTab === 'courses' && (
                <div className="space-y-4 text-left animate-fade-in">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-ios-blue-light" />
                    Progression de l'étudiant par formation
                  </h4>

                  {crmUserCoursesProgress.length === 0 ? (
                    <div className="p-4 bg-black/5 dark:bg-white/5 rounded-ios-xl border border-black/5 text-center text-xs italic text-ios-label-secondaryLight">
                      Aucune formation disponible sur la plateforme.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {crmUserCoursesProgress.map(course => (
                        <div key={course.id} className="p-4 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-ios-xl space-y-2">
                          <div className="flex justify-between items-start gap-3">
                            <span className="font-extrabold text-xs text-ios-label-primaryLight dark:text-white">
                              {course.title}
                            </span>
                            <span className="text-[10px] font-bold text-ios-label-secondaryLight bg-black/5 px-2 py-0.5 rounded-full whitespace-nowrap">
                              {course.completedLessons}/{course.totalLessons} leçons ({course.percent}%)
                            </span>
                          </div>
                          
                          {/* Progress bar wrapper */}
                          <div className="w-full bg-black/10 dark:bg-white/10 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-gradient-to-r from-ios-blue-light to-ios-indigo-light h-full rounded-full transition-all duration-500" 
                              style={{ width: `${course.percent}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content 2: TRANSACTIONS */}
              {activeCrmTab === 'transactions' && (
                <div className="space-y-4 text-left animate-fade-in">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                    🛍️ Achats de Formations & Ressources
                  </h4>
                  
                  {loadingCrmUserStats ? (
                    <p className="text-xs italic text-ios-label-secondaryLight">Chargement des transactions...</p>
                  ) : !crmUserStats?.purchases || crmUserStats.purchases.length === 0 ? (
                    <div className="p-4 bg-black/5 dark:bg-white/5 rounded-ios-xl border border-black/5 text-center text-xs italic text-ios-label-secondaryLight">
                      Aucun achat ou virement déclaré pour le moment.
                    </div>
                  ) : (() => {
                    const totalSpent = crmUserStats.purchases
                      .filter(p => p.status === 'approved')
                      .reduce((sum, p) => sum + p.amount, 0);

                    return (
                      <div className="space-y-3">
                        <div className="bg-ios-blue-light/5 dark:bg-ios-blue-dark/5 border border-ios-blue-light/10 dark:border-ios-blue-dark/10 p-3 rounded-ios-xl flex justify-between items-center text-xs">
                          <span className="font-bold text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Total investi par le membre :</span>
                          <span className="font-extrabold text-sm text-ios-blue-light dark:text-ios-blue-dark">{totalSpent} €</span>
                        </div>
                        
                        <div className="divide-y divide-black/5 dark:divide-white/5 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-ios-xl overflow-hidden">
                          {crmUserStats.purchases.map((purchase) => {
                            const courseObj = (purchase as any).courses;
                            const courseTitle = Array.isArray(courseObj) ? courseObj[0]?.title : courseObj?.title;

                            return (
                              <div key={purchase.id} className="p-3 flex justify-between items-center text-xs bg-white/40 dark:bg-neutral-800/40">
                                <div className="flex flex-col gap-0.5 text-left">
                                  <span className="font-bold truncate max-w-[200px]">{courseTitle || 'Formation'}</span>
                                  <span className="text-[10px] font-mono text-ios-label-secondaryLight/70">{purchase.transfer_reference} • {new Date(purchase.created_at).toLocaleDateString('fr-FR')}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-extrabold">{purchase.amount} €</span>
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                                    purchase.status === 'approved' 
                                      ? 'bg-ios-green-light/10 text-ios-green-light border border-ios-green-light/20' 
                                      : purchase.status === 'pending'
                                        ? 'bg-ios-orange-light/10 text-ios-orange-light border border-ios-orange-light/20'
                                        : 'bg-ios-red-light/10 text-ios-red-light border border-ios-red-light/20'
                                  }`}>
                                    {purchase.status === 'approved' ? 'Validé' : purchase.status === 'pending' ? 'Attente' : 'Rejeté'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Tab Content: PUBLICATIONS MODERATION */}
              {activeCrmTab === 'publications' && (
                <div className="space-y-6 text-left animate-fade-in">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Left Column: Posts */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-1.5">
                        📝 Posts sur le Forum ({crmUserPosts.length})
                      </h4>
                      
                      <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                        {crmUserPosts.length === 0 ? (
                          <p className="text-xs italic text-ios-label-secondaryLight/60 p-4 bg-black/[0.02] dark:bg-white/[0.01] rounded-ios-lg text-center">
                            Aucun post rédigé par ce membre.
                          </p>
                        ) : (
                          crmUserPosts.map(post => {
                            const catName = Array.isArray(post.categories) ? post.categories[0]?.name : post.categories?.name || 'Général';
                            return (
                              <div key={post.id} className="p-3 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-ios-xl space-y-1.5 flex justify-between items-start gap-2">
                                <div className="min-w-0 flex-grow">
                                  <h5 className="font-bold text-xs truncate text-ios-label-primaryLight dark:text-white" title={post.title}>
                                    {post.title}
                                  </h5>
                                  <div className="flex items-center gap-2 text-[9px] text-ios-label-secondaryLight/70 font-semibold">
                                    <span className="bg-ios-blue-light/10 text-ios-blue-light px-1.5 py-0.5 rounded font-bold">{catName}</span>
                                    <span>{post.likes_count} 👍</span>
                                    <span>{post.comments_count} 💬</span>
                                    <span>{new Date(post.created_at).toLocaleDateString('fr-FR')}</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={deletingPostId === post.id}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (confirm(`Voulez-vous supprimer définitivement le post "${post.title}" ?`)) {
                                      setDeletingPostId(post.id);
                                      const { deletePost } = useCommunityStore.getState();
                                      const success = await deletePost(post.id);
                                      setDeletingPostId(null);
                                      if (success) {
                                        setCrmUserPosts(prev => prev.filter(p => p.id !== post.id));
                                        alert("Post supprimé avec succès.");
                                      } else {
                                        alert("Erreur lors de la suppression.");
                                      }
                                    }
                                  }}
                                  className="p-1 text-ios-red-light hover:bg-ios-red-light/10 rounded-full transition flex-shrink-0 cursor-pointer disabled:opacity-50"
                                  title="Supprimer le post"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                    
                    {/* Right Column: Comments */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-1.5">
                        💬 Commentaires ({crmUserComments.length})
                      </h4>
                      
                      <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                        {crmUserComments.length === 0 ? (
                          <p className="text-xs italic text-ios-label-secondaryLight/60 p-4 bg-black/[0.02] dark:bg-white/[0.01] rounded-ios-lg text-center">
                            Aucun commentaire posté par ce membre.
                          </p>
                        ) : (
                          crmUserComments.map(comment => {
                            const postTitle = Array.isArray(comment.posts) ? comment.posts[0]?.title : comment.posts?.title || 'Publication';
                            return (
                              <div key={comment.id} className="p-3 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-ios-xl space-y-1.5 flex justify-between items-start gap-2">
                                <div className="min-w-0 flex-grow">
                                  <p className="text-xs font-semibold text-ios-label-primaryLight dark:text-white line-clamp-2">
                                    "{comment.content}"
                                  </p>
                                  <div className="flex flex-col gap-0.5 mt-1 text-[9px] text-ios-label-secondaryLight/70">
                                    <span className="font-bold text-ellipsis overflow-hidden whitespace-nowrap max-w-[180px]">Sur: {postTitle}</span>
                                    <span>Publié le {new Date(comment.created_at).toLocaleDateString('fr-FR')}</span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  disabled={deletingCommentId === comment.id}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (confirm(`Voulez-vous supprimer ce commentaire ?`)) {
                                      setDeletingCommentId(comment.id);
                                      const { deleteComment } = useCommunityStore.getState();
                                      const success = await deleteComment(comment.post_id, comment.id);
                                      setDeletingCommentId(null);
                                      if (success) {
                                        setCrmUserComments(prev => prev.filter(c => c.id !== comment.id));
                                        alert("Commentaire supprimé.");
                                      } else {
                                        alert("Erreur lors de la suppression.");
                                      }
                                    }
                                  }}
                                  className="p-1 text-ios-red-light hover:bg-ios-red-light/10 rounded-full transition flex-shrink-0 cursor-pointer disabled:opacity-50"
                                  title="Supprimer le commentaire"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* Tab Content 3: ACTIVITY LOGS */}
              {activeCrmTab === 'logs' && (
                <div className="space-y-4 text-left animate-fade-in">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark flex items-center gap-2">
                    <Activity className="w-4 h-4 text-ios-blue-light" />
                    Journal d'activité & Audit Trail
                  </h4>
                  
                  {loadingCrmUserLogs ? (
                    <div className="flex items-center justify-center p-6 gap-2 text-xs italic text-ios-label-secondaryLight">
                      <div className="w-4 h-4 border-2 border-ios-blue-light border-t-transparent rounded-full animate-spin"></div>
                      Chargement de l'historique d'activité...
                    </div>
                  ) : crmUserLogs.length === 0 ? (
                    <div className="p-4 bg-black/5 dark:bg-white/5 rounded-ios-xl border border-black/5 text-center text-xs italic text-ios-label-secondaryLight">
                      Aucune activité récente enregistrée en base de données.
                    </div>
                  ) : (
                    <div className="relative border-l border-black/10 dark:border-white/10 ml-2.5 pl-4 space-y-5">
                      {crmUserLogs.map((log) => {
                        return (
                          <div key={log.id} className="relative text-xs">
                            {/* Point on timeline */}
                            <span className="absolute -left-[20.5px] top-1 flex h-1.5 w-1.5 rounded-full bg-ios-blue-light dark:bg-ios-blue-dark"></span>
                            
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                {log.type === 'lesson' && <BookOpen className="w-3.5 h-3.5 text-ios-green-light" />}
                                {log.type === 'donation' && <Heart className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />}
                                {log.type === 'call' && <PhoneCall className="w-3.5 h-3.5 text-purple-500" />}
                                {log.type === 'post' && <MessageSquare className="w-3.5 h-3.5 text-ios-blue-light" />}
                                {log.type === 'comment' && <MessageSquare className="w-3.5 h-3.5 text-ios-pink-light" />}
                                {log.type === 'canvas' && <Activity className="w-3.5 h-3.5 text-ios-indigo-light" />}
                                {log.type === 'payout' && <TrendingUp className="w-3.5 h-3.5 text-ios-orange-light" />}
                                {log.type === 'purchase' && <TrendingUp className="w-3.5 h-3.5 text-ios-green-light" />}
                                
                                <span className="font-bold text-ios-label-primaryLight dark:text-white ml-1">
                                  {log.title}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase border ${log.badgeColor}`}>
                                  {log.type}
                                </span>
                              </div>
                              <span className="text-[10px] text-ios-label-secondaryLight font-medium">
                                {new Date(log.date).toLocaleString('fr-FR')}
                              </span>
                            </div>
                            
                            <p className="text-ios-label-secondaryLight/80 mt-1 leading-relaxed font-medium">
                              {log.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Quick Profile Modifier controls */}
              <div className="border-t border-black/5 dark:border-white/5 pt-4 space-y-3 text-left">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">Actions de Gestion</h4>
                
                <div className="flex flex-wrap gap-2.5">
                  {/* XP update */}
                  <button
                    onClick={() => {
                      setEditingUserXp(selectedCrmUser);
                      setXpInput(selectedCrmUser.xp);
                    }}
                    className="px-3 py-2 bg-ios-blue-light/10 text-ios-blue-light hover:bg-ios-blue-light/20 text-xs font-bold rounded-ios-lg transition cursor-pointer"
                  >
                    Modifier XP ({selectedCrmUser.xp} XP)
                  </button>

                  {/* Role (Admins only) */}
                  {isAdmin && selectedCrmUser.id !== profile?.id && (
                    <div className="flex items-center gap-1.5 text-xs font-bold bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-ios-lg px-3 py-1">
                      <span>Rôle :</span>
                      <select
                        value={selectedCrmUser.role}
                        onChange={async (e) => {
                          const newRole = e.target.value as any;
                          const success = await handleRoleChange(selectedCrmUser.id, newRole);
                          if (success) {
                            setSelectedCrmUser(prev => prev ? { ...prev, role: newRole } : null);
                          }
                        }}
                        className="bg-transparent border-0 font-extrabold outline-none text-xs text-ios-blue-light cursor-pointer"
                      >
                        <option value="user">Membre</option>
                        <option value="creator">Créateur</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  )}

                  {/* Premium status (Admins only) */}
                  {isAdmin && (
                    <button
                      onClick={async () => {
                        await handleTogglePremium(selectedCrmUser.id, selectedCrmUser.is_premium);
                        setSelectedCrmUser(prev => prev ? { ...prev, is_premium: !prev.is_premium } : null);
                      }}
                      className={`px-3 py-2 text-xs font-bold rounded-ios-lg transition cursor-pointer ${
                        selectedCrmUser.is_premium
                          ? 'bg-ios-indigo-light text-white shadow-ios-soft'
                          : 'bg-black/5 dark:bg-white/5 text-ios-label-secondaryLight'
                      }`}
                    >
                      {selectedCrmUser.is_premium ? 'Retirer Premium' : 'Rendre Premium'}
                    </button>
                  )}

                  {/* Ban (Admins only) */}
                  {isAdmin && selectedCrmUser.id !== profile?.id && (
                    <button
                      onClick={async () => {
                        await handleToggleBan(selectedCrmUser.id);
                        setSelectedCrmUser(prev => prev ? { ...prev, is_banned: !prev.is_banned } : null);
                      }}
                      className={`px-3 py-2 text-xs font-bold rounded-ios-lg transition cursor-pointer ${
                        selectedCrmUser.is_banned
                          ? 'bg-ios-green-light text-white shadow-ios-soft'
                          : 'bg-ios-red-light/10 text-ios-red-light'
                      }`}
                    >
                      {selectedCrmUser.is_banned ? 'Débannir l\'utilisateur' : 'Bannir l\'utilisateur'}
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Category Creation / Edit Modal Dialog */}
      {showCategoryModal && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 rounded-ios-2xl border border-black/5 dark:border-white/5 shadow-ios-strong animate-fade-in flex flex-col gap-4">
            <div className="flex justify-between items-center pb-2 border-b border-black/5 dark:border-white/5">
              <h3 className="text-base font-extrabold flex items-center gap-1.5">
                📂 {editingCategory ? 'Modifier la catégorie' : 'Créer une catégorie'}
              </h3>
              <button 
                onClick={() => setShowCategoryModal(false)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark block">Nom de la catégorie (avec emoji)</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: Marketing 📈"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-ios-label-secondaryLight dark:text-ios-label-secondaryDark block">Description du salon</label>
                <textarea 
                  rows={3}
                  required
                  placeholder="Expliquez brièvement les sujets abordés dans cette section..."
                  value={categoryDesc}
                  onChange={(e) => setCategoryDesc(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/5 rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ios-blue-light resize-none"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button 
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="flex-1 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-ios-xl text-xs font-bold transition"
                >
                  Annuler
                </button>
                <button 
                  type="submit"
                  className="flex-1 py-2 bg-ios-blue-light dark:bg-ios-blue-dark text-white rounded-ios-xl text-xs font-bold shadow-ios-glow hover:opacity-95 transition"
                >
                  {editingCategory ? 'Mettre à jour' : 'Créer la catégorie'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
