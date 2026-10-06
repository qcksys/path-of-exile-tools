export function passiveGraphNodes(bytes: Uint8Array): Set<number> {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
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
    if (byte() !== 3) throw new Error("Unsupported passive skill graph format.");
    const format = byte();
    if (format !== 0 && format !== 2) throw new Error("Unsupported passive skill graph format.");
    // Genesis graphs use 32-bit roots; the PoE 2 character graph uses 64-bit roots.
    skip(byte());
    skip(integer() * (format === 2 ? 4 : 8));
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
            // PoE 2 connections include an orbit field; Genesis connections contain only IDs.
            skip(8);
            skip(integer() * (format === 2 ? 4 : 8));
        }
    }
    if (offset !== bytes.byteLength) throw new Error("Trailing passive skill graph data.");
    return nodes;
}
