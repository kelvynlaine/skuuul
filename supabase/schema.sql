-- =====================================================================
-- SCHEMA INITIALIZATION: SKOOL.COM CLONE
-- Features: Community (Posts/Comments), Classroom (Courses/Lessons),
--           Gamification (XP/Levels), & Subscriptions (Stripe)
-- Security: Strict Row-Level Security (RLS) & Role-Based Access Control (RBAC)
-- =====================================================================

-- Enable UUID extension if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------
-- 1. PROFILES TABLE (Linked to auth.users)
-- ---------------------------------------------------------------------
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    username TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_banned BOOLEAN NOT NULL DEFAULT false
);

-- Indexing profiles for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_xp_level ON public.profiles(level, xp DESC);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 2. SECURITY HELPER FUNCTIONS
-- ---------------------------------------------------------------------
-- Helper function to check if the current user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------
-- 3. FORUM CATEGORIES TABLE
-- ---------------------------------------------------------------------
CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 4. COMMUNITY POSTS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE public.posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    title TEXT NOT NULL CHECK (char_length(title) >= 3),
    content TEXT NOT NULL, -- Rich-text format stored as text/markdown/JSON
    likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
    comments_count INTEGER NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts(category_id);
CREATE INDEX IF NOT EXISTS idx_posts_author ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_pinned_created ON public.posts(is_pinned DESC, created_at DESC);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 5. COMMENTS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE public.comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(content) >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_author ON public.comments(author_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 6. POST LIKES TABLE (Ensures unique likes per post per user)
-- ---------------------------------------------------------------------
CREATE TABLE public.likes (
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 7. CLASSROOM COURSES TABLE
-- ---------------------------------------------------------------------
CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    cover_image_url TEXT,
    is_published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 8. CLASSROOM MODULES TABLE
-- ---------------------------------------------------------------------
CREATE TABLE public.modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modules_course_order ON public.modules(course_id, order_index);

ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 9. CLASSROOM LESSONS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE public.lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT, -- Markdown description / transcription
    video_url TEXT, -- Video embed URL or storage object name
    order_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lessons_module_order ON public.lessons(module_id, order_index);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 10. LESSON PROGRESS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE public.lesson_progress (
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lesson_id)
);

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 11. STRIPE SUBSCRIPTIONS TABLE
-- ---------------------------------------------------------------------
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stripe_subscription_id TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL, -- e.g., active, trialing, past_due, canceled
    price_id TEXT NOT NULL,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;


-- =====================================================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- =====================================================================

-- --- PROFILES POLICIES ---
CREATE POLICY "Profiles are viewable by anyone" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile fields" ON public.profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins have full access to profiles" ON public.profiles
    FOR ALL USING (public.is_admin());

-- --- CATEGORIES POLICIES ---
CREATE POLICY "Categories are viewable by anyone" ON public.categories
    FOR SELECT USING (true);

CREATE POLICY "Only admins can modify categories" ON public.categories
    FOR ALL USING (public.is_admin());

-- --- POSTS POLICIES ---
CREATE POLICY "Posts are viewable by anyone" ON public.posts
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create posts" ON public.posts
    FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors or admins can update posts" ON public.posts
    FOR UPDATE USING (auth.uid() = author_id OR public.is_admin());

CREATE POLICY "Authors or admins can delete posts" ON public.posts
    FOR DELETE USING (auth.uid() = author_id OR public.is_admin());

-- --- COMMENTS POLICIES ---
CREATE POLICY "Comments are viewable by anyone" ON public.comments
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can comment" ON public.comments
    FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors or admins can update comments" ON public.comments
    FOR UPDATE USING (auth.uid() = author_id OR public.is_admin());

CREATE POLICY "Authors, creators or admins can delete comments" ON public.comments
    FOR DELETE USING (
        auth.uid() = author_id 
        OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role IN ('admin', 'creator')
        )
    );

-- --- LIKES POLICIES ---
CREATE POLICY "Likes are viewable by anyone" ON public.likes
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can like posts" ON public.likes
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can unlike posts" ON public.likes
    FOR DELETE USING (auth.uid() = user_id);

-- --- COURSES POLICIES ---
CREATE POLICY "Published courses are viewable by anyone" ON public.courses
    FOR SELECT USING (
        is_published = true 
        OR public.is_admin() 
        OR (auth.uid() = owner_id AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'creator')
    );

