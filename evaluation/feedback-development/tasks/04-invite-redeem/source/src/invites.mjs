import fs from 'node:fs';
export class Invites {
 constructor(file) {this.file=file;if(!fs.existsSync(file))this.write({tokens:{},members:{}});}
 read() {return JSON.parse(fs.readFileSync(this.file,'utf8'));}
 write(state) {fs.writeFileSync(this.file,JSON.stringify(state));}
 create(token,team) {
  const s=this.read(); if(!token||!team||Object.hasOwn(s.tokens,token))return false;
  s.tokens[token]={team,used:false}; this.write(s); return true;
 }
 redeem(token,user,team) {
  const s=this.read(), invite=s.tokens[token]; if(!invite||invite.used)return false;
  invite.used=true; this.write(s);
  if(typeof user!=='string'||!user.trim()||invite.team!==team)return false;
  s.members[team]??=[]; if(!s.members[team].includes(user))s.members[team].push(user);
  this.write(s); return true;
 }
 revoke(token) {
  const s=this.read(); if(!Object.hasOwn(s.tokens,token))return false;
  delete s.tokens[token]; this.write(s); return true;
 }
}
