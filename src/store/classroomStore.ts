import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { useAuthStore } from './authStore';

export interface Course {
  id: string;
  title: string;
  description: string;
  cover_image_url: string;
  is_published: boolean;
  is_premium?: boolean;
  owner_id?: string;
  price?: number;
  profiles?: {
    full_name: string | null;
    username: string;
    avatar_url?: string | null;
  } | null;
}

// Coordonnées de paiement du vendeur d'un cours (récupérées via RPC sécurisé,
// jamais exposées globalement par la table profiles).
export interface CoursePaymentInfo {
  iban: string | null;
  phone: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
}

export interface CoursePurchase {
  id: string;
  user_id: string;
  course_id: string;
  amount: number;
  transfer_reference: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface PayoutRequest {
  id: string;
  user_id: string;
  amount: number;
  iban: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface Module {
  id: string;
  course_id: string;
  title: string;
  order_index: number;
}

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  content: string;
  video_url: string;
  order_index: number;
}

interface ClassroomState {
  courses: Course[];
  modules: Module[];
  lessons: Record<string, Lesson[]>; // Keyed by module_id
  completedLessons: Set<string>; // Set of completed lesson IDs
  userPurchases: CoursePurchase[];
  payoutRequests: PayoutRequest[];
  loading: boolean;

  // Actions
  fetchCourses: () => Promise<void>;
  fetchCourseContent: (courseId: string) => Promise<void>;
  fetchProgress: () => Promise<void>;
  toggleLessonCompletion: (lessonId: string) => Promise<{ completed: boolean; xpGained: number }>;
  createCourse: (course: Omit<Course, 'id'>) => Promise<Course | null>;
  createModule: (module: Omit<Module, 'id'>) => Promise<Module | null>;
  createLesson: (lesson: Omit<Lesson, 'id'>) => Promise<Lesson | null>;
  deleteModule: (moduleId: string) => Promise<boolean>;
  deleteCourse: (courseId: string) => Promise<boolean>;
  uploadMedia: (file: File) => Promise<string | null>;
  fetchUserPurchases: () => Promise<void>;
  requestCoursePurchase: (courseId: string, amount: number, transferReference: string) => Promise<any>;
  getCoursePaymentInfo: (courseId: string) => Promise<CoursePaymentInfo | null>;
  fetchPendingPurchasesForCreator: () => Promise<(CoursePurchase & { profiles: { username: string, full_name: string | null }, courses: { title: string } })[]>;
  updatePurchaseStatus: (purchaseId: string, status: 'approved' | 'rejected') => Promise<boolean>;
  cancelCoursePurchase: (courseId: string) => Promise<boolean>;
  fetchPayoutRequests: () => Promise<void>;
  createPayoutRequest: (amount: number, iban: string) => Promise<boolean>;
  adminFetchAllPayoutRequests: () => Promise<(PayoutRequest & { profiles: { username: string, full_name: string | null, stripe_account_id?: string } })[]>;
  adminUpdatePayoutStatus: (payoutId: string, status: 'approved' | 'rejected') => Promise<boolean>;
  createStripeConnectAccount: () => Promise<{ url: string } | null>;
}

export const useClassroomStore = create<ClassroomState>((set, get) => ({
  courses: [],
  modules: [],
  lessons: {},
  completedLessons: new Set<string>(),
  userPurchases: [],
  payoutRequests: [],
  loading: false,

  fetchCourses: async () => {
    try {
      const { data, error } = await supabase
        .from('courses')
        .select('*, profiles:owner_id (full_name, username, avatar_url)')
        .order('created_at', { ascending: true });

      if (error) throw error;
      set({ courses: data as Course[] });
    } catch (e) {
      console.warn("Failed to fetch courses from DB:", e);
      set({ courses: [] });
    }
  },

  fetchCourseContent: async (courseId: string) => {
    set({ loading: true });

    try {
      // Fetch modules
      const { data: dbModules, error: modError } = await supabase
        .from('modules')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true });

      if (modError) throw modError;

      const modIds = dbModules.map(m => m.id);
      const lessonsMap: Record<string, Lesson[]> = {};

      if (modIds.length > 0) {
        // Fetch lessons
        const { data: dbLessons, error: lesError } = await supabase
          .from('lessons')
          .select('*')
          .in('module_id', modIds)
          .order('order_index', { ascending: true });

        if (lesError) throw lesError;

        dbModules.forEach(m => {
          lessonsMap[m.id] = dbLessons.filter(l => l.module_id === m.id);
        });
      } else {
        dbModules.forEach(m => {
          lessonsMap[m.id] = [];
        });
      }

      set({ 
        modules: dbModules as Module[], 
        lessons: lessonsMap, 
        loading: false 
      });
    } catch (e) {
      console.error("Failed to fetch course content:", e);
      set({ modules: [], lessons: {}, loading: false });
    }
  },

  fetchProgress: async () => {
    const { user } = useAuthStore.getState();
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('lesson_progress')
        .select('lesson_id')
        .eq('user_id', user.id);

      if (error) throw error;
      const completedSet = new Set(data.map(p => p.lesson_id));
      set({ completedLessons: completedSet });
    } catch (e) {
      console.error("Failed to fetch progress:", e);
    }
  },

