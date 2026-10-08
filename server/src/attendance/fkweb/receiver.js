import {sendUnverifiedResponse} from './response.js';
import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import path from 'node:path';
import {isIP} from 'node:net';
import {saveCapture,purgeExpired} from './capture-store.js';
const digest=s=>crypto.createHash('sha256').update(s).digest();
const fault=(message,status)=>Object.assign(new Error(message),{status});
export function diagnosticConfig(env=process.env){
 if((env.FKWEB_DIAGNOSTIC_MODE??env.FKWEB_DIAGNOSTIC_ENABLED)!=='true'||env.NODE_ENV==='production')return null;
 const until=Date.parse(env.FKWEB_DIAGNOSTIC_UNTIL||'');
 if(!Number.isFinite(until)||until<=Date.now())return null;
 if(until>Date.now()+3600000)throw fault('Diagnostic window must end within one hour',503);
 const token=env.FKWEB_DIAGNOSTIC_TOKEN||'',hex=env.FKWEB_DIAGNOSTIC_ENCRYPTION_KEY||'';
 if(!/^(?:[a-f0-9]{64}|[A-Za-z0-9_-]{43})$/.test(token)||!/^[a-f0-9]{64}$/i.test(hex))throw fault('Configure a 256-bit hex/base64url capture token and separate 32-byte hexadecimal encryption key',503);
 if(token===hex)throw fault('Use independent diagnostic token and encryption key',503);
 const directory=env.FKWEB_RAW_LOG_DIR||env.FKWEB_DIAGNOSTIC_DIRECTORY;
 if(!directory||!path.isAbsolute(directory))throw fault('Configure an absolute private diagnostic directory',503);
 const maxBodyBytes=Number(env.FKWEB_MAX_RAW_BODY_SIZE||1048576);
 if(!Number.isInteger(maxBodyBytes)||maxBodyBytes<1||maxBodyBytes>8*1024*1024)throw fault('FKWEB_MAX_RAW_BODY_SIZE must be 1–8388608 bytes',503);
 const serials=(env.FKWEB_ALLOWED_DEVICE_SERIALS||'RSS202506122297').split(',').map(s=>s.trim()).filter(Boolean);
 const expectedSerial=env.FKWEB_DIAGNOSTIC_DEVICE_SERIAL||'RSS202506122297';
 if(!serials.includes(expectedSerial))throw fault('Capture scope serial is not in FKWEB_ALLOWED_DEVICE_SERIALS',503);
 const allowedIps=(env.FKWEB_DIAGNOSTIC_ALLOWED_IPS||'').split(',').map(s=>s.trim()).filter(Boolean);
 if(allowedIps.some(ip=>!isIP(ip)))throw fault('Diagnostic IP allow-list contains an invalid address',503);
 return {token,encryptionKey:Buffer.from(hex,'hex'),directory,until,allowedIps,expectedSerial,retentionMs:15*60000,maxFiles:100,maxStorageBytes:32*1024*1024,maxBodyBytes};
}
function readBytes(req,limit){return new Promise((resolve,reject)=>{
 let bytes=0,chunks=[],settled=false;
 const cleanup=()=>{clearTimeout(timer);req.off('data',data);req.off('end',end);req.off('aborted',abort);req.off('error',error);};
 const fail=e=>{if(settled)return;settled=true;cleanup();chunks=[];req.resume();reject(e);};
 const data=chunk=>{bytes+=chunk.length;if(bytes>limit)return fail(fault('Capture body limit exceeded',413));chunks.push(chunk);};
 const end=()=>{if(settled)return;settled=true;cleanup();resolve(Buffer.concat(chunks));};
 const abort=()=>fail(fault('Capture request aborted',400));const error=()=>fail(fault('Capture request stream error',400));
 const timer=setTimeout(()=>fail(fault('Capture body timeout',408)),10000);
 req.on('data',data);req.once('end',end);req.once('aborted',abort);req.once('error',error);
});}
export function safeRequestMetadata(req,config){
 const url=new URL(req.originalUrl,'http://receiver.invalid');
 const secretName=/token|key|secret|password|passcode|auth|credential|signature|photo|image|template/i;
 const query=Object.fromEntries([...url.searchParams].map(([key,value])=>[key,secretName.test(key)?'[REDACTED]':value.replaceAll(config.token,'[REDACTED]').slice(0,512)]));
 // Query metadata is also encrypted; sensitive query fields are removed before persistence.
 const headers={};for(const key of ['content-type','content-length','content-encoding','transfer-encoding','user-agent','accept'])if(req.headers[key])headers[key]=String(req.headers[key]).slice(0,512);
 return {method:req.method,path:url.pathname.replace(config.token,'[CAPTURE_TOKEN]'),originalUrl:url.pathname.replace(config.token,'[CAPTURE_TOKEN]')+(url.search?'?'+Object.entries(query).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&'):''),query,headers,contentType:req.get('content-type')||'',contentLength:req.get('content-length')||null,remoteIp:req.ip,timestamp:new Date().toISOString(),configuredDeviceSerial:config.expectedSerial,identityVerified:false};
}
export function createFkWebReceiver({onCapture=async()=>{},log=message=>console.info(message)}={}){
 const router=express.Router();let active=0;
 router.use((req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});try{const cfg=diagnosticConfig();if(!cfg)return res.sendStatus(404);req.fkwebConfig=cfg;next();}catch(e){next(e);}});
 router.use('/:captureToken',rateLimit({windowMs:60000,limit:120,standardHeaders:true,legacyHeaders:false}),async(req,res,next)=>{
  const cfg=req.fkwebConfig;
  if(!crypto.timingSafeEqual(digest(req.params.captureToken||''),digest(cfg.token)))return res.sendStatus(404);
  const ip=req.ip.replace(/^::ffff:/,'');if(cfg.allowedIps.length&&!cfg.allowedIps.includes(ip))return res.sendStatus(403);
  if(req.path==='/__health'&&req.method==='GET')return res.type('text/plain').send('FkWeb diagnostic receiver ready. Protocol and acknowledgement NOT VERIFIED.');
  if(active>=4)return res.sendStatus(503);active++;
  try{
   // Mounted BEFORE express.json. No decompression, charset conversion or protocol parsing occurs here.
   const body=await readBytes(req,cfg.maxBodyBytes);
   const metadata=safeRequestMetadata(req,cfg);
   metadata.serialPresentInBytes=body.includes(Buffer.from(cfg.expectedSerial));
   const saved=await saveCapture(cfg,metadata,body);
   await onCapture({deviceSerial:cfg.expectedSerial,receivedAt:new Date(metadata.timestamp),captureId:saved.captureId});
   log(JSON.stringify({component:'fkweb-discovery',...saved,timestamp:metadata.timestamp,path:metadata.path,captureFile:path.join(cfg.directory,`${Date.parse(saved.expiresAt)}-${saved.captureId}.capture`),parserStatus:'NOT_VERIFIED',method:req.method,contentType:metadata.contentType,identityVerified:false,acknowledgement:'NOT_VERIFIED',responseStatus:503}));
   // Explicit negative transport response, NOT a fabricated vendor ACK. Keeps discovery separate from acceptance.
   sendUnverifiedResponse(res);
  }catch(e){next(e);}finally{active--;}
 });
 router.use((err,req,res,next)=>{if(res.headersSent)return next(err);log(JSON.stringify({component:'fkweb-discovery',error:err.status?'capture_rejected':'capture_storage_failure',status:err.status||500}));res.status(err.status||500).end();});
 return router;
}
export function startCaptureCleanup(){const timer=setInterval(async()=>{const directory=process.env.FKWEB_RAW_LOG_DIR||process.env.FKWEB_DIAGNOSTIC_DIRECTORY;if(directory&&path.isAbsolute(directory))try{await purgeExpired(directory);}catch{console.error('FkWeb diagnostic cleanup failed; check private storage permissions.');}},30000);timer.unref();return ()=>clearInterval(timer);}
