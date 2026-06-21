import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { User } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  role: 'user' | 'creator' | 'admin';
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  xp: number;
  level: number;
  is_premium: boolean;
  is_banned?: boolean;
  phone?: string | null;
  crm_notes?: string | null;
  iban?: string | null;
  balance?: number;
  stripe_account_id?: string | null;
  stripe_onboarding_complete?: boolean;
  created_at: string;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  profilesList: Profile[];
  loading: boolean;
  initialized: boolean;
  isMock: boolean;
  hasActiveSubscription: boolean;
  // Actions
  initialize: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<void>;
  updateProfile: (updates: Partial<Omit<Profile, 'role' | 'xp' | 'level' | 'is_premium' | 'is_banned' | 'balance'>>) => Promise<boolean>;
  addXp: (amount: number) => Promise<{ xp: number; level: number; leveledUp: boolean }>;
  redirectToStripeCheckout: () => Promise<void>;
  logout: () => Promise<void>;
  fetchProfilesList: () => Promise<void>;
  adminUpdateUserXp: (userId: string, xpAmount: number) => Promise<boolean>;
  adminUpdateUserPremiumStatus: (userId: string, isPremium: boolean) => Promise<boolean>;
  adminToggleUserBan: (userId: string) => Promise<boolean>;
  adminUpdateUserRole: (userId: string, role: 'user' | 'creator' | 'admin') => Promise<boolean>;
  adminUpdateCrmNotes: (userId: string, notes: string) => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  profilesList: [],
  loading: true,
  initialized: false,
  isMock: false,
  hasActiveSubscription: false,

  initialize: async () => {
    set({ loading: true });

    try {
      // Get current session
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;

      if (session?.user) {
        set({ user: session.user });
        await get().fetchProfile(session.user.id);
      } else {
        set({ user: null, profile: null });
      }
    } catch (e) {
      console.error("Supabase Auth init failed:", e);
      set({ user: null, profile: null });
    } finally {
      set({ loading: false, initialized: true });
    }

    // Set up auth state change listener
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        set({ user: session.user });
        await get().fetchProfile(session.user.id);
      } else {
        set({ user: null, profile: null, hasActiveSubscription: false });
      }
    });
  },

  fetchProfile: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      const userProfile = data as Profile;
      set({ profile: userProfile });

      // Admins and the principal creator (kelvynwear) automatically have active subscriptions.
      if (userProfile.role === 'admin' || userProfile.id === '939f7300-6a5c-47b1-a60e-5ad7a67a772c' || userProfile.username === 'kelvynwear') {
        set({ hasActiveSubscription: true });
      } else {
        // Check active subscriptions in Supabase database
        const { data: subData, error: subError } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', userId)
          .eq('status', 'active')
          .limit(1);

        if (!subError && subData && subData.length > 0) {
          set({ hasActiveSubscription: true });
        } else {
          set({ hasActiveSubscription: false });
        }
      }
    } catch (err) {
      console.error("Error fetching user profile:", err);
      set({ profile: null, hasActiveSubscription: false });
    }
  },

  updateProfile: async (updates) => {
    const { user, profile } = get();
    if (!user || !profile) return false;

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;
      await get().fetchProfile(user.id);
      return true;
    } catch (err) {
      console.error("Failed to update profile:", err);
      return false;
    }
  },

  addXp: async (amount: number) => {
    const { profile, user } = get();
    if (!profile || !user) return { xp: 0, level: 1, leveledUp: false };

    const currentXp = profile.xp + amount;
    const nextLevel = Math.floor(Math.sqrt(currentXp / 250)) + 1;
    const leveledUp = nextLevel > profile.level;

    try {
      const { error } = await supabase
        .rpc('increment_xp', { user_id: user.id, xp_to_add: amount });

      if (error) {
        // Fallback update for simplicity if RPC isn't deployed yet
        const { error: directError } = await supabase
          .from('profiles')
          .update({ xp: currentXp, level: nextLevel })
          .eq('id', user.id);
          
        if (directError) throw directError;
      }

      await get().fetchProfile(user.id);
      return { xp: currentXp, level: nextLevel, leveledUp };
    } catch (err) {
      console.error("Error adding XP:", err);
      return { xp: profile.xp, level: profile.level, leveledUp: false };
    }
  },

  redirectToStripeCheckout: async () => {
    const { user } = get();
    if (!user) {
      alert("Veuillez vous connecter pour vous abonner.");
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Session utilisateur introuvable.");

      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        }
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("L'Edge Function n'a pas renvoyé d'URL Stripe.");
      }
    } catch (err: any) {
      console.error("Stripe Redirect Error:", err);
      alert(`Erreur de redirection Stripe : ${err.message}`);
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null, hasActiveSubscription: false });
  },

  fetchProfilesList: async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('xp', { ascending: false });

      if (error) throw error;
      set({ profilesList: data as Profile[] });
    } catch (e) {
      console.error("Failed to fetch profiles list from DB:", e);
      set({ profilesList: [] });
    }
  },

  adminUpdateUserXp: async (userId, xpAmount) => {
    const { profile } = get();
    const nextLevel = Math.floor(Math.sqrt(xpAmount / 250)) + 1;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ xp: xpAmount, level: nextLevel })
        .eq('id', userId);

      if (error) throw error;
      await get().fetchProfilesList();
      if (profile && profile.id === userId) {
        await get().fetchProfile(userId);
      }
      return true;
    } catch (e) {
      console.error("Failed to update user XP:", e);
      return false;
    }
  },

  adminUpdateUserPremiumStatus: async (userId, isPremium) => {
    const { profile } = get();

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_premium: isPremium })
        .eq('id', userId);

      if (error) throw error;
      await get().fetchProfilesList();
      if (profile && profile.id === userId) {
        await get().fetchProfile(userId);
      }
      return true;
    } catch (e) {
      console.error("Failed to update premium status:", e);
      return false;
    }
  },

  adminToggleUserBan: async (userId) => {
    const { profilesList } = get();
    const userToUpdate = profilesList.find(p => p.id === userId);
    if (!userToUpdate) return false;
    const nextBanStatus = !userToUpdate.is_banned;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: nextBanStatus })
        .eq('id', userId);

      if (error) throw error;
      await get().fetchProfilesList();
      return true;
    } catch (e) {
      console.error("Failed to toggle ban status:", e);
      return false;
    }
  },

  adminUpdateUserRole: async (userId, role) => {
    const { profile } = get();

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', userId);

      if (error) throw error;
      await get().fetchProfilesList();
      if (profile && profile.id === userId) {
        await get().fetchProfile(userId);
      }
      return true;
    } catch (e) {
      console.error("Failed to update user role:", e);
      return false;
    }
  },

  adminUpdateCrmNotes: async (userId, notes) => {
    const { profile } = get();

    try {
      const { error } = await supabase.rpc('admin_update_crm_notes', {
        target_user_id: userId,
        new_notes: notes
      });

      if (error) {
        const { error: directError } = await supabase
          .from('profiles')
          .update({ crm_notes: notes })
          .eq('id', userId);

        if (directError) throw directError;
      }

      await get().fetchProfilesList();
      if (profile && profile.id === userId) {
        await get().fetchProfile(userId);
      }
      return true;
    } catch (e) {
      console.error("Failed to update CRM notes:", e);
      return false;
    }
  },
}));
