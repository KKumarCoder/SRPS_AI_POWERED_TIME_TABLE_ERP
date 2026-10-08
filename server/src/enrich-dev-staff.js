import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import * as M from './models/index.js';
import {conflicts,days,recommend} from './algorithms/engine.js';
import {defaultSettings,schoolDate,weekday} from './services/time.js';

if(process.env.NODE_ENV==='production')throw Error('Development staff enrichment is disabled in production');
if(!process.env.MONGODB_URI)throw Error('Set MONGODB_URI before running development enrichment');
const teacherPassword=process.env.DEMO_TEACHER_PASSWORD||'Teacher@123';
if(teacherPassword.length<10)throw Error('DEMO_TEACHER_PASSWORD must contain at least 10 characters');

const grades=Array.from({length:10},(_,i)=>i+3);
const curriculum=new Map();
const add=(code,grade,count,stream='')=>{
 const rows=curriculum.get(code)||[];
 rows.push({grade,count,...(stream?{stream}:{})});
 curriculum.set(code,rows);
};
const elementary={ENG:6,HIN:6,MATH:7,EVS:5,COMP:2,GK:1,ART:1,PE:2};
const middle={ENG:6,HIN:5,MATH:7,SCI:6,SST:5,SANS:3,COMP:2,GK:1,ART:1,PE:2};
const secondary={ENG:6,HIN:5,MATH:7,SCI:7,SST:6,IT:2,PE:2};
for(let grade=3;grade<=5;grade++)for(const [code,count] of Object.entries(elementary))add(code,grade,count);
for(let grade=6;grade<=8;grade++)for(const [code,count] of Object.entries(middle))add(code,grade,count);
for(let grade=9;grade<=10;grade++)for(const [code,count] of Object.entries(secondary))add(code,grade,count);
for(let grade=11;grade<=12;grade++){
 for(const [code,count] of Object.entries({ENG:5,PHY:6,CHEM:6,MATH:6,BIO:6,CS:2,PE:2}))add(code,grade,count,'Science');
 for(const [code,count] of Object.entries({ENG:5,ACC:6,BST:6,ECO:5,APM:4,PE:2}))add(code,grade,count,'Commerce');
 for(const [code,count] of Object.entries({ENG:5,HIST:6,POL:6,GEO:6,ECO:5,PE:2}))add(code,grade,count,'Arts');
}
const subjectNames={
 ENG:'English',HIN:'Hindi',MATH:'Mathematics',EVS:'Environmental Studies',COMP:'Computer / Artificial Intelligence',
 GK:'General Knowledge',ART:'Art',PE:'Physical Education',SCI:'Science',SST:'Social Science',SANS:'Sanskrit',
 IT:'Information Technology / Artificial Intelligence',PHY:'Physics',CHEM:'Chemistry',BIO:'Biology',
 CS:'Computer Science',ACC:'Accountancy',BST:'Business Studies',ECO:'Economics',APM:'Mathematics / Applied Mathematics',
 HIST:'History',POL:'Political Science',GEO:'Geography'
};
const slug=value=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'.').replace(/^\.+|\.+$/g,'')||'teacher';
const missing=value=>value===undefined||value===null||value===''||(Array.isArray(value)&&value.length===0);
const streamNames=['Science','Commerce','Arts'];
function matchingSections(sections,gradesAllowed,streams=[]){
 return sections.filter(s=>gradesAllowed.includes(s.grade)&&(s.grade<11||streams.includes(s.name))).map(s=>String(s._id));
}
function teachingProfile(teacher,index){
 const title=String(teacher.designation||'').toLowerCase();
 if(/\b(ntt|pre[- ]?primary|nursery|accountant|social media|floor coordinator)\b/.test(title))return {eligible:false,primary:'',secondary:[],grades:[],streams:[]};
 if(/physics/.test(title))return {eligible:true,primary:'PHY',secondary:['SCI'],grades:[6,7,8,9,10,11,12],streams:['Science']};
 if(/chemistry/.test(title))return {eligible:true,primary:'CHEM',secondary:['SCI'],grades:[6,7,8,9,10,11,12],streams:['Science']};
 if(/biology/.test(title))return {eligible:true,primary:'BIO',secondary:['SCI'],grades:[6,7,8,9,10,11,12],streams:['Science']};
 if(/account|commerce|business/.test(title)){const primary=/account/.test(title)?'ACC':/business/.test(title)?'BST':'ECO';return {eligible:true,primary,secondary:['ACC','BST','ECO'].filter(c=>c!==primary),grades:[11,12],streams:/account|business/.test(title)?['Commerce']:['Commerce','Arts']};}
 if(/economics/.test(title))return {eligible:true,primary:'ECO',secondary:['APM'],grades:[11,12],streams:['Commerce','Arts']};
 if(/political/.test(title))return {eligible:true,primary:'POL',secondary:['HIST','GEO','SST'],grades:[6,7,8,9,10,11,12],streams:['Arts']};
 if(/history/.test(title))return {eligible:true,primary:'HIST',secondary:['SST'],grades:[6,7,8,9,10,11,12],streams:['Arts']};
 if(/geography/.test(title))return {eligible:true,primary:'GEO',secondary:['SST','HIST','POL'],grades:[6,7,8,9,10,11,12],streams:['Arts']};
 if(/social|sst|s\.s\.t/.test(title))return {eligible:true,primary:'SST',secondary:[],grades:[6,7,8,9,10],streams:[]};
 if(/computer|robot|stem|artificial intelligence/.test(title))return {eligible:true,primary:'COMP',secondary:/pgt/.test(title)?['CS','IT']:['IT'],grades:/pgt/.test(title)?[3,4,5,6,7,8,9,10,11,12]:[3,4,5,6,7,8,9,10],streams:/pgt/.test(title)?['Science']:[]};
 if(/sanskrit|skt/.test(title))return {eligible:true,primary:'SANS',secondary:[],grades:[6,7,8],streams:[]};
 if(/english|eng/.test(title)){const primaryTeacher=/\bpr(t)?\b|primary wing/.test(title);return {eligible:true,primary:'ENG',secondary:primaryTeacher?['HIN','MATH','EVS','ART','GK','PE']:/sst|social/.test(title)?['SST']:[],grades:primaryTeacher?[3,4,5]:/tgt/.test(title)?[6,7,8,9,10]:grades,streams:primaryTeacher?[]:streamNames};}
 if(/hindi/.test(title)){const primaryTeacher=/\bpr(t)?\b|primary wing/.test(title);return {eligible:true,primary:'HIN',secondary:primaryTeacher?['ENG','MATH','EVS','ART','GK','PE']:/pgt/.test(title)?['SANS']:[],grades:primaryTeacher?[3,4,5]:/tgt/.test(title)?[6,7,8,9,10]:grades,streams:primaryTeacher?[]:streamNames};}
 if(/math|mathematics/.test(title)){const primaryTeacher=/\bpr(t)?\b|primary wing/.test(title);return {eligible:true,primary:'MATH',secondary:primaryTeacher?['ENG','HIN','EVS','ART','GK','PE']:/pgt/.test(title)?['APM']:[],grades:primaryTeacher?[3,4,5]:/tgt/.test(title)?[6,7,8,9,10]:grades,streams:primaryTeacher?[]:/pgt/.test(title)?['Science','Commerce']:[]};}
 if(/\bscience\b/.test(title))return {eligible:true,primary:'SCI',secondary:[],grades:[6,7,8,9,10],streams:[]};
 if(/\bevs\b/.test(title))return {eligible:true,primary:'EVS',secondary:/\bpr(t)?\b|primary wing/.test(title)?['ENG','HIN','MATH','ART','GK','PE']:[],grades:[3,4,5],streams:[]};
 if(/\bphysical|sports|p\.e\./.test(title))return {eligible:true,primary:'PE',secondary:[],grades,streams:streamNames};
 if(/\bart\b/.test(title))return {eligible:true,primary:'ART',secondary:['GK'],grades:[3,4,5,6,7,8],streams:[]};
 if(/\bgeneral knowledge|\bgk\b/.test(title))return {eligible:true,primary:'GK',secondary:[],grades:[3,4,5,6,7,8],streams:[]};
 if(/\bpr(t)?\b|primary wing/.test(title)){
  const primary=['ENG','HIN','MATH','EVS'][index%4];
  const extras={ENG:['HIN','MATH','EVS','ART','GK','PE'],HIN:['ENG','MATH','EVS','ART','GK','PE'],MATH:['ENG','HIN','EVS','ART','GK','PE'],EVS:['ENG','HIN','MATH','ART','GK','PE']};
  return {eligible:true,primary,secondary:extras[primary],grades:[3,4,5],streams:[]};
 }
 const primary=['ENG','HIN','MATH','SCI','SST'][index%5];
 return {eligible:true,primary,secondary:[],grades:primary==='SCI'||primary==='SST'?[6,7,8,9,10]:[3,4,5,6,7,8],streams:[]};
}
function buildDevelopmentSlots(teachers,sections,subjects,requirements){
 const slots=[],teacherCells=new Set(),sectionCells=new Set(),teacherDayLoad=new Map(),teacherWeekLoad=new Map(),teacherDayPeriods=new Map(),sectionDayLoad=new Map(),subjectDayLoad=new Map();
 const counter=(map,key)=>map.get(key)||0,add=(map,key)=>map.set(key,counter(map,key)+1);
 const candidatesFor=requirement=>{
  const section=sections.find(s=>String(s._id)===requirement.sectionId);
  const subject=subjects.find(s=>String(s._id)===requirement.subjectId);
  if(!section||!subject)return [];
  return teachers.filter(t=>t.active&&t.timetableEligible!==false&&t.canTeachSubjects?.includes(subject.subjectCode)&&t.canTeachClasses?.includes(section.grade)&&(section.grade<11||t.canTeachSeniorSecondary)&&(section.type!=='COACHING'||t.canTeachCoaching)&&(!t.canTeachSections?.length||t.canTeachSections.includes(String(section._id))));
 };
 const schedulePeriods=[1,2,3,4,6,7,8,5,9];
 const ordered=[...requirements].map(r=>({...r,candidates:candidatesFor(r)})).sort((a,b)=>a.candidates.length-b.candidates.length||b.count-a.count);
 const unmet=[];
 for(const requirement of ordered){
  let missingCount=0;
  for(let n=0;n<requirement.count;n++){
   let placement=null;
   const dayOrder=[...days].sort((a,b)=>counter(sectionDayLoad,`${requirement.sectionId}:${a}`)-counter(sectionDayLoad,`${requirement.sectionId}:${b}`));
   for(const day of dayOrder){
    const daySubjectKey=`${requirement.sectionId}:${requirement.subjectId}:${day}`;
    if(counter(subjectDayLoad,daySubjectKey)>=2)continue;
    for(const period of schedulePeriods){
     const cell=`${day}:${period}`,classCell=`${cell}:${requirement.sectionId}`;
     if(sectionCells.has(classCell))continue;
     const teacherOrder=[...requirement.candidates].sort((a,b)=>
      counter(teacherWeekLoad,String(a._id))-counter(teacherWeekLoad,String(b._id))||
      counter(teacherDayLoad,`${String(a._id)}:${day}`)-counter(teacherDayLoad,`${String(b._id)}:${day}`));
     for(const teacher of teacherOrder){
      const id=String(teacher._id),dailyKey=`${id}:${day}`,dailyPeriods=teacherDayPeriods.get(dailyKey)||[];
      if(teacherCells.has(`${cell}:${id}`)||counter(teacherWeekLoad,id)>=(teacher.maximumPeriodsPerWeek||32)||counter(teacherDayLoad,dailyKey)>=(teacher.maximumPeriodsPerDay||6))continue;
      const periods=[...dailyPeriods,period].sort((a,b)=>a-b);
      let run=0,previous=0,tooManyConsecutive=false;
      for(const p of periods){run=p===previous+1?run+1:1;previous=p;if(run>(teacher.maximumConsecutivePeriods||4)){tooManyConsecutive=true;break;}}
      if(tooManyConsecutive)continue;
      placement={teacher,id,day,period,cell,classCell,daySubjectKey,dailyKey};
      break;
     }
     if(placement)break;
    }
    if(placement)break;
   }
   if(!placement){missingCount++;continue;}
   slots.push({teacherId:placement.id,sectionIds:[requirement.sectionId],subjectId:requirement.subjectId,day:placement.day,periodNumber:placement.period,type:'REGULAR',locked:false});
   teacherCells.add(`${placement.cell}:${placement.id}`);sectionCells.add(placement.classCell);
   add(teacherDayLoad,placement.dailyKey);add(teacherWeekLoad,placement.id);
   teacherDayPeriods.set(placement.dailyKey,[...(teacherDayPeriods.get(placement.dailyKey)||[]),placement.period]);
   add(sectionDayLoad,`${requirement.sectionId}:${placement.day}`);add(subjectDayLoad,placement.daySubjectKey);
  }
  if(missingCount)unmet.push({sectionId:requirement.sectionId,subjectId:requirement.subjectId,missing:missingCount,requested:requirement.count});
 }
 return {slots,unmet};
}

