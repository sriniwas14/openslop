ALTER TABLE `content` ADD `scheduled_at` text;--> statement-breakpoint
CREATE INDEX `idx_content_scheduled_at` ON `content` (`scheduled_at`);