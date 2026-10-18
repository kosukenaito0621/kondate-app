PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_day_settings` (
	`group_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`budget_level` text DEFAULT 'normal' NOT NULL,
	`time_level` text DEFAULT 'normal' NOT NULL,
	`side_mode` text DEFAULT 'auto' NOT NULL,
	`level` text DEFAULT 'inherit' NOT NULL,
	PRIMARY KEY(`group_id`, `weekday`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_day_settings`("group_id", "weekday", "budget_level", "time_level", "side_mode", "level") SELECT "group_id", "weekday", "budget_level", "time_level", "side_mode", "level" FROM `day_settings`;--> statement-breakpoint
DROP TABLE `day_settings`;--> statement-breakpoint
ALTER TABLE `__new_day_settings` RENAME TO `day_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_hidden_recipes` (
	`group_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `recipe_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_hidden_recipes`("group_id", "recipe_id") SELECT "group_id", "recipe_id" FROM `hidden_recipes`;--> statement-breakpoint
DROP TABLE `hidden_recipes`;--> statement-breakpoint
ALTER TABLE `__new_hidden_recipes` RENAME TO `hidden_recipes`;--> statement-breakpoint
CREATE TABLE `__new_shopping_items` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`section` text NOT NULL,
	`quantity` real,
	`unit` text,
	`amount_text` text,
	`sources` text DEFAULT '[]' NOT NULL,
	`checked` integer DEFAULT false NOT NULL,
	`checked_by` text,
	`checked_at` integer,
	`is_manual` integer DEFAULT false NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`checked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_shopping_items`("id", "plan_id", "group_id", "name", "section", "quantity", "unit", "amount_text", "sources", "checked", "checked_by", "checked_at", "is_manual", "sort", "updated_at") SELECT "id", "plan_id", "group_id", "name", "section", "quantity", "unit", "amount_text", "sources", "checked", "checked_by", "checked_at", "is_manual", "sort", "updated_at" FROM `shopping_items`;--> statement-breakpoint
DROP TABLE `shopping_items`;--> statement-breakpoint
ALTER TABLE `__new_shopping_items` RENAME TO `shopping_items`;--> statement-breakpoint
CREATE INDEX `shopping_items_plan_idx` ON `shopping_items` (`plan_id`);--> statement-breakpoint
DROP INDEX `meal_plans_user_week_uq`;--> statement-breakpoint
CREATE UNIQUE INDEX `meal_plans_group_week_uq` ON `meal_plans` (`group_id`,`week_start`);--> statement-breakpoint
DROP INDEX `recipes_owner_category_idx`;--> statement-breakpoint
CREATE INDEX `recipes_group_category_idx` ON `recipes` (`group_id`,`category`);--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `weekly_budget`;--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `ratio_wa`;--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `ratio_yo`;--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `ratio_chu`;--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `servings`;--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `buy_seasonings`;