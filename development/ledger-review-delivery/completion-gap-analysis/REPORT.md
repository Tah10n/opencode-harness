# Почему F завершил неполную задачу: два ограниченных предмета

Разбор 2026-09-23, исходная ветка `b3f8f6a1c851d79d880a80b245861060fb8a945b`.

**Самый сильный наблюдаемый разрыв — F закрыл собственный план ремонта трёх
concrete findings и проверки сохранения поведения, не установив выполнение
privacy для всего сохраняемого state и не сообщив нерешённый вопрос damaged
state.** Полное задание, handoff, reviewer-вопрос и относящийся к ним код были
доступны в фактических запросах. Это объяснение на уровне действий и критерия
завершения, а не доказанная внутренняя причина выбора модели. Нельзя установить,
почему F не связал прочитанные raw-key assignments с запретом persistence, или
считал ли он повреждённый state допустимым: такого наблюдаемого решения нет.

Один возможный минимальный шаг предложен ниже, **не реализован**. Новых model,
provider, reviewer, scripted-author и диагностических запусков продукта — **0**.
Для этого вывода достаточно сохранённых данных; неизвестное поведение отдельного
malformed-v1 примера не заменено новой модельной сессией или чужим форматом state.

## Источники и границы доказательства

- [Исходное задание](../../plain-ledger-native-high/original-task.txt),
  [handoff](../handoff-template.txt), неизменённые [R](../post-capture-followup/R.md)
  и [F](../post-capture-followup/F-response.md).
- [Безопасная хронология и hashes](evidence.json), воспроизводимый read-only
  [extractor](extract.py). Запуск из корня: `python3 development/ledger-review-delivery/completion-gap-analysis/extract.py`.
  Он только читает архив и печатает JSON; не запускает архивный код, не читает
  credentials, не экспортирует reasoning или полные private receipts.
- Private archive найден через [cleanup](../post-capture-followup/cleanup.json),
  а не подбором похожих путей: `local/ledger-review-delivery/post-capture-followup-evidence.tar.gz`,
  SHA-256 `1987bd43e4d9bc63f7b9c3b9e96142d130f26d7a8fe116640fe1117993257e62`.
  Все 1265 members проверены по index: путь, размер, SHA-256, mode.
- Внутри него F prefix — `real/F/runs/account-switch-ledger-F/`; native artifacts
  находятся под `task-artifacts/2ef7bc1c-a0c5-4fb8-8d68-14f0cf8cc9ff/`.
  `tool-events.json`, `implementation-messages.json`, initial/terminal snapshots
  и `upstream-request-N.json` связаны этим запуском и hashes в evidence.
  В native tool list 78 событий автора; агрегат chain считает 79 вызовов вместе
  с родительским запуском. Parent/title requests не приравнены к author input.
- D0 privacy дополнительно сверена с историческим archive из
  [provenance](../post-capture-followup/provenance.json), SHA-256
  `54b66700f95a3adf210e9d660f031671aba255901fcc52705eb05154cb59c391`.
  Indexed `evaluation-D0/E-cli-persistence.json` имеет SHA-256
  `2b121eb47f404fac8df0a8b39b559c8d1bea37ee73d73c577d7a905082265f71`,
  `evaluation-D0/E-supplemental.json` —
  `611e50e440aef2cbcb50c7114052f6f45a86e397489de5daeaada484e05b92ae`.
  Оба проверены по байтам; privacy проявляется уже там.

Это не повторный аудит collector/resolver/recorder/controller. Полные outputs,
native receipts и фактические сообщения следующего запроса различаются:
extractor сопоставляет `call_id` и точный текст output. Для выбранных событий
первая передача совпала с native output. Наличие файла само по себе не использовано
как доказательство передачи. Compaction parts отсутствуют, а полные исходные
блоки проверены во всех 46 author requests; скрытые рассуждения не реконструируются.

## Требование, handoff и фактический план

В первом **author request F №3**, затем в каждом №4–48 присутствуют точные строки
полного original-task, environment, развёрнутого handoff и неизменённого R-response.
Проверка — внутри actual input fields, без нормализации или сокращения ожидаемых
блоков. Privacy буквально требует `no raw provider IDs/content in persisted state
or upload`. Полностью передан и вопрос:

> Several adapters check only `eventLedger.version`, while Claude validates the complete ledger. Should malformed version-1 ledgers fail closed consistently?

