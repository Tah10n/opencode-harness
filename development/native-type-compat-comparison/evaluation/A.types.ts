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
type IsAny<T> = 0 extends (1 & T) ? true : false;
e.subscribe('message', function(s, n) {
 const a: IsAny<typeof s> = false; const b: IsAny<typeof n> = false;
 const receiver = this; const c: IsAny<typeof receiver> = false;
 const context: {tag: string} = this;
 s.toUpperCase(); n.toFixed(); this.tag.toUpperCase();
 // @ts-expect-error wrong property on typed context
 this.absent();
});
