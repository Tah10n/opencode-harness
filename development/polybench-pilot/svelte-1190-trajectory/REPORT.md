# Svelte 1190 / H1: проверка сохранения поведения не успела дать обратную связь

**Наиболее обоснованная причина незавершённого исправления — поздняя проверка
сохранения существующего runtime-поведения.** После внесения регрессии автор
получал результаты узких проверок нового scoping-поведения, CSS, SSR, JS и
sourcemaps, обновлял fixtures, но эти команды не исполняли нужный DOM-сценарий.
Полный `npm test` начат за **54.923 секунды** до общего deadline. Он успел
пересобрать compiler и начать suite; сохранённый live output заканчивается в
`custom-elements`, перед runtime. Общий deadline прервал ещё работающий tool.
Завершённого результата этого tool и следующего запроса модели нет.

Это цепочка «проверка нужного поведения отложена → feedback отсутствует до
остановки», а не установленная потеря уже полученного failure или отказ
исправлять известную автору регрессию. Нельзя доказать, что более ранняя проверка
гарантировала бы правильную законченную многофайловую поставку. Ниже предложена
одна проверяемая гипотеза изменения порядка работы; реализации нет.

## Объект и происхождение

Разбор относится только к slot 16, `sveltejs__svelte-1190 / H1`:

- parent: `ses_f507a545dffenRPbsUH40ovcLn`;
- author: `ses_f507a1021ffetowBTWnB1NuRzt`;
- task artifact: `900b7402-f2bb-413c-b78f-531cbd7efe22`;
- author cwd: `/work/repo/.git/harness-task/900b7402-f2bb-413c-b78f-531cbd7efe22/worktree`;
- upstream B: `0c3e44ac05c651c12c94e047bf712cb86278d345`;
- prepared author commit: `47a9c5cd79f23b6bbf25ba566194735a195ae8a7`;
- starting report commit: `2ac25116ec2d16d4c73eb0c3c6749a2ab588149b`;
- model-output commit: `9317ccc9e2e3af6cfe7e876acd4541f3e7445f3b`;
- measured runtime: `e18db1fe10223db52dcc05b3e769bca140367c2b`.

`origin` проверен: `https://github.com/Tah10n/opencode-harness.git`, remote head
на момент начала совпал с `2ac25116`. Работа выполняется в существующем worktree
`feat/native-task-workflow`; checkout корневой ветки и чужие материалы сохранены.
PR #25 остаётся draft с base `feat/native-template-regression-workflow`.

Основные private originals: `local/polybench-pilot/batch/runs/sveltejs__svelte-1190-H1/`:
`started.json`, `provider-metadata.json`, `request-1.json` … `request-67.json`,
`response-67.sse`, `native-evidence.json`, `session/finished.json`,
`stop-verification.json`, `session/cleanup.json`, `model.patch`,
`task-artifacts/900b7402-f2bb-413c-b78f-531cbd7efe22/{initial.json,tool-events.json,original-tests/}`.
Их пути установлены по сохранённой структуре capture и identity receipts.
`session/events.jsonl` содержит только начальный parent step; это не полный
trace автора. Для его tools используются task events и native database export.
Git snapshot IDs из native step не заменяются hashes harness snapshot.

[Компактная машинная выборка](EVIDENCE.json) содержит точные команды, call IDs,
времена, hashes originals, ссылки на snapshots и первые request с результатами.
[Read-only extractor](extract.py) читает originals, ничего в них не меняет и не
исполняет команды из traces. Полные private inputs, outputs и reasoning не
публикуются. Исторические evaluator-результаты используются только как позднее
подтверждение дефекта, а не как сведения, доступные автору.

## Известный дефект и доступность публичного теста

