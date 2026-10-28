import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import read from 'read-excel-file/node';
import {fromMatrix, validateDataset} from '../src/data.mjs';
import {dimensionsFor} from '../src/analysis.mjs';

test('multi-dimensional imports retain fields and support monthly aggregation across 7300 rows',async()=>{
 const matrix=[['日期','家庭','用电量（kWh）','费用（元）'],...Array.from({length:7300},(_,i)=>[new Date(Date.UTC(2025,0,1+i%365)),`H${i%20}`,1,0.5])];
 const d=fromMatrix(matrix,'用电');
 const {buildView, defaultView, chartAvailability, dataProfile}=await import('../src/analysis.mjs');
 assert.equal(d.rows.length,7300);
 assert.deepEqual(d.dimensions.map(x=>x.key),['日期','家庭']);
 assert.equal(d.dimensions[0].type,'date');
 assert.equal(d.rows[0]['家庭'],'H0');
 const v=buildView(d,{...defaultView(d),groupBy:'日期',granularity:'month',aggregation:'sum'});
 assert.equal(v.rows.length,12); assert.equal(v.rows.reduce((s,r)=>s+r.用电量,0),7300);
 assert.equal(v.rows[0].name,'2025-01');
 assert.equal(chartAvailability(v,'用电量','pie').ok,true);
 assert.equal(validateDataset(d).dimensions.length,2);
 assert.equal(dataProfile(d).rowCount,7300);
});
test('grouping and filtering do not alter the raw table, missing stays missing',async()=>{
 const d=fromMatrix([['门店','天气','营业额（元）'],['A','晴',10],['A','雨',null],['B','晴',20]]);
 const {buildView,chartAvailability}=await import('../src/analysis.mjs');
 const v=buildView(d,{groupBy:'门店',granularity:'none',aggregation:'sum',filters:[{field:'天气',op:'eq',value:'晴'}]});
 assert.deepEqual(v.rows.map(r=>r.营业额),[10,20]); assert.equal(d.rows.length,3);
 assert.equal(chartAvailability({...v,rows:[{name:'A',营业额:-1}]},'营业额','pie').ok,false);
});
test('provided Excel workbooks preserve every source row and dimension',async t=>{
 const roots=[fileURLToPath(new URL('../samples',import.meta.url))];
 if(process.env.SEET_EXTRA_FIXTURES && fs.existsSync(process.env.SEET_EXTRA_FIXTURES))roots.push(process.env.SEET_EXTRA_FIXTURES);
 for(const root of roots)for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.xlsx'))){
  const [{data}]=await read(root+'/'+file); const d=fromMatrix(data,file);
  assert.equal(d.rows.length,data.length-1,file); assert.ok(dimensionsFor(d).length>=1,file);
  assert.equal(d.metrics.length+dimensionsFor(d).length,data[0].length,file);
  assert.equal(validateDataset(d).rows.length,d.rows.length,file);
 }
});
