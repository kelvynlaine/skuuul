import { create } from 'zustand';
import { supabase } from '../services/supabase';
import { useAuthStore } from './authStore';

export interface PollOption {
  id: string;
  poll_id: string;
  option_text: string;
  votes_count: number;
}

export interface Poll {
  id: string;
  post_id: string;
  question: string;
  options: PollOption[];
  user_voted_option_id?: string | null;
}

export interface Post {
  id: string;
  author_id: string;
  category_id: string;
  title: string;
  content: string;
  likes_count: number;
  comments_count: number;
  is_pinned: boolean;
  created_at: string;
  author: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    level: number;
    is_premium?: boolean;
  };
  category: {
    name: string;
    slug: string;
  };
  liked_by_user?: boolean;
  poll?: Poll | null;
}

export interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
    level: number;
    is_premium?: boolean;
  };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

interface CommunityState {
  posts: Post[];
  categories: Category[];
  commentsByPost: Record<string, Comment[]>;
  loading: boolean;
  
  // Actions
  fetchCategories: () => Promise<void>;
  fetchPosts: (categoryId?: string) => Promise<void>;
  fetchComments: (postId: string) => Promise<void>;
  createPost: (title: string, content: string, categoryId: string, pollData?: { question: string; options: string[] }) => Promise<boolean>;
  toggleLike: (postId: string) => Promise<void>;
  addComment: (postId: string, content: string) => Promise<boolean>;
  deletePost: (postId: string) => Promise<boolean>;
  deleteComment: (postId: string, commentId: string) => Promise<boolean>;
  createCategory: (name: string, description: string) => Promise<boolean>;
  updateCategory: (id: string, updates: Partial<Category>) => Promise<boolean>;
  deleteCategory: (id: string) => Promise<boolean>;
  castVote: (pollId: string, optionId: string) => Promise<boolean>;
}

const ALL_CATEGORY: Category = { id: 'cat-all', name: 'Tous', slug: 'all', description: 'Tous les posts' };