CREATE POLICY "Admins and Creators can manage courses" ON public.courses
    FOR ALL USING (
        public.is_admin() 
        OR (auth.uid() = owner_id AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'creator')
    )
    WITH CHECK (
        public.is_admin() 
        OR (auth.uid() = owner_id AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'creator')
    );

-- --- MODULES POLICIES ---
CREATE POLICY "Modules are viewable if course is viewable" ON public.modules
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.courses
            WHERE id = course_id AND (
                is_published = true 
                OR public.is_admin() 
                OR (owner_id = auth.uid() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'creator')
            )
        )
    );

CREATE POLICY "Admins and Course Owners can manage modules" ON public.modules
    FOR ALL USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.courses
            WHERE id = course_id AND owner_id = auth.uid() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'creator'
        )
    )
    WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.courses
            WHERE id = course_id AND owner_id = auth.uid() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'creator'
        )
    );

-- --- LESSONS POLICIES ---
CREATE POLICY "Lessons are viewable if course is viewable" ON public.lessons
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.modules m
            JOIN public.courses c ON c.id = m.course_id
            WHERE m.id = module_id AND (
                c.is_published = true 
                OR public.is_admin() 
                OR (c.owner_id = auth.uid() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'creator')
            )
        )
    );

CREATE POLICY "Admins and Course Owners can manage lessons" ON public.lessons
    FOR ALL USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.modules m
            JOIN public.courses c ON c.id = m.course_id
            WHERE m.id = module_id AND c.owner_id = auth.uid() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'creator'
        )
    )
    WITH CHECK (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.modules m
            JOIN public.courses c ON c.id = m.course_id
            WHERE m.id = module_id AND c.owner_id = auth.uid() AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'creator'
        )
    );

-- --- PROGRESS POLICIES ---
CREATE POLICY "Users can track and view their own progress" ON public.lesson_progress
    FOR ALL USING (auth.uid() = user_id OR public.is_admin());

-- --- SUBSCRIPTIONS POLICIES ---
CREATE POLICY "Users can view their own subscriptions" ON public.subscriptions
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- Note: Invoicing and webhook modifications bypass RLS via Service Role API on stripe webhooks.


-- =====================================================================
-- TRIGGERS AND FUNCTIONS (DATA INTEGRITY & AUTOMATION)
-- =====================================================================

-- 1. Profile Creation Trigger
-- Automatically creates a user profile inside public.profiles when an auth account is created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, full_name, avatar_url, role, xp, level)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1) || '_' || substr(md5(random()::text), 1, 4)),
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'avatar_url',
        'user', -- Force default role to 'user' for safety
        0,
        1
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Prevent User-Driven Role or XP Manipulation Trigger
-- Ensures a regular user cannot modify their own role, xp, or level values.
-- Only database triggers, server actions (via admin service roles), or admins themselves can change them.
CREATE OR REPLACE FUNCTION public.protect_critical_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- If the operation is not performed by a superuser/service_role and the actor is not an admin, restrict changes
    IF (auth.role() <> 'service_role') AND (NOT public.is_admin()) THEN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
            NEW.role := OLD.role;
        END IF;
        IF NEW.xp IS DISTINCT FROM OLD.xp THEN
            NEW.xp := OLD.xp;
        END IF;
        IF NEW.level IS DISTINCT FROM OLD.level THEN
            NEW.level := OLD.level;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER check_profile_updates
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_critical_profile_fields();

-- 3. Automatic Updates Timestamp Trigger
CREATE OR REPLACE FUNCTION public.update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_timestamp BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();
CREATE TRIGGER update_posts_timestamp BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();
CREATE TRIGGER update_comments_timestamp BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();
CREATE TRIGGER update_courses_timestamp BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();
CREATE TRIGGER update_subscriptions_timestamp BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

-- 4. Counter Cache Triggers (Post Likes Count & Comments Count)
-- Automatically increments/decrements counts to reduce read query loads
CREATE OR REPLACE FUNCTION public.adjust_likes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.posts SET likes_count = likes_count - 1 WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_post_likes_count
    AFTER INSERT OR DELETE ON public.likes
    FOR EACH ROW EXECUTE FUNCTION public.adjust_likes_count();

