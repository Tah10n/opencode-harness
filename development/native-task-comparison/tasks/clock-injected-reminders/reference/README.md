# clock-injected-reminders

selectDue in reminder-core is pure and accepts explicit now; dueReminders delegates to it with one clock observation per call, including empty arrays. Default clock is Date.now selected at call time. Nonnegative safe integer time is required; invalid time throws RangeError, clock errors propagate unchanged. Enabled non-null dueAt<=now records are selected inclusively in original order/identity into a fresh array. Inputs are unchanged. No scheduling/persistence or timezone conversion. Run npm test.
