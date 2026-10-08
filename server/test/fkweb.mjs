import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {createFkWebReceiver,diagnosticConfig} from '../src/attendance/fkweb/receiver.js';
import {readCapture,purgeExpired} from '../src/attendance/fkweb/capture-store.js';
import {parseFkWebRequest} from '../src/attendance/fkweb/parser.js';
const directory=await fs.mkdtemp(path.join(os.tmpdir(),'srps-fkweb-test-'));
process.env.NODE_ENV='test';process.env.FKWEB_DIAGNOSTIC_ENABLED='true';process.env.FKWEB_DIAGNOSTIC_UNTIL=new Date(Date.now()+900000).toISOString();process.env.FKWEB_DIAGNOSTIC_TOKEN=crypto.randomBytes(32).toString('hex');process.env.FKWEB_DIAGNOSTIC_ENCRYPTION_KEY=crypto.randomBytes(32).toString('hex');process.env.FKWEB_DIAGNOSTIC_DIRECTORY=directory;
const token=process.env.FKWEB_DIAGNOSTIC_TOKEN,key=Buffer.from(process.env.FKWEB_DIAGNOSTIC_ENCRYPTION_KEY,'hex'),logs=[],captures=[];
const app=express();app.use('/biometric/fkweb',createFkWebReceiver({onCapture:async e=>captures.push(e),log:l=>logs.push(l)}));app.use(express.json());app.post('/ordinary-json',(req,res)=>res.json(req.body));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`,url=`${base}/biometric/fkweb/${token}`;
async function latest(){const files=await fs.readdir(directory);const all=await Promise.all(files.map(f=>readCapture(path.join(directory,f),key)));return all.find(v=>v.captureId===captures.at(-1).captureId);}
try{
 assert.equal((await fetch(url+'/__health')).status,200);assert.equal(captures.length,0);
 assert.equal((await fetch(base+'/biometric/fkweb/wrong')).status,404);
 const bytes=Buffer.from([0,255,1,2,128,10,13]);let r=await fetch(url+'?school=newdemo&api_key=SECRET',{method:'POST',headers:{'Content-Type':'application/octet-stream',Authorization:'Bearer SECRET'},body:bytes});assert.equal(r.status,503);assert.equal(await r.text(),'');let captured=await latest();assert.deepEqual(Buffer.from(captured.bodyBase64,'base64'),bytes);assert.equal(captured.query.school,'newdemo');assert.equal(captured.query.api_key,'[REDACTED]');assert.equal(captured.headers.authorization,undefined);assert(!captured.originalUrl.includes(token));assert.equal(captured.readableBody,null);
 for(const [type,body] of [['application/json',Buffer.from('{"arbitrary":"format"}')],['application/xml',Buffer.from('<Envelope><Photo>PRIVATE</Photo></Envelope>')],['application/x-www-form-urlencoded',Buffer.from('unknown=value%2Bthing')]]){r=await fetch(url,{method:'POST',headers:{'Content-Type':type},body});assert.equal(r.status,503);assert.deepEqual(Buffer.from((await latest()).bodyBase64,'base64'),body);}
 const compressed=zlib.gzipSync(Buffer.from('preserve wire bytes'));r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/octet-stream','Content-Encoding':'gzip'},body:compressed});assert.equal(r.status,503);assert.deepEqual(Buffer.from((await latest()).bodyBase64,'base64'),compressed);
 r=await fetch(url+'/firmware/path?query=x',{method:'GET'});assert.equal(r.status,503);assert((await latest()).path.endsWith('/firmware/path'));
 const before=captures.length;assert.equal((await fetch(url,{method:'POST',body:Buffer.alloc(1024*1024+1)})).status,413);assert.equal(captures.length,before);
 const ordinary=await fetch(base+'/ordinary-json',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"preserved":true}'});assert.deepEqual(await ordinary.json(),{preserved:true});
 assert(logs.every(l=>!l.includes('PRIVATE')&&!l.includes('SECRET')&&!l.includes(token)));
 for(const f of await fs.readdir(directory)){const disk=await fs.readFile(path.join(directory,f));assert(!disk.includes(Buffer.from('PRIVATE')));}
 process.env.NODE_ENV='production';assert.equal((await fetch(url)).status,404);process.env.NODE_ENV='test';
 process.env.FKWEB_DIAGNOSTIC_UNTIL=new Date(Date.now()-1000).toISOString();assert.equal((await fetch(url)).status,404);
 await purgeExpired(directory,Date.now()+3600000);assert.equal((await fs.readdir(directory)).length,0);
 assert.throws(()=>parseFkWebRequest(),/has not been verified/);
 console.log('PASS FkWeb transport: exact binary/JSON/XML/form/gzip bytes, secret redaction, encrypted temporary storage, expiry, size limit, disabled production mode, token gate, negative response, unchanged JSON routes. Physical protocol NOT verified.');
}finally{await new Promise(r=>server.close(r));await fs.rm(directory,{recursive:true,force:true});}