CREATE OR REPLACE FUNCTION public.adjust_comments_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.posts SET comments_count = comments_count - 1 WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_post_comments_count
    AFTER INSERT OR DELETE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION public.adjust_comments_count();

-- ---------------------------------------------------------------------
-- 12. BACKUP & EXPORTS REMINDERS
-- ---------------------------------------------------------------------
-- NOTE ON BACKUPS: Supabase provides native daily automatic backups for Pro
-- and Enterprise tiers. For Point-in-Time Recovery (PITR), enable it in the 
-- Supabase Dashboard under Database -> Backups.
-- For standard CSV export logic, admin SQL queries can use standard COPY command, 
-- or we will perform client-side queries using supabase-js inside the Admin Views
-- to fetch profiles and subscriptions, then build/format standard CSV downloadable objects.

-- ---------------------------------------------------------------------
-- 13. SEED INITIAL DATA (CATEGORIES & COURSES)
-- ---------------------------------------------------------------------
-- Insert Categories
INSERT INTO public.categories (id, name, slug, description) VALUES
('d290f1ee-6c54-4b01-90e6-d701748f0851', 'Général 💬', 'general', 'Discussions générales de la communauté'),
('d290f1ee-6c54-4b01-90e6-d701748f0852', 'Questions / Réponses ❓', 'qa', 'Posez vos questions techniques ou méthodologiques'),
('d290f1ee-6c54-4b01-90e6-d701748f0853', 'Victoires 🎉', 'wins', 'Partagez vos succès, jalons et résultats !'),
('d290f1ee-6c54-4b01-90e6-d701748f0854', 'Annonces 📢', 'announces', 'Annonces officielles de l''équipe d''administration')
ON CONFLICT (id) DO NOTHING;

-- Insert Courses
INSERT INTO public.courses (id, title, description, cover_image_url, is_published) VALUES
('e190f1ee-6c54-4b01-90e6-d701748f0861', '🚀 SaaS MVP en 1 Semaine', 'Apprenez à concevoir, développer et déployer un MVP SaaS fonctionnel en partant de zéro avec React et Tailwind CSS.', 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600', true),
('e190f1ee-6c54-4b01-90e6-d701748f0862', '🔒 Sécurité Supabase & PostgreSQL Avancé', 'Maîtrisez les politiques Row Level Security (RLS), la gestion des rôles (RBAC), les déclencheurs Postgres et les sauvegardes.', 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600', true)
ON CONFLICT (id) DO NOTHING;

-- Insert Modules
INSERT INTO public.modules (id, course_id, title, order_index) VALUES
('f190f1ee-6c54-4b01-90e6-d701748f0871', 'e190f1ee-6c54-4b01-90e6-d701748f0861', 'Fondations et Architecture', 1),
('f190f1ee-6c54-4b01-90e6-d701748f0872', 'e190f1ee-6c54-4b01-90e6-d701748f0861', 'Intégration Backend & Déploiement', 2),
('f190f1ee-6c54-4b01-90e6-d701748f0873', 'e190f1ee-6c54-4b01-90e6-d701748f0862', 'Sécurité et RLS', 1)
ON CONFLICT (id) DO NOTHING;

-- Insert Lessons
INSERT INTO public.lessons (id, module_id, title, content, video_url, order_index) VALUES
('a190f1ee-6c54-4b01-90e6-d701748f0881', 'f190f1ee-6c54-4b01-90e6-d701748f0871', 'Introduction et Analyse des Besoins', 'Dans cette leçon, nous allons structurer notre cahier des charges et analyser les besoins clés de notre produit SaaS pour optimiser le temps de développement.', 'https://player.vimeo.com/video/502163294', 1),
('a190f1ee-6c54-4b01-90e6-d701748f0882', 'f190f1ee-6c54-4b01-90e6-d701748f0871', 'Initialisation du boilerplate React & TypeScript', 'Configuration initiale de Vite, Tailwind CSS, configuration des alias de dossiers et mise en place de TypeScript strict.', 'https://player.vimeo.com/video/502163294', 2),
('a190f1ee-6c54-4b01-90e6-d701748f0883', 'f190f1ee-6c54-4b01-90e6-d701748f0872', 'Connexion à Supabase Auth & Database', 'Création du projet Supabase, connexion du client frontend via variables d''environnement et gestion du cycle de vie de session utilisateur.', 'https://player.vimeo.com/video/502163294', 1),
('a190f1ee-6c54-4b01-90e6-d701748f0884', 'f190f1ee-6c54-4b01-90e6-d701748f0873', 'PostgreSQL Triggers & Row Level Security (RLS)', 'Découvrez comment verrouiller l''accès client, empêcher les élévations de rôles frauduleuses et automatiser la création de profils utilisateurs.', 'https://player.vimeo.com/video/502163294', 1)
ON CONFLICT (id) DO NOTHING;


-- =====================================================================
-- PHASE 2 DATABASE SCHEMAS & TRIGGERS UPDATE
-- =====================================================================

-- 1. Add premium badge column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

-- 2. Setup automated trigger to sync premium badge based on Stripe Subscription status
CREATE OR REPLACE FUNCTION public.sync_profile_premium_status()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        IF NEW.status = 'active' THEN
            UPDATE public.profiles SET is_premium = true WHERE id = NEW.user_id;
        ELSE
            UPDATE public.profiles SET is_premium = false WHERE id = NEW.user_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.profiles SET is_premium = false WHERE id = OLD.user_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_subscription_changed
    AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.sync_profile_premium_status();

-- 3. Create Storage bucket and policies for media uploads (videos/audios)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('course-media', 'course-media', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow public to view course media
CREATE POLICY "Public can view course media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'course-media');

-- Policy to let only admins upload media
CREATE POLICY "Admins can upload course media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'course-media' AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

CREATE POLICY "Admins can delete course media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'course-media' AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );


-- =====================================================================
-- PHASE 2.5 ADD ROLE CREATOR & COURSE OWNERSHIP
-- =====================================================================

-- 1. Alter profiles table CHECK constraint for roles to include 'creator'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'creator', 'admin'));

-- 2. Add owner_id to courses
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 3. Add is_premium to courses
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

-- 4. Add phone number to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- 3. Update Storage upload policy to let creators also upload media to course-media
DROP POLICY IF EXISTS "Admins can upload course media" ON storage.objects;
CREATE POLICY "Admins and Creators can upload course media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'course-media' AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'creator')
  );

