CREATE TABLE IF NOT EXISTS `brand_intelligence` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`brand` text,
	`identity_and_product` text,
	`purpose_and_positioning` text,
	`audience` text,
	`tone_and_voice` text,
	`content_angles` text,
	`market_and_competition` text,
	`metadata` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_brand_intel_user` ON `brand_intelligence` (`user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_brand_intel_company` ON `brand_intelligence` (`company_id`);
