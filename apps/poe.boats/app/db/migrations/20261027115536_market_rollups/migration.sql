CREATE TABLE `qsPoeBoats__stash_currency_market` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`marketId` varchar(512) NOT NULL,
	`firstHour` bigint NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`marketId`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_hour_coverage` (
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
CREATE TABLE `qsPoeBoats__stash_unique_daily` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`day` bigint NOT NULL,
	`itemKey` varchar(255) NOT NULL,
	`identified` boolean NOT NULL,
	`corrupted` boolean NOT NULL,
	`foilVariation` int NOT NULL,
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
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`day`,`itemKey`,`identified`,`corrupted`,`foilVariation`,`signatureKind`,`signatureValue`)
);
--> statement-breakpoint
INSERT INTO `qsPoeBoats__stash_unique_daily` (`realm`, `league`, `day`, `itemKey`, `identified`, `corrupted`, `foilVariation`, `signatureKind`, `signatureValue`, `name`, `baseType`, `frameType`, `likelySales`, `removedCount`, `pendingCount`, `latestHour`, `listedHour`)
SELECT `realm`, `league`, floor(`hour` / 86400) * 86400, `itemKey`, `identified`, `corrupted`, `foilVariation`, `signatureKind`, `signatureValue`,
    max(`name`), max(`baseType`), max(`frameType`), sum(`likelySales`), sum(`removedCount`), sum(`pendingCount`),
    max(`hour`), max(CASE WHEN `listingCount` > 0 THEN `hour` END)
FROM `qsPoeBoats__stash_unique_hourly`
GROUP BY `realm`, `league`, floor(`hour` / 86400) * 86400, `itemKey`, `identified`, `corrupted`, `foilVariation`, `signatureKind`, `signatureValue`;
--> statement-breakpoint
INSERT INTO `qsPoeBoats__stash_currency_market` (`realm`, `league`, `marketId`, `firstHour`)
SELECT `realm`, `league`, `marketId`, min(`hour`)
FROM `qsPoeBoats__stash_currency_hourly`
GROUP BY `realm`, `league`, `marketId`;
--> statement-breakpoint
INSERT INTO `qsPoeBoats__stash_hour_coverage` (`stream`, `realm`, `league`, `hour`, `rowCount`)
SELECT 'currency', `realm`, `league`, `hour`, count(*)
FROM `qsPoeBoats__stash_currency_hourly` FORCE INDEX (`stash_currency_coverage_idx`)
GROUP BY `realm`, `league`, `hour`;
--> statement-breakpoint
INSERT INTO `qsPoeBoats__stash_hour_coverage` (`stream`, `realm`, `league`, `hour`, `rowCount`)
SELECT 'uniques', `realm`, `league`, `hour`, count(*)
FROM `qsPoeBoats__stash_unique_hourly` FORCE INDEX (`stash_unique_market_cover_idx`)
GROUP BY `realm`, `league`, `hour`;
--> statement-breakpoint
INSERT INTO `qsPoeBoats__stash_hour_coverage` (`stream`, `realm`, `league`, `hour`, `rowCount`)
SELECT 'equipment', `realm`, `league`, `hour`, count(*)
FROM `qsPoeBoats__stash_cohort_hourly` FORCE INDEX (`stash_cohort_coverage_idx`)
GROUP BY `realm`, `league`, `hour`;
