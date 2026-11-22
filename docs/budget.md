# Budget

Paid generation is disabled by default because `budget.monthlyUsd` is zero. Set a monthly cap before using a paid provider:

```sh
bstudio budget set 10
bstudio budget set-project 2
bstudio budget show
```

`set` changes the monthly USD cap; `set-project` changes the lifetime cap for each project. A project cap of zero means no additional project limit, while a monthly cap of zero disables paid calls. Both caps are stored in `studio.yml`. The dashboard can also change them.

Before a paid call, Studio reserves an upper-bound estimate under a ledger lock and rejects a reservation that would exceed either applicable cap. `providers/prices.yml` contains the model estimates; check provider pricing before use. Settlement records the actual amount when available. The append-only `ledger.jsonl` in the studio root keeps reservations, settlements, and agent runs. An unsettled reservation counts at its reserved amount; a settlement with unknown cost and agent runs with unknown cost count as zero. Therefore the displayed total is not a complete provider invoice or a limit on separately billed agent usage.

Monthly totals use UTC and the reservation date; project totals cover all dates. `bstudio budget` or `bstudio budget show` displays the caps, month-to-date total and provider totals. See [configuration](configuration.md) for provider selection and credentials.
