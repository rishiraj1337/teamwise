-- Move legacy chatbot_categories rows into review_category, then drop the old table.
USE `timePayReview`;

INSERT INTO `review_category` (`name`, `is_active`)
SELECT DISTINCT TRIM(c.`name`), IF(c.`active`, 1, 0)
FROM `chatbot_categories` c
WHERE TRIM(c.`name`) <> ''
ON DUPLICATE KEY UPDATE `is_active` = GREATEST(`review_category`.`is_active`, VALUES(`is_active`));

INSERT INTO `review_subcategory` (`category_id`, `name`, `is_active`)
SELECT rc.`id`, 'General', 1
FROM `review_category` rc
INNER JOIN (
  SELECT DISTINCT TRIM(`name`) AS name FROM `chatbot_categories` WHERE TRIM(`name`) <> ''
) cc ON cc.name = rc.name
ON DUPLICATE KEY UPDATE `is_active` = VALUES(`is_active`);

DROP TABLE IF EXISTS `chatbot_categories`;
