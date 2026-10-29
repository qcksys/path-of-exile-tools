CREATE TABLE `qsPoeBoats__stash_poe1_market` (
	`id` int unsigned AUTO_INCREMENT PRIMARY KEY,
	`identityHash` char(32) NOT NULL,
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`itemKey` varchar(255) NOT NULL,
	`identified` boolean NOT NULL,
	`corrupted` boolean NOT NULL DEFAULT false,
	`foilVariation` int NOT NULL DEFAULT -1,
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
	`foilVariation` int NOT NULL DEFAULT -1,
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
DROP TABLE `qsPoeBoats__stash_poe1_unique_hourly`;--> statement-breakpoint
DROP TABLE `qsPoeBoats__stash_poe2_unique_hourly`;--> statement-breakpoint
CREATE INDEX `stash_market_item_idx` ON `qsPoeBoats__stash_poe1_market` (`realm`,`league`,`itemKey`);--> statement-breakpoint
CREATE INDEX `stash_market_hour_market_idx` ON `qsPoeBoats__stash_poe1_market_hour` (`marketId`,`hour`);--> statement-breakpoint
CREATE INDEX `stash_market_item_idx` ON `qsPoeBoats__stash_poe2_market` (`realm`,`league`,`itemKey`);--> statement-breakpoint
CREATE INDEX `stash_market_hour_market_idx` ON `qsPoeBoats__stash_poe2_market_hour` (`marketId`,`hour`);--> statement-breakpoint
CREATE ALGORITHM = undefined SQL SECURITY definer VIEW `qsPoeBoats__stash_poe1_unique_hourly` AS (select `qsPoeBoats__stash_poe1_market`.`realm`, `qsPoeBoats__stash_poe1_market`.`league`, `qsPoeBoats__stash_poe1_market_hour`.`hour`, `qsPoeBoats__stash_poe1_market`.`itemKey`, `qsPoeBoats__stash_poe1_market`.`identified`, `qsPoeBoats__stash_poe1_market`.`corrupted`, `qsPoeBoats__stash_poe1_market`.`foilVariation`, `qsPoeBoats__stash_poe1_market`.`links`, `qsPoeBoats__stash_poe1_market`.`tab`, `qsPoeBoats__stash_poe1_market`.`signatureKind`, `qsPoeBoats__stash_poe1_market`.`signatureValue`, `qsPoeBoats__stash_poe1_market`.`iconAsset`, `qsPoeBoats__stash_poe1_market`.`name`, `qsPoeBoats__stash_poe1_market`.`baseType`, `qsPoeBoats__stash_poe1_market`.`frameType`, `qsPoeBoats__stash_poe1_market_hour`.`listingCount`, `qsPoeBoats__stash_poe1_market_hour`.`uniqueSellers`, `qsPoeBoats__stash_poe1_market_hour`.`removedCount`, `qsPoeBoats__stash_poe1_market_hour`.`likelySales`, `qsPoeBoats__stash_poe1_market_hour`.`relistedCount`, `qsPoeBoats__stash_poe1_market_hour`.`pendingCount`, `qsPoeBoats__stash_poe1_market_hour`.`salesPrices`, `qsPoeBoats__stash_poe1_market_hour`.`prices`, `qsPoeBoats__stash_poe1_market`.`signatureData`, `qsPoeBoats__stash_poe1_market_hour`.`firstSeenAt`, `qsPoeBoats__stash_poe1_market_hour`.`lastSeenAt` from `qsPoeBoats__stash_poe1_market_hour` inner join `qsPoeBoats__stash_poe1_market` on `qsPoeBoats__stash_poe1_market`.`id` = `qsPoeBoats__stash_poe1_market_hour`.`marketId`);--> statement-breakpoint
CREATE ALGORITHM = undefined SQL SECURITY definer VIEW `qsPoeBoats__stash_poe2_unique_hourly` AS (select `qsPoeBoats__stash_poe2_market`.`realm`, `qsPoeBoats__stash_poe2_market`.`league`, `qsPoeBoats__stash_poe2_market_hour`.`hour`, `qsPoeBoats__stash_poe2_market`.`itemKey`, `qsPoeBoats__stash_poe2_market`.`identified`, `qsPoeBoats__stash_poe2_market`.`corrupted`, `qsPoeBoats__stash_poe2_market`.`foilVariation`, `qsPoeBoats__stash_poe2_market`.`links`, `qsPoeBoats__stash_poe2_market`.`tab`, `qsPoeBoats__stash_poe2_market`.`signatureKind`, `qsPoeBoats__stash_poe2_market`.`signatureValue`, `qsPoeBoats__stash_poe2_market`.`iconAsset`, `qsPoeBoats__stash_poe2_market`.`name`, `qsPoeBoats__stash_poe2_market`.`baseType`, `qsPoeBoats__stash_poe2_market`.`frameType`, `qsPoeBoats__stash_poe2_market_hour`.`listingCount`, `qsPoeBoats__stash_poe2_market_hour`.`uniqueSellers`, `qsPoeBoats__stash_poe2_market_hour`.`removedCount`, `qsPoeBoats__stash_poe2_market_hour`.`likelySales`, `qsPoeBoats__stash_poe2_market_hour`.`relistedCount`, `qsPoeBoats__stash_poe2_market_hour`.`pendingCount`, `qsPoeBoats__stash_poe2_market_hour`.`salesPrices`, `qsPoeBoats__stash_poe2_market_hour`.`prices`, `qsPoeBoats__stash_poe2_market`.`signatureData`, `qsPoeBoats__stash_poe2_market_hour`.`firstSeenAt`, `qsPoeBoats__stash_poe2_market_hour`.`lastSeenAt` from `qsPoeBoats__stash_poe2_market_hour` inner join `qsPoeBoats__stash_poe2_market` on `qsPoeBoats__stash_poe2_market`.`id` = `qsPoeBoats__stash_poe2_market_hour`.`marketId`);