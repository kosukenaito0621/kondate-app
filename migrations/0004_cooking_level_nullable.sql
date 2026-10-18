PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`theme` text DEFAULT 'ichigo' NOT NULL,
	`cooking_level` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_settings`("user_id", "theme", "cooking_level") SELECT "user_id", "theme", "cooking_level" FROM `user_settings`;--> statement-breakpoint
DROP TABLE `user_settings`;--> statement-breakpoint
ALTER TABLE `__new_user_settings` RENAME TO `user_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
-- まだ誰もレベルを選んでいないので、全員オンボーディングで選んでもらう
UPDATE `user_settings` SET `cooking_level` = NULL;
