import * as M from './models/index.js';
import {buildReferenceImport,sourceName,sourceType} from './handwritten-reference.js';

export async function importHandwrittenReference(createdBy='system'){
 let timetable=await M.Timetable.findOne();
 if(timetable?.sourceType===sourceType&&timetable.slots.some(slot=>slot.sourceType===sourceType)){
  return {timetable,summary:summarize(timetable.slots.filter(slot=>slot.sourceType===sourceType)),alreadyImported:true};
 }
 const [teachers,sections,subjects]=await Promise.all([M.Teacher.find().lean(),M.Section.find().lean(),M.Subject.find().lean()]);
 const {teacherOrder,slots}=buildReferenceImport(teachers,sections,subjects);
 if(timetable){
  const previous=await M.TimetableVersion.exists({timetableId:String(timetable._id),sourceType:'PRE_HANDWRITTEN_IMPORT'});
  if(!previous)await M.TimetableVersion.create({
   timetableId:String(timetable._id),revision:timetable.revision,versionNumber:-1,
   label:'Pre-import working timetable',sourceType:'PRE_HANDWRITTEN_IMPORT',
   dayType:timetable.dayType||'WEEKLY',weekdayVerified:timetable.weekdayVerified,
   verifiedWeekday:timetable.verifiedWeekday,teacherOrder:timetable.teacherOrder||[],
   slots:timetable.slots,publishedSlots:timetable.publishedSlots,createdBy,immutable:true
  });
 }
 const timetableId=timetable?String(timetable._id):'pending';
 const snapshotExists=await M.TimetableVersion.exists({timetableId,sourceType,versionNumber:0,immutable:true});
 if(!snapshotExists)await M.TimetableVersion.create({
  timetableId,revision:0,versionNumber:0,label:sourceName,sourceType,
  dayType:'REFERENCE_DAY',weekdayVerified:false,teacherOrder,slots,
  publishedSlots:[],createdBy,immutable:true
 });
 if(!await M.TimetableVersion.exists({timetableId,sourceType,versionNumber:1}))await M.TimetableVersion.create({
  timetableId,revision:1,versionNumber:1,label:'Working Timetable - initial editable copy',
  sourceType,dayType:'REFERENCE_DAY',weekdayVerified:false,teacherOrder,slots,
  publishedSlots:[],createdBy,immutable:true
 });
 if(timetable){
  timetable.name='Working Timetable';
  timetable.status='DRAFT';
  timetable.dayType='REFERENCE_DAY';
  timetable.sourceType=sourceType;
  timetable.sourceDay='UNVERIFIED';
  timetable.weekdayVerified=false;
  timetable.needsWeekdayReview=true;
  timetable.verifiedWeekday=undefined;
  timetable.teacherOrder=teacherOrder;
  timetable.slots=slots;
  timetable.publishedSlots=[];
  timetable.publishedAt=undefined;
  timetable.revision=(timetable.revision||0)+1;
  await timetable.save();
 }else{
  timetable=await M.Timetable.create({
   name:'Working Timetable',status:'DRAFT',revision:1,dayType:'REFERENCE_DAY',
   sourceType,sourceDay:'UNVERIFIED',weekdayVerified:false,needsWeekdayReview:true,
   teacherOrder,slots,publishedSlots:[]
  });
  await M.TimetableVersion.updateMany(
   {timetableId:'pending',sourceType,immutable:true},
   {$set:{timetableId:String(timetable._id)}}
  );
 }
 const summary=summarize(slots);
 await M.AuditLog.create({
  user:createdBy,action:'IMPORT_HANDWRITTEN_REFERENCE',entity:'timetable',
  entityId:String(timetable._id),oldValue:{preservedAsVersion:'Pre-import working timetable'},
  newValue:{sourceType,sourceDay:'UNVERIFIED',...summary}
 });
 return {timetable,summary,alreadyImported:false};
}

export function summarize(slots){
 return {
  totalCells:slots.length,
  verifiedCells:slots.filter(s=>s.confidence==='VERIFIED_VISIBLE').length,
  highConfidenceCells:slots.filter(s=>s.confidence==='HIGH_CONFIDENCE').length,
  needsReviewCells:slots.filter(s=>s.needsReview).length,
  temporaryDummyCells:slots.filter(s=>s.confidence==='TEMPORARY_DUMMY').length,
  freeCells:slots.filter(s=>s.type==='FREE').length,
  combinedCells:slots.filter(s=>s.type==='COMBINED').length
 };
}
