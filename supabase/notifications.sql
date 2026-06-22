-- ──────────────────────────────────────────────────────────────────────────
-- NOTIFICATIONS SYSTEM
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  -- 'comment', 'like', 'mention', 'purchase_approved', 'purchase_rejected',
  -- 'payout_approved', 'payout_rejected', 'badge_earned'
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can mark own notifications read"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);

ALTER TABLE notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- TRIGGER: new comment → notify post author
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_post_author UUID;
  v_post_title TEXT;
  v_commenter_username TEXT;
BEGIN
  SELECT author_id, title INTO v_post_author, v_post_title
  FROM posts WHERE id = NEW.post_id;

  -- Don't notify yourself
  IF v_post_author = NEW.author_id THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_commenter_username FROM profiles WHERE id = NEW.author_id;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    v_post_author,
    'comment',
    '@' || v_commenter_username || ' a commenté votre post',
    LEFT(NEW.content, 100),
    '/?post=' || NEW.post_id::TEXT
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_comment ON comments;
CREATE TRIGGER trg_notify_on_comment
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION notify_on_comment();

-- ──────────────────────────────────────────────────────────────────────────
-- TRIGGER: new like → notify post author (deduplicated per day)
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_post_author UUID;
  v_post_title TEXT;
  v_liker_username TEXT;
  v_recent_notif INT;
BEGIN
  SELECT author_id, title INTO v_post_author, v_post_title
  FROM posts WHERE id = NEW.post_id;

  IF v_post_author = NEW.user_id THEN
    RETURN NEW;
  END IF;

  -- Deduplicate: only 1 like-notif per post per day
  SELECT COUNT(*) INTO v_recent_notif
  FROM notifications
  WHERE user_id = v_post_author
    AND type = 'like'
    AND link = '/?post=' || NEW.post_id::TEXT
    AND created_at > now() - INTERVAL '24 hours';

  IF v_recent_notif > 0 THEN
    RETURN NEW;
  END IF;

  SELECT username INTO v_liker_username FROM profiles WHERE id = NEW.user_id;

  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    v_post_author,
    'like',
    '@' || v_liker_username || ' a aimé votre post',
    '"' || LEFT(v_post_title, 60) || '"',
    '/?post=' || NEW.post_id::TEXT
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_like ON likes;
CREATE TRIGGER trg_notify_on_like
  AFTER INSERT ON likes
  FOR EACH ROW EXECUTE FUNCTION notify_on_like();

-- ──────────────────────────────────────────────────────────────────────────
-- TRIGGER: course_purchases status change → notify buyer
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_purchase_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_course_title TEXT;
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_course_title FROM courses WHERE id = NEW.course_id;

  IF NEW.status = 'approved' THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id,
      'purchase_approved',
      'Paiement confirmé !',
      'Votre accès au cours "' || v_course_title || '" a été approuvé.',
      '/classroom'
    );
  ELSIF NEW.status = 'rejected' THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id,
      'purchase_rejected',
      'Paiement refusé',
      'Votre demande pour le cours "' || v_course_title || '" a été refusée.',
      '/classroom'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_purchase_status ON course_purchases;
CREATE TRIGGER trg_notify_on_purchase_status
  AFTER UPDATE ON course_purchases
  FOR EACH ROW EXECUTE FUNCTION notify_on_purchase_status();

-- ──────────────────────────────────────────────────────────────────────────
-- TRIGGER: payout_requests status change → notify creator
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_on_payout_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id,
      'payout_approved',
      'Retrait approuvé !',
      'Votre retrait de ' || NEW.amount || '€ a été approuvé et sera viré sur votre compte.',
      '/admin'
    );
  ELSIF NEW.status = 'rejected' THEN
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      NEW.user_id,
      'payout_rejected',
      'Retrait refusé',
      'Votre demande de retrait de ' || NEW.amount || '€ a été refusée. Votre solde a été recrédité.',
      '/admin'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_payout_status ON payout_requests;
CREATE TRIGGER trg_notify_on_payout_status
  AFTER UPDATE ON payout_requests
  FOR EACH ROW EXECUTE FUNCTION notify_on_payout_status();
