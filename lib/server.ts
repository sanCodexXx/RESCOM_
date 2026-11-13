import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { verifiedFigures } from './dromic';
import { barangays, phDate, priorities, type Row } from './domain';
export function db() { if(!env.DB) throw new Error('Database is unavailable.'); return env.DB; }
export const runtime=env as unknown as Record<string,string>;
export function chatGPTAuth(request: Request) {
 const mode = runtime.RESCOM_AUTH_MODE;
 if(mode) return mode === 'sites';
 return new URL(request.url).origin === 'https://rescom-san-nicolas-hub.gaoatgresan1.chatgpt.site';
}
export const now=()=>new Date().toISOString();
export const id=()=>crypto.randomUUID();
export class ApiError extends Error {constructor(message:string,public status=400){super(message);}}
export function json(data:any,status=200,headers:Record<string,string>={}) {return Response.json(data,{status,headers:{'Cache-Control':'no-store',...headers}});}
export function fail(e:unknown) {if(e instanceof z.ZodError)return json({error:e.issues[0]?.message||'Check the form.'},400);if(e instanceof ApiError)return json({error:e.message},e.status);if(e instanceof Error&&e.message.includes('RESCOM_'))return json({error:e.message.includes('RESCOM_CAPACITY')?'Center capacity changed. Refresh and check available places.':e.message.includes('RESCOM_OCCUPIED')?'This center still has residents. Transfer or check out the households first.':e.message.includes('RESCOM_FINAL_REPORT')?'A final DROMIC report already exists for this event.':'Related records changed. Refresh before continuing.'},409);console.error(e);return json({error:'The request could not be completed. Please try again.'},500);}
export async function body(request:Request) {const raw=await request.text();if(raw.length>100000)throw new ApiError('This form is too large.',413);try{return JSON.parse(raw);}catch{throw new ApiError('Invalid form data.');}}
export function sameOrigin(r:Request) {const origin=r.headers.get('origin');if(origin&&origin!==new URL(r.url).origin)throw new ApiError('Request origin is not allowed.',403);if(!origin&&r.headers.get('sec-fetch-site')==='cross-site')throw new ApiError('Request origin is not allowed.',403);}
export async function hash(value:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function password(value:string,salt=crypto.randomUUID()){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(value),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations:100000},key,256);return salt+':'+Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,'0')).join('');}
export function safeAccount(a:any){return {id:a.id,name:a.name,email:a.email,phone:a.phone,role:a.role,requestedRole:a.requested_role,status:a.status,centerId:a.center_id,verifiedAt:a.verified_at,createdAt:a.created_at};}
export async function user(request:Request) {
 const cookie=request.headers.get('cookie')?.match(/(?:^|; )rescom_session=([^;]+)/)?.[1];
 if(cookie){const s=await db().prepare('SELECT a.*,s.expires AS session_expires FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.id=? AND s.expires>?').bind(await hash(cookie),Date.now()).first<any>();if(s&&s.status==='Active'&&s.verified_at)return {...safeAccount(s),owner:false,offlineUntil:s.session_expires};throw new ApiError('Your session has expired. Sign in again.',401);}
 const nativeId=request.headers.get('oai-authenticated-user-id'),nativeEmail=request.headers.get('oai-authenticated-user-email');
 if(chatGPTAuth(request)&&nativeId&&nativeEmail){
  let owner=await db().prepare("SELECT value FROM app_settings WHERE key='owner_id'").first<{value:string}>();
  if(!owner){
   const nativeStaff=await db().prepare("SELECT id FROM accounts WHERE space='live' AND email=?").bind(nativeEmail.trim().toLowerCase()).first();
   if(!nativeStaff){
    await db().prepare("INSERT INTO app_settings(key,value) VALUES('owner_id',?) ON CONFLICT(key) DO NOTHING").bind(nativeId).run();
    owner=await db().prepare("SELECT value FROM app_settings WHERE key='owner_id'").first<{value:string}>();
   }
  }
  if(owner?.value===nativeId)return {id:nativeId,name:'Workspace administrator',email:nativeEmail,phone:'',role:'admin',status:'Active',centerId:'',owner:true,nativeSession:true,offlineUntil:Date.now()+28800000};
  return await platformStaff(nativeEmail);
 }
 const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(request.url).hostname);
 if(loopback&&(import.meta.env.DEV||runtime.RESCOM_AUTH_MODE==='local'))return {id:'local-preview',name:'Workspace administrator',email:'',role:'admin',status:'Active',centerId:'',owner:true,offlineUntil:Date.now()+28800000};
 throw new ApiError('Sign in to open this workspace.',401);
}
async function platformStaff(email: string) {
  const account = await db().prepare("SELECT * FROM accounts WHERE space='live' AND email=?")
    .bind(email.trim().toLowerCase()).first<any>();
  if (!account || !account.status || account.status === 'Suspended') {
    throw new ApiError('Sign in with your approved RESCOM staff account.', 401);
  }
  if (account.status === 'Invited') {
    if (account.role === 'field' && !account.center_id) {
      throw new ApiError('Your administrator needs to assign an evacuation center.', 401);
    }
    await db().prepare(
      "UPDATE accounts SET status='Active',verified_at=COALESCE(verified_at,?) WHERE id=? AND status='Invited'",
    ).bind(new Date().toISOString(), account.id).run();
    const current = await db().prepare("SELECT status,role,center_id,verified_at FROM accounts WHERE id=?")
      .bind(account.id).first<any>();
    Object.assign(account, current || { status: 'Removed' });
  }
  if (account.status !== 'Active' || (account.role === 'field' && !account.center_id)) {
    throw new ApiError('Your account is awaiting administrator approval.', 401);
  }
  return { ...safeAccount(account), owner: false, nativeSession: true, offlineUntil: Date.now() + 28800000 };
}

