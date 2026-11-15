# Markdown renderer competition entry

A dependency-free ES module exporting `parse(markdown)`, intended to match the default HTML output of marked 18.1.3. `main.ts` reads `cases.json` from `MAKEFUN_INPUT_DIR` (default `/input`) and writes the rendered HTML array to `MAKEFUN_OUTPUT_DIR` (default `/output`).

Run locally with Node.js 22 and set those directory variables to writable locations.