Первый production patch добавляет `if (attr === classAttribute) return;` без
условия scoping; заменяющая запись `class` находится под `_needsCssAttribute`,
позже переименованным в `_needsCssClass`. Поэтому оптимизированный вывод
нескопированного первого button теряет `class="allow-propagation"`. В публичном
runtime callback `querySelector` возвращает null и `dispatchEvent` падает.
Две следующие ошибки `already failed` — short-circuit того же sample, не ещё
два независимых дефекта. Это согласуется с ранее сохранённым
[two-world failure analysis](../two-world-diagnostic/evidence/failure-analysis.json).

| Неизменённый публичный файл | SHA-256 в baseline и поставке |
|---|---|
| `test/runtime/samples/event-handler-event-methods/main.html` | `a7358b74f686fe61465a865ec2084749e134cc98a9eb2cee060b7bde2f9bf707` |
| `test/runtime/samples/event-handler-event-methods/_config.js` | `904e502ba99d31eccbbb99a1360381433b1f4720608a5e6fb22da4156c702f64` |

Те же bytes есть в pinned `base.tar`, подготовленном source и сохранённых
`original-tests` автора. SHA-256 архива совпадает с frozen manifest:
`45634ea516ebfb4ebeaf1fc5e963342d6c3b19aa6ba4181ab5436fb2b718b2f8`.
Полный H1 patch не меняет эти файлы; его bytes совпадают на обоих указанных
commits и с private `model.patch`. Так подтверждается их наличие до задачи,
без обращения к hidden `test_patch`/gold. Применения hidden tests сейчас нет.

## Часы и минимальная хронология

Относительное t отсчитывается от начала **общего execution budget**, примерно
13:19:26.764 UTC 17 сентября 2026. Deadline — примерно **13:49:26.764 UTC**,
t=1800 s. Это не `started.json`: slot/setup запись сделана в 13:19:19.850 UTC.

Deadline не выдуман из округлённого «30 минут»: у всех 67 provider receipts
пересечены интервалы `[at + maxDurationMs, forwardedAt + maxDurationMs]`.
По pinned scheduler длительность вычисляется между этими двумя записями;
пересечение даёт `1789652966764` ms. Начало budget выведено вычитанием frozen
1800 s. Native/tool времена — сохранённые wall timestamps той же машины;
таблица округлена до 0.1 s, это не точность момента записи инструкции в файл.

Номера e — zero-based индекс в `tool-events.json`, r — `request-N.json`.
Полные call IDs и snapshot hashes для каждого e находятся в EVIDENCE.

