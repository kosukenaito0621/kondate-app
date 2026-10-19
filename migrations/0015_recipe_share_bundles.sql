CREATE TABLE `recipe_share_bundle_items` (
	`bundle_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`sort` integer NOT NULL,
	PRIMARY KEY(`bundle_id`, `recipe_id`),
	FOREIGN KEY (`bundle_id`) REFERENCES `recipe_share_bundles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recipe_share_bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`title` text,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_share_bundles_token_hash_unique` ON `recipe_share_bundles` (`token_hash`);