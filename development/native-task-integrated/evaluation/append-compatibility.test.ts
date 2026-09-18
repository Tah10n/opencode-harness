// Post-run verification of the already-declared append overlay contract.
// Calibration solutions are checked unchanged and may also fail this case.
import {test, expect} from 'vitest';
import {$URL} from './src';
test('original object append removes an existing key assigned undefined', () => {
 const receiver=new $URL('/base?drop=old&keep=ok#old');
 const incoming=new $URL('child#new');incoming.query={drop:undefined};
 receiver.append(incoming);
 expect(receiver.href).toBe('/base/child?keep=ok#new');
});
test('params-backed append preserves the same key-removal overlay', () => {
 const receiver=new $URL('/base#old');receiver.query=new URLSearchParams('drop=old&keep=ok');
 const incoming=new $URL('child#new');incoming.query={drop:undefined};
 receiver.append(incoming);
 expect(receiver.href).toBe('/base/child?keep=ok#new');
});
