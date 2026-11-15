// Root and connection entries are 8 bytes in PoE 2 and PoE 1 3.30+ graphs (a connection carries an
// orbit field) and 4 bytes in earlier PoE 1 Genesis graphs. The header does not record the width,
// so the parser accepts the width that reads the whole graph and rejects a file both widths read
// differently.
const entryWidths = [8, 4] as const;

export function passiveGraphNodes(bytes: Uint8Array): Set<number> {
    if (bytes[0] !== 3 || (bytes[1] !== 0 && bytes[1] !== 2))
        throw new Error("Unsupported passive skill graph format.");
    const parsed: Set<number>[] = [];
    const failures: string[] = [];
    for (const width of entryWidths) {
        try {
            parsed.push(readGraph(bytes, width));
        } catch (error) {
            failures.push(
                `${width}-byte entries: ${error instanceof Error ? error.message : error}`,
            );
        }
    }
    const [nodes, other] = parsed;
    if (!nodes) throw new Error(`Unreadable passive skill graph (${failures.join("; ")})`);
    if (other && (other.size !== nodes.size || [...other].some((id) => !nodes.has(id))))
        throw new Error("Ambiguous passive skill graph entry width.");
    return nodes;
}

function readGraph(bytes: Uint8Array, width: (typeof entryWidths)[number]): Set<number> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 2;
    const skip = (size: number) => {
        if (offset + size > bytes.byteLength) throw new Error("Truncated passive skill graph.");
        offset += size;
    };
    const byte = () => {
        skip(1);
        return view.getUint8(offset - 1);
    };
    const integer = () => {
        skip(4);
        return view.getUint32(offset - 4, true);
    };
    skip(byte());
    skip(integer() * width);
    const groups = integer();
    const nodes = new Set<number>();
    for (let group = 0; group < groups; group++) {
        // Position, association, background and the one-byte jewel reference.
        skip(17);
        const count = integer();
        for (let node = 0; node < count; node++) {
            const id = integer();
            if (nodes.has(id)) throw new Error(`Duplicate passive graph node: ${id}`);
            nodes.add(id);
            skip(8);
            skip(integer() * width);
        }
    }
    if (offset !== bytes.byteLength) throw new Error("Trailing passive skill graph data.");
    // Read with the wrong width, a truncated graph can end exactly after an empty group list.
    if (!nodes.size) throw new Error("Passive skill graph has no nodes.");
    return nodes;
}
