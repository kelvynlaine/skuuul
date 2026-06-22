-- ──────────────────────────────────────────────────────────────────────────
-- DIRECT MESSAGES SYSTEM
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  participant_b UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Deduplicate regardless of order
CREATE UNIQUE INDEX IF NOT EXISTS uniq_conversation
  ON conversations (
    LEAST(participant_a::TEXT, participant_b::TEXT),
    GREATEST(participant_a::TEXT, participant_b::TEXT)
  );

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants see their conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = participant_a OR auth.uid() = participant_b);
CREATE POLICY "Anyone can create a conversation"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = participant_a OR auth.uid() = participant_b);
CREATE POLICY "Participants can update (last_message_at)"
  ON conversations FOR UPDATE
  USING (auth.uid() = participant_a OR auth.uid() = participant_b);

CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(trim(content)) >= 1),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages REPLICA IDENTITY FULL;

-- Helpers: check participant membership
CREATE OR REPLACE FUNCTION is_conversation_participant(p_conv_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversations
    WHERE id = p_conv_id
      AND (participant_a = auth.uid() OR participant_b = auth.uid())
  );
$$;

CREATE POLICY "Participants see messages"
  ON direct_messages FOR SELECT
  USING (is_conversation_participant(conversation_id));
CREATE POLICY "Participants send messages"
  ON direct_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND is_conversation_participant(conversation_id));
CREATE POLICY "Participants update read flag"
  ON direct_messages FOR UPDATE
  USING (is_conversation_participant(conversation_id));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
  END IF;
END $$;

-- Auto-update last_message_at on new message
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_update_conv_last_msg ON direct_messages;
CREATE TRIGGER trg_update_conv_last_msg
  AFTER INSERT ON direct_messages FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- Notification on new DM
CREATE OR REPLACE FUNCTION notify_on_direct_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_receiver UUID;
  v_sender_username TEXT;
BEGIN
  SELECT CASE WHEN participant_a = NEW.sender_id THEN participant_b ELSE participant_a END
  INTO v_receiver
  FROM conversations WHERE id = NEW.conversation_id;

  SELECT username INTO v_sender_username FROM profiles WHERE id = NEW.sender_id;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    v_receiver,
    'direct_message',
    'Message de @' || v_sender_username,
    LEFT(NEW.content, 80),
    '/messages'
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_on_dm ON direct_messages;
CREATE TRIGGER trg_notify_on_dm
  AFTER INSERT ON direct_messages FOR EACH ROW EXECUTE FUNCTION notify_on_direct_message();
