-- Adds review FK columns and backfills from legacy text columns.
-- Mirror of playstore-reviews/sql/003_review_classification_fks.sql
USE `timePayReview`;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'review' AND COLUMN_NAME = 'category_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE `review`
     ADD COLUMN `category_id` INT UNSIGNED NULL AFTER `subcategory`,
     ADD COLUMN `subcategory_id` INT UNSIGNED NULL AFTER `category_id`,
     ADD COLUMN `priority_id` TINYINT UNSIGNED NULL AFTER `subcategory_id`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `review` r
JOIN `review_priority` p ON p.name = CASE
  WHEN LOWER(TRIM(r.priority)) = 'moderate' THEN 'Medium'
  WHEN LOWER(TRIM(r.priority)) = 'low' THEN 'Low'
  WHEN LOWER(TRIM(r.priority)) = 'high' THEN 'High'
  WHEN LOWER(TRIM(r.priority)) IN ('n/a', '') AND r.star_ratings <= 2 THEN 'Medium'
  WHEN LOWER(TRIM(r.priority)) IN ('n/a', '') AND r.star_ratings >= 3 THEN 'Low'
  ELSE TRIM(r.priority)
END
SET r.priority_id = p.id,
    r.priority = p.name;

UPDATE `review` r
JOIN `review_category` c ON c.name = CASE
  WHEN LOWER(TRIM(r.category)) IN ('playstore feedback', 'playstore review') THEN 'Playstore review'
  ELSE TRIM(r.category)
END
SET r.category_id = c.id,
    r.category = c.name
WHERE TRIM(r.category) <> 'N/A';

UPDATE `review` r
JOIN `review_category` c ON c.id = r.category_id
JOIN `review_subcategory` s ON s.category_id = c.id AND (
  s.name = TRIM(r.subcategory)
  OR (c.name = 'Playstore review' AND LOWER(TRIM(r.subcategory)) = 'positive' AND s.name = 'Positive')
  OR (c.name = 'Playstore review' AND LOWER(TRIM(r.subcategory)) = 'negative' AND s.name = 'Negative')
)
SET r.subcategory_id = s.id,
    r.subcategory = s.name
WHERE TRIM(r.subcategory) <> 'N/A';
