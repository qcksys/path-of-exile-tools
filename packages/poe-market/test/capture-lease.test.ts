import { describe, expect, it } from "vite-plus/test";
import {
    CAPTURE_FALLBACK_START_MS,
    CAPTURE_LEASE_GRACE_MS,
    CAPTURE_LEASE_MS,
    type CaptureLeaseRequest,
    type CaptureLeaseState,
    captureLeaseStateSchema,
    captureSegmentKey,
    checkCaptureLease,
    decideCaptureLease,
    initialCaptureLeaseState,
} from "../src/capture-lease.ts";

const silent = CAPTURE_LEASE_MS + CAPTURE_LEASE_GRACE_MS + 1;
const first = captureSegmentKey(2, 0);
const second = captureSegmentKey(2, 1);

/** Applies requests in turn, returning the final state and every response. */
function run(state: CaptureLeaseState, steps: [CaptureLeaseRequest, number][]) {
    const responses = [];
    for (const [request, now] of steps) {
        const result = decideCaptureLease(state, request, now);
        state = result.state;
        responses.push({ ...result.response, ...(result.stopFallback && { stopFallback: true }) });
    }
    return { state, responses };
}

/** Home holding epoch 1 at cursor `c1`, then silent until the fallback started at time 0. */
function failedOver() {
    const home = run(initialCaptureLeaseState, [[{ holder: "home", cursor: "c1" }, -silent]]);
    const check = checkCaptureLease(home.state, 0, false);
    expect(check).toMatchObject({ start: true, stop: null });
    return check.state;
}

describe("home", () => {
    it("takes a new lease, renews it in the same epoch and records its cursor", () => {
        const { state, responses } = run(initialCaptureLeaseState, [
            [{ holder: "home", cursor: "c1" }, 0],
            [{ holder: "home", epoch: 1, cursor: "c2" }, 10_000],
        ]);
        expect(responses).toEqual([
            { state: "hold", epoch: 1 },
            { state: "hold", epoch: 1 },
        ]);
        expect(state).toMatchObject({
            holder: "home",
            epoch: 1,
            cursor: "c2",
            expiresAt: 10_000 + CAPTURE_LEASE_MS,
        });
    });

    it("keeps its epoch after a restart within the lease, continuing from its own cursor", () => {
        const { responses } = run(initialCaptureLeaseState, [
            [{ holder: "home", cursor: "c1" }, 0],
            [{ holder: "home", cursor: "c3" }, 30_000],
        ]);
        expect(responses[1]).toEqual({ state: "hold", epoch: 1 });
    });
});

describe("failing over", () => {
    it("starts the fallback only once home has been silent for the lease and its grace", () => {
        const home = run(initialCaptureLeaseState, [[{ holder: "home", cursor: "c1" }, 0]]).state;
        expect(checkCaptureLease(home, silent - 1, false)).toMatchObject({ start: false });
        expect(checkCaptureLease(home, silent, false)).toEqual({
            state: {
                ...home,
                holder: "fallback",
                expiresAt: silent + CAPTURE_FALLBACK_START_MS,
            },
            start: true,
            stop: null,
        });
    });

    it("does not start a fallback without a cursor to continue from", () => {
        const home = run(initialCaptureLeaseState, [[{ holder: "home" }, 0]]).state;
        expect(checkCaptureLease(home, silent, false)).toMatchObject({ start: false });
    });

    it("gives a new fallback process its own epoch and home's last cursor", () => {
        const { state, responses } = run(failedOver(), [
            [{ holder: "fallback" }, 1_000],
            [{ holder: "fallback", epoch: 2, segment: first, cursor: "f1" }, 11_000],
        ]);
        expect(responses).toEqual([
            { state: "hold", epoch: 2, from: "c1" },
            { state: "hold", epoch: 2 },
        ]);
        expect(state).toMatchObject({ holder: "fallback", epoch: 2, segment: first, cursor: "f1" });
    });

    it("fences off an older fallback process once a new one has started", () => {
        const { state, responses } = run(failedOver(), [
            [{ holder: "fallback" }, 1_000],
            [{ holder: "fallback", epoch: 2, segment: first, cursor: "f1" }, 11_000],
            // The Container restarted: its new process continues from the last uploaded page.
            [{ holder: "fallback" }, 20_000],
            [{ holder: "fallback", epoch: 2, segment: second, cursor: "f2" }, 21_000],
        ]);
        expect(responses.slice(2)).toEqual([
            { state: "hold", epoch: 3, from: "f1" },
            { state: "stop" },
        ]);
        expect(state).toMatchObject({ epoch: 3, segment: first, cursor: "f1" });
    });

    it("tells a fallback to stop while home holds the lease", () => {
        const { responses } = run(initialCaptureLeaseState, [
            [{ holder: "home", cursor: "c1" }, 0],
            [{ holder: "fallback" }, 1_000],
        ]);
        expect(responses[1]).toEqual({ state: "stop" });
        const home = run(initialCaptureLeaseState, [[{ holder: "home", cursor: "c1" }, 0]]).state;
        expect(checkCaptureLease(home, 1_000, true)).toMatchObject({ stop: "signal" });
    });
});

