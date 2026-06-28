-- ──────────────────────────────────────────────────────────────────────────
-- MESSAGERIE — Groupes (créateurs/admins) + Sondages dans les messages
-- À exécuter dans le SQL Editor Supabase (après direct_messages.sql + messages_features.sql).
-- ──────────────────────────────────────────────────────────────────────────

-- Helper (idempotent) : créateur ou admin ?
CREATE OR REPLACE FUNCTION is_creator_or_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('creator','admin'));
$$;


-- ════════════════════════════════════════════════════════════════════════
-- 1. GROUPES — on étend le modèle `conversations` existant
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_group   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS name       TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Pour les groupes, participant_a/b ne sont plus obligatoires
ALTER TABLE conversations ALTER COLUMN participant_a DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN participant_b DROP NOT NULL;

-- Membres d'une conversation (utilisé pour les groupes ; les DM gardent participant_a/b)
CREATE TABLE IF NOT EXISTS conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',          -- 'member' | 'admin'
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);
ALTER TABLE conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members REPLICA IDENTITY FULL;

-- Helper SECURITY DEFINER : suis-je le créateur de cette conversation ?
-- (bypass RLS → évite le problème d'œuf-et-poule à la création du groupe)
CREATE OR REPLACE FUNCTION is_conversation_creator(p_conv_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM conversations WHERE id = p_conv_id AND created_by = auth.uid());
$$;

-- is_conversation_participant() couvre désormais participant_a/b OU appartenance au groupe
CREATE OR REPLACE FUNCTION is_conversation_participant(p_conv_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations
    WHERE id = p_conv_id AND (participant_a = auth.uid() OR participant_b = auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM conversation_members
    WHERE conversation_id = p_conv_id AND user_id = auth.uid()
  );
$$;

-- RLS conversation_members
DROP POLICY IF EXISTS "members select" ON conversation_members;
CREATE POLICY "members select" ON conversation_members FOR SELECT
  USING (is_conversation_participant(conversation_id));
DROP POLICY IF EXISTS "members insert" ON conversation_members;
CREATE POLICY "members insert" ON conversation_members FOR INSERT
  WITH CHECK (auth.uid() = user_id OR is_conversation_creator(conversation_id));
DROP POLICY IF EXISTS "members delete" ON conversation_members;
CREATE POLICY "members delete" ON conversation_members FOR DELETE
  USING (auth.uid() = user_id OR is_conversation_creator(conversation_id));

-- RLS conversations : SELECT (DM participants OU membres OU créateur)
DROP POLICY IF EXISTS "Participants see their conversations" ON conversations;
CREATE POLICY "Participants see their conversations" ON conversations FOR SELECT
  USING (
    auth.uid() = participant_a OR auth.uid() = participant_b
    OR created_by = auth.uid()
    OR is_conversation_participant(id)
  );

-- RLS conversations : INSERT (DM 1:1 par un participant, OU groupe par créateur/admin)
DROP POLICY IF EXISTS "Anyone can create a conversation" ON conversations;
CREATE POLICY "Anyone can create a conversation" ON conversations FOR INSERT
  WITH CHECK (
    (COALESCE(is_group, false) = false AND (auth.uid() = participant_a OR auth.uid() = participant_b))
    OR (is_group = true AND created_by = auth.uid() AND is_creator_or_admin())
  );

-- Publication realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversation_members;
  END IF;
END $$;

-- Le check « blocage » ne s'applique qu'aux DM (pas aux groupes)
CREATE OR REPLACE FUNCTION check_blocked_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_receiver UUID;
  v_is_group BOOLEAN;
BEGIN
  SELECT is_group,
         CASE WHEN participant_a = NEW.sender_id THEN participant_b ELSE participant_a END
  INTO v_is_group, v_receiver
  FROM conversations WHERE id = NEW.conversation_id;

  IF COALESCE(v_is_group, false) = false AND v_receiver IS NOT NULL
     AND EXISTS (SELECT 1 FROM blocked_users WHERE blocker_id = v_receiver AND blocked_id = NEW.sender_id) THEN
    RAISE EXCEPTION 'Vous avez été bloqué par ce destinataire.';
  END IF;
  RETURN NEW;
END;
$$;

-- Notification : fan-out vers tous les membres du groupe (sauf l'expéditeur), sinon DM
CREATE OR REPLACE FUNCTION notify_on_direct_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_group BOOLEAN;
  v_group_name TEXT;
  v_receiver UUID;
  v_sender_username TEXT;
  v_body TEXT;
BEGIN
  SELECT is_group, name INTO v_is_group, v_group_name FROM conversations WHERE id = NEW.conversation_id;
  SELECT username INTO v_sender_username FROM profiles WHERE id = NEW.sender_id;

  v_body := COALESCE(NULLIF(LEFT(NEW.content, 80), ''),
            CASE NEW.attachment_type WHEN 'image' THEN '📷 Photo'
                                     WHEN 'audio' THEN '🎤 Message vocal'
                                     WHEN 'file'  THEN '📎 Fichier'
                                     ELSE 'Nouveau message' END);

  IF COALESCE(v_is_group, false) THEN
    -- Notifier chaque membre (sauf l'expéditeur), en respectant la sourdine
    INSERT INTO notifications (user_id, type, title, body, link)
    SELECT m.user_id, 'direct_message',
           COALESCE(v_group_name, 'Groupe') || ' · @' || v_sender_username,
           v_body, '/messages'
    FROM conversation_members m
    WHERE m.conversation_id = NEW.conversation_id
      AND m.user_id <> NEW.sender_id
      AND NOT EXISTS (SELECT 1 FROM conversation_settings cs
                      WHERE cs.user_id = m.user_id AND cs.conversation_id = NEW.conversation_id AND cs.muted);
    RETURN NEW;
  END IF;

  -- DM 1:1
  SELECT CASE WHEN participant_a = NEW.sender_id THEN participant_b ELSE participant_a END
  INTO v_receiver FROM conversations WHERE id = NEW.conversation_id;

  IF EXISTS (SELECT 1 FROM conversation_settings WHERE user_id = v_receiver AND conversation_id = NEW.conversation_id AND muted) THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM blocked_users WHERE blocker_id = v_receiver AND blocked_id = NEW.sender_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (v_receiver, 'direct_message', 'Message de @' || v_sender_username, v_body, '/messages');
  RETURN NEW;
END;
$$;


-- ════════════════════════════════════════════════════════════════════════
-- 2. SONDAGES DANS LES MESSAGES
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS has_poll BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS message_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL UNIQUE REFERENCES direct_messages(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS message_poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES message_polls(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  votes_count INTEGER NOT NULL DEFAULT 0 CHECK (votes_count >= 0)
);
CREATE TABLE IF NOT EXISTS message_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES message_polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES message_poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(poll_id, user_id)
);

ALTER TABLE message_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_poll_votes REPLICA IDENTITY FULL;

-- Lecture réservée aux participants de la conversation du message
DROP POLICY IF EXISTS "mpoll select" ON message_polls;
CREATE POLICY "mpoll select" ON message_polls FOR SELECT USING (
  EXISTS (SELECT 1 FROM direct_messages dm WHERE dm.id = message_polls.message_id
          AND is_conversation_participant(dm.conversation_id))
);
DROP POLICY IF EXISTS "mpoll insert" ON message_polls;
CREATE POLICY "mpoll insert" ON message_polls FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM direct_messages dm WHERE dm.id = message_id AND dm.sender_id = auth.uid())
);

DROP POLICY IF EXISTS "mpollopt select" ON message_poll_options;
CREATE POLICY "mpollopt select" ON message_poll_options FOR SELECT USING (
  EXISTS (SELECT 1 FROM message_polls p JOIN direct_messages dm ON dm.id = p.message_id
          WHERE p.id = message_poll_options.poll_id AND is_conversation_participant(dm.conversation_id))
);
DROP POLICY IF EXISTS "mpollopt insert" ON message_poll_options;
CREATE POLICY "mpollopt insert" ON message_poll_options FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM message_polls p JOIN direct_messages dm ON dm.id = p.message_id
          WHERE p.id = poll_id AND dm.sender_id = auth.uid())
);

