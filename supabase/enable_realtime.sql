-- ---------------------------------------------------------------------
-- ENABLE REALTIME FOR CALLS, DONATIONS & LIVESTREAMS
-- ---------------------------------------------------------------------
-- Run this once against an existing Supabase database (SQL Editor) if the
-- realtime features were not already enabled.
--
-- Why: the app subscribes to Supabase Realtime "postgres_changes" events:
--   * calls       -> incoming call detection + call state (dialing/active/ended)
--   * donations   -> live donation alerts during a stream
--   * livestreams -> auto refresh of the live catalog
-- These subscriptions only fire when the table is part of the
-- supabase_realtime publication and has REPLICA IDENTITY FULL.

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
