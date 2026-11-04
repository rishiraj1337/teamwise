-- Schema definition for Enterprise Unified Review Platform
-- Compliance and Security: UTF8MB4, strict constraints, audit trails

CREATE DATABASE IF NOT EXISTS `timePayReview` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS `teamwisedb` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- Grant permissions for teamwise application user
GRANT ALL PRIVILEGES ON `timePayReview`.* TO 'teamwise'@'%';
GRANT ALL PRIVILEGES ON `teamwisedb`.* TO 'teamwise'@'%';
FLUSH PRIVILEGES;

USE `timePayReview`;

CREATE TABLE IF NOT EXISTS `review_priority` (
  `id` TINYINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL UNIQUE,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `review_status` (
  `id` TINYINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL UNIQUE,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `review_category` (
  `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `review_subcategory` (
  `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `category_id` SMALLINT UNSIGNED NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_cat_subcat` (`category_id`, `name`),
  KEY `idx_subcat_category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `review` (
  `channel` VARCHAR(100) NOT NULL DEFAULT 'N/A',
  `unique_id` VARCHAR(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT '',
  `app_version_code` VARCHAR(50) NOT NULL DEFAULT 'N/A',
  `app_version_name` VARCHAR(100) NOT NULL DEFAULT 'N/A',
  `review_timestamp` DATETIME(3) NOT NULL,
  `star_ratings` TINYINT UNSIGNED NOT NULL,
  `review_text` VARCHAR(1000) NOT NULL DEFAULT 'N/A',
  `category` VARCHAR(100) NOT NULL DEFAULT 'N/A',
  `subcategory` TEXT NOT NULL,
  `priority` VARCHAR(50) NOT NULL DEFAULT 'N/A',
  `status` VARCHAR(50) NOT NULL DEFAULT 'N/A',
  `resolution` VARCHAR(1000) NOT NULL DEFAULT 'N/A',
  `department` VARCHAR(100) NOT NULL DEFAULT 'N/A',
  `response_timestamp` DATETIME(3) NULL,
  `resolution_date` DATE NULL,
  `developer_reply_time` DATETIME(3) NULL,
  `developer_reply_text` VARCHAR(1000) NOT NULL DEFAULT 'N/A',
  `review_link` VARCHAR(512) NOT NULL DEFAULT 'N/A',
  `priority_id` TINYINT UNSIGNED NULL,
  `category_id` SMALLINT UNSIGNED NULL,
  `subcategory_id` SMALLINT UNSIGNED NULL,
  `created_at` DATETIME(3) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`unique_id`),
  KEY `idx_review_timestamp` (`review_timestamp`),
  KEY `idx_review_channel` (`channel`),
  KEY `idx_review_category` (`category`),
  KEY `idx_review_ratings` (`star_ratings`),
  KEY `idx_review_priority_id` (`priority_id`),
  KEY `idx_review_category_id` (`category_id`),
  KEY `idx_review_subcategory_id` (`subcategory_id`),
  CONSTRAINT `chk_star_ratings` CHECK (`star_ratings` BETWEEN 1 AND 5)
) ENGINE=InnoDB
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `review_id_sequence` (
  `id` TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  `next_id` BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `review_source_id_map` (
  `source_review_id` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  `review_unique_id` VARCHAR(16) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `review_collection_checkpoint` (
  `language` VARCHAR(16) NOT NULL PRIMARY KEY,
  `last_successful_collection_at` DATETIME(3) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `chatbot_collection_checkpoint` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `last_polled_at` DATETIME(3) NOT NULL,
  `cursor_value` VARCHAR(255) NULL
) ENGINE=InnoDB;

-- Chatbot complaint category names live in review_category (see taxonomyRepository / chatbotRepository).

CREATE TABLE IF NOT EXISTS `chatbot_sessions` (
  `id` VARCHAR(64) NOT NULL PRIMARY KEY,
  `complaint_id` VARCHAR(64) NOT NULL,
  `category_name` VARCHAR(100) NOT NULL DEFAULT 'N/A',
  `ticket_category` VARCHAR(100) NOT NULL DEFAULT 'N/A',
  `status` TINYINT NOT NULL DEFAULT 0,
  `rating_app` VARCHAR(50) NULL,
  `feedback_rate` TEXT NULL,
  `payer_name` VARCHAR(150) NOT NULL DEFAULT 'N/A',
  `mob_no` VARCHAR(20) NOT NULL DEFAULT 'N/A',
  `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `txn_type` VARCHAR(50) NOT NULL DEFAULT 'N/A',
  `txn_status` VARCHAR(50) NOT NULL DEFAULT 'N/A',
  `final_status` VARCHAR(50) NOT NULL DEFAULT 'N/A',
  `rrn` VARCHAR(50) NOT NULL DEFAULT 'N/A',
  `txn_id` VARCHAR(100) NOT NULL DEFAULT 'N/A',
  `app_version` VARCHAR(50) NOT NULL DEFAULT 'N/A',
  `device_model` VARCHAR(100) NOT NULL DEFAULT 'N/A',
  `created_at` DATETIME(3) NOT NULL,
  `chat_details` JSON NOT NULL,
  `txn_details` JSON NOT NULL,
  `review_unique_id` VARCHAR(16) NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY `idx_cb_complaint_id` (`complaint_id`),
  KEY `idx_cb_created_at` (`created_at`),
  KEY `idx_cb_status` (`status`),
  KEY `idx_cb_txn_type` (`txn_type`),
  KEY `idx_cb_category` (`category_name`)
) ENGINE=InnoDB
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key` VARCHAR(100) NOT NULL PRIMARY KEY,
  `setting_value` TEXT NOT NULL,
  `category` VARCHAR(50) NOT NULL DEFAULT 'general',
  `description` VARCHAR(255) NOT NULL DEFAULT '',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NULL,
  `user_email` VARCHAR(191) NOT NULL DEFAULT 'system',
  `action` VARCHAR(100) NOT NULL,
  `resource` VARCHAR(100) NOT NULL,
  `details` TEXT NULL,
  `ip_address` VARCHAR(45) NOT NULL DEFAULT '127.0.0.1',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `idx_audit_created_at` (`created_at`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_action` (`action`)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `notification_subscriptions` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT UNSIGNED NULL,
  `endpoint` TEXT NOT NULL,
  `keys_auth` VARCHAR(255) NOT NULL,
  `keys_p256dh` VARCHAR(255) NOT NULL,
  `device_label` VARCHAR(100) NOT NULL DEFAULT 'Desktop',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

-- Filtered & Non-Support Emails Quarantined Bucket
CREATE TABLE IF NOT EXISTS `filtered_emails` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `message_id` VARCHAR(255) NOT NULL DEFAULT '',
  `from_address` VARCHAR(255) NOT NULL DEFAULT '',
  `subject` VARCHAR(500) NOT NULL DEFAULT '',
  `received_date_time` DATETIME(3) NULL,
  `support_flag` VARCHAR(50) NOT NULL DEFAULT 'not_support',
  `rejection_reason` VARCHAR(255) NOT NULL DEFAULT '',
  `file_name` VARCHAR(255) NOT NULL DEFAULT '',
  `body_snippet` VARCHAR(1000) NOT NULL DEFAULT '',
  `raw_metadata` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `idx_filtered_received` (`received_date_time`),
  KEY `idx_filtered_flag` (`support_flag`),
  KEY `idx_filtered_created` (`created_at`)
) ENGINE=InnoDB
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_0900_ai_ci;
