ALTER TABLE `generated_content` ADD COLUMN `visual_search_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `generated_content` ADD COLUMN `visual_search_error` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_generated_content_visual_search` ON `generated_content` (`company_id`,`visual_search_status`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `visual_asset` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`source` text DEFAULT 'pexels' NOT NULL,
	`source_asset_id` text NOT NULL,
	`source_url` text,
	`preview_url` text,
	`download_url` text,
	`local_url` text,
	`width` text,
	`height` text,
	`orientation` text,
	`alt_text` text,
	`tags` text,
	`metadata` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_visual_asset_company` ON `visual_asset` (`company_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_visual_asset_source_id` ON `visual_asset` (`source`,`source_asset_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `visual_search_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`date` text NOT NULL,
	`batch_number` text DEFAULT '1' NOT NULL,
	`cursor_key` text DEFAULT 'start' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`size` text DEFAULT '0' NOT NULL,
	`matched_count` text DEFAULT '0' NOT NULL,
	`needs_review_count` text DEFAULT '0' NOT NULL,
	`failed_count` text DEFAULT '0' NOT NULL,
	`content_ids` text,
	`next_cursor` text,
	`has_more` text DEFAULT '0' NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_visual_batch_company_status` ON `visual_search_batch` (`company_id`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_visual_batch_company_date_cursor` ON `visual_search_batch` (`company_id`,`date`,`cursor_key`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `visual_feed_daily` (
	`company_id` text NOT NULL,
	`date` text NOT NULL,
	`user_id` text NOT NULL,
	`prepared_count` text DEFAULT '0' NOT NULL,
	`daily_limit` text DEFAULT '100' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`company_id`, `date`)
);
