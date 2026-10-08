import { createContext, type ReactNode, useContext, useEffect, useRef } from "react";

export type GraphEditCommit = () => Promise<boolean>;
const Drafts = createContext<Map<symbol, GraphEditCommit> | null>(null);

export function GraphEditSession({
    children,
    register,
}: {
    children: ReactNode;
    register: (commit: GraphEditCommit | undefined) => void;
}) {
    const drafts = useRef(new Map<symbol, GraphEditCommit>());
    useEffect(() => {
        register(async () => {
            for (const commit of drafts.current.values()) {
                if (!(await commit())) return false;
            }
            return true;
        });
        return () => register(undefined);
    }, [register]);
    return <Drafts.Provider value={drafts.current}>{children}</Drafts.Provider>;
}

export function useGraphEditCommit(commit: GraphEditCommit | undefined) {
    const drafts = useContext(Drafts);
    const latest = useRef(commit);
    latest.current = commit;
    const enabled = Boolean(commit);
    useEffect(() => {
        if (!drafts || !enabled) return;
        const id = Symbol();
        drafts.set(id, () => latest.current?.() ?? Promise.resolve(true));
        return () => {
            drafts.delete(id);
        };
    }, [drafts, enabled]);
}
