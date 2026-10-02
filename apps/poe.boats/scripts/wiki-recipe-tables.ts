import { parseHTML } from "linkedom";

export function readWikiRecipeRows(html: string): string[][] {
    const { document } = parseHTML(html);
    for (const node of document.querySelectorAll(".hoverbox__display, .reference")) node.remove();
    const rows: string[][] = [];
    for (const table of document.querySelectorAll("table")) {
        const spans = new Map<number, { value: string; remaining: number }>();
        for (const row of table.querySelectorAll("tr")) {
            const values: string[] = [];
            for (const [column, span] of spans) {
                values[column] = span.value;
                if (--span.remaining === 0) spans.delete(column);
            }
            let column = 0;
            for (const cell of row.querySelectorAll(":scope > td, :scope > th")) {
                while (values[column] !== undefined) column++;
                const value = cell.textContent.replace(/\s+/g, " ").trim();
                const rowspan = Number(cell.getAttribute("rowspan") ?? 1);
                const colspan = Number(cell.getAttribute("colspan") ?? 1);
                for (let offset = 0; offset < colspan; offset++) {
                    values[column + offset] = value;
                    if (rowspan > 1) spans.set(column + offset, { value, remaining: rowspan - 1 });
                }
                column += colspan;
            }
            rows.push(values);
        }
    }
    return rows;
}
