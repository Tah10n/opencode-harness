Основная задача — исследовать указанное изменение поведения и проверить,
различают ли его обычные проектные тесты.

Постарайся найти небольшой сценарий через публичный API, на котором
текущая реализация и указанный вариант ведут себя по-разному.
Ожидаемое поведение обоснуй исходным контрактом, а не тем,
какая реализация сейчас проходит тесты.

Если различие затрагивает требуемое свойство, добавь переносимую регрессию
в обычную suite. Выполни один и тот же тест на текущем коде и варианте
через harness_sense/replay, затем проверь сохранённое поведение.

Если различие допустимо по контракту, объясни основание и не добавляй
искусственный assertion. Если различающий пример не найден,
сообщи об ограничении — не объявляй эквивалентность доказанной.

Production-код, зависимости и смысл старых assertions не изменяй.
Если обнаружишь ошибку самой текущей реализации, сохрани наблюдение
и сообщи о ней, но не подменяй исследование её ручной правкой.

Результат — обычный проектный test patch либо обоснованное отсутствие
необходимости в нём, с фактически выполненными проверками.
Общий review всей реализации и повторное оформление документации
не являются основной работой этого задания.

## Полный исходный пользовательский контракт

Add removeWhere(predicate): number. Visit the initially present values once in logical front-to-back order, calling predicate(value, index) with zero-based original indexes. Remove values for which the predicate returns truthy, retain all others in order, and return the count removed. Determine all matches before mutation: if predicate throws, propagate the same error and leave the deque unchanged. Reject non-function predicates with an Error even for an empty deque. Reentrant mutation from inside predicate is outside the guaranteed contract. Support wrapped/capacity-limited queues, duplicate and falsy values, preserve value identity and capacity, and leave all existing operations and APIs compatible. Supply types, regression tests and API docs.

Required delivered regression scenarios:
- Predicate sees original indexes and values in order; mixed/none/all matches give the correct count and survivor order.
- Predicate throwing after an earlier match leaves every original entry intact; non-function is rejected on empty too.
- Wrapped/capacity queues with duplicates/falsy values stay usable and preserve capacity after filtering.

Deliver implementation, ordinary project regression tests, applicable public TypeScript declarations/type tests, and README/API documentation. Preserve existing independent regression scenarios and all behavior not explicitly changed. Use the project test tools; run relevant checks after the last edit and report what actually ran and any limitations. A different valid implementation or test organization is acceptable. Do not commit, publish, or change dependencies merely to make a check pass. The supported evaluation platform is Linux arm64, Node 24.19; browser deployment and other Node versions are outside this task.

## Исследуемый публичный метод

Denque.prototype.removeWhere

## Указанный вариант из обычного engine

```diff
--- a/index.js
+++ b/index.js
@@ 214:31 @@
-false
+true
```
