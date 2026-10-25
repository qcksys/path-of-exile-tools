CREATE TABLE `qsPoeBoats__stash_cohort_revision_hour` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`hour` bigint NOT NULL,
	`revision` varchar(100) NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`hour`,`revision`)
);--> statement-breakpoint
INSERT INTO `qsPoeBoats__stash_cohort_revision_hour` (`realm`, `league`, `hour`, `revision`)
SELECT DISTINCT `realm`, `league`, `hour`, `revision`
FROM `qsPoeBoats__stash_cohort_hourly` FORCE INDEX (`stash_cohort_coverage_idx`);
