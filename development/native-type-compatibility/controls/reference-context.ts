// Manual new-feature control, separate from old-API compatibility and generation.
import E from './index';
const emitter = new E<{ sample: [string] }, { marker: string }>();
emitter.subscribe('sample', function (text) {
  const receiver: { marker: string } = this;
  const value: string = text;
  void receiver;
  void value;
}, { marker: 'ok' });
