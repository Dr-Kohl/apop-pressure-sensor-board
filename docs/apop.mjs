import {convert,localTimestamp,Recording,ZeroCapture} from './apop-data.mjs?v=0.4.1';
const $=id=>document.getElementById(id);
const colors=['#207c9e','#d68a22','#8a63b8'];
const ranges=[5,5,5],visible=[true,true,true],recording=new Recording();
const offsets=[0,0,0],zeroApplied=[false,false,false],zeroTasks=[null,null,null],zeroNotes=['','',''];
let unit='PSI',port,reader,writer,readTask,pending,timer,busy=false,closing=false,connecting=false,saving=false;
let history=[],latest=[],lastAt=0,recordMono=0,lastNumbers=-Infinity;
for(let i=0;i<3;i++){
  const card=document.createElement('article');card.className='channel';card.style.setProperty('--color',colors[i]);
  card.innerHTML=`<div class="channel-head"><h2>Channel ${i+1}</h2><label class="visibility"><input id="show-${i}" type="checkbox" checked aria-label="Show channel ${i+1} on graph"> Show</label></div><div class="reading"><span id="value-${i}">—</span><small class="unit">PSI</small></div><div class="sensor-status" id="sensor-${i}">Not connected</div><div class="range-label">Sensor range</div><div class="ranges" role="group" aria-label="Channel ${i+1} sensor range">${[5,10,30].map(r=>`<button id="range-${i}-${r}" aria-pressed="${r===5}">±${r} PSI</button>`).join('')}</div>`;
  card.innerHTML+=`<div class="zero-offset" id="offset-${i}">Offset: 0 PSI · no zero applied</div><div class="zero-actions"><button id="zero-${i}" aria-label="Zero channel ${i+1}">Zero</button><button id="reset-${i}" aria-label="Reset zero channel ${i+1}">Reset zero</button></div><p class="zero-note" id="zero-note-${i}" role="status"></p>`;
  $('channels').append(card);
  $(`zero-${i}`).onclick=()=>startZero(i);
  $(`reset-${i}`).onclick=()=>resetZero(i);
  $(`show-${i}`).onchange=e=>{visible[i]=e.target.checked;draw();};
  for(const r of [5,10,30])$(`range-${i}-${r}`).onclick=()=>setRange(i,r);
}
function log(s){$('log').textContent=($('log').textContent+'\n'+s).slice(-6000);}
function controls(){
  $('connect').disabled=!!port||connecting||closing||!('serial' in navigator);
  $('disconnect').disabled=!port||connecting||closing;
  $('start').disabled=!writer||connecting||closing||saving||recording.active||zeroTasks.some(Boolean)||!latest.some(p=>p.model==='ND030D');
  $('stop').disabled=!recording.active;
  $('download').disabled=saving||recording.active||!recording.rows.length;
  $('download').textContent=saving?'Saving…':'Save CSV…';
  for(let i=0;i<3;i++){
    $(`zero-${i}`).disabled=!writer||connecting||closing||recording.active||!latest.some(p=>p.channel===i+1&&p.status==='ok');
    $(`reset-${i}`).disabled=!writer||connecting||closing||recording.active||zeroTasks.some(Boolean)||!zeroApplied[i];
    for(const r of [5,10,30]){
      const b=$(`range-${i}-${r}`);b.disabled=!writer||busy||connecting||closing||recording.active||zeroTasks.some(Boolean);
      b.setAttribute('aria-pressed',String(ranges[i]===r));
    }
  }
  $('record-state').textContent=recording.active?'Recording…':recording.rows.length?'Recording stopped':'Ready when you are';
  if(recording.active||recording.rows.length)$('record-info').textContent=`${recording.rows.length} samples · channels ${recording.channels.join(', ')} · CSV in ${recording.unit}${recording.saved?' · download requested':''}`;
}
function values(){
  for(let i=0;i<3;i++){
    const p=latest.find(p=>p.channel===i+1),valid=p?.status==='ok'&&Number.isFinite(p.pa);
    $(`value-${i}`).textContent=valid?convert(p.pa-offsets[i],unit).toFixed(unit==='PSI'?4:1):'—';
    $(`sensor-${i}`).textContent=p?(p.status==='ok'?'ND030D · connected':p.status.replaceAll('_',' ')):'Not connected';
    $(`offset-${i}`).textContent=`Offset: ${convert(offsets[i],unit).toFixed(unit==='PSI'?5:1)} ${unit} · ${zeroApplied[i]?'zero applied':'no zero applied'}`;
  }
  document.querySelectorAll('.unit').forEach(e=>e.textContent=unit);
  for(const u of ['PSI','Pa'])$(u.toLowerCase()).setAttribute('aria-pressed',String(unit===u));
}
function zeroStatus(i){
  $(`zero-${i}`).textContent=zeroTasks[i]?`Cancel zero · ${Math.max(0,Math.ceil((5000-(performance.now()-zeroTasks[i].started))/1000))} s`:'Zero';
  $(`zero-note-${i}`).textContent=zeroTasks[i]?'Zeroing… keep both ports at equal pressure.':zeroNotes[i];
}
function startZero(i){
  if(recording.active||!writer||connecting||closing)return;
  if(zeroTasks[i]){zeroTasks[i]=null;zeroNotes[i]='Zero cancelled. Previous offset kept.';}
  else if(Date.now()-lastAt<=300&&latest[i]?.status==='ok'){
    zeroTasks[i]=new ZeroCapture(ranges[i],performance.now());zeroNotes[i]='';
  }else{zeroNotes[i]='Wait for a fresh valid sensor reading.';}
  zeroStatus(i);controls();
}
function resetZero(i){
  if(recording.active||zeroTasks.some(Boolean)||!writer||connecting||closing)return;
  offsets[i]=0;zeroApplied[i]=false;zeroNotes[i]='Zero reset.';zeroStatus(i);values();draw();controls();
}
function clearZeros(){for(let i=0;i<3;i++){offsets[i]=0;zeroApplied[i]=false;zeroTasks[i]=null;zeroNotes[i]='';zeroStatus(i);}}
function processZeros(mono){
  for(let i=0;i<3;i++)if(zeroTasks[i]){
    const result=zeroTasks[i].add(latest[i],mono);
    if(result){
      if(result.error)zeroNotes[i]=result.error;
      else{offsets[i]=result.offset;zeroApplied[i]=true;zeroNotes[i]=`Zero set from ${result.count} steady readings.`;log(`Channel ${i+1} zero: ${result.offset.toFixed(3)} Pa`);}
      zeroTasks[i]=null;values();
    }
    zeroStatus(i);
  }
}
function stopRecording(reason){recording.stop();if(reason)$('message').textContent=reason;controls();}
function consume(message){
  if(message.protocol!==1)throw new Error('Unsupported board protocol');
  if(message.type==='error'){pending?.reject(new Error(message.error));return;}
  if(pending?.type===message.type){pending.resolve(message);}
}
async function readLoop(){
  const decoder=new TextDecoder();let buffer='';
  try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
    if(buffer.length>16384)throw new Error('Board response too long');
    let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(line)consume(JSON.parse(line));}
  }if(!closing)throw new Error('Board disconnected');}
  catch(e){if(!closing){$('error').textContent=e.message;pending?.reject(e);setTimeout(disconnect,0);}}
  finally{reader.releaseLock();}
}
async function request(command,type){
  let timeout;
  const result=new Promise((resolve,reject)=>{pending={type,resolve,reject};timeout=setTimeout(()=>reject(new Error('Board response timed out. Reconnect the board.')),3000);});result.catch(()=>{});
  try{await writer.write(new TextEncoder().encode(command+'\n'));return await result;}
  finally{clearTimeout(timeout);pending=undefined;}
}
function validate(message){
  if(!Array.isArray(message.pressure)||message.pressure.length<3)throw new Error('Incomplete pressure response');
  return message.pressure.slice(0,3).map((p,i)=>{
    if(p.channel!==i+1||typeof p.status!=='string'||!(p.pa===null||Number.isFinite(p.pa)))throw new Error('Invalid pressure response');
    if(p.range_psi!==ranges[i])throw new Error(`Channel ${i+1} range does not match. Reconnect the board.`);
    return p;
  });
}
async function sample(){
  if(!writer||busy||closing)return;
  busy=true;const start=performance.now();
  try{
    const message=await request('pressure','pressure_readings');latest=validate(message);
    const now=Date.now(),mono=performance.now();lastAt=now;
    processZeros(mono);
    const sample={time:now,position:mono,pressure:latest.map((p,i)=>({...p,pa:Number.isFinite(p.pa)?p.pa-offsets[i]:null,zero_pa:offsets[i]})),elapsed:mono-recordMono};
    history.push(sample);history=history.filter(p=>mono-p.position<=60000);recording.add(sample);
    $('last-reading').textContent='Received '+localTimestamp(new Date(now)).split(' ')[1];
    $('chart-note').textContent='Visibility affects only the graph. All detected channels remain in your recording.';
    if(mono-lastNumbers>=1000){values();lastNumbers=mono;}controls();draw();
  }catch(e){$('error').textContent=e.message;stopRecording('Recording stopped because a board read failed. Existing samples are available to download.');await disconnect();}
  finally{busy=false;controls();if(writer&&!closing)timer=setTimeout(sample,Math.max(0,100-(performance.now()-start)));}
}
async function setRange(i,r){
  if(!writer||busy||recording.active||zeroTasks.some(Boolean)||r===ranges[i])return;clearTimeout(timer);busy=true;controls();$('error').textContent='';
  try{const reply=await request(`range ${i+1} ${r}`,'configuration');if(reply.channel!==i+1||reply.range_psi!==r)throw new Error('Unexpected range confirmation');ranges[i]=r;offsets[i]=0;zeroApplied[i]=false;zeroNotes[i]='Range changed. Zero cleared.';zeroStatus(i);values();log(`Channel ${i+1}: ±${r} PSI`);}
  catch(e){$('error').textContent=e.message;await disconnect();}
  finally{busy=false;controls();if(writer&&!closing)sample();}
}
async function disconnect(){
  if(closing||!port)return;closing=true;clearTimeout(timer);stopRecording('Disconnected. Download any recorded samples before closing this tab.');controls();
  pending?.reject(new Error('Disconnected'));
  try{if(reader)await reader.cancel();if(readTask)await readTask;if(writer){await writer.close();writer.releaseLock();}await port.close();}
  catch(e){log(e.message);}
  finally{port=reader=writer=readTask=undefined;closing=false;latest=[];clearZeros();values();$('connection').textContent='Disconnected';controls();}
}
$('connect').onclick=async()=>{
  connecting=true;controls();$('error').textContent='';
  try{
    const selected=await navigator.serial.requestPort({filters:[{usbVendorId:0x2e8a}]});
    await selected.open({baudRate:115200});port=selected;await port.setSignals({dataTerminalReady:true});
    writer=port.writable.getWriter();reader=port.readable.getReader();readTask=readLoop();
    const identity=await request('identify','identity');log(JSON.stringify(identity));
    if(!identity.pressure_range_control||identity.pressure_filter_hz!==2)throw new Error('This page needs board firmware usb-0.4.0 with the 2 Hz filter.');
    for(let i=0;i<3;i++)await request(`range ${i+1} ${ranges[i]}`,'configuration');
    clearZeros();history=[];latest=[];lastNumbers=-Infinity;$('connection').textContent='USB connected';$('message').textContent='Live readings: 10 samples/s, 2 Hz filter. Equalize A and B before zeroing.';
    sample();
  }catch(e){$('error').textContent=e.name==='NotFoundError'?'No board selected.':e.message;if(port)await disconnect();}
  finally{connecting=false;controls();}
};
$('disconnect').onclick=disconnect;
for(const u of ['PSI','Pa'])$(u.toLowerCase()).onclick=()=>{unit=u;values();draw();};
function startRecording(){
  if(saving)return;
  if(!writer||connecting||closing||zeroTasks.some(Boolean)||Date.now()-lastAt>300){$('error').textContent='Wait for a fresh reading and finish zeroing before recording.';return;}
  try{recording.start(latest,unit,ranges,Date.now(),offsets);recordMono=performance.now();$('error').textContent='';controls();}
  catch(e){$('error').textContent=e.message;}
}
$('start').onclick=()=>{if(recording.rows.length&&!recording.saved)$('replace').showModal();else startRecording();};
$('cancel-replace').onclick=()=>$('replace').close();
$('confirm-replace').onclick=()=>{$('replace').close();startRecording();};
$('stop').onclick=()=>stopRecording();
$('download').onclick=async()=>{
  if(saving||recording.active||!recording.rows.length)return;
  const filename=`APOP-pressure-${localTimestamp(new Date(recording.started)).replaceAll(':','-').replace(' ','_')}.csv`;
  saving=true;controls();$('error').textContent='';
  let writable;
  try{
    if(typeof window.showSaveFilePicker==='function'){
      // Open from the click gesture, before generating a potentially large CSV.
      const handle=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'CSV pressure data',accept:{'text/csv':['.csv']}}]});
      writable=await handle.createWritable();
      await writable.write(new Blob(['\ufeff',recording.csv()],{type:'text/csv;charset=utf-8'}));
      await writable.close();writable=undefined;
      recording.saved=true;
      $('message').textContent=`CSV saved as ${handle.name}. Your recording remains available in this tab.`;
    }else{
      const url=URL.createObjectURL(new Blob(['\ufeff',recording.csv()],{type:'text/csv;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download=filename;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),10000);recording.saved=true;
      $('message').textContent='This browser does not support the Save As picker. CSV download requested using your browser’s download settings. Check Downloads.';
    }
  }catch(e){
    if(writable){try{await writable.abort();}catch{}}
    if(e.name==='AbortError')$('message').textContent='Save cancelled. Your recording remains available in this tab.';
    else $('error').textContent='CSV was not saved: '+e.message+'. Your recording is still available; try Save CSV again.';
  }finally{saving=false;controls();}
};
window.addEventListener('beforeunload',e=>{if(recording.active||(recording.rows.length&&!recording.saved)){e.preventDefault();e.returnValue='';}});
function draw(){
  const canvas=$('chart'),rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
  const w=rect.width,h=rect.height,left=70,right=18,top=24,bottom=36,pw=w-left-right,ph=h-top-bottom;
  const now=performance.now(),samples=history.filter(p=>now-p.position<=60000);
  let lo=0,hi=0;for(const s of samples)for(let i=0;i<3;i++){const p=s.pressure[i];if(visible[i]&&p?.status==='ok'&&Number.isFinite(p.pa)){const v=convert(p.pa,unit);lo=Math.min(lo,v);hi=Math.max(hi,v);}}
  const span=Math.max(hi-lo,unit==='PSI'?0.02:100);lo-=span*.12;hi+=span*.12;
  const y=v=>top+(hi-v)/(hi-lo)*ph,x=t=>left+(1-(now-t)/60000)*pw;
  ctx.font='11px Segoe UI';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,yy=y(v);ctx.strokeStyle='#e7ede9';ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(w-right,yy);ctx.stroke();ctx.fillStyle='#607378';ctx.textAlign='right';ctx.fillText(v.toFixed(unit==='PSI'?3:0),left-9,yy+4);}
  ctx.textAlign='left';ctx.fillStyle='#607378';ctx.fillText(unit,left,12);
  for(let i=0;i<=6;i++){const xx=left+pw*i/6;ctx.textAlign=i===6?'right':i===0?'left':'center';ctx.fillText(i===6?'now':`−${60-i*10}s`,xx,h-12);}
  ctx.save();ctx.beginPath();ctx.rect(left,top,pw,ph);ctx.clip();
  for(let i=0;i<3;i++){if(!visible[i])continue;ctx.strokeStyle=colors[i];ctx.fillStyle=colors[i];ctx.lineWidth=2;ctx.beginPath();let prev=null;
    for(const s of samples){const p=s.pressure[i];if(p?.status!=='ok'||!Number.isFinite(p.pa)){prev=null;continue;}const xx=x(s.position),yy=y(convert(p.pa,unit));
      if(prev&&s.position-prev.position<300&&p.range_psi===prev.range&&p.zero_pa===prev.zero)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy);
      prev={position:s.position,range:p.range_psi,zero:p.zero_pa};
    }ctx.stroke();
    for(const s of samples){const p=s.pressure[i];if(p?.status==='ok'&&Number.isFinite(p.pa)){ctx.beginPath();ctx.arc(x(s.position),y(convert(p.pa,unit)),2.5,0,Math.PI*2);ctx.fill();}}
  }ctx.restore();
}
new ResizeObserver(draw).observe($('chart'));
setInterval(()=>{$('clock').textContent=localTimestamp(new Date()).split('.')[0];draw();},1000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)$('message').textContent='This tab is in the background; sampling may slow. Actual receipt times are recorded.';else if(writer)$('message').textContent='Live readings: 10 samples/s, 2 Hz filter. Equalize A and B before zeroing.';});
if(!('serial' in navigator))$('error').textContent='USB serial requires desktop Chrome or Edge. Open this dashboard there over HTTPS, or localhost for local development.';
values();controls();draw();
document.documentElement.dataset.apopReady='true';

