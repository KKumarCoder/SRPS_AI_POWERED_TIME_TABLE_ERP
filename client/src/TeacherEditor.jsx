import React,{useState} from 'react';
import {Mail,Plus} from 'lucide-react';
import {api} from './api';
import {DataTable,Heading} from './Pages';

const defaults={
 employeeId:'',name:'',email:'',phone:'',department:'',designation:'Teacher',dateOfBirth:'',joiningDate:'',address:'',
 primarySubject:'',secondarySubjects:[],canTeachSubjects:[],canTeachClasses:[],canTeachSections:[],
 canTeachSeniorSecondary:false,canTeachCoaching:false,timetableEligible:true,
 maximumPeriodsPerDay:6,maximumPeriodsPerWeek:32,maximumConsecutivePeriods:4,
 preferredFreePeriods:[5,9],avoidPeriods:[],active:true,attendanceEnabled:true,qrAttendanceEnabled:true
};

export default function TeacherEditor({data,refresh,notify}){
 const [query,setQuery]=useState(''),[edit,setEdit]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[qrPreview,setQrPreview]=useState(null);
 const open=teacher=>{setEdit({...defaults,...teacher,canTeachClasses:teacher.canTeachClasses||[],canTeachSections:teacher.canTeachSections||[],canTeachSubjects:teacher.canTeachSubjects||[],secondarySubjects:teacher.secondarySubjects||[]});setError('');};
 async function save(event){
  event.preventDefault();setBusy(true);setError('');
  try{
   const payload={...edit,canTeachClasses:(edit.canTeachClasses||[]).map(Number).filter(Number.isInteger)};
   if(edit._id)await api.put(`/teachers/${edit._id}`,payload);else await api.post('/teachers',payload);
   await refresh();setEdit(null);notify('Teacher saved');
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function previewQrEmail(event,teacher){
  event.stopPropagation();
  try{setQrPreview(await api.post(`/email/preview/${teacher._id}`));}
  catch(e){notify(e.message);}
 }
 const updateSubjects=(field,values)=>{
  if(field==='secondarySubjects'){
   setEdit(current=>({...current,secondarySubjects:values,canTeachSubjects:[...new Set([current.primarySubject,...values,...current.canTeachSubjects].filter(Boolean))]}));
  }else setEdit(current=>({...current,[field]:values}));
 };
 return <div className="page">
  <Heading title="Teacher directory" subtitle="Staff identities, timetable eligibility and workload limits">
   <button className="primary" onClick={()=>open(defaults)}><Plus size={15}/>Add teacher</button>
  </Heading>
  <div className="filterbar"><input placeholder="Search name or employee ID" value={query} onChange={e=>setQuery(e.target.value)}/><span>{data.teachers.length} records · inactive staff remain in history</span></div>
  <DataTable rows={data.teachers.filter(t=>`${t.name} ${t.employeeId}`.toLowerCase().includes(query.toLowerCase()))} onRow={open} columns={[
   {key:'employeeId',label:'Employee ID'},{key:'name',label:'Teacher'},{key:'department',label:'Department'},
   {key:'designation',label:'Designation'},{key:'email',label:'Email'},{key:'phone',label:'Phone'},
   {key:'active',label:'Status',render:t=><span className={`status ${t.active?'present':'absent'}`}>{t.active?'Active':'Inactive'}</span>},
   {key:'qrPreview',label:'QR email',render:t=><button onClick={e=>previewQrEmail(e,t)}><Mail size={14}/>Preview</button>}
  ]}/>
  {edit&&<div className="modal-backdrop"><form className="modal wide" onSubmit={save}>
   <h2>{edit._id?'Edit teacher':'Add teacher'}</h2>
   <div className="form-grid">
    {['employeeId','name','email','phone','department','designation'].map(key=><label key={key}>{key.replace(/([A-Z])/g,' $1')}
     <input required={key!=='phone'} type={key==='email'?'email':'text'} value={edit[key]||''} onChange={e=>setEdit({...edit,[key]:e.target.value})}/>
    </label>)}
    <label>Date of birth<input type="date" value={edit.dateOfBirth||''} onChange={e=>setEdit({...edit,dateOfBirth:e.target.value})}/></label>
    <label>Date of joining<input type="date" value={edit.joiningDate||''} onChange={e=>setEdit({...edit,joiningDate:e.target.value})}/></label>
    <label className="span-2">Address<textarea rows="2" value={edit.address||''} onChange={e=>setEdit({...edit,address:e.target.value})}/></label>
    <label>Primary subject<select value={edit.primarySubject||''} onChange={e=>setEdit({...edit,primarySubject:e.target.value,canTeachSubjects:[...new Set([e.target.value,...edit.canTeachSubjects].filter(Boolean))]})}>
     <option value="">Unassigned</option>{data.subjects.map(s=><option key={s._id} value={s.subjectCode}>{s.subjectName}</option>)}
    </select></label>
    <label>Secondary subjects<select multiple value={edit.secondarySubjects||[]} onChange={e=>updateSubjects('secondarySubjects',Array.from(e.target.selectedOptions,o=>o.value))}>
     {data.subjects.map(s=><option key={s._id} value={s.subjectCode}>{s.subjectName}</option>)}
    </select></label>
    <label>Eligible subjects<select multiple value={edit.canTeachSubjects||[]} onChange={e=>updateSubjects('canTeachSubjects',Array.from(e.target.selectedOptions,o=>o.value))}>
     {data.subjects.map(s=><option key={s._id} value={s.subjectCode}>{s.subjectName}</option>)}
    </select></label>
    <label>Eligible classes (comma-separated grades)<input value={(edit.canTeachClasses||[]).join(',')} onChange={e=>setEdit({...edit,canTeachClasses:e.target.value.split(',').map(v=>v.trim()).filter(Boolean).map(Number)})}/></label>
    <label className="span-2">Eligible sections<select multiple value={edit.canTeachSections||[]} onChange={e=>setEdit({...edit,canTeachSections:Array.from(e.target.selectedOptions,o=>o.value)})}>
     {data.sections.map(s=><option key={s._id} value={s._id}>Class {s.grade} · {s.name}</option>)}
    </select></label>
    {['maximumPeriodsPerDay','maximumPeriodsPerWeek','maximumConsecutivePeriods'].map(key=><label key={key}>{key.replace(/([A-Z])/g,' $1')}
     <input type="number" min="1" max={key==='maximumPeriodsPerWeek'?54:9} value={edit[key]} onChange={e=>setEdit({...edit,[key]:+e.target.value})}/>
    </label>)}
    {['active','timetableEligible','canTeachSeniorSecondary','canTeachCoaching','attendanceEnabled','qrAttendanceEnabled'].map(key=><label key={key} className="checkbox">
     <input type="checkbox" checked={!!edit[key]} onChange={e=>setEdit({...edit,[key]:e.target.checked})}/>{key.replace(/([A-Z])/g,' $1')}
    </label>)}
   </div>
   {error&&<div className="error">{error}</div>}
   <div className="modal-actions">
    {edit._id&&<button type="button" onClick={async()=>{const password=prompt('Set teacher login password (minimum 12 characters)');if(password)try{await api.post(`/teachers/${edit._id}/login`,{password});notify('Teacher login created or updated');}catch(e){setError(e.message);}}}>Set login password</button>}
    <button type="button" onClick={()=>setEdit(null)}>Cancel</button><button className="primary" disabled={busy}>Save teacher</button>
   </div>
  </form></div>}
  {qrPreview&&<div className="modal-backdrop"><div className="modal"><h2>Today's QR email preview</h2><p>To: {qrPreview.teacher.email}</p><p>Subject: {qrPreview.subject}</p><p>{qrPreview.text}</p><p className="badge">{qrPreview.emailSendingEnabled?'Email sending enabled':'Preview only — outbound email disabled'}</p><p>Generating a preview replaces this teacher's previous QR for today.</p><img className="qr-image" src={qrPreview.image} alt="Today's attendance QR preview"/><div className="modal-actions"><a className="button" href={qrPreview.image} download={`${qrPreview.teacher.employeeId}-qr.png`}>Download QR</a><button onClick={()=>setQrPreview(null)}>Close</button></div></div></div>}
 </div>;
}