DROP POLICY IF EXISTS "Admins can delete course media" ON storage.objects;
CREATE POLICY "Admins and Owners can delete course media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'course-media' AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'creator')
  );


-- =====================================================================
-- PHASE 3 ROLE SELECTOR, SINGLE ADMIN LIMIT & LIVESTREAM DONATIONS
-- =====================================================================

-- 1. Modify User Creation Trigger to read dynamic role from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, full_name, avatar_url, role, xp, level)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1) || '_' || substr(md5(random()::text), 1, 4)),
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'avatar_url',
        COALESCE(new.raw_user_meta_data->>'role', 'user'),
        0,
        1
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create single-admin enforcement constraint trigger
CREATE OR REPLACE FUNCTION public.check_max_admin()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.role = 'admin' THEN
        IF (SELECT COUNT(*) FROM public.profiles WHERE role = 'admin' AND id <> NEW.id) >= 1 THEN
            RAISE EXCEPTION 'Il ne peut y avoir qu''un seul administrateur sur la plateforme.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER enforce_max_admin
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.check_max_admin();

-- 3. Create Livestreams table
CREATE TABLE IF NOT EXISTS public.livestreams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) >= 3),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.livestreams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active livestreams"
    ON public.livestreams FOR SELECT
    USING (true);

CREATE POLICY "Creators and Admins can manage livestreams"
    ON public.livestreams FOR ALL
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'creator')
    );

-- 4. Create Donations table
CREATE TABLE IF NOT EXISTS public.donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id UUID REFERENCES public.livestreams(id) ON DELETE SET NULL,
    donor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view donations"
    ON public.donations FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can submit donations"
    ON public.donations FOR INSERT
    WITH CHECK (auth.uid() = donor_id);

-- 5. Create Donation XP reward automation trigger
CREATE OR REPLACE FUNCTION public.reward_donation_xp()
RETURNS TRIGGER AS $$
DECLARE
    current_xp INTEGER;
    next_level INTEGER;
