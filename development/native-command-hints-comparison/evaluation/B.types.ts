import E, { EventEmitter } from './index';
const token: unique symbol = Symbol();
type Events = { message: [string, number]; empty: []; [token]: [boolean] };
const e = new E<Events, { tag: string }>();
const cancel: () => void = e.subscribe('message', (s, n) => { s.toUpperCase(); n.toFixed(); }, {tag:'ok'});
const result: void = cancel();
e.subscribe('empty', () => {});
e.subscribe(token, value => { const v: boolean = value; void v; });
new EventEmitter<Events>().subscribe('message', (s, n) => { s.toUpperCase(); n.toFixed(); });
// @ts-expect-error unknown event
e.subscribe('missing', () => {});
// @ts-expect-error incorrect callback parameter
e.subscribe('message', (s: number) => {});
// @ts-expect-error incorrect context
e.subscribe('empty', () => {}, { tag: 123 });
// @ts-expect-error cancellation is callable, not the emitter
cancel.emit('empty');
void result;
