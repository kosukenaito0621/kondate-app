CREATE TABLE `cook_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`user_id` text,
	`recipe_id` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cook_logs_group_recipe_date_uq` ON `cook_logs` (`group_id`,`recipe_id`,`date`);--> statement-breakpoint
CREATE INDEX `cook_logs_group_date_idx` ON `cook_logs` (`group_id`,`date`);