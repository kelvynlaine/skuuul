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

-- Autoriser un contenu vide quand une pièce jointe est présente (gestion sûre des valeurs NULL)
ALTER TABLE direct_messages ALTER COLUMN content SET DEFAULT '';
ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_content_check;
ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_content_or_attachment;
ALTER TABLE direct_messages
  ADD CONSTRAINT direct_messages_content_or_attachment
  CHECK (COALESCE(length(trim(content)), 0) >= 1 OR attachment_url IS NOT NULL);

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

-- Ajout sécurisé à la publication Realtime (vérifie l'existence de la publication)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
    END IF;
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
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='dm-media authenticated delete') THEN
    CREATE POLICY "dm-media authenticated delete" ON storage.objects FOR DELETE USING (bucket_id = 'dm-media' AND auth.role() = 'authenticated');
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════
-- LOT 3 — Sourdine / Archivage / Blocage  +  Transfert de message
-- ════════════════════════════════════════════════════════════════════════

-- ── Réglages par conversation et par utilisateur (sourdine / archivage) ──
CREATE TABLE IF NOT EXISTS conversation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  muted BOOLEAN DEFAULT false,
  archived BOOLEAN DEFAULT false,
  UNIQUE(user_id, conversation_id)
);
ALTER TABLE conversation_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own conv settings select" ON conversation_settings;
CREATE POLICY "own conv settings select" ON conversation_settings FOR SELECT USING (
  auth.uid() = user_id AND is_conversation_participant(conversation_id)
);

DROP POLICY IF EXISTS "own conv settings insert" ON conversation_settings;
CREATE POLICY "own conv settings insert" ON conversation_settings FOR INSERT WITH CHECK (
  auth.uid() = user_id AND is_conversation_participant(conversation_id)
);

DROP POLICY IF EXISTS "own conv settings update" ON conversation_settings;
CREATE POLICY "own conv settings update" ON conversation_settings FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (
  auth.uid() = user_id AND is_conversation_participant(conversation_id)
);

-- ── Blocage d'utilisateurs ──
CREATE TABLE IF NOT EXISTS blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(blocker_id, blocked_id),
  CONSTRAINT cannot_block_self CHECK (blocker_id <> blocked_id) -- Empêche l'auto-blocage
);
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocked select" ON blocked_users;
CREATE POLICY "blocked select" ON blocked_users FOR SELECT USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);
DROP POLICY IF EXISTS "blocked insert" ON blocked_users;
CREATE POLICY "blocked insert" ON blocked_users FOR INSERT WITH CHECK (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "blocked delete" ON blocked_users;
CREATE POLICY "blocked delete" ON blocked_users FOR DELETE USING (auth.uid() = blocker_id);


-- ── Sécurité de base de données : Empêche un utilisateur bloqué d'écrire des messages ──
CREATE OR REPLACE FUNCTION check_blocked_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_receiver UUID;
BEGIN
  SELECT CASE WHEN participant_a = NEW.sender_id THEN participant_b ELSE participant_a END
  INTO v_receiver
  FROM conversations WHERE id = NEW.conversation_id;

  -- Si le destinataire a bloqué l'expéditeur, rejeter l'insertion
  IF EXISTS (SELECT 1 FROM blocked_users WHERE blocker_id = v_receiver AND blocked_id = NEW.sender_id) THEN
    RAISE EXCEPTION 'Vous avez été bloqué par ce destinataire.';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_blocked_before_insert ON direct_messages;
CREATE TRIGGER trg_check_blocked_before_insert
  BEFORE INSERT ON direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION check_blocked_on_message();


-- ── Le trigger de notification ignore les conversations en sourdine
--    et les expéditeurs bloqués par le destinataire ──
CREATE OR REPLACE FUNCTION notify_on_direct_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_receiver UUID;
  v_sender_username TEXT;
BEGIN
  SELECT CASE WHEN participant_a = NEW.sender_id THEN participant_b ELSE participant_a END
  INTO v_receiver
  FROM conversations WHERE id = NEW.conversation_id;

  -- Sourdine : pas de notification
  IF EXISTS (SELECT 1 FROM conversation_settings
             WHERE user_id = v_receiver AND conversation_id = NEW.conversation_id AND muted) THEN
    RETURN NEW;
  END IF;

  -- Le destinataire a bloqué l'expéditeur : pas de notification
  IF EXISTS (SELECT 1 FROM blocked_users
             WHERE blocker_id = v_receiver AND blocked_id = NEW.sender_id) THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_sender_username FROM profiles WHERE id = NEW.sender_id;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    v_receiver,
    'direct_message',
    'Message de @' || v_sender_username,
    COALESCE(NULLIF(LEFT(NEW.content, 80), ''),
             CASE NEW.attachment_type WHEN 'image' THEN '📷 Photo'
                                      WHEN 'audio' THEN '🎤 Message vocal'
                                      WHEN 'file'  THEN '📎 Fichier'
                                      ELSE 'Nouveau message' END),
    '/messages'
  );
  RETURN NEW;
END;
$$;

-- Enregistrement du trigger de notification si non présent
DROP TRIGGER IF EXISTS trg_notify_on_dm ON direct_messages;
CREATE TRIGGER trg_notify_on_dm
  AFTER INSERT ON direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_direct_message();
