CREATE TABLE `qsPoeBoats__crafting_share` (
	`id` varchar(36) PRIMARY KEY,
	`userId` varchar(36) NOT NULL,
	`targetKind` enum('project','build') NOT NULL,
	`targetId` varchar(100) NOT NULL,
	`mode` enum('frozen','live') NOT NULL,
	`snapshot` json,
	`workspaceRevision` int unsigned NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__crafting_workspace` (
	`userId` varchar(36) PRIMARY KEY,
	`bundle` json NOT NULL,
	`revision` int unsigned NOT NULL DEFAULT 0,
	`defaultStorage` enum('local','cloud'),
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime
);
--> statement-breakpoint
CREATE INDEX `crafting_share_user_idx` ON `qsPoeBoats__crafting_share` (`userId`);