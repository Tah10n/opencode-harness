import assert from 'node:assert/strict';
import {exactMcNemar,tango95,pairedTable,planningPower} from './statistics.mjs';
const controls=[
 [0,0,1,-.036993498207,.036993498207],
 [1,0,1,-.027363433189,.054486196179],
 [5,0,.0625,.011156826883,.111750469232],
 [6,0,.03125,.020786891901,.124768154459],
 [20,5,.004077315331,.056168555848,.248823925081],
 [5,20,.004077315331,-.248823925081,-.056168555848],
 [10,10,1,-.092160266759,.092160266759],
 [50,50,1,-.192336939268,.192336939268],
 [100,0,2**(-99),.926013003586,1],
 [0,100,2**(-99),-1,-.926013003586],
];
for(const [b,c,p,lo,hi]of controls){assert.ok(Math.abs(exactMcNemar(b,c)-p)<1e-11);const ci=tango95(100,b,c);assert.ok(Math.abs(ci[0]-lo)<1e-10,JSON.stringify({b,c,ci}));assert.ok(Math.abs(ci[1]-hi)<1e-10);}
for(const both of [0,50,100])assert.deepEqual(pairedTable({both,bOnly:0,aOnly:0,neither:100-both}).ci95,tango95(100,0,0));
assert.ok(tango95(100,5,0)[0]>0&&exactMcNemar(5,0)>.05,'Retain distinction between approximate CI and exact test');
const power=planningPower();assert.ok(Math.abs(power.twoSided-.8367351211564439)<1e-12);assert.ok(Math.abs(power.positive-.8367350635371916)<1e-12);
console.log(JSON.stringify({passed:true,controls:controls.length,power,zeroDiscordance:tango95(100,0,0),realProviderRequests:0},null,2));
