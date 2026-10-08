import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import {ingest} from '../src/attendance/service.js';
import {eventInput} from '../src/attendance/policy.js';
import {app} from '../src/app.js';
import {User,Teacher,Attendance,AuditLog} from '../src/models/index.js';
import {attendanceModels,AttendanceEvent,AttendanceDevice} from '../src/attendance/models.js';
process.env.NODE_ENV='test';process.env.JWT_SECRET='isolated-face-test-jwt-secret-at-least-32';process.env.ATTENDANCE_BRIDGE_API_KEY=crypto.randomBytes(32).toString('hex');
const uri=new URL(process.env.TEST_MONGODB_URI||'mongodb://127.0.0.1:27028');if(!['127.0.0.1','localhost','[::1]'].includes(uri.hostname))throw Error('Use isolated local MongoDB');uri.pathname='/srps_face_test_'+crypto.randomBytes(8).toString('hex');
await mongoose.connect(uri.toString(),{serverSelectionTimeoutMS:5000});await Promise.all([...attendanceModels,Attendance].map(m=>m.init()));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api/attendance`;let adminToken;
async function request(path,body,token=adminToken,method=body?'POST':'GET',key){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...token&&{Authorization:'Bearer '+token},...key&&{'X-SRPS-Bridge-Key':key}},...body&&{body:JSON.stringify(body)}});return {status:response.status,...await response.json()};}
const event={bridgeId:'SRPS-T304-BRIDGE-01',deviceModel:'Realtime Pro T304 mini',deviceSerial:'RSS202506122297',machineNumber:1,eventType:'Time Log',deviceUserId:'12',method:'FACE',eventTimestamp:'2026-01-05T08:15:00+05:30',receivedAt:'2026-01-05T02:46:00Z',source:'REALTIME_EVENT'};
const send=e=>request('/device/events',e,undefined,'POST',process.env.ATTENDANCE_BRIDGE_API_KEY);
try{
 const principal=await User.create({email:'principal@example.test',role:'PRINCIPAL'}),teacherUser=await User.create({email:'teacher@example.test',role:'TEACHER'}),coordinator=await User.create({email:'coordinator@example.test',role:'TIMETABLE_COORDINATOR'});adminToken=jwt.sign({id:principal.id},process.env.JWT_SECRET);const token=u=>jwt.sign({id:u.id},process.env.JWT_SECRET);
 const teacher=await Teacher.create({employeeId:'F001',name:'Face Test',email:'face@example.test'});
 assert.equal((await request('/device/events',event,null)).status,401);
 assert.equal((await request('/devices',undefined,token(teacherUser))).status,403);
 assert.equal((await request('/devices',{name:'x'},token(coordinator))).status,403);
 const device=await request('/devices',{name:'SRPS Main Face Attendance',model:event.deviceModel,serialNumber:event.deviceSerial,machineNumber:1,bridgeId:event.bridgeId,port:5005});assert.equal(device.status,200,JSON.stringify(device));
 assert.equal((await send({...event,photo:'should-not-be-accepted'})).status,400);
 assert.equal((await send({...event,bridgeId:'unknown'})).status,403);
 assert.equal((await send({...event,source:'MOCK'})).status,403);
 assert.equal((await send(event)).data.processingStatus,'UNMAPPED');assert.equal(await Attendance.countDocuments(),0);
 const initialPolicy=(await request('/settings')).data;await request('/settings',{...initialPolicy,realtimeFaceConfirmed:true},adminToken,'PUT');
 const map=await request('/mappings',{teacherId:teacher.id,deviceSerial:event.deviceSerial,deviceUserId:'0012'});assert.equal(map.status,200,JSON.stringify(map));assert.equal((await request('/mappings',{teacherId:teacher.id,deviceSerial:event.deviceSerial,deviceUserId:'12'})).status,409);
 const rep=await request(`/mappings/${map.data._id}/reprocess`,{});assert.equal(rep.data.processed,1,JSON.stringify(rep));
 const repeat=await Promise.all(Array.from({length:12},()=>send(event)));assert(repeat.every(r=>r.status===200&&r.data.duplicate));assert.equal(await AttendanceEvent.countDocuments(),1);
 let day=await Attendance.findOne({teacherId:teacher.id,date:'2026-01-05'});assert.equal(day.totalEvents,1);assert.equal(day.status,'LATE');assert.equal(day.checkOutTime,undefined);
 const out={...event,eventTimestamp:'2026-01-05T14:00:00+05:30'};const early={...event,eventTimestamp:'2026-01-05T07:55:00+05:30'};
 const concurrent=await Promise.all([send(out),send(early),send(out),send(early)]);assert(concurrent.every(r=>r.status===200),JSON.stringify(concurrent));day=await Attendance.findOne({teacherId:teacher.id,date:'2026-01-05'});assert.equal(day.totalEvents,3);assert.equal(day.status,'PRESENT');assert.equal(day.checkInTime.toISOString(),'2026-01-05T02:25:00.000Z');assert.equal(day.checkOutTime.toISOString(),'2026-01-05T08:30:00.000Z');
 // Simulate process interruption after daily aggregation but before final event acknowledgement.
 await AttendanceEvent.updateOne({eventTimestamp:new Date(out.eventTimestamp)},{$set:{processingStatus:'PENDING'}});await send(out);assert.equal((await Attendance.findById(day._id)).totalEvents,3);
 const correction=await request('/adjustments',{teacherId:teacher.id,date:'2026-01-05',status:'HALF_DAY',adjustmentReason:'Approved correction',checkInTime:null,checkOutTime:null});assert.equal(correction.status,200,JSON.stringify(correction));await send({...event,eventTimestamp:'2026-01-05T15:00:00+05:30'});day=await Attendance.findById(day._id);assert.equal(day.status,'HALF_DAY');assert.equal(day.checkInTime,null);assert.equal(day.totalEvents,4);assert.equal(await AuditLog.countDocuments({action:'MANUAL_ADJUSTMENT'}),1);
 const historical=await send({...event,eventTimestamp:'2026-01-06T08:00:00+05:30',source:'HISTORICAL_LOG',method:'UNVERIFIED',verificationModeCodeRaw:900});assert.equal(historical.data.processingStatus,'REVIEW');assert.equal(await Attendance.countDocuments({date:'2026-01-06'}),0);
 const policy=(await request('/settings')).data;assert.equal((await request('/settings',{...policy,fallbackFaceConfirmed:true},adminToken,'PUT')).status,200);await request(`/mappings/${map.data._id}/reprocess`,{});assert.equal(await Attendance.countDocuments({date:'2026-01-06'}),1);
 assert.equal((await send({...event,eventTimestamp:'2026-01-06T18:30:00Z'})).status,200);assert.equal(await Attendance.countDocuments({date:'2026-01-07'}),1);
 const heartbeat=await request('/device/heartbeat',{bridgeId:event.bridgeId,deviceModel:event.deviceModel,deviceSerial:event.deviceSerial,machineNumber:1,connected:true,deviceIp:'192.168.2.2',pendingQueueCount:3,bridgeVersion:'test',timestamp:new Date().toISOString()},null,'POST',process.env.ATTENDANCE_BRIDGE_API_KEY);assert.equal(heartbeat.status,200);assert.equal((await request('/devices')).data[0].connectionStatus,'ONLINE');
 assert.equal((await request('/daily?date=2026-01-05')).data.rows[0].status,'HALF_DAY');assert.equal((await request('/monthly?month=2026-01')).status,200);assert.equal((await request('/monthly?month=2026-13')).status,400);
 assert.equal(await AttendanceEvent.countDocuments({photo:{$exists:true}}),0);
 // Isolated synthetic pipeline test, NOT a verified FkWeb protocol fixture.
 await AttendanceDevice.updateOne({serialNumber:event.deviceSerial},{$set:{fkwebProtocolVerified:true}});
 const count=await AttendanceEvent.countDocuments();const cross=await ingest(eventInput.parse({...out,bridgeId:undefined,source:'FKWEB',rawEventId:'synthetic-test-only'}));assert.equal(cross.duplicate,true);assert.equal(await AttendanceEvent.countDocuments(),count);const shared=await AttendanceEvent.findById(cross.eventId);assert(shared.sourcesSeen.includes('FKWEB'));assert(shared.sourcesSeen.includes('SBXPC_REALTIME'));assert(shared.nativeEventIds.includes('synthetic-test-only'));
 assert.equal((await send({...event,source:'FKWEB'})).status,400);
 console.log('PASS face integration: auth, roles, validation, mapping, concurrent deduplication, out-of-order logs, crash retry, manual preservation, fallback review, IST grouping, heartbeat and reports');
}finally{await new Promise(r=>server.close(r));await mongoose.connection.dropDatabase();await mongoose.disconnect();}