Исходное задание требует всю задачу и сохранение privacy/diagnostics, а не только
трёх находок. Handoff прямо говорит `Finish the complete original task`, проверять
недоверенные review claims и сохранять все остальные требования. Initial native
instruction дополнительно требует закончить все обязательства, проверять новое
поведение отдельно от preservation и предупреждает: `old suites and whitespace
alone cannot establish new behavior`. Отмена остальных требований не разрешалась.

Фактический todo (event 0, `call_SshLJ2HudGSeHNVNRLEKPsVx`, request 4) включает
inspection, ремонт tail/conflict/capacity, regressions preserving parser/range/
partial/**privacy**, требуемые suites и final diff. Значит, буквальная гипотеза
«F полностью исключил privacy из плана» неверна. Однако конкретные новые тесты и
изменения обслуживают именно три findings; отдельной проверки всего durable state
нет. В event 55 пункт с privacy уже `completed`; в event 77 все пять пунктов
`completed`. Damaged-state вопрос отдельного решения в todo не получил.

Это фактическое сужение выполненной проверки и закрытия плана, не заявление F
«review отменяет original-task». Он также распространил найденный tail-дефект на
Claude, то есть не ограничился буквальными строками reviewer.

## Privacy: какой тест действительно прошёл

Команда event 69 / `call_ASBseoK9ohV2OQdAmts1FpRt`:

```sh
node --test packages/connector/test/claude-security.test.mjs
```

Фильтра нет; ровно один case: **`Claude message ids cannot mutate collector prototypes`**.
Native workdir `.` разрешён в
`/work/repo/.git/harness-task/2ef7bc1c-a0c5-4fb8-8d68-14f0cf8cc9ff/worktree`.
Node 24.19.0 — из закреплённой среды. Timeout 120000 ms; exit 0, signal/timeout
null. Полный output: 1 pass, 0 fail/cancelled/skipped/todo, 40.779375 ms.
Он целиком передан в **request 41**, SHA-256 output
`b6b1088f13177f6a302c4c5a77ad7807c43da5904b75e2e404dfdd53d26b1ab9`.

Snapshot исполнения: `33dfc0474380c3e4b61a72a98e5ad31d41fea5b60234dbf3e3f71715f5336e11`.
После него F менял только setup/форматирование capacity regression в readers
(event 70); production и сам security case к final не менялись. Terminal snapshot:
`89381d11b73c69de37d2a96c4f5e3c2d43da239d9c12f00a4fbf8f967866d03c`.

F прочитал **весь файл, строки 1–44**, event 53 / request 28. Реальный setup:
временный `session.jsonl`, assistant records за 2026-08-19 с ID `__proto__`,
`constructor`, `prototype`, input 1/2/3, output 1. Вызывается настоящий
`collectClaude`, затем дописываются конфликтующий `__proto__` с input 100 и
`ordinary` с input 4, оба с output 1, и повторно вызывается collector.

Исполненные assertions:

1. `Object.getPrototypeOf(first.nextState.messages) === null`.
2. Ключи first.messages равны трём **исходным** ID.
3. `JSON.parse(JSON.stringify(first.nextState))` не бросает исключение.
4. Prototype второго messages снова null; ключи равны трём прежним ID плюс `ordinary`.
5. Второй total равен `14`, completeness — `partial`.

Это корректная защита prototype и сохранения первой tuple при конфликте. Тест
действительно сериализует настоящий collector state, но проверяет лишь возможность
JSON roundtrip, **не отсутствие raw IDs в JSON**. Он не записывает state через CLI
и не проверяет upload. Имена security и JSON assertion не расширяют его контракт.
Более того, ожидание raw message keys демонстрирует напряжение с privacy original-task;
его следовало разрешить по контрактам, а не автоматически доверять зелёному тесту.
F увидел также `git show HEAD` этого case (event 54): D0 добавил только проверку
`partial`; F не менял его assertions.

В readers существовали privacy assertions только для
`JSON.stringify(nextState.eventLedger)` (grep event 19; чтение event 9). Они
проверяют хешированный ledger, не соседние `messages` и `files[*].ids`.
F исполнил required readers suite; этот более узкий охват не доказывает privacy
всего nextState. Специального запуска persisted-state privacy или CLI такого
назначения в полной command inventory нет.

### Независимые сохранённые проверки — не сведения, полученные F

[Supplemental probe](../supplemental.mjs) передаёт настоящий Claude message ID
`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`, input 10,
output 5, 2026-08-10, через `adapterFor('claude_code').collect`. После JSON
roundtrip всего nextState точный исходный ID найден через `.includes(id)`.
Это доказательство JSON-представления state, а не отдельного записанного файла.
Никакая произвольная 64-hex строка не объявляется утечкой: SHA-256 ID в
`eventLedger.events` ожидаем и отличен от проверяемого известного входа.

Отдельно [CLI probe](../../plain-ledger-native-high/cli-persistence.test.mjs:117)
использует два synthetic source, реальный `bin/viberacing.mjs sync`, loopback
fixture и чтение `.viberacing/state.json`. Точный `private-same-event` найден в
`adapters[sourceId].messages` и `files[path].ids`, также в копии
`adaptersByClientSourceId`. Saved failure stack указывает assertion persisted
file на строке 149, **после** успешной проверки upload на отсутствие этих sentinel
IDs и домашнего пути. Это не доказательство утечки upload; последующие CLI
assertions для Claude после первой ошибки не исполнялись.

D0 и final имеют этот дефект. В D0 read event 7 / request 6 F получил Claude
строки 25 (raw ID), 85–92 (compatibility/nextState), 155–171 (raw-key messages и
ids), 213 (возвращаемый state). В shared read event 8 / request 6 отдельно виден
SHA-256 внутри ledger. Обе необходимые области попали в переданный диапазон:
окончание чтения на 250 из 265 строк не потеряло эти строки.

[D0→final patch](../post-capture-followup/D0-to-final.patch) меняет tail и выбор
возвращаемых entries, но не raw-key/ids persistence. CLI grep event 26 / request 10
передал присваивание `state.adapters[source.sourceId] = ...nextState` (строка 1394).
Полное чтение CLI 1000–1279 **не** покрывало эту строку; доказательство её получения
— именно grep. В наблюдаемом сообщении `msg_0ce3c0902001oZNbpBRUU8QKeX` F сам
связал collector state с durable `state.adapters[sourceId]`.

F не писал «privacy обеспечена». Его сообщение перед event 69 называет security
case дополнительным **preservation check**. Финальный список passing checks
точен в этой части; ошибка завершения — непроверенное требование и неуказанное
ограничение, а не установленное ложное утверждение об охвате этого теста.

## Damaged state: два разных сценария

Контрактная основа обоих — сохранение уже принятого usage и complete/partial /
diagnostics semantics. Original-task не задаёт исчерпывающую схему recovery
произвольного повреждённого JSON и не предписывает всем адаптерам бросать exception.
Частичный результат с диагностикой и сохранением пригодных данных может отвечать
контракту. Специальное fail-closed правило OpenCode exact-ID cutover нельзя
переносить на все state readers. Reviewer-вопрос не становится спецификацией.

| Сценарий | Доступные факты и предел |
| --- | --- |
| A. Поддерживаемая version 1, повреждённая структура | Reviewer спросил именно об этом. `validEventLedger` проверяет объект events, размер/count и каждую tuple; `observeEventLedger` молча начинает пустой ledger при invalid previous. Claude вызывает full validator до допуска state; Qwen/Gemini/Kimi/Antigravity используют version-only compatibility до общего helper. Это прочитано F. Универсальное требование «везде throw» **unsupported**. Сохранённого адресного execution receipt для повреждения структуры собственного serialized v1 state здесь нет; результат конкретного такого запуска **не установлен**. |
| B. У собственного сохранённого state изменена version на -1 | [Saved selected-state](../post-capture-followup/selected-state.mjs) собирает Antigravity record `accepted`, 15 tokens; проверяет total 15, JSON-roundtrips настоящий nextState, проверяет исходную version 1, меняет только version на -1, удаляет source file и снова вызывает adapter. [Receipt](../post-capture-followup/selected-observations.json): total 0, complete, diagnostics []. Это необозначенная потеря принятого usage. Проверка использует serialized object, не readState/writeState повреждённого файла реальным CLI; поведение полного CLI при такой порче отдельно не установлено. |

Для A достижимый диагностический сценарий следует строить как B до получения
собственного JSON-roundtripped nextState, **оставляя version 1** и повреждая,
например, `events` в `null`; это описание возможного входа, не выполненный тест
и не дополнительная спецификация восстановления уничтоженных tuples. Нельзя
требовать точного восстановления без оставшихся сведений. Возможность silent
reset следует из source; точный результат для конкретного malformed-v1 сценария
остаётся hypothesis, не новым подтверждённым дефектом F.

В D0 `shared.mjs:116–125` содержит full validator, 128–134 — условную загрузку
previous. Эти строки неизменны в final. Version-only guards в Antigravity:99,
Qwen:351, Gemini:164, Kimi:204 также не менялись. F прочитал их в events 10–13
(request 7); full validator и Claude guard — в events 7–8 (request 6).
Он читал и возврат diagnostics общего collector (event 6).

Для B Antigravity передаёт `{}` при несовместимой версии. F не менял этот выбор
или fallback старого state только при `result.completeness === 'partial'`
(строки 108–117). В отсутствии source обычный пустой scan может быть complete;
сам invalid ledger не порождает diagnostic. Следовательно, соответствующая
причина сохраняется от D0 до final; final результат подтверждён saved probe.

Просмотрены все 78 tool events, все observable assistant text и todo, команды и
patches. Есть чтение соответствующего кода и проверки обычной compatibility,
но **нет адресной проверки damaged-v1 или version -1**, сообщения с разрешением
reviewer-вопроса, аргументированного отказа или явного сохранения неопределённости.
Одно лишь отсутствие ответа в F-response не было основанием этого вывода.
Нельзя узнать, заметил ли F проблему при чтении и затем отклонил её мысленно.

## Одна хронология получения и завершения

Время относительно author user message `1790166333696` = 12:25:33.696 UTC.
В JSON сохранены полные call IDs, абсолютные часы и before/after hashes;
здесь события обозначены их нулевым индексом, чтобы таблица оставалась компактной.

| t, seconds | Сведения / действие | Реальное получение и последующий шаг |
| --- | --- | --- |
| 0 | Request 3: весь task/environment/handoff/R | Initial snapshot `b391aa3862f5…`; полные блоки сохраняются в requests 3–48 |
| 7.148 | e0: todo с тремя ремонтами и общим preservation/privacy | Request 4 получает todo; далее чтение кода |
| 17.493–28.039 | e7/e8 и e10–13: raw-ID путь, full validator, version-only guards | Requests 6/7 получают outputs целиком; затем работа над тремя findings |
| 91.060 | e26: CLI nextState→state.adapters | Request 10; F публично признаёт durable границу collector state |
| 300.651 | e47: grep raw/eventLedger/provider ID/sensitive/session в tests | Request 22; нет последующего whole-state privacy assertion |
| 397.702 / 406.852 | e53/e54: security case и его D0 diff | Requests 28/29; case не меняется |
| 423.625 | e55: regressions preserving privacy отмечены completed | Request 30; следуют diff и проверки |
| 481.666 | e60: последняя production-правка Claude provisional tail | Request 34; snapshot `33dfc0474380…` |
| 535.308 | e64: pnpm verify unavailable | Request 38; F сообщает environment limitation |
| 569.191 | e69: security case 1/1, exit 0 | Request 41 получает полный output; это prototype check, не privacy verdict |
| 584.803 | e70: только capacity-test setup/форматирование | Request 42; terminal snapshot `89381d11b73c…` |
| 591.004–644.243 | e71–75: focused tests, readers/config/protocol, diff check | Requests 43–47; passing результаты получены, но два выбранных пробела не проверены |
| 651.930 | e77: все todo completed | Request 48; нет remaining limitation по privacy/damaged state |
| 657.466–660.040 | Финальный ответ F | Ремонт трёх findings, passing checks, unavailable pnpm; два пробела не названы |
| 666.119 | Native completed, exit 0 | `timedOut=false`, `ownTaskDeadlineTriggered=false`; capture/termination подтверждены |

Общий deadline — `1790167803871` (12:50:03.871 UTC), общий старт R —
`1790166003871`. F получил remaining 1474597 ms. Native F завершён в
`1790166999815`, **за 804.056 seconds до deadline**; полная цепочка закрыта
в `1790167001908`. Это исключает общий timeout как причину остановки. Из этого
не следует, что времени обязательно хватило бы для полного ремонта.

## Конкурирующие объяснения

| Объяснение | Оценка |
| --- | --- |
| Не передали task/privacy или весь reviewer-вопрос | Противоречит точным bytes фактических author requests. |
| Работа фактически сведена к трём concrete findings | Поддержано конкретными tests/edits и закрытием todo; буквальная отмена остальных требований моделью неизвестна. Privacy оставалась словом в todo. |
| Зелёные suites породили уверенность в полной privacy | Неизвестно как мотив. Наблюдается переход от passing preservation к completed todo, но нет утверждения полного privacy coverage. |
| Damaged вопрос проверен и неверно разрешён | Нет подтверждающего адресного test/result или observable решения; чтение validators само по себе не решение. |
| Вопрос обоснованно оставлен неопределённым, но забыли сообщить | Обоснование неизвестно; отсутствие оговорки в завершении подтверждено. |
| Требование не проверено, хотя соответствующая работа доступна | Поддержано для whole-state privacy; relevant code, реальный collector и local tests доступны. Damaged вопрос прочитан, адресного resolution не видно. |
| Техническое ограничение / timeout | Для этих Node checks данных о блокировке нет; исполнение Node работало, stop ранний. Недоступный pnpm — реальное отдельное ограничение, не объяснение отсутствия адресных проверок. |
| Данных недостаточно | Да для внутренней причины семантического выбора и фактического malformed-v1 результата; нет для факта пробела проверки и неоговорённого завершения. |

Успешное исправление byte-limit retention остаётся установленной частичной
помощью. Исторические **Q_followup=false, T_followup=true, D_followup=false,
209/209 и 15/23** неизменны. Равенство raw score не обнуляет эту помощь.
Остальные нарушения прежней приёмки здесь не переоценены.

## Не более одного минимального предложения

**Добавить одну исполняемую privacy-регрессию к существующим connector checks:
реальный CLI записывает state для известного synthetic Claude ID, после чего
тест проверяет отсутствие именно этого ID во всём прочитанном state.json.**
Это предложение будущего изменения теста; оно не внесено в исторические patches,
продукт или prompt и не назначает следующую кампанию автоматически.

Точка применения — существующая проверка изменённого Claude пути перед final
completion. Основание обычному агенту дают сам privacy-текст original-task,
`nextState→state.adapters`, уже доступные публичные CLI/config test helpers и
прочитанный security case с raw keys. Доступ к evaluator не нужен. Не предлагается
обязать агента выполнять скрытую матрицу; используемый здесь private probe —
доказательство пробела, не единственный источник спецификации теста.

Одно действие — добавить/исполнить эту узкую проверку persisted artifact с
сохранением обычных usage и prototype guarantees. Положительный контроль:
текущее D0/final с заведомым raw sentinel должно дать failure на точном совпадении.
Отрицательный контроль: отсутствие raw sentinel при наличии его SHA-256 и
сохранённых totals должно проходить; 64-hex digest не запрещён по форме.
Проверка, которая падает только на length/pattern, не доходит до записи файла
или проходит на известном текущем leak, опровергает полезность такого реализации
контроля. Если агент видит корректный failure и всё равно завершает задачу без
разрешения/оговорки, этот контроль не устраняет наблюдаемый completion gap.

Это конкретный дополнительный oracle, а не ещё один абзац «проверь требования»:
существующий prompt **уже требует** необходимых checks и remaining limitations.
Предложение адресует установленный privacy coverage gap, не обещает исправить
все семантические решения и **не закрывает damaged-state неопределённость**.
Reviewer-гипотезы не превращаются в доверенные bug commands. Дополнительная работа:
один focused regression с публичным helper, локальный CLI subprocess и loopback
fixture; при failure — обычное расследование в разрешённой сессии. Provider run
для самой проверки не требуется. Время разработки/модели и денежная цена не измерены;
причинная эффективность изменения не доказана.

## Поставка и проверка

Только этот REPORT, read-only extractor и безопасный JSON. Проверены hashes
обоих архивов, 1265 follow-up members, 14 неизменённых исторических файлов
относительно исходного SHA, воспроизводимость JSON, syntax extractor и scoped
whitespace. Итоговый review разделил два вида порчи, author/evaluator context,
реальный охват теста и наблюдаемые действия от причинного объяснения.
Runtime, prompts, evaluator, permissions,
исторические patches/responses/scores/costs не меняются. Повторных suites, CLI
матрицы, `pnpm verify`, controller-suite и ручного CI нет. Разработка этого разбора
не прибавляется к историческому Luna usage; денежная оценка не выводится.

Временные выборки текущего разбора удалены после проверки: 2544779 байт
логических данных. Новых контейнеров, образов и dependency-кэшей нет. Исходные private
archives/indexes сохраняются. Публикация — один обычный push в существующую ветку
и добавление ссылки на этот анализ в Draft PR #25 с прежней base; без merge/release.
