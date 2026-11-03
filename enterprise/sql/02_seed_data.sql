-- Seed default system settings and configuration
-- Password for default admin: AdminPassword123!
-- Bcrypt hash generated with cost 10: $2a$10$w8T.NtrZ15u4V5iEwF25..e25K5QY7g0P0s2rS4z00lA.HsmYyZeq (or seeded via application boot)

USE `timePayReview`;

INSERT INTO `system_settings` (`setting_key`, `setting_value`, `category`, `description`) VALUES
('ai_enabled', 'true', 'ai', 'Global switch to enable or disable AI processing'),
('ai_provider', 'openrouter', 'ai', 'Active AI provider: openrouter or heuristic'),
('ai_model', 'meta-llama/llama-3.3-70b-instruct', 'ai', 'Model identifier for OpenRouter or custom LLM'),
('ai_api_key', '', 'ai', 'API Key for AI provider'),
('ai_base_url', 'https://openrouter.ai/api/v1', 'ai', 'Base URL for AI endpoint'),
('ai_timeout_ms', '30000', 'ai', 'AI API request timeout in milliseconds'),
('ai_categories', '["Playstore review", "Status Enquiry", "Technical", "UPI Lite"]', 'ai', 'Allowed category enums for AI extraction'),
('ai_subcategories', '{"Playstore review": ["Positive", "Negative"], "Status Enquiry": ["Refund Not Received", "Success", "Failed", "Elaborate", "Irrelevant", "Legal", "CC Bill payment navigation assistance"], "Technical": ["registration", "Account Blocked due to Suspicious activity", "Performance related", "BBPS dashboard query", "Bank balance check not working", "Elaborate", "Account deletion", "Device Integrity failed", "SIM select error", "Mobile number not received error", "Proceed to Pay issue", "Compatibility issue - Android below 13", "Unable to make payment for Slice Credit card bill", "Transaction failed - Reason for failure", "iOS registration issue", "Login issue", "We are facing come issue at our end error", "Unable to add Slice bank account", "OTP issue", "CC not showing up for Electricity bill payment", "Transaction Blocked Due to Security Verification error", "Reward not recorded on the Trx History page"], "UPI Lite": ["Lite wallet disappeared and Unable to top-up the bal", "Amount not added to Lite account", "Elaborate", "Risk threshold exceeded error", "Unable to activate Lite wallet"]}', 'ai', 'Allowed subcategory mappings for AI extraction'),
('ai_source_email_enabled', 'true', 'ai', 'Enable AI extraction for email ingestion'),
('ai_source_playstore_enabled', 'false', 'ai', 'Enable AI extraction for Play Store reviews (if false, map normally)'),
('ai_source_chatbot_enabled', 'false', 'ai', 'Enable AI extraction for Chatbot complaints (if false, map normally)'),

('polling_email_enabled', 'true', 'polling', 'Enable automatic SFTP/directory email ingestion polling'),
('polling_email_interval_minutes', '1', 'polling', 'Interval between email polling cycles in minutes'),

('polling_playstore_enabled', 'true', 'polling', 'Enable automatic Google Play Store reviews sync'),
('polling_playstore_interval_minutes', '1440', 'polling', 'Interval between Play Store review sync cycles in minutes'),
('polling_playstore_scrape_on_start', 'true', 'polling', 'Scrape Play Store reviews immediately on application startup'),

('polling_chatbot_enabled', 'true', 'polling', 'Enable automatic Chatbot feedback polling'),
('polling_chatbot_interval_minutes', '60', 'polling', 'Interval between Chatbot feedback poll cycles in minutes'),
('polling_chatbot_api_url', 'https://notification.timepayonline.com:8443/webListChatBot', 'polling', 'REST API URL of the Chatbot service to poll feedback from'),
('polling_chatbot_categories_url', 'https://notification.timepayonline.com:8443/api/categories', 'polling', 'Endpoint to fetch active complaint categories'),
('polling_chatbot_api_key', '', 'polling', 'API Key or bearer token to authenticate with the Chatbot service'),
('polling_chatbot_poll_on_start', 'true', 'polling', 'Poll Chatbot feedback immediately on application startup'),
('polling_chatbot_txn_types', '["BBPS", "P2M", "P2P"]', 'polling', 'Transaction types to query when polling chatbot feedback'),
('polling_chatbot_insecure_tls', 'true', 'polling', 'Allow self-signed or internal TLS certificates on port 8443'),

('playstore_app_package', 'com.npst.timepay.society', 'playstore', 'Android app package name for Google Play scraping'),
('playstore_country', 'in', 'playstore', 'Target country code for Google Play scraper'),
('playstore_languages', '["en", "hi"]', 'playstore', 'Language codes to scrape reviews for'),
('playstore_initial_import_days', '30', 'playstore', 'Days back for initial sync'),
('playstore_overlap_days', '7', 'playstore', 'Days back for subsequent sync window overlap'),
('playstore_max_items_per_lang', '5000', 'playstore', 'Max reviews to fetch per language run'),

('compliance_pii_masking', 'true', 'compliance', 'Mask sensitive personal data (emails, phones, card numbers) in review logs'),
('compliance_retention_days', '365', 'compliance', 'Data retention policy in days'),
('vault_enabled', 'false', 'security', 'Enable HashiCorp Vault for secrets retrieval'),
('vault_address', 'http://127.0.0.1:8200', 'security', 'HashiCorp Vault server address'),
('vault_token', '', 'security', 'HashiCorp Vault authentication token'),
('vault_path', 'secret/data/automation', 'security', 'Vault secret mount path'),
('keycloak_enabled', 'false', 'security', 'Enable Keycloak federated authentication'),
('keycloak_realm_url', '', 'security', 'Keycloak realm base URL'),
('keycloak_client_id', '', 'security', 'Keycloak client ID')
ON DUPLICATE KEY UPDATE `updated_at` = NOW(3);

INSERT INTO `review_id_sequence` (`id`, `next_id`)
SELECT 1, COALESCE(MAX(CAST(SUBSTRING(`unique_id`, 4) AS UNSIGNED)), 0) + 1
FROM `review`
WHERE `unique_id` REGEXP '^TPR[0-9]+$'
ON DUPLICATE KEY UPDATE `next_id` = GREATEST(`next_id`, VALUES(`next_id`));
