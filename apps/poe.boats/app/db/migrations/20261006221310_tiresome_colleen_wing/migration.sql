CREATE TABLE `qsPoeBoats__stash_cohort` (
	`revision` varchar(100) NOT NULL,
	`id` varchar(128) NOT NULL,
	`catalogHash` varchar(64) NOT NULL,
	`name` varchar(300) NOT NULL,
	`purpose` varchar(32) NOT NULL,
	`query` json NOT NULL,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`revision`,`id`)
);