const changed={teachers:0,developmentLogins:0,subjects:0,classes:0,sections:0,lessons:0,attendance:0};
await mongoose.connect(process.env.MONGODB_URI);
try{
 const existingPrincipalCount=await M.User.countDocuments({role:'PRINCIPAL',active:true});
 if(!existingPrincipalCount)throw Error('No active Principal account found. Enrichment will not create or replace Principal accounts.');

 const subjects=[];
 for(const [code,subjectName] of Object.entries(subjectNames)){
  const requirements=curriculum.get(code)||[];
  const gradeList=[...new Set(requirements.map(r=>r.grade))];
  let subject=await M.Subject.findOne({subjectCode:code});
  if(!subject){
   subject=await M.Subject.create({subjectCode:code,subjectName,classesApplicable:gradeList,weeklyPeriodRequirement:requirements.length?Math.round(requirements.reduce((n,r)=>n+r.count,0)/requirements.length):1,weeklyRequirements:requirements,requiresLab:['PHY','CHEM','BIO','COMP','CS','IT'].includes(code),canHaveDoublePeriod:['PHY','CHEM','BIO','COMP','CS','IT'].includes(code),active:true,isDevelopmentData:true});
   changed.subjects++;
  }else{
   const set={};
   if(missing(subject.subjectName))set.subjectName=subjectName;
   if(missing(subject.classesApplicable))set.classesApplicable=gradeList;
   if(missing(subject.weeklyRequirements))set.weeklyRequirements=requirements;
   if(missing(subject.weeklyPeriodRequirement))set.weeklyPeriodRequirement=requirements.length?Math.round(requirements.reduce((n,r)=>n+r.count,0)/requirements.length):1;
   if(Object.keys(set).length){set.isDevelopmentData=true;subject=await M.Subject.findByIdAndUpdate(subject.id,{$set:set},{new:true,runValidators:true});changed.subjects++;}
  }
  subjects.push(subject);
 }
 const subjectByCode=new Map(subjects.map(s=>[s.subjectCode,s]));

 const sectionSpecs=[];
 for(let grade=3;grade<=12;grade++){
  let cls=await M.Class.findOne({grade});
  if(!cls){cls=await M.Class.create({name:`Class ${grade}`,grade,isDevelopmentData:true});changed.classes++;}
  const names=grade===3?['Mars','Venus','Jupiter']:grade<11?['Mars','Venus']:streamNames;
  for(const name of names){
   let section=await M.Section.findOne({grade,name});
   const type=name==='Mars'?'NON_COACHING':name==='Venus'?'COACHING':'REGULAR';
   const suffix={Mars:'M',Venus:'V',Jupiter:'J',Science:'SCI',Commerce:'COM',Arts:'ART'}[name];
   if(!section){section=await M.Section.create({name,grade,classId:cls.id,type,code:`${grade}${suffix}`,isDevelopmentData:true});changed.sections++;}
   else{
    const set={};if(missing(section.classId))set.classId=cls.id;if(missing(section.type))set.type=type;if(missing(section.code))set.code=`${grade}${suffix}`;
    if(Object.keys(set).length){set.isDevelopmentData=true;section=await M.Section.findByIdAndUpdate(section.id,{$set:set},{new:true});}
   }
   sectionSpecs.push(section);
  }
 }

 let teachers=await M.Teacher.find().sort({employeeId:1,_id:1}).lean();
 if(!teachers.length)throw Error('No existing teacher records found. This script never creates replacement teacher identities.');
 const usedIds=new Set(teachers.map(t=>t.employeeId).filter(Boolean));
 const usedEmails=new Set(teachers.map(t=>t.email?.toLowerCase()).filter(Boolean));
 for(let i=0;i<teachers.length;i++){
  const teacher=teachers[i],profile=teachingProfile(teacher,i),patch={},generated=[];
  if(missing(teacher.employeeId)){let n=i+1,id;do{id=`SRPS-T${String(n++).padStart(3,'0')}`;}while(usedIds.has(id));patch.employeeId=id;usedIds.add(id);generated.push('employeeId');}
  if(missing(teacher.email)){
   const base=`${slug(teacher.name)}@srps.demo`;let email=base,n=2;
   while(usedEmails.has(email.toLowerCase()))email=`${slug(teacher.name)}${n++}@srps.demo`;
   patch.email=email;patch.isDemoEmail=true;usedEmails.add(email.toLowerCase());generated.push('email');
  }
  if(missing(teacher.primarySubject)){patch.primarySubject=profile.primary;generated.push('primarySubject');}
  if(missing(teacher.secondarySubjects)){patch.secondarySubjects=profile.secondary;generated.push('secondarySubjects');}
  else if(teacher.developmentFields?.includes('secondarySubjects'))patch.secondarySubjects=[...new Set([...teacher.secondarySubjects,...profile.secondary])];
  const subjectCodes=[...new Set([patch.primarySubject??teacher.primarySubject,...(patch.secondarySubjects??teacher.secondarySubjects??[])].filter(Boolean))];
  if(missing(teacher.canTeachSubjects)){patch.canTeachSubjects=subjectCodes;generated.push('canTeachSubjects');}
  else if(teacher.developmentFields?.includes('canTeachSubjects'))patch.canTeachSubjects=[...new Set([...teacher.canTeachSubjects,...subjectCodes])];
  let allowedSections=profile.eligible?matchingSections(sectionSpecs,profile.grades,profile.streams):[];
  if(missing(teacher.canTeachClasses)){patch.canTeachClasses=[...new Set(sectionSpecs.filter(s=>allowedSections.includes(String(s._id))).map(s=>s.grade))];generated.push('canTeachClasses');}
  if(missing(teacher.canTeachSections)){patch.canTeachSections=allowedSections;generated.push('canTeachSections');}
  if(teacher.canTeachSeniorSecondary===undefined||teacher.canTeachSeniorSecondary===null||teacher.canTeachSeniorSecondary===false&&profile.streams.length>0&&!teacher.developmentFields?.includes('canTeachSeniorSecondary')){patch.canTeachSeniorSecondary=profile.streams.length>0;generated.push('canTeachSeniorSecondary');}
  if(teacher.canTeachCoaching===undefined||teacher.canTeachCoaching===null||teacher.canTeachCoaching===false&&profile.eligible&&profile.grades.some(g=>g<=10)&&!teacher.developmentFields?.includes('canTeachCoaching')){patch.canTeachCoaching=profile.eligible&&profile.grades.some(g=>g<=10);generated.push('canTeachCoaching');}
  if(teacher.timetableEligible===undefined||teacher.timetableEligible===null){patch.timetableEligible=profile.eligible;generated.push('timetableEligible');}
  if(missing(teacher.maximumPeriodsPerDay)){patch.maximumPeriodsPerDay=6;generated.push('maximumPeriodsPerDay');}
  if(missing(teacher.maximumPeriodsPerWeek)){patch.maximumPeriodsPerWeek=32;generated.push('maximumPeriodsPerWeek');}
  if(missing(teacher.maximumConsecutivePeriods)){patch.maximumConsecutivePeriods=4;generated.push('maximumConsecutivePeriods');}
  if(missing(teacher.preferredFreePeriods)){patch.preferredFreePeriods=[5,9];generated.push('preferredFreePeriods');}
  if(teacher.active===undefined||teacher.active===null)patch.active=true;
  if(teacher.attendanceEnabled===undefined||teacher.attendanceEnabled===null)patch.attendanceEnabled=true;
  if(teacher.qrAttendanceEnabled===undefined||teacher.qrAttendanceEnabled===null||profile.eligible&&teacher.qrAttendanceEnabled===false){patch.qrAttendanceEnabled=profile.eligible;generated.push('qrAttendanceEnabled');}
  if(generated.length){patch.isDevelopmentData=true;patch.developmentFields=[...new Set([...(teacher.developmentFields||[]),...generated])];}
  let saved=teacher;
  if(Object.keys(patch).length){saved=await M.Teacher.findByIdAndUpdate(teacher._id,{$set:patch},{new:true,runValidators:true});if(!saved)throw Error(`Unable to enrich teacher record ${teacher._id}`);changed.teachers++;}
  }

  const refreshedTeachers=await M.Teacher.find().lean();
 for(const teacher of refreshedTeachers){
  if(!teacher.timetableEligible||!teacher.email)continue;
  const linked=await M.User.findOne({$or:[{teacherId:teacher._id},{email:teacher.email}]});
  if(linked)continue;
  const passwordHash=await bcrypt.hash(teacherPassword,12);
  try{
   await M.User.create({email:teacher.email,passwordHash,role:'TEACHER',teacherId:teacher._id,active:teacher.active,isDevelopmentAccount:true});
   changed.developmentLogins++;
  }catch(e){if(e.code===11000)continue;throw e;}
 }

 let session=await M.AcademicSession.findOne({active:true});
 if(!session){session=await M.AcademicSession.findOneAndUpdate({name:'2026-27'},{$setOnInsert:{name:'2026-27',active:true,isDevelopmentData:true}},{upsert:true,new:true});}
 const minute=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
 if(!await M.BellSchedule.exists()){
  const start=480;
  await M.BellSchedule.create({name:'Development Day Schedule',active:true,periods:Array.from({length:9},(_,i)=>({number:i+1,start:minute(start+i*35+(i>=4?15:0)),end:minute(start+(i+1)*35+(i>=4?15:0))})),breaks:[{name:'Recess',start:minute(start+160),end:minute(start+180)}],isDevelopmentData:true});
 }
 for(let number=1;number<=9;number++)await M.Period.updateOne({number},{$setOnInsert:{number,label:`P${number}` }},{upsert:true});
 if(!await M.SchoolSettings.exists({key:'school'}))await M.SchoolSettings.create({key:'school',value:defaultSettings});
 for(const resource of [{name:'Science Lab',type:'LAB'},{name:'Computer Lab',type:'LAB'},{name:'Library',type:'LIBRARY'}]){
  await M.Resource.updateOne({name:resource.name},{$setOnInsert:{...resource,active:true,isDevelopmentData:true}},{upsert:true});
 }

 let timetable=await M.Timetable.findOne();
 if(!timetable||timetable.status==='DRAFT'&&!timetable.slots.length&&!timetable.publishedSlots.length||timetable.isDevelopmentData&&timetable.status==='PUBLISHED'){
  const requirements=[];
  for(const section of sectionSpecs){
   for(const [code,rows] of curriculum){
    const row=rows.find(r=>r.grade===section.grade&&(!r.stream||r.stream===section.name));
    const subject=subjectByCode.get(code);
    if(row&&subject)requirements.push({sectionId:String(section._id),subjectId:String(subject._id),count:row.count});
   }
  }
  const generated=buildDevelopmentSlots(refreshedTeachers,sectionSpecs.map(s=>s.toObject()),subjects.map(s=>s.toObject()),requirements);
  const generatedConflicts=conflicts(generated.slots,refreshedTeachers,sectionSpecs.map(s=>s.toObject()),subjects.map(s=>s.toObject()));
  if(generatedConflicts.length)throw Error(`Generated development timetable failed validation: ${generatedConflicts.slice(0,5).join('; ')}`);
  if(timetable)timetable=await M.Timetable.findByIdAndUpdate(timetable._id,{$set:{sessionId:String(session._id),status:'PUBLISHED',slots:generated.slots,publishedSlots:generated.slots,publishedAt:new Date(),isDevelopmentData:true}},{new:true});
  else timetable=await M.Timetable.create({name:'Master Timetable',sessionId:String(session._id),status:'PUBLISHED',slots:generated.slots,publishedSlots:generated.slots,publishedAt:new Date(),isDevelopmentData:true});
  changed.lessons=generated.slots.length;
  console.log(`Timetable generation report: ${generated.unmet.length} curriculum requirements remain partially unallocated.`);
  if(generated.unmet.length)console.log(`Unallocated period count: ${generated.unmet.reduce((n,r)=>n+r.missing,0)}.`);
 }

 const eligible=refreshedTeachers.filter(t=>t.timetableEligible&&t.active);
 const today=schoolDate(),todayWeekday=weekday(today);
 const nextWorking=new Date(`${today}T12:00:00Z`);
 if(!days.includes(todayWeekday))nextWorking.setUTCDate(nextWorking.getUTCDate()+((8-nextWorking.getUTCDay())%7||1));
 const nextDate=nextWorking.toISOString().slice(0,10);
 const slots=timetable.slots.map(s=>s.toObject());
 const schoolSections=sectionSpecs.map(s=>s.toObject()),schoolSubjects=subjects.map(s=>s.toObject());
 const settingsRecord=await M.SchoolSettings.findOne({key:'school'}).lean();
 const workingDays=settingsRecord?.value?.workingDays||defaultSettings.workingDays;
 const sampleDates=new Set([today,nextDate]);
 const cursor=new Date(`${today}T12:00:00Z`);
 let pastWorkingDays=0,daysSearched=0;
 while(pastWorkingDays<8&&daysSearched<370){
  cursor.setUTCDate(cursor.getUTCDate()-1);
  daysSearched++;
  const date=cursor.toISOString().slice(0,10);
  if(workingDays.includes(weekday(date))&&!await M.Holiday.exists({date})){sampleDates.add(date);pastWorkingDays++;}
 }
 const dates=[...sampleDates],teacherIds=eligible.map(t=>String(t._id));
 const existingAttendance=await M.Attendance.find({teacherId:{$in:teacherIds},date:{$in:dates}}).select('teacherId date').lean();
 const existingAttendanceKeys=new Set(existingAttendance.map(a=>`${a.teacherId}:${a.date}`));
 const attendanceOperations=[];
 for(const date of sampleDates){
  for(let i=0;i<eligible.length;i++){
   const teacher=eligible[i];
   if(existingAttendanceKeys.has(`${teacher._id}:${date}`))continue;
   const isAbsent=date!==today&&date!==nextDate&&i%17===0;
   const isLate=!isAbsent&&i%11===0;
   attendanceOperations.push({insertOne:{document:{teacherId:String(teacher._id),date,status:isAbsent?'ABSENT':isLate?'LATE':'PRESENT',checkInTime:isAbsent?undefined:new Date(`${date}T${isLate?'08:12':'08:00'}:00+05:30`),checkInMethod:'DEVELOPMENT_FIXTURE',lateMinutes:isLate?12:0,isDevelopmentData:true,notes:'DEVELOPMENT / DEMO DATA — replace with verified attendance'}}});
  }
 }
 if(attendanceOperations.length){await M.Attendance.bulkWrite(attendanceOperations);changed.attendance=attendanceOperations.length;}
 const testDay=weekday(nextDate),testSlots=slots.filter(s=>s.day===testDay);
 const scheduledTeacherIds=[...new Set(testSlots.map(s=>s.teacherId))];
 if(scheduledTeacherIds.length){
  const dayAttendance=await M.Attendance.find({date:nextDate}).lean();
  const simulatedAttendance=dayAttendance.map(a=>a.isDevelopmentData?{...a,status:'PRESENT'}:a);
  const ranked=scheduledTeacherIds.map(teacherId=>{
   const proposals=recommend({slots:timetable.publishedSlots.map(s=>s.toObject?s.toObject():s),teachers:refreshedTeachers,sections:schoolSections,subjects:schoolSubjects,attendance:simulatedAttendance,day:testDay,absentIds:[teacherId]});
   return {teacherId,coverable:proposals.filter(p=>p.candidates.length).length,affected:proposals.length};
  }).sort((a,b)=>b.coverable-a.coverable||b.affected-a.affected);
  const best=ranked[0];
  if(best){
   for(const row of dayAttendance.filter(a=>a.isDevelopmentData&&a.status==='ABSENT'&&a.teacherId!==best.teacherId)){
    await M.Attendance.updateOne({_id:row._id,isDevelopmentData:true},{$set:{status:'PRESENT',checkInTime:new Date(`${nextDate}T08:00:00+05:30`),checkInMethod:'DEVELOPMENT_FIXTURE',lateMinutes:0},$unset:{checkOutTime:1}});
   }
   const result=await M.Attendance.updateOne({teacherId:best.teacherId,date:nextDate,isDevelopmentData:true},{$set:{status:'ABSENT',checkInMethod:'DEVELOPMENT_FIXTURE',lateMinutes:0,notes:'DEVELOPMENT / DEMO DATA — sample absence for substitute testing'},$unset:{checkInTime:1,checkOutTime:1}});
   if(result.modifiedCount)changed.attendance++;
   console.log(`Sample absence scenario prepared: ${best.affected} affected lessons, ${best.coverable} with a compatible substitute candidate.`);
  }
 }
 console.log(JSON.stringify({result:'development enrichment complete',preservedExistingTeacherAndPrincipalRecords:true,changed,teachers:refreshedTeachers.length,timetableCreated:!!timetable,developmentLoginsPasswordSource:process.env.DEMO_TEACHER_PASSWORD?'DEMO_TEACHER_PASSWORD':'development-only default'}));
}finally{
 await mongoose.disconnect();
}
