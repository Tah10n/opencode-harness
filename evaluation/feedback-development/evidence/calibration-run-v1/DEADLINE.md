# Отдельная проверка deadline

В [seal CI 37451496974](https://github.com/Tah10n/opencode-harness/actions/runs/37451496974)
direct fixture завершился с `Termination not verified`; затем `installed.mjs`
прочитал отсутствующий `result.json`, скрыв первичную диагностику за ENOENT.
Лог не содержит значения `finished.termination` или watchdog receipt, поэтому
причина прежнего FAIL остаётся **UNRESOLVED**. Host Node в CI был 24.21.0;
текущий host — 24.19.0, контейнерный Node — 24.19.0. Последующий зелёный CI
не используется как объяснение сбоя.

Ограничение исследования было определено до новых inference: две пары исходного
пятисекундного direct/D fixture на неизменных байтах, одна проверка detached
descendants и containment существующим verify-output-boundaries, один отдельный
busy-event-loop контроль, затем один installed P/H0/H1 контроль с тремя
deadline случаями для подготовленной конфигурации. Повторов до успеха и реальных
provider calls не было. Все семь installed deadline случаев подтвердили
остановку, закрытие forwarding, отсутствие provider handlers и удаление
контейнера. В busy контроле worker остановил четыре процесса по трёхсекундному
fixture deadline, пока главный event loop был заблокирован на шесть секунд.
Это технический fixture, а не изменение 600-секундного бюджета модели.

Байты native-run, deadline-stop, stop-workload, container session/relay и тела
scheduler.runComparison сохранены. Подтверждение остановки не ослаблено. В
fixture добавлена только первичная диагностика при отсутствии result.json.
Неподтверждённое завершение по-прежнему закрывает admission; существующий
synthetic unknown-execution regression проверяет это отдельно.

Текущая блокирующая проблема завершения в этих контролях не воспроизведена.
Это допускает подготовку новой калибровки после остальных обязательных проверок
и committed seal, но не превращает прежний FAIL в случайность и не доказывает
безотказность в любом окружении. При новом termination FAIL калибровка
останавливается без дополнительных inference. Числа и границы сохранены в
[deadline-investigation.json](deadline-investigation.json).
