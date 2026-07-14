export function createManagedClient(factory) {
  const resource = factory();
  let opened = false;
  let closed = false;
  return {
    async start() {
      try {
        await resource.open();
        opened = true;
        return resource.value;
      } catch (error) {
        if (!closed) {
          closed = true;
          await resource.close();
        }
        throw error;
      }
    },
    async stop() {
      if (!opened || closed) return;
      closed = true;
      await resource.close();
    },
  };
}
