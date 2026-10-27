CREATE TABLE `qsPoeBoats__stash_market_daily` (
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
CREATE INDEX `stash_market_daily_base_idx` ON `qsPoeBoats__stash_market_daily` (`realm`,`league`,`baseType`,`day`,`frameType`,`likelySales`,`removedCount`,`pendingCount`,`latestHour`,`listedHour`);--> statement-breakpoint
INSERT INTO `qsPoeBoats__stash_market_daily` (`realm`, `league`, `day`, `itemKey`, `identified`, `corrupted`, `foilVariation`, `signatureKind`, `signatureValue`, `name`, `baseType`, `frameType`, `likelySales`, `removedCount`, `pendingCount`, `latestHour`, `listedHour`)
SELECT `realm`, `league`, floor(`hour` / 86400) * 86400, `itemKey`, `identified`, `corrupted`, `foilVariation`, `signatureKind`,
    CASE WHEN `signatureKind` IN ('watchers-eye', 'loreweave') THEN '' ELSE `signatureValue` END,
    max(`name`), max(`baseType`), max(`frameType`), sum(`likelySales`), sum(`removedCount`), sum(`pendingCount`),
    max(`hour`), max(CASE WHEN `listingCount` > 0 THEN `hour` END)
FROM `qsPoeBoats__stash_unique_hourly`
GROUP BY `realm`, `league`, floor(`hour` / 86400) * 86400, `itemKey`, `identified`, `corrupted`, `foilVariation`, `signatureKind`,
    CASE WHEN `signatureKind` IN ('watchers-eye', 'loreweave') THEN '' ELSE `signatureValue` END;