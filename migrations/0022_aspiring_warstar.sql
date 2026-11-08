CREATE TABLE `hosting_courses` (
	`id` text PRIMARY KEY NOT NULL,
	`hosting_id` text NOT NULL,
	`position` integer NOT NULL,
	`label` text NOT NULL,
	`category` text NOT NULL,
	`recipe_id` text,
	FOREIGN KEY (`hosting_id`) REFERENCES `hostings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `hosting_courses_hosting_idx` ON `hosting_courses` (`hosting_id`);--> statement-breakpoint
CREATE TABLE `hostings` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`date` text NOT NULL,
	`meal` text NOT NULL,
	`servings` integer NOT NULL,
	`updated_by` text,
	`updated_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hostings_slot_uq` ON `hostings` (`plan_id`,`date`,`meal`);