export function composeMail(html,attachments){return {html,parts:attachments.map(a=>({cid:a.cid,type:a.type,base64:Buffer.from(a.bytes).toString('base64')}))};}
