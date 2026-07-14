export function createManagedClient(factory) {
  const resource = factory();
  return {
    async start() {
      await resource.open();
      return undefined;
    },
    async stop() {
      await resource.close();
    },
  };
}
