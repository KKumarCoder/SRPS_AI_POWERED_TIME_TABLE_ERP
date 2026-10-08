import mongoose from 'mongoose';
import {Attendance,Teacher,SchoolSettings,Holiday,Leave} from '../models/index.js';
import {settings} from '../services/qr.js';
import {weekday} from '../services/time.js';
import {AttendanceDevice,TeacherDeviceMapping,AttendanceEvent} from './models.js';
import {istDate,eventHash,deviceStatus,eventInput} from './policy.js';
export const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export async function getPolicy(){const school=await settings();return {attendanceStartTime:school.normalArrival,lateGraceMinutes:school.graceMinutes,minimumWorkingMinutes:0,checkoutRequired:false,deviceTimezone:'Asia/Kolkata',heartbeatTimeoutSeconds:90,realtimeFaceConfirmed:false,fallbackFaceConfirmed:false,...(await SchoolSettings.findOne({key:'face-attendance'}))?.value};}
export async function identifyDevice(input){const device=await AttendanceDevice.findOne({serialNumber:input.deviceSerial,...(input.source==='FKWEB'?{fkwebProtocolVerified:true}:{bridgeId:input.bridgeId||''}),machineNumber:input.machineNumber,active:true});if(!device)throw fail('Unknown or disabled attendance device / bridge',403);return device;}
export async function processEvent(event){
 if(event.processingStatus==='PROCESSED')return event;
 const policy=await getPolicy();
 const mapping=await TeacherDeviceMapping.findOne({deviceSerial:event.deviceSerial,deviceUserId:event.deviceUserId,active:true});
 const mark=async(status,note)=>AttendanceEvent.findByIdAndUpdate(event._id,{$set:{processingStatus:status,processingNote:note}},{new:true});
 if(!mapping&&!event.teacherId)return mark('UNMAPPED','Map this device user to a teacher, then reprocess.');
 // Once assigned, an event remains bound to that teacher even if a mapping changes later.
 if(!event.teacherId)event=await AttendanceEvent.findOneAndUpdate({_id:event._id,teacherId:{$exists:false}},{$set:{teacherId:mapping.teacherId}},{new:true})||await AttendanceEvent.findById(event._id);
 const teacher=await Teacher.findById(event.teacherId);
 if(!teacher?.active||!teacher.attendanceEnabled)return mark('REVIEW','Teacher is inactive or attendance is disabled.');
 const verifiedFkweb=event.sourcesSeen?.includes('FKWEB')&&await AttendanceDevice.exists({serialNumber:event.deviceSerial,fkwebProtocolVerified:true});
 if(!verifiedFkweb&&event.source==='SBXPC_REALTIME'&&!policy.realtimeFaceConfirmed&&!event.isMock)return mark('REVIEW','Confirm realtime FACE behavior on the physical T304 mini in settings.');
 if(!verifiedFkweb&&event.source==='SBXPC_SYNC'&&!policy.fallbackFaceConfirmed)return mark('REVIEW','Confirm fallback verification behavior on the physical T304 mini in settings.');
 const date=istDate(event.eventTimestamp),teacherId=event.teacherId;
 const existing=await Attendance.findOne({teacherId,date});
 if(existing?.checkInMethod&& !['FACE','ADMIN_OVERRIDE'].includes(existing.checkInMethod))return mark('REVIEW','Another attendance method already owns this day. Review manually.');
 if(existing&&['ABSENT','LEAVE'].includes(existing.status)&&!existing.manualOverride)return mark('REVIEW','Existing absence or leave needs manual review.');
 if(await Leave.exists({teacherId,status:'APPROVED',fromDate:{$lte:date},toDate:{$gte:date}}))return mark('REVIEW','Approved leave conflicts with a device event.');
 const at=event.eventTimestamp,threshold=new Date(`${date}T${policy.attendanceStartTime}:00+05:30`);
 threshold.setMinutes(threshold.getMinutes()+policy.lateGraceMinutes);
 const preserve={$or:[{$eq:['$manualOverride',true]},{$eq:['$manuallyAdjusted',true]}]};
 const computed={checkInTime:'$faceFirstCheckIn',checkOutTime:{$cond:[{$gt:['$totalEvents',1]},'$faceLastSeen','$$REMOVE']},checkInMethod:'FACE',checkOutMethod:{$cond:[{$gt:['$totalEvents',1]},'FACE','$$REMOVE']},lateMinutes:{$max:[0,{$floor:{$divide:[{$subtract:['$faceFirstCheckIn',threshold]},60000]}}]},workingMinutes:{$floor:{$divide:[{$subtract:['$faceLastSeen','$faceFirstCheckIn']},60000]}},checkoutMissing:{$and:[policy.checkoutRequired,{$lt:['$totalEvents',2]}]}};
 const pipeline=[{$set:{teacherId,date,createdAt:{$ifNull:['$createdAt','$$NOW']},faceEventIds:{$setUnion:[{$ifNull:['$faceEventIds',[]]},[event.id]]},faceFirstCheckIn:{$min:[{$ifNull:['$faceFirstCheckIn',at]},at]},faceLastSeen:{$max:[{$ifNull:['$faceLastSeen',at]},at]},methods:{$setUnion:[{$ifNull:['$methods',[]]},['FACE']]},deviceSerials:{$setUnion:[{$ifNull:['$deviceSerials',[]]},[event.deviceSerial]]}}},{$set:{totalEvents:{$size:'$faceEventIds'}}},{$set:Object.fromEntries(Object.entries(computed).map(([k,v])=>[k,{$cond:[preserve,`$${k}`,v]}]))},{$set:{status:{$cond:[preserve,'$status',{$cond:[{$gt:['$lateMinutes',0]},'LATE','PRESENT']}]},earlyLeaveMinutes:{$cond:[preserve,'$earlyLeaveMinutes',{$cond:[{$gt:['$totalEvents',1]},{$max:[0,{$subtract:[policy.minimumWorkingMinutes,'$workingMinutes']}]},0]}]},updatedAt:'$$NOW'}}];
 // Atomic aggregation + set union makes retries safe across processes and after partial failures.
 const query={teacherId,date,$or:[{checkInMethod:{$exists:false}},{checkInMethod:{$in:['FACE','ADMIN_OVERRIDE']}}]};
 try{await Attendance.findOneAndUpdate(query,pipeline,{upsert:true,new:true});}catch(e){if(e.code!==11000)throw e;const now=await Attendance.findOne({teacherId,date});if(now?.checkInMethod&&!['FACE','ADMIN_OVERRIDE'].includes(now.checkInMethod))return mark('REVIEW','Another attendance method owns this day.');await Attendance.findOneAndUpdate(query,pipeline,{new:true});}
 return AttendanceEvent.findByIdAndUpdate(event._id,{$set:{processingStatus:'PROCESSED',resolvedMethod:'FACE',processingNote:'',processedAt:new Date()}},{new:true});
}
export async function ingest(input){
 input=eventInput.parse(input);
 await identifyDevice(input);
 const hash=eventHash(input);let event,duplicate=false;
 try{event=await AttendanceEvent.create({...input,sourcesSeen:[input.source],nativeEventIds:input.rawEventId?[input.rawEventId]:[],eventHash:hash,bridgeReceivedAt:input.receivedAt,receivedAt:new Date()});}catch(e){if(e.code!==11000)throw e;event=await AttendanceEvent.findOne({eventHash:hash});duplicate=true;}
 await AttendanceEvent.updateOne({_id:event._id},{$addToSet:{sourcesSeen:input.source,...(input.rawEventId?{nativeEventIds:input.rawEventId}:{})}});
 event=await processEvent(await AttendanceEvent.findById(event._id));
 await AttendanceDevice.updateOne({serialNumber:input.deviceSerial},{$max:{lastEventAt:new Date(input.eventTimestamp),lastAttendanceEventAt:new Date(input.eventTimestamp),...(input.source==='SBXPC_SYNC'?{lastSbxpcSyncAt:new Date()}:{}),...(input.source==='FKWEB'?{lastFkWebRequestAt:new Date()}: {})}});
 return {eventId:event.id,duplicate,processingStatus:event.processingStatus};
}
export async function devices(){const policy=await getPolicy();return (await AttendanceDevice.find().lean()).map(d=>deviceStatus(d,policy.heartbeatTimeoutSeconds));}
export async function reprocess(mapping,after){
 const events=await AttendanceEvent.find({...(after?{_id:{$gt:new mongoose.Types.ObjectId(after)}}:{}),deviceSerial:mapping.deviceSerial,deviceUserId:mapping.deviceUserId,processingStatus:{$ne:'PROCESSED'},$or:[{teacherId:{$exists:false}},{teacherId:mapping.teacherId}]}).sort({_id:1}).limit(500);
 const counts={attempted:events.length,processed:0,review:0,nextAfter:events.length===500?events[events.length-1].id:null};for(const e of events){const result=await processEvent(e);if(result.processingStatus==='PROCESSED')counts.processed++;else counts.review++;}return counts;
}
export async function daily(date,teacherId,now=new Date()){
 const [school,teachers,records,holiday,leaves]=await Promise.all([settings(),Teacher.find({active:true,attendanceEnabled:true,...(teacherId?{_id:teacherId}:{})}).lean(),Attendance.find({date,...(teacherId?{teacherId}:{})}).lean(),Holiday.exists({date}),Leave.find({status:'APPROVED',fromDate:{$lte:date},toDate:{$gte:date}}).lean()]);
 const workingDay=school.workingDays.includes(weekday(date))&&!holiday;
 const closed=+now>=Date.parse(`${date}T${school.cutoff}:00+05:30`);
 const rows=teachers.filter(t=>!t.joiningDate||t.joiningDate<=date).map(t=>{const row=records.find(r=>r.teacherId===String(t._id));const leave=leaves.some(l=>l.teacherId===String(t._id));return {teacherId:String(t._id),name:t.name,employeeId:t.employeeId,date,status:row?.status||(leave?'LEAVE':!workingDay?'NON_WORKING':closed?'ABSENT':'NOT_MARKED'),...row};});
 const counts={PRESENT:0,LATE:0,ABSENT:0,LEAVE:0,HALF_DAY:0,NOT_MARKED:0,NON_WORKING:0};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;
 return {date,workingDay:!!workingDay,closed,rows,counts};
}
export async function monthly(month,teacherId){
 const days=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).getUTCDate();const rows=new Map();const dates=[];
 for(let d=1;d<=days;d++){const date=`${month}-${String(d).padStart(2,'0')}`;if(date>istDate(new Date()))break;const report=await daily(date,teacherId);if(!report.workingDay)continue;dates.push(date);for(const r of report.rows){let item=rows.get(r.teacherId);if(!item){item={teacherId:r.teacherId,name:r.name,employeeId:r.employeeId,present:0,late:0,absent:0,leave:0,halfDay:0,notMarked:0,workingDays:0,records:[]};rows.set(r.teacherId,item);}item.workingDays++;const key={PRESENT:'present',LATE:'late',ABSENT:'absent',LEAVE:'leave',HALF_DAY:'halfDay',NOT_MARKED:'notMarked'}[r.status];if(key)item[key]++;item.records.push(r);}}
 return {month,workingDates:dates,rows:[...rows.values()].map(r=>({...r,attendancePercentage:r.workingDays?Math.round((r.present+r.late+r.halfDay*0.5)/r.workingDays*10000)/100:0}))};
}
