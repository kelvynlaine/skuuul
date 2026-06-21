import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { useAuthStore } from './authStore';

export interface Canvas {
  id: string;
  title: string;
  content: string;
  creator_id: string;
  font_family: string;
  text_size: string;
  is_underlined: boolean;
  is_italic: boolean;
  highlight_color: string | null;
  created_at: string;
  updated_at: string;
  creator?: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface CanvasParticipant {
  id: string;
  canvas_id: string;
  user_id: string;
  role: 'editor' | 'viewer';
  joined_at: string;
  user?: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    level: number;
    xp: number;
  };
}

export interface CanvasAuditLog {
  id: string;
  canvas_id: string;
  user_id: string;
  action: string;
  details: string;
  created_at: string;
  user?: {
    username: string;
    full_name: string | null;
  };
}

interface CollaborativeState {
  canvases: Canvas[];
  activeCanvas: Canvas | null;
  participants: CanvasParticipant[];
  auditLogs: CanvasAuditLog[];
  loading: boolean;

  fetchCanvases: () => Promise<void>;
  createCanvas: (title: string) => Promise<string | null>;
  fetchCanvasDetails: (id: string) => Promise<Canvas | null>;
  updateCanvas: (id: string, updates: Partial<Canvas>) => Promise<boolean>;
  deleteCanvas: (id: string) => Promise<boolean>;
  joinCanvas: (canvasId: string) => Promise<boolean>;
  fetchParticipants: (canvasId: string) => Promise<void>;
  updateParticipantRole: (canvasId: string, userId: string, role: 'editor' | 'viewer') => Promise<boolean>;
  removeParticipant: (canvasId: string, userId: string) => Promise<boolean>;
  addParticipant: (canvasId: string, userId: string) => Promise<boolean>;
  fetchAuditLogs: (canvasId: string) => Promise<void>;
  logCanvasAction: (canvasId: string, action: string, details: string) => Promise<void>;
  fetchAllAuditLogs: () => Promise<CanvasAuditLog[]>; // For admin dashboard
  fetchAllCanvasesAdmin: () => Promise<Canvas[]>; // For admin dashboard
}