BEGIN
    -- Update XP (1€ = 5 XP)
    UPDATE public.profiles
    SET xp = xp + CAST(NEW.amount * 5 AS INTEGER)
    WHERE id = NEW.donor_id
    RETURNING xp INTO current_xp;

    -- Calculate level (L = floor(sqrt(xp/250)) + 1)
    next_level := floor(sqrt(current_xp / 250.0)) + 1;

    -- Update level if user leveled up
    UPDATE public.profiles
    SET level = next_level
    WHERE id = NEW.donor_id AND level < next_level;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_donation_created
    AFTER INSERT ON public.donations
    FOR EACH ROW EXECUTE FUNCTION public.reward_donation_xp();


-- ---------------------------------------------------------------------
-- 6. RPC FUNCTION TO SECURELY INCREMENT XP (BYPASSING RLS LIMITS)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_xp(user_id UUID, xp_to_add INTEGER)
RETURNS VOID AS $$
DECLARE
    current_xp INTEGER;
    next_level INTEGER;
BEGIN
    SELECT xp INTO current_xp FROM public.profiles WHERE id = user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Utilisateur introuvable';
    END IF;

    current_xp := current_xp + xp_to_add;
    next_level := floor(sqrt(current_xp / 250.0)) + 1;

    UPDATE public.profiles
    SET xp = current_xp, level = next_level
    WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ---------------------------------------------------------------------
-- 7. REAL-TIME CALL SIGNALING FOR WEBRTC VIDEO/AUDIO CALLS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'dialing' CHECK (status IN ('dialing', 'active', 'rejected', 'ended')),
    signal_data JSONB, -- Stores WebRTC SDP offer, answer and ICE candidates
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Calls
CREATE POLICY "Anyone involved in the call can view it"
    ON public.calls FOR SELECT
    USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

CREATE POLICY "Anyone involved in the call can insert it"
    ON public.calls FOR INSERT
    WITH CHECK (auth.uid() = caller_id);

CREATE POLICY "Anyone involved in the call can update it"
    ON public.calls FOR UPDATE
    USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

CREATE POLICY "Anyone involved in the call can delete it"
    ON public.calls FOR DELETE
    USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

-- Shared in-call notepad (synced live between the two participants).
ALTER TABLE public.calls ADD COLUMN IF NOT EXISTS notes TEXT;

-- In-call text chat messages
CREATE TABLE IF NOT EXISTS public.call_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_name TEXT,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_messages_call ON public.call_messages(call_id, created_at);

ALTER TABLE public.call_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Call participants can view messages"
    ON public.call_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.calls c
            WHERE c.id = call_id AND (c.caller_id = auth.uid() OR c.receiver_id = auth.uid())
        )
    );

CREATE POLICY "Call participants can send messages"
    ON public.call_messages FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
            SELECT 1 FROM public.calls c
            WHERE c.id = call_id AND (c.caller_id = auth.uid() OR c.receiver_id = auth.uid())
        )
    );


-- ---------------------------------------------------------------------
-- 8. RPC FUNCTION TO SECURELY REGISTER USERS (BYPASSING EMAIL LIMITS)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_db_user(
    u_email TEXT,
    u_password TEXT,
    u_username TEXT,
    u_fullname TEXT,
    u_role TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    new_user_id UUID := gen_random_uuid();
    encrypted_pw TEXT;
BEGIN
    -- Check single admin limit
    IF u_role = 'admin' THEN
        IF (SELECT COUNT(*) FROM public.profiles WHERE role = 'admin') >= 1 THEN
            RAISE EXCEPTION 'Il ne peut y avoir qu''un seul administrateur sur la plateforme.';
        END IF;
    END IF;

    -- Hash the password using bcrypt via pgcrypto
    encrypted_pw := extensions.crypt(u_password, extensions.gen_salt('bf', 10));

    -- Insert into auth.users
    INSERT INTO auth.users (
        id,
        instance_id,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        aud,
        role,
        created_at,
        updated_at
    )
    VALUES (
        new_user_id,
        '00000000-0000-0000-0000-000000000000',
        u_email,
        encrypted_pw,
        now(),
        '{"provider": "email", "providers": ["email"]}'::jsonb,
        jsonb_build_object('username', u_username, 'full_name', u_fullname, 'role', u_role),
        'authenticated',
        'authenticated',
        now(),
        now()
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;


-- =====================================================================
-- PHASE 4 POLLS (SONDAGES) & CRM NOTES
-- =====================================================================

-- 1. Create polls table
CREATE TABLE IF NOT EXISTS public.polls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create poll_options table
CREATE TABLE IF NOT EXISTS public.poll_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    votes_count INTEGER NOT NULL DEFAULT 0 CHECK (votes_count >= 0)
);

-- 3. Create poll_votes table (prevent multiple votes by the same user)
CREATE TABLE IF NOT EXISTS public.poll_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
    option_id UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (poll_id, user_id)
);

