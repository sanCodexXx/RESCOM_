export const barangays = ['San Francisco','San Ildefonso','San Agustin','San Baltazar','San Bartolome','San Cayetano','San Eugenio','San Fernando','San Gregorio','San Guillermo','San Jose','San Juan Bautista','San Lorenzo','San Lucas','San Marcos','San Miguel','San Pablo','San Paulo','San Pedro','San Rufino','San Silvestre','Santa Asuncion','Santa Cecilia','Santa Monica'];
export const priorities = ['None','Infant','Senior citizen','PWD','Pregnant','Lactating mother','Solo parent','Medical attention'];
export const kinds = ['centers','households','events','reports'] as const;
export type Kind = typeof kinds[number];
export type Row = {id:string;createdAt:string;updatedAt:string;[key:string]:any};
export function phDate(date=new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(date); }
export function summarize(data:{centers:Row[];households:Row[];events:Row[]},eventId='all') {
 const households=data.households.filter(h=>eventId==='all'||h.eventId===eventId),active=households.filter(h=>h.status==='In center');
 const people=active.flatMap(h=>(h.members||[]).map((m:any)=>({...m,householdId:h.id,centerId:h.centerId})));
 const centers:(Row & {occupancy:number;families:number})[]=data.centers.map(c=>({...c,occupancy:active.filter(h=>h.centerId===c.id).reduce((a,h)=>a+h.members.length,0),families:active.filter(h=>h.centerId===c.id).length}));
 return {families:active.length,people:people.length,priority:people.filter((p:any)=>p.priority!=='None').length,pendingCare:people.filter((p:any)=>p.priority!=='None'&&p.careStatus!=='Assisted').length,activeCenters:centers.filter(c=>c.status==='Open').length,capacity:centers.filter(c=>c.status==='Open').reduce((a,c)=>a+Number(c.capacity),0),returned:households.filter(h=>h.status==='Returned home').reduce((a,h)=>a+h.members.length,0),male:people.filter((p:any)=>p.sex==='Male').length,female:people.filter((p:any)=>p.sex==='Female').length,children:people.filter((p:any)=>p.age<18).length,seniors:people.filter((p:any)=>p.age>=60).length,centers};
}
