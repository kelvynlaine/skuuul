-- ──────────────────────────────────────────────────────────────────────────
-- GLOBAL SEARCH RPC
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION global_search(query TEXT)
RETURNS TABLE (
  type TEXT,
  id UUID,
  title TEXT,
  subtitle TEXT,
  url TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  (SELECT
    'post'::TEXT,
    p.id,
    p.title,
    LEFT(p.content, 80),
    ('/?post=' || p.id::TEXT)::TEXT
  FROM posts p
  WHERE
    length(trim(query)) >= 2
    AND (
      p.title ILIKE '%' || query || '%'
      OR to_tsvector('french', p.title || ' ' || p.content) @@ plainto_tsquery('french', query)
    )
  LIMIT 5)

  UNION ALL

  (SELECT
    'course'::TEXT,
    c.id,
    c.title,
    LEFT(COALESCE(c.description, ''), 80),
    '/classroom'::TEXT
  FROM courses c
  WHERE
    c.is_published = true
    AND length(trim(query)) >= 2
    AND (
      c.title ILIKE '%' || query || '%'
      OR to_tsvector('french', c.title || ' ' || COALESCE(c.description, '')) @@ plainto_tsquery('french', query)
    )
  LIMIT 5)

  UNION ALL

  (SELECT
    'user'::TEXT,
    pr.id,
    COALESCE(pr.full_name, pr.username),
    '@' || pr.username,
    ('/profile/' || pr.username)::TEXT
  FROM profiles pr
  WHERE
    length(trim(query)) >= 2
    AND (
      pr.username ILIKE '%' || query || '%'
      OR pr.full_name ILIKE '%' || query || '%'
    )
  LIMIT 5);
$$;
