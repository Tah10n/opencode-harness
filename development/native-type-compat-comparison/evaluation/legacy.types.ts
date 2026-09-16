import E, {EventEmitter} from './index';
const e = new E<{sample: [string]}, {marker: string}>();
const callback = e.listeners('sample')[0]; callback('old');
const named = new EventEmitter<{sample: [string]}>(); named.listeners('sample').forEach(fn => fn('old'));
e.on('sample', s => s.toUpperCase(), {marker:'ok'}).once('sample', s => s.toUpperCase()).emit('sample','ok');
// @ts-expect-error wrong legacy event argument
e.emit('sample',123);
