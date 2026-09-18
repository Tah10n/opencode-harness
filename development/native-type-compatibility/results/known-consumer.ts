import E from './index';
const e = new E<{ value: [string] }, { prefix: string }>();
const callback = (value: string) => { void value.length; };
e.on('value', callback, { prefix: 'value:' });
// The registered arrow callback ignores its receiver and is safe to call directly.
const sameCallback = e.listeners('value')[0];
sameCallback('hello');
