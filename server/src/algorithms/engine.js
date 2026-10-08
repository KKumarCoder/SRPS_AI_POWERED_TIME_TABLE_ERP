export const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const key=s=>`${s.day}:${s.teacherId}:${s.periodNumber}`;
export function conflicts(slots,teachers,sections,subjects=[]){
 const errors=[],seen=new Set(),classes=new Set(),rooms=new Set();
 for(const s of slots){if(s.type==='FREE')continue;const t=teachers.find(t=>String(t._id)===s.teacherId);const at=`${s.day} P${s.periodNumber}`;
 if(!t||!t.active||t.timetableEligible===false){errors.push(`${at}: inactive or timetable-ineligible teacher`);continue;}
 if(seen.has(key(s)))errors.push(`${at}: teacher collision (${t.name})`);seen.add(key(s));
 if(!s.sectionIds?.length||!subjects.some(x=>String(x._id)===s.subjectId))errors.push(`${at}: class and subject required`);
 if(s.sectionIds?.length>1&&s.type!=='COMBINED')errors.push(`${at}: multiple classes must be intentionally combined`);
 const sub=subjects.find(x=>String(x._id)===s.subjectId);
 if(sub&&!t.canTeachSubjects?.includes(sub.subjectCode))errors.push(`${at}: ${t.name} is not eligible for ${sub.subjectName}`);
 for(const id of s.sectionIds||[]){const c=sections.find(c=>String(c._id)===id);if(!c){errors.push(`${at}: unknown section`);continue;}
 if(!t.canTeachClasses?.includes(c.grade)||c.grade>10&&!t.canTeachSeniorSecondary||c.type==='COACHING'&&!t.canTeachCoaching||t.canTeachSections?.length&&!t.canTeachSections.includes(String(c._id)))errors.push(`${at}: ${t.name} is not eligible for ${c.grade} ${c.name}`);
 if(sub&&!sub.classesApplicable.includes(c.grade))errors.push(`${at}: subject not applicable to Class ${c.grade}`);
 const ck=`${s.day}:${s.periodNumber}:${id}`;if(classes.has(ck))errors.push(`${at}: class collision (${c.grade} ${c.name})`);classes.add(ck);}
 if(s.resourceId){const rk=`${s.day}:${s.periodNumber}:${s.resourceId}`;if(rooms.has(rk))errors.push(`${at}: room/lab collision`);rooms.add(rk);}
 if(t.avoidPeriods?.includes(s.periodNumber))errors.push(`${at}: ${t.name} is unavailable`);
 }
 for(const t of teachers){const all=slots.filter(s=>s.teacherId===String(t._id)&&s.type!=='FREE');if(all.length>t.maximumPeriodsPerWeek)errors.push(`${t.name}: weekly workload exceeded`);
 for(const day of days){const ps=all.filter(s=>s.day===day).map(s=>s.periodNumber).sort((a,b)=>a-b);if(ps.length>t.maximumPeriodsPerDay)errors.push(`${day}: ${t.name} daily workload exceeded`);let run=0,prev=-1;for(const p of ps){run=p===prev+1?run+1:1;prev=p;if(run>t.maximumConsecutivePeriods){errors.push(`${day}: ${t.name} consecutive workload exceeded`);break;}}}}
 return [...new Set(errors)];
}
export function recommend({slots,teachers,sections,subjects,attendance,substitutions=[],day,absentIds}){
 const daily=slots.filter(s=>s.day===day&&s.type!=='FREE');const affected=daily.filter(s=>absentIds.includes(s.teacherId)).sort((a,b)=>Math.max(...b.sectionIds.map(id=>sections.find(c=>String(c._id)===id)?.grade||0))-Math.max(...a.sectionIds.map(id=>sections.find(c=>String(c._id)===id)?.grade||0)));
 const reserved=substitutions.map(s=>({...s,day,type:'SUBSTITUTION'}));const results=[];
 for(const s of affected){if(substitutions.some(x=>x.slotKey===key(s)))continue;const candidates=[];
 for(const t of teachers){const id=String(t._id);if(t.timetableEligible===false||absentIds.includes(id)||!attendance.some(a=>a.teacherId===id&&['PRESENT','LATE','HALF_DAY'].includes(a.status)))continue;
 const proposed={...s,teacherId:id,locked:false};const base=slots.filter(x=>!absentIds.includes(x.teacherId));if(conflicts([...base,...reserved,proposed],teachers,sections,subjects).length)continue;
 const sub=subjects.find(x=>String(x._id)===s.subjectId);const load=daily.filter(x=>x.teacherId===id).length+reserved.filter(x=>x.teacherId===id).length;const previous=substitutions.filter(x=>x.teacherId===id).length;
 const score=60+(t.primarySubject===sub?.subjectCode?25:10)-load*3-previous*4-(t.preferredFreePeriods?.includes(s.periodNumber)?5:0);
 candidates.push({teacherId:id,name:t.name,score,reasons:[`Free in period ${s.periodNumber}`,`Eligible for ${sub?.subjectName}`,`${load} periods assigned today`,`${previous} existing substitute assignments`]});}
 candidates.sort((a,b)=>b.score-a.score||a.teacherId.localeCompare(b.teacherId));const best=candidates[0];results.push({slot:s,candidates,match:best?'STRONG MATCH':'NO STRONG MATCH'});if(best)reserved.push({...s,teacherId:best.teacherId});}
 return results;
}
export function generate({slots,teachers,sections,subjects,requirements}){
 const result=slots.filter(s=>s.locked);const unmet=[];
 for(const r of requirements){const existing=result.filter(s=>s.subjectId===r.subjectId&&s.sectionIds.includes(r.sectionId)).length;let remaining=Math.max(0,r.count-existing);
 for(const day of days){for(let p=1;p<=9&&remaining>0;p++){if(result.filter(s=>s.day===day&&s.subjectId===r.subjectId&&s.sectionIds.includes(r.sectionId)).length>=2)continue;
 for(const t of [...teachers].filter(t=>t.timetableEligible!==false).sort((a,b)=>result.filter(s=>s.teacherId===String(a._id)).length-result.filter(s=>s.teacherId===String(b._id)).length)){
 const s={teacherId:String(t._id),sectionIds:[r.sectionId],subjectId:r.subjectId,day,periodNumber:p,type:'REGULAR',locked:false};if(!conflicts([...result,s],teachers,sections,subjects).length){result.push(s);remaining--;break;}}}}
 if(remaining)unmet.push({...r,missing:remaining});}
 return {slots:result,unmet,conflicts:conflicts(result,teachers,sections,subjects)};
}
export function monthly(records,teachers,workingDates){return teachers.map(t=>{const rows=records.filter(a=>a.teacherId===String(t._id)&&workingDates.includes(a.date));const count=s=>rows.filter(a=>a.status===s).length;return {teacherId:String(t._id),name:t.name,employeeId:t.employeeId,workingDays:workingDates.length,present:count('PRESENT'),absent:count('ABSENT'),leave:count('LEAVE'),late:count('LATE'),halfDay:count('HALF_DAY'),notMarked:workingDates.length-rows.filter(a=>!['NOT_MARKED','SUSPECTED_ABSENT'].includes(a.status)).length,checkIns:rows.filter(a=>a.checkInTime).length,checkOuts:rows.filter(a=>a.checkOutTime).length,percentage:workingDates.length?Math.round((count('PRESENT')+count('LATE')+count('HALF_DAY')*.5)/workingDates.length*100):0};});}
