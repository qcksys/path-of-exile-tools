import { redirect } from "react-router";

export function loader({ request }: { request: Request }) {
    const url = new URL(request.url);
    return redirect(`/1${url.pathname}${url.search}`, 308);
}

export const action = loader;
