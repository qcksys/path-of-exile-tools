import { createConnection } from "node:net";
import { type Game, hosts, validPatch } from "./config.ts";

export function parseVersion(game: Game, response: Buffer): string | null {
    if (!response.length) return null;
    if (response[0] !== 2) throw new Error("Unexpected patch server protocol response");
    if (response.length < 35) return null;
    const length = response.readUInt16BE(33);
    if (length < 1 || length > 2048) throw new Error("Invalid patch server URL length");
    if (response.length < 35 + length * 2) return null;
    const url = new URL(response.subarray(35, 35 + length * 2).toString("utf16le"));
    if (
        url.protocol !== "https:" ||
        url.host !== hosts[game] ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    )
        throw new Error("Unexpected patch CDN");
    const patch = url.pathname.replace(/^\/|\/$/g, "");
    if (!validPatch(game, patch)) throw new Error(`Invalid patch version: ${patch}`);
    return patch;
}

export async function discoverVersion(game: Game): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = createConnection({
            host: game === "poe1" ? "patch.pathofexile.com" : "patch.pathofexile2.com",
            port: game === "poe1" ? 12995 : 13060,
        });
        let response = Buffer.alloc(0);
        let settled = false;
        const fail = (error: Error) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
            socket.destroy();
        };
        socket.setTimeout(15_000, () => fail(new Error("Patch discovery timed out")));
        socket.on("error", fail);
        socket.on("connect", () => socket.write(Buffer.from([1, 6])));
        socket.on("data", (bytes) => {
            response = Buffer.concat([response, bytes]);
            try {
                const patch = parseVersion(game, response);
                if (patch) {
                    settled = true;
                    resolve(patch);
                    socket.destroy();
                }
            } catch (error) {
                fail(error instanceof Error ? error : new Error(String(error)));
            }
        });
        socket.on("end", () => {
            if (!settled) fail(new Error("Truncated response from patch server"));
        });
    });
}