| t, секунды | Событие / привязка | Видимый результат и дальнейшее действие | Остаток |
|---:|---|---|---:|
| 0 | Общий budget; parent message создан t≈2.0; author session появляется позже parent | Начало ограниченной попытки, не новый независимый бюджет child | 1800 s |
| 18.9 | Первый child message `msg_0af85eff2001yQk35CH5NCemrO`, 13:19:45.650 UTC | Начало author session; общий deadline не сброшен | 1781.1 s |
| до 697.5 | Полный read Element e14; baseline snapshot `c7eb45a371af…`; до production edits только новый двухфайловый sample e78 | Старый serializer сохраняет обычный class; e79 доказывает fail нового scoping sample на baseline | — |
| 697.5–699.5 | e87, `call_roeHeQjDr2CfSEbO1ulmA7QD`, receipt в r24 | **Первое подтверждённое внесение безусловного skip**; before `42d06603b5…`, after `8929ba337c…` | 1100.5 s после |
| 728.9–730.9 | e88, `call_mTq3cPqzeNqrqqWt157WSikT`, r25 | Меняет получение classValue и hydration helper; skip сохраняется | 1069.1 s |
| 756.3–758.3 | e90, `call_4jPUyN7mKubAnwtQJvJOA0ZB`, r27 | Правка отступа; skip сохраняется | 1041.7 s |
| 764.2–783.1 | e91, filtered `npm test`, r28 | Fresh build, новый sample 4 passing; **старый event callback не выбран** | 1016.9 s |
| 793.5–811.9 | e92, `--grep '^css$'`, r29 | 0 passing, exit 0; это пустая выборка, далее автор меняет фильтр | 988.1 s |
| 824.9–834.5 | e93, `--grep 'css '`, r30 | 8 passing / 44 failing: CSS expectations старого формата | 965.5 s |
| 985.3–1122.5 | e105–111: CSS fixtures, chomp CSS/HTML, повторные CSS checks | 44 → 28 → 0 failures; r39 содержит 52 passing; production serializer не меняется | 677.5 s |
| 1168.0–1318.6 | e117, e122, e132, e133 | JS/SSR snapshot работа; e133 переименовывает `_needsCssAttribute` в `_needsCssClass`, не убирая skip; receipt r46 | 481.4 s после e133 |
| 1358.9–1438.0 | e137–144 | JS helper snapshot correction → 2 JS passing; 2 sourcemaps passing; ещё старый build до последующей пересборки | 362.0 s |
| 1502.1–1506.3 | e153, `call_fJ3cXCBNJgdgpTiuePojKl7B` | Автор читает production diff, содержащий skip; отдельного замечания о потере class не делает | 293.7 s |
| 1587.6–1606.9 | e155, fresh `npm test -- --grep 'css-scoping-class'`, r60 | 4 passing на последнем production-коде | 193.1 s |
| 1616.3–1677.2 | e156–159, CSS и SSR; исправляет trailing newline SSR fixture | CSS 52 passing; SSR 338/2 → 340 passing, 10 pending; runtime callback не выбран | 122.8 s |
| 1694.1–1732.1 | e160–162, r65–67 | JS 33 passing; sourcemaps 8 passing; lint exit 0, два ignored-file warnings | 67.9 s |
| 1732.7–1743.2 | r67 / response 67; provider completed 13:48:29.957 UTC | Автор сообщает о зелёных focused checks и намерении выполнить полный test, затем status/diff | 56.8 s после provider |
| 1745.1 | `call_rfPz0xTerbbjnghLTUbg4GM5` native start | `. /usr/local/nvm/nvm.sh && nvm use 16.20.2 && npm test`, timeout 120000 ms | **54.9 s** |
| без line timestamp | Native metadata последнего running tool | Build завершён; `create`, `css`, затем `custom-elements`: escaped-css, html, html-slots. Нет runtime section, target failure, totals или exit | неизвестен |
| 1800.008 | `session/finished.json`, 13:49:26.772 UTC | Общий `hard_deadline`, outer process SIGKILL, exitCode null; затем stopWorkload | ≈0 |
| после остановки | `stop-verification.json`, `session/cleanup.json`; completed slot 13:49:28.002 UTC | Capture сохранён, termination проверен, forwarding закрыт, relay удалён; native tool остаётся записан как running | — |

Момент появления дефекта дан интервалом исполнения e87, а не временем первого
плохого snapshot. Для Element выполнена механическая реконструкция **только
этого файла**, в памяти: exact baseline → четыре последовательных сохранённых
apply_patch. Старый полный read совпал с baseline; итоговый blob
`02db26fe820dbc9f3e72559527e69947b1ef195f` совпал с full-index исторического
patch и prefix в позднем авторском diff e153. Финальный SHA-256:
`740ad977c1dba8e4e9f4fd3e34c867241a32d7a14b6b2da3608a4ff0d274e7dd`.
Ни rollback, ни повторного внесения skip между этими состояниями не обнаружено.

Bash-команды инвентаризированы: записи вне apply_patch — `perl ... chomp` в
CSS/HTML/SSR expectations, generated sourcemaps и обычные build outputs.
Они не пишут Element. Полное промежуточное дерево не реконструируется:
snapshot IDs сохранены как ссылки, а не объявлены независимо пересчитанными
hashes. Возможность гипотетической несохранённой внешней записи не превращается
в вымышленный промежуточный код.

## Что действительно проверялось

