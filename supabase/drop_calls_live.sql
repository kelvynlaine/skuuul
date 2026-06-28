-- ──────────────────────────────────────────────────────────────────────────
-- SUPPRESSION DÉFINITIVE des fonctionnalités Appels & Live
-- ⚠️ IRRÉVERSIBLE — supprime les tables et toutes leurs données.
-- À exécuter dans le SQL Editor Supabase.
-- ──────────────────────────────────────────────────────────────────────────

-- Fonctions/triggers dépendants éventuels (XP sur don, etc.)
DROP FUNCTION IF EXISTS public.on_donation_created() CASCADE;

-- Tables (CASCADE retire policies, triggers et contraintes liées)
DROP TABLE IF EXISTS public.call_messages CASCADE;
DROP TABLE IF EXISTS public.calls CASCADE;
DROP TABLE IF EXISTS public.donations CASCADE;
DROP TABLE IF EXISTS public.livestreams CASCADE;
