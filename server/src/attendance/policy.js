import crypto from 'node:crypto';
import {z} from 'zod';
export const istDate=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export const eventHash=e=>crypto.createHash('sha256').update(JSON.stringify([e.deviceSerial,e.deviceUserId,new Date(e.eventTimestamp).toISOString(),e.eventType])).digest('hex');
const text=z.string().max(128);
export const timestamp=z.iso.datetime({offset:true}).refine(v=>Number.isFinite(Date.parse(v)),'Invalid timestamp');
export const eventInput=z.object({
 bridgeId:text.min(1).optional(),deviceModel:z.literal('Realtime Pro T304 mini'),deviceSerial:text.min(1),machineNumber:z.number().int().positive(),
 eventType:z.literal('Time Log'),deviceUserId:z.string().regex(/^\d{1,12}$/).transform(s=>BigInt(s).toString()),
 attendanceStatusRaw:text.default(''),verificationModeRaw:text.default(''),antipassStatusRaw:text.default(''),
 verificationModeCodeRaw:z.number().int().optional(),terminalMachineNumberRaw:z.number().int().optional(),enrollmentMachineNumberRaw:z.number().int().optional(),
 method:z.enum(['FACE','UNVERIFIED']),eventTimestamp:timestamp,receivedAt:timestamp,
 rawEventId:text.optional(),isMock:z.boolean().default(false),
 source:z.enum(['FKWEB','SBXPC_REALTIME','SBXPC_SYNC','REALTIME_EVENT','HISTORICAL_LOG','MOCK'])
}).strict().refine(e=>Date.parse(e.eventTimestamp)<=Date.now()+300000,'Event timestamp is more than five minutes in the future').transform(e=>({...e,isMock:e.isMock||e.source==='MOCK',source:({REALTIME_EVENT:'SBXPC_REALTIME',HISTORICAL_LOG:'SBXPC_SYNC',MOCK:'SBXPC_REALTIME'})[e.source]||e.source}));
const clock=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const policyInput=z.object({attendanceStartTime:clock,lateGraceMinutes:z.number().int().min(0).max(120),minimumWorkingMinutes:z.number().int().min(0).max(1440),checkoutRequired:z.boolean(),deviceTimezone:z.literal('Asia/Kolkata'),heartbeatTimeoutSeconds:z.number().int().min(60).max(3600),realtimeFaceConfirmed:z.boolean().default(false),fallbackFaceConfirmed:z.boolean()}).strict();
export function summarizeTimes(date,first,last,policy){
 const threshold=Date.parse(`${date}T${policy.attendanceStartTime}:00+05:30`)+policy.lateGraceMinutes*60000;
 const lateMinutes=Math.max(0,Math.floor((+new Date(first)-threshold)/60000));
 const workingMinutes=last?Math.max(0,Math.floor((+new Date(last)-+new Date(first))/60000)):0;
 return {lateMinutes,workingMinutes,status:lateMinutes?'LATE':'PRESENT',earlyLeaveMinutes:last?Math.max(0,policy.minimumWorkingMinutes-workingMinutes):0,checkoutMissing:policy.checkoutRequired&&!last};
}
export function deviceStatus(d,timeout,now=Date.now()){
 const bridgeOnline=!!d.lastHeartbeatAt&&now-new Date(d.lastHeartbeatAt).getTime()<timeout*1000;
 const fkwebRecentlyActive=!!d.lastFkWebRequestAt&&now-new Date(d.lastFkWebRequestAt).getTime()<timeout*1000;
 const online=d.active&&((fkwebRecentlyActive&&d.fkwebProtocolVerified)||(bridgeOnline&&d.connected));
 return {...d,bridgeOnline,fkwebRecentlyActive,connectionStatus:online?'ONLINE':d.active&&fkwebRecentlyActive?'AWAITING_VERIFICATION':'OFFLINE'};
}
