import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { useAuthStore, Profile } from './authStore';

export interface Livestream {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  creator?: Profile;
}

export interface Donation {
  id: string;
  stream_id: string;
  donor_id: string;
  amount: number;
  message: string | null;
  created_at: string;
  donor?: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface AcceptedCall {
  call: any;          // ligne `calls` (avec signal_data.offer)
  caller: Profile;    // profil de l'appelant
}

interface LiveState {
  activeStreams: Livestream[];
  currentStream: Livestream | null;
  donations: Donation[];
  loading: boolean;
  totalEarnings: number;

  // Appel accepté en attente d'être rejoint par LiveRooms
  // (canal robuste, indépendant du location.state de React Router)
  incomingAcceptedCall: AcceptedCall | null;
  acceptIncomingCall: (call: AcceptedCall) => void;
  clearAcceptedCall: () => void;

  // Actions
  fetchActiveStreams: () => Promise<void>;
  createStream: (title: string, description: string) => Promise<Livestream | null>;
  endStream: (streamId: string) => Promise<boolean>;
  fetchDonations: (streamId: string) => Promise<void>;
  submitDonation: (streamId: string, amount: number, message: string) => Promise<Donation | null>;
  subscribeToDonations: (streamId: string, onNewDonation: (donation: Donation) => void) => () => void;
}

export const useLiveStore = create<LiveState>((set, get) => ({
  activeStreams: [],
  currentStream: null,
  donations: [],
  loading: false,
  totalEarnings: 0,
  incomingAcceptedCall: null,

  acceptIncomingCall: (call) => set({ incomingAcceptedCall: call }),
  clearAcceptedCall: () => set({ incomingAcceptedCall: null }),

  fetchActiveStreams: async () => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('livestreams')
        .select(`
          *,
          creator:profiles(id, username, full_name, avatar_url, xp, level, is_premium)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const list = data as unknown as Livestream[];
      set({ activeStreams: list });

      // Automatically recover active stream if current user is the creator
      const { profile } = useAuthStore.getState();
      if (profile) {
        const myActiveStream = list.find(s => s.creator_id === profile.id);
        if (myActiveStream) {
          set({ currentStream: myActiveStream });
        }
      }
    } catch (e) {
      console.error("Failed to fetch active streams:", e);
      set({ activeStreams: [] });
    } finally {
      set({ loading: false });
    }
  },

  createStream: async (title, description) => {
    const { profile } = useAuthStore.getState();
    if (!profile) return null;

    try {
      const { data, error } = await supabase
        .from('livestreams')
        .insert({
          creator_id: profile.id,
          title,
          description,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      const newStream = data as Livestream;
      set({ currentStream: newStream });
      await get().fetchActiveStreams();
      return newStream;
    } catch (e) {
      console.error("Failed to create stream:", e);
      return null;
    }
  },

  endStream: async (streamId) => {
    try {
      const { error } = await supabase
        .from('livestreams')
        .update({ is_active: false })
        .eq('id', streamId);

      if (error) throw error;
      set({ currentStream: null, donations: [], totalEarnings: 0 });
      await get().fetchActiveStreams();
      return true;
    } catch (e) {
      console.error("Failed to end stream:", e);
      return false;
    }
  },

  fetchDonations: async (streamId) => {
    try {
      const { data, error } = await supabase
        .from('donations')
        .select(`
          *,
          donor:profiles(username, full_name, avatar_url)
        `)
        .eq('stream_id', streamId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const list = data as unknown as Donation[];
      const total = list.reduce((acc, curr) => acc + Number(curr.amount), 0);
      set({ donations: list, totalEarnings: total });
    } catch (e) {
      console.error("Failed to fetch donations:", e);
    }
  },

  submitDonation: async (streamId, amount, message) => {
    const { user } = useAuthStore.getState();
    if (!user) return null;

    // Bornage du montant (cohérent avec la contrainte CHECK côté base).
    if (!Number.isFinite(amount) || amount < 1 || amount > 10000) {
      console.error("Donation amount out of range:", amount);
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('donations')
        .insert({
          stream_id: streamId,
          donor_id: user.id,
          amount,
          message: message.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Re-fetch profile to sync XP in UI
      await useAuthStore.getState().fetchProfile(user.id);

      const newDonation = data as Donation;
      await get().fetchDonations(streamId);
      return newDonation;
    } catch (e) {
      console.error("Failed to submit donation:", e);
      return null;
    }
  },

  subscribeToDonations: (streamId, onNewDonation) => {
    const channel = supabase
      .channel(`live-donations-${streamId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'donations',
          filter: `stream_id=eq.${streamId}`,
        },
        async (payload) => {
          const newDonationRaw = payload.new;
          // Fetch donor profile info
          const { data: profileData } = await supabase
            .from('profiles')
            .select('username, full_name, avatar_url')
            .eq('id', newDonationRaw.donor_id)
            .single();

          const fullDonation: Donation = {
            id: newDonationRaw.id,
            stream_id: newDonationRaw.stream_id,
            donor_id: newDonationRaw.donor_id,
            amount: Number(newDonationRaw.amount),
            message: newDonationRaw.message,
            created_at: newDonationRaw.created_at,
            donor: profileData || { username: 'Anonyme', full_name: 'Anonyme', avatar_url: null },
          };

          // Append to state
          set((state) => {
            const updated = [fullDonation, ...state.donations];
            const total = updated.reduce((acc, curr) => acc + Number(curr.amount), 0);
            return { donations: updated, totalEarnings: total };
          });

          // Trigger visual callback
          onNewDonation(fullDonation);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
