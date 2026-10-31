const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { once } = require('node:events');
const pdf = require('../utils/dromicPdf');
const auth = require('../middleware/auth');
// Test export format policy with a known authenticated role, without a live DB.
auth.verifyToken = (req, res, next) => { req.user = { user_id: 1, role: 'FIELD_PERSONNEL' }; next(); };
const analytics = require('../routes/analytics.routes');
const dromic = require('../routes/dromic.routes');

test('PDF generation still produces a PDF document after removing the workbook builder', async () => {
  const stream = new PassThrough();const chunks=[];stream.on('data',b=>chunks.push(b));
  const end=once(stream,'end');
  pdf.buildDromicPdf({report:{report_id:1,report_no:1,disaster_name:'Sample incident',as_of:'2026-11-01T00:00:00Z',reporting_status:'Active'}},stream);
  await end;const buffer=Buffer.concat(chunks);
  assert.equal(buffer.subarray(0,5).toString(),'%PDF-');assert.ok(buffer.length>1000);
  assert.equal(pdf.buildDromicXlsx,undefined);
});
function invoke(router,path,query){
  return new Promise((resolve,reject)=>{
    const req={method:'GET',url:path,path,query,headers:{}};
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){resolve({status:this.statusCode,body});return this;}};
    router.handle(req,res,error=>{if(error)reject(error);else resolve({status:404});});
  });
}
for(const format of ['xlsx','csv']) test(`period report rejects ${format} exports`,async()=>{
  const result=await invoke(analytics,'/export',{from:'2026-10-01',to:'2026-10-31',type:'monthly',format});
  assert.equal(result.status,400);assert.match(result.body.error,/PDF only/);
});
test('removed Excel download route is no longer registered',async()=>{
  assert.equal((await invoke(dromic,'/1/xlsx',{})).status,404);
});
