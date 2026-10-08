// Explicit opt-in integration suite: uses a dedicated database and removes only its own fixtures.
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import {app} from '../src/app.js';
import * as M from '../src/models/index.js';
import {scan,issue} from '../src/services/qr.js';
import {schoolDate,defaultSettings} from '../src/services/time.js';
const uri=new URL(process.env.MONGODB_URI);uri.pathname='/srps_integration_test';await mongoose.connect(uri.toString());
for(const Model of Object.values(M))if(typeof Model?.deleteMany==='function')await Model.deleteMany({});
await Promise.all([M.Attendance.init(),M.AttendanceQRToken.init(),M.Substitution.init()]);
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}/api`;
let token;async function request(path,method='GET',body){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
try{
 await M.User.create({email:'test@srps.local',passwordHash:await bcrypt.hash('Test-password-123',10),role:'PRINCIPAL'});
 assert.equal((await request('/teachers')).status,401);const login=await request('/auth/login','POST',{email:'test@srps.local',password:'Test-password-123'});assert.equal(login.status,200);token=login.body.data.token;
 const teacher=await M.Teacher.create({employeeId:'TEST001',name:'Test Teacher',email:'teacher-test@srps.local',canTeachSubjects:['ENG'],canTeachClasses:[10],maximumPeriodsPerDay:7,maximumPeriodsPerWeek:36,maximumConsecutivePeriods:4,canTeachCoaching:true,active:true});
 await M.SchoolSettings.create({key:'school',value:{...defaultSettings,workingDays:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],checkInStart:'00:00',checkInEnd:'23:59',checkOutStart:'23:59',checkOutEnd:'23:59'}});
 const q=await issue(teacher.id);const results=await Promise.allSettled([scan(q.token),scan(q.token)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(await M.Attendance.countDocuments(),1);console.log('PASS concurrent duplicate attendance protection');
 const newQr=await issue(teacher.id);await assert.rejects(()=>scan(q.token),/replaced or revoked/);console.log('PASS regenerated QR revokes previous token');
 await M.Attendance.deleteMany({});await M.Teacher.updateOne({_id:teacher.id},{active:false});await assert.rejects(()=>scan(newQr.token),/disabled/);await M.Teacher.updateOne({_id:teacher.id},{active:true});
 await M.Leave.create({teacherId:teacher.id,fromDate:schoolDate(),toDate:schoolDate(),status:'APPROVED'});await assert.rejects(()=>scan(newQr.token),/Approved leave/);await M.Leave.deleteMany({});
 await M.Holiday.create({name:'Test holiday',date:schoolDate()});await assert.rejects(()=>scan(newQr.token),/closed/);await M.Holiday.deleteMany({});
 const wrong=await issue(teacher.id,'2020-01-01');await assert.rejects(()=>scan(wrong.token),/different date/);console.log('PASS date, holiday, leave and inactive-teacher validation');
 const sec=await M.Section.create({name:'Mars',grade:10,type:'NON_COACHING'}),sub=await M.Subject.create({subjectCode:'ENG',subjectName:'English',classesApplicable:[10]});
 const slot={teacherId:teacher.id,sectionIds:[sec.id],subjectId:sub.id,day:'Monday',periodNumber:1,type:'REGULAR',locked:false};const tt=await M.Timetable.create({name:'Test',slots:[],publishedSlots:[]});
 assert.equal((await request(`/timetables/${tt.id}`,'PUT',{slots:[slot],revision:0})).status,200);assert.equal((await request(`/timetables/${tt.id}`,'PUT',{slots:[],revision:0})).status,409);
 assert.equal((await request(`/timetables/${tt.id}`,'PUT',{slots:[{...slot,locked:true}],revision:1})).status,200);assert.equal((await request(`/timetables/${tt.id}`,'PUT',{slots:[],revision:2})).status,409);
 assert.equal((await request(`/timetables/${tt.id}/publish`,'POST',{revision:2})).status,200);assert.equal(await M.TimetableVersion.countDocuments(),1);console.log('PASS revision, lock and publication/version safeguards');
 assert.equal((await request('/attendance/manual','POST',{teacherId:teacher.id,date:schoolDate(),status:'ABSENT',overrideReason:''})).status,400);
 assert.equal((await request('/attendance/manual','POST',{teacherId:teacher.id,date:schoolDate(),status:'ABSENT',overrideReason:'Test reason'})).status,200);assert.equal((await request('/attendance/reports/monthly?month='+schoolDate().slice(0,7))).status,200);
 await M.User.create({email:'restricted@srps.local',role:'TEACHER',teacherId:teacher.id,passwordHash:await bcrypt.hash('Test-password-123',10)});token=(await request('/auth/login','POST',{email:'restricted@srps.local',password:'Test-password-123'})).body.data.token;assert.equal((await request('/teachers')).status,403);assert.equal((await request('/portal')).status,200);console.log('PASS attendance overrides, report, teacher role isolation');
 console.log('All integration checks passed.');
}finally{await new Promise(r=>server.close(r));for(const Model of Object.values(M))if(typeof Model?.deleteMany==='function')await Model.deleteMany({});await mongoose.disconnect();}
