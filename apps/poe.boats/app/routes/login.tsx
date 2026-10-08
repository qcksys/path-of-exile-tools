import { useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "~/components/ui/button";
import { authClient } from "~/lib/auth.client";

const Login = () => {
    const [params] = useSearchParams();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const requested = params.get("returnTo");
    const callbackURL =
        requested === "/1/crafting/projects" || requested === "/2/crafting/projects"
            ? requested
            : "/";
    const handleGoogleLogin = async () => {
        setError("");
        setPending(true);
        try {
            const result = await authClient.signIn.social({
                provider: "google",
                callbackURL,
                newUserCallbackURL: callbackURL,
            });
            if (result.error) throw new Error("Sign-in failed");
        } catch {
            setError("Could not connect to Google sign-in. Check your connection and try again.");
        } finally {
            setPending(false);
        }
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
            <img src="/logo.avif" alt="POE.BOATS" width={64} height={64} className="rounded-lg" />
            <h1 className="font-heading text-2xl font-bold tracking-tight">Sign in to POE.BOATS</h1>
            <Button
                variant="ghost"
                type="button"
                onClick={handleGoogleLogin}
                disabled={pending}
                aria-busy={pending}
                className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 font-medium px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
            >
                {pending ? "Connecting to Google…" : "Continue with Google"}
            </Button>
            {error && (
                <p role="alert" className="max-w-sm text-center text-sm text-destructive">
                    {error}
                </p>
            )}
        </main>
    );
};

export default Login;