export function space(request:Request,u:any){const s=new URL(request.url).searchParams.get('space')==='live'?'live':'training';if(!u.owner&&s==='training')throw new ApiError('The training workspace is for the site owner.',403);return s;}
export function admin(u:any){if(u.role!=='admin')throw new ApiError('Administrator access is required.',403);}
export async function audit(s:string,u:any,action:string,detail:string){return db().prepare('INSERT INTO activity(id,space,actor,action,detail,created_at) VALUES(?,?,?,?,?,?)').bind(id(),s,u.name,action,detail,now()).run();}
export async function rows(s:string,kind:string){const r=await db().prepare('SELECT * FROM records WHERE space=? AND kind=? ORDER BY created_at DESC').bind(s,kind).all<any>();return r.results.map(r=>({id:r.id,...JSON.parse(r.data),createdAt:r.created_at,updatedAt:r.updated_at})) as Row[];}
export async function row(s:string,kind:string,key:string){const r=await db().prepare('SELECT * FROM records WHERE space=? AND kind=? AND id=?').bind(s,kind,key).first<any>();if(!r)throw new ApiError('This record no longer exists. Refresh the page.',404);return {id:r.id,...JSON.parse(r.data),createdAt:r.created_at,updatedAt:r.updated_at} as Row;}
const text=z.string().trim().min(1,'Complete all required fields.').max(180);
export const phone=z.string().trim().regex(/^\+639\d{9}$/,'Use a Philippine mobile number: +639XXXXXXXXX.');
export const member=z.object({id:z.string().max(80),name:text,age:z.coerce.number().int().min(0).max(120),sex:z.enum(['Male','Female','Not stated']),relationship:z.string().max(80),priority:z.enum(priorities as [string,...string[]]),careStatus:z.enum(['Needs review','Assisted']),notes:z.string().max(500).default('')});
export const schemas={
 centers:z.object({name:text,barangay:z.enum(barangays as [string,...string[]]),capacity:z.coerce.number().int().min(1).max(50000),status:z.enum(['Open','Standby','Closed']),contact:z.string().max(180).default(''),phone:z.string().max(20).refine(v=>!v||/^\+639\d{9}$/.test(v),'Use +639XXXXXXXXX.'),remarks:z.string().max(2000).default('')}),
 households:z.object({headName:text,barangay:z.enum(barangays as [string,...string[]]),address:text,phone:z.string().max(20).refine(v=>!v||/^\+639\d{9}$/.test(v),'Use +639XXXXXXXXX.'),centerId:text,eventId:text,status:z.enum(['In center','Returned home']),arrivalDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),departureDate:z.string().default(''),members:z.array(member).min(1,'Add at least one household member.').max(40),notes:z.string().max(2000).default('')}),
 events:z.object({name:text,type:z.enum(['Typhoon','Flood','Earthquake','Fire','Other']),occurredAt:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),status:z.enum(['Active','Monitoring','Closed']),remarks:z.string().max(2000).default('')}),
 reports:z.object({name:text,eventId:text,asOf:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),status:z.enum(['Draft','Issued','Final']),preparedBy:text,remarks:z.string().max(2000).default(''),verified:verifiedFigures.nullish()}),
};
export async function rateLimit(key:string,max=8,windowMs=900000){const t=Date.now();const result=await db().prepare('INSERT INTO auth_attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<? THEN ? ELSE reset_at END RETURNING count').bind(key,t+windowMs,t,t,t+windowMs).first<{count:number}>();if(result&&result.count>max)throw new ApiError('Too many attempts. Try again in 15 minutes.',429);}
export async function sendOtp(a:any,purpose='verify'){
 if(!runtime.BREVO_API_KEY||!runtime.MAIL_FROM)throw new ApiError('Email verification is unavailable. Ask the administrator to connect the email service.',503);
 if(a.otp_sent_at&&Date.now()-a.otp_sent_at<60000)throw new ApiError('Please wait one minute before requesting another code.',429);
 const bytes=crypto.getRandomValues(new Uint32Array(1)),code=String(100000+(bytes[0]%900000)),digest=await hash(a.id+':'+code+':'+purpose);
 const sent=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'Content-Type':'application/json','api-key':runtime.BREVO_API_KEY},body:JSON.stringify({sender:{name:'RESCOM',email:runtime.MAIL_FROM},to:[{email:a.email}],subject:purpose==='reset'?'Reset your RESCOM password':'Verify your RESCOM account',htmlContent:`<div style="font-family:Arial,sans-serif;max-width:480px;padding:32px"><h1 style="color:#102e54">RESCOM</h1><p>Your verification code is:</p><p style="font-size:32px;letter-spacing:8px;font-weight:bold">${code}</p><p>This code expires in 10 minutes. Do not share it.</p><p>San Nicolas, Ilocos Norte</p></div>`})});
 if(!sent.ok)throw new ApiError('The email could not be sent. Please contact the administrator.',502);
 await db().prepare('UPDATE accounts SET otp_hash=?,otp_expires=?,otp_attempts=0,otp_sent_at=? WHERE id=?').bind(digest,Date.now()+600000,Date.now(),a.id).run();
}
export async function validateHousehold(s:string,d:any,key:string,u:any){
 const center=await row(s,'centers',d.centerId);await row(s,'events',d.eventId);
 if(!u.owner&&u.role==='field'&&(!u.centerId||u.centerId!==d.centerId))throw new ApiError('You can only register families at your assigned center.',403);
 if(d.status==='In center'&&center.status!=='Open')throw new ApiError('Select an open evacuation center.');
 if(d.arrivalDate>phDate())throw new ApiError('Arrival cannot be in the future.');
 if(d.status==='Returned home'&&(!/^\d{4}-\d{2}-\d{2}$/.test(d.departureDate)||d.departureDate<d.arrivalDate||d.departureDate>phDate()))throw new ApiError('Choose a departure date on or after arrival.');
 if(d.status==='In center')d.departureDate='';
 if(new Set(d.members.map((m:any)=>m.id)).size!==d.members.length)throw new ApiError('Member IDs must be unique.');
 if(d.status==='In center'){const all=await rows(s,'households'),used=all.filter(h=>h.id!==key&&h.centerId===d.centerId&&h.status==='In center').reduce((n,h)=>n+h.members.length,0);if(used+d.members.length>center.capacity)throw new ApiError(`This center has ${Math.max(0,center.capacity-used)} places available.`,409);}
}
