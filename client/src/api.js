import axios from 'axios';
export const api=axios.create({baseURL:'/api'});
api.interceptors.request.use(c=>{const token=sessionStorage.getItem('srps-token');if(token)c.headers.Authorization=`Bearer ${token}`;return c;});
api.interceptors.response.use(r=>r.data.data,e=>{if(e.response?.status===401&&location.pathname!=='/login'){sessionStorage.removeItem('srps-token');location.assign('/login');}return Promise.reject(new Error([e.response?.data?.message||e.message,...(e.response?.data?.errors||[])].join('\n')));});
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const dayOf=d=>new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
