import { authClient } from "~/lib/auth.client";

const Login = () => {
    const handleGoogleLogin = () => {
        authClient.signIn.social({ provider: "google" });
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
            <img src="/logo.avif" alt="POE.BOATS" width={64} height={64} className="rounded-lg" />
            <h1 className="font-heading text-2xl font-bold tracking-tight">Sign in to POE.BOATS</h1>
            <button
                type="button"
                onClick={handleGoogleLogin}
                className="bg-white hover:bg-gray-50 text-gray-800 border border-gray-300 font-medium px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
            >
                Continue with Google
            </button>
        </main>
    );
};

export default Login;
