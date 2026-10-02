// Seeds the database with a demo admin, field personnel, centers, an incident,
// two families/evacuees and their records. Run once after schema.sql:
//   npm run seed
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./db');

async function seed() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
    console.error('Refusing to seed demo accounts (admin / password123) in production.');
    console.error('Register the first account in the app instead - it becomes Admin Staff automatically.');
    process.exit(1);
  }
  console.log('Seeding RESCOM database...');
  const pass = await bcrypt.hash('password123', 10);

  const { rows: [admin] } = await db.query(
    `INSERT INTO USERS (first_name, last_name, username, email, password_hash, role, unit, phone)
     VALUES ('Admin','Commander','admin','admin@rescom.gov.ph',$1,'ADMIN_STAFF','Command Headquarters','+639170000001')
     RETURNING user_id`, [pass]
  );
  const { rows: [responder] } = await db.query(
    `INSERT INTO USERS (first_name, last_name, username, email, password_hash, role, unit, phone)
     VALUES ('Juan','Cruz','responder1','jcruz@rescom.gov.ph',$1,'FIELD_PERSONNEL','Alpha Rescue Team','+639170000002')
     RETURNING user_id`, [pass]
  );

  const { rows: [c1] } = await db.query(
    `INSERT INTO EVACUATION_CENTERS (center_name, barangay, address, capacity, occupancy, status)
     VALUES ('San Nicolas Central School','Barangay 1','Barangay 1, San Nicolas',300,120,'Open') RETURNING center_id`
  );
  await db.query(
    `INSERT INTO EVACUATION_CENTERS (center_name, barangay, address, capacity, occupancy, status)
     VALUES ('Barangay 12 Multipurpose Hall','Barangay 12','Barangay 12, San Nicolas',150,145,'Full')`
  );
  await db.query(
    `INSERT INTO EVACUATION_CENTERS (center_name, barangay, address, capacity, occupancy, status)
     VALUES ('San Nicolas Express Gymnasium','Barangay 3','Barangay 3, San Nicolas',500,210,'Open')`
  );

  const { rows: [incident] } = await db.query(
    `INSERT INTO DISASTER_INCIDENTS (disaster_name, disaster_type, brgy, severity, field_remarks, reporting_status, reported_by)
     VALUES ('Flooding Emergency','Flood','Barangay 12','High','Overflowing river near residential area','En Route',$1)
     RETURNING incident_id`, [responder.user_id]
  );
  await db.query(
    `INSERT INTO DISASTER_INCIDENTS (disaster_name, disaster_type, brgy, severity, field_remarks, reporting_status, reported_by)
     VALUES ('Road Obstruction','Road Blockage','Barangay 9','Medium','Fallen tree blocking evacuation route','Pending',$1)`,
    [admin.user_id]
  );

  const { rows: [fam1] } = await db.query(
    `INSERT INTO FAMILIES (family_name, household_address, barangay, contact_number)
     VALUES ('Santos Family','San Nicolas, Ilocos Norte','Barangay 1','0917 000 0001') RETURNING family_id`
  );
  const { rows: [fam2] } = await db.query(
    `INSERT INTO FAMILIES (family_name, household_address, barangay, contact_number)
     VALUES ('Reyes Family','San Nicolas, Ilocos Norte','Barangay 1','0917 000 0002') RETURNING family_id`
  );

  const { rows: [ev1] } = await db.query(
    `INSERT INTO EVACUEES (family_id, first_name, last_name, age, gender)
     VALUES ($1,'Pedro','Santos',45,'Male') RETURNING evacuee_id`, [fam1.family_id]
  );
  const { rows: [ev2] } = await db.query(
    `INSERT INTO EVACUEES (family_id, first_name, last_name, age, gender)
     VALUES ($1,'Maria','Reyes',28,'Female') RETURNING evacuee_id`, [fam2.family_id]
  );

  await db.query(
    `INSERT INTO EVACUATION_RECORDS (evacuee_id, center_id, incident_id, registered_by, status)
     VALUES ($1,$2,$3,$4,'Present')`, [ev1.evacuee_id, c1.center_id, incident.incident_id, responder.user_id]
  );
  await db.query(
    `INSERT INTO EVACUATION_RECORDS (evacuee_id, center_id, incident_id, registered_by, status)
     VALUES ($1,$2,$3,$4,'Present')`, [ev2.evacuee_id, c1.center_id, incident.incident_id, responder.user_id]
  );

  await db.query(
    `INSERT INTO PRIORITY_CASES (evacuee_id, case_type, description, priority_status, flagged_by)
     VALUES ($1,'Elderly','Requires assistance with mobility','Flagged',$2)`, [ev1.evacuee_id, responder.user_id]
  );
  await db.query(
    `INSERT INTO PRIORITY_CASES (evacuee_id, case_type, description, priority_status, flagged_by)
     VALUES ($1,'Pregnant','Third trimester, needs medical monitoring','Flagged',$2)`, [ev2.evacuee_id, responder.user_id]
  );

  await db.query(
    `INSERT INTO DROMIC_REPORTS (incident_id, generated_by, reporting_status, field_remarks)
     VALUES ($1,$2,'Active','Relief distribution underway in Barangays 12 & 9')`, [incident.incident_id, admin.user_id]
  );

  console.log('Done. Login with admin / password123 or responder1 / password123');
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