describe("handing back", () => {
    it("keeps the fallback capturing until home has imported every segment it uploaded", () => {
        const { state, responses } = run(failedOver(), [
            [{ holder: "fallback" }, 1_000],
            [{ holder: "fallback", epoch: 2, segment: first, cursor: "f1" }, 10_000],
            [{ holder: "home", imported: null }, 20_000],
            [{ holder: "fallback", epoch: 2, segment: second, cursor: "f2" }, 30_000],
            [{ holder: "home", imported: first }, 31_000],
            [{ holder: "fallback", epoch: 2 }, 40_000],
            [{ holder: "home", imported: second }, 41_000],
            [{ holder: "fallback", epoch: 2 }, 50_000],
        ]);
        expect(responses.slice(2)).toEqual([
            { state: "import", segment: first },
            { state: "hold", epoch: 2 },
            { state: "import", segment: second },
            { state: "hold", epoch: 2 },
            { state: "import", segment: second },
            { state: "release" },
        ]);
        expect(state).toMatchObject({ holder: "fallback", homeWaiting: true, imported: second });
    });

    it("gives home the lease after the fallback's final segment, from its final cursor", () => {
        const final = captureSegmentKey(2, 2);
        const { state, responses } = run(failedOver(), [
            [{ holder: "fallback" }, 1_000],
            [{ holder: "fallback", epoch: 2, segment: second, cursor: "f2" }, 10_000],
            [{ holder: "home", imported: second }, 20_000],
            [{ holder: "fallback", epoch: 2 }, 21_000],
            [
                { holder: "fallback", epoch: 2, segment: final, cursor: "f3", released: true },
                25_000,
            ],
            [{ holder: "home", imported: second }, 26_000],
            [{ holder: "home", imported: final }, 27_000],
            [{ holder: "fallback", epoch: 2 }, 28_000],
        ]);
        expect(responses.slice(2)).toEqual([
            { state: "import", segment: second },
            { state: "release" },
            { state: "stop" },
            { state: "import", segment: final },
            { state: "hold", epoch: 3, from: "f3", stopFallback: true },
            { state: "stop" },
        ]);
        expect(state).toMatchObject({
            holder: "home",
            epoch: 3,
            cursor: "f3",
            imported: final,
            homeWaiting: false,
            released: false,
        });
        // The next outage continues from home's own cursor again.
        const renewed = run(state, [[{ holder: "home", epoch: 3, cursor: "c9" }, 30_000]]);
        expect(renewed.responses).toEqual([{ state: "hold", epoch: 3 }]);
        expect(renewed.state.cursor).toBe("c9");
    });

    it("counts a fallback that is gone as released once home has imported every segment", () => {
        const waiting = run(failedOver(), [
            [{ holder: "fallback" }, 1_000],
            [{ holder: "fallback", epoch: 2, segment: first, cursor: "f1" }, 10_000],
            [{ holder: "home", imported: first }, 20_000],
        ]).state;
        // The Container exited: its pages since the first segment are lost.
        const check = checkCaptureLease(waiting, 21_000, false);
        expect(check).toMatchObject({ start: false, stop: null });
        expect(check.state.released).toBe(true);
        const { responses } = run(check.state, [[{ holder: "home", imported: first }, 22_000]]);
        expect(responses).toEqual([{ state: "hold", epoch: 3, from: "f1", stopFallback: true }]);
    });

    it("restarts a fallback that is gone while home still has segments to import", () => {
        const waiting = run(failedOver(), [
            [{ holder: "fallback" }, 1_000],
            [{ holder: "fallback", epoch: 2, segment: second, cursor: "f2" }, 10_000],
            [{ holder: "home", imported: null }, 20_000],
        ]).state;
        // Home has an outage's worth of segments to append: the stream must not wait for it.
        const check = checkCaptureLease(waiting, 21_000, false);
        expect(check).toMatchObject({ start: true, stop: null });
        expect(check.state).toMatchObject({
            holder: "fallback",
            released: false,
            homeWaiting: false,
        });
        const { responses } = run(check.state, [
            [{ holder: "fallback" }, 22_000],
            [{ holder: "home", imported: first }, 23_000],
        ]);
        // The new process continues from the last uploaded cursor; home keeps importing.
        expect(responses).toEqual([
            { state: "hold", epoch: 3, from: "f2" },
            { state: "import", segment: second },
        ]);
    });

    it("restarts a fallback that stopped renewing while home, waiting, went quiet too", () => {
        // Both lost the Worker: home's last request asked for the lease back.
        const waiting = run(failedOver(), [
            [{ holder: "fallback" }, 1_000],
            [{ holder: "fallback", epoch: 2, segment: second, cursor: "f2" }, 10_000],
            [{ holder: "home", imported: first }, 10_000],
        ]).state;
        const check = checkCaptureLease(waiting, 10_000 + silent, true);
        expect(check).toMatchObject({ start: true, stop: "destroy" });
        expect(check.state.released).toBe(false);
    });

    it("does not release a fallback to a home that has gone quiet", () => {
        const { responses } = run(failedOver(), [
            [{ holder: "fallback" }, 1_000],
            [{ holder: "fallback", epoch: 2, segment: first, cursor: "f1" }, 10_000],
            [{ holder: "home", imported: first }, 20_000],
            [{ holder: "fallback", epoch: 2 }, 20_000 + silent],
        ]);
        expect(responses[3]).toEqual({ state: "hold", epoch: 2 });
    });

    it("starts a new fallback when home goes quiet after the fallback released", () => {
        const released = run(failedOver(), [
            [{ holder: "fallback" }, 1_000],
            [{ holder: "fallback", epoch: 2, segment: first, cursor: "f1" }, 10_000],
            [{ holder: "home", imported: first }, 20_000],
            [{ holder: "fallback", epoch: 2, cursor: "f1", released: true }, 21_000],
        ]).state;
        expect(released).toMatchObject({ released: true, homeWaiting: true });
        // While home keeps asking it takes the lease; nothing is started.
        expect(checkCaptureLease(released, 30_000, false)).toMatchObject({ start: false });
        // The released Container exits before its successor starts.
        expect(checkCaptureLease(released, 20_000 + silent, true)).toMatchObject({
            start: false,
            stop: "signal",
        });
        const check = checkCaptureLease(released, 20_000 + silent, false);
        expect(check).toMatchObject({ start: true, stop: null });
        const { responses } = run(check.state, [[{ holder: "fallback" }, 21_000 + silent]]);
        expect(responses).toEqual([{ state: "hold", epoch: 3, from: "f1" }]);
    });

    it("reads stored state from before home's last request was recorded", () => {
        const { homeSeenAt: _, ...stored } = initialCaptureLeaseState;
        expect(captureLeaseStateSchema.parse(stored).homeSeenAt).toBe(0);
    });

    it("hands back without a check once a silent fallback's lease has lapsed", () => {
        const { responses } = run(failedOver(), [
            [{ holder: "fallback" }, 1_000],
            [{ holder: "fallback", epoch: 2, segment: first, cursor: "f1" }, 10_000],
            [{ holder: "home", imported: first }, 10_000 + silent],
        ]);
        expect(responses[2]).toEqual({ state: "hold", epoch: 3, from: "f1", stopFallback: true });
    });
});

describe("a fallback that stops working", () => {
    it("is restarted when it exits, and destroyed and restarted when it stops renewing", () => {
        const running = run(failedOver(), [[{ holder: "fallback" }, 1_000]]).state;
        expect(checkCaptureLease(running, 30_000, true)).toMatchObject({
            start: false,
            stop: null,
        });
        expect(checkCaptureLease(running, 30_000, false)).toMatchObject({
            start: true,
            stop: null,
        });
        const hung = checkCaptureLease(running, 1_000 + silent, true);
        expect(hung).toMatchObject({ start: true, stop: "destroy" });
        expect(hung.state.expiresAt).toBe(1_000 + silent + CAPTURE_FALLBACK_START_MS);
    });

    it("waits for an older Container to exit before starting a new one", () => {
        const home = run(initialCaptureLeaseState, [[{ holder: "home", cursor: "c1" }, 0]]).state;
        const check = checkCaptureLease(home, silent, true);
        expect(check).toMatchObject({ start: false, stop: null });
        expect(checkCaptureLease(check.state, silent + 30_000, false)).toMatchObject({
            start: true,
        });
    });
});
