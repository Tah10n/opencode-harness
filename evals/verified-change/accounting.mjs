// Only completed prompt metadata is available. Never impute missing usage as zero.
export function accountArm(arm){
 const prompts=arm.completedPromptUsage??arm.report?.usage??(arm.usage?[arm.usage]:[]);
 const values={steps:[],toolCalls:[],tokens:[],input:[],output:[],reasoning:[],cacheRead:[],cacheWrite:[],providerCost:[]};
 const add=(key,value)=>{if(Number.isFinite(value))values[key].push(value);};
 for(const prompt of prompts){add('steps',prompt.steps);add('toolCalls',prompt.toolCalls);for(const step of prompt.usage??[]){for(const [key,value] of Object.entries({tokens:step.tokens?.total,input:step.tokens?.input,output:step.tokens?.output,reasoning:step.tokens?.reasoning,cacheRead:step.tokens?.cache?.read,cacheWrite:step.tokens?.cache?.write,providerCost:step.cost}))add(key,value);}}
 const metadataComplete=prompts.length>0&&prompts.every(p=>Number.isFinite(p.steps)&&Number.isFinite(p.toolCalls)&&Array.isArray(p.usage)&&p.usage.length===p.steps&&p.usage.every(s=>[s.tokens?.total,s.tokens?.input,s.tokens?.output,s.tokens?.reasoning,s.tokens?.cache?.read,s.tokens?.cache?.write,s.cost].every(Number.isFinite)));
 return {wallMs:arm.elapsedMs??null,budgetMs:arm.budgetMs??null,completedPrompts:prompts.length,usageComplete:arm.status==='completed'&&metadataComplete,observed:Object.fromEntries(Object.entries(values).map(([key,numbers])=>[key,numbers.length?numbers.reduce((a,b)=>a+b,0):null])),limitations:['Interrupted prompt usage may be absent; observed values are not complete costs.','Provider cost=0 is metadata, not evidence of free execution.','Wall time includes setup and cleanup; those phases are not separately measured.']};
}
