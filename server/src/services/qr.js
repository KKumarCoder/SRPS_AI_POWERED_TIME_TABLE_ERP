import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import nodemailer from 'nodemailer';
import {AttendanceQRToken,Teacher,Attendance,Leave,Holiday,SchoolSettings,EmailLog} from '../models/index.js';
import {schoolDate,schoolTime,weekday,minutes,defaultSettings} from './time.js';
export const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
export const settings=async()=>({...defaultSettings,...(await SchoolSettings.findOne({key:'school'}))?.value});
export function verifyToken(token){return jwt.verify(token,process.env.QR_SIGNING_SECRET,{algorithms:['HS256'],audience:'srps-attendance',issuer:'srps'});}
export async function issue(teacherId,date=schoolDate()){
 const t=await Teacher.findById(teacherId);if(!t?.active||!t.qrAttendanceEnabled||!t.attendanceEnabled)throw Object.assign(new Error('QR attendance is disabled for this teacher'),{status:400});
 const nonce=crypto.randomBytes(32).toString('hex');const expiresAt=new Date(Date.now()+36*3600000);
 await AttendanceQRToken.findOneAndUpdate({teacherId,date},{$set:{nonceHash:hash(nonce),expiresAt,active:true}},{upsert:true});
 const token=jwt.sign({teacherId,date,nonce,type:'DAILY'},process.env.QR_SIGNING_SECRET,{expiresIn:'36h',audience:'srps-attendance',issuer:'srps'});
 return {token,image:await QRCode.toDataURL(token),teacher:t,date};
}
export async function scan(token){
 let payload;try{payload=verifyToken(token);}catch{throw Object.assign(new Error('Invalid, tampered or expired QR'),{status:400});}
 const date=schoolDate(),time=schoolTime(),cfg=await settings();if(payload.date!==date)throw Object.assign(new Error('QR belongs to a different date'),{status:400});
 if(!cfg.workingDays.includes(weekday(date))||await Holiday.exists({date}))throw Object.assign(new Error('Attendance is closed on this day'),{status:400});
 const valid=await AttendanceQRToken.exists({teacherId:payload.teacherId,date,nonceHash:hash(payload.nonce),active:true,expiresAt:{$gt:new Date()}});if(!valid)throw Object.assign(new Error('QR was replaced or revoked'),{status:400});
 const teacher=await Teacher.findById(payload.teacherId);if(!teacher?.active||!teacher.attendanceEnabled||!teacher.qrAttendanceEnabled)throw Object.assign(new Error('Teacher attendance disabled'),{status:400});
 if(await Leave.exists({teacherId:payload.teacherId,status:'APPROVED',fromDate:{$lte:date},toDate:{$gte:date}}))throw Object.assign(new Error('Approved leave: ask the Principal to review attendance'),{status:409});
 const previous=await Attendance.findOne({teacherId:payload.teacherId,date});if(previous&&['ABSENT','LEAVE'].includes(previous.status))throw Object.assign(new Error('Absence/leave recorded: Principal review required'),{status:409});
 const checkIn=time>=cfg.checkInStart&&time<=cfg.checkInEnd,checkOut=time>=cfg.checkOutStart&&time<=cfg.checkOutEnd;
 if(!checkIn&&!checkOut)throw Object.assign(new Error('Outside attendance window'),{status:400});
 let record;
 if(checkIn){const lateMinutes=Math.max(0,minutes(time)-minutes(cfg.normalArrival)-Number(cfg.graceMinutes));
 try{record=await Attendance.findOneAndUpdate({teacherId:payload.teacherId,date,checkInTime:{$exists:false}},{$set:{status:lateMinutes?'LATE':'PRESENT',checkInTime:new Date(),checkInMethod:'QR',lateMinutes}},{upsert:true,new:true});}catch(e){if(e.code===11000)throw Object.assign(new Error('Check-in already recorded'),{status:409});throw e;}}
 else{record=await Attendance.findOneAndUpdate({teacherId:payload.teacherId,date,checkInTime:{$exists:true},checkOutTime:{$exists:false}},{$set:{checkOutTime:new Date(),checkOutMethod:'QR'}},{new:true});if(!record)throw Object.assign(new Error(previous?.checkOutTime?'Check-out already recorded':'Check in before checking out'),{status:409});}
 return {teacher,record,operation:checkIn?'CHECK-IN':'CHECK-OUT'};
}
export async function emailQR(teacherId){const date=schoolDate(),cfg=await settings();if(!cfg.workingDays.includes(weekday(date))||await Holiday.exists({date}))throw Object.assign(new Error('No QR emails on a non-working day'),{status:400});
 if(process.env.EMAIL_SENDING_ENABLED!=='true')throw Object.assign(new Error('Outbound email is disabled. Set EMAIL_SENDING_ENABLED=true after verifying SMTP settings.'),{status:503});
 if(!process.env.SMTP_HOST)throw Object.assign(new Error('SMTP is not configured. Configure server environment before sending.'),{status:503});
 const q=await issue(teacherId);const log=await EmailLog.create({teacherId,date,to:q.teacher.email,status:'pending',type:'DAILY_QR'});
 try{const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}:undefined});await transport.sendMail({from:process.env.SMTP_FROM,to:q.teacher.email,subject:`SRPS Staff Attendance QR — ${date}`,text:`Dear ${q.teacher.name}, present the attached QR at the school scanner. Check-in ${cfg.checkInStart}–${cfg.checkInEnd}; check-out ${cfg.checkOutStart}–${cfg.checkOutEnd}. Employee ID: ${q.teacher.employeeId}.`,attachments:[{filename:'attendance-qr.png',content:Buffer.from(q.image.split(',')[1],'base64')}]});log.status='sent';await log.save();}catch(e){log.status='failed';log.error=e.message;await log.save();throw e;}return log;
}
