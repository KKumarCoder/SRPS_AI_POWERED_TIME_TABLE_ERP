import {readCapture,purgeExpired} from '../src/attendance/fkweb/capture-store.js';
import {diagnosticConfig} from '../src/attendance/fkweb/receiver.js';
import fs from 'node:fs/promises';
import path from 'node:path';
const [command,file]=process.argv.slice(2),directory=process.env.FKWEB_RAW_LOG_DIR||process.env.FKWEB_DIAGNOSTIC_DIRECTORY;
if(command==='purge'){if(!directory||!path.isAbsolute(directory))throw Error('Set an absolute FKWEB_DIAGNOSTIC_DIRECTORY');await purgeExpired(directory);console.log('Expired encrypted captures removed.');}
else if(command==='list'){if(!directory)throw Error('Set FKWEB_DIAGNOSTIC_DIRECTORY');for(const name of await fs.readdir(directory))if(name.endsWith('.capture'))console.log(name);}
else if(command==='inspect'){
 const cfg=diagnosticConfig();if(!cfg)throw Error('Open an authorized diagnostic window before inspecting captures.');
 if(!file||path.dirname(path.resolve(file))!==path.resolve(cfg.directory))throw Error('Choose a capture in the configured diagnostic directory.');
 const record=await readCapture(file,cfg.encryptionKey);
 const {bodyBase64,readableBody,...metadata}=record;
 console.log(JSON.stringify({...metadata,bodyByteLength:Buffer.from(bodyBase64,'base64').length,hasReadableUtf8:readableBody!==null},null,2));
 // Raw body review must happen locally in this short-lived encrypted capture. No plaintext export is created.
}
else throw Error('Usage: node --env-file=.env scripts/fkweb-capture.mjs list | inspect <absolute capture path> | purge');
