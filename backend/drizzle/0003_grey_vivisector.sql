CREATE TABLE `content` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`images` text,
	`scripts` text,
	`format` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_user` ON `content` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_content_company` ON `content` (`company_id`);--> statement-breakpoint
CREATE INDEX `idx_content_kind` ON `content` (`kind`);