export const useCommunityStore = create<CommunityState>((set, get) => ({
  posts: [],
  categories: [ALL_CATEGORY],
  commentsByPost: {},
  loading: false,

  fetchCategories: async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      set({ categories: [ALL_CATEGORY, ...(data || [])] });
    } catch (e) {
      console.warn("Categories fetch failed:", e);
    }
  },

  fetchPosts: async (categoryId) => {
    set({ loading: true });
    const { user } = useAuthStore.getState();

    try {
      let query = supabase
        .from('posts')
        .select(`
          *,
          author:profiles!posts_author_id_fkey(username, full_name, avatar_url, level, is_premium),
          category:categories!posts_category_id_fkey(name, slug),
          polls:polls(
            id,
            question,
            options:poll_options(id, poll_id, option_text, votes_count)
          )
        `)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (categoryId && categoryId !== 'cat-all') {
        query = query.eq('category_id', categoryId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Map liked_by_user and user_voted_option_id if logged in
      let postsMapped = data as any[];
      let likedPostIds = new Set<string>();
      let userVotesMap = new Map<string, string>(); // poll_id -> option_id

      if (user) {
        // Fetch likes
        const { data: userLikes } = await supabase
          .from('likes')
          .select('post_id')
          .eq('user_id', user.id);
        likedPostIds = new Set(userLikes?.map(l => l.post_id) || []);

        // Fetch votes
        const { data: userVotes } = await supabase
          .from('poll_votes')
          .select('poll_id, option_id')
          .eq('user_id', user.id);
        userVotesMap = new Map(userVotes?.map(v => [v.poll_id, v.option_id]) || []);
      }

      postsMapped = postsMapped.map(post => {
        const rawPoll = post.polls?.[0];
        const poll: Poll | null = rawPoll ? {
          id: rawPoll.id,
          post_id: post.id,
          question: rawPoll.question,
          options: rawPoll.options || [],
          user_voted_option_id: userVotesMap.get(rawPoll.id) || null
        } : null;

        return {
          ...post,
          liked_by_user: likedPostIds.has(post.id),
          poll
        };
      });

      set({ posts: postsMapped, loading: false });
    } catch (e) {
      console.error("Posts fetch failed:", e);
      set({ posts: [], loading: false });
    }
  },

  fetchComments: async (postId) => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          *,
          author:profiles!comments_author_id_fkey(username, full_name, avatar_url, level, is_premium)
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      set((state) => ({
        commentsByPost: {
          ...state.commentsByPost,
          [postId]: data as Comment[],
        },
      }));
    } catch (e) {
      console.error("Comments fetch failed:", e);
    }
  },

  createPost: async (title, content, categoryId, pollData) => {
    const { user, profile, addXp } = useAuthStore.getState();
    if (!user || !profile) return false;

    // Award +15 XP for creating a post
    await addXp(15);

    try {
      const { data: postData, error: postError } = await supabase
        .from('posts')
        .insert({
          title,
          content,
          category_id: categoryId,
          author_id: user.id,
        })
        .select()
        .single();

      if (postError) throw postError;

      // If pollData is present, create the poll and options
      if (pollData && pollData.question.trim() && pollData.options.length >= 2) {
        const { data: pollRow, error: pollError } = await supabase
          .from('polls')
          .insert({
            post_id: postData.id,
            question: pollData.question.trim(),
          })
          .select()
          .single();

        if (pollError) throw pollError;

        const optionRows = pollData.options
          .filter(opt => opt.trim().length > 0)
          .map(opt => ({
            poll_id: pollRow.id,
            option_text: opt.trim(),
          }));

        if (optionRows.length > 0) {
          const { error: optionsError } = await supabase
            .from('poll_options')
            .insert(optionRows);

          if (optionsError) throw optionsError;
        }
      }

      await get().fetchPosts();
      return true;
    } catch (e) {
      console.error("Post creation failed:", e);
      return false;
    }
  },

  toggleLike: async (postId) => {
    const { user } = useAuthStore.getState();
    if (!user) return;

    const post = get().posts.find(p => p.id === postId);
    if (!post) return;

    const currentlyLiked = post.liked_by_user;
    
    // Optimistic UI updates
    set((state) => ({
      posts: state.posts.map(p => 
        p.id === postId 
          ? { 
              ...p, 
              liked_by_user: !currentlyLiked,
              likes_count: currentlyLiked ? p.likes_count - 1 : p.likes_count + 1
            }
          : p
      )
    }));

    try {
      if (currentlyLiked) {
        await supabase
          .from('likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('likes')
          .insert({ post_id: postId, user_id: user.id });
      }
    } catch (e) {
      console.error("Failed to toggle like on server:", e);
      // Revert optimistic UI
      set((state) => ({
        posts: state.posts.map(p => 
          p.id === postId 
            ? { 
                ...p, 
                liked_by_user: currentlyLiked,
                likes_count: currentlyLiked ? p.likes_count + 1 : p.likes_count - 1
              }
            : p
        )
      }));
    }
  },

  addComment: async (postId, content) => {
    const { user, profile, addXp } = useAuthStore.getState();
    if (!user || !profile) return false;

    // Award +5 XP for commenting
    await addXp(5);

    try {
      const { error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          author_id: user.id,
          content,
        });

      if (error) throw error;
      await get().fetchComments(postId);
      // Refresh posts to get updated comment counts
      await get().fetchPosts();
      return true;
    } catch (e) {
      console.error("Comment submission failed:", e);
      return false;
    }
  },

  deletePost: async (postId) => {
    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;
      await get().fetchPosts();
      return true;
    } catch (e) {
      console.error("Failed to delete post:", e);
      return false;
    }
  },

  deleteComment: async (postId, commentId) => {
    try {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      await get().fetchComments(postId);
      await get().fetchPosts();
      return true;
    } catch (e) {
      console.error("Failed to delete comment:", e);
      return false;
    }
  },

  createCategory: async (name, description) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9\u00C0-\u017F]+/g, '-').replace(/(^-|-$)+/g, '');

    try {
      const { error } = await supabase
        .from('categories')
        .insert({ name, slug, description });

      if (error) throw error;
      await get().fetchCategories();
      return true;
    } catch (e) {
      console.error("Failed to create category:", e);
      return false;
    }
  },

  updateCategory: async (id, updates) => {
    try {
      const { error } = await supabase
        .from('categories')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      await get().fetchCategories();
      return true;
    } catch (e) {
      console.error("Failed to update category:", e);
      return false;
    }
  },

  deleteCategory: async (id) => {
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await get().fetchCategories();
      return true;
    } catch (e) {
      console.error("Failed to delete category:", e);
      return false;
    }
  },

  castVote: async (pollId, optionId) => {
    const { user } = useAuthStore.getState();
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('poll_votes')
        .insert({
          poll_id: pollId,
          option_id: optionId,
          user_id: user.id
        });

      if (error) throw error;
      await get().fetchPosts();
      return true;
    } catch (e) {
      console.error("Failed to cast vote:", e);
      alert("Vous avez déjà voté dans ce sondage.");
      return false;
    }
  },
}));
