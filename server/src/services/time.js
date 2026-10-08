export const schoolDate=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:process.env.SCHOOL_TIMEZONE||'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const schoolTime=(now=new Date())=>new Intl.DateTimeFormat('en-GB',{timeZone:process.env.SCHOOL_TIMEZONE||'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
export const weekday=date=>new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
export const minutes=t=>Number(t.split(':')[0])*60+Number(t.split(':')[1]);
export const defaultSettings={schoolName:'Shree Ram Public School',academicSession:'2026-27',timezone:'Asia/Kolkata',checkInStart:'07:00',checkInEnd:'09:00',normalArrival:'08:00',graceMinutes:5,checkOutStart:'14:00',checkOutEnd:'15:00',cutoff:'09:00',workingDays:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']};
