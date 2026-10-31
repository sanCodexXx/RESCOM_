const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { verifyToken, requireRole } = require('../middleware/auth');
process.env.JWT_SECRET = 'local-test-secret-not-used-in-production';
function response() { return { code: null, body: null, status(c) { this.code=c; return this; }, json(b) { this.body=b; return this; } }; }
test('a demoted administrator uses the current database role', async () => {
  const original=db.query;
  db.query=async sql => sql.startsWith('SELECT') ? { rows: [{status:'Active',role:'FIELD_PERSONNEL'}] } : {rows:[]};
  try {
    const req={headers:{authorization:'Bearer '+jwt.sign({user_id:1,role:'ADMIN_STAFF'},process.env.JWT_SECRET)}};
    const res=response();let passed=false;
    await verifyToken(req,res,()=>{passed=true});
    assert.equal(passed,true);assert.equal(req.user.role,'FIELD_PERSONNEL');
    requireRole('ADMIN_STAFF')(req,res,()=>assert.fail('role escalation'));
    assert.equal(res.code,403);
  } finally { db.query=original; }
});
test('inactive account cannot use an existing JWT', async () => {
  const original=db.query;db.query=async()=>({rows:[{status:'Inactive',role:'ADMIN_STAFF'}]});
  try {
    const req={headers:{authorization:'Bearer '+jwt.sign({user_id:1,role:'ADMIN_STAFF'},process.env.JWT_SECRET)}};
    const res=response();await verifyToken(req,res,()=>assert.fail('inactive account accepted'));
    assert.equal(res.code,401);
  } finally { db.query=original; }
});
test('missing schema no longer bypasses account checks', async () => {
  const original=db.query;const failure=Object.assign(new Error('missing column'),{code:'42703'});db.query=async()=>{throw failure};
  try {
    const req={headers:{authorization:'Bearer '+jwt.sign({user_id:1,role:'ADMIN_STAFF'},process.env.JWT_SECRET)}};
    let caught;await verifyToken(req,response(),e=>{caught=e});assert.equal(caught,failure);assert.equal(req.user,undefined);
  } finally { db.query=original; }
});
const { socketAuth } = require('../middleware/socketAuth');
const { setIo, disconnectUser } = require('../utils/notify');
test('socket handshake rejects a disabled account despite valid JWT', async () => {
  const original=db.query;db.query=async()=>({rows:[{status:'Inactive',role:'ADMIN_STAFF'}]});
  try {
    const socket={handshake:{auth:{token:jwt.sign({user_id:1,role:'ADMIN_STAFF'},process.env.JWT_SECRET)}},data:{}};
    let error;await socketAuth(socket,e=>{error=e});assert.equal(error.message,'unauthorized');assert.equal(socket.data.user,undefined);
  } finally { db.query=original; }
});
test('socket handshake uses current role after demotion', async () => {
  const original=db.query;db.query=async()=>({rows:[{status:'Active',role:'FIELD_PERSONNEL'}]});
  try {
    const socket={handshake:{auth:{token:jwt.sign({user_id:1,role:'ADMIN_STAFF'},process.env.JWT_SECRET)}},data:{}};
    let error;await socketAuth(socket,e=>{error=e});assert.equal(error,undefined);assert.equal(socket.data.user.role,'FIELD_PERSONNEL');
  } finally { db.query=original; }
});
test('account changes disconnect only the affected user room', () => {
  let room, close;
  setIo({in(value){room=value;return {disconnectSockets(value){close=value}}}});
  disconnectUser(12);assert.equal(room,'user:12');assert.equal(close,true);setIo(null);
});
