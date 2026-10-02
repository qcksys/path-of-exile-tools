import { AppFooter } from "~/components/app-footer";
import { AppHeader } from "~/components/app-header";

export default function Poe2Home() {
    return (
        <div className="flex min-h-screen flex-col">
            <AppHeader section="Path of Exile 2" />
            <main className="container mx-auto flex flex-1 flex-col items-center justify-center gap-6 p-4 text-center">
                <h1 className="font-heading text-4xl font-bold tracking-tight">Path of Exile 2</h1>
                <p className="text-muted-foreground text-lg">No tools available yet.</p>
            </main>
            <AppFooter />
        </div>
    );
}
