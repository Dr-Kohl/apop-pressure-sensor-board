import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {convert,localTimestamp,Recording,ZeroCapture} from '../docs/apop-data.mjs';

test('page workflow connects, records hidden channels, freezes units, and warns before replacement',async()=>{
  const elements=new Map(),commands=[],scheduled=[];let nextRead,queue=[],hardwareRanges=[5,5,5],mono=10000,pressureDelta=0;
  const ctx2d=new Proxy({}, {get:()=>()=>{}});
  function element(id){if(!elements.has(id))elements.set(id,{textContent:'',disabled:false,style:{setProperty(){}},setAttribute(k,v){this[k]=v;},append(){},getBoundingClientRect:()=>({width:1000,height:300}),getContext:()=>ctx2d,showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);}
  const reply=data=>{const value=new TextEncoder().encode(JSON.stringify({protocol:1,...data})+'\n');if(nextRead){const r=nextRead;nextRead=null;r({value,done:false});}else queue.push({value,done:false});};
  const serialReader={read:()=>queue.length?Promise.resolve(queue.shift()):new Promise(r=>nextRead=r),releaseLock(){},cancel(){nextRead?.({done:true});return Promise.resolve();}};
  const serialWriter={async write(bytes){const command=new TextDecoder().decode(bytes).trim();commands.push(command);
    if(command==='identify')reply({type:'identity',pressure_range_control:true,pressure_filter_hz:2,firmware:'usb-0.4.0'});
    else if(command.startsWith('range ')){const [,c,r]=command.split(' ').map(Number);hardwareRanges[c-1]=r;reply({type:'configuration',channel:c,range_psi:r});}
    else reply({type:'pressure_readings',pressure:[1,2,3,4].map(c=>({channel:c,range_psi:hardwareRanges[c-1]??5,model:c===2?undefined:'ND030D',status:c===2?'no_response':'ok',pa:c===2?null:c*100+pressureDelta}))});
  },close(){},releaseLock(){}};
  const fakePort={open(){},setSignals(){},close(){},readable:{getReader:()=>serialReader},writable:{getWriter:()=>serialWriter}};
  const sandbox={convert,localTimestamp,Recording,ZeroCapture,console,TextEncoder,TextDecoder,Date,performance:{now:()=>mono},Blob,URL,
    document:{documentElement:{dataset:{}},getElementById:element,createElement:()=>element('card'+Math.random()),querySelectorAll:()=>[],addEventListener(){}},
    navigator:{serial:{requestPort:async()=>fakePort}},window:{devicePixelRatio:1,addEventListener(){}},ResizeObserver:class{observe(){}},
    setTimeout:(fn,ms)=>{scheduled.push({fn,ms});return 1;},clearTimeout(){},setInterval(){}};
  const context=vm.createContext(sandbox);
  const source=readFileSync(new URL('../docs/apop.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
  vm.runInContext(source,context);await element('connect').onclick();await new Promise(setImmediate);
  assert.equal(element('connection').textContent,'USB connected');assert.equal(element('start').disabled,false);
  assert.equal(scheduled.at(-1).ms,100);
  element('zero-0').onclick();assert.equal(element('start').disabled,true);
  for(let i=0;i<50;i++){mono+=100;await vm.runInContext('sample()',context);}
  assert.equal(vm.runInContext('offsets[0]',context),100);
  assert.ok(element('offset-0').textContent.includes('zero applied'));
  assert.equal(vm.runInContext('history.at(-1).pressure[0].pa',context),0);
  element('zero-0').onclick();mono+=500;await vm.runInContext('sample()',context);
  assert.equal(vm.runInContext('offsets[0]',context),100);
  assert.ok(element('zero-note-0').textContent.includes('interrupted'));
  await element('range-0-10').onclick();await new Promise(setImmediate);assert.ok(commands.includes('range 1 10'));
  assert.equal(vm.runInContext('offsets[0]',context),0);
  element('zero-0').onclick();for(let i=0;i<50;i++){mono+=100;await vm.runInContext('sample()',context);}
  assert.equal(vm.runInContext('offsets[0]',context),100);
  element('show-0').onchange({target:{checked:false}});element('start').onclick();
  assert.equal(element('range-0-5').disabled,true);
  assert.equal(element('zero-0').disabled,true);assert.equal(element('reset-0').disabled,true);
  await vm.runInContext('sample()',context);element('pa').onclick();element('stop').onclick();
  const csv=vm.runInContext('recording.csv()',context);
  assert.ok(csv.includes('channel_1_psi'));assert.ok(csv.includes('channel_3_psi'));assert.ok(!csv.includes('channel_2_'));
  assert.ok(csv.includes('channel_1_zero_offset_psi'));assert.ok(csv.includes('0.014504'));
  assert.equal(vm.runInContext('recording.rows.length',context),1);assert.equal(element('download').disabled,false);
  element('start').onclick();assert.equal(element('replace').open,true);
  element('cancel-replace').onclick();assert.equal(vm.runInContext('recording.rows.length',context),1);
  sandbox.window.showSaveFilePicker=async()=>{throw Object.assign(new Error('Cancelled'),{name:'AbortError'});};
  await element('download').onclick();
  assert.equal(vm.runInContext('recording.saved',context),false);assert.equal(element('error').textContent,'');
  assert.ok(element('message').textContent.includes('cancelled'));
  let aborted=false;
  sandbox.window.showSaveFilePicker=async()=>({createWritable:async()=>({write:async()=>{throw new Error('Disk full');},abort:async()=>{aborted=true;}})});
  await element('download').onclick();assert.equal(aborted,true);
  assert.equal(vm.runInContext('recording.saved',context),false);assert.ok(element('error').textContent.includes('Disk full'));
  let savedText,closed=false,pickerOptions;
  sandbox.window.showSaveFilePicker=async options=>{pickerOptions=options;return {name:'My pressure test.csv',createWritable:async()=>({write:async blob=>{savedText=await blob.text();assert.equal(vm.runInContext('recording.saved',context),false);assert.equal(element('start').disabled,true);},close:async()=>{closed=true;}})};};
  await element('download').onclick();
  assert.ok(pickerOptions.suggestedName.startsWith('APOP-pressure-'));assert.ok(savedText.includes('channel_1_zero_offset_psi'));assert.equal(closed,true);
  assert.equal(vm.runInContext('recording.saved',context),true);assert.ok(element('message').textContent.includes('My pressure test.csv'));
  // Keep exercising the unsaved replacement warning after the save checks.
  vm.runInContext('recording.saved=false',context);
  element('start').onclick();element('confirm-replace').onclick();assert.equal(vm.runInContext('recording.rows.length',context),0);
  await vm.runInContext('sample()',context);await element('disconnect').onclick();
  assert.equal(element('connection').textContent,'Disconnected');assert.equal(vm.runInContext('recording.active',context),false);
  assert.equal(vm.runInContext('recording.rows.length',context),1);
  assert.equal(vm.runInContext('offsets[0]',context),0);
});
