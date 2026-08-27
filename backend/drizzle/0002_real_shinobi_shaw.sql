CREATE TABLE `ai_config` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`api_key` text,
	`base_url` text,
	`model` text,
	`name` text,
	`is_default` text DEFAULT '0' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_config_user` ON `ai_config` (`user_id`);