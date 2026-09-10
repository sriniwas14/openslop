CREATE TABLE "ai_config" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"api_key" text,
	"access_key" text,
	"secret_key" text,
	"service_account_json" text,
	"base_url" text,
	"project_id" text,
	"location" text,
	"model" text,
	"config_id" text,
	"name" text,
	"is_default" text DEFAULT '0' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"video_config_id" text,
	"video_model" text,
	"image_config_id" text,
	"image_model" text,
	"text_config_id" text,
	"text_model" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_intelligence" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"brand" text,
	"identity_and_product" text,
	"purpose_and_positioning" text,
	"audience" text,
	"tone_and_voice" text,
	"content_angles" text,
	"market_and_competition" text,
	"metadata" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"website" text NOT NULL,
	"persona" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_generation_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"type" text DEFAULT 'initial_content_generation' NOT NULL,
	"target_count" text DEFAULT '100' NOT NULL,
	"generated_count" text DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"model" text,
	"prompt_version" text,
	"started_at" text,
	"completed_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_template" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"preview_image" text NOT NULL,
	"duration" text DEFAULT '15' NOT NULL,
	"structure" text,
	"style" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"images" text,
	"scripts" text,
	"media_url" text,
	"format" text,
	"duration" text,
	"influencer_id" text,
	"template_id" text,
	"scheduled_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_content" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"job_id" text,
	"content_angle_id" text NOT NULL,
	"platform" text NOT NULL,
	"content_format" text NOT NULL,
	"content_type" text NOT NULL,
	"generation_mode" text DEFAULT 'initial' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"hook" text,
	"title" text,
	"body" text,
	"lines" text,
	"script" text,
	"on_screen_text" text,
	"cta" text,
	"visual_tags" text,
	"visual_mood" text,
	"visual_style" text,
	"visual_category" text,
	"visual_orientation" text DEFAULT 'portrait' NOT NULL,
	"status" text DEFAULT 'generated' NOT NULL,
	"visual_search_status" text DEFAULT 'pending' NOT NULL,
	"visual_search_error" text,
	"source" text DEFAULT 'ai' NOT NULL,
	"model" text,
	"prompt_version" text,
	"content_hash" text,
	"meme_id" text,
	"meme_name" text,
	"meme_url" text,
	"meme_description" text,
	"creative_angle" text,
	"emotion" text,
	"brand_angle" text,
	"visual_intent_id" text,
	"visual_asset_id" text,
	"usage_count" text DEFAULT '0' NOT NULL,
	"is_edited" text DEFAULT '0' NOT NULL,
	"edited_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "influencer" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text NOT NULL,
	"prompt" text,
	"attributes" text,
	"source" text DEFAULT 'generated' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_post" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"source_id" text NOT NULL,
	"external_post_id" text NOT NULL,
	"shortcode" text,
	"post_url" text,
	"username" text,
	"owner_full_name" text,
	"caption" text,
	"media_type" text,
	"media_url" text,
	"thumbnail_url" text,
	"published_at" text,
	"likes" text,
	"comments" text,
	"shares" text,
	"views" text,
	"hashtags" text,
	"mentions" text,
	"source" text DEFAULT 'apify' NOT NULL,
	"raw_data" text,
	"scraped_at" text,
	"saved_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_scrape_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"source_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"apify_run_id" text,
	"dataset_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"posts_found" text,
	"error" text,
	"started_at" text,
	"completed_at" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instagram_source" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"username" text NOT NULL,
	"profile_url" text NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_scraped_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_media" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"media_type" text DEFAULT 'image' NOT NULL,
	"file_url" text,
	"size" text DEFAULT '0' NOT NULL,
	"blocks" text DEFAULT '[]' NOT NULL,
	"gif_layer" text,
	"meme_url" text,
	"aspect" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_post" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"content_id" text NOT NULL,
	"title" text,
	"hook" text,
	"body" text,
	"platform" text DEFAULT 'instagram' NOT NULL,
	"content_format" text DEFAULT '' NOT NULL,
	"content_type" text DEFAULT '' NOT NULL,
	"visual_url" text,
	"media_type" text DEFAULT 'image' NOT NULL,
	"poster_url" text,
	"blocks" text DEFAULT '[]' NOT NULL,
	"gif_layer" text,
	"meme_url" text,
	"aspect" text,
	"edited_file" text,
	"edited_media_type" text,
	"needs_attention" text DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_job" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"content_id" text,
	"config_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"router_config_id" text,
	"task" text NOT NULL,
	"prompt" text NOT NULL,
	"input_url" text,
	"format" text,
	"output_index" text,
	"provider_task_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"output_url" text,
	"error" text,
	"attempts" text DEFAULT '0' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memes" (
	"id" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"url" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"user_id" text PRIMARY KEY NOT NULL,
	"step" text DEFAULT '1' NOT NULL,
	"data" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text DEFAULT 'apify' NOT NULL,
	"api_key" text NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visual_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"source" text DEFAULT 'pexels' NOT NULL,
	"source_asset_id" text NOT NULL,
	"source_url" text,
	"preview_url" text,
	"download_url" text,
	"local_url" text,
	"width" text,
	"height" text,
	"orientation" text,
	"alt_text" text,
	"tags" text,
	"metadata" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visual_feed_daily" (
	"company_id" text NOT NULL,
	"date" text NOT NULL,
	"user_id" text NOT NULL,
	"prepared_count" text DEFAULT '0' NOT NULL,
	"daily_limit" text DEFAULT '100' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "visual_feed_daily_company_id_date_pk" PRIMARY KEY("company_id","date")
);
--> statement-breakpoint
CREATE TABLE "visual_search_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"date" text NOT NULL,
	"batch_number" text DEFAULT '1' NOT NULL,
	"cursor_key" text DEFAULT 'start' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"size" text DEFAULT '0' NOT NULL,
	"matched_count" text DEFAULT '0' NOT NULL,
	"needs_review_count" text DEFAULT '0' NOT NULL,
	"failed_count" text DEFAULT '0' NOT NULL,
	"content_ids" text,
	"next_cursor" text,
	"has_more" text DEFAULT '0' NOT NULL,
	"error" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_ai_config_user" ON "ai_config" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_brand_intel_user" ON "brand_intelligence" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_brand_intel_company" ON "brand_intelligence" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_company_user_id" ON "company" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_content_gen_job_user" ON "content_generation_job" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_content_gen_job_status" ON "content_generation_job" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_content_gen_job_company_type" ON "content_generation_job" USING btree ("company_id","type");--> statement-breakpoint
