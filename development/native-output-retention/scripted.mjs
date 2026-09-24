// Deterministic local Responses transport. Never opens an upstream connection.
export function responseBytes(body, sequence, call) {
 const id='resp_retention_'+sequence;
 const item=call?{id:'fc_'+sequence,type:'function_call',call_id:'call_retention_'+sequence,name:call.name,arguments:JSON.stringify(call.args),status:'completed'}:{id:'msg_'+sequence,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Scripted fixture finished.',annotations:[]}]};
 const base={id,object:'response',created_at:1,model:body.model,status:'in_progress',output:[]};
 const rows=[{type:'response.created',response:base},{type:'response.output_item.added',output_index:0,item:call?{...item,arguments:'',status:'in_progress'}:{...item,content:[],status:'in_progress'}}];
 if(call)rows.push({type:'response.function_call_arguments.delta',item_id:item.id,output_index:0,delta:item.arguments});
 else rows.push({type:'response.content_part.added',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:item.content[0].text});
 rows.push({type:'response.output_item.done',output_index:0,item},{type:'response.completed',response:{...base,status:'completed',output:[item],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}});
 return Buffer.from(rows.map(e=>'data: '+JSON.stringify(e)+'\n\n').join(''));
}
export const config={model:'openai/gpt-5.6-luna',small_model:'openai/gpt-5.6-luna',provider:{openai:{options:{baseURL:'http://127.0.0.1:4099/v1',apiKey:'scripted-not-a-credential'},models:{'gpt-5.6-luna':{options:{reasoningEffort:'high'},variants:{high:{reasoningEffort:'high'}}}}}},permission:{external_directory:'deny',webfetch:'deny'}};
export const longCommand="node -e 'for(let i=0;i<5000;i++)console.log((i===0?\"BEGIN\":i===2500?\"HIDDEN_MIDDLE\":i===4999?\"END\":\"LINE\")+\":\"+i+\":\"+\"x\".repeat(60))'";
