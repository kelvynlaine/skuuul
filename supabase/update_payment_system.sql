-- ---------------------------------------------------------------------
-- 1. MISE À JOUR DE LA TABLE public.profiles (Ajout de l'IBAN)
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS iban TEXT;

-- ---------------------------------------------------------------------
-- 2. MISE À JOUR DE LA TABLE public.courses (Ajout du prix)
-- ---------------------------------------------------------------------
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS price INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_price_check;
ALTER TABLE public.courses ADD CONSTRAINT courses_price_check CHECK (price >= 0 AND price <= 1000000);

-- ---------------------------------------------------------------------
-- 3. CRÉATION DE LA TABLE public.course_purchases
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.course_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount >= 0),
    transfer_reference TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_course_purchase UNIQUE (user_id, course_id)
);

-- Indexation pour optimiser les requêtes
CREATE INDEX IF NOT EXISTS idx_course_purchases_user ON public.course_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_course_purchases_course ON public.course_purchases(course_id);
CREATE INDEX IF NOT EXISTS idx_course_purchases_status ON public.course_purchases(status);

-- Activation de Row Level Security (RLS)
ALTER TABLE public.course_purchases ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 4. POLITIQUES DE SÉCURITÉ RLS SUR public.course_purchases
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own purchases" ON public.course_purchases;
CREATE POLICY "Users can view their own purchases" ON public.course_purchases
    FOR SELECT USING (
        auth.uid() = user_id 
        OR public.is_admin() 
        OR auth.uid() = (SELECT owner_id FROM public.courses WHERE id = course_id)
    );

DROP POLICY IF EXISTS "Users can request a purchase" ON public.course_purchases;
CREATE POLICY "Users can request a purchase" ON public.course_purchases
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
    );

DROP POLICY IF EXISTS "Creators and admins can update purchase status" ON public.course_purchases;
CREATE POLICY "Creators and admins can update purchase status" ON public.course_purchases
    FOR UPDATE USING (
        public.is_admin() 
        OR auth.uid() = (SELECT owner_id FROM public.courses WHERE id = course_id)
    ) WITH CHECK (
        public.is_admin() 
        OR auth.uid() = (SELECT owner_id FROM public.courses WHERE id = course_id)
    );

DROP POLICY IF EXISTS "Admins and owners can delete pending purchases" ON public.course_purchases;
CREATE POLICY "Admins and owners can delete pending purchases" ON public.course_purchases
    FOR DELETE USING (
        public.is_admin()
        OR (auth.uid() = user_id AND status IN ('pending', 'rejected'))
    );

-- ---------------------------------------------------------------------
-- 5. TRIGGER DE MISE À JOUR DE TIMESTAMP SUR course_purchases
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_course_purchases_timestamp ON public.course_purchases;
CREATE TRIGGER update_course_purchases_timestamp
    BEFORE UPDATE ON public.course_purchases
    FOR EACH ROW
    EXECUTE FUNCTION public.update_timestamp_column();

-- ---------------------------------------------------------------------
-- 6. MISE À JOUR DU TRIGGER DE CRÉATION D'UTILISATEUR (INCORPORATION IBAN)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, full_name, avatar_url, role, iban, xp, level, is_premium)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1) || '_' || substr(md5(random()::text), 1, 4)),
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'avatar_url',
        COALESCE(new.raw_user_meta_data->>'role', 'user'),
        new.raw_user_meta_data->>'iban',
        0,
        1,
        (new.email = 'kelvynwear@gmail.com')
    );
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
