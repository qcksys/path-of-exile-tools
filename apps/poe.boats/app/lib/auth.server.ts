import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { admin, bearer, openAPI, twoFactor } from "better-auth/plugins";
import { ENV } from "varlock/env";
import { SYSTEM } from "~/const";
import type { TDatabase } from "~/db/client";
import { tAuthAccount } from "~/db/schema/auth.account";
import { tAuthSession } from "~/db/schema/auth.session";
import { tAuthUser } from "~/db/schema/auth.user";
import { tAuthVerification } from "~/db/schema/auth.verification";

export const authServer = ({ env, db }: { env: CloudflareBindings; db: TDatabase }) => {
    return betterAuth({
        appName: SYSTEM[ENV.ENVIRONMENT].name,
        basePath: "/api/auth",
        socialProviders: {
            google: {
                clientId: env.GOOGLE_CLIENT_ID,
                clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
        },
        plugins: [twoFactor(), openAPI({ disableDefaultReference: true }), bearer(), admin()],
        database: drizzleAdapter(db, {
            provider: "mysql",
            schema: {
                account: tAuthAccount,
                session: tAuthSession,
                user: tAuthUser,
                verification: tAuthVerification,
            },
        }),
        baseURL: `https://${env.URL}`,
        secret: env.BETTER_AUTH_SECRET,
    });
};
