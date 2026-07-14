export async function executeTask(task, { signal, tracker }) {
  tracker.active += 1;
  return Promise.resolve()
    .then(task)
    .then((value) => {
      tracker.active -= 1;
      return value + 1;
    });
}