-- 4. Enable RLS
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Polls are viewable by anyone" ON public.polls FOR SELECT USING (true);
CREATE POLICY "Polls can be created by authenticated users" ON public.polls FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'creator')
  )
);
CREATE POLICY "Polls can be deleted by admins or creator of post" ON public.polls FOR DELETE USING (
  public.is_admin() OR EXISTS (
    SELECT 1 FROM public.posts
    WHERE id = post_id AND author_id = auth.uid()
  )
);

CREATE POLICY "Poll options are viewable by anyone" ON public.poll_options FOR SELECT USING (true);
CREATE POLICY "Poll options can be inserted by authenticated users" ON public.poll_options FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'creator')
  )
);

CREATE POLICY "Poll votes are viewable by anyone" ON public.poll_votes FOR SELECT USING (true);
CREATE POLICY "Authenticated users can vote" ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove/change their vote" ON public.poll_votes FOR DELETE USING (auth.uid() = user_id);

-- 6. Trigger to automatically adjust votes_count on options
CREATE OR REPLACE FUNCTION public.adjust_poll_votes_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.poll_options SET votes_count = votes_count + 1 WHERE id = NEW.option_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.poll_options SET votes_count = votes_count - 1 WHERE id = OLD.option_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER update_poll_option_votes_count
    AFTER INSERT OR DELETE ON public.poll_votes
    FOR EACH ROW EXECUTE FUNCTION public.adjust_poll_votes_count();

-- 7. Add crm_notes to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS crm_notes TEXT;

-- 8. Add secure function to let creators and admins update a user's CRM notes
CREATE OR REPLACE FUNCTION public.admin_update_crm_notes(target_user_id UUID, new_notes TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'creator')
    ) THEN
        UPDATE public.profiles
        SET crm_notes = new_notes
        WHERE id = target_user_id;
        RETURN TRUE;
    ELSE
        RAISE EXCEPTION 'Non autorisé';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- =====================================================================
-- PHASE 5: COLLABORATIVE CANVAS (TRAVAIL COLLABORATIF) & AUDIT LOGS
-- =====================================================================

-- 1. Collaborative Canvases table
CREATE TABLE IF NOT EXISTS public.collaborative_canvases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL CHECK (char_length(title) >= 1),
    content TEXT NOT NULL DEFAULT '',
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    font_family TEXT NOT NULL DEFAULT 'system-ui',
    text_size TEXT NOT NULL DEFAULT '16px',
    is_underlined BOOLEAN NOT NULL DEFAULT false,
    is_italic BOOLEAN NOT NULL DEFAULT false,
    highlight_color TEXT, -- Stores color name or hex (null means no highlight)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Canvas Participants table
CREATE TABLE IF NOT EXISTS public.canvas_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canvas_id UUID NOT NULL REFERENCES public.collaborative_canvases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (canvas_id, user_id)
);

-- 3. Canvas Audit Logs table (for Creators and Admins logs)
CREATE TABLE IF NOT EXISTS public.canvas_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canvas_id UUID REFERENCES public.collaborative_canvases(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- e.g., 'created', 'joined', 'edited', 'role_changed', 'removed_user'
    details TEXT NOT NULL, -- User-facing descriptive summary
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexing for speed
CREATE INDEX IF NOT EXISTS idx_canvas_participants_canvas ON public.canvas_participants(canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_participants_user ON public.canvas_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_canvas_audit_logs_canvas ON public.canvas_audit_logs(canvas_id);
CREATE INDEX IF NOT EXISTS idx_canvas_audit_logs_created ON public.canvas_audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.collaborative_canvases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.canvas_audit_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies

-- --- COLLABORATIVE CANVASES POLICIES ---
CREATE POLICY "Canvases are viewable by participants, creators or admins" 
    ON public.collaborative_canvases FOR SELECT 
    USING (
        creator_id = auth.uid() 
        OR public.is_admin() 
        OR EXISTS (
            SELECT 1 FROM public.canvas_participants cp 
            WHERE cp.canvas_id = collaborative_canvases.id AND cp.user_id = auth.uid()
        )
    );

CREATE POLICY "Canvases can be created by creators and admins" 
    ON public.collaborative_canvases FOR INSERT 
    WITH CHECK (
        creator_id = auth.uid() 
        AND EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'creator')
        )
    );