  toggleLessonCompletion: async (lessonId) => {
    const { user, addXp } = useAuthStore.getState();
    if (!user) return { completed: false, xpGained: 0 };

    const { completedLessons } = get();
    const isCompleted = completedLessons.has(lessonId);
    let xpGained = 0;

    // Toggle set state locally
    const nextCompleted = new Set(completedLessons);
    if (isCompleted) {
      nextCompleted.delete(lessonId);
    } else {
      nextCompleted.add(lessonId);
      xpGained = 50; // Give 50 XP on completion
    }

    set({ completedLessons: nextCompleted });

    if (xpGained > 0) {
      await addXp(xpGained);
    }

    try {
      if (isCompleted) {
        await supabase
          .from('lesson_progress')
          .delete()
          .eq('lesson_id', lessonId)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('lesson_progress')
          .insert({ lesson_id: lessonId, user_id: user.id });
      }
      return { completed: !isCompleted, xpGained };
    } catch (e) {
      console.error("Failed to update lesson completion in database:", e);
      // Revert local changes
      set({ completedLessons });
      return { completed: isCompleted, xpGained: 0 };
    }
  },

  createCourse: async (course) => {
    const { profile } = useAuthStore.getState();
    const owner_id = profile?.id;

    try {
      const { data, error } = await supabase
        .from('courses')
        .insert({ ...course, owner_id })
        .select()
        .single();

      if (error) throw error;
      const newCourse = data as Course;
      set(state => ({ courses: [...state.courses, newCourse] }));
      return newCourse;
    } catch (e) {
      console.error("Failed to create course in DB:", e);
      return null;
    }
  },

  createModule: async (module) => {
    try {
      const { data, error } = await supabase
        .from('modules')
        .insert(module)
        .select()
        .single();

      if (error) throw error;
      const newModule = data as Module;
      set(state => ({
        modules: [...state.modules, newModule],
        lessons: { ...state.lessons, [newModule.id]: [] }
      }));
      return newModule;
    } catch (e) {
      console.error("Failed to create module in DB:", e);
      return null;
    }
  },

  createLesson: async (lesson) => {
    try {
      const { data, error } = await supabase
        .from('lessons')
        .insert(lesson)
        .select()
        .single();

      if (error) throw error;
      const newLesson = data as Lesson;
      set(state => {
        const moduleLessons = state.lessons[lesson.module_id] || [];
        return {
          lessons: {
            ...state.lessons,
            [lesson.module_id]: [...moduleLessons, newLesson]
          }
        };
      });
      return newLesson;
    } catch (e) {
      console.error("Failed to create lesson in DB:", e);
      return null;
    }
  },

  deleteModule: async (moduleId) => {
    try {
      const { error } = await supabase
        .from('modules')
        .delete()
        .eq('id', moduleId);

      if (error) throw error;
      
      set(state => ({
        modules: state.modules.filter(m => m.id !== moduleId),
      }));
      return true;
    } catch (e) {
      console.error("Failed to delete module in DB:", e);
      return false;
    }
  },

  deleteCourse: async (courseId) => {
    try {
      const { error } = await supabase
        .from('courses')
        .delete()
        .eq('id', courseId);

      if (error) throw error;
      
      set(state => ({
        courses: state.courses.filter(c => c.id !== courseId),
      }));
      return true;
    } catch (e) {
      console.error("Failed to delete course in DB:", e);
      return false;
    }
  },

  uploadMedia: async (file) => {
    try {
      // Validation : type MIME en liste blanche + taille max, pour éviter
      // l'upload de fichiers exécutables déguisés ou trop volumineux.
      const ALLOWED_TYPES = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/webm',
      ];
      const MAX_SIZE = 100 * 1024 * 1024; // 100 Mo
      if (!ALLOWED_TYPES.includes(file.type)) {
        alert("Type de fichier non autorisé. Formats acceptés : images, vidéos (mp4/webm) et audio.");
        return null;
      }
      if (file.size > MAX_SIZE) {
        alert("Fichier trop volumineux (max 100 Mo).");
        return null;
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('course-media')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('course-media')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (e) {
      console.error("Failed to upload media:", e);
      return null;
    }
  },

  fetchUserPurchases: async () => {
    const { user } = useAuthStore.getState();
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('course_purchases')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      set({ userPurchases: data as CoursePurchase[] });
    } catch (e) {
      console.error("Failed to fetch user purchases:", e);
      set({ userPurchases: [] });
    }
  },

