import { z } from 'zod';
import { admin, ApiError, audit, body, chatGPTAuth, db, fail, hash, id, json, now, password, phone, rateLimit, row, rows, runtime, safeAccount, sameOrigin, schemas, sendOtp, space, user, validateHousehold } from '../../../lib/server';
import { kinds, phDate, type Kind } from '../../../lib/domain';
import { dromicSnapshot } from '../../../lib/dromic';
import { readWrite } from '../../../lib/record-writes';
import { starlinkConnection } from '../../../lib/starlink-server';
import { seed } from '../../../lib/seed';
export const dynamic='force-dynamic';
const registration=z.object({name:z.string().trim().min(3).max(180),email:z.string().email().max(180).transform(v=>v.toLowerCase()),phone,password:z.string().min(10,'Use at least 10 characters.').max(128),confirmPassword:z.string(),role:z.enum(['admin','field']),consent:z.literal(true)}).refine(d=>d.password===d.confirmPassword,{message:'Passwords must match.'});
async function auth(request:Request,action:string){
 if(action==='me'){try{return json({user:await user(request),chatGPTAuth:chatGPTAuth(request),emailReady:!!runtime.BREVO_API_KEY&&!!runtime.MAIL_FROM});}catch(error){if(!(error instanceof ApiError)||error.status!==401)throw error;return json({user:null,chatGPTAuth:chatGPTAuth(request),emailReady:!!runtime.BREVO_API_KEY&&!!runtime.MAIL_FROM});}}
 sameOrigin(request);const d=await body(request);const email=String(d.email||'').trim().toLowerCase();
 if(action==='logout'){const token=request.headers.get('cookie')?.match(/(?:^|; )rescom_session=([^;]+)/)?.[1];if(token)await db().prepare('DELETE FROM sessions WHERE id=?').bind(await hash(token)).run();return json({ok:true},200,{'Set-Cookie':'rescom_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});}
 await rateLimit('auth-ip:'+await hash(request.headers.get('cf-connecting-ip')||request.headers.get('x-forwarded-for')||'local'),40);
 if(action==='register'){
  const v=registration.parse(d);await rateLimit('register:'+v.email,5);
  if(!runtime.BREVO_API_KEY||!runtime.MAIL_FROM)throw new ApiError('Email verification is unavailable. Ask the administrator to connect the email service.',503);
  const existing=await db().prepare("SELECT * FROM accounts WHERE space='live' AND email=?").bind(v.email).first<any>();
  if(existing?.password_hash)throw new ApiError('An account already exists. Sign in or resend your verification code.',409);
  const key=existing?.id||id();const digest=await password(v.password);
  if(existing)await db().prepare('UPDATE accounts SET name=?,phone=?,password_hash=?,consent_at=?,requested_role=? WHERE id=?').bind(v.name,v.phone,digest,now(),v.role,key).run();
  else await db().prepare('INSERT INTO accounts(id,space,name,email,phone,role,requested_role,status,password_hash,consent_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(key,'live',v.name,v.email,v.phone,'field',v.role,'Pending approval',digest,now(),now()).run();
  const a=await db().prepare('SELECT * FROM accounts WHERE id=?').bind(key).first();await sendOtp(a);return json({ok:true,message:'A verification code was sent to your email.'});
 }
 const a=await db().prepare("SELECT * FROM accounts WHERE space='live' AND email=?").bind(email).first<any>();
 if(action==='login'){
  await rateLimit('login:'+email,8);const given=String(d.password||'');const valid=a?.password_hash&&await password(given,a.password_hash.split(':')[0])===a.password_hash;
  if(!valid)throw new ApiError('Email or password is incorrect.',401);
  if(!a.verified_at)throw new ApiError('Verify your email before signing in.',403);
  if(a.status!=='Active')throw new ApiError(a.status==='Suspended'?'This account is suspended. Contact an administrator.':'Your account is awaiting administrator approval.',403);
  const token=crypto.randomUUID()+crypto.randomUUID();await db().prepare('INSERT INTO sessions(id,account_id,expires) VALUES(?,?,?)').bind(await hash(token),a.id,Date.now()+28800000).run();
  await db().prepare('DELETE FROM auth_attempts WHERE key=?').bind('login:'+email).run();return json({user:{...safeAccount(a),owner:false,offlineUntil:Date.now()+28800000}},200,{'Set-Cookie':`rescom_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800`});
 }
 if(action==='resend'||action==='forgot'){
  await rateLimit(action+':'+email,5);if(a?.password_hash)await sendOtp(a,action==='forgot'?'reset':'verify');return json({ok:true,message:'If an account exists, a code has been sent.'});
 }
 if(action==='verify'||action==='reset'){
  await rateLimit('verify:'+email,15);if(!a||!a.otp_hash||a.otp_expires<Date.now()||a.otp_attempts>=5)throw new ApiError('This code is invalid or expired. Request a new code.');
  await db().prepare('UPDATE accounts SET otp_attempts=otp_attempts+1 WHERE id=?').bind(a.id).run();
  if(!/^\d{6}$/.test(String(d.code))||await hash(a.id+':'+d.code+':'+(action==='reset'?'reset':'verify'))!==a.otp_hash)throw new ApiError('Incorrect code. Please check your email.');
  if(action==='reset'){
   const p=z.string().min(10,'Use at least 10 characters.').max(128).parse(d.password);if(p!==d.confirmPassword)throw new ApiError('Passwords must match.');
   await db().batch([db().prepare('UPDATE accounts SET password_hash=?,otp_hash=NULL,otp_expires=NULL WHERE id=?').bind(await password(p),a.id),db().prepare('DELETE FROM sessions WHERE account_id=?').bind(a.id)]);
  }else await db().prepare("UPDATE accounts SET verified_at=?,otp_hash=NULL,otp_expires=NULL,status=CASE WHEN status='Invited' THEN 'Active' ELSE status END WHERE id=?").bind(now(),a.id).run();
  return json({ok:true,message:action==='reset'?'Password updated. You can now sign in.':'Email verified. An administrator will review your access request.'});
 }
 throw new ApiError('Action not found.',404);
}
async function handle(request:Request){try{
 const path=new URL(request.url).pathname.replace(/^\/api\//,'').split('/');
 if(path[0]==='health'){await db().prepare('SELECT 1').first();return json({ok:true,service:'RESCOM'});}
 if(path[0]==='auth')return await auth(request,path[1]);
 const u=await user(request),s=space(request,u);if(request.method!=='GET')sameOrigin(request);
 if(path[0]==='starlink'&&path[1]==='connection')return await starlinkConnection(request,u.id);
 if(path[0]==='seed'){admin(u);if(request.method!=='POST'||s!=='training')throw new ApiError('Training data is only available in the training workspace.',403);await seed();return json({ok:true});}
 if(path[0]==='workspace'){
  const [centers,households,events,reports,people,logs]=await Promise.all([rows(s,'centers'),rows(s,'households'),rows(s,'events'),u.role==='admin'?rows(s,'reports'):[],u.role==='admin'?db().prepare('SELECT * FROM accounts WHERE space=? ORDER BY created_at DESC').bind(s).all<any>():Promise.resolve({results:[]}),db().prepare('SELECT * FROM activity WHERE space=? ORDER BY created_at DESC LIMIT 60').bind(s).all<any>()]);
  const field=u.role==='field';return json({user:u,chatGPTAuth:chatGPTAuth(request),centers:field?centers.filter(c=>c.id===u.centerId):centers,households:field?households.filter(h=>h.centerId===u.centerId):households,events,reports,personnel:people.results.map(safeAccount),activity:field?logs.results.filter(l=>l.actor===u.name):logs.results,emailReady:!!runtime.BREVO_API_KEY&&!!runtime.MAIL_FROM});
 }
 if(path[0]==='personnel'){
  admin(u);const key=path[1];
  if(request.method==='DELETE'){
   if(key===u.id)throw new ApiError('You cannot delete your own account.');
   await db().batch([db().prepare('DELETE FROM sessions WHERE account_id=?').bind(key),db().prepare('DELETE FROM accounts WHERE id=? AND space=?').bind(key,s)]);await audit(s,u,'Personnel removed','An account was removed.');return json({ok:true});
  }
  const v=z.object({name:z.string().trim().min(3).max(180),email:z.string().email().transform(e=>e.toLowerCase()),phone:z.string().max(20).refine(v=>!v||/^\+639\d{9}$/.test(v),'Use +639XXXXXXXXX.'),role:z.enum(['admin','field']),status:z.enum(['Invited','Pending approval','Active','Suspended']),centerId:z.string().max(80)}).parse(await body(request));
  if(v.centerId)await row(s,'centers',v.centerId);
  if(v.role==='field'&&!v.centerId&&(v.status==='Active'||(s==='live'&&!key)))throw new ApiError('Assign an evacuation center for this field account.');
  const existing=key?await db().prepare('SELECT * FROM accounts WHERE id=? AND space=?').bind(key,s).first<any>():null;
  const duplicate=await db().prepare('SELECT id FROM accounts WHERE email=? AND space=? AND id<>?').bind(v.email,s,key||'').first();if(duplicate)throw new ApiError('This email is already registered.',409);
  if(key&&!existing)throw new ApiError('Account not found.',404);
  if(existing){if(v.email!==existing.email)throw new ApiError('Email cannot be changed after registration.');await db().prepare('UPDATE accounts SET name=?,phone=?,role=?,status=?,center_id=? WHERE id=? AND space=?').bind(v.name,v.phone,v.role,v.status,v.centerId,key,s).run();if(v.status!=='Active')await db().prepare('DELETE FROM sessions WHERE account_id=?').bind(key).run();}
  else await db().prepare('INSERT INTO accounts(id,space,name,email,phone,role,requested_role,status,center_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id(),s,v.name,v.email,v.phone,v.role,v.role,s==='live'?'Invited':v.status,v.centerId,now()).run();
  await audit(s,u,existing?'Personnel updated':'Personnel registered',v.name);return json({ok:true,message:!existing&&s==='live'?(chatGPTAuth(request)?'Profile invited. They can open RESCOM with the same ChatGPT email once they have site access.':'Profile invited. Ask the staff member to register and verify the invited email.'):'Personnel saved.'});
 }
 const kind=path[0] as Kind,key=path[1];if(!kinds.includes(kind))throw new ApiError('Route not found.',404);
 if(u.role!=='admin'&&kind!=='households'&&kind!=='centers'&&kind!=='events')admin(u);
 const editing=['POST','PUT'].includes(request.method);
 if(editing&&((request.method==='POST'&&key)||(request.method==='PUT'&&!key)))throw new ApiError('Invalid record action.');
 let incoming=editing?await body(request):null;
 const write=editing?await readWrite(request,incoming,u.id,s,kind,key):null;
 const previous=await write?.committed();
 if(previous)return json(previous);
 const existing=key?await row(s,kind,key):null;
 if(existing&&u.role==='field'&&((kind==='households'&&existing.centerId!==u.centerId)||(kind==='centers'&&existing.id!==u.centerId)))throw new ApiError('This record is outside your assigned center.',403);
 if(request.method==='DELETE'){
  admin(u);if(!key)throw new ApiError('Select a record.');
  if(kind==='reports'&&existing?.status==='Final')throw new ApiError('Final reports are locked.',409);
  if(kind==='centers'&&(await rows(s,'households')).some(h=>h.centerId===key))throw new ApiError('This center has household records. Move or remove those records first.',409);
  if(kind==='centers'&&(await db().prepare('SELECT id FROM accounts WHERE center_id=? AND space=?').bind(key,s).first()))throw new ApiError('Reassign personnel before removing this center.',409);
  if(kind==='events'&&(await rows(s,'households')).some(h=>h.eventId===key))throw new ApiError('This event has household records and cannot be removed.',409);
  if(kind==='events'&&(await rows(s,'reports')).some(r=>r.eventId===key))throw new ApiError('Remove related reports before removing this event.',409);
  await db().prepare('DELETE FROM records WHERE id=? AND space=? AND kind=?').bind(key,s,kind).run();await audit(s,u,'Record deleted',existing?.name||existing?.headName||kind);return json({ok:true});
 }
 if(!editing)throw new ApiError('Method not allowed.',405);
 const expected=(await write?.expectedVersion())??incoming?.updatedAt;
 if(existing&&expected!==existing.updatedAt)throw new ApiError('This record changed in another session. Refresh and try again.',409);
 if(u.role==='field'&&kind==='centers'){if(!existing)admin(u);incoming={...existing,status:incoming?.status,remarks:incoming?.remarks};}
 if(u.role==='field'&&kind==='events'&&existing)incoming={...existing,status:incoming?.status,remarks:incoming?.remarks};
 const data=schemas[kind].parse(incoming) as any;
 if(kind==='events'&&data.occurredAt>phDate())throw new ApiError('The incident date cannot be in the future.');
 if(kind==='reports'&&data.asOf>phDate())throw new ApiError('The reporting date cannot be in the future.');
 if(kind==='households')await validateHousehold(s,data,key||'',u);
 if(kind==='centers'&&existing){const active=(await rows(s,'households')).filter(h=>h.centerId===key&&h.status==='In center');const count=active.reduce((n,h)=>n+h.members.length,0);if(data.capacity<count)throw new ApiError(`Capacity cannot be lower than the ${count} current residents.`,409);if(data.status!=='Open'&&count)throw new ApiError('Transfer or check out all residents before closing a center.',409);}
 if(kind==='reports'){
  if(existing?.status==='Final')throw new ApiError('Final reports are locked. Create a new report for a revised snapshot.',409);
  if(data.eventId==='all'&&!existing)throw new ApiError('Select a disaster event for this report.');
  if(existing&&existing.eventId!==data.eventId)throw new ApiError('Create a new report to change the disaster event.');
  const [centers,households,events]=await Promise.all([rows(s,'centers'),rows(s,'households'),rows(s,'events')]);
  if(data.eventId!=='all'&&!events.some(event=>event.id===data.eventId))throw new ApiError('Select an existing disaster event.',409);
  const snapshot=dromicSnapshot({centers,households,events},data.eventId,data.asOf,now());
  const affected=data.verified?.affected,outside=data.verified?.outside;
  if(affected&&(affected.families<Math.max(snapshot.cumulativeFamilies,outside?.cumulativeFamilies||0)||affected.persons<Math.max(snapshot.cumulativePersons,outside?.cumulativePersons||0))){
   throw new ApiError('Verified affected totals are below the recorded displacement figures.',409);
  }
  data.snapshot=snapshot;
  if(existing?.reportNumber)data.reportNumber=existing.reportNumber;
 }
 const recordId=write?.recordId||key||id();
 const timestamp=new Date(Math.max(Date.now(),(Date.parse(existing?.updatedAt||'')||0)+1)).toISOString();
 const capacityCondition=kind==='households'&&data.status==='In center';
 const allocateReportNumber=kind==='reports'&&!existing;
 const allocate=allocateReportNumber?db().prepare(`INSERT INTO report_sequences(space,event_id,last_number) VALUES(?,?,1)
  ON CONFLICT(space,event_id) DO UPDATE SET last_number=last_number+1`).bind(s,data.eventId):null;
 let mutation:D1PreparedStatement;
 if(existing){
  const condition=capacityCondition?` AND (SELECT COALESCE(SUM(json_array_length(json_extract(data,'$.members'))),0) FROM records WHERE space=? AND kind='households' AND id<>? AND json_extract(data,'$.centerId')=? AND json_extract(data,'$.status')='In center')+? <= (SELECT json_extract(data,'$.capacity') FROM records WHERE space=? AND kind='centers' AND id=? AND json_extract(data,'$.status')='Open')`:'';
  const binds:any[]=[JSON.stringify(data),timestamp,recordId,s,kind,expected];if(capacityCondition)binds.push(s,recordId,data.centerId,data.members.length,s,data.centerId);
  mutation=db().prepare('UPDATE records SET data=?,updated_at=? WHERE id=? AND space=? AND kind=? AND updated_at=?'+condition).bind(...binds);
 }else{
  const condition=capacityCondition?` WHERE (SELECT COALESCE(SUM(json_array_length(json_extract(data,'$.members'))),0) FROM records WHERE space=? AND kind='households' AND json_extract(data,'$.centerId')=? AND json_extract(data,'$.status')='In center')+? <= (SELECT json_extract(data,'$.capacity') FROM records WHERE space=? AND kind='centers' AND id=? AND json_extract(data,'$.status')='Open')`:'';
  const recordData=allocateReportNumber?"json_set(?, '$.reportNumber', (SELECT last_number FROM report_sequences WHERE space=? AND event_id=?))":"?";
  const binds:any[]=[recordId,s,kind,JSON.stringify(data)];
  if(allocateReportNumber)binds.push(s,data.eventId);
  binds.push(timestamp,timestamp);
  if(capacityCondition)binds.push(s,data.centerId,data.members.length,s,data.centerId);
  mutation=db().prepare('INSERT INTO records(id,space,kind,data,created_at,updated_at) SELECT ?,?,?,'+recordData+',?,?'+condition).bind(...binds);
 }
 const auditWrite=db().prepare(
  'INSERT INTO activity(id,space,actor,action,detail,created_at) SELECT ?,?,?,?,?,? WHERE changes()=1',
 ).bind(id(),s,u.name,existing?'Record updated':'Record added',data.name||data.headName||kind,timestamp);
 const conflict='The record or available capacity changed. Refresh and try again.';
 try {
  const batch=[mutation];
  if(allocate)batch.unshift(allocate);
  if(write)batch.push(write.statement(timestamp));
  batch.push(auditWrite);
  const results=await db().batch(batch);
  const result=results[allocate?1:0];
  if(!result.meta.changes)throw new ApiError(conflict,409);
 } catch(error) {
  if(write){
   const saved=await write.committed();
   if(saved)return json(saved);
   if(error instanceof Error&&/record_writes\.saved_at|UNIQUE constraint failed: records\.id/.test(error.message))throw new ApiError(conflict,409);
  }
  throw error;
 }
 const saved=allocateReportNumber?await row(s,kind,recordId):{...data,id:recordId,createdAt:existing?.createdAt||timestamp,updatedAt:timestamp};
 return json({ok:true,id:recordId,updatedAt:timestamp,record:saved});
}catch(e){return fail(e);}}
export const GET=handle;
export const POST=handle;
export const PUT=handle;
export const DELETE=handle;
