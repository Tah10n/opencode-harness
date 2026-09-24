"""Bind a bounded action trace to native receipts and actual subsequent requests."""
import hashlib
import json
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
DEV=ROOT/'development/direct-assertion-review/model-pair'
LOCAL=ROOT/'local/direct-assertion-review-model-pair'
get=lambda p:json.loads(p.read_text())
hashbytes=lambda b:hashlib.sha256(b).hexdigest()
for arm in ['AR0','AR1']:
    run=LOCAL/'batch/runs'/('account-switch-ledger-'+arm)
    if not (run/'native-evidence.json').exists():continue
    native=get(run/'native-evidence.json');requests=[(int(p.stem.split('-')[1]),p,get(p)) for p in sorted(run.glob('request-*.json'),key=lambda p:int(p.stem.split('-')[1]))]
    initial=None;visible=[];seen=set()
    for number,p,body in requests:
        for item in body.get('input',[]):
            content=item.get('content')
            if not isinstance(content,list):continue
            for part in content:
                text=part.get('text','')
                if initial is None and 'Implement the complete original task below' in text:
                    initial=dict(request=number,sha256=hashbytes(p.read_bytes()),fullTask=(DEV/'TASK.md').read_text().strip() in text,newBlock='During self-review,' in text,toolInventory=[t['name'] for t in body.get('tools',[])])
                if item.get('role')=='assistant' and text not in seen and re.search(r'obsolet|truncat|supersed|assertion|preserv|requirement',text,re.I):
                    seen.add(text);visible.append(dict(firstRequest=number,text=text[:2500],fullTextSha256=hashbytes(text.encode())))
    events=[];tools=native['tools']
    for index,t in enumerate(tools):
        data=t['data'];state=data.get('state',{});args=state.get('input',{});output=state.get('output','');patch=args.get('patchText','');command=args.get('command','')
        labels=[]
        if data['tool']=='bash' and re.search(r'2026-08-10.*2026-08-11|truncat',output,re.S|re.I) and state.get('metadata',{}).get('exit') not in [None,0]:labels.append('observed-related-failure')
        if patch and re.search(r'truncated\.entries|afterTrunc|truncat',patch,re.I) and 'test/' in patch:labels.append('related-test-edit')
        if data['tool']=='bash' and 'node --test' in command and ('readers.test' in command or re.search(r'ledger|account|switch',command,re.I)):labels.append('public-test-execution')
        if not labels:continue
        call=data.get('callID');delivery=None
        for number,p,body in requests:
            found=next((x for x in body.get('input',[]) if x.get('type')=='function_call_output' and x.get('call_id')==call),None)
            if found is not None:
                out=found['output'] if isinstance(found['output'],str) else json.dumps(found['output'],ensure_ascii=False)
                delivery=dict(firstRequest=number,bytes=len(out.encode()),sha256=hashbytes(out.encode()),requestSha256=hashbytes(p.read_bytes()));break
        excerpt=output[-700:] if data['tool']=='bash' else patch[:1800]
        events.append(dict(nativeIndex=index,partID=t['id'],sessionID=t['session_id'],callID=call,tool=data['tool'],labels=labels,command=command or None,inputSha256=hashbytes(json.dumps(args,sort_keys=True).encode()),exit=state.get('metadata',{}).get('exit'),receiptBytes=len(output.encode()),receiptSha256=hashbytes(output.encode()),delivery=delivery,excerpt=excerpt,nextNativeAction=dict(partID=tools[index+1]['id'],tool=tools[index+1]['data']['tool']) if index+1<len(tools) else None))
    payload=dict(arm=arm,initialAuthorRequest=initial,selectedEvents=events,visibleAssistantStatements=visible,scope='Selected native tool outputs, actual next request receipts and subsequent actions only. No attribution from instruction presence; raw provider SSE absent. Full outputs remain private, with linked spill files where present.')
    (DEV/(arm+'-trajectory.json')).write_text(json.dumps(payload,indent=2)+'\n')
    print(arm,len(events),'selected events',len(visible),'visible statements')
