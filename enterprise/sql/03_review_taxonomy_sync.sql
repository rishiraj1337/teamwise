-- Canonical review taxonomy (priorities, statuses, categories) for timePayReview.
-- Keep in sync with playstore-reviews/sql/005_sync_review_taxonomy.sql
USE `timePayReview`;

INSERT INTO `review_priority` (`name`, `is_active`) VALUES
  ('Low', 1),
  ('Medium', 1),
  ('High', 1),
  ('Urgent', 1)
ON DUPLICATE KEY UPDATE `is_active` = VALUES(`is_active`);

CREATE TABLE IF NOT EXISTS `review_status` (
  `id` TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_review_status_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO `review_status` (`name`, `is_active`, `sort_order`) VALUES
  ('New', 1, 1),
  ('In Progress', 1, 2),
  ('Resolved', 1, 3),
  ('Closed', 1, 4),
  ('N/A', 1, 5)
ON DUPLICATE KEY UPDATE
  `is_active` = VALUES(`is_active`),
  `sort_order` = VALUES(`sort_order`);

UPDATE `review` SET `status` = 'New' WHERE LOWER(TRIM(`status`)) IN ('new', 'open', 'pending');
UPDATE `review` SET `status` = 'In Progress' WHERE LOWER(TRIM(`status`)) IN ('in progress', 'in_progress', 'inprogress');
UPDATE `review` SET `status` = 'Resolved' WHERE LOWER(TRIM(`status`)) IN ('resolved', 'done', 'complete');
UPDATE `review` SET `status` = 'Closed' WHERE LOWER(TRIM(`status`)) = 'closed';
UPDATE `review` SET `status` = 'N/A' WHERE TRIM(`status`) = '' OR LOWER(TRIM(`status`)) = 'n/a';

UPDATE `review` SET `priority` = 'Medium' WHERE LOWER(TRIM(`priority`)) IN ('moderate', 'medium');
UPDATE `review` SET `priority` = 'Low' WHERE LOWER(TRIM(`priority`)) = 'low';
UPDATE `review` SET `priority` = 'High' WHERE LOWER(TRIM(`priority`)) = 'high';
UPDATE `review` SET `priority` = 'Urgent' WHERE LOWER(TRIM(`priority`)) = 'urgent';

UPDATE `review` r
INNER JOIN `review_priority` p ON p.name = r.priority AND p.is_active = 1
SET r.priority_id = p.id
WHERE r.priority_id IS NULL OR r.priority_id <> p.id;

UPDATE `review` SET `category` = 'Playstore review'
WHERE LOWER(TRIM(`category`)) IN ('playstore feedback', 'playstore review');

UPDATE `review` r
INNER JOIN `review_category` c ON c.name = 'Playstore review'
INNER JOIN `review_subcategory` s ON s.category_id = c.id AND s.name = 'Positive'
SET r.subcategory = 'Positive', r.subcategory_id = s.id, r.category_id = c.id
WHERE r.category = 'Playstore review' AND LOWER(TRIM(r.subcategory)) = 'positive';

UPDATE `review` r
INNER JOIN `review_category` c ON c.name = 'Playstore review'
INNER JOIN `review_subcategory` s ON s.category_id = c.id AND s.name = 'Negative'
SET r.subcategory = 'Negative', r.subcategory_id = s.id, r.category_id = c.id
WHERE r.category = 'Playstore review' AND LOWER(TRIM(r.subcategory)) = 'negative';