Все завершённые H1 test-команды после e87 используют один из фильтров:
`css-scoping-class`, `^css$`, `css `, `js (collapses|css-media-query)`,
`sourcemaps (css|css-cascade-false)`, `ssr `, `^js `, `^sourcemaps `.
Каждый исключает полное имя `runtime event-handler-event-methods (...)`.

**SSR-ловушка:** в e157/e159 действительно есть зелёная строка
`event-handler-event-methods`. Но `test/server-side-rendering/index.js`
перебирает runtime samples для SSR render, не вызывает `config.test`.
Нужный `querySelector`/`dispatchEvent` вызывается только runtime runner.
Таким образом, ни имя sample в stdout, ни 340 SSR passes не подтверждают
исполнение его событийного DOM-сценария.

Штатные scripts на тот момент сохранены и не менялись:

```text
pretest: npm run build
build: node src/shared/_build.js && rollup -c && rollup -c rollup.store.config.js
test: mocha --opts mocha.opts
lint: eslint src test/*.js
```

`mocha.opts` ведёт к `test/test.js`, который регистрирует `*/index.js` из test.
Runtime runner обнаруживает samples через существующий каталог и создаёт
shared/hydration/inline варианты. В `test/helpers.js` `loadSvelte()` явно
разрешает `../compiler/svelte.js`, сбрасывает require cache; `loadSvelte(true)`
выставляет TEST, а не переключает import на TypeScript source. Rollup строит
этот compiler из `src/index.ts` с `src/**` TypeScript inputs.

Cwd всех H1 проверок — указанный nested author worktree, не `/testbed` оценщика.
Каждая команда начинает с `. /usr/local/nvm/nvm.sh && nvm use 16.20.2`;
stdout подтверждает Node 16.20.2 / npm 8.19.4. Launcher также задаёт
`BASH_ENV=/work/config/project-shell.sh`, project PATH и `GIT_LFS_SKIP_SMUDGE=1`.
Полного environment dump нет; новых предположений о скрытых фильтрах не делаем.
`TEST` выставляет сам test setup; зафиксированные команды не содержат pipeline,
`|| true`, маскирующего exit перенаправления или другого завершающего процесса.

`npm test` e91/e92/e155 и последний незавершённый вызов выполняют pretest.
Их logs подтверждают `created compiler/svelte.js`, SSR register, shared и store.
Прямые mocha после e133 до e155 используют ранее построенный compiler —
переименование исходников произошло без немедленной пересборки. Это реальная
локальная stale-build граница, но **не причина сокрытия рассматриваемой ошибки**:
безусловный skip был уже в старом build e91/e92 и сохранялся после fresh e155.
Прямые финальные CSS/SSR/JS/sourcemaps идут после e155 без новых production edits.

Ignored compiler/build files не вошли в capture: исторических hashes outputs
нет. Freshness поддерживают последовательность edits, неизменённые build/import
recipes, до/после snapshot IDs и build logs, но это не полная независимая
аттестация build bytes. Текущей сборки для подмены этого пробела не выполнялось.
Параллельной записи в production во время этих checks в сохранённых событиях
нет; e144 меняет generated sourcemap files и потому имеет другой after snapshot.

Последний полный test выбран правильно по охвату, но не завершён. Его tool
120 s timeout больше оставшихся 54.9 s общего budget. Нельзя присвоить этому
вызову exit 0/1 или обычный tool timeout: первичное событие — global deadline,
следом прекращение процессов. Сохранённый конец stdout поддерживает остановку
на предшествующей suite, но не доказывает точное последнее исполнявшееся тело
теста: per-line timestamps и flush/terminal stdout отсутствуют.

## Четыре уровня обратной связи

1. **Процесс.** Завершённые команды дали перечисленные scoped counts. У полного
   test есть только partial output, build completion и первые suites;
   подробного runtime null failure или финальных totals в capture нет.
2. **Native/files.** `tool-events.json` содержит 163 события автора
   с terminal record: 158 completed и 5 read errors;
   pending full test присутствует только в `native-evidence.json`. Его live
   metadata output — 4593 символа; отдельного complete command-output файла нет.
