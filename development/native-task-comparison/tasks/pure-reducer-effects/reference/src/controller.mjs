import {reduceCounter} from './counter-core.mjs';
export function createCounter(initialValue,{persist,notify}){
 let state={value:initialValue,savedValue:initialValue};
 return {getState(){return {...state};},dispatch(event){const transition=reduceCounter(state,event);state=transition.state;for(const effect of transition.effects){if(effect.type==='persist')persist(effect.value);else notify(effect.event);}return {...state};}};
}
