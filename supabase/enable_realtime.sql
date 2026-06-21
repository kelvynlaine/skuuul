-- ---------------------------------------------------------------------
-- SETUP CALLS / LIVESTREAMS / DONATIONS + ENABLE REALTIME
-- ---------------------------------------------------------------------
-- Run this once against your Supabase database (SQL Editor).
-- It is idempotent: safe to run multiple times.
--
-- It CREATES the tables the app needs if they are missing (this fixes the
-- "relation public.calls does not exist" error), sets up their RLS policies,
-- the donation XP reward trigger, and finally registers them with the
-- supabase_realtime publication so the frontend receives postgres_changes
-- events:
--   * calls       -> incoming call detection + call state (dialing/active/ended)
--   * donations   -> live donation alerts during a stream
--   * livestreams -> auto refresh of the live catalog


-- =====================================================================
-- 1. LIVESTREAMS
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.livestreams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) >= 3),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.livestreams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active livestreams" ON public.livestreams;
CREATE POLICY "Anyone can view active livestreams"
    ON public.livestreams FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Creators and Admins can manage livestreams" ON public.livestreams;
CREATE POLICY "Creators and Admins can manage livestreams"
    ON public.livestreams FOR ALL
    USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'creator')
    );


-- =====================================================================
-- 2. DONATIONS (+ XP reward trigger)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stream_id UUID REFERENCES public.livestreams(id) ON DELETE SET NULL,
    donor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view donations" ON public.donations;
CREATE POLICY "Anyone can view donations"
    ON public.donations FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Authenticated users can submit donations" ON public.donations;
CREATE POLICY "Authenticated users can submit donations"
    ON public.donations FOR INSERT
    WITH CHECK (auth.uid() = donor_id);

CREATE OR REPLACE FUNCTION public.reward_donation_xp()
RETURNS TRIGGER AS $$
DECLARE
    current_xp INTEGER;
    next_level INTEGER;
BEGIN
    UPDATE public.profiles
    SET xp = xp + CAST(NEW.amount * 5 AS INTEGER)
    WHERE id = NEW.donor_id
    RETURNING xp INTO current_xp;

    next_level := floor(sqrt(current_xp / 250.0)) + 1;

    UPDATE public.profiles
    SET level = next_level
    WHERE id = NEW.donor_id AND level < next_level;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_donation_created ON public.donations;
CREATE TRIGGER on_donation_created
    AFTER INSERT ON public.donations
    FOR EACH ROW EXECUTE FUNCTION public.reward_donation_xp();


-- =====================================================================
-- 3. CALLS (WebRTC signaling)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'dialing' CHECK (status IN ('dialing', 'active', 'rejected', 'ended')),
    signal_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone involved in the call can view it" ON public.calls;
CREATE POLICY "Anyone involved in the call can view it"
    ON public.calls FOR SELECT
    USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Anyone involved in the call can insert it" ON public.calls;
CREATE POLICY "Anyone involved in the call can insert it"
    ON public.calls FOR INSERT
    WITH CHECK (auth.uid() = caller_id);

DROP POLICY IF EXISTS "Anyone involved in the call can update it" ON public.calls;
CREATE POLICY "Anyone involved in the call can update it"
    ON public.calls FOR UPDATE
    USING (auth.uid() = caller_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Anyone involved in the call can delete it" ON public.calls;
CREATE POLICY "Anyone involved in the call can delete it"
    ON public.calls FOR DELETE
    USING (auth.uid() = caller_id OR auth.uid() = receiver_id);


-- =====================================================================
-- 4. ENABLE REALTIME
-- =====================================================================
-- Tables must be part of the supabase_realtime publication and have
-- REPLICA IDENTITY FULL, otherwise the frontend subscriptions never fire.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

ALTER TABLE public.calls REPLICA IDENTITY FULL;
ALTER TABLE public.donations REPLICA IDENTITY FULL;
ALTER TABLE public.livestreams REPLICA IDENTITY FULL;

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
END $$;