3. **Фактические requests.** Для каждого завершённого test output extractor
   проверяет byte-equivalent Unicode text в первом последующем raw request по
   call ID. Все 67 requests сохранены. r67 заканчивается receipt lint e162;
   результата `call_rfPz0xTerbbjnghLTUbg4GM5` нет ни в одном request. r68 нет.
4. **Наблюдаемый автор.** В response 67 автор перечисляет scoped passes и пишет,
   что запускает complete project test для cross-suite regressions, затем
   планирует status/diff. Это ongoing work, не заявление о готовой поставке.
   После pending test нет сообщения, исследования null или repair.

Один относящийся к проверкам truncated output — e108 / r36, CSS 24 passing /
28 failing. Переданная строка начинается `...output truncated...`, указывает
`/work/data/opencode/tool-output/tool_0af9594320018xM4FhnMMQuZ7I` и сохраняет
последний фрагмент, начинающийся внутри generated-code текста с
`if (!document.getElementById(...)) add_css();`; конец содержит CSS assertion
`unused-selector-ternary`. Размер переданной строки 51265 символов вместе с
указателем; native metadata хранит ещё более короткий live tail (30005).
Сохранённого полного файла нет, поэтому точный абсолютный offset отброшенного
префикса неизвестен. Последующего read/grep указанного файла среди tools нет.
В переданном фрагменте нет null/dispatchEvent failure; фильтр этой команды
вообще не выбирал нужный runtime sample. Само `truncated=true` не объясняет
пропуск регрессии. Отдельного compaction-summary, требующего восстановления
его потерянного содержания, для этой цепочки не установлено; вывод о доставке
основан непосредственно на сохранённых requests.

Единственная baseline-классификация автора (видна в r20) относится к
`custom-elements escaped-css`, timeout 10000 ms: baseline e77 дал 78 passing /
1 failing с фильтром `css|omit-scoping-attribute-class-dynamic`. Runtime event
callback на этом baseline не исполнялся. Не найдено сообщения, списывающего
новый null на baseline. **11 failures / 53 pending поздней gold-калибровки не
приписываются знаниям автора.** Публичный read diff — доступность кода, не
доставка ещё не сформированного test failure и не доказательство понимания.

## Конкурирующие объяснения

| Гипотеза | Статус | Основание |
|---|---|---|
| А. Нужная проверка не выбрана или выполнение не дошло | **Подтверждена в границах наблюдений** | Завершённые фильтры исключают DOM callback; full test выбран поздно, его retained prefix не доходит до runtime, результата нет |
| Б. После новой правки использован старый результат | **Противоречит данным как основная причина этой регрессии** | Есть fresh e155 с тем же дефектом; зелёный результат относится к другому sample. Stale JS interval отдельно признан |
| В. Проверка не исполняла фактическую изменённую реализацию | **Подтверждена для фильтра/незавершённости; stale build не главный механизм** | Final build logs есть, нужный callback не наблюдается; output hashes build не сохранены |
| Г. Failure возник, но содержательная часть потеряна до автора | **Недостаточно сведений о несохранённом хвосте процесса; положительных свидетельств нет** | В captured stdout failure отсутствует; последний tool не вернулся, следующего request нет |
| Д. Полученный failure неверно объяснён/списан/игнорирован | **Противоречит сохранённой цепочке** | Ни test failure в raw requests, ни такого сообщения автора нет |
| Е. Автор уже исследовал/исправлял проблему, deadline прервал | **Противоречит данным в части repair этой регрессии; прерывание общей проверки подтверждено** | Автор запускал широкую проверку, но не показал распознавание потери class или исправление |
| Ж. Данных недостаточно для выбора причины | **Противоречит данным для звена delayed feedback; недостаточно для контрфактической успешности** | Порядок checks и отсутствие receipt установлены; успех при другом порядке не измерен |

