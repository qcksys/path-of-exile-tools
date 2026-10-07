CREATE TABLE `qsPoeBoats__stash_cohort_hourly` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`hour` bigint NOT NULL,
	`revision` varchar(100) NOT NULL,
	`cohortId` varchar(128) NOT NULL,
	`listingCount` int NOT NULL,
	`uniqueSellers` int NOT NULL,
	`unknownCount` int NOT NULL,
	`prices` json NOT NULL,
	`confidenceMethod` varchar(40) NOT NULL,
	`firstSeenAt` varchar(32),
	`lastSeenAt` varchar(32),
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`revision`,`cohortId`,`hour`)
);
--> statement-breakpoint
CREATE INDEX `stash_cohort_history_idx` ON `qsPoeBoats__stash_cohort_hourly` (`realm`,`league`,`cohortId`,`hour`);