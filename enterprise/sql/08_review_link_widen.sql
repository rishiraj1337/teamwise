-- Google Play review URLs include long reviewId query params (often > 255 chars).
USE `timePayReview`;

ALTER TABLE `review`
  MODIFY COLUMN `review_link` VARCHAR(512) NOT NULL DEFAULT 'N/A';
