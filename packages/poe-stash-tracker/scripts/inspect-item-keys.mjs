import Database from "better-sqlite3";

const db = new Database("./data.db", { readonly: true });

const q = (sql) => db.prepare(sql).get();
const all = (sql) => db.prepare(sql).all();

const total = q("SELECT COUNT(*) AS n FROM listing");
const withRaw = q("SELECT COUNT(*) AS n FROM listing WHERE raw_item IS NOT NULL");
const nullKey = q("SELECT COUNT(*) AS n FROM listing WHERE item_key IS NULL");
const unidKeys = q("SELECT COUNT(*) AS n FROM listing WHERE item_key LIKE 'unid:%'");
const unidByIcon = q(
    "SELECT COUNT(*) AS n FROM listing WHERE item_key LIKE 'unid:%' AND item_key LIKE '%/%'",
);
const unidByBase = q(
    "SELECT COUNT(*) AS n FROM listing WHERE item_key LIKE 'unid:%' AND item_key NOT LIKE '%/%'",
);
const idKeys = q(
    "SELECT COUNT(*) AS n FROM listing WHERE item_key IS NOT NULL AND item_key NOT LIKE 'unid:%'",
);
const sampleUnid = all(
    "SELECT item_key, COUNT(*) AS n FROM listing WHERE item_key LIKE 'unid:%' GROUP BY item_key ORDER BY n DESC LIMIT 8",
);
const sampleId = all(
    "SELECT item_key, COUNT(*) AS n FROM listing WHERE item_key IS NOT NULL AND item_key NOT LIKE 'unid:%' GROUP BY item_key ORDER BY n DESC LIMIT 5",
);

console.log(
    JSON.stringify(
        {
            total,
            withRaw,
            nullKey,
            unidKeys,
            unidByIcon,
            unidByBase,
            idKeys,
            sampleUnid,
            sampleId,
        },
        null,
        2,
    ),
);
