# Human rating rubric

Open the private source dataset and results locally; match by anonymous id. Rate
each breakdown or compile response in `ratings.csv`. Enter lowercase `y` or `n`
in every criterion, notes explaining failures, and an anonymous `rater` identifier
(never `auto` for a human). Leave unrated rows blank. CSV fields containing commas,
quotes or line breaks must be quoted; double embedded quotes. Do not copy personal
text into notes. A failed request gets `n` for all criteria. Estimate is diagnostic
only and has no rating rows. Calibrate on several examples with a second rater;
resolve disagreements before submitting final rows (one row per id).

| Criterion | Pass example | Fail example |
|---|---|---|
| useful | The checklist actually helps complete the requested task, or clusters preserve the dump's actionable intentions without inventing obligations | Generic repetition, missing key tasks, unrelated steps, or an unusable response |
| literal | “Put the plates in the cupboard” | “Get your ducks in a row”, “Handle the kitchen situation” |
| one_action | “Open the calendar” (verb first, one thing) | “Open the calendar and book the appointment”; “Calendar planning” |
| realistic_minutes | “Wipe the desk”, 3 minutes, plausible for the given context | “Paint the room”, 1 minute; missing minutes; implausible precision or duration |

**Useful is an independent overall pass/fail judgment** and is what the 90% launch
bar counts. Consider fidelity, completeness, manageable granularity at the chosen
level, and burden on the user. Minor wording flaws need not make a response useless.
Rate other criteria across the entire answer: one materially bad step is a failure
for that criterion. Brain dump tasks should each describe one action and have
plausible estimates; clusters should be meaningful, not duplicated or invented.
For breakdown, check the selected level's min/max as well as whether the sequence
is usable. Null minutes cannot pass realistic_minutes without an estimate.

## Automatic pre-checks are not ratings

`autorate.ts` uses a small verb allowlist, rejects “ and ” and semicolon joins,
checks integer minutes 1–480, and checks the WS1 level's step bounds. It marks
every row `rater=auto`. Its “useful” column is only the conjunction of these
mechanical checks, **not semantic usefulness**. It can reject good wording and
accept irrelevant steps. Never relabel auto rows as human ratings without reading
and independently judging every answer. An auto report is never a launch result.
