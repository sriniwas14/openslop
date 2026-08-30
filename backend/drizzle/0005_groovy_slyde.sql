CREATE TABLE IF NOT EXISTS `ai_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`video_config_id` text,
	`video_model` text,
	`image_config_id` text,
	`image_model` text,
	`text_config_id` text,
	`text_model` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `onboarding_progress` (
	`user_id` text PRIMARY KEY NOT NULL,
	`step` text DEFAULT '1' NOT NULL,
	`data` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ai_config` ADD `project_id` text;--> statement-breakpoint
ALTER TABLE `ai_config` ADD `location` text;
