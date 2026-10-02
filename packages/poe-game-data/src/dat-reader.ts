// The public barrel eagerly fetches a browser-only analysis WASM module.
// Load the pinned package's decoder modules without that unused side effect.
type DatApi = typeof import("pathofexile-dat/dat.js");
const entry = import.meta.resolve("pathofexile-dat/dat.js");
export const { readDatFile } = (await import(new URL("dat/dat-file.js", entry).href)) as Pick<
    DatApi,
    "readDatFile"
>;
export const { getFieldReader } = (await import(new URL("dat/reader.js", entry).href)) as Pick<
    DatApi,
    "getFieldReader"
>;
export const { getHeaderLength } = (await import(new URL("dat/header.js", entry).href)) as Pick<
    DatApi,
    "getHeaderLength"
>;
