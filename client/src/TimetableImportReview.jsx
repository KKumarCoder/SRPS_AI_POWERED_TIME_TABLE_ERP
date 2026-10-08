import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {api} from './api';

const filters=['All','Verified','Needs Review','Dummy','Free','Combined'];
const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

export default function TimetableImportReview({data,refresh,notify}){
 const [review,setReview]=useState(null),[filter,setFilter]=useState('All'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [sourceDay,setSourceDay]=useState('REFERENCE_DAY'),[weekdaySelection,setWeekdaySelection]=useState(''),[targets,setTargets]=useState([]),[preview,setPreview]=useState(null),[overwrite,setOverwrite]=useState(false);
 const load=useCallback(async()=>{try{const value=await api.get('/timetables/import-review');setReview(value);setSourceDay(value.needsWeekdayReview?'REFERENCE_DAY':value.verifiedWeekday||'Monday');setWeekdaySelection(value.verifiedWeekday||'');setError('');}catch(e){setError(e.message);}},[]);
 useEffect(()=>{load();},[load]);
 const rows=useMemo(()=>review?.cells?.filter(cell=>{
  if(filter==='Verified')return cell.confidence==='VERIFIED_VISIBLE'&&!cell.needsReview;
  if(filter==='Needs Review')return cell.needsReview;
  if(filter==='Dummy')return cell.confidence==='TEMPORARY_DUMMY';
  if(filter==='Free')return cell.type==='FREE';
  if(filter==='Combined')return cell.type==='COMBINED';
  return true;
 })||[],[review,filter]);
 async function importSource(){setBusy(true);setError('');try{const result=await api.post('/timetables/import-handwritten');notify(`Reference day imported: ${result.summary.totalCells} cells`);await refresh();await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function saveCell(cell,patch){
  const next=review.cells.map(item=>item===cell?{...item,...patch}:item);
  setBusy(true);setError('');
  try{
   const timetable=await api.put(`/timetables/${review.timetableId}`,{revision:review.revision,slots:next.map(({teacherName,...slot})=>slot)});
   setReview(current=>({...current,revision:timetable.revision,cells:timetable.slots.map(slot=>({...slot,teacherName:current.teacherOrder.find(row=>row.teacherId===slot.teacherId)?.displayName||slot.teacherId}))}));
   await refresh();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function mapTeacher(row,teacherId){if(!teacherId)return;setBusy(true);setError('');try{await api.put(`/timetables/${review.timetableId}/teacher-order/${row.sourceRowId}`,{teacherId});await load();await refresh();}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function verifyWeekday(weekday){if(!confirm(`Confirm that this reference timetable belongs to ${weekday}? The import remains preserved as its original reference snapshot.`))return;setBusy(true);setError('');try{await api.post(`/timetables/${review.timetableId}/verify-weekday`,{weekday});await load();await refresh();notify(`Weekday verified: ${weekday}`);}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function showPreview(){setBusy(true);setError('');try{const result=await api.post(`/timetables/${review.timetableId}/copy-day-preview`,{sourceDay,targetDays:targets});setPreview(result.targets);setOverwrite(false);}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function copyDays(){if(!preview)return;const existing=preview.filter(target=>target.existingCells);if(existing.length&&!overwrite)return setError('Select the overwrite confirmation to replace existing target-day cells.');if(existing.length&&!confirm(`Replace existing timetable cells on ${existing.map(x=>x.day).join(', ')}?`))return;setBusy(true);setError('');try{await api.post(`/timetables/${review.timetableId}/copy-day`,{sourceDay,targetDays:targets,overwrite});setPreview(null);await load();await refresh();notify('Day timetable copied');}catch(e){setError(e.message);}finally{setBusy(false);}}
 const summary=review?.summary||{totalCells:0,verifiedCells:0,highConfidenceCells:0,needsReviewCells:0,temporaryDummyCells:0,freeCells:0,combinedCells:0};
 return <div className="page import-review">
  <div className="page-heading"><div><div className="eyebrow">SOURCE DATA / HANDWRITTEN IMPORT</div><h1>Timetable import review</h1><p>Keep the scanned labels intact; resolve uncertain values and teacher matches only after checking the paper sheet.</p></div><button onClick={load} disabled={busy}>Refresh</button></div>
  {error&&<div className="error">{error}</div>}
  {!review?.available?<section className="panel"><h2>Import the handwritten source</h2><p>This creates one unverified Reference Day, keeps the other weekdays empty, and preserves the current timetable as a separate version.</p><button className="primary" onClick={importSource} disabled={busy}>{busy?'Importing…':'Import handwritten timetable'}</button></section>:<>
   <section className="reference-warning"><strong>{review.needsWeekdayReview?'⚠ Weekday Not Verified':`Weekday Verified: ${review.verifiedWeekday}`}</strong><span>{review.needsWeekdayReview?'These assignments belong to a single reference day. Monday–Saturday remain empty until copied or explicitly verified.':'The original import remains available as an immutable Version 0 snapshot.'}</span><a href="/timetable/versions">Compare versions</a></section>
   <div className="import-stats">
    {[['Total cells',summary.totalCells],['Verified / readable',summary.verifiedCells],['High confidence',summary.highConfidenceCells],['Needs review',summary.needsReviewCells],['Temporary dummy',summary.temporaryDummyCells],['Free',summary.freeCells],['Combined',summary.combinedCells]].map(([label,value])=><div className="import-stat" key={label}><small>{label}</small><strong>{value}</strong></div>)}
   </div>
   <section className="panel weekday-panel"><div><h2>Verify weekday</h2><p>The source does not name a weekday; select one only after checking the original timetable. You may correct the weekday later.</p></div><div className="inline-form"><select value={weekdaySelection} onChange={e=>setWeekdaySelection(e.target.value)}><option value="" disabled>Select weekday</option>{weekdays.map(day=><option key={day}>{day}</option>)}</select><button className="primary" disabled={busy||!weekdaySelection||weekdaySelection===review.verifiedWeekday} onClick={()=>verifyWeekday(weekdaySelection)}>{review.needsWeekdayReview?'MARK WEEKDAY VERIFIED':'UPDATE VERIFIED WEEKDAY'}</button></div></section>
   <section className="panel"><div className="page-heading"><div><h2>Teacher row matching</h2><p>Unmatched rows retain their handwritten name and order. Mapping does not rename or merge staff records.</p></div></div><div className="row-match-grid">{review.teacherOrder?.map(row=><label className="row-match" key={row.sourceRowId}><span>{row.rowNumber}. {row.displayName}<small>{row.matchStatus==='MATCHED'?row.employeeId:'UNMATCHED / NEEDS REVIEW'}</small></span><select value={row.matchStatus==='MATCHED'?row.teacherId:''} disabled={busy} onChange={e=>mapTeacher(row,e.target.value)}><option value="">Choose existing teacher…</option>{data.teachers.filter(teacher=>!review.teacherOrder.some(other=>other.sourceRowId!==row.sourceRowId&&other.teacherId===teacher._id)).map(teacher=><option key={teacher._id} value={teacher._id}>{teacher.name} · {teacher.employeeId}</option>)}</select></label>)}</div></section>
   <section className="panel copy-day-panel"><div><h2>Copy Day Timetable</h2><p>Preview conflicts first. Existing target-day content is never replaced without an explicit second confirmation.</p></div><div className="copy-controls"><label>Source<select value={sourceDay} onChange={e=>setSourceDay(e.target.value)}>{review.needsWeekdayReview&&<option value="REFERENCE_DAY">Reference Day (weekday unverified)</option>}{weekdays.map(day=><option key={day} value={day}>{day}</option>)}</select></label><fieldset><legend>Copy to</legend>{weekdays.filter(day=>day!==sourceDay).map(day=><label className="checkbox" key={day}><input type="checkbox" checked={targets.includes(day)} onChange={e=>setTargets(current=>e.target.checked?[...current,day]:current.filter(item=>item!==day))}/>{day}</label>)}</fieldset><button className="primary" disabled={busy||!targets.length} onClick={showPreview}>Preview copy</button></div>
    {preview&&<div className="copy-preview"><strong>Conflict preview</strong>{preview.map(item=><div key={item.day}><b>{item.day}</b> · {item.sourceCells} source cells · {item.existingCells} existing target cells · {item.conflicts.length} detected issues{item.conflicts.length>0&&<details><summary>Show preview issues</summary>{item.conflicts.map((message,index)=><small key={index}>{message}</small>)}</details>}</div>)}{preview.some(item=>item.existingCells)>0&&<label className="checkbox"><input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/>I understand that existing target-day cells will be replaced.</label>}<button className="primary" disabled={busy||preview.some(item=>item.existingCells)&&!overwrite} onClick={copyDays}>COPY TIMETABLE</button></div>}
   </section>
   <section className="panel"><div className="page-heading"><div><h2>Imported cells</h2><p>Raw labels stay editable; uncertain cells are highlighted softly for manual rechecking.</p></div><div className="filter-tabs">{filters.map(item=><button key={item} className={filter===item?'active':''} onClick={()=>setFilter(item)}>{item}</button>)}</div></div><div className="import-table-scroll"><table className="import-table"><thead><tr><th>Teacher</th><th>Period</th><th>Raw label</th><th>Parsed</th><th>Slot</th><th>Confidence</th><th>Source / review</th><th>Action</th></tr></thead><tbody>{rows.map(cell=><ImportCell key={`${cell.teacherId}:${cell.periodNumber}`} cell={cell} busy={busy} onSave={saveCell}/>)}</tbody></table></div></section>
  </>}
 </div>;
}

function ImportCell({cell,busy,onSave}){
 const [rawLabel,setRawLabel]=useState(cell.rawLabel||'');
 useEffect(()=>setRawLabel(cell.rawLabel||''),[cell.rawLabel]);
 return <tr className={cell.needsReview?'review-cell':''}>
  <td>{cell.teacherName}</td><td>P{cell.periodNumber}</td><td><input aria-label={`Raw label ${cell.teacherName} period ${cell.periodNumber}`} value={rawLabel} onChange={e=>setRawLabel(e.target.value)}/></td>
  <td>{cell.parsedLabel?.classNumber||'—'} {cell.parsedLabel?.sectionCode||''} {cell.parsedLabel?.stream||''} {cell.parsedLabel?.subjectCode||''}</td>
  <td>{cell.type}</td><td><select aria-label="Confidence" value={cell.confidence||'AMBIGUOUS'} onChange={e=>onSave(cell,{confidence:e.target.value,needsReview:e.target.value==='AMBIGUOUS'||e.target.value==='TEMPORARY_DUMMY'})}><option>VERIFIED_VISIBLE</option><option>HIGH_CONFIDENCE</option><option>AMBIGUOUS</option><option>TEMPORARY_DUMMY</option></select></td>
  <td>{cell.source||'—'}{cell.needsReview&&<small className="review-badge">⚠ Review</small>}</td>
  <td><div className="cell-actions"><button disabled={busy} onClick={()=>onSave(cell,{rawLabel,needsReview:cell.needsReview||!rawLabel.trim(),confidence:cell.needsReview?'AMBIGUOUS':cell.confidence})}>Save</button>{cell.needsReview&&<button disabled={busy} onClick={()=>onSave(cell,{rawLabel,confidence:'VERIFIED_VISIBLE',needsReview:false,notes:''})}>MARK VERIFIED</button>}<a className="button" href={`/timetable/master?teacher=${encodeURIComponent(cell.teacherId)}&period=${cell.periodNumber}`}>Edit fields</a></div></td>
 </tr>;
}
