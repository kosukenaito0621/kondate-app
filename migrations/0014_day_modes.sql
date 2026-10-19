ALTER TABLE `day_settings` ADD `day_mode` text DEFAULT 'cook' NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_plans` ADD `day_modes` text DEFAULT '{}' NOT NULL;