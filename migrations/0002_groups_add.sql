CREATE TABLE `group_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`code` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_invites_code_unique` ON `group_invites` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `group_invites_token_hash_unique` ON `group_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `group_invites_group_idx` ON `group_invites` (`group_id`);--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`joined_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `group_members_user_idx` ON `group_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT '🏠' NOT NULL,
	`color` text DEFAULT 'ichigo' NOT NULL,
	`default_level` text DEFAULT 'minori' NOT NULL,
	`servings` integer,
	`weekly_budget` integer DEFAULT 10000 NOT NULL,
	`ratio_wa` integer DEFAULT 50 NOT NULL,
	`ratio_yo` integer DEFAULT 30 NOT NULL,
	`ratio_chu` integer DEFAULT 20 NOT NULL,
	`buy_seasonings` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `day_settings` ADD `group_id` text REFERENCES groups(id);--> statement-breakpoint
ALTER TABLE `day_settings` ADD `level` text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE `hidden_recipes` ADD `group_id` text REFERENCES groups(id);--> statement-breakpoint
ALTER TABLE `meal_plan_items` ADD `updated_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `meal_plan_items` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_plans` ADD `group_id` text REFERENCES groups(id);--> statement-breakpoint
ALTER TABLE `meal_plans` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_plans` ADD `updated_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `meal_plans` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `group_id` text REFERENCES groups(id);--> statement-breakpoint
ALTER TABLE `recipes` ADD `created_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `recipes` ADD `difficulty` text DEFAULT 'minori' NOT NULL;--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `group_id` text REFERENCES groups(id);--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `checked_by` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `shopping_items` ADD `checked_at` integer;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `cooking_level` text DEFAULT 'minori' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `current_group_id` text REFERENCES groups(id);--> statement-breakpoint
-- ===== データ移行：既存ユーザーごとに「自分だけのグループ」を作り、設定とデータを付け替える =====
INSERT INTO `groups` (`id`, `name`, `icon`, `color`, `default_level`, `servings`, `weekly_budget`, `ratio_wa`, `ratio_yo`, `ratio_chu`, `buy_seasonings`)
SELECT 'solo-' || u.`id`,
       COALESCE(u.`display_name`, 'わたし') || 'の家',
       '🏠',
       COALESCE(s.`theme`, 'ichigo'),
       'minori',
       COALESCE(s.`servings`, 2),
       COALESCE(s.`weekly_budget`, 10000),
       COALESCE(s.`ratio_wa`, 50),
       COALESCE(s.`ratio_yo`, 30),
       COALESCE(s.`ratio_chu`, 20),
       COALESCE(s.`buy_seasonings`, '[]')
FROM `users` u LEFT JOIN `user_settings` s ON s.`user_id` = u.`id`;--> statement-breakpoint
INSERT INTO `group_members` (`group_id`, `user_id`, `role`) SELECT 'solo-' || `id`, `id`, 'owner' FROM `users`;--> statement-breakpoint
UPDATE `users` SET `current_group_id` = 'solo-' || `id`;--> statement-breakpoint
UPDATE `day_settings` SET `group_id` = 'solo-' || `user_id`;--> statement-breakpoint
UPDATE `hidden_recipes` SET `group_id` = 'solo-' || `user_id`;--> statement-breakpoint
UPDATE `meal_plans` SET `group_id` = 'solo-' || `user_id`, `updated_by` = `user_id`, `updated_at` = `created_at`;--> statement-breakpoint
UPDATE `meal_plan_items` SET `updated_at` = (SELECT `created_at` FROM `meal_plans` p WHERE p.`id` = `meal_plan_items`.`plan_id`);--> statement-breakpoint
UPDATE `shopping_items` SET `group_id` = 'solo-' || `user_id`;--> statement-breakpoint
UPDATE `recipes` SET `group_id` = 'solo-' || `owner_id`, `created_by` = `owner_id` WHERE `owner_id` IS NOT NULL;--> statement-breakpoint
-- 手順を文字列の配列から {text} の配列に変換（すでに変換済みの行は対象外）
UPDATE `recipes`
SET `steps` = (SELECT json_group_array(json_object('text', j.`value`)) FROM json_each(`recipes`.`steps`) j)
WHERE json_type(`steps`, '$[0]') = 'text';
