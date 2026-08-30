ALTER TABLE `ai_config` ADD `service_account_json` text;
--> statement-breakpoint
ALTER TABLE `content` ADD `media_url` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `media_job` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`content_id` text,
	`config_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`task` text NOT NULL,
	`prompt` text NOT NULL,
	`input_url` text,
	`format` text,
	`output_index` text,
	`provider_task_id` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`output_url` text,
	`error` text,
	`attempts` text DEFAULT '0' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_media_job_user` ON `media_job` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_media_job_content` ON `media_job` (`content_id`);
--> statement-breakpoint
CREATE INDEX `idx_media_job_status` ON `media_job` (`status`);