CREATE POLICY "Canvases can be updated by active editors, creators or admins" 
    ON public.collaborative_canvases FOR UPDATE 
    USING (
        creator_id = auth.uid() 
        OR public.is_admin() 
        OR EXISTS (
            SELECT 1 FROM public.canvas_participants cp 
            WHERE cp.canvas_id = collaborative_canvases.id AND cp.user_id = auth.uid() AND cp.role = 'editor'
        )
    )
    WITH CHECK (
        creator_id = auth.uid() 
        OR public.is_admin() 
        OR EXISTS (
            SELECT 1 FROM public.canvas_participants cp 
            WHERE cp.canvas_id = collaborative_canvases.id AND cp.user_id = auth.uid() AND cp.role = 'editor'
        )
    );

CREATE POLICY "Canvases can be deleted by creators or admins" 
    ON public.collaborative_canvases FOR DELETE 
    USING (creator_id = auth.uid() OR public.is_admin());

-- --- CANVAS PARTICIPANTS POLICIES ---
CREATE POLICY "Participants list viewable by authenticated users" 
    ON public.canvas_participants FOR SELECT 
    USING (auth.uid() IS NOT NULL);


CREATE POLICY "Users can join, or creators/admins can add participants" 
    ON public.canvas_participants FOR INSERT 
    WITH CHECK (
        auth.uid() = user_id
        OR public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.collaborative_canvases cc 
            WHERE cc.id = canvas_id AND cc.creator_id = auth.uid()
        )
    );


CREATE POLICY "Creators and admins can manage participants roles" 
    ON public.canvas_participants FOR UPDATE 
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.collaborative_canvases cc 
            WHERE cc.id = canvas_id AND cc.creator_id = auth.uid()
        )
    );

CREATE POLICY "Creators, admins or users themselves can leave/remove participants" 
    ON public.canvas_participants FOR DELETE 
    USING (
        auth.uid() = user_id
        OR public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.collaborative_canvases cc 
            WHERE cc.id = canvas_id AND cc.creator_id = auth.uid()
        )
    );

-- --- AUDIT LOGS POLICIES ---
CREATE POLICY "Audit logs viewable by canvas creators or admins" 
    ON public.canvas_audit_logs FOR SELECT 
    USING (
        public.is_admin()
        OR EXISTS (
            SELECT 1 FROM public.collaborative_canvases cc 
            WHERE cc.id = canvas_id AND cc.creator_id = auth.uid()
        )
    );

CREATE POLICY "Collaborators can append audit logs during changes" 
    ON public.canvas_audit_logs FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- 5. Helper function to log actions via RPC (bypasses direct client injection policies if needed)
CREATE OR REPLACE FUNCTION public.log_canvas_action_rpc(
    c_id UUID,
    u_id UUID,
    act TEXT,
    det TEXT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.canvas_audit_logs (canvas_id, user_id, action, details)
    VALUES (c_id, u_id, act, det);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ---------------------------------------------------------------------
-- 8. REALTIME PUBLICATION
-- ---------------------------------------------------------------------
-- The frontend relies on Supabase Realtime "postgres_changes" events for
-- incoming call detection (calls), live donation alerts (donations) and the
-- livestream catalog. Tables must be part of the supabase_realtime publication
-- AND have REPLICA IDENTITY FULL, otherwise these subscriptions never fire and
-- calls / live features appear broken.
DO $$
BEGIN
    -- Ensure the publication exists (it is created by default on Supabase).
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

ALTER TABLE public.calls REPLICA IDENTITY FULL;
ALTER TABLE public.donations REPLICA IDENTITY FULL;
ALTER TABLE public.livestreams REPLICA IDENTITY FULL;
ALTER TABLE public.call_messages REPLICA IDENTITY FULL;

-- Add tables to the realtime publication (guarded so re-running is safe).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'calls'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'donations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.donations;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'livestreams'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.livestreams;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'call_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.call_messages;
    END IF;
END $$;







