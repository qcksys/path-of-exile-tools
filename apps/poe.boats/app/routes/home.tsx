import { Link } from "react-router";
import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";

const Home = () => {
    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader />
            <main className="container mx-auto flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
                <img
                    src="/logo.avif"
                    alt="POE.BOATS"
                    width={80}
                    height={80}
                    className="rounded-lg"
                />
                <h1 className="font-heading text-4xl font-bold tracking-tight">POE.BOATS</h1>
                <p className="text-muted-foreground text-lg">
                    Tools for Path of Exile 1 and Path of Exile 2.
                </p>
                <nav className="flex gap-4">
                    <Link
                        to="/1/"
                        className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Path of Exile 1
                    </Link>
                    <Link
                        to="/2/"
                        className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    >
                        Path of Exile 2
                    </Link>
                </nav>
            </main>
            <AppFooter />
        </div>
    );
};

export default Home;
