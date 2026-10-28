-- One statement per table, so each is rebuilt once and never lacks a primary key while ingest upserts.
-- Existing rows keep an empty tab: they mix merchant and other tabs.
ALTER TABLE `qsPoeBoats__stash_poe1_market_daily`
    ADD `tab` varchar(8) DEFAULT '' NOT NULL,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (`realm`,`league`,`day`,`itemKey`,`identified`,`corrupted`,`foilVariation`,`tab`,`signatureKind`,`signatureValue`);--> statement-breakpoint
ALTER TABLE `qsPoeBoats__stash_poe2_market_daily`
    ADD `tab` varchar(8) DEFAULT '' NOT NULL,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (`realm`,`league`,`day`,`itemKey`,`identified`,`corrupted`,`foilVariation`,`tab`,`signatureKind`,`signatureValue`);--> statement-breakpoint
ALTER TABLE `qsPoeBoats__stash_poe1_unique_hourly`
    ADD `tab` varchar(8) DEFAULT '' NOT NULL,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (`realm`,`league`,`hour`,`itemKey`,`identified`,`corrupted`,`foilVariation`,`links`,`tab`,`signatureKind`,`signatureValue`);--> statement-breakpoint
ALTER TABLE `qsPoeBoats__stash_poe2_unique_hourly`
    ADD `tab` varchar(8) DEFAULT '' NOT NULL,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (`realm`,`league`,`hour`,`itemKey`,`identified`,`corrupted`,`foilVariation`,`links`,`tab`,`signatureKind`,`signatureValue`);
