# abortable-delay-consumer

delay returns a Promise resolving undefined after its timer callback. Integer ms bounds are0..1000000; invalid durations reject before work. Optional native signal rejects with signal.reason; pre-abort schedules nothing. Active abort clears its opaque handle (including0) once and removes listener; success removes listener without clearing completed timer. Stale callbacks/late abort do nothing. Timers are individually injectable or global defaults, nonthrowing/deferred/nonreentrant. Calls are independent; no polling or retry. Run npm test.
