CREATE TABLE IF NOT EXISTS `generated_content` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`job_id` text,
	`content_angle_id` text NOT NULL,
	`platform` text NOT NULL,
	`content_format` text NOT NULL,
	`content_type` text NOT NULL,
	`generation_mode` text DEFAULT 'initial' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`hook` text,
	`title` text,
	`body` text,
	`lines` text,
	`script` text,
	`on_screen_text` text,
	`cta` text,
	`visual_tags` text,
	`visual_mood` text,
	`visual_style` text,
	`visual_category` text,
	`visual_orientation` text DEFAULT 'portrait' NOT NULL,
	`status` text DEFAULT 'generated' NOT NULL,
	`source` text DEFAULT 'ai' NOT NULL,
	`model` text,
	`prompt_version` text,
	`content_hash` text,
	`visual_intent_id` text,
	`visual_asset_id` text,
	`usage_count` text DEFAULT '0' NOT NULL,
	`is_edited` text DEFAULT '0' NOT NULL,
	`edited_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_generated_content_user` ON `generated_content` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_generated_content_company` ON `generated_content` (`company_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_generated_content_angle` ON `generated_content` (`company_id`,`content_angle_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_generated_content_status` ON `generated_content` (`company_id`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_generated_content_visual_ready` ON `generated_content` (`company_id`,`visual_asset_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_generated_content_hash` ON `generated_content` (`company_id`,`content_hash`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `content_generation_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`type` text DEFAULT 'initial_content_generation' NOT NULL,
	`target_count` text DEFAULT '100' NOT NULL,
	`generated_count` text DEFAULT '0' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`model` text,
	`prompt_version` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_content_gen_job_user` ON `content_generation_job` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_content_gen_job_status` ON `content_generation_job` (`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_content_gen_job_company_type` ON `content_generation_job` (`company_id`,`type`);
