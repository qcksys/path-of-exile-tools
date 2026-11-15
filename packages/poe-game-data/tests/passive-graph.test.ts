import { describe, expect, it } from "vite-plus/test";
import { passiveGraphNodes } from "../src/passive-graph.ts";

function fixture(nodes = [10, 20], format = 0, width = 8) {
    const parts: Buffer[] = [Buffer.from([3, format, 2, 1, 12])];
    const integer = (value: number) => {
        const bytes = Buffer.alloc(4);
        bytes.writeUInt32LE(value);
        parts.push(bytes);
    };
    // An 8-byte root is a 64-bit ID; an 8-byte connection is an ID and an orbit.
    const entry = (value: number, high: number) => {
        integer(value);
        if (width === 8) integer(high);
    };
    integer(1);
    entry(10, 0);
    integer(1);
    parts.push(Buffer.alloc(17));
    integer(nodes.length);
    for (const id of nodes) {
        integer(id);
        integer(2);
        integer(5);
        integer(1);
        entry(10, 2);
    }
    return Buffer.concat(parts);
}

// PoE 2 graphs use format 0 with 8-byte entries; Genesis graphs use format 2, with 4-byte entries
// before PoE 1 3.30 and 8-byte entries from 3.30.
const layouts = [
    [0, 8],
    [2, 4],
    [2, 8],
] as const;

describe("client passive graph membership", () => {
    it.each(
        layouts,
    )("reads format %s orbits, roots, group headers and connected nodes with %s-byte entries from a byte slice", (format, width) => {
        const bytes = fixture([10, 20], format, width);
        const buffer = Buffer.concat([Buffer.alloc(11), bytes, Buffer.alloc(7)]);
        expect(passiveGraphNodes(buffer.subarray(11, 11 + bytes.length))).toEqual(
            new Set([10, 20]),
        );
    });

    it.each(
        layouts,
    )("rejects incomplete, unsupported, duplicate and trailing format %s data with %s-byte entries", (format, width) => {
        const bytes = fixture([10, 20], format, width);
        for (let end = 0; end < bytes.length; end++)
            expect(() => passiveGraphNodes(bytes.subarray(0, end))).toThrow();
        expect(() => passiveGraphNodes(fixture([10, 10], format, width))).toThrow("Duplicate");
        expect(() => passiveGraphNodes(Buffer.concat([bytes, Buffer.from([0])]))).toThrow(
            "Trailing",
        );
        for (const index of [0, 1]) {
            const changed = Buffer.from(bytes);
            changed[index] = 9;
            expect(() => passiveGraphNodes(changed)).toThrow("Unsupported");
        }
        const oversized = Buffer.from(bytes);
        oversized.writeUInt32LE(0xffffffff, 5);
        expect(() => passiveGraphNodes(oversized)).toThrow("Truncated");
    });
});
