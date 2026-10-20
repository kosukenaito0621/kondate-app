CREATE TABLE `pantry_items` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`section` text NOT NULL,
	`quantity` real,
	`unit` text,
	`expires_on` text,
	`updated_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `pantry_items_group_idx` ON `pantry_items` (`group_id`,`name`);--> statement-breakpoint
ALTER TABLE `cook_logs` ADD `pantry_used` text;--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `stocked` integer DEFAULT false NOT NULL;