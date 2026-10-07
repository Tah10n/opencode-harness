const {validName}=require('./names.cjs');
class Registry {
 constructor() { this.plugins=new Map(); }
 register(plugin) {
  if(!validName(plugin?.name)||typeof plugin.run!=='function')throw new TypeError('plugin');
  if(this.plugins.has(plugin.name))throw new Error('duplicate name');this.plugins.set(plugin.name,plugin);return this;
 }
 list() { return [...this.plugins.keys()]; }
 execute(name,input,callback) {
  const plugin=this.plugins.get(name);if(!plugin){callback(new Error('unknown plugin'));return;}
  try { plugin.run(input,callback); }catch(error) { callback(error); }
 }
 unregister(name) { return this.plugins.delete(name); }
}
exports.Registry=Registry;
