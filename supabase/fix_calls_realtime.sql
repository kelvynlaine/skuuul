-- ──────────────────────────────────────────────────────────────────────────
-- FIX — Re-garantir le realtime sur la table `calls` (appels entrants)
-- À exécuter si les appels entrants ne s'affichent plus.
-- ──────────────────────────────────────────────────────────────────────────

-- REPLICA IDENTITY FULL : indispensable pour recevoir la ligne complète sur INSERT/UPDATE
ALTER TABLE public.calls REPLICA IDENTITY FULL;

-- (Ré)ajout de `calls` à la publication realtime si elle en est absente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
  END IF;
END $$;

-- Vérification : doit renvoyer une ligne 'calls'
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'calls';