Сильнейший конкурент узкому утверждению «процесс не дошёл до runtime»:
он мог продвинуться дальше последнего сохранённого live tail, и failure мог
появиться в несброшенном выводе перед SIGKILL. Исключить это позволил бы
последний flushed stdout с sequence/timestamps и записью текущего test при
stop. Такого артефакта нет. Но даже этот вариант не показывает, что failure
получил автор: tool остался running, provider 67 уже completed, request 68 нет.

Snapshot работа действительно занимает заметное время (CSS e105–111 примерно
137 s; от JS check e117 до sourcemaps e144 примерно 270 s), и каждый interval
имеет конкретные edits/checks. Она требовалась для изменившегося compiler
output; здесь она не объявляется бесполезной. Более ранняя проверка исходного
runtime поведения — гипотеза о порядке обратной связи, не вывод об общей
неэффективности snapshots и не повод увеличить deadline.

## Ограниченное сравнение P/H0

P с первого serializer edit `call_m1nV2ClK2PlHNHjgVFmF80fR` сохраняет обычный
вывод class через else; последующие Element edits меняют пустой class,
refs/custom-element guard, не устраняют H1-style unconditional skip, которого
там не было. Его ближайшие CSS проверки и полученные requests сохранены в
EVIDENCE. Полный `npm test` `call_xmK2NbwBJAHpWhp47V2JZWWG` завершился exit 15
(1662 passing / 53 pending / 15 failing), результат пришёл в r53. Из-за
truncation в сохранённом output остаётся plain SSR-строка event sample;
её не выдаём за доказательство исполнения всех runtime-вариантов P.

H0 с первого edit `call_feHaPQH8E9508BuOi9a8h8gt` убирает старую отдельную
запись scoping attribute, но оставляет общий цикл serializer. Class добавляется
в attributes с условием `_needsCssClass`; далее меняются место вызова и
защита от повторного добавления. Ближайшие проверки выявляли другие scoping/JS
issues, receipts приведены в EVIDENCE. Сохранённые Element edits и полный
patch не показывают возникновения H1-style пропуска обычного class.
Отдельного завершённого полного `npm test` H0 в этой выборке нет.

Таким образом, это различие исходной реализации, а не свидетельство, что
P/H0 обнаружили и затем исправили тот же дефект. Их полные поставки тоже
не прошли независимую acceptance_diag; они не эталон и не причинный эксперимент.
Неизвестный серверный исход последнего H0 запроса остаётся только H0 фактом.
H1: 67 requests, все с terminal completion и usage; собственный deadline и
последующее verified cleanup. TYPE_COMPAT в H1 unsupported, analyses=0;
ему нельзя приписать ни внесение, ни обнаружение, ни пропуск этой ошибки.

## Ровно одно предлагаемое изменение: ранняя проверка прежнего поведения

**Гипотеза:** один существующий авторский check сохранения поведения стоит
выбрать сразу после первого зелёного focused feature-check, до серии обновлений
snapshots. Это перестановка обратной связи в той же сессии, без нового reviewer,
finisher, обязательной полной suite или увеличения deadline.

- **Наблюдаемый триггер:** есть production edit и завершённый ненулевой зелёный
  filtered check, который исполнил только новый/изменённый feature sample;
  сохранённого исполнения прежнего поведения затронутого пути после этой
  правки ещё нет. Непонятный command/test inventory даёт unknown, не trigger
  на основании одного exit 0.
- **Доступные host сведения:** diff относительно начального дерева, предыдущие
  commands/cwd, именованные результаты tests, изменения test-файлов и остаток
  текущего budget. Никаких hidden tests, gold, evaluator hindsight или
  project-specific строк. Выбор релевантного поведения остаётся автору.
- **Действие:** один краткий factual nudge в существующем tool receipt: до
  следующей серии snapshot edits выбрать и выполнить один существующий
  публичный behavioral check, сохраняющий прежний сценарий затронутого пути,
  на актуальной реализации; назвать реальный scope. Это не автоматическая
  команда от host и не право менять assertions ради pass.
