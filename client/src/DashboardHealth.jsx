import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {CheckCircle2,AlertTriangle,CalendarDays,Mail,Users,ScanLine} from 'lucide-react';

export default function DashboardHealth({dashboard:d,data}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('all');
 const periodCount=data.bells?.find(b=>b.active)?.periods?.length||9;
 const total=data.sections.length*periodCount;
 const allocated=new Set(d.slots.flatMap(s=>(s.sectionIds||[]).map(id=>`${id}:${s.periodNumber}`))).size;
 const remaining=Math.max(0,total-allocated),coverage=total?Math.min(100,Math.round(allocated/total*100)):0;
 const sent=d.emails.filter(e=>e.status==='sent').length,failed=d.emails.filter(e=>e.status==='failed').length;
 const workloads=d.teachers.map(t=>({...t,count:new Set(d.slots.filter(s=>s.teacherId===t._id).map(s=>s.periodNumber)).size}));
 const scheduled=workloads.filter(t=>t.count>0).length;
 const rows=workloads.filter(t=>t.name.toLowerCase().includes(query.toLowerCase())&&(filter==='all'||(filter==='scheduled'?t.count>0:t.count===0))).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
 return <section className="panel dashboard-health">
  <div className="health-heading"><h2>Timetable health</h2><span className="health-live"><i/> Live · 15s refresh</span></div>
  <div className={`health-notice ${d.timetableSourceNeedsReview||d.conflicts.length?'needs-review':''}`}>
   {d.timetableSourceNeedsReview||d.conflicts.length?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>}
   <span>{d.timetableSourceNeedsReview?'Weekday verification pending':d.conflicts.length?`${d.conflicts.length} conflicts need attention`:d.slots.length?'No detected timetable conflicts':'No published periods today'}</span>
  </div>
  <div className="health-coverage">
   <div className="coverage-ring" style={{'--coverage':`${coverage}%`}} role="img" aria-label={`${coverage}% of today's class periods allocated`}><div><strong>{coverage}%</strong><small>Coverage</small></div></div>
   <div><h3>Today’s class periods</h3><p><b>{allocated}</b> of {total} allocated</p><div className="coverage-legend"><span><i/>{allocated} allocated</span><span><i/>{remaining} remaining</span></div><Link to="/timetable/master">View timetable →</Link></div>
  </div>
  <div className="health-metrics">
   <Link to="/timetable/master" className="health-metric metric-blue"><CalendarDays size={18}/><strong>{d.slots.length}</strong><span>Published periods today</span></Link>
   <Link to="/timetable/master" className={`health-metric ${d.conflicts.length?'metric-red':'metric-green'}`}><AlertTriangle size={18}/><strong>{d.conflicts.length}</strong><span>Master conflicts</span></Link>
   <Link to="/notifications" className="health-metric metric-green"><Mail size={18}/><strong>{sent}</strong><span>QR emails sent</span></Link>
   <Link to="/notifications" className={`health-metric ${failed?'metric-red':'metric-amber'}`}><Mail size={18}/><strong>{failed}</strong><span>QR emails failed</span></Link>
  </div>
  <h2>Quick actions</h2><div className="health-actions">{[['/attendance','Mark attendance',CheckCircle2],['/attendance/scanner','USB scanner',ScanLine],['/timetable/free','Free teachers',Users],['/attendance/monthly','Monthly report',CalendarDays],['/leaves','Manage leave',CalendarDays],['/timetable/generator','Generate timetable',CalendarDays]].map(([url,label,Icon])=><Link key={url} to={url}><Icon size={16}/><span>{label}</span><b>→</b></Link>)}</div>
  <div className="health-heading workload-heading"><h2>Workload today</h2><span>{scheduled}/{workloads.length} staff scheduled</span></div>
  <div className="workload-summary"><span><b>{scheduled}</b> Scheduled</span><span><b>{workloads.length-scheduled}</b> No periods</span><span><b>{workloads.reduce((n,t)=>n+t.count,0)}</b> Teacher-periods</span></div>
  {!d.slots.length&&<div className="workload-note">{d.timetableSourceNeedsReview?'Verify weekdays and publish the timetable to populate today’s workload.':'Workload will appear when periods are published for today.'}</div>}
  <div className="workload-controls"><input aria-label="Search teacher workload" placeholder="Search teacher…" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Filter teacher workload" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All staff</option><option value="scheduled">Scheduled</option><option value="free">No periods</option></select></div>
  <div className="workload-chart">{rows.map(t=>{const capacity=t.maximumPeriodsPerDay||periodCount,over=t.count>capacity;return <div className={`workload-chart-row${over?' over-capacity':''}`} key={t._id}><div className="workload-avatar">{t.name.split(' ').slice(0,2).map(n=>n[0]).join('')}</div><div className="workload-chart-body"><div><span>{t.name}</span><strong>{t.count}<small> / {capacity}</small></strong></div><div className="workload-meter" role="progressbar" aria-label={`${t.name} scheduled periods`} aria-valuemin={0} aria-valuemax={Math.max(capacity,t.count)} aria-valuenow={t.count} aria-valuetext={`${t.count} periods, daily limit ${capacity}`}><span style={{width:`${Math.min(100,t.count/capacity*100)}%`}}/></div>{over&&<small className="over-capacity-label">Above daily limit</small>}</div></div>})}{!rows.length&&<div className="empty">No teachers match this filter.</div>}</div>
 </section>;
}