export const useCollaborativeStore = create<CollaborativeState>((set, get) => ({
  canvases: [],
  activeCanvas: null,
  participants: [],
  auditLogs: [],
  loading: false,

  fetchCanvases: async () => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('collaborative_canvases')
        .select(`
          *,
          creator:profiles!collaborative_canvases_creator_id_fkey(username, full_name, avatar_url)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ canvases: data as Canvas[], loading: false });
    } catch (e) {
      console.error("Failed to fetch canvases:", e);
      set({ canvases: [], loading: false });
    }
  },

  createCanvas: async (title: string) => {
    const { user, profile } = useAuthStore.getState();
    if (!user || !profile) return null;

    try {
      const { data, error } = await supabase
        .from('collaborative_canvases')
        .insert({
          title,
          creator_id: user.id,
          content: ''
        })
        .select()
        .single();

      if (error) throw error;
      
      const canvas = data as Canvas;
      
      // Auto-insert creator as an editor participant
      await supabase.from('canvas_participants').insert({
        canvas_id: canvas.id,
        user_id: user.id,
        role: 'editor'
      });

      // Write audit log
      await get().logCanvasAction(canvas.id, 'created', `Projet collaboratif "${title}" créé par ${profile.full_name || profile.username}.`);
      
      await get().fetchCanvases();
      return canvas.id;
    } catch (e) {
      console.error("Failed to create canvas:", e);
      return null;
    }
  },

  fetchCanvasDetails: async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('collaborative_canvases')
        .select(`
          *,
          creator:profiles!collaborative_canvases_creator_id_fkey(username, full_name, avatar_url)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      const canvas = data as Canvas;
      set({ activeCanvas: canvas });
      return canvas;
    } catch (e) {
      console.error("Failed to fetch canvas details:", e);
      set({ activeCanvas: null });
      return null;
    }
  },

  updateCanvas: async (id: string, updates: Partial<Canvas>) => {
    try {
      const { error } = await supabase
        .from('collaborative_canvases')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;
      
      // Update local state if active
      const active = get().activeCanvas;
      if (active && active.id === id) {
        set({ activeCanvas: { ...active, ...updates } });
      }
      return true;
    } catch (e) {
      console.error("Failed to update canvas:", e);
      return false;
    }
  },

  deleteCanvas: async (id: string) => {
    try {
      const { error } = await supabase
        .from('collaborative_canvases')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await get().fetchCanvases();
      return true;
    } catch (e) {
      console.error("Failed to delete canvas:", e);
      return false;
    }
  },

  joinCanvas: async (canvasId: string) => {
    const { user, profile } = useAuthStore.getState();
    if (!user || !profile) return false;

    try {
      // Check if already a participant
      const { data: existing } = await supabase
        .from('canvas_participants')
        .select('id')
        .eq('canvas_id', canvasId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) return true; // Already joined

      const { error } = await supabase
        .from('canvas_participants')
        .insert({
          canvas_id: canvasId,
          user_id: user.id,
          role: 'editor' // default role is editor
        });

      if (error) throw error;

      // Write audit log
      await get().logCanvasAction(canvasId, 'joined', `${profile.full_name || profile.username} a rejoint le projet.`);
      
      return true;
    } catch (e) {
      console.error("Failed to join canvas:", e);
      return false;
    }
  },

  fetchParticipants: async (canvasId: string) => {
    try {
      const { data, error } = await supabase
        .from('canvas_participants')
        .select(`
          *,
          user:profiles!canvas_participants_user_id_fkey(username, full_name, avatar_url, level, xp)
        `)
        .eq('canvas_id', canvasId);

      if (error) throw error;
      set({ participants: data as CanvasParticipant[] });
    } catch (e) {
      console.error("Failed to fetch participants:", e);
      set({ participants: [] });
    }
  },

  updateParticipantRole: async (canvasId: string, userId: string, role: 'editor' | 'viewer') => {
    const { profile } = useAuthStore.getState();
    try {
      const { error } = await supabase
        .from('canvas_participants')
        .update({ role })
        .eq('canvas_id', canvasId)
        .eq('user_id', userId);

      if (error) throw error;
      
      // Fetch target user's username for logging
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', userId)
        .single();
      const targetName = targetProfile ? (targetProfile.full_name || targetProfile.username) : 'Collaborateur';

      await get().logCanvasAction(
        canvasId, 
        'role_changed', 
        `Rôle de ${targetName} modifié en "${role === 'editor' ? 'Éditeur' : 'Lecteur'}" par ${profile?.full_name || profile?.username}.`
      );
      
      await get().fetchParticipants(canvasId);
      return true;
    } catch (e) {
      console.error("Failed to update participant role:", e);
      return false;
    }
  },

  removeParticipant: async (canvasId: string, userId: string) => {
    const { profile } = useAuthStore.getState();
    try {
      const { error } = await supabase
        .from('canvas_participants')
        .delete()
        .eq('canvas_id', canvasId)
        .eq('user_id', userId);

      if (error) throw error;
      
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', userId)
        .single();
      const targetName = targetProfile ? (targetProfile.full_name || targetProfile.username) : 'Collaborateur';

      await get().logCanvasAction(
        canvasId, 
        'removed_user', 
        `${targetName} a été exclu du projet par ${profile?.full_name || profile?.username}.`
      );

      await get().fetchParticipants(canvasId);
      return true;
    } catch (e) {
      console.error("Failed to remove participant:", e);
      return false;
    }
  },

  addParticipant: async (canvasId: string, userId: string) => {
    const { profile } = useAuthStore.getState();
    try {
      const { error } = await supabase
        .from('canvas_participants')
        .insert({
          canvas_id: canvasId,
          user_id: userId,
          role: 'editor'
        });

      if (error) throw error;

      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('username, full_name')
        .eq('id', userId)
        .single();
      const targetName = targetProfile ? (targetProfile.full_name || targetProfile.username) : 'Collaborateur';

      await get().logCanvasAction(
        canvasId, 
        'joined', 
        `${targetName} a été ajouté au projet par ${profile?.full_name || profile?.username}.`
      );

      await get().fetchParticipants(canvasId);
      return true;
    } catch (e) {
      console.error("Failed to add participant:", e);
      return false;
    }
  },


  fetchAuditLogs: async (canvasId: string) => {
    try {
      const { data, error } = await supabase
        .from('canvas_audit_logs')
        .select(`
          *,
          user:profiles!canvas_audit_logs_user_id_fkey(username, full_name)
        `)
        .eq('canvas_id', canvasId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ auditLogs: data as CanvasAuditLog[] });
    } catch (e) {
      console.error("Failed to fetch audit logs:", e);
      set({ auditLogs: [] });
    }
  },

  logCanvasAction: async (canvasId: string, action: string, details: string) => {
    const { user } = useAuthStore.getState();
    if (!user) return;
    try {
      await supabase.rpc('log_canvas_action_rpc', {
        c_id: canvasId,
        u_id: user.id,
        act: action,
        det: details
      });
    } catch (e) {
      console.error("Failed to log canvas action:", e);
    }
  },

  fetchAllAuditLogs: async () => {
    try {
      const { data, error } = await supabase
        .from('canvas_audit_logs')
        .select(`
          *,
          user:profiles!canvas_audit_logs_user_id_fkey(username, full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as CanvasAuditLog[];
    } catch (e) {
      console.error("Failed to fetch all audit logs:", e);
      return [];
    }
  },

  fetchAllCanvasesAdmin: async () => {
    try {
      const { data, error } = await supabase
        .from('collaborative_canvases')
        .select(`
          *,
          creator:profiles!collaborative_canvases_creator_id_fkey(username, full_name, avatar_url)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Canvas[];
    } catch (e) {
      console.error("Failed to fetch all canvases for admin:", e);
      return [];
    }
  }
}));
