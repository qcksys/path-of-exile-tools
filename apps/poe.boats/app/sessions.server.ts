import { createCookieSessionStorage } from "react-router";
import { createThemeSessionResolver } from "remix-themes";
import { PROD_ENV_NAME } from "~/const.ts";

const sessionStorage = createCookieSessionStorage({
    cookie: {
        name: "theme",
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secrets: ["poe-boats-theme-secret"],
        secure: process.env.ENVIRONMENT === PROD_ENV_NAME,
    },
});

export const themeSessionResolver = createThemeSessionResolver(sessionStorage);
