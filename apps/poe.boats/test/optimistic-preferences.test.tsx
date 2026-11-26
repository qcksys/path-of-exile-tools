// @vitest-environment jsdom
import {
    act,
    cleanup,
    fireEvent,
    render,
    renderHook,
    screen,
    waitFor,
} from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { Theme } from "remix-themes";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { CopyButton } from "~/components/copy-button";
import { LocaleSwitcher } from "~/components/idol-planner/locale-switcher";
import { ThemeProvider, useThemePreference } from "~/context/theme-context";
import { usePlannerState } from "~/hooks/use-planner-state";
import { createI18nInstance } from "~/i18n";

vi.hoisted(() => vi.stubGlobal("matchMedia", () => ({ matches: false })));

afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function ThemeButton() {
    const { theme, toggle } = useThemePreference();
    return (
        <button type="button" onClick={toggle}>
            {theme}
        </button>
    );
}

it("shows the requested language while its bundle loads and restores the original language when it fails", async () => {
    const i18n = createI18nInstance({ lng: "en" });
    const load = Promise.withResolvers<void>();
    vi.spyOn(i18n, "reloadResources").mockReturnValue(load.promise);
    render(
        <I18nextProvider i18n={i18n}>
            <LocaleSwitcher />
        </I18nextProvider>,
    );
    const control = screen.getByRole("combobox");
    const previous = control.textContent;
    fireEvent.click(control);
    const german = screen.getByRole("option", { name: "Deutsch" });
    fireEvent.mouseMove(german);
    fireEvent.click(german);
    await waitFor(() => expect(control.textContent).toContain("Deutsch"));
    expect(i18n.language).toBe("en");
    load.reject(new Error("Offline"));
    await waitFor(() => expect(control.textContent).toBe(previous));
    expect(document.cookie).not.toContain("poe-locale=de");
});

it("shows a pending clipboard request, restores the button on denial, and accepts a retry", async () => {
    const denied = Promise.withResolvers<void>();
    const writeText = vi.fn().mockReturnValueOnce(denied.promise).mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const failed = vi.fn();
    render(
        <CopyButton getText={() => "item text"} onCopyError={failed}>
            Copy text
        </CopyButton>,
    );
    const copy = screen.getByRole("button", { name: "Copy text" });
    fireEvent.click(copy);
    expect(copy.getAttribute("aria-busy")).toBe("true");
    denied.reject(new Error("Denied"));
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(copy.hasAttribute("disabled")).toBe(false);
    fireEvent.click(copy);
    await screen.findByRole("button", { name: "Copied" });
    expect(writeText).toHaveBeenLastCalledWith("item text");
});

it("serializes rapid theme changes and restores the last acknowledged theme on rejection", async () => {
    const first = Promise.withResolvers<Response>();
    const second = Promise.withResolvers<Response>();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", save);
    render(
        <ThemeProvider initial={Theme.DARK}>
            <ThemeButton />
        </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    fireEvent.click(screen.getByRole("button", { name: "light" }));
    expect(screen.getByRole("button", { name: "dark" })).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve(Response.json({ success: true }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    second.resolve(Response.json({ success: false }));
    await screen.findByRole("button", { name: "light" });
    expect(save.mock.calls.map(([, options]) => JSON.parse(options.body).theme)).toEqual([
        "light",
        "dark",
    ]);
});

it("restores both the active planner set and its contents after a failed save, then accepts another edit", () => {
    const { result } = renderHook(usePlannerState);
    act(() => {
        result.current.sets.createSet("Saved set");
    });
    const confirmed = result.current.sets.activeSetId;
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
        throw new Error("Storage full");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    act(() => {
        result.current.sets.deleteSet(confirmed!);
    });
    expect(result.current.sets.activeSet?.name).toBe("Saved set");
    expect(result.current.sets.activeSetId).toBe(confirmed);
    act(() => {
        result.current.sets.renameSet(confirmed!, "Second edit");
    });
    expect(result.current.sets.activeSet?.name).toBe("Second edit");
});
