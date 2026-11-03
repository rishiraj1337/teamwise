-- Reconcile priority for existing Google Play Store rows from star rating.
-- 1–2★ → Medium; 3–5★ → Low (Play Store ingest rule only).
-- Mirror of playstore-reviews/sql/004_playstore_priority_from_star_rating.sql
USE `timePayReview`;

UPDATE `review` r
INNER JOIN `review_priority` p
  ON p.name = CASE
    WHEN r.star_ratings <= 2 THEN 'Medium'
    ELSE 'Low'
  END
  AND p.is_active = 1
SET
  r.priority = p.name,
  r.priority_id = p.id,
  r.updated_at = CURRENT_TIMESTAMP(3)
WHERE TRIM(r.channel) = 'Google Playstore'
  AND r.star_ratings BETWEEN 1 AND 5;
