CREATE TABLE IF NOT EXISTS `instagram_source` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`username` text NOT NULL,
	`profile_url` text NOT NULL,
	`display_name` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_scraped_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_instagram_source_user` ON `instagram_source` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_instagram_source_company` ON `instagram_source` (`company_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_instagram_source_company_username` ON `instagram_source` (`company_id`,`username`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `instagram_post` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`source_id` text NOT NULL,
	`external_post_id` text NOT NULL,
	`shortcode` text,
	`post_url` text,
	`username` text,
	`owner_full_name` text,
	`caption` text,
	`media_type` text,
	`media_url` text,
	`thumbnail_url` text,
	`published_at` text,
	`likes` text,
	`comments` text,
	`shares` text,
	`views` text,
	`hashtags` text,
	`mentions` text,
	`source` text DEFAULT 'apify' NOT NULL,
	`raw_data` text,
	`scraped_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_instagram_post_user` ON `instagram_post` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_instagram_post_company` ON `instagram_post` (`company_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_instagram_post_source` ON `instagram_post` (`source_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_instagram_post_company_external` ON `instagram_post` (`company_id`,`external_post_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `instagram_scrape_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`source_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`apify_run_id` text,
	`dataset_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`posts_found` text,
	`error` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_instagram_scrape_job_user` ON `instagram_scrape_job` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_instagram_scrape_job_source` ON `instagram_scrape_job` (`source_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `social_credential` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text DEFAULT 'apify' NOT NULL,
	`api_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_social_credential_user_provider` ON `social_credential` (`user_id`,`provider`);
