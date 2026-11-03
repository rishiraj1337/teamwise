-- Store poll intervals in minutes; seed from legacy seconds/days/hours when missing.
USE `timePayReview`;

INSERT INTO `system_settings` (`setting_key`, `setting_value`, `category`, `description`)
SELECT
  'polling_email_interval_minutes',
  CAST(GREATEST(1, ROUND(CAST(`setting_value` AS DECIMAL(20, 6)) / 60)) AS CHAR),
  'polling',
  'Interval between email polling cycles in minutes'
FROM `system_settings`
WHERE `setting_key` = 'polling_email_interval_seconds'
  AND NOT EXISTS (
    SELECT 1 FROM `system_settings` AS existing WHERE existing.`setting_key` = 'polling_email_interval_minutes'
  )
LIMIT 1;

INSERT INTO `system_settings` (`setting_key`, `setting_value`, `category`, `description`)
SELECT
  'polling_playstore_interval_minutes',
  CAST(GREATEST(1, ROUND(CAST(`setting_value` AS DECIMAL(20, 6)) * 1440)) AS CHAR),
  'polling',
  'Interval between Play Store review sync cycles in minutes'
FROM `system_settings`
WHERE `setting_key` = 'polling_playstore_interval_days'
  AND NOT EXISTS (
    SELECT 1 FROM `system_settings` AS existing WHERE existing.`setting_key` = 'polling_playstore_interval_minutes'
  )
LIMIT 1;

INSERT INTO `system_settings` (`setting_key`, `setting_value`, `category`, `description`)
SELECT
  'polling_chatbot_interval_minutes',
  CAST(GREATEST(1, ROUND(CAST(`setting_value` AS DECIMAL(20, 6)) * 60)) AS CHAR),
  'polling',
  'Interval between Chatbot feedback poll cycles in minutes'
FROM `system_settings`
WHERE `setting_key` = 'polling_chatbot_interval_hours'
  AND NOT EXISTS (
    SELECT 1 FROM `system_settings` AS existing WHERE existing.`setting_key` = 'polling_chatbot_interval_minutes'
  )
LIMIT 1;

INSERT INTO `system_settings` (`setting_key`, `setting_value`, `category`, `description`)
VALUES
  ('polling_email_interval_minutes', '1', 'polling', 'Interval between email polling cycles in minutes'),
  ('polling_playstore_interval_minutes', '1440', 'polling', 'Interval between Play Store review sync cycles in minutes'),
  ('polling_chatbot_interval_minutes', '60', 'polling', 'Interval between Chatbot feedback poll cycles in minutes')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
