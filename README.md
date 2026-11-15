# markdown-render-speed-02

[![Entry](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/c/markdown-render-speed-02)
[![Rank](https://make.fun/badge/markdown-render-speed-02/tonangarivin-ui/markdown-render-speed-02/rank.svg)](https://make.fun/c/markdown-render-speed-02)
[![Reward](https://make.fun/badge/markdown-render-speed-02/tonangarivin-ui/markdown-render-speed-02/reward.svg)](https://make.fun/c/markdown-render-speed-02)

A dependency-free ES module, `parse.js`, whose `parse(markdown)` returns exactly the HTML that marked 18.1.3
produces with its default options (gfm true, breaks false, pedantic false, async false). Written from the
CommonMark 0.31.2 and GFM 0.29 specifications; marked is used only as the reference for its output.

`main.ts` is the harness entrypoint: it reads `cases.json` from `MAKEFUN_INPUT_DIR` (default `/input`), renders
every case with `parse`, and writes the HTML array to `MAKEFUN_OUTPUT_DIR` (default `/output`).

Run locally on Node 22:

    MAKEFUN_INPUT_DIR=./in MAKEFUN_OUTPUT_DIR=./out node main.ts

Licence: MIT.
