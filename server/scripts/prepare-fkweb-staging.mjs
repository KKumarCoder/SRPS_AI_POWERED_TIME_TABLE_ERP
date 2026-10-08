import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const [operation='create',filename]=process.argv.slice(2);
if(!filename)throw Error('Usage: prepare-fkweb-staging.mjs create|activate|close <private-env-file>');
const file=path.resolve(filename);
if(operation==='create'){
 await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
 const hex=()=>crypto.randomBytes(32).toString('hex');
 const contents=`# PRIVATE: generated locally; never commit or publish this file.
NODE_ENV=development
PORT=4100
MONGODB_URI=mongodb://127.0.0.1:27017/srps_fkweb_staging
JWT_SECRET=${hex()}
QR_SIGNING_SECRET=${hex()}
EMAIL_SENDING_ENABLED=false
SCHOOL_TIMEZONE=Asia/Kolkata
ATTENDANCE_BRIDGE_MOCK=false
FKWEB_DIAGNOSTIC_MODE=true
FKWEB_RAW_LOG_DIR=/var/lib/srps-fkweb/captures
FKWEB_MAX_RAW_BODY_SIZE=1048576
FKWEB_ALLOWED_DEVICE_SERIALS=RSS202506122297
FKWEB_DIAGNOSTIC_DEVICE_SERIAL=RSS202506122297
FKWEB_DIAGNOSTIC_ALLOWED_IPS=
FKWEB_DIAGNOSTIC_TOKEN=${crypto.randomBytes(32).toString('base64url')}
FKWEB_DIAGNOSTIC_ENCRYPTION_KEY=${hex()}
# Closed until explicitly activated just before the test.
FKWEB_DIAGNOSTIC_UNTIL=
ORIGINAL_WEB_SERVER_URL=http://biometric.rankry.in/?school=newdemo
`;
 await fs.writeFile(file,contents,{flag:'wx',mode:0o600});
 console.log('Private staging environment created. Capture window is closed; no secrets printed.');
}else if(['activate','close'].includes(operation)){
 const contents=await fs.readFile(file,'utf8');
 if(!/^FKWEB_DIAGNOSTIC_UNTIL=/m.test(contents))throw Error('Not a staging capture environment file');
 const until=operation==='activate'?new Date(Date.now()+15*60000).toISOString():'';
 const next=contents.replace(/^FKWEB_DIAGNOSTIC_UNTIL=.*$/m,`FKWEB_DIAGNOSTIC_UNTIL=${until}`);
 const temp=file+'.'+crypto.randomUUID()+'.tmp';
 await fs.writeFile(temp,next,{flag:'wx',mode:0o600});await fs.rename(temp,file);
 console.log(operation==='activate'?`Capture window expires ${until}. Restart staging service to load it.`:'Capture window closed. Restart staging service to load it.');
}else throw Error('Unknown operation');
