# Четыре UFO-траектории: потеря ключей и потеря рабочего пути проверок

**Результат анализа:** две независимые цепочки объясняют конкретные дефекты.
P/r1 сам разрушил доступную установку зависимостей; Hbase/r2 не обнаружил
запуск проектных команд через npm из вложенного worktree и остановился на
native permission denial. В обоих неуспешных patches `append` теряет собственные
ключи со значением `undefined` при слишком ранней сериализации. Правильный
порядок в двух успешных patches появился сразу, до проверок.

**Один следующий кандидат:** ограниченная подсказка о разрешении проектной
команды после первого подтверждённого `command not found`, с проверяемым
различением shell PATH и установленных project binaries. Это гипотеза о
доступе к проверкам, не доказанное улучшение полной поставки и не решение
семантики append. Реализация и новые модельные сравнения сюда не входят.

## Область и карта свидетельств

Только slot 8 / n05 (P/r1), 7 / n12 (Hbase/r1), 11 / n08 (P/r2),
12 / n06 (Hbase/r2). Публикационная база — `28461749aee5ca8a01f9e47fc951b7a1352e6978`;
измеряемый runtime — `797ce6f1b75af217e00224d1b38790346dee1d19`.
Remote при начале совпал с этой базой. Исторические Q/T/D, расходы, freeze,
reference/alternative и исходные отчёты не меняются.

