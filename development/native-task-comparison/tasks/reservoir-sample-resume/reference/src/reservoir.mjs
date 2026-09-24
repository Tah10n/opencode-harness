const clone=value=>JSON.parse(JSON.stringify(value));
const uint=x=>Number.isInteger(x)&&x>=1&&x<=4294967295;
function validate(state){if(state.version!==1||!Number.isInteger(state.capacity)||state.capacity<1||state.capacity>1000||!Number.isInteger(state.count)||state.count<0||state.count>1000000||!uint(state.rng)||!Array.isArray(state.sample)||state.sample.length!==Math.min(state.capacity,state.count))throw new TypeError('snapshot');}
function nextRandom(x){x^=x<<13;x^=x>>>17;x^=x<<5;return x>>>0;}
function make(initial){
 const state=clone(initial);
 function addAll(values){if(state.count+values.length>1000000)throw new RangeError('count');const copied=clone(values);for(const value of copied){state.count++;if(state.sample.length<state.capacity)state.sample.push(value);else{state.rng=nextRandom(state.rng);const slot=Math.floor(state.rng/4294967296*state.count);if(slot<state.capacity)state.sample[slot]=value;}}}
 return{add(value){addAll([value]);},addAll,values(){return clone(state.sample);},snapshot(){return clone(state);}};
}
export function createReservoir(capacity,seed=1){const initial={version:1,capacity,count:0,rng:seed,sample:[]};validate(initial);return make(initial);}
export function restoreReservoir(snapshot){validate(snapshot);return make({version:1,capacity:snapshot.capacity,count:snapshot.count,rng:snapshot.rng,sample:snapshot.sample});}
