export function childHeaders(incoming,allowed,newTraceId,newSpanId){return {traceparent:'00-'+newTraceId+'-'+newSpanId+'-00'};}
