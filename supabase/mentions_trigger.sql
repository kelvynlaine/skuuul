-- ──────────────────────────────────────────────────────────────────────────
-- MENTIONS TRIGGER
-- Parse @username in post/comment content and create notifications
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_on_mention()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_username TEXT;
  v_mentioned_user_id UUID;
  v_author_username TEXT;
  v_content TEXT;
  v_link TEXT;
BEGIN
  -- Determine content and link based on table
  IF TG_TABLE_NAME = 'posts' THEN
    v_content := NEW.title || ' ' || NEW.content;
    v_link := '/?post=' || NEW.id::TEXT;
    SELECT username INTO v_author_username FROM profiles WHERE id = NEW.author_id;
  ELSE
    v_content := NEW.content;
    v_link := '/?post=' || NEW.post_id::TEXT;
    SELECT username INTO v_author_username FROM profiles WHERE id = NEW.author_id;
  END IF;

  -- Extract all @username mentions
  FOR v_username IN
    SELECT DISTINCT (regexp_matches(v_content, '@([A-Za-z0-9_]+)', 'g'))[1]
  LOOP
    SELECT id INTO v_mentioned_user_id FROM profiles WHERE username = v_username;

    IF v_mentioned_user_id IS NULL THEN CONTINUE; END IF;

    -- Don't notify yourself
    IF v_mentioned_user_id = NEW.author_id THEN CONTINUE; END IF;

    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (
      v_mentioned_user_id,
      'mention',
      '@' || v_author_username || ' vous a mentionné',
      LEFT(v_content, 100),
      v_link
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mention_in_post ON posts;
CREATE TRIGGER trg_mention_in_post
  AFTER INSERT ON posts FOR EACH ROW EXECUTE FUNCTION notify_on_mention();

DROP TRIGGER IF EXISTS trg_mention_in_comment ON comments;
CREATE TRIGGER trg_mention_in_comment
  AFTER INSERT ON comments FOR EACH ROW EXECUTE FUNCTION notify_on_mention();
