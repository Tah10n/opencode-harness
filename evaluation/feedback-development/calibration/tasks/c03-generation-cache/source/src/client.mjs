export class Client {
 constructor(cache) { this.cache=cache; }
 async loadMany(keys,options) { return Promise.all(keys.map(key=>this.cache.get(key,options))); }
}
