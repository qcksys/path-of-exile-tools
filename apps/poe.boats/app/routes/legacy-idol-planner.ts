import { redirect } from "react-router";

// `url`, unlike `request.url`, has no `.data` suffix or router parameters on client navigations.
export function loader({ url }: { url: URL }) {
    return redirect(`/1${url.pathname}${url.search}`, 308);
}

export const action = loader;
