import { withoutQuery } from './dist/index';
const keys: readonly string[] = ['a', 'b'];
const all: string = withoutQuery('/p?a=1');
const one: string = withoutQuery('/p?a=1', 'a');
const many: string = withoutQuery('/p?a=1', keys);
// @ts-expect-error only string inputs are public
withoutQuery(123);
// @ts-expect-error selected keys must be strings
withoutQuery('/p', [123]);
void all; void one; void many;
