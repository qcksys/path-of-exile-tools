CREATE TABLE `qsPoeBoats__auth_two_factor` (
	`id` varchar(36) PRIMARY KEY,
	`secret` varchar(255) NOT NULL,
	`backupCodes` text NOT NULL,
	`userId` varchar(36) NOT NULL,
	`verified` boolean DEFAULT true,
	`failedVerificationCount` int DEFAULT 0,
	`lockedUntil` timestamp(3)
);
--> statement-breakpoint
CREATE INDEX `twoFactor_secret_idx` ON `qsPoeBoats__auth_two_factor` (`secret`);--> statement-breakpoint
CREATE INDEX `twoFactor_userId_idx` ON `qsPoeBoats__auth_two_factor` (`userId`);