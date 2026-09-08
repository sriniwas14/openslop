CREATE TABLE IF NOT EXISTS `content_template` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`preview_image` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