Обозначения **P1/27**, **H2/57** и т. п. — порядковые номера авторских native
tool events, сортировка по времени начала и part ID, без родительского
`harness_task`. Это адреса свидетельств, не предположение о последовательном
выполнении параллельных reads. [Указатель](EVIDENCE.md) содержит реальные
call IDs, request receipt, snapshot IDs и необходимые выдержки. Его четыре
таблицы: [P1](EVIDENCE.md#p1), [H1](EVIDENCE.md#h1),
[P2](EVIDENCE.md#p2), [H2](EVIDENCE.md#h2).

Локальный корень архива: `local/native-task-integrated` в worktree PR #25.
Пути найдены через `freeze.json`, `started.json`, results и capture, а не
угаданы по финальному diff. Архив не публикуется целиком.

| Попытка | Run относительно локального корня | Автор / инструкции / сохранённое состояние |
|---|---|---|
| P/r1 | `runs/url-search-params-r1-P` | Первый author input — `request-2.json`; cwd `/work/repo`. Тексты автора, native tools и step snapshot IDs — `session/events.jsonl`; инструменты также в `native-evidence.json`. Последнее дерево — `candidate`, переносимый diff — [n05](../patches/n05.patch). |
| Hbase/r1 | `runs/url-search-params-r1-Hbase` | Author input — `request-3.json`; cwd `/work/repo/.git/harness-task/aec64eae-a6b6-4621-a0ed-72bfd659d787/worktree`. Child tools — `native-evidence.json`; тексты/parts — `candidate/.git/harness-task/<id>/implementation-messages.json`; пооперационные привязки — `tool-events.json` рядом. `terminal.json` и `terminal.patch` привязаны к [n12](../patches/n12.patch). |
| P/r2 | `continuation-11-12/runs/url-search-params-r2-P` | Input и виды событий как у P/r1; последнее дерево `candidate`, diff [n08](../patches/n08.patch). |
| Hbase/r2 | `continuation-11-12/runs/url-search-params-r2-Hbase` | Input как у Hbase/r1; task id `df883397-54af-4116-a98a-298b958de12d`. Child tools — `native-evidence.json`; видимые тексты — последующие `request-N.json`; последний aborted message — `implementation-original.json` (для анализа используются только text/tool/step parts). `terminal.json`, `terminal.patch`, `permission-violation.json` сохраняют состояние [n06](../patches/n06.patch) при остановке. |

Во всех четырёх фактических author requests целиком присутствует
[исходный запрос](../tasks/url-search-params.md), SHA-256
`b1f233ca1456b5967b3317a931341ac4604aeb9a2607e7e14640d9bb2b4421ef`.
P получает native OpenCode developer instructions: изучить проект, сделать
минимальное совместимое изменение, завершить проверки. H дополнительно
получает [core.md измеряемого runtime](https://github.com/Tah10n/opencode-harness/blob/797ce6f1b75af217e00224d1b38790346dee1d19/profiles/native/core.md)
и direct author preamble: работать в delivery-worktree, использовать относительные
пути, разделять новые и сохранённые сценарии, проверять наблюдаемое состояние
перед stateful operation, повторять checks после правок. Точные текстовые hashes
есть в указателе; H1/H2 отличаются cwd, но не substantive preamble. Ни один из
этих inputs не сообщает точный путь установленного pnpm или готовый ответ evaluator.
CONTEXT/CHECKS/SENSITIVITY/INVESTIGATION/EXTRA_ATTENTION выключены в обеих Hbase.

Три уровня знания не смешиваются:

1. **Существовало:** frozen source и dependencies, package scripts, pnpm
   10.33.2 в `/work/repo/node_modules/.bin`, Node 24.19.0, npm 11.17.0;
   shell PATH не включает этот `.bin`. Source — UFO `f06c800d…`.
2. **Получено:** все четыре прочитали полный `package.json` и исходные
   `src/query.ts`, `src/url.ts`, нужный участок `src/utils.ts` до первой реализации.
   P1/6–8,12; H1/8–11; P2/8–10,13; H2/5–8. Именно нужные строки
   `Object.assign(this.query, url.query)` и `.filter(k => query[k] !== undefined)`
   есть в результатах и последующих provider inputs. Эти reads имеют
   `truncated=false`; вывод не основан на наличии файлов или общем флаге truncation.
3. **Использовано:** последующие patches сохраняют object branch и вводят
   params branch; H1/P2 явно используют `Object.keys(url.query)` до сериализации.
   Сам факт чтения не доказывает понимания own-undefined семантики у P1/H2.

Apply-patch inputs и успешные ответы сохраняют точные промежуточные hunks.
Поздние reads/diffs и terminal trees подтверждают продолжение этой цепочки.
H имеет before/after hashes каждого вызова; P — hashes всего native step,
который может включать несколько tools. Это не полные архивы `node_modules`
на каждом шаге. Из одного final patch промежуточный код не реконструировался.
Финальная поставка во всех четырёх затрагивает те же семь project files:
README, `src/{query,url,utils}.ts`, `test/{query,url}.test.ts`,
`test/types.test-d.ts`; зависимостям P1 внутри сессии это не придаёт неизменности.

## А. Путь к проектным проверкам

Полученные scripts одинаковы: `test = pnpm lint && vitest run --typecheck`,
`lint = eslint . && prettier -c src test`, `build = automd && unbuild`;
`packageManager = pnpm@10.33.2`. В H dependencies остаются в родительском
checkout, а delivery-worktree не содержит собственного установленного `.bin`.
Успешные H1 `npm run` / `npm exec --` подтверждают работоспособность поиска
ancestor binaries в этом layout; наличие plain `pnpm` в shell PATH не требуется.

| Попытка | Что автор проверил и узнал | Действия после ошибок и результат |
|---|---|---|
| **P/r1** | P1/29–31: три bare pnpm-команды дают 127. P1/32: native glob `node_modules/.bin/*` возвращает `No files found`. P1/34,36: npm/corepack доступны. **P1/37: `npx --yes pnpm@10.33.2 --version` → 10.33.2, exit 0**, получено в request 13. | Вместо запуска checks этим найденным путём P1/39 делает offline install: отказ от удаления modules без TTY. P1/41 показывает установленные пакеты и `.bin`; **P1/42** запускает именно `node_modules/.bin/pnpm` с `CI=true`: `Recreating /work/repo/node_modules`, затем worker exit 1. P1/48–49: `.bin` отсутствует, остаётся `.pnpm`; P1/53–56: нужных tsc/vitest файлов внутри нет. Повторный npx install пытается registry (P1/50, около 70 с, EAI_AGAIN); P1/79–81 дают ENOTCACHED; corepack test/build также не стартуют. Финально только whitespace/status/diff, нормальное завершение. |
| **Hbase/r1** | H1/25: pnpm 127; H1/28: локальный glob пуст; H1/29: corepack DNS failure. Bare tsc/prettier отсутствуют; PATH-поиск vitest/eslint/npm/deno/bun находит только npm (H1/37–43). Cache ls typescript/vitest → 0 (H1/48–49), но это не отсутствие ancestor install. | После ещё двух pnpm failures **H1/55 `npm run lint` реально достигает ESLint**, который требует spread вместо Array.from. Автор исправляет это (56). **H1/57 `npm exec -- vitest…` реально запускает suite**: ошибка expectation escaping; исправляет expectation в соответствии с прочитанным UFO encoding и добавляет parseQuery round-trip (58), не append. Затем formatter failure (61) → `npm exec -- prettier -w…` (62). После последних docs/build-правок: build 90, focused 94, full runtime 95, lint 96, type-aware suite 97, diff 98 — успешны. Установку зависимостей не меняет. |
| **P/r2** | P2/31–32: pnpm 127. **P2/33–34: `ls`, затем `ls node_modules/.bin`** возвращают pnpm/vitest/tsc/eslint/prettier и остальные binaries; это проверка реального каталога, не ignored glob. | P2/38–40 запускает binaries по `./node_modules/.bin/…`; видит formatting failure. Исправляет lint/форматирование (45–61), затем локальный pnpm test/build работают. Поздняя правка guards/casts даёт новый type-aware failure (73 → 76); исправление 78–80 предшествует повторному успеху. После окончательных append/no-mutation правок 97–98: test 99 (501 assertions, no type errors), tsc 100, build 101, diff 102. Нет install или dependency/config mutation. |
| **Hbase/r2** | H2/26: pnpm 127; H2/30–31: в delivery cwd нет `node_modules`. H2/43–44: Node/npm есть, tsc/vitest/eslint/prettier/pnpm в shell PATH нет. **Ancestor `.bin` не проверялся; `npm run lint/test/build` и `npm exec -- vitest` не пробовались.** | H2/48 `npm exec --yes --package=pnpm@10.33.2 pnpm --version` печатает **11.17.0**, не pinned pnpm 10.33.2: exit 0 не подтверждает нужный runner. Затем corepack и npm view идут в registry, получают EAI_AGAIN (50–51, npm view около 70 с). После docs/import edits 52–54 автор ищет global modules и `_npx` (55–56), затем делает native grep npm cache (57). Native external-directory denial; harness закрывает продолжение. Проверок исходников runner-ом не было; установки/удаления dependencies не было. |

**P1: почему install?** Видимое сообщение в request 12 говорит «pnpm is not
installed» после bare command failures и пустого glob. Затем получен успешный
pnpm version, но следующий выбранный путь — install; отдельного видимого
обоснования, почему нельзя запустить checks найденным runner, нет. Поэтому
подтверждены неправильный вывод из PATH/glob и выбор переустановки при доступном
runner; точный мотив выбора после version **не установлен**. Первая install
отказалась удалять без TTY, следующая сняла именно эту защиту через `CI=true`.
Точная внутренняя причина worker exit из сохранённого ответа не видна.
Но факт recreation и последующая утрата binaries видны непосредственно.
Позднее сообщение request 45 признаёт удаление дерева, тогда как финальный
ответ сводит блокировку к невозможности скачать pnpm — это неполное объяснение.

Пустой P1 glob не является надёжным свидетельством отсутствия установки:
frozen manifest, успешный npx version, `ls` и прямой запуск pnpm противоречат
такой интерпретации. Gitignore исключает `node_modules`; точный вклад ignore
или symlink matching здесь не устанавливался. Нет основания объявлять native
tool фабрикующим результаты; доказана непригодность этого glob как existence check.

**H2: вопрос за cache grep.** Последнее видимое объяснение (request 16) — найти
способ вызвать package manager без изменения dependencies; pattern последнего
grep перечисляет typescript/vitest/prettier/eslint. По последовательности это
поиск доступных пакетов/tooling после неудачного registry-пути, а не ответ на
диагностику типов. Автор уже получил scripts, npm version и исходники; точного
рабочего ancestor-resolution пути ему никто не вернул. Его существование
подтверждено соседней H1 в том же layout и manifest, но знание автором H2 — нет.

**Источник denial:** `experiment-config.json` задаёт native
`permission.external_directory=deny`; H2/57 сохраняет native error с этим
правилом. `tool-events.json` отмечает `permissionDenied=true`,
`denialKind=automatic`, `scopeViolation=false`; terminal reason затем сообщает
о запрете дальнейшего continuation со стороны harness. Это два звена:
native запрет операции и harness terminal policy. Это не filesystem EACCES,
не provider отказ и не Docker resource limit. Denial отсутствует в следующем
author request: не утверждается, что автор его получил и решил добровольно сдать patch.

Permission surfaces не считаются одинаковыми: у P project root `/work/repo`,
у H — вложенный delivery-worktree; H имеет дополнительную stop policy.
H1 cache-list через npm/bash и H2 native grep — разные operations. Их разные
исходы не разрешают обходить запрет или открывать кеш. Для разрешённого project
check такой поиск вообще не нужен. Из этих событий не следует, что plain P
после того же native denial обязательно завершился бы успешно.

**Объём поиска, без выдуманной цены решения.** Native author tools / bash /
read / glob+grep: P1 **98/36/33/13**, H1 **99/52/27/9**,
P2 **107/48/32/9**, H2 **57/15/26/8**. Bash с ненулевым exit:
**15, 9, 9, 6** соответственно; сюда входят полезные lint/test failures и
отсутствующие каталоги, а не только бесполезные команды. `which … || true`
не входит в ненулевые exits. H2 native denied grep считается отдельно.
Все PATH/cache/install-команды перечислены выше и доступны через extractor.
Ledger не позволяет изолировать token-стоимость решения «install» или «grep»;
token/cost исторических попыток здесь не пересчитывается.

## Б. Происхождение append-ошибки

Основание — требование сохранить object behavior и overlay appended **keys**,
плюс полученный исходный код: `Object.assign(receiver.query, incoming.query)`
переносит собственный enumerable ключ даже со значением undefined;
`stringifyQuery` позже исключает его из строки. Поэтому `{}` сохраняет старое
значение, а `{drop: undefined}` заменяет его и убирает из публичного URL.
Для params-backed receiver нужен тот же оговорённый публичный результат,
не такое же внутреннее объектное представление. [Сохранённый post-hoc check](../evaluation/append-compatibility.test.ts)
проверяет href, path/hash и сохранение unrelated key. Reference не является
источником этого требования; обе calibration solutions сами пропускают случай.

| Попытка | Первая реализация и последующие изменения | Что действительно проверено |
|---|---|---|
| **P/r1** | **P1/27**, `call_9B0Jv7dJwjXOOCCs03QtAGAb`: `new URLSearchParams(stringifyQuery(url.query))` → `new Set(appendedQuery.keys())` → фильтрация receiver → добавление entries. Undefined потерян до выбора replacement keys уже в первой правке. P1/75 меняет searchParams narrowing; 76 переименовывает локальные переменные append, 77 меняет аргумент Object.assign; ошибочный порядок остаётся. | Прочитаны оба ключевых исходных участка до реализации. Добавленный append regression использует обычные строки, не собственный undefined key. Автор не выполнил runtime/type/lint/build. Evaluator: runtime/type и build проходят, lint — четыре prefer-spread errors, append post-hoc падает. [n05 review](../reviews/n05.json). |
| **Hbase/r1** | **H1/32**, `call_MhVzfwks9MH6k1ycw3xIHPPC`: сначала `Object.keys(url.query)` или params keys; затем отбор receiving entries; затем сериализация incoming values и append. Правильный порядок с первой реализации. Последующее изменение `src/url.ts` (89) — JSDoc; append не переписывался. | Авторский params-backed append test со строками проходит в focused suite, но не различает undefined/absent. Первого append failure или исправления после него нет. Отдельное доказательство own-undefined — только evaluator post-hoc; original project gates проходят. [n12 review](../reviews/n12.json). |
| **P/r2** | **P2/29**, `call_pYeODpGXPqiOl1HNZ9pmIJPT`: сначала keys объекта/params, затем фильтрация receiver, затем пропуск undefined при сериализации значений. Правильно сразу. P2/73,78 добавляют guards и object casts; порядок сохраняется. P2/97 заменяет Object.assign в отдельной object branch на spread ради no-mutation, 98 добавляет соответствующий regression. | Автор выполняет string-valued append и object no-mutation regressions, но сочетания params receiver + incoming own undefined в них нет. Post-hoc evaluator подтверждает именно его; все project gates проходят. Успешные проверки идут **после** правильного key selection и не объясняют его появление. [n08 review](../reviews/n08.json). |
| **Hbase/r2** | **H2/34**, `call_PLD7OFMemJxn5HatHTRwKN5L`: преобразует object incoming через stringifyQuery в params, затем выбирает keys. Ошибка та же, что P1, сразу. H2/46 удаляет unused import и переносит условие по строкам; семантика append не меняется. Последние 52/54 меняют utils docs/type alias. | Авторские tests уже записаны (33), включая preconditions и immutability, но не выполнены. Они не содержат различающего undefined append. Evaluator позже: runtime assertions проходят, source typing и formatter падают; append post-hoc тоже падает. Это прерванная работа, а не намеренное принятие дефектов. [n06 review](../reviews/n06.json). |

Все четыре получили исходный код `stringifyQuery`, `append`, `withQuery` и
публичные tests до первой production-правки. Нет свидетельства утраты нужных
строк через truncation. В неуспешных вариантах **реализация** точно теряет
информацию о наличии ключа. Видимые сообщения обещают сохранить object edge
cases, но не объясняют именно own-undefined append; утверждать сознательную
неверную интерпретацию этого сочетания нельзя. Почему одна и та же модель
выбрала разные способы key selection, не установлено.

Ни в одной из четырёх сохранённых авторских bash-команд нет отдельного временного
API probe для own-undefined append. Исходные object edge tests и обычный append
test по отдельности не различают их комбинацию. Поэтому разделены три свойства:
H1/P2 имеют правильный append и успешные project checks, но **не имеют авторской
различающей регрессии именно этого случая**; P1/H2 не имеют ни такой регрессии,
ни правильной реализации. Исторический Q при этом не пересчитывается.

**H2 types/format timeline.** Ошибочный cast nested array в одиночный tuple
в `withQuery.flatMap` введён H2/34 и сохранён до terminal snapshot
`21f83022…`. Он объясняет evaluator errors в final `src/utils.ts:383,389,397`.
`test/url.test.ts` создаётся в 33, query/utils implementation в 34;
46 вручную правит оформление, но не выполняет Prettier и не чинит tuple cast.
Evaluator позднее отмечает форматирование query/utils/url.test. По traces нельзя
приписать первому появлению каждой formatting complaint timestamp запуска
formatter: его не было. `git diff --check` в 42/49 не проверяет Prettier или типы.
Перед denial автор продолжал правки и поиск tooling, но **не видел эти
runner diagnostics**, и наблюдаемого целевого ремонта tuple type errors нет.
Terminal n06 остаётся Q=false/T=false; дальнейшая возможная судьба не предсказывается.

## В. Конкурирующие объяснения

| Объяснение | Статус и ближайшая проверенная альтернатива |
|---|---|
| Недостаток доступного семантического контекста | **Опровергнуто для необходимых append строк:** полный task и исходные операции получены до edit. Альтернатива «получил, но не совместил два факта» совместима с действиями; внутреннее понимание не наблюдается. |
| Контекст получен, решение семантически неверно | **Подтверждено для результата P1/H2**, не для скрытого мотива: serializing-before-key-selection наблюдается прямо. Альтернатива «ошибка возникла при позднем cleanup» опровергнута первыми patches. |
| Рабочий путь проверки существовал, но не выбран | **Подтверждено P1; сильно поддержано H2.** P1 уже получил успешный runner version и запустил его для install. H2 получил scripts/npm, но не ancestor route; его работоспособность показана H1 и исходным manifest/layout, а не отдельным историческим запуском H2. «Модель знала точную команду» для H2 не установлено. |
| Исходная среда непригодна | **Опровергнуто как общее объяснение:** H1/P2 запускают проверки. **Подтверждены более узкие ограничения:** bare pnpm не в PATH, H delivery не имеет собственного node_modules, сеть закрыта. Необходимости устанавливать зависимости для checks не подтверждено. |
| Автор изменил окружение | **Подтверждено P1:** recreation, worker failure, исчезновение binaries; одинаковый исходный hash этого не отменяет. Для H1/P2/H2 dependency mutation не наблюдается. Альтернатива «binaries отсутствовали изначально» для P1 опровергнута. |
| Существенный failure был получен и неверно понят | **Частично:** P1 обобщил command-not-found до отсутствия pnpm; пустой glob усугубил это. H1/P2 реальные lint/type/format failures использовали для исправления. **Опровергнуто** утверждение, что H2 проигнорировал известные type/format errors: это diagnostics оценщика. H2/48 — неоднозначный version вызов, не доказательство ложного tool output. |
| Нет проверки нужной комбинации входов | **Подтверждено во всех четырёх авторских suites** для own-undefined + params-backed append. Ближайшая альтернатива «green tests доказывают этот overlay» опровергается n05/n06 и отдельным post-hoc check. Правильный H1/P2 не был вызван таким тестом. |
| Harness создал специфическое препятствие | **Подтверждён вклад layout и terminal policy**, но не невозможность checks: H1 работает из такого же nested cwd. Native cache denial задан config; harness делает его terminal. Альтернатива «одинаковые ресурсы означают одинаковые permissions» отвергнута. Вред именно дополнительного prompt не установлен. |
| Различия остаются выбором модели | **Не установлены причины выбора** initial append algorithm и перехода P1 от version к install. Это остаточная неопределённость, а не объяснение всех уже наблюдаемых механизмов. Четыре связанные попытки не идентифицируют причинный эффект всего harness. |

## Г. Одна гипотеза следующего изменения

**Гипотеза:** после первого завершённого native Bash с exit 127 и отсутствующим
проектным package-manager executable дать один компактный, привязанный к cwd
и текущей установке факт о доступном способе запуска объявленного script.
Это уменьшит ненужные install/cache-поиски и позволит раньше получить реальные
project diagnostics, повышая шанс полной поставки.

- **Точка вмешательства:** H2/26 (до glob/registry/cache-петли), P1/29–31
  (до install); полезный положительный образец — P2/34 → 38 и H1/55 → 56.
  Не каждый nonzero exit: assertion/type/lint failure должен остаться обычным
  diagnostic, не превращаться в «environment problem».
- **Минимальный пользовательский путь:** дополнительный короткий блок к
  существующему native command-result с declared script, cwd, отсутствующим
  bare executable и подтверждённым локальным route. Для этой среды кандидаты —
  локальный pnpm в plain checkout и `npm run lint`/`npm run build` либо
  `npm exec -- …` в nested delivery cwd. Сохраняются сами project scripts,
  lifecycle hooks и checks; никакого автоматического install, retry, вызова
  модели или продолжения после denial. Автор выбирает и запускает команду.
- **Какие новые сведения:** не повтор package.json, который все уже прочитали,
  а различение PATH lookup, local/ancestor installed executable и cache-only
  каталога, с provenance/версиями и явным `unverified`, если путь нельзя
  подтвердить. Только разрешённые project facts и существующий механизм
  project-command observation; любые дополнительные resolution-команды проходят
  обычный native permission путь. Чужие каталоги/кеш и denied paths не сканируются.
  Ни одного предположения «каталог node_modules существует, значит всё готово».
- **Почему не включить готовый B:** текущий `selectProjectCheck` в
  `lib/native-project-checks.mjs` выбирает `${manager} run …` из packageManager;
  для этой задачи это всё тот же bare pnpm. Простое включение CHECKS не даёт
  наблюдавшийся недостающий факт. Доработка должна быть малой и условной;
  не нужен полный manifest на каждый старт, новый reviewer или дополнительный проход.
- **Почему не evaluator answer:** используются только task-independent package
  scripts, версия runner, cwd и разрешённое состояние установки. Никаких UFO,
  drop, benchmark names, URL или решения append в reusable runtime.
- **Локальная положительная проверка для будущей разработки:** обычный проект
  с pinned локальным manager вне PATH; второй layout — native nested worktree
  с intact ancestor dependencies. После намеренного bare-command failure
  факт должен назвать действительный route, его запуск должен дойти до
  специально внесённой lint/type ошибки. Один version/exit 0 успехом проверки
  не считать. Подтвердить неизменность dependencies и отсутствие сетевых вызовов.
- **Отрицательный контроль:** такой же package.json и directory name, но
  только cache либо отсутствующий/неподходящий runner; вывод обязан остаться
  `unverified/unavailable`, не предлагать install и не утверждать готовность.
  При уже работающей команде или реальном assertion failure блок не появляется.
  Denied resolution ничего не расширяет и не запускает обходной путь.
- **Что опровергнет гипотезу:** в отдельно разрешённом последующем сравнении
  авторы получают точный route, но по-прежнему выбирают install/cache-поиск,
  либо достигнутые checks не уменьшают незавершённые поставки и добавленные
  ложные подсказки/затраты съедают пользу. Даже сокращение поисковых команд
  без улучшения полной поставки не подтверждает исходную продуктовую цель.

Семантическая append-ошибка остаётся явным ограничением этой гипотезы:
даже рабочие оригинальные tests её не ловят. Выбран путь с наблюдаемыми
полезными failures и успешными исправлениями, а не обещание автоматически
сгенерировать отсутствующий cross-case regression. Ни этот механизм, ни
новая кампания данным отчётом не внедряются и не назначаются.

## Проверка и пределы результата

Повторно использованы сохранённые project/evaluator logs и четыре
[reviews](../reviews); новых task-runs, model probes/retries, scripted-provider
sessions и запросов Luna/OpenAI из исследования — **0**. Работа текущего
аналитического агента вне исторического ledger, отдельно и без оценки стоимости.

Новый маленький [extractor](extract-events.py) только читает четыре архива:

```sh
python3 development/native-task-integrated/trajectory-analysis/extract-events.py \
  local/native-task-integrated P1/27 H1/32 P2/29 H2/34 H2/57
```

Он не запускает сохранённые команды и не извлекает reasoning/provider streams.
Сверены task receipt, native-output receipt, порядок правок, final artifact
bindings и локальные ссылки отчёта. Post-hoc append остаётся post-hoc;
calibration gap и старые оценки не переписаны. Скрытые рассуждения не
используются для объяснения мотивов.

Попытка проверить наличие сохранённого Docker image не дошла до локального
исполнения: после снятия sandbox-ограничения read-only команды daemon оказался
недоступен. Новая проверка command resolution в точной Linux-среде **не выполнена**;
daemon не запускался, dependencies не устанавливались. Поэтому H2 working-route
вывод опирается на сохранённый H1 execution и исходный layout, с указанной выше
границей уверенности. Full verifier/containment заново не диагностировались.
CI, production и модельный lift этим анализом не подтверждаются.
