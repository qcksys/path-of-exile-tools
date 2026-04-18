import { Link } from "react-router";

const Home = () => {
    return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
            <img src="/logo.avif" alt="POE.BOATS" width={80} height={80} className="rounded-lg" />
            <h1 className="font-heading text-4xl font-bold tracking-tight">POE.BOATS</h1>
            <p className="text-muted-foreground text-lg">
                Path of Exile tooling for the boat league.
            </p>
            <nav className="flex gap-4">
                <Link
                    to="/idol-planner"
                    className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                    Idol Planner
                </Link>
            </nav>
        </main>
    );
};

export default Home;
