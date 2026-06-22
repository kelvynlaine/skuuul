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


-- ════════════════════════════════════════════════════════════════════════
-- LOT 2 — Réactions emoji / Pièces jointes (images & fichiers) / Messages vocaux
-- ════════════════════════════════════════════════════════════════════════

-- ── Colonnes pièces jointes (images / fichiers / audio) ──
ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS attachment_url      TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type     TEXT,   -- 'image' | 'file' | 'audio'
  ADD COLUMN IF NOT EXISTS attachment_name     TEXT,
  ADD COLUMN IF NOT EXISTS attachment_duration INT;    -- secondes (audio)

-- Autoriser un contenu vide quand une pièce jointe est présente
ALTER TABLE direct_messages ALTER COLUMN content SET DEFAULT '';
ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_content_check;
ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_content_or_attachment;
ALTER TABLE direct_messages
  ADD CONSTRAINT direct_messages_content_or_attachment
  CHECK (length(trim(content)) >= 1 OR attachment_url IS NOT NULL);

-- ── Réactions emoji (tapbacks) ──
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Participants read reactions" ON message_reactions;
CREATE POLICY "Participants read reactions" ON message_reactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM direct_messages dm
          WHERE dm.id = message_reactions.message_id
            AND is_conversation_participant(dm.conversation_id))
);
DROP POLICY IF EXISTS "Participants add own reactions" ON message_reactions;
CREATE POLICY "Participants add own reactions" ON message_reactions FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM direct_messages dm
    WHERE dm.id = message_id AND is_conversation_participant(dm.conversation_id))
);
DROP POLICY IF EXISTS "Users remove own reactions" ON message_reactions;
CREATE POLICY "Users remove own reactions" ON message_reactions FOR DELETE USING (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
  END IF;
END $$;

-- ── Bucket Storage pour les médias des DM ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('dm-media', 'dm-media', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='dm-media public read') THEN
    CREATE POLICY "dm-media public read" ON storage.objects FOR SELECT USING (bucket_id = 'dm-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='dm-media authenticated upload') THEN
    CREATE POLICY "dm-media authenticated upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'dm-media' AND auth.role() = 'authenticated');
  END IF;
END $$;
