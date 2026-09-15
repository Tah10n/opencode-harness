// Offline calibration only. Not installed or exposed to a measured task.
export const implementations = {
 'quick-lru-take': {
  reference: `\ttake(key) {\n\t\tif (!this.has(key)) {\n\t\t\treturn undefined;\n\t\t}\n\n\t\tconst value = this.peek(key);\n\t\tthis.delete(key);\n\t\treturn {value};\n\t}\n\n`,
  alternative: `\ttake(key) {\n\t\tconst item = this.#cache.get(key) ?? this.#oldCache.get(key);\n\t\tif (!item || this.#deleteIfExpired(key, item)) {\n\t\t\treturn undefined;\n\t\t}\n\n\t\tthis.delete(key);\n\t\treturn {value: item.value};\n\t}\n\n`,
  wrong: [`\ttake(key) { const value = this.peek(key); this.delete(key); return value === undefined ? undefined : {value}; }\n`, `\ttake(key) { if (!this.has(key)) return undefined; const value = this.get(key); this.delete(key); return {value}; }\n`], anchor:'\tset(key, value, {maxAge = this.#maxAge} = {}) {'
 },
 'denque-drain': {
  reference: `Denque.prototype.drain = function drain(count) {\n  if (count === undefined) count = this.size();\n  if (typeof count !== 'number' || count < 0 || count === Infinity || Math.floor(count) !== count) throw new RangeError('Invalid count');\n  var length = Math.min(count, this.size()), result = new Array(length);\n  for (var i = 0; i < length; i++) result[i] = this.shift();\n  return result;\n};\n\n`,
  alternative: `Denque.prototype.drain = function drain(count) {\n  if (count === undefined) count = this.length;\n  if (typeof count !== 'number' || !isFinite(count) || count < 0 || count % 1 !== 0) throw new RangeError('Invalid count');\n  var result = [];\n  while (result.length < count && this.length) result.push(this.shift());\n  return result;\n};\n\n`,
  wrong: [`Denque.prototype.drain = function(count) { var r=[],v; while ((count === undefined || r.length < count) && (v=this.shift()) !== undefined) r.push(v); return r; };\n`, `Denque.prototype.drain = function(count) { count=count===undefined?this.length:Math.floor(count); var r=[];while(r.length<count&&this.length)r.push(this.shift());return r; };\n`],anchor:'Denque.prototype.unshift = function unshift(item) {'
 },
 'eventemitter-collect': {
  reference: `EventEmitter.prototype.emitCollect = function emitCollect(event) {\n  var evt = prefix ? prefix + event : event, entry = this._events[evt], result = [];\n  if (!entry) return result;\n  var listeners = entry.fn ? [entry] : entry.slice(), args = Array.prototype.slice.call(arguments, 1);\n  for (var i = 0; i < listeners.length; i++) {\n    var listener = listeners[i];\n    if (listener.once) this.removeListener(event, listener.fn, listener.context, true);\n    result.push(listener.fn.apply(listener.context, args));\n  }\n  return result;\n};\n\n`,
  alternative: `EventEmitter.prototype.emitCollect = function emitCollect(event) {\n  var entry=this._events[prefix ? prefix+event : event], args=Array.prototype.slice.call(arguments,1), self=this;\n  if (!entry) return [];\n  return (entry.fn ? [entry] : entry.slice()).map(function(listener) {\n    if(listener.once)self.removeListener(event,listener.fn,listener.context,true);\n    return listener.fn.apply(listener.context,args);\n  });\n};\n\n`,
  wrong: [`EventEmitter.prototype.emitCollect=function(event){var args=Array.prototype.slice.call(arguments,1);return this.listeners(event).map(function(fn){return fn.apply(null,args);});};\n`, `EventEmitter.prototype.emitCollect=function(event){this.emit.apply(this,arguments);return [];};\n`],anchor:'EventEmitter.prototype.on = function on(event, fn, context) {'
 }
};
