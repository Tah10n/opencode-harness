export function createManagedClient(factory) {
  const resource = factory();
  return {
    async start() {
      await resource.open();
      return resource.value;
    },
    async stop() {
      await resource.close();
    },
  };
}
