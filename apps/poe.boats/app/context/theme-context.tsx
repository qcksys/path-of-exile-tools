import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { Theme } from "remix-themes";
import { toast } from "sonner";

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

export function ThemeProvider({ initial, children }: { initial: Theme; children: ReactNode }) {
    const [theme, setTheme] = useState(initial);
    const confirmed = useRef(initial);
    const desired = useRef(initial);
    const saving = useRef(false);
    const channel = useRef<BroadcastChannel | null>(null);
    useEffect(() => {
        if (!window.BroadcastChannel) return;
        const changes = new BroadcastChannel("remix-themes-channel");
        channel.current = changes;
        changes.onmessage = ({ data }) => {
            if (data?.theme !== Theme.LIGHT && data?.theme !== Theme.DARK) return;
            confirmed.current = data.theme;
            if (!saving.current) {
                desired.current = data.theme;
                setTheme(data.theme);
            }
        };
        return () => {
            channel.current = null;
            changes.close();
        };
    }, []);

    async function toggle() {
        desired.current = desired.current === Theme.DARK ? Theme.LIGHT : Theme.DARK;
        setTheme(desired.current);
        if (saving.current) return;
        saving.current = true;
        try {
            while (desired.current !== confirmed.current) {
                const next = desired.current;
                try {
                    const response = await fetch("/action/set-theme", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ theme: next }),
                    });
                    const result = response.ok && (await response.json());
                    if (
                        !result ||
                        typeof result !== "object" ||
                        !("success" in result) ||
                        result.success !== true
                    )
                        throw new Error("Could not save the theme.");
                } catch {
                    if (desired.current === next) {
                        desired.current = confirmed.current;
                        setTheme(confirmed.current);
                        toast.error("Could not save the theme.");
                    }
                    continue;
                }
                confirmed.current = next;
                channel.current?.postMessage({ theme: next, definedBy: "USER" });
            }
        } finally {
            saving.current = false;
        }
    }

    return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
    const value = useContext(ThemeContext);
    if (!value) throw new Error("ThemeProvider is required.");
    return value;
}