- **Стоимость и граница:** не более одного nudge за задачу и одного выбранного
  bounded check, до 120 s включая необходимую штатную подготовку, внутри
  прежнего общего budget. Он заменяет следующий повторный focused check,
  а не добавляет бесконечный gate. Недостаточный остаток/неизвестная команда —
  явный unverified, без продолжения модели после deadline.
- **Положительный локальный контроль будущей реализации:** сохранённые e87 →
  e91 bytes распознаются как новый тест без исходного runtime coverage;
  trigger выдаётся до e105. В расходной копии существующий публичный runner
  на точном H1 состоянии обнаруживает regression, а на baseline этот же
  публичный сценарий проходит. Только model-free, без ручного repair.
- **Отрицательные локальные контроли:** нулевой `^css$` результат не считается
  feature-pass; уже завершённый current check исходного поведения подавляет
  повторный nudge; исходный failing baseline sample не классифицируется как
  новая регрессия без совпадения имени/причины и сравнимого состояния.
- **Опровержение полезности:** trigger приходит только после начала широкого
  check/слишком поздно, выбранный прежний test не покрывает потерянное поведение,
  или перестановка при том же budget не даёт более раннего receipt с полезным
  failure. Даже успешные локальные контроли подтверждают лишь механизм;
  отсутствие улучшения правильной завершённой многофайловой поставки в будущем
  отдельно согласованном измерении опровергнет продуктовую пользу гипотезы.

Это предложение, не реализованное изменение. Никакая новая модельная серия
не назначена и её эффективность здесь не утверждается.

## Проверки текущего этапа и предел результата

Extractor сверяет instance/arm/session, pinned archive и bytes sample,
последовательные exact edits и финальный Git blob, непрерывность цепочки всех
163 terminal snapshot links и порядок completion, tool exit,
первые actual requests с outputs, budget и terminal/cleanup records.
Два первых запуска разработки extractor выявили одну ошибку самого парсера:
он терял последний newline сегмента edit; финальный blob check отвергал
реконструкцию. Позднее добавленная проверка статусов также отвергла ошибочное
предположение «все 163 events completed»: пять — read errors, они сохранены
отдельно от 158 completed. Сравнение двух пустых файлов после этого отказа
не считается верификацией. Ошибки extractor исправлены, затем проверка всех
четырёх edits и конечного blob прошла. Неудачные локальные extraction outputs
не считаются подтверждённой реконструкцией.

Выполнена одна итоговая предметная сверка: author и evaluator не смешаны;
SSR sample не назван DOM callback; старый build не выдан за fresh; timeout не
объявлен добровольной поставкой; отсутствие output не превращено в pass;
порядок событий не выдан за доказанный будущий эффект. Проверены Python syntax,
детерминированное повторное извлечение, значимые hashes и whitespace только
новых материалов. Это локальный evidence review, не полный CI/platform pass.

Новые project-test executions, сборки, контейнеры, image pulls, Luna/OpenCode
runs, provider calls, probes, scripted authors, платные reviewers — **0**.
Работа разрабатывающего агента и чтение/извлечение оплачиваются/учитываются
отдельно от исторических 9,416,326 input и 27,582 output Luna tokens H1;
их новая денежная стоимость здесь не измерялась.

Исторические T=false, R/D, acceptance_diag, patches, predictions, official
outputs, freeze/pause и 12 not_started сохранены. Runtime, permissions,
transport, exporter/evaluator, driver и default не менялись. Публикация этого
анализа не исправляет историческую поставку и не доказывает преимущество harness.

Для воспроизведения из корня данного worktree (нужны private originals):

```sh
python3 development/polybench-pilot/svelte-1190-trajectory/extract.py > /tmp/svelte-1190-evidence.json
cmp development/polybench-pilot/svelte-1190-trajectory/EVIDENCE.json /tmp/svelte-1190-evidence.json
```
