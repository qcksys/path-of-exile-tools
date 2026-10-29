import { data } from "react-router";
import { RouteError } from "~/components/route-error";
import type { Route } from "./+types/404";

/** Unknown paths render the site layout's not-found panel with a 404 status. */
export function meta(): Route.MetaDescriptors {
    return [{ title: "Page not found · POE.BOATS" }];
}

export const action = () => {
    throw data(null, { status: 404 });
};

export const loader = () => {
    throw data(null, { status: 404 });
};

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
    return (
        <main className="container mx-auto flex-1 px-4 py-8">
            <RouteError error={error} />
        </main>
    );
}

export default function NotFound() {
    return null;
}
