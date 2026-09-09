CREATE TABLE `library_post` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`content_id` text NOT NULL,
	`title` text,
	`hook` text,
	`body` text,
	`platform` text NOT NULL DEFAULT 'instagram',
	`content_format` text NOT NULL DEFAULT '',
	`content_type` text NOT NULL DEFAULT '',
	`visual_url` text,
	`media_type` text NOT NULL DEFAULT 'image',
	`poster_url` text,
	`blocks` text NOT NULL DEFAULT '[]',
	`gif_layer` text,
	`meme_url` text,
	`aspect` text,
	`edited_file` text,
	`edited_media_type` text,
	`needs_attention` text NOT NULL DEFAULT '0',
	`status` text NOT NULL DEFAULT 'draft',
	`scheduled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `library_media` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`media_type` text NOT NULL DEFAULT 'image',
	`file_url` text,
	`size` text NOT NULL DEFAULT '0',
	`blocks` text NOT NULL DEFAULT '[]',
	`gif_layer` text,
	`meme_url` text,
	`aspect` text,
	`status` text NOT NULL DEFAULT 'draft',
	`scheduled_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `idx_library_post_user` ON `library_post` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_library_post_company` ON `library_post` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_library_post_company_status` ON `library_post` (`company_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_library_post_company_content` ON `library_post` (`company_id`,`content_id`);--> statement-breakpoint
CREATE INDEX `idx_library_media_user` ON `library_media` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_library_media_company` ON `library_media` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_library_media_company_status` ON `library_media` (`company_id`,`status`);--> statement-breakpoint
