# All 48 scheduled slots

A dash means not_started, with no invented Q/D. Native means normal exit plus terminal stop; D additionally requires Q and usable handoff.

| Slot | Task | Rep | Arm | State | Q | D | Native | Seconds | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | denque-rotate | 1 | P | stopped | 0 | 0 | True | 342.877 | [patch](patches/01-denque-rotate-r1-P.patch), [evaluation](evaluations/8fb8b5e52a97.json) |
| 2 | denque-rotate | 1 | H00 | stopped | 1 | 1 | True | 383.399 | [patch](patches/02-denque-rotate-r1-H00.patch), [evaluation](evaluations/e01efb782e8c.json) |
| 3 | denque-remove-where | 1 | H00 | stopped | 0 | 0 | True | 289.242 | [patch](patches/03-denque-remove-where-r1-H00.patch), [evaluation](evaluations/b60c3368673e.json) |
| 4 | denque-remove-where | 1 | P | stopped | 0 | 0 | True | 199.915 | [patch](patches/04-denque-remove-where-r1-P.patch), [evaluation](evaluations/8113f808eacc.json) |
| 5 | eventemitter-prepend | 1 | P | stopped | 1 | 1 | True | 393.714 | [patch](patches/05-eventemitter-prepend-r1-P.patch), [evaluation](evaluations/2c3146b61f69.json) |
| 6 | eventemitter-prepend | 1 | H00 | stopped | 0 | 0 | True | 219.922 | [patch](patches/06-eventemitter-prepend-r1-H00.patch), [evaluation](evaluations/65f9ded470ca.json) |
| 7 | eventemitter-remove-context | 1 | H00 | stopped | 0 | 0 | True | 337.247 | [patch](patches/07-eventemitter-remove-context-r1-H00.patch), [evaluation](evaluations/53a657cf6ab8.json) |
| 8 | eventemitter-remove-context | 1 | P | stopped | 0 | 0 | True | 278.369 | [patch](patches/08-eventemitter-remove-context-r1-P.patch), [evaluation](evaluations/6960a8f1de8a.json) |
| 9 | fastq-running-tasks | 1 | P | stopped | 0 | 0 | False | 900.23 | [patch](patches/09-fastq-running-tasks-r1-P.patch), [evaluation](evaluations/3375af3c39c5.json) |
| 10 | fastq-running-tasks | 1 | H00 | stopped | 1 | 1 | True | 682.056 | [patch](patches/10-fastq-running-tasks-r1-H00.patch), [evaluation](evaluations/cf57afd4f2c6.json) |
| 11 | fastq-on-idle | 1 | H00 | stopped | 0 | 0 | True | 454.585 | [patch](patches/11-fastq-on-idle-r1-H00.patch), [evaluation](evaluations/4b726527599f.json) |
| 12 | fastq-on-idle | 1 | P | stopped | 0 | 0 | True | 461.114 | [patch](patches/12-fastq-on-idle-r1-P.patch), [evaluation](evaluations/26ece8019a92.json) |
| 13 | quick-lru-computed | 1 | P | stopped | 1 | 1 | True | 178.494 | [patch](patches/13-quick-lru-computed-r1-P.patch), [evaluation](evaluations/0d6ee00e6ab4.json) |
| 14 | quick-lru-computed | 1 | H00 | stopped | 1 | 1 | True | 312.546 | [patch](patches/14-quick-lru-computed-r1-H00.patch), [evaluation](evaluations/f4d825ced509.json) |
| 15 | quick-lru-prune | 1 | H00 | stopped | 1 | 1 | True | 219.603 | [patch](patches/15-quick-lru-prune-r1-H00.patch), [evaluation](evaluations/3ef12ae73600.json) |
| 16 | quick-lru-prune | 1 | P | stopped | 0 | 0 | True | 259.978 | [patch](patches/16-quick-lru-prune-r1-P.patch), [evaluation](evaluations/80e5601c914d.json) |
| 17 | ufo-query-sort | 1 | P | stopped | 1 | 1 | True | 295.276 | [patch](patches/17-ufo-query-sort-r1-P.patch), [evaluation](evaluations/7379be605902.json) |
| 18 | ufo-query-sort | 1 | H00 | stopped | 0 | 0 | False | 48.947 | [patch](patches/18-ufo-query-sort-r1-H00.patch), [evaluation](evaluations/9e4f9df7cdda.json) |
| 19 | ufo-append-query | 1 | H00 | not_started | — | — | — | — | — |
| 20 | ufo-append-query | 1 | P | not_started | — | — | — | — | — |
| 21 | ms-format-unit | 1 | P | not_started | — | — | — | — | — |
| 22 | ms-format-unit | 1 | H00 | not_started | — | — | — | — | — |
| 23 | ms-parse-compound | 1 | H00 | not_started | — | — | — | — | — |
| 24 | ms-parse-compound | 1 | P | not_started | — | — | — | — | — |
| 25 | denque-rotate | 2 | H00 | not_started | — | — | — | — | — |
| 26 | denque-rotate | 2 | P | not_started | — | — | — | — | — |
| 27 | denque-remove-where | 2 | P | not_started | — | — | — | — | — |
| 28 | denque-remove-where | 2 | H00 | not_started | — | — | — | — | — |
| 29 | eventemitter-prepend | 2 | H00 | not_started | — | — | — | — | — |
| 30 | eventemitter-prepend | 2 | P | not_started | — | — | — | — | — |
| 31 | eventemitter-remove-context | 2 | P | not_started | — | — | — | — | — |
| 32 | eventemitter-remove-context | 2 | H00 | not_started | — | — | — | — | — |
| 33 | fastq-running-tasks | 2 | H00 | not_started | — | — | — | — | — |
| 34 | fastq-running-tasks | 2 | P | not_started | — | — | — | — | — |
| 35 | fastq-on-idle | 2 | P | not_started | — | — | — | — | — |
| 36 | fastq-on-idle | 2 | H00 | not_started | — | — | — | — | — |
| 37 | quick-lru-computed | 2 | H00 | not_started | — | — | — | — | — |
| 38 | quick-lru-computed | 2 | P | not_started | — | — | — | — | — |
| 39 | quick-lru-prune | 2 | P | not_started | — | — | — | — | — |
| 40 | quick-lru-prune | 2 | H00 | not_started | — | — | — | — | — |
| 41 | ufo-query-sort | 2 | H00 | not_started | — | — | — | — | — |
| 42 | ufo-query-sort | 2 | P | not_started | — | — | — | — | — |
| 43 | ufo-append-query | 2 | P | not_started | — | — | — | — | — |
| 44 | ufo-append-query | 2 | H00 | not_started | — | — | — | — | — |
| 45 | ms-format-unit | 2 | H00 | not_started | — | — | — | — | — |
| 46 | ms-format-unit | 2 | P | not_started | — | — | — | — | — |
| 47 | ms-parse-compound | 2 | P | not_started | — | — | — | — | — |
| 48 | ms-parse-compound | 2 | H00 | not_started | — | — | — | — | — |