DROP POLICY IF EXISTS "mpollvote select" ON message_poll_votes;
CREATE POLICY "mpollvote select" ON message_poll_votes FOR SELECT USING (
  EXISTS (SELECT 1 FROM message_polls p JOIN direct_messages dm ON dm.id = p.message_id
          WHERE p.id = message_poll_votes.poll_id AND is_conversation_participant(dm.conversation_id))
);
DROP POLICY IF EXISTS "mpollvote insert" ON message_poll_votes;
CREATE POLICY "mpollvote insert" ON message_poll_votes FOR INSERT WITH CHECK (
  auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM message_polls p JOIN direct_messages dm ON dm.id = p.message_id
    WHERE p.id = poll_id AND is_conversation_participant(dm.conversation_id))
);
DROP POLICY IF EXISTS "mpollvote delete" ON message_poll_votes;
CREATE POLICY "mpollvote delete" ON message_poll_votes FOR DELETE USING (auth.uid() = user_id);

-- Compteur de votes auto (même pattern que la Communauté)
CREATE OR REPLACE FUNCTION adjust_message_poll_votes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE message_poll_options SET votes_count = votes_count + 1 WHERE id = NEW.option_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE message_poll_options SET votes_count = GREATEST(votes_count - 1, 0) WHERE id = OLD.option_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_adjust_message_poll_votes ON message_poll_votes;
CREATE TRIGGER trg_adjust_message_poll_votes
  AFTER INSERT OR DELETE ON message_poll_votes
  FOR EACH ROW EXECUTE FUNCTION adjust_message_poll_votes_count();
