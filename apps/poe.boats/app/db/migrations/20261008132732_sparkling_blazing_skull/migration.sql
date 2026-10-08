CREATE TABLE `qsPoeBoats__ingest_worker` (
	`workerId` varchar(100) PRIMARY KEY,
	`realm` varchar(10) NOT NULL,
	`league` varchar(100) NOT NULL,
	`receivedAt` bigint NOT NULL,
	`report` json NOT NULL
);
