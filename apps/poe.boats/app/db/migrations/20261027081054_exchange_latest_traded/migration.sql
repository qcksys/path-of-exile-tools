CREATE TABLE `qsPoeBoats__stash_currency_latest` (
	`realm` varchar(10) NOT NULL DEFAULT 'pc',
	`league` varchar(100) NOT NULL,
	`marketId` varchar(512) NOT NULL,
	`hour` bigint NOT NULL,
	`lowestRatio` json,
	`highestRatio` json,
	`volumeTraded` json,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`marketId`)
);
--> statement-breakpoint
CREATE INDEX `stash_currency_latest_hour_idx` ON `qsPoeBoats__stash_currency_latest` (`realm`,`league`,`hour`);--> statement-breakpoint
INSERT INTO `qsPoeBoats__stash_currency_latest` (`realm`, `league`, `marketId`, `hour`, `lowestRatio`, `highestRatio`, `volumeTraded`)
SELECT c.`realm`, c.`league`, c.`marketId`, c.`hour`, c.`lowestRatio`, c.`highestRatio`, c.`volumeTraded`
FROM `qsPoeBoats__stash_currency_hourly` c
JOIN (
    SELECT h.`realm`, h.`league`, h.`marketId`, max(h.`hour`) AS `hour`
    FROM `qsPoeBoats__stash_currency_hourly` h
    JOIN (
        SELECT `realm`, `league`, max(`hour`) AS `latest`
        FROM `qsPoeBoats__stash_currency_hourly`
        GROUP BY `realm`, `league`
    ) l ON l.`realm` = h.`realm` AND l.`league` = h.`league`
    WHERE h.`hour` >= l.`latest` - 86400
        AND json_extract(h.`volumeTraded`, concat('$."', substring_index(h.`marketId`, '|', 1), '"')) > 0
    GROUP BY h.`realm`, h.`league`, h.`marketId`
) n ON n.`realm` = c.`realm` AND n.`league` = c.`league` AND n.`marketId` = c.`marketId` AND n.`hour` = c.`hour`;