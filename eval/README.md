# WS7 quality evaluation

Requires Node 24 (`source ~/.nvm/nvm.sh && nvm use 24`). No packages added.
Run from the repository root. This is a local, offline report workflow, not a deployment.

## Dataset and consent

JSON shape:
```json
{"version":1,"consent":{"source":"synthetic","notes":"Invented examples"},"items":[{"id":"b1","kind":"breakdown","task":"Wash a mug","level":"few","context":"Optional context"},{"id":"c1","kind":"compile","text":"Wash mugs. Buy soap."},{"id":"e1","kind":"estimate","task":"Wash a mug"}]}
```
Levels are frozen WS1 ids: `few`, `some`, `five`, `many`. IDs must be unique,
safe identifiers (letters, digits, underscore, hyphen; 1–80 characters).
Nonempty inputs are capped at 6000 characters. The validator rejects unknown item
fields, invalid levels/kinds, duplicate IDs and missing consent. Empty datasets fail.
The committed sample is invented: 52 breakdowns across all levels, 12 dumps, 10 estimates.

**Never commit real user text**, even with consent. Put contributed datasets in
`eval/data/` (ignored) with `source: "contributed"`; outputs default to ignored
`eval/out/`. Custom output paths must also remain private and untracked. Outputs
contain model text; treat them as sensitive. Neither CLI prints input or output text.
Only ids, counts, statuses and timings appear in runner logs. Do not put names in ids.

Contributor checklist (record consent outside git):
- Explain task/dump text, context and instructions are sent to the chosen provider
  through the server handler; no tools are provided. Obtain explicit opt-in for
  each provider, including the alternative comparison.
- Strip personal names, addresses, contacts, account details and third-party text.
- Confirm provider retention/training terms and region before sending anything.
  Zero retention is not the default; do not promise it until the owner confirms it.
- Explain local datasets, model responses and ratings are retained only for the
  agreed evaluation period; agree a deletion date and who can access them.
- Explain withdrawal: contact the recruiting owner with the anonymous item ids;
  delete local copies/results/ratings and regenerate reports. Already transmitted
  data is subject to the provider's agreed retention policy; do not promise recall.

Human gates: recruit testers and raters; obtain consent; collect ≥50 real tasks and
≥10 real dumps; provision keys locally; confirm retention; choose one small OpenAI
model via `OPENAI_EVAL_MODEL`. No real provider run is required for harness checks.

## Commands

```sh
node eval/eval.check.ts
node eval/run.ts --dataset eval/datasets/sample.json --model mock --out eval/out
# Until WS2 is merged, use a separate worktree (never copy server files):
git worktree add /tmp/ws2 origin/swarm/ws2-ai-server
node eval/run.ts --dataset eval/datasets/sample.json --model mock --handler /tmp/ws2/server/assist/handler.ts --out eval/out
node eval/autorate.ts --results eval/out/results.json
node eval/report.ts --results eval/out/results.json --ratings eval/out/ratings-auto.csv
```

The default handler is `server/assist/handler.ts` relative to cwd; `--handler` can
point elsewhere. `--limit N` selects the first N items. Only the frozen WS1
request/response contract is supported. The mock shapes answers from the supplied
schema, including step bounds; it accepts the handler's plain-text prompts.
Requests include same-origin headers, JSON, and a local bearer token. Entitlement
and rate limiting are intentionally allow-all eval fakes, never production adapters.

The runner refuses an output directory containing `results.json` or `ratings.csv`
before calling the model, protecting existing results and human ratings. Choose a
new `--out` directory for each run. Only pass the standalone `--force` flag when
you deliberately want to overwrite both files (including any human ratings).

Real runs: set `ANTHROPIC_API_KEY` locally for `--model anthropic`; the WS2 client
beside the selected handler makes the provider call. Model metadata uses an exported
`ANTHROPIC_MODEL_ID`, `ANTHROPIC_MODEL`, `MODEL_ID`, or `MODEL` string when present;
the current WS2 client exports none, so the recorded fallback is the decisions.md
name `claude-haiku-5-5`. Comparison identifies the Anthropic side by provider kind,
not this name. For `--model openai`, set
`OPENAI_API_KEY` and **required** `OPENAI_EVAL_MODEL` (no default). Do not put keys
in commands, tracked files, or logs. Both clients have 10-second timeouts.

Runner writes `results.json` (metadata, ids/kinds/levels, status, error, latency,
normalized output; no source task/dump) and a blank `ratings.csv` for breakdown and
compile. Failed calls remain in results and must be rated not useful. Autorate
writes a separate `ratings-auto.csv`; it cannot judge semantic usefulness.
Autorate also refuses an existing output file (including its default
`ratings-auto.csv`); choose a new `--out file.csv` or pass `--force` deliberately.
Humans use RUBRIC.md and fill the original CSV, including their anonymous rater id.

```sh
node eval/report.ts --results eval/out/haiku/results.json --ratings eval/out/haiku/ratings.csv --compare eval/out/openai/results.json --compare-ratings eval/out/openai/ratings.csv
```

Reports are written beside the first results file (`report.md`, `report.json`).
Use identical source datasets for comparison (matching ids/kinds/levels are checked;
the harness deliberately does not persist source text to prove equivalence).
Tables show each model's helper metrics for side-by-side comparison. Error rate
uses all attempted calls; latency includes failures. Percentages use completed
ratings only; incomplete ratings do not meet sample requirements. Useful is the
overall human judgment, not the conjunction of the other criteria. p90 uses
nearest rank, median averages the middle pair. Estimate has no usefulness ratings.
Decision 4's switch recommendation needs adequate real-data human ratings for both
models; synthetic/mock/auto runs are loudly disqualified. Security, accessibility,
working-state and Cancel checks remain independent launch gates in WS8.
