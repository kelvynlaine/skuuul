-- ──────────────────────────────────────────────────────────────────────────
-- CREATOR ANALYTICS RPCS
-- ──────────────────────────────────────────────────────────────────────────

-- Monthly revenue for the calling creator (last 12 months)
CREATE OR REPLACE FUNCTION get_creator_revenue_stats()
RETURNS TABLE (month TEXT, revenue BIGINT, sales_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    TO_CHAR(DATE_TRUNC('month', cp.created_at), 'YYYY-MM') AS month,
    COALESCE(SUM(cp.amount), 0)::BIGINT AS revenue,
    COUNT(*)::BIGINT AS sales_count
  FROM course_purchases cp
  JOIN courses c ON c.id = cp.course_id
  WHERE c.owner_id = auth.uid()
    AND cp.status = 'approved'
    AND cp.created_at >= NOW() - INTERVAL '12 months'
  GROUP BY DATE_TRUNC('month', cp.created_at)
  ORDER BY DATE_TRUNC('month', cp.created_at);
$$;

-- Per-course stats for the calling creator
CREATE OR REPLACE FUNCTION get_creator_course_stats()
RETURNS TABLE (
  course_id UUID,
  title TEXT,
  price INTEGER,
  student_count BIGINT,
  total_lessons BIGINT,
  avg_completion NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    c.id AS course_id,
    c.title,
    c.price,
    COUNT(DISTINCT cp.user_id)::BIGINT AS student_count,
    (
      SELECT COUNT(*) FROM lessons l2
      JOIN modules m2 ON m2.id = l2.module_id
      WHERE m2.course_id = c.id
    )::BIGINT AS total_lessons,
    COALESCE(
      AVG(
        (
          SELECT COUNT(*) FROM lesson_progress lp2
          JOIN lessons l2 ON l2.id = lp2.lesson_id
          JOIN modules m2 ON m2.id = l2.module_id
          WHERE m2.course_id = c.id AND lp2.user_id = cp.user_id
        )::NUMERIC / NULLIF(
          (SELECT COUNT(*) FROM lessons l2 JOIN modules m2 ON m2.id = l2.module_id WHERE m2.course_id = c.id),
          0
        )
      ) * 100,
      0
    ) AS avg_completion
  FROM courses c
  LEFT JOIN course_purchases cp ON cp.course_id = c.id AND cp.status = 'approved'
  WHERE c.owner_id = auth.uid()
  GROUP BY c.id, c.title, c.price
  ORDER BY student_count DESC;
$$;