  requestCoursePurchase: async (courseId: string, amount: number, transferReference: string) => {
    const { user } = useAuthStore.getState();
    if (!user) return null;
    try {
      // amount et status sont imposés côté serveur (trigger enforce_purchase_integrity) :
      // les valeurs envoyées ici ne sont pas de confiance.
      const { data, error } = await supabase
        .from('course_purchases')
        .insert({
          user_id: user.id,
          course_id: courseId,
          amount,
          transfer_reference: transferReference,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.error("Failed to request course purchase:", e);
      return null;
    }
  },

  getCoursePaymentInfo: async (courseId: string) => {
    try {
      // RPC sécurisé : ne renvoie que les coordonnées du vendeur DU cours demandé.
      const { data, error } = await supabase
        .rpc('get_course_payment_info', { p_course_id: courseId })
        .single();
      if (error) throw error;
      return data as CoursePaymentInfo;
    } catch (e) {
      console.error("Failed to fetch course payment info:", e);
      return null;
    }
  },

  fetchPendingPurchasesForCreator: async () => {
    const { user } = useAuthStore.getState();
    if (!user) return [];
    try {
      const { data, error } = await supabase
        .from('course_purchases')
        .select(`
          id,
          user_id,
          course_id,
          amount,
          transfer_reference,
          status,
          created_at,
          updated_at,
          profiles:user_id (username, full_name),
          courses:course_id (title, owner_id)
        `);
      if (error) throw error;
      const isUserAdmin = useAuthStore.getState().profile?.role === 'admin';
      const filtered = (data as any[]).filter(p => isUserAdmin || p.courses?.owner_id === user.id);
      return filtered;
    } catch (e) {
      console.error("Failed to fetch pending purchases for creator:", e);
      return [];
    }
  },

  updatePurchaseStatus: async (purchaseId: string, status: 'approved' | 'rejected') => {
    try {
      const { error } = await supabase
        .from('course_purchases')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', purchaseId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error("Failed to update purchase status:", e);
      return false;
    }
  },

  cancelCoursePurchase: async (courseId: string) => {
    const { user } = useAuthStore.getState();
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('course_purchases')
        .delete()
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .in('status', ['pending', 'rejected']);
        
      if (error) throw error;
      
      set(state => ({
        userPurchases: state.userPurchases.filter(p => p.course_id !== courseId)
      }));
      return true;
    } catch (e) {
      console.error("Failed to cancel course purchase:", e);
      return false;
    }
  },

  fetchPayoutRequests: async () => {
    const { user } = useAuthStore.getState();
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('payout_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      set({ payoutRequests: data as PayoutRequest[] });
    } catch (e) {
      console.error("Failed to fetch payout requests:", e);
      set({ payoutRequests: [] });
    }
  },

  createPayoutRequest: async (amount: number, iban: string) => {
    const { user, fetchProfile } = useAuthStore.getState();
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('payout_requests')
        .insert({
          user_id: user.id,
          amount,
          iban,
          status: 'pending'
        });
      if (error) throw error;
      
      // Refresh current payout requests and user profile to see updated balance
      await get().fetchPayoutRequests();
      await fetchProfile(user.id);
      return true;
    } catch (e: any) {
      console.error("Failed to create payout request:", e);
      alert(e.message || "Une erreur est survenue lors de la demande de virement.");
      return false;
    }
  },

  adminFetchAllPayoutRequests: async () => {
    if (useAuthStore.getState().profile?.role !== 'admin') return [];
    try {
      // RPC réservé aux admins : la jointure profiles(...stripe_account_id)
      // n'est plus possible directement (colonne non accordée côté table).
      const { data, error } = await supabase.rpc('admin_list_payout_requests');
      if (error) throw error;
      // Remet les champs du vendeur sous la forme { profiles: {...} } attendue par l'UI.
      return (data ?? []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        amount: row.amount,
        iban: row.iban,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        profiles: {
          username: row.username,
          full_name: row.full_name,
          stripe_account_id: row.stripe_account_id,
        },
      })) as any[];
    } catch (e) {
      console.error("Failed to fetch all payout requests for admin:", e);
      return [];
    }
  },

  adminUpdatePayoutStatus: async (payoutId: string, status: 'approved' | 'rejected') => {
    if (useAuthStore.getState().profile?.role !== 'admin') return false;
    try {
      const { error } = await supabase
        .from('payout_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', payoutId);
      
      if (error) throw error;
      return true;
    } catch (e: any) {
      console.error("Failed to update payout status:", e);
      alert(e.message || "Erreur lors de l'approbation du virement.");
      return false;
    }
  },

  createStripeConnectAccount: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non autorisé.");

      const { data, error } = await supabase.functions.invoke('stripe-connect-onboard', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error + (data.debug ? `\n${data.debug}` : ''));

      return data;
    } catch (e: any) {
      console.error("Failed to create Stripe Connect account:", e);
      alert(e.message || "Erreur lors de la création du compte Stripe.");
      return null;
    }
  },
}));
