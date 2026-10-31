CREATE TABLE `qsPoeBoats__stash_poe1_market_price` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`itemKey` varchar(255) NOT NULL,
	`identified` boolean NOT NULL,
	`corrupted` boolean NOT NULL,
	`tab` varchar(8) NOT NULL,
	`signatureKind` varchar(32) NOT NULL,
	`signatureValue` varchar(255) NOT NULL,
	`hour` int unsigned NOT NULL,
	`priceChaos` double,
	`priceDivine` double,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`itemKey`,`identified`,`corrupted`,`tab`,`signatureKind`,`signatureValue`)
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_poe2_market_price` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`itemKey` varchar(255) NOT NULL,
	`identified` boolean NOT NULL,
	`corrupted` boolean NOT NULL,
	`tab` varchar(8) NOT NULL,
	`signatureKind` varchar(32) NOT NULL,
	`signatureValue` varchar(255) NOT NULL,
	`hour` int unsigned NOT NULL,
	`priceChaos` double,
	`priceDivine` double,
	`rowCreatedAt` datetime NOT NULL DEFAULT (now()),
	`rowUpdatedAt` datetime NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`rowDeletedAt` datetime,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`itemKey`,`identified`,`corrupted`,`tab`,`signatureKind`,`signatureValue`)
);
