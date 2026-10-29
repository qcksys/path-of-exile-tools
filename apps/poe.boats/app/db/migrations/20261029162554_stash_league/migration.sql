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
