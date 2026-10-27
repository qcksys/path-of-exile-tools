CREATE TABLE `qsPoeBoats__stash_currency_daily` (
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
CREATE INDEX `stash_currency_daily_market_idx` ON `qsPoeBoats__stash_currency_daily` (`realm`,`league`,`marketId`,`day`);--> statement-breakpoint
INSERT INTO `qsPoeBoats__stash_currency_daily` (`realm`, `league`, `day`, `marketId`, `firstVolume`, `secondVolume`, `tradedHours`, `latestHour`)
SELECT `realm`, `league`, `day`, `marketId`,
    coalesce(sum(CASE WHEN `first` > 0 AND `second` > 0 THEN `first` END), 0),
    coalesce(sum(CASE WHEN `first` > 0 AND `second` > 0 THEN `second` END), 0),
    count(CASE WHEN `first` > 0 AND `second` > 0 THEN 1 END),
    max(CASE WHEN `first` > 0 AND `second` > 0 THEN `hour` END)
FROM (
    SELECT `realm`, `league`, floor(`hour` / 86400) * 86400 AS `day`, `marketId`, `hour`,
        cast(json_extract(`volumeTraded`, concat('$."', substring_index(`marketId`, '|', 1), '"')) AS unsigned) AS `first`,
        cast(json_extract(`volumeTraded`, concat('$."', substring_index(`marketId`, '|', -1), '"')) AS unsigned) AS `second`
    FROM `qsPoeBoats__stash_currency_hourly`
) AS `hourly`
GROUP BY `realm`, `league`, `day`, `marketId`;