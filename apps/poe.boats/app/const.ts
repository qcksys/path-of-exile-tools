export const DB_TABLE_PREFIX = "qsPoeBoats__";

export const PROD_ENV_NAME = "prod";

export const SYSTEM = {
    local: {
        emailAddress: "poe.boats-local@qcksys.com",
        name: "POE.BOATS (Local)",
    },
    dev: {
        emailAddress: "poe.boats-dev@qcksys.com",
        name: "POE.BOATS (DEV)",
    },
    prod: {
        emailAddress: "poe.boats@qcksys.com",
        name: "POE.BOATS",
    },
} as const;
