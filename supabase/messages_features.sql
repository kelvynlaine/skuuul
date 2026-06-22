-- ──────────────────────────────────────────────────────────────────────────
-- MESSAGES — NOUVELLES FONCTIONNALITÉS
-- À exécuter dans le SQL Editor Supabase, lot par lot.
-- ──────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════
-- LOT 1 — Répondre / Édition / Épingler  (Recherche dans le fil = front only)
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES direct_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_pinned   BOOLEAN DEFAULT false;

-- La policy UPDATE existante ("Participants update read flag") couvre déjà
-- l'édition du contenu et l'épinglage par un participant (USING is_conversation_participant).
-- REPLICA IDENTITY FULL est déjà actif sur direct_messages → les events UPDATE
-- realtime renvoient bien la ligne complète (contenu édité, is_pinned).
