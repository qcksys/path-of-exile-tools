CREATE TABLE `qsPoeBoats__auth_account` (
	`id` varchar(36) PRIMARY KEY,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` varchar(36) NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` timestamp,
	`refreshTokenExpiresAt` timestamp,
	`scope` text,
	`password` text,
	`createdAt` datetime NOT NULL DEFAULT (now()),
	`updatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__auth_session` (
	`id` varchar(36) PRIMARY KEY,
	`userId` varchar(36) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`token` varchar(255) NOT NULL,
	`createdAt` datetime NOT NULL DEFAULT (now()),
	`updatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`ipAddress` text,
	`userAgent` text,
	`impersonatedBy` varchar(36),
	CONSTRAINT `token_unique` UNIQUE INDEX(`token`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__auth_user` (
	`id` varchar(36) PRIMARY KEY,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`emailVerified` boolean NOT NULL DEFAULT false,
	`image` text,
	`createdAt` datetime NOT NULL DEFAULT (now()),
	`updatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`two_factor_enabled` boolean DEFAULT false,
	`role` varchar(255) NOT NULL DEFAULT 'user',
	`banned` boolean NOT NULL DEFAULT false,
	`banReason` text,
	`banExpires` datetime,
	CONSTRAINT `email_unique` UNIQUE INDEX(`email`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__auth_verification` (
	`id` varchar(36) PRIMARY KEY,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expiresAt` timestamp(3) NOT NULL,
	`createdAt` datetime NOT NULL DEFAULT (now()),
	`updatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__idol_planner_idol` (
	`id` varchar(36) PRIMARY KEY,
	`setId` varchar(36) NOT NULL,
	`data` json,
	`importedAt` bigint NOT NULL,
	`source` varchar(20) NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__idol_planner_placement` (
	`id` varchar(36) PRIMARY KEY,
	`setId` varchar(36) NOT NULL,
	`idolId` varchar(36) NOT NULL,
	`posX` tinyint NOT NULL,
	`posY` tinyint NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__idol_planner_price_cache` (
	`league` varchar(100) PRIMARY KEY,
	`prices` json,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__idol_planner_set` (
	`id` varchar(36) PRIMARY KEY,
	`userId` varchar(36) NOT NULL,
	`name` varchar(50) NOT NULL,
	`mapDevice` json,
	`unlockedConditions` json,
	`isActive` boolean NOT NULL DEFAULT false,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__idol_planner_shared_set` (
	`id` varchar(10) PRIMARY KEY,
	`data` json,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__idol_planner_user_prefs` (
	`userId` varchar(36) PRIMARY KEY,
	`leagueId` varchar(100),
	`realm` varchar(20),
	`favorites` json,
	`tradeSettings` json,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_basemap_snapshot` (
	`iconAsset` varchar(255) PRIMARY KEY,
	`name` varchar(100) NOT NULL,
	`baseType` varchar(100) NOT NULL,
	`seenCount` bigint NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_currency_hourly` (
	`league` varchar(100) NOT NULL,
	`marketId` varchar(100) NOT NULL,
	`hour` bigint NOT NULL,
	`lowestRatio` json,
	`highestRatio` json,
	`volumeTraded` json,
	`lowestStock` json,
	`highestStock` json,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`league`,`marketId`,`hour`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_unique_hourly` (
	`league` varchar(100) NOT NULL,
	`hour` bigint NOT NULL,
	`bucketKey` varchar(255) NOT NULL,
	`iconAsset` varchar(255),
	`name` varchar(100),
	`baseType` varchar(100) NOT NULL,
	`frameType` int NOT NULL,
	`identified` boolean NOT NULL,
	`corrupted` boolean NOT NULL DEFAULT false,
	`foilVariation` int,
	`listingCount` int NOT NULL,
	`uniqueSellers` int NOT NULL,
	`prices` json,
	`modSignatureCounts` json,
	`firstSeenAt` varchar(32) NOT NULL,
	`lastSeenAt` varchar(32) NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`league`,`hour`,`bucketKey`)
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `qsPoeBoats__auth_account` (`userId`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `qsPoeBoats__auth_session` (`userId`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `qsPoeBoats__auth_verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `idx_idol_set` ON `qsPoeBoats__idol_planner_idol` (`setId`);--> statement-breakpoint
CREATE INDEX `idx_placement_set` ON `qsPoeBoats__idol_planner_placement` (`setId`);--> statement-breakpoint
CREATE INDEX `idx_idol_set_user` ON `qsPoeBoats__idol_planner_set` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_stash_cx_league_hour` ON `qsPoeBoats__stash_currency_hourly` (`league`,`hour`);--> statement-breakpoint
CREATE INDEX `idx_stash_unique_league_hour` ON `qsPoeBoats__stash_unique_hourly` (`league`,`hour`);--> statement-breakpoint
CREATE INDEX `idx_stash_unique_icon` ON `qsPoeBoats__stash_unique_hourly` (`iconAsset`);