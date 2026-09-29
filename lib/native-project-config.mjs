// Flag parsing has no discovery, compiler, filesystem or check dependencies.
export function componentFlags(env = process.env) {
  const flag = key => {
    const value = env[key] ?? '0';
    if (!['0', '1'].includes(value)) throw Error(key + ' must be 0 or 1');
    return value === '1';
  };
  return {A: flag('HARNESS_TASK_CONTEXT'), B: flag('HARNESS_TASK_CHECKS')};
}
