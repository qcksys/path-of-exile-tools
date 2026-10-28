-- One statement, so the table is rebuilt once and never lacks a primary key while ingest upserts.
ALTER TABLE `qsPoeBoats__stash_unique_hourly`
    ADD `links` tinyint DEFAULT 0 NOT NULL,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (`realm`,`league`,`hour`,`itemKey`,`identified`,`corrupted`,`foilVariation`,`links`,`signatureKind`,`signatureValue`);