CREATE INDEX "idx_content_user" ON "content" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_content_company" ON "content" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_content_kind" ON "content" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_content_scheduled_at" ON "content" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_generated_content_user" ON "generated_content" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_generated_content_company" ON "generated_content" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_generated_content_angle" ON "generated_content" USING btree ("company_id","content_angle_id");--> statement-breakpoint
CREATE INDEX "idx_generated_content_status" ON "generated_content" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_generated_content_visual_ready" ON "generated_content" USING btree ("company_id","visual_asset_id");--> statement-breakpoint
CREATE INDEX "idx_generated_content_visual_search" ON "generated_content" USING btree ("company_id","visual_search_status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_generated_content_hash" ON "generated_content" USING btree ("company_id","content_hash");--> statement-breakpoint
CREATE INDEX "idx_influencer_user" ON "influencer" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_influencer_company" ON "influencer" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_instagram_post_user" ON "instagram_post" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_instagram_post_company" ON "instagram_post" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_instagram_post_source" ON "instagram_post" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_instagram_post_company_external" ON "instagram_post" USING btree ("company_id","external_post_id");--> statement-breakpoint
CREATE INDEX "idx_instagram_scrape_job_user" ON "instagram_scrape_job" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_instagram_scrape_job_source" ON "instagram_scrape_job" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "idx_instagram_source_user" ON "instagram_source" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_instagram_source_company" ON "instagram_source" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_instagram_source_company_username" ON "instagram_source" USING btree ("company_id","username");--> statement-breakpoint
CREATE INDEX "idx_library_media_user" ON "library_media" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_library_media_company" ON "library_media" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_library_media_company_status" ON "library_media" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "idx_library_post_user" ON "library_post" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_library_post_company" ON "library_post" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_library_post_company_status" ON "library_post" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_library_post_company_content" ON "library_post" USING btree ("company_id","content_id");--> statement-breakpoint
CREATE INDEX "idx_media_job_user" ON "media_job" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_media_job_content" ON "media_job" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "idx_media_job_status" ON "media_job" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_social_credential_user_provider" ON "social_credential" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "idx_visual_asset_company" ON "visual_asset" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_visual_asset_source_id" ON "visual_asset" USING btree ("source","source_asset_id");--> statement-breakpoint
CREATE INDEX "idx_visual_batch_company_status" ON "visual_search_batch" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_visual_batch_company_date_cursor" ON "visual_search_batch" USING btree ("company_id","date","cursor_key");