import mongoose from 'mongoose';
import {importHandwrittenReference} from './handwritten-import.js';

if(process.env.NODE_ENV==='production')throw Error('Handwritten timetable import is disabled in production');
if(!process.env.MONGODB_URI)throw Error('Set MONGODB_URI before importing the handwritten timetable');
await mongoose.connect(process.env.MONGODB_URI);
try{
 const result=await importHandwrittenReference('development-import');
 console.log(JSON.stringify(result.summary,null,2));
}finally{
 await mongoose.disconnect();
}
