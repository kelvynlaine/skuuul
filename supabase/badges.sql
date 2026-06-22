-- ──────────────────────────────────────────────────────────────────────────
-- BADGES & ACHIEVEMENTS SYSTEM
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT '🏅',
  xp_reward INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own and public badges" ON user_badges FOR SELECT USING (true);
CREATE POLICY "System inserts badges" ON user_badges FOR INSERT WITH CHECK (true);
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badges are public" ON badges FOR SELECT USING (true);

-- ── Seed badges ───────────────────────────────────────────────────────────
INSERT INTO badges (slug, name, description, icon, xp_reward) VALUES
  ('first_post',      'Première Publication',   'Créer son premier post dans la communauté',    '✍️',  50),
  ('first_comment',   'Premier Commentaire',    'Laisser son premier commentaire',               '💬',  25),
  ('level_5',         'Apprenti',               'Atteindre le niveau 5',                         '🌱', 100),
  ('level_10',        'Confirmé',               'Atteindre le niveau 10',                        '🔥', 250),
  ('level_25',        'Expert',                 'Atteindre le niveau 25',                        '⚡', 500),
  ('course_complete', 'Diplômé',                'Compléter un cours à 100 %',                    '🎓', 200),
  ('five_courses',    'Assidu',                 'Compléter 5 cours différents',                  '📚', 500),
  ('big_donor',       'Généreux',               'Faire un don de 50 € ou plus en une seule fois','💎', 150),
  ('first_purchase',  'Investisseur',           'Acheter son premier cours payant',              '🛒', 100),
  ('streaker',        'Régulier',               'Effectuer 10 actions en un seul jour',          '🗓️',  75)
ON CONFLICT (slug) DO NOTHING;

-- ── RPC: award badge if not already earned ───────────────────────────────
CREATE OR REPLACE FUNCTION award_badge_if_eligible(
  p_user_id UUID,
  p_slug TEXT
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_badge_id UUID;
  v_xp_reward INTEGER;
  v_badge_name TEXT;
  v_badge_icon TEXT;
  v_already INT;
BEGIN
  SELECT id, xp_reward, name, icon
  INTO v_badge_id, v_xp_reward, v_badge_name, v_badge_icon
  FROM badges WHERE slug = p_slug;

  IF v_badge_id IS NULL THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_already
  FROM user_badges WHERE user_id = p_user_id AND badge_id = v_badge_id;

  IF v_already > 0 THEN RETURN; END IF;

  INSERT INTO user_badges (user_id, badge_id) VALUES (p_user_id, v_badge_id);

  -- Bonus XP
  IF v_xp_reward > 0 THEN
    PERFORM increment_xp(p_user_id, v_xp_reward);
  END IF;

  -- Notification
  INSERT INTO notifications (user_id, type, title, body, link)
  VALUES (
    p_user_id,
    'badge_earned',
    v_badge_icon || ' Nouveau badge : ' || v_badge_name,
    'Félicitations ! Vous avez débloqué le badge "' || v_badge_name || '".',
    '/profile'
  );
END;
$$;

-- ── Trigger: first post badge ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_first_post_badge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM posts WHERE author_id = NEW.author_id;
  IF v_count = 1 THEN
    PERFORM award_badge_if_eligible(NEW.author_id, 'first_post');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_first_post_badge ON posts;
CREATE TRIGGER trg_first_post_badge
  AFTER INSERT ON posts FOR EACH ROW EXECUTE FUNCTION check_first_post_badge();

-- ── Trigger: first comment badge ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_first_comment_badge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM comments WHERE author_id = NEW.author_id;
  IF v_count = 1 THEN
    PERFORM award_badge_if_eligible(NEW.author_id, 'first_comment');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_first_comment_badge ON comments;
CREATE TRIGGER trg_first_comment_badge
  AFTER INSERT ON comments FOR EACH ROW EXECUTE FUNCTION check_first_comment_badge();

-- ── Trigger: level badges on XP increment ────────────────────────────────
CREATE OR REPLACE FUNCTION check_level_badges()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.level >= 5  AND OLD.level < 5  THEN PERFORM award_badge_if_eligible(NEW.id, 'level_5');  END IF;
  IF NEW.level >= 10 AND OLD.level < 10 THEN PERFORM award_badge_if_eligible(NEW.id, 'level_10'); END IF;
  IF NEW.level >= 25 AND OLD.level < 25 THEN PERFORM award_badge_if_eligible(NEW.id, 'level_25'); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_level_badges ON profiles;
CREATE TRIGGER trg_level_badges
  AFTER UPDATE OF level ON profiles FOR EACH ROW EXECUTE FUNCTION check_level_badges();

-- ── Trigger: course completion badges ────────────────────────────────────
CREATE OR REPLACE FUNCTION check_course_completion_badges()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_completed_courses INT;
BEGIN
  -- Count fully completed courses (all lessons done)
  SELECT COUNT(DISTINCT m.course_id) INTO v_completed_courses
  FROM lesson_progress lp
  JOIN lessons l ON l.id = lp.lesson_id
  JOIN modules m ON m.id = l.module_id
  WHERE lp.user_id = NEW.user_id
  AND NOT EXISTS (
    SELECT 1 FROM lessons l2
    JOIN modules m2 ON m2.id = l2.module_id
    WHERE m2.course_id = m.course_id
    AND NOT EXISTS (
      SELECT 1 FROM lesson_progress lp2
      WHERE lp2.user_id = NEW.user_id AND lp2.lesson_id = l2.id
    )
  );

  IF v_completed_courses >= 1 THEN PERFORM award_badge_if_eligible(NEW.user_id, 'course_complete'); END IF;
  IF v_completed_courses >= 5 THEN PERFORM award_badge_if_eligible(NEW.user_id, 'five_courses');   END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_course_completion_badges ON lesson_progress;
CREATE TRIGGER trg_course_completion_badges
  AFTER INSERT ON lesson_progress FOR EACH ROW EXECUTE FUNCTION check_course_completion_badges();

-- ── Trigger: big donor badge ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_big_donor_badge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.amount >= 50 THEN
    PERFORM award_badge_if_eligible(NEW.donor_id, 'big_donor');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_big_donor_badge ON donations;
CREATE TRIGGER trg_big_donor_badge
  AFTER INSERT ON donations FOR EACH ROW EXECUTE FUNCTION check_big_donor_badge();

-- ── Trigger: first purchase badge ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_first_purchase_badge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    PERFORM award_badge_if_eligible(NEW.user_id, 'first_purchase');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_first_purchase_badge ON course_purchases;
CREATE TRIGGER trg_first_purchase_badge
  AFTER UPDATE ON course_purchases FOR EACH ROW EXECUTE FUNCTION check_first_purchase_badge();
