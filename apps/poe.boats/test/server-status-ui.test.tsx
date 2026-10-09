// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vite-plus/test";
import ServerStatus from "~/routes/server-status";

const refresh = vi.hoisted(() => ({ state: "idle", revalidate: vi.fn() }));
vi.mock("react-router", async (original) => ({
    ...(await original<typeof import("react-router")>()),
    useRevalidator: () => refresh,
}));
// biome-ignore lint/style/useNamingConvention: Mocked React component export.
vi.mock("~/components/app-header", () => ({ AppHeader }));
// biome-ignore lint/style/useNamingConvention: Mocked React component export.
vi.mock("~/components/app-footer", () => ({ AppFooter }));
function AppHeader() {
    return null;
}
function AppFooter() {
    return null;
}

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
});

it("shows empty coverage and refreshes manually and on the polling interval", () => {
    vi.useFakeTimers();
    const view = render(
        <MemoryRouter>
            <ServerStatus loaderData={{ checkedAt: 0, workers: [], coverage: [] }} />
        </MemoryRouter>,
    );
    expect(screen.getByText(/No worker has reported/)).toBeTruthy();
    expect(screen.getByText(/No hourly summaries/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(refresh.revalidate).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(30_000));
    expect(refresh.revalidate).toHaveBeenCalledTimes(2);
    view.unmount();
    act(() => vi.advanceTimersByTime(30_000));
    expect(refresh.revalidate).toHaveBeenCalledTimes(2);
});

it("shows stale workers separately from stored history and never implies continuous coverage", () => {
    render(
        <MemoryRouter>
            <ServerStatus
                loaderData={{
                    checkedAt: 1_000_000,
                    workers: [
                        {
                            workerId: "local-allflame",
                            realm: "pc",
                            league: "Allflame",
                            state: "running",
                            stage: "delivery",
                            startedAt: 0,
                            reportedAt: 1,
                            progressAt: 1,
                            receivedAt: 1,
                            health: "stale",
                            completedAt: null,
                            lastSuccessAt: null,
                            failedStages: [],
                            cycles: 1,
                            pages: 5,
                            equipmentObserved: 100,
                            stashCaughtUp: false,
                            currencyNextHour: 3600,
                            deliveredHours: 2,
                            deliveredRows: 2000,
                        },
                    ],
                    coverage: [
                        {
                            realm: "pc",
                            league: "Allflame",
                            stream: "currency",
                            firstHour: 3600,
                            latestHour: 10800,
                            hours: 2,
                            rows: 2000,
                        },
                    ],
                }}
            />
        </MemoryRouter>,
    );
    expect(screen.getByText("Heartbeat missing")).toBeTruthy();
    expect(screen.getByText("1 need attention")).toBeTruthy();
    expect(screen.getByRole("table").textContent).toContain("Allflame");
    expect(screen.getByText(/Gaps are not filled/)).toBeTruthy();
    expect(screen.getByText(/Next snapshot to request/)).toBeTruthy();
});
