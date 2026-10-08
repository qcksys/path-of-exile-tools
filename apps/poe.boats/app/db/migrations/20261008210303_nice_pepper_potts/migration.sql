CREATE TABLE `qsPoeBoats__stash_checkpoint` (
	`id` varchar(36) PRIMARY KEY,
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`cursor` varchar(255),
	`nextCursor` varchar(255) NOT NULL,
	`capturedAt` bigint NOT NULL,
	`responseHash` varchar(64) NOT NULL,
	`stashCount` int NOT NULL,
	`itemCount` int NOT NULL,
	`responseBytes` int NOT NULL
);
--> statement-breakpoint
CREATE TABLE `qsPoeBoats__stash_daily_sample` (
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`day` varchar(10) NOT NULL,
	`checkpointId` varchar(36) NOT NULL,
	`responseGzip` longtext NOT NULL,
	CONSTRAINT PRIMARY KEY(`realm`,`league`,`day`)
);
--> statement-breakpoint
CREATE INDEX `stash_checkpoint_scope_time` ON `qsPoeBoats__stash_checkpoint` (`realm`,`league`,`capturedAt`,`id`);