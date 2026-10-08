import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {TextDecoder} from 'node:util';
// Exact bytes are encrypted in a short-lived local capture, never stored in MongoDB.
export async function purgeExpired(directory,now=Date.now()){
 let files;try{files=await fs.readdir(directory);}catch(e){if(e.code==='ENOENT')return;throw e;}
 for(const name of files){if(!/^\d+-[a-f0-9-]+\.capture$/.test(name))continue;if(Number(name.split('-')[0])<=now)await fs.unlink(path.join(directory,name)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
export async function saveCapture(config,metadata,body){
 await fs.mkdir(config.directory,{recursive:true,mode:0o700});await purgeExpired(config.directory);
 const files=(await fs.readdir(config.directory)).filter(n=>n.endsWith('.capture'));
 const sizes=await Promise.all(files.map(n=>fs.stat(path.join(config.directory,n)).then(s=>s.size).catch(()=>0)));
 if(files.length>=config.maxFiles||sizes.reduce((a,b)=>a+b,0)+body.length*3>config.maxStorageBytes)throw Object.assign(new Error('Diagnostic capture storage limit reached'),{status:507});
 const captureId=crypto.randomUUID(),expiresAt=Math.min(Date.now()+config.retentionMs,config.until);
 let readableBody=null;try{const text=new TextDecoder('utf-8',{fatal:true}).decode(body);if(!/[\x00-\x08\x0e-\x1f]/.test(text))readableBody=text;}catch{}
 const record={...metadata,captureId,expiresAt:new Date(expiresAt).toISOString(),bodySha256:crypto.createHash('sha256').update(body).digest('hex'),bodyBase64:body.toString('base64'),readableBody};
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',config.encryptionKey,iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(record),'utf8'),cipher.final()]);
 const file=path.join(config.directory,`${expiresAt}-${captureId}.capture`);
 // Single exclusive, fsynced file; incomplete encrypted files fail authentication when inspected.
 const handle=await fs.open(file,'wx',0o600);
 try{await handle.writeFile(Buffer.concat([Buffer.from('SRPSFK1'),iv,cipher.getAuthTag(),encrypted]));await handle.sync();}finally{await handle.close();}
 return {captureId,expiresAt:record.expiresAt,bodySha256:record.bodySha256,bytes:body.length};
}
export async function readCapture(file,key,now=Date.now()){
 const expiry=Number(path.basename(file).split('-')[0]);if(!expiry||expiry<=now)throw Error('Capture expired; purge it instead of inspecting.');
 const data=await fs.readFile(file);if(data.subarray(0,7).toString()!=='SRPSFK1')throw Error('Unsupported capture format');
 const decipher=crypto.createDecipheriv('aes-256-gcm',key,data.subarray(7,19));decipher.setAuthTag(data.subarray(19,35));
 const result=JSON.parse(Buffer.concat([decipher.update(data.subarray(35)),decipher.final()]).toString());
 if(Date.parse(result.expiresAt)<=now)throw Error('Capture expired');return result;
}
