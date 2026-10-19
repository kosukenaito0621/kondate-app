CREATE TABLE `day_memos` (
	`group_id` text NOT NULL,
	`date` text NOT NULL,
	`body` text NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`group_id`, `date`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `day_memos_date_idx` ON `day_memos` (`date`);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `memo_swap_choice` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `memo_edit_choice` text;