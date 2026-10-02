ALTER TABLE `qsPoeBoats__stash_currency_hourly`
    DROP PRIMARY KEY,
    ADD `realm` varchar(10) DEFAULT 'pc' NOT NULL,
    ADD PRIMARY KEY (`realm`,`league`,`marketId`,`hour`);--> statement-breakpoint
ALTER TABLE `qsPoeBoats__stash_unique_hourly`
    DROP PRIMARY KEY,
    ADD `realm` varchar(10) DEFAULT 'pc' NOT NULL,
    ADD `removedCount` int DEFAULT 0 NOT NULL,
    ADD `likelySales` int DEFAULT 0 NOT NULL,
    ADD `relistedCount` int DEFAULT 0 NOT NULL,
    ADD `pendingCount` int DEFAULT 0 NOT NULL,
    ADD `salesPrices` json,
    ADD PRIMARY KEY (`realm`,`league`,`hour`,`itemKey`,`identified`,`corrupted`,`foilVariation`,`signatureKind`,`signatureValue`);
