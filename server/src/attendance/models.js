import mongoose from 'mongoose';
const {Schema}=mongoose;
const deviceSchema=new Schema({
 name:{type:String,required:true},model:{type:String,required:true},serialNumber:{type:String,required:true,unique:true},
 machineNumber:{type:Number,required:true},bridgeId:{type:String,required:true,unique:true},ipAddress:String,port:{type:Number,default:5005},location:String,
 active:{type:Boolean,default:true},connected:{type:Boolean,default:false},lastHeartbeatAt:Date,lastEventAt:Date,lastFkWebRequestAt:Date,lastAttendanceEventAt:Date,lastSbxpcSyncAt:Date,fkwebProtocolVerified:{type:Boolean,default:false},
 pendingQueueCount:{type:Number,default:0},bridgeVersion:String
},{timestamps:true});
export const AttendanceDevice=mongoose.model('AttendanceDevice',deviceSchema);
const mappingSchema=new Schema({teacherId:{type:String,required:true},employeeId:String,deviceUserId:{type:String,required:true},deviceSerial:{type:String,required:true},active:{type:Boolean,default:true}},{timestamps:true});
mappingSchema.index({deviceSerial:1,deviceUserId:1},{unique:true,partialFilterExpression:{active:true}});
mappingSchema.index({deviceSerial:1,teacherId:1},{unique:true,partialFilterExpression:{active:true}});
export const TeacherDeviceMapping=mongoose.model('TeacherDeviceMapping',mappingSchema);
const immutable=type=>({type,immutable:true});
const eventSchema=new Schema({
 teacherId:String,deviceUserId:immutable(String),deviceSerial:immutable(String),bridgeId:immutable(String),machineNumber:immutable(Number),
 eventTimestamp:immutable(Date),eventType:immutable(String),attendanceStatusRaw:immutable(String),verificationModeRaw:immutable(String),
 verificationModeCodeRaw:immutable(Number),antipassStatusRaw:immutable(String),method:immutable(String),source:immutable(String),rawEventId:immutable(String),sourcesSeen:[String],nativeEventIds:[String],isMock:immutable(Boolean),
 terminalMachineNumberRaw:immutable(Number),enrollmentMachineNumberRaw:immutable(Number),
 eventHash:{type:String,unique:true,required:true,immutable:true},receivedAt:immutable(Date),bridgeReceivedAt:immutable(Date),
 processingStatus:{type:String,enum:['PENDING','UNMAPPED','REVIEW','PROCESSED'],default:'PENDING'},processingNote:String,resolvedMethod:String,processedAt:Date
},{timestamps:{createdAt:true,updatedAt:false}});
eventSchema.index({eventTimestamp:-1});
eventSchema.index({deviceSerial:1,deviceUserId:1,processingStatus:1});
eventSchema.index({teacherId:1,eventTimestamp:1});
export const AttendanceEvent=mongoose.model('AttendanceEvent',eventSchema);
export const attendanceModels=[AttendanceDevice,TeacherDeviceMapping,AttendanceEvent];
