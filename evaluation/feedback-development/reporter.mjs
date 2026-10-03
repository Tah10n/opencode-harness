// Only native node:test events count. Console/TAP text from delivered code does not.
export default async function* report(events) {
  for await(const {type,data} of events) {
    if(['test:pass','test:fail'].includes(type)&&data.nesting===0&&/^fd[0-9]{2}\./.test(data.name))
      yield JSON.stringify({type:'obligation',id:data.name,status:type==='test:pass'&&!data.skip&&!data.todo?'PASS':'FAIL'})+'\n';
    if(type==='test:summary'&&data.file===undefined)
      yield JSON.stringify({type:'complete',counts:data.counts})+'\n';
  }
}
