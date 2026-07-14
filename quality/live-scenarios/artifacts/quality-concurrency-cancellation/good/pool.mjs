function abortError() {
  const error = new Error("task aborted");
  error.name = "AbortError";
  return error;
}

export async function executeTask(task, { signal, tracker }) {
  if (signal?.aborted) throw abortError();
  tracker.active += 1;
  try {
    const value = await task();
    if (signal?.aborted) throw abortError();
    return value;
  } finally {
    tracker.active -= 1;
  }
}
