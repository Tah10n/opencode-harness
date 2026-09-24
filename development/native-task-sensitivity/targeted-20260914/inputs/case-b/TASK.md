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

Add getOrInsertComputed(key, factory): ValueType. If a non-expired entry exists, return it without calling factory and refresh recency exactly as get does, including stored undefined. Otherwise synchronously call factory(key) once, insert its returned value with the cache default maxAge, and return it. If factory throws, propagate the same error and leave the absent key uninserted. Treat expired entries as misses and preserve their normal eviction notification. Support object keys and independent caches. Preserve existing get/set/peek/has, expiry, iteration, size and eviction contracts. Reentrant factory mutations are outside this addition's guaranteed behavior. Extend public declarations and type tests with key/value inference and invalid factory return type rejection.

Required delivered regression scenarios:
- A hit including undefined never calls factory; an old-generation hit refreshes recency as get.
- Expired entry calls factory, notifies expiration once, and inserted value uses default TTL.
- Throwing factory leaves no entry and preserves reason; object-key identity and separate caches remain independent.

Deliver implementation, ordinary project regression tests, applicable public TypeScript declarations/type tests, and README/API documentation. Preserve existing independent regression scenarios and all behavior not explicitly changed. Use the project test tools; run relevant checks after the last edit and report what actually ran and any limitations. A different valid implementation or test organization is acceptable. Do not commit, publish, or change dependencies merely to make a check pass. The supported evaluation platform is Linux arm64, Node 24.19; browser deployment and other Node versions are outside this task.

## Исследуемый публичный метод

QuickLRU.getOrInsertComputed

## Указанный вариант из обычного engine

```diff
--- a/index.js
+++ b/index.js
@@ 121:6 @@
-this.#cache.has(key)
+false
```
