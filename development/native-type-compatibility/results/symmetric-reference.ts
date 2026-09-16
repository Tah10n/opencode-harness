import Old from './baseline';
import New from './reference';
declare const old: Old<{sample: [string]}, {marker: string}>;
const symmetric: New<{sample: [string]}, {marker: string}> = old;
