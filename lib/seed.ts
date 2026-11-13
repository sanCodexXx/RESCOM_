import { db, id, now } from './server';
import { phDate } from './domain';
export async function seed(){
 const exists=await db().prepare("SELECT id FROM records WHERE space='training' LIMIT 1").first();if(exists)return;
 const stamp=now(),date=(days:number)=>phDate(new Date(Date.now()-days*86400000));
 const centers=[['San Francisco',30,'Open'],['San Lorenzo',32,'Open'],['San Marcos',40,'Open'],['San Jose',36,'Open'],['Santa Monica',40,'Open'],['San Miguel',32,'Standby']];
 const statements:any[]=[];
 const add=(key:string,kind:string,data:any,created=stamp)=>statements.push(db().prepare('INSERT OR IGNORE INTO records(id,space,kind,data,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(key,'training',kind,JSON.stringify(data),created,stamp));
 centers.forEach((c,i)=>add('training-center-'+i,'centers',{name:c[0]+' Training Center',barangay:c[0],capacity:c[1],status:c[2],contact:'Training coordinator '+(i+1),phone:'',remarks:'Illustrative center for training. Not an official evacuation site.'}));
 add('training-event','events',{name:'Monsoon response exercise',type:'Flood',occurredAt:date(6),status:'Active',remarks:'Training scenario. No current disaster is asserted.'});
 for(let i=0;i<32;i++){
  const count=3+i%4,center=i%5,departed=i>27;
  const members=Array.from({length:count},(_,m)=>({id:'training-member-'+i+'-'+m,name:'Training resident '+String(i*6+m+1).padStart(3,'0'),age:m===0?32+i%26:m===1?28+i%20:m===2?(i%6===0?68:8+i%8):3+m,sex:(i+m)%2===0?'Female':'Male',relationship:m===0?'Head':m===1?'Spouse':'Child',priority:m===2&&i%6===0?'Senior citizen':m===count-1&&i%5===0?'PWD':m===1&&i%7===0?'Pregnant':'None',careStatus:i%3===0?'Assisted':'Needs review',notes:''}));
  add('training-household-'+i,'households',{headName:'Training household '+String(i+1).padStart(2,'0'),barangay:centers[center][0],address:'Training address, San Nicolas',phone:'',centerId:'training-center-'+center,eventId:'training-event',status:departed?'Returned home':'In center',arrivalDate:date(Math.max(0,6-Math.floor(i/5))),departureDate:departed?date(0):'',members,notes:'Fictional household for training.'},new Date(Date.now()-(32-i)*3600000).toISOString());
 }
 for(let i=0;i<5;i++)statements.push(db().prepare('INSERT OR IGNORE INTO accounts(id,space,name,email,phone,role,requested_role,status,center_id,verified_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind('training-person-'+i,'training','Training officer '+(i+1),'officer'+(i+1)+'@example.invalid','','field','field',i===4?'Pending approval':'Active','training-center-'+i,i===4?null:stamp,stamp));
 statements.push(db().prepare('INSERT INTO activity(id,space,actor,action,detail,created_at) VALUES(?,?,?,?,?,?)').bind(id(),'training','RESCOM','Training workspace ready','Illustrative records are separate from live records.',stamp));
 await db().batch(statements);
}
