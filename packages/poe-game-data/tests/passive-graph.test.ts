import { describe, expect, it } from "vite-plus/test";
import { passiveGraphNodes } from "../src/passive-graph.ts";

function fixture(nodes = [10, 20], format = 0) {
    const parts: Buffer[] = [Buffer.from([3, format, 2, 1, 12])];
    const integer = (value: number) => {
        const bytes = Buffer.alloc(4);
        bytes.writeUInt32LE(value);
        parts.push(bytes);
    };
    integer(1);
    integer(10);
    if (format === 0) integer(0);
    integer(1);
    parts.push(Buffer.alloc(17));
    integer(nodes.length);
    for (const id of nodes) {
        integer(id);
        integer(2);
        integer(5);
        integer(1);
        integer(10);
        if (format === 0) integer(2);
    }
    return Buffer.concat(parts);
}

describe("client passive graph membership", () => {
    it.each([
        0, 2,
    ])("reads format %s orbits, roots, group headers and connected nodes from a byte slice", (format) => {
        const bytes = fixture([10, 20], format);
        const buffer = Buffer.concat([Buffer.alloc(11), bytes, Buffer.alloc(7)]);
        expect(passiveGraphNodes(buffer.subarray(11, 11 + bytes.length))).toEqual(
            new Set([10, 20]),
        );
    });

    it.each([
        0, 2,
    ])("rejects incomplete, unsupported, duplicate and trailing format %s data", (format) => {
        const bytes = fixture([10, 20], format);
        for (let end = 0; end < bytes.length; end++)
            expect(() => passiveGraphNodes(bytes.subarray(0, end))).toThrow();
        expect(() => passiveGraphNodes(fixture([10, 10], format))).toThrow("Duplicate");
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
