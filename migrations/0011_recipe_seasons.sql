ALTER TABLE `recipes` ADD `seasons` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `season_only` integer DEFAULT false NOT NULL;