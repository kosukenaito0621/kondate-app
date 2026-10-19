-- グループ名を「○○の食卓」の○○だけを保存する形に変える（表示のときに「の食卓」を付ける）
UPDATE `groups` SET `name` = substr(`name`, 1, length(`name`) - 3) WHERE `name` LIKE '%の食卓' AND length(`name`) > 3;
--> statement-breakpoint
UPDATE `groups` SET `name` = substr(`name`, 1, length(`name`) - 2) WHERE `name` LIKE '%の家' AND length(`name`) > 2;
