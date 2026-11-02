export const PA_PER_PSI=6894.757293;
export const convert=(pa,unit)=>unit==='PSI'?pa/PA_PER_PSI:pa;
// Initial stability limits based on the recorded equal-pressure baseline noise.
// Scale with range because the sensor's pressure-per-count changes with range.
export class ZeroCapture {
  constructor(range,started){this.range=range;this.started=started;this.samples=[];this.last=started;}
  add(p,now){
    if(p?.model!=='ND030D'||p.status!=='ok'||!Number.isFinite(p.pa))return {error:'Sensor reading invalid. Previous zero kept.'};
    if(now-this.last>300||now<this.last)return {error:'Sampling interrupted. Keep this tab active and try again. Previous zero kept.'};
    this.last=now;this.samples.push({pa:p.pa,time:now});
    if(now-this.started<5000)return null;
    const a=this.samples,mean=xs=>xs.reduce((s,p)=>s+p.pa,0)/xs.length;
    if(a.length<45||a.at(-1).time-a[0].time<4500)return {error:'Too few samples. Previous zero kept.'};
    const avg=mean(a),span=Math.max(...a.map(p=>p.pa))-Math.min(...a.map(p=>p.pa));
    const drift=Math.abs(mean(a.filter(p=>p.time<=a[0].time+1000))-mean(a.filter(p=>p.time>=now-1000)));
    const std=Math.sqrt(a.reduce((s,p)=>s+(p.pa-avg)**2,0)/a.length),scale=this.range/5;
    if(span>40*scale||drift>15*scale||std>12*scale)return {error:'Pressure was not steady. Equalize both ports and try again. Previous zero kept.'};
    return {offset:avg,count:a.length};
  }
}
export function localTimestamp(date){
  const pad=(v,n=2)=>String(v).padStart(n,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(),3)}`;
}
export class Recording {
  constructor(){this.rows=[];this.active=false;this.saved=true;this.channels=[];}
  start(latest,unit,ranges,now=Date.now(),offsets=[0,0,0]){
    const channels=latest.filter(p=>p.model==='ND030D').map(p=>p.channel).filter(c=>c<=3);
    if(!channels.length)throw new Error('No pressure sensors detected. Wait for a valid board reading.');
    this.rows=[];this.channels=channels;this.unit=unit;this.ranges=[...ranges];this.offsets=[...offsets];this.started=now;this.active=true;this.saved=false;
  }
  add(sample){if(this.active)this.rows.push(sample);}
  stop(){this.active=false;}
  csv(){
    const headers=['computer_time','elapsed_seconds','sensor_filter_hz','target_sample_rate_hz',...this.channels.flatMap(c=>[`channel_${c}_${this.unit.toLowerCase()}`,`channel_${c}_status`,`channel_${c}_range_psi`,`channel_${c}_zero_offset_${this.unit.toLowerCase()}`])];
    const lines=this.rows.map(row=>[localTimestamp(new Date(row.time)),((row.elapsed??(row.time-this.started))/1000).toFixed(3),2,10,...this.channels.flatMap(c=>{
      const p=row.pressure.find(p=>p.channel===c);
      return [p?.status==='ok'&&Number.isFinite(p.pa)?convert(p.pa,this.unit).toFixed(6):'',p?.status??'no_response',this.ranges[c-1],convert(this.offsets[c-1],this.unit).toFixed(6)];
    })]);
    const escape=v=>`"${String(v).replaceAll('"','""')}"`;
    return [headers,...lines].map(row=>row.map(escape).join(',')).join('\r\n')+'\r\n';
  }
}
