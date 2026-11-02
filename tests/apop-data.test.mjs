import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Recording,convert,localTimestamp,ZeroCapture} from '../docs/apop-data.mjs';
const pressure=[{channel:1,model:'ND030D',status:'ok',pa:6894.757293},{channel:2,status:'no_response',pa:null},{channel:3,model:'ND030D',status:'ok',pa:-6894.757293}];
test('CSV freezes detected columns, units and ranges; lost sensor is blank with status',()=>{
  const r=new Recording();r.start(pressure,'PSI',[5,10,30],1000);
  r.add({time:2000,elapsed:1000,pressure});
  r.add({time:3000,elapsed:2000,pressure:pressure.map(p=>p.channel===3?{channel:3,status:'no_response',pa:null}:p)});
  r.stop();r.add({time:4000,pressure});
  const csv=r.csv();assert.equal(r.rows.length,2);assert.ok(!csv.includes('channel_2_'));
  assert.ok(csv.includes('"1.000000","ok","5"'));assert.ok(csv.includes('"-1.000000","ok","30"'));
  assert.ok(csv.includes('"","no_response","30"'));assert.ok(csv.includes('"elapsed_seconds"'));
});
test('new run replaces samples; no-sensor start preserves previous data',()=>{
  const r=new Recording();r.start(pressure,'Pa',[5,5,5]);r.add({time:Date.now(),pressure});r.stop();
  assert.throws(()=>r.start([],'PSI',[5,5,5]));assert.equal(r.rows.length,1);
  r.start(pressure,'Pa',[10,10,10]);assert.equal(r.rows.length,0);assert.equal(r.saved,false);
});
test('local timestamps have no timezone and conversion preserves sign',()=>{
  assert.equal(localTimestamp(new Date(2026,10,2,15,4,5,6)),'2026-11-02 15:04:05.006');
  assert.equal(convert(-6894.757293,'PSI'),-1);assert.equal(convert(123,'Pa'),123);
});
test('zero averages a five-second stable baseline, including a negative offset',()=>{
  const z=new ZeroCapture(5,0);let result;
  for(let t=100;t<=5000;t+=100)result=z.add({model:'ND030D',status:'ok',pa:-200+(t%200?2:-2)},t);
  assert.equal(result.offset,-200);assert.equal(result.count,50);
});
test('zero rejects a puff, slow drift, missing samples and invalid sensors',()=>{
  for(const variation of [t=>t===2500?1000:0,t=>t/100]){
    const z=new ZeroCapture(5,0);let result;
    for(let t=100;t<=5000;t+=100)result=z.add({model:'ND030D',status:'ok',pa:200+variation(t)},t);
    assert.ok(result.error.includes('not steady'));
  }
  assert.ok(new ZeroCapture(5,0).add({model:'ND030D',status:'ok',pa:0},500).error.includes('interrupted'));
  assert.ok(new ZeroCapture(5,0).add({status:'no_response',pa:null},100).error.includes('invalid'));
});
test('CSV keeps the recording zero snapshot in the chosen units',()=>{
  const r=new Recording(),offsets=[-6894.757293,0,100];r.start(pressure,'PSI',[5,5,5],1000,offsets);
  offsets[0]=0;r.add({time:1100,pressure});
  assert.ok(r.csv().includes('"5","-1.000000"'));
});
