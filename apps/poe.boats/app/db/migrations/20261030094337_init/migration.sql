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
CREATE TABLE `qsPoeBoats__auth_two_factor` (
	`id` varchar(36) PRIMARY KEY,
	`secret` varchar(255) NOT NULL,
	`backupCodes` text NOT NULL,
	`userId` varchar(36) NOT NULL,
	`verified` boolean DEFAULT true,
	`failedVerificationCount` int DEFAULT 0,
	`lockedUntil` timestamp(3)
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
CREATE TABLE `qsPoeBoats__ingest_worker` (
	`workerId` varchar(100) PRIMARY KEY,
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`receivedAt` bigint NOT NULL,
	`report` json NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_basemap_snapshot` (
	`iconAsset` varchar(255) PRIMARY KEY,
	`name` varchar(100) NOT NULL,
	`baseType` varchar(100) NOT NULL,
	`seenCount` bigint NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe2_basemap_snapshot` (
	`iconAsset` varchar(255) PRIMARY KEY,
	`name` varchar(100) NOT NULL,
	`baseType` varchar(100) NOT NULL,
	`seenCount` bigint NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_checkpoint` (
	`id` varchar(36) PRIMARY KEY,
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`cursor` varchar(255),
	`nextCursor` varchar(255) NOT NULL,
	`capturedAt` bigint NOT NULL,
	`responseHash` varchar(64) NOT NULL,
	`stashCount` int NOT NULL,
	`itemCount` int NOT NULL,
	`responseBytes` int NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_daily_sample` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`day` varchar(10) NOT NULL,
	`checkpointId` varchar(36) NOT NULL,
	`responseGzip` longtext NOT NULL,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`day`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe2_checkpoint` (
	`id` varchar(36) PRIMARY KEY,
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`cursor` varchar(255),
	`nextCursor` varchar(255) NOT NULL,
	`capturedAt` bigint NOT NULL,
	`responseHash` varchar(64) NOT NULL,
	`stashCount` int NOT NULL,
	`itemCount` int NOT NULL,
	`responseBytes` int NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe2_daily_sample` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`day` varchar(10) NOT NULL,
	`checkpointId` varchar(36) NOT NULL,
	`responseGzip` longtext NOT NULL,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`day`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_cohort_hourly` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`hour` bigint NOT NULL,
	`cohortId` varchar(128) NOT NULL,
	`revisionSeq` int NOT NULL,
	`listingCount` int NOT NULL,
	`uniqueSellers` int NOT NULL,
	`unknownCount` int NOT NULL,
	`prices` json NOT NULL,
	`confidenceMethod` varchar(40) NOT NULL,
	`firstSeenAt` varchar(32),
	`lastSeenAt` varchar(32),
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`hour`,`cohortId`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_cohort_revision` (
	`seq` int AUTO_INCREMENT PRIMARY KEY,
	`revision` varchar(100) NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT `stash_cohort_revision_idx` UNIQUE INDEX(`revision`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_cohort_window` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`hour` bigint NOT NULL,
	`cohortId` varchar(128) NOT NULL,
	`revisionSeq` int NOT NULL,
	`windows` json NOT NULL,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`hour`,`cohortId`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_cohort` (
	`id` varchar(128) PRIMARY KEY,
	`revision` varchar(100) NOT NULL,
	`catalogHash` varchar(64) NOT NULL,
	`name` varchar(300) NOT NULL,
	`purpose` varchar(32) NOT NULL,
	`query` json NOT NULL,
	`baseTypes` json,
	`baseTypeKey` varchar(255) GENERATED ALWAYS AS (case when json_length(baseTypes) = 1 then json_unquote(json_extract(baseTypes, '$[0]')) else '' end) VIRTUAL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_currency_daily` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`day` bigint NOT NULL,
	`marketId` varchar(512) NOT NULL,
	`firstVolume` bigint NOT NULL,
	`secondVolume` bigint NOT NULL,
	`tradedHours` int NOT NULL,
	`latestHour` bigint,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`day`,`marketId`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe2_currency_daily` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`day` bigint NOT NULL,
	`marketId` varchar(512) NOT NULL,
	`firstVolume` bigint NOT NULL,
	`secondVolume` bigint NOT NULL,
	`tradedHours` int NOT NULL,
	`latestHour` bigint,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`day`,`marketId`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_currency_hour` (
	`hour` int unsigned NOT NULL,
	`marketId` int unsigned NOT NULL,
	`lowestRatioFirst` double NOT NULL,
	`lowestRatioSecond` double NOT NULL,
	`highestRatioFirst` double NOT NULL,
	`highestRatioSecond` double NOT NULL,
	`volumeTradedFirst` double NOT NULL,
	`volumeTradedSecond` double NOT NULL,
	`lowestStockFirst` double NOT NULL,
	`lowestStockSecond` double NOT NULL,
	`highestStockFirst` double NOT NULL,
	`highestStockSecond` double NOT NULL,
	CONSTRAINT PRIMARY KEY(`hour`,`marketId`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe2_currency_hour` (
	`hour` int unsigned NOT NULL,
	`marketId` int unsigned NOT NULL,
	`lowestRatioFirst` double NOT NULL,
	`lowestRatioSecond` double NOT NULL,
	`highestRatioFirst` double NOT NULL,
	`highestRatioSecond` double NOT NULL,
	`volumeTradedFirst` double NOT NULL,
	`volumeTradedSecond` double NOT NULL,
	`lowestStockFirst` double NOT NULL,
	`lowestStockSecond` double NOT NULL,
	`highestStockFirst` double NOT NULL,
	`highestStockSecond` double NOT NULL,
	CONSTRAINT PRIMARY KEY(`hour`,`marketId`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_currency_market` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`marketId` varchar(512) NOT NULL,
	`firstHour` bigint NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`marketId`),
	CONSTRAINT `stash_currency_market_id_idx` UNIQUE INDEX(`id`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe2_currency_market` (
	`id` int unsigned AUTO_INCREMENT NOT NULL,
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`marketId` varchar(512) NOT NULL,
	`firstHour` bigint NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`marketId`),
	CONSTRAINT `stash_currency_market_id_idx` UNIQUE INDEX(`id`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_hour_coverage` (
	`stream` varchar(16) NOT NULL,
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`hour` bigint NOT NULL,
	`rowCount` int NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`stream`,`realm`,`league`,`hour`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe2_hour_coverage` (
	`stream` varchar(16) NOT NULL,
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`hour` bigint NOT NULL,
	`rowCount` int NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`stream`,`realm`,`league`,`hour`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_league` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`category` varchar(100),
	`rules` json NOT NULL,
	`startAt` bigint,
	`endAt` bigint,
	`firstListedAt` bigint NOT NULL,
	`lastListedAt` bigint NOT NULL,
	`endedAt` bigint,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe2_league` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`category` varchar(100),
	`rules` json NOT NULL,
	`startAt` bigint,
	`endAt` bigint,
	`firstListedAt` bigint NOT NULL,
	`lastListedAt` bigint NOT NULL,
	`endedAt` bigint,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_market_daily` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`day` bigint NOT NULL,
	`itemKey` varchar(255) NOT NULL,
	`identified` boolean NOT NULL,
	`corrupted` boolean NOT NULL,
	`tab` varchar(8) NOT NULL DEFAULT '',
	`signatureKind` varchar(32) NOT NULL,
	`signatureValue` varchar(255) NOT NULL,
	`name` varchar(100),
	`baseType` varchar(100) NOT NULL,
	`frameType` int NOT NULL,
	`likelySales` int NOT NULL,
	`removedCount` int NOT NULL,
	`pendingCount` int NOT NULL,
	`latestHour` bigint NOT NULL,
	`listedHour` bigint,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`day`,`itemKey`,`identified`,`corrupted`,`tab`,`signatureKind`,`signatureValue`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe2_market_daily` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`day` bigint NOT NULL,
	`itemKey` varchar(255) NOT NULL,
	`identified` boolean NOT NULL,
	`corrupted` boolean NOT NULL,
	`tab` varchar(8) NOT NULL DEFAULT '',
	`signatureKind` varchar(32) NOT NULL,
	`signatureValue` varchar(255) NOT NULL,
	`name` varchar(100),
	`baseType` varchar(100) NOT NULL,
	`frameType` int NOT NULL,
	`likelySales` int NOT NULL,
	`removedCount` int NOT NULL,
	`pendingCount` int NOT NULL,
	`latestHour` bigint NOT NULL,
	`listedHour` bigint,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`day`,`itemKey`,`identified`,`corrupted`,`tab`,`signatureKind`,`signatureValue`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_market` (
	`id` int unsigned AUTO_INCREMENT PRIMARY KEY,
	`identityHash` char(32) NOT NULL,
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`itemKey` varchar(255) NOT NULL,
	`identified` boolean NOT NULL,
	`corrupted` boolean NOT NULL DEFAULT false,
	`links` tinyint NOT NULL DEFAULT 0,
	`tab` varchar(8) NOT NULL DEFAULT '',
	`signatureKind` varchar(32) NOT NULL DEFAULT '',
	`signatureValue` varchar(255) NOT NULL DEFAULT '',
	`iconAsset` varchar(255),
	`name` varchar(100),
	`baseType` varchar(100) NOT NULL,
	`frameType` int NOT NULL,
	`signatureData` json,
	CONSTRAINT `stash_market_identity_idx` UNIQUE INDEX(`identityHash`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe1_market_hour` (
	`hour` int unsigned NOT NULL,
	`marketId` int unsigned NOT NULL,
	`listingCount` int NOT NULL,
	`uniqueSellers` int NOT NULL,
	`newCount` int,
	`soldAgeSeconds` int unsigned,
	`removedCount` int NOT NULL DEFAULT 0,
	`likelySales` int NOT NULL DEFAULT 0,
	`relistedCount` int NOT NULL DEFAULT 0,
	`pendingCount` int NOT NULL DEFAULT 0,
	`salesPrices` json,
	`prices` json,
	`firstSeenAt` varchar(32) NOT NULL,
	`lastSeenAt` varchar(32) NOT NULL,
	CONSTRAINT PRIMARY KEY(`hour`,`marketId`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe2_market` (
	`id` int unsigned AUTO_INCREMENT PRIMARY KEY,
	`identityHash` char(32) NOT NULL,
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`itemKey` varchar(255) NOT NULL,
	`identified` boolean NOT NULL,
	`corrupted` boolean NOT NULL DEFAULT false,
	`links` tinyint NOT NULL DEFAULT 0,
	`tab` varchar(8) NOT NULL DEFAULT '',
	`signatureKind` varchar(32) NOT NULL DEFAULT '',
	`signatureValue` varchar(255) NOT NULL DEFAULT '',
	`iconAsset` varchar(255),
	`name` varchar(100),
	`baseType` varchar(100) NOT NULL,
	`frameType` int NOT NULL,
	`signatureData` json,
	CONSTRAINT `stash_market_identity_idx` UNIQUE INDEX(`identityHash`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe2_market_hour` (
	`hour` int unsigned NOT NULL,
	`marketId` int unsigned NOT NULL,
	`listingCount` int NOT NULL,
	`uniqueSellers` int NOT NULL,
	`newCount` int,
	`soldAgeSeconds` int unsigned,
	`removedCount` int NOT NULL DEFAULT 0,
	`likelySales` int NOT NULL DEFAULT 0,
	`relistedCount` int NOT NULL DEFAULT 0,
	`pendingCount` int NOT NULL DEFAULT 0,
	`salesPrices` json,
	`prices` json,
	`firstSeenAt` varchar(32) NOT NULL,
	`lastSeenAt` varchar(32) NOT NULL,
	CONSTRAINT PRIMARY KEY(`hour`,`marketId`)
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `qsPoeBoats__auth_account` (`userId`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `qsPoeBoats__auth_session` (`userId`);--> statement-breakpoint
CREATE INDEX `twoFactor_secret_idx` ON `qsPoeBoats__auth_two_factor` (`secret`);--> statement-breakpoint
CREATE INDEX `twoFactor_userId_idx` ON `qsPoeBoats__auth_two_factor` (`userId`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `qsPoeBoats__auth_verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `crafting_share_user_idx` ON `qsPoeBoats__crafting_share` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_idol_set` ON `qsPoeBoats__idol_planner_idol` (`setId`);--> statement-breakpoint
CREATE INDEX `idx_placement_set` ON `qsPoeBoats__idol_planner_placement` (`setId`);--> statement-breakpoint
CREATE INDEX `idx_idol_set_user` ON `qsPoeBoats__idol_planner_set` (`userId`);--> statement-breakpoint
CREATE INDEX `stash_checkpoint_scope_time` ON `qsPoeBoats__stash_poe1_checkpoint` (`realm`,`league`,`capturedAt`,`id`);--> statement-breakpoint
CREATE INDEX `stash_checkpoint_scope_time` ON `qsPoeBoats__stash_poe2_checkpoint` (`realm`,`league`,`capturedAt`,`id`);--> statement-breakpoint
CREATE INDEX `stash_cohort_history_idx` ON `qsPoeBoats__stash_poe1_cohort_hourly` (`realm`,`league`,`cohortId`,`hour`);--> statement-breakpoint
CREATE INDEX `stash_cohort_base_page_idx` ON `qsPoeBoats__stash_poe1_cohort` (`baseTypeKey`,`id`);--> statement-breakpoint
CREATE INDEX `stash_currency_daily_market_idx` ON `qsPoeBoats__stash_poe1_currency_daily` (`realm`,`league`,`marketId`,`day`);--> statement-breakpoint
CREATE INDEX `stash_currency_daily_market_idx` ON `qsPoeBoats__stash_poe2_currency_daily` (`realm`,`league`,`marketId`,`day`);--> statement-breakpoint
CREATE INDEX `stash_currency_hour_market_idx` ON `qsPoeBoats__stash_poe1_currency_hour` (`marketId`,`hour`);--> statement-breakpoint
CREATE INDEX `stash_currency_hour_market_idx` ON `qsPoeBoats__stash_poe2_currency_hour` (`marketId`,`hour`);--> statement-breakpoint
CREATE INDEX `stash_market_daily_base_idx` ON `qsPoeBoats__stash_poe1_market_daily` (`realm`,`league`,`baseType`,`day`,`frameType`,`likelySales`,`removedCount`,`pendingCount`,`latestHour`,`listedHour`);--> statement-breakpoint
CREATE INDEX `stash_market_daily_base_idx` ON `qsPoeBoats__stash_poe2_market_daily` (`realm`,`league`,`baseType`,`day`,`frameType`,`likelySales`,`removedCount`,`pendingCount`,`latestHour`,`listedHour`);--> statement-breakpoint
CREATE INDEX `stash_market_item_idx` ON `qsPoeBoats__stash_poe1_market` (`realm`,`league`,`itemKey`);--> statement-breakpoint
CREATE INDEX `stash_market_hour_market_idx` ON `qsPoeBoats__stash_poe1_market_hour` (`marketId`,`hour`);--> statement-breakpoint
CREATE INDEX `stash_market_item_idx` ON `qsPoeBoats__stash_poe2_market` (`realm`,`league`,`itemKey`);--> statement-breakpoint
CREATE INDEX `stash_market_hour_market_idx` ON `qsPoeBoats__stash_poe2_market_hour` (`marketId`,`hour`);--> statement-breakpoint
CREATE ALGORITHM = undefined SQL SECURITY definer VIEW `qsPoeBoats__stash_poe1_currency_hourly` AS (select `qsPoeBoats__stash_poe1_currency_market`.`realm`, `qsPoeBoats__stash_poe1_currency_market`.`league`, `qsPoeBoats__stash_poe1_currency_market`.`marketId`, `qsPoeBoats__stash_poe1_currency_hour`.`hour`, json_object(substring_index(`qsPoeBoats__stash_poe1_currency_market`.`marketId`, '|', 1), `qsPoeBoats__stash_poe1_currency_hour`.`lowestRatioFirst`, substring_index(`qsPoeBoats__stash_poe1_currency_market`.`marketId`, '|', -1), `qsPoeBoats__stash_poe1_currency_hour`.`lowestRatioSecond`) as `lowestRatio`, json_object(substring_index(`qsPoeBoats__stash_poe1_currency_market`.`marketId`, '|', 1), `qsPoeBoats__stash_poe1_currency_hour`.`highestRatioFirst`, substring_index(`qsPoeBoats__stash_poe1_currency_market`.`marketId`, '|', -1), `qsPoeBoats__stash_poe1_currency_hour`.`highestRatioSecond`) as `highestRatio`, json_object(substring_index(`qsPoeBoats__stash_poe1_currency_market`.`marketId`, '|', 1), `qsPoeBoats__stash_poe1_currency_hour`.`volumeTradedFirst`, substring_index(`qsPoeBoats__stash_poe1_currency_market`.`marketId`, '|', -1), `qsPoeBoats__stash_poe1_currency_hour`.`volumeTradedSecond`) as `volumeTraded`, json_object(substring_index(`qsPoeBoats__stash_poe1_currency_market`.`marketId`, '|', 1), `qsPoeBoats__stash_poe1_currency_hour`.`lowestStockFirst`, substring_index(`qsPoeBoats__stash_poe1_currency_market`.`marketId`, '|', -1), `qsPoeBoats__stash_poe1_currency_hour`.`lowestStockSecond`) as `lowestStock`, json_object(substring_index(`qsPoeBoats__stash_poe1_currency_market`.`marketId`, '|', 1), `qsPoeBoats__stash_poe1_currency_hour`.`highestStockFirst`, substring_index(`qsPoeBoats__stash_poe1_currency_market`.`marketId`, '|', -1), `qsPoeBoats__stash_poe1_currency_hour`.`highestStockSecond`) as `highestStock`, `qsPoeBoats__stash_poe1_currency_hour`.`volumeTradedFirst`, `qsPoeBoats__stash_poe1_currency_hour`.`volumeTradedSecond` from `qsPoeBoats__stash_poe1_currency_hour` inner join `qsPoeBoats__stash_poe1_currency_market` on `qsPoeBoats__stash_poe1_currency_market`.`id` = `qsPoeBoats__stash_poe1_currency_hour`.`marketId`);--> statement-breakpoint
CREATE ALGORITHM = undefined SQL SECURITY definer VIEW `qsPoeBoats__stash_poe2_currency_hourly` AS (select `qsPoeBoats__stash_poe2_currency_market`.`realm`, `qsPoeBoats__stash_poe2_currency_market`.`league`, `qsPoeBoats__stash_poe2_currency_market`.`marketId`, `qsPoeBoats__stash_poe2_currency_hour`.`hour`, json_object(substring_index(`qsPoeBoats__stash_poe2_currency_market`.`marketId`, '|', 1), `qsPoeBoats__stash_poe2_currency_hour`.`lowestRatioFirst`, substring_index(`qsPoeBoats__stash_poe2_currency_market`.`marketId`, '|', -1), `qsPoeBoats__stash_poe2_currency_hour`.`lowestRatioSecond`) as `lowestRatio`, json_object(substring_index(`qsPoeBoats__stash_poe2_currency_market`.`marketId`, '|', 1), `qsPoeBoats__stash_poe2_currency_hour`.`highestRatioFirst`, substring_index(`qsPoeBoats__stash_poe2_currency_market`.`marketId`, '|', -1), `qsPoeBoats__stash_poe2_currency_hour`.`highestRatioSecond`) as `highestRatio`, json_object(substring_index(`qsPoeBoats__stash_poe2_currency_market`.`marketId`, '|', 1), `qsPoeBoats__stash_poe2_currency_hour`.`volumeTradedFirst`, substring_index(`qsPoeBoats__stash_poe2_currency_market`.`marketId`, '|', -1), `qsPoeBoats__stash_poe2_currency_hour`.`volumeTradedSecond`) as `volumeTraded`, json_object(substring_index(`qsPoeBoats__stash_poe2_currency_market`.`marketId`, '|', 1), `qsPoeBoats__stash_poe2_currency_hour`.`lowestStockFirst`, substring_index(`qsPoeBoats__stash_poe2_currency_market`.`marketId`, '|', -1), `qsPoeBoats__stash_poe2_currency_hour`.`lowestStockSecond`) as `lowestStock`, json_object(substring_index(`qsPoeBoats__stash_poe2_currency_market`.`marketId`, '|', 1), `qsPoeBoats__stash_poe2_currency_hour`.`highestStockFirst`, substring_index(`qsPoeBoats__stash_poe2_currency_market`.`marketId`, '|', -1), `qsPoeBoats__stash_poe2_currency_hour`.`highestStockSecond`) as `highestStock`, `qsPoeBoats__stash_poe2_currency_hour`.`volumeTradedFirst`, `qsPoeBoats__stash_poe2_currency_hour`.`volumeTradedSecond` from `qsPoeBoats__stash_poe2_currency_hour` inner join `qsPoeBoats__stash_poe2_currency_market` on `qsPoeBoats__stash_poe2_currency_market`.`id` = `qsPoeBoats__stash_poe2_currency_hour`.`marketId`);--> statement-breakpoint
CREATE ALGORITHM = undefined SQL SECURITY definer VIEW `qsPoeBoats__stash_poe1_unique_hourly` AS (select `qsPoeBoats__stash_poe1_market`.`realm`, `qsPoeBoats__stash_poe1_market`.`league`, `qsPoeBoats__stash_poe1_market_hour`.`hour`, `qsPoeBoats__stash_poe1_market`.`itemKey`, `qsPoeBoats__stash_poe1_market`.`identified`, `qsPoeBoats__stash_poe1_market`.`corrupted`, `qsPoeBoats__stash_poe1_market`.`links`, `qsPoeBoats__stash_poe1_market`.`tab`, `qsPoeBoats__stash_poe1_market`.`signatureKind`, `qsPoeBoats__stash_poe1_market`.`signatureValue`, `qsPoeBoats__stash_poe1_market`.`iconAsset`, `qsPoeBoats__stash_poe1_market`.`name`, `qsPoeBoats__stash_poe1_market`.`baseType`, `qsPoeBoats__stash_poe1_market`.`frameType`, `qsPoeBoats__stash_poe1_market_hour`.`listingCount`, `qsPoeBoats__stash_poe1_market_hour`.`uniqueSellers`, `qsPoeBoats__stash_poe1_market_hour`.`newCount`, `qsPoeBoats__stash_poe1_market_hour`.`soldAgeSeconds`, `qsPoeBoats__stash_poe1_market_hour`.`removedCount`, `qsPoeBoats__stash_poe1_market_hour`.`likelySales`, `qsPoeBoats__stash_poe1_market_hour`.`relistedCount`, `qsPoeBoats__stash_poe1_market_hour`.`pendingCount`, `qsPoeBoats__stash_poe1_market_hour`.`salesPrices`, `qsPoeBoats__stash_poe1_market_hour`.`prices`, `qsPoeBoats__stash_poe1_market`.`signatureData`, `qsPoeBoats__stash_poe1_market_hour`.`firstSeenAt`, `qsPoeBoats__stash_poe1_market_hour`.`lastSeenAt` from `qsPoeBoats__stash_poe1_market_hour` inner join `qsPoeBoats__stash_poe1_market` on `qsPoeBoats__stash_poe1_market`.`id` = `qsPoeBoats__stash_poe1_market_hour`.`marketId`);--> statement-breakpoint
CREATE ALGORITHM = undefined SQL SECURITY definer VIEW `qsPoeBoats__stash_poe2_unique_hourly` AS (select `qsPoeBoats__stash_poe2_market`.`realm`, `qsPoeBoats__stash_poe2_market`.`league`, `qsPoeBoats__stash_poe2_market_hour`.`hour`, `qsPoeBoats__stash_poe2_market`.`itemKey`, `qsPoeBoats__stash_poe2_market`.`identified`, `qsPoeBoats__stash_poe2_market`.`corrupted`, `qsPoeBoats__stash_poe2_market`.`links`, `qsPoeBoats__stash_poe2_market`.`tab`, `qsPoeBoats__stash_poe2_market`.`signatureKind`, `qsPoeBoats__stash_poe2_market`.`signatureValue`, `qsPoeBoats__stash_poe2_market`.`iconAsset`, `qsPoeBoats__stash_poe2_market`.`name`, `qsPoeBoats__stash_poe2_market`.`baseType`, `qsPoeBoats__stash_poe2_market`.`frameType`, `qsPoeBoats__stash_poe2_market_hour`.`listingCount`, `qsPoeBoats__stash_poe2_market_hour`.`uniqueSellers`, `qsPoeBoats__stash_poe2_market_hour`.`newCount`, `qsPoeBoats__stash_poe2_market_hour`.`soldAgeSeconds`, `qsPoeBoats__stash_poe2_market_hour`.`removedCount`, `qsPoeBoats__stash_poe2_market_hour`.`likelySales`, `qsPoeBoats__stash_poe2_market_hour`.`relistedCount`, `qsPoeBoats__stash_poe2_market_hour`.`pendingCount`, `qsPoeBoats__stash_poe2_market_hour`.`salesPrices`, `qsPoeBoats__stash_poe2_market_hour`.`prices`, `qsPoeBoats__stash_poe2_market`.`signatureData`, `qsPoeBoats__stash_poe2_market_hour`.`firstSeenAt`, `qsPoeBoats__stash_poe2_market_hour`.`lastSeenAt` from `qsPoeBoats__stash_poe2_market_hour` inner join `qsPoeBoats__stash_poe2_market` on `qsPoeBoats__stash_poe2_market`.`id` = `qsPoeBoats__stash_poe2_market_hour`.`marketId`);