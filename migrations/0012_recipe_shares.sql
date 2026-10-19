CREATE TABLE `recipe_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`recipe_id` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recipe_shares_token_hash_unique` ON `recipe_shares` (`token_hash`);--> statement-breakpoint
CREATE INDEX `recipe_shares_recipe_idx` ON `recipe_shares` (`recipe_id`);