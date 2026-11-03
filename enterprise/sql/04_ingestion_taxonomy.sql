-- Chatbot & Email-SFTP taxonomy: seed known ingestion labels and backfill from live data.
-- Keep in sync with playstore-reviews/sql/006_ingestion_taxonomy.sql
USE `timePayReview`;

INSERT INTO `review_category` (`name`, `is_active`) VALUES
  ('Chatbot Complaint', 1),
  ('P2P_RaiseComplaint', 1),
  ('P2M_RaiseComplaint', 1),
  ('Credit_Card', 1),
  ('Mobile_Prepaid', 1),
  ('Electricity', 1),
  ('DTH', 1),
  ('Fastag', 1),
  ('Loan Repayment', 1),
  ('Insurance', 1)
ON DUPLICATE KEY UPDATE `is_active` = VALUES(`is_active`);

INSERT INTO `review_subcategory` (`category_id`, `name`, `is_active`)
SELECT c.id, v.sub, 1
FROM `review_category` c
JOIN (
  SELECT 'Chatbot Complaint' AS cat, 'General' AS sub UNION ALL
  SELECT 'Chatbot Complaint', 'N/A' UNION ALL
  SELECT 'Chatbot Complaint', 'BBPS' UNION ALL
  SELECT 'Chatbot Complaint', 'P2M' UNION ALL
  SELECT 'Chatbot Complaint', 'P2P' UNION ALL
  SELECT 'P2P_RaiseComplaint', 'P2P' UNION ALL
  SELECT 'P2P_RaiseComplaint', 'General' UNION ALL
  SELECT 'P2P_RaiseComplaint', 'N/A' UNION ALL
  SELECT 'P2M_RaiseComplaint', 'P2M' UNION ALL
  SELECT 'P2M_RaiseComplaint', 'General' UNION ALL
  SELECT 'P2M_RaiseComplaint', 'N/A' UNION ALL
  SELECT 'Credit_Card', 'BBPS' UNION ALL
  SELECT 'Credit_Card', 'General' UNION ALL
  SELECT 'Credit_Card', 'N/A' UNION ALL
  SELECT 'Mobile_Prepaid', 'BBPS' UNION ALL
  SELECT 'Mobile_Prepaid', 'General' UNION ALL
  SELECT 'Mobile_Prepaid', 'N/A' UNION ALL
  SELECT 'Electricity', 'BBPS' UNION ALL
  SELECT 'Electricity', 'General' UNION ALL
  SELECT 'DTH', 'BBPS' UNION ALL
  SELECT 'DTH', 'General' UNION ALL
  SELECT 'Fastag', 'BBPS' UNION ALL
  SELECT 'Fastag', 'General' UNION ALL
  SELECT 'Loan Repayment', 'BBPS' UNION ALL
  SELECT 'Loan Repayment', 'General' UNION ALL
  SELECT 'Insurance', 'BBPS' UNION ALL
  SELECT 'Insurance', 'General'
) v ON v.cat = c.name
ON DUPLICATE KEY UPDATE `is_active` = VALUES(`is_active`);

INSERT INTO `review_category` (`name`, `is_active`)
SELECT DISTINCT TRIM(r.`category`), 1
FROM `review` r
WHERE r.`channel` IN ('Chatbot', 'Email-SFTP')
  AND TRIM(r.`category`) <> ''
  AND TRIM(r.`category`) <> 'N/A'
  AND NOT EXISTS (
    SELECT 1 FROM `review_category` c WHERE c.`name` = TRIM(r.`category`)
  );

INSERT INTO `review_subcategory` (`category_id`, `name`, `is_active`)
SELECT DISTINCT c.`id`, TRIM(r.`subcategory`), 1
FROM `review` r
INNER JOIN `review_category` c ON c.`name` = TRIM(r.`category`)
WHERE r.`channel` IN ('Chatbot', 'Email-SFTP')
  AND TRIM(r.`subcategory`) <> ''
  AND TRIM(r.`subcategory`) <> 'N/A'
  AND NOT EXISTS (
    SELECT 1 FROM `review_subcategory` s
    WHERE s.`category_id` = c.`id` AND s.`name` = TRIM(r.`subcategory`)
  );

INSERT INTO `review_category` (`name`, `is_active`)
SELECT DISTINCT TRIM(s.`category_name`), 1
FROM `chatbot_sessions` s
WHERE TRIM(s.`category_name`) <> ''
  AND TRIM(s.`category_name`) <> 'N/A'
  AND NOT EXISTS (
    SELECT 1 FROM `review_category` c WHERE c.`name` = TRIM(s.`category_name`)
  );

INSERT INTO `review_subcategory` (`category_id`, `name`, `is_active`)
SELECT DISTINCT c.`id`, TRIM(s.`ticket_category`), 1
FROM `chatbot_sessions` s
INNER JOIN `review_category` c ON c.`name` = TRIM(s.`category_name`)
WHERE TRIM(s.`ticket_category`) <> ''
  AND TRIM(s.`ticket_category`) <> 'N/A'
  AND NOT EXISTS (
    SELECT 1 FROM `review_subcategory` rs
    WHERE rs.`category_id` = c.`id` AND rs.`name` = TRIM(s.`ticket_category`)
  );

INSERT INTO `review_subcategory` (`category_id`, `name`, `is_active`)
SELECT DISTINCT c.`id`, TRIM(s.`txn_type`), 1
FROM `chatbot_sessions` s
INNER JOIN `review_category` c ON c.`name` = TRIM(s.`category_name`)
WHERE TRIM(s.`txn_type`) <> ''
  AND TRIM(s.`txn_type`) <> 'N/A'
  AND NOT EXISTS (
    SELECT 1 FROM `review_subcategory` rs
    WHERE rs.`category_id` = c.`id` AND rs.`name` = TRIM(s.`txn_type`)
  );

UPDATE `review` r
INNER JOIN `review_category` c ON c.`name` = TRIM(r.`category`)
INNER JOIN `review_subcategory` s ON s.`category_id` = c.`id` AND s.`name` = TRIM(r.`subcategory`)
SET r.`category_id` = c.`id`, r.`subcategory_id` = s.`id`
WHERE r.`channel` IN ('Chatbot', 'Email-SFTP')
  AND (r.`category_id` IS NULL OR r.`subcategory_id` IS NULL);
