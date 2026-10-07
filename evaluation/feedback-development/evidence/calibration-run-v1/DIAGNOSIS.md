# Почему D пропустил outbox-дефект

**Решение: обоснованной новой, материально отличающейся гипотезы пока нет.
Текущий D остаётся экспериментальным механизмом без показанного выигрыша.**
Дополнительная проверка ниже — post-hoc диагностика известного дефекта.
Она не является независимым подтверждением качества и не меняет задачи,
acceptance, участнические patches, D0/final или официальные результаты.
Новых inference-запросов, reviewer/author сессий и кандидатов не было.

## Публичный контракт и воспроизведение

Источник ожидания — [публичный TASK.md, строки 18–19](../../calibration/tasks/c02-durable-outbox/source/TASK.md#L18),
зафиксированный до inference коммитом
`2b45773455f48fcd886c4ef7407f84e9649721ad`:
«counts.pending includes inflight work; counts.sent includes only acknowledged
records». README только отсылает к TASK.md. Это не требование скрытого evaluator.

Исходный `src/status.mjs:counts()` считает только `status==='pending'`.
P/direct заменяют фильтр на pending **или** inflight. D меняет `Outbox.drain()`
в `src/queue.mjs`: перед `send()` сохраняет inflight, но **не меняет status.mjs**.
Когда store содержит `[inflight,pending]`, helper возвращает pending=1 вместо 2;
после enqueue третьей записи — 2 вместо 3. Это ошибка сохранённого состояния,
видимая обычному публичному caller, а не только внутренний статус harness.

В D `test/public.test.mjs`, тест
`drain joins, dispatches sequentially, and leaves new records for later`,
проверяет внутри первого send реальный store (inflight, attempts=1), но затем
ожидает `{pending:1,sent:0}` при двух записях. Неверное ожидание согласуется
с неизменённым helper, поэтому авторский suite проходит.

[reproduce-outbox.mjs](reproduce-outbox.mjs) использует неизменённый retained
public input и полные model patches всех трёх попыток. Он сверяет 11 input
файлов с Git blobs frozen commit, создаёт обычные одноразовые Git copies,
применяет patches целиком, выполняет авторские suites и отдельную проверку
двух/трёх записей через настоящий `drain`, deferred send, `counts` и store.
В неё не импортируются acceptance/gold/wrong либо результаты evaluator.

```sh
node evaluation/feedback-development/evidence/calibration-run-v1/reproduce-outbox.mjs \
  /absolute/path/to/retained/calibration/batch
```

По умолчанию используется существующий local calibration batch. Сохранённые
provider-записи не нужны этому скрипту и не публикуются. Его stdout содержит
только несекретную диагностику; scratch paths нормализованы. Нужен Node 24,
Git и npm; зависимости мини-проекта отсутствуют. OpenCode, credentials,
Docker и восстановление архивов среды не требуются.

| Сохранённый final patch | Авторский suite | Дополнительный public-contract probe |
| --- | --- | --- |
| P / Plain | PASS, 6 tests | PASS, 2 tests |
| H0 / direct | PASS, 7 tests | PASS, 2 tests |
| H1 / D | PASS, 8 tests; отдельно неверный авторский тест PASS, 1 test | FAIL, оба tests: actual 1/expected 2 и actual 2/expected 3 |

[outbox-diagnosis.json](outbox-diagnosis.json) сохраняет реальные exit codes,
выводы, patch/event hashes и факт удаления disposable copies. D0, native final
и экспортированный model.patch outbox побайтно совпадают у H0 и H1.
H1 patch SHA-256:
`e3be2c664a6f954dfeaa8d5ab6e8f3caab0b84fea8de07e9bd32ccdeb2e0ac71`.
После диагностики все прочитанные сохранённые input/patch/result/event bytes
проверены повторно; они не изменились. Официальный `fd10.overlap-order-and-close`
FAIL и P/direct PASS остались исходными историческими фактами.

## Где отсутствовал сигнал

Сохранённый путь: `batch/runs/c02-durable-outbox-H1/task-artifacts/` содержит
`tool-events.json`, `D0.json`, `D0-observations.json`, `final-observations.json`
и workflow `result.json`. В runtime это следующие функции:

1. `lib/native-task-plugin.mjs` сохраняет native tool completion в `run.log`
   и `tool-events.json`; `observe: snapshot => observe(run.log, snapshot)`
   передаёт события только после завершения pending tools.
2. `lib/native-task-observations.mjs:prepareObservations()` захватывает original
   tests/package configuration; возвращённая функция связывает exit/TAP,
   command route, before/after snapshots, fresh checks и actual test diffs.
   Она не выводит семантически правильное expected value из естественного языка.
3. `lib/native-task-workflow.mjs:runWorkflow()` сохраняет D0 observations,
   берёт `facts.correctionReasons ?? facts.reasons` и входит в while только
   при непустом основании, strategy=D и числе corrections меньше трёх.

Скрипт повторно вызывает **этот же** `prepareObservations()` на сохранённых
native events и D0 snapshot, после применения того же полного patch к копии.
Все поля observations совпадают после удаления только cwd и временных diff
headers; полные hunks, command outputs, call IDs и state hashes сохранены.
Повторено для direct и D, без запуска их workflow/model.

У D последняя поддерживаемая проверка — event 28,
`call_16bbbe4b78d94684b2331a8e5d0eec46`, `npm test`, exit=0,
tests=8, current=true, successful=true. Более ранние failures того же npm route
погашены последующим успешным выполнением. Events 13/15 падали из-за отсутствия
drain; event 17 — потому что авторский send mock ошибочно ожидал record `a`
для `b/c`. Исправление mock сохранило неверное pending=1. **Ни одна из этих
ошибок не предъявляла правильное ожидание inflight-aware counts.**

Observer сохранил неверное assertion целиком в `testChanges`; это подтверждено
replay. `reasons=[]`, `correctionReasons=[]`, `checksCurrent=true`.
В limits остались unsupported targeted Node commands; они не стали выдуманным
поводом исправлять семантику. Workflow сохранил `repairs=0`, один implementation
author stage и внутренний incomplete из-за limits. D0/final observations равны.

Следовательно, фактический вариант — **проверки/исполнительного доказательства
правильного counts.pending в траектории не было**. Публичный текст и противоречащее
ему assertion были доступны и сохранены; observer не потерял отрицательный
результат и не сформировал основание, которое workflow проигнорировал.
Отсутствует семантическая проверка согласованности ожидания с контрактом.
Провал первоначального решения нельзя приписывать неисполненному corrective loop.

## Что сделали P, direct и D

Все три получили и прочитали полный TASK.md и исходный status.mjs; отсутствие
контракта во входе не подтверждается. Таблица описывает видимые действия,
не реконструирует скрытое рассуждение и не устанавливает причинность успеха.

| Попытка | Получение и проверка ожиданий | Реально проверенные состояния и final claim |
| --- | --- | --- |
| P | Read TASK `call_1415b06b85d247bfadf9d39620ed8602`; после реализации меняет status helper (`call_a7b29a099cb14562ba86a95d5b2b4a6c`), затем добавляет regression с pending=3 (`call_cbc896f43a514062ad44532d1ee0d84f`) | `[inflight,pending,pending]`, один admission-limited send, overlap, enqueue during drain, close; recovery, legacy/retry и detached data. Final: correct counts, focused tests, npm test 6 passing |
| direct | Read TASK `call_j7PoitImavoiFkY6ae7SM0mu`; одной production patch меняет queue и helper (`call_A8f4MNRdVIqR8DeXi2FRZJsP`), затем пишет tests (`call_eWklE7xRGuFJ6rLptqEit4dT`) | pending=3 во время deferred first send после enqueue c; pending=1 при единственной inflight записи после failed ack save; также limits/recovery/close и legacy/retry. Final: inflight-aware counts; new 5/5, preservation 2/2, npm test 7/7 |
| D | Read TASK `call_69a070b6eedf482884b772f9c9270042`; до production пишет неверное pending=1 (`call_M4FuCutn94ImRao9jNBZCajU`) и получает RED из-за отсутствующего drain; впоследствии сохраняет это expected | Store действительно inflight+pending, но assertion считает только pending; после enqueue c counts=3 не проверяется, финальные sent counts=3 проверяются. Final заявляет coverage all requested behavior; new 6, preservation 2, npm test 8 passed |

RED→GREEN D подтверждает чувствительность к отсутствию API и исправлению mock,
не корректность ожидания counts. P/direct корректируют helper и дают нужные
ожидания, но по одной попытке нельзя объявить чтение, порядок edits или любое
совпавшее действие причиной успеха. Corrections отсутствуют во всей калибровке.

## Другие сохранённые провалы и уже испытанные варианты

[SELECTION.md](SELECTION.md) фиксирует критерий до подробного разбора, исключения
и ограничение выборки. В выбранных трёх законченных попытках одной сложной
ledger задачи существенные дефекты не объясняются буквальным mismatch имени
diagnostic в raw E; он не используется для вывода.

| Попытка | Публичное нарушение и доступный сигнал | Что позволяет сказать сохранённая траектория |
| --- | --- | --- |
| [Plain ledger](https://github.com/Tah10n/opencode-harness/blob/030b4ee2b5df7af050ef49bb58098b096ef486d6/development/plain-ledger-native-high/REPORT.md) | Task требует retention через существующий `collect({dataPath},...)`. Final gates shared/Claude ledger по account/source identity; move/truncate теряет принятый 15-token день | `trajectory.json`: old-truncation failures дошли в requests 45/49; gates edits tools 113/114 дошли в 52/53. Автор явно отделил parser-only API, чтобы пройти superseded assertion. Это доступный, неверно интерпретированный публичный сигнал, не потеря stdout. Финальные readers 87/87 не доказали whole task |
| [Direct AR0](https://github.com/Tah10n/opencode-harness/blob/030b4ee2b5df7af050ef49bb58098b096ef486d6/development/direct-assertion-review/model-pair/AR0-assessment.json) | Подтверждённый OpenCode cutover теряет accepted 100-token baseline и оставляет новые 7; corrupt ledger возвращает empty/complete (`shared.mjs:109`) | `AR0-trajectory.json`: request 46 получает old-truncation FAIL; edit `call_BQZHeQgQ2jU9ugNP9jygb7Bv` корректно меняет только superseded date expectation, request 52. Оригинальный partial-rewrite public test проходит. Локальная правильная реакция не закрывает другие контрактные цепочки; Q=false/T=true/D=false |
| [Direct AR1](https://github.com/Tah10n/opencode-harness/blob/030b4ee2b5df7af050ef49bb58098b096ef486d6/development/direct-assertion-review/model-pair/AR1-assessment.json) | Вместе с superseded truncation ослаблен сохраняемый partial-rewrite: deep entries equality заменена totals-only `['20','20']`, потеряны dates/components | `AR1-trajectory.json`: оба FAIL в request 41, edit `call_uryGHYcZv4oenARlkPO9iHkp` в request 45. Сохранённый replay неизменённого original public test body PASS у AR0 и FAIL у AR1; import/fixture paths — единственная адаптация. Это неверная классификация доступного сигнала, не новое скрытое требование; Q=false/T=true/D=false |

Это не новая оценка этих patches; использованы их сохранённые reports,
assessment и адресованные native/request receipts. Новых ledger tests не было.
Три попытки одной задачи ограничивают широту вывода.

История не даёт права переименовать существующий процесс в новую гипотезу:

- `runCheckFirstWorkflow()` уже делает focused public consumer regression на
  initial state, потом implementation в той же сессии. [48-run history](https://github.com/Tah10n/opencode-harness/blob/030b4ee2b5df7af050ef49bb58098b096ef486d6/development/native-task-finish/RESULTS.md)
  не установила преимущество; independent evaluation осталась 0/80. Подготовка
  RED сама по себе не гарантирует правильность expected — outbox это демонстрирует.
- `attentionPass` уже добавляет direct same-session completeness review с полным
  original task. Повторное предложение дополнительного «проверь контракт»
  не было бы материально новым действием. Ни его присутствие в коде, ни зелёный
  scripted control не доказывают model-backed пользу.
- Investigator уже существует как optional bounded same-model test-only путь.
  [Законченный follow-up](https://github.com/Tah10n/opencode-harness/blob/030b4ee2b5df7af050ef49bb58098b096ef486d6/development/investigation-followup/full-task/REPORT.md)
  доказывает receipt/inspect и частичный ручной reuse, но Q=false/T=true/D=false,
  без формального accept/decline и без причинного сравнения выигрыша.
- Current `profiles/native/core.md` уже требует выводить ожидания из public
  contract и проверять real callers/state, а implementation prompt уже называет
  generated assertions hypotheses. 204-word assertion-review block уже испытан
  в AR0/AR1 и откачен; обе попытки Q=false. [Core H1 `8253fa1c`](../../../polybench/campaigns/evidence-backed-core-development-v1/REPORT.md)
  с public-caller contrast был отвергнут (P 4/6, C0/H1 3/6); H2 «распространить
  baseline check на features» отклонён до реализации как недоказанное повторение
  существующего требования. Отдельный Three.js evaluator identity дефект
  исключается из семантических объяснений.

## Проверка подготовки к публикации

Новая локальная проверка: оба обязательных `npm ci --ignore-scripts` и
`npm run verify` прошли; verify завершился с exit 0, **21 группа PASS**.
Также прошли Node syntax check диагностического скрипта, воспроизведение
(с ожидаемым contract FAIL D), проверка ссылок и финального diff.
[review-preparation.json](review-preparation.json) содержит отдельный receipt.
Исходные calibration receipts и их исторические PASS/FAIL не заменялись.
Публикационный diff проверен на приватные artifact paths, credentials и host
paths. Фактический новый remote CI снимается **после** fast-forward push и
сообщается отдельно; локальный PASS не считается CI PASS.

## Остановка

На этих данных нет обоснования для одного нового действия, которое давало бы
новый проверяемый сигнал и имело отличающийся от уже существующих вариантов
механизм. Добавление требования снова сверить expected с TASK повторяет core,
implementation prompt/check-first; дополнительный completeness pass повторяет
attentionPass; новый reviewer/investigator не разрешён и не обоснован.
Outbox-specific guard и скрытый oracle были бы подменой обычного repo-сигнала.

Поэтому новый кандидат и следующий модельный эксперимент **не предлагаются к
запуску**. D остаётся experimental; на v3 — восемь ties, на этой калибровке —
0 wins/1 loss/5 ties против direct и 0 corrective activations. Это отсутствие
показанного выигрыша на фиксированных наборах, не доказательство эквивалентности
или всеобщей бесполезности. Польза/вред корректирующего цикла здесь не измерены.

`CONFIRMATION_DRAFT.md` остаётся **NOT RUN**, подбор 30 задач не выполнен;
180 попыток не запускаются и документ не является обязательством продолжить.
Исторический deadline FAIL остаётся **UNRESOLVED**; stop/containment guards,
defaults и продукт не изменены. Merge, Ready, release и manual CI reruns не
выполняются. После публикации несекретной диагностики и readback работа завершена.
