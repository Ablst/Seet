import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNatural, fromMatrix, validateDataset, summarize, csvExport } from '../src/data.mjs';
import Papa from 'papaparse';

test('extracts club counts as two comparable measures', () => {
 const d = parseNatural('摄影社报名80人、到场62人；篮球社报名120人、到场108人；读书会报名50人、到场45人。比较一下效果。');
 assert.equal(d.rows.length, 3); assert.equal(d.rows[1].报名, 120); assert.equal(d.rows[2].到场,45);
 assert.deepEqual(d.metrics.map(x=>x.key), ['报名','到场']);
});
test('simple natural language inherits shared measure and unit', () => {
 const d=parseNatural('周一卖了120杯，周二150杯，周三90杯，画个趋势图');
 assert.deepEqual(d.rows.map(x=>x.数值),[120,150,90]); assert.equal(d.metrics[0].unit,'杯');
});
test('no data means no fabricated rows',()=>assert.throws(()=>parseNatural('帮我分析为什么销售下降'),/数字/));
test('matrix preserves zeros and missing values and decimal negatives',()=>{
 const d=fromMatrix([['部门','利润'],['甲','0'],['乙',''],['丙','-2.5']]);
 assert.deepEqual(d.rows.map(x=>x.利润),[0,null,-2.5]);
 const s=summarize(d,'利润'); assert.equal(s.total,-2.5); assert.equal(s.count,2); assert.equal(s.missing,1);
});
test('refuses inconsistent units rather than adding them',()=>assert.throws(()=>parseNatural('甲收入100元，乙收入200美元'),/单位/));
test('rejects huge and non-finite model values',()=>assert.throws(()=>validateDataset({title:'x',metrics:[{key:'a',unit:''}],rows:[{name:'a',a:Infinity}]})));
test('csv neutralizes spreadsheet formulas and quotes labels',()=>{
 const d=validateDataset({title:'x',metrics:[{key:'值',unit:''}],rows:[{name:'=1+1',值:2}]});
 assert.match(csvExport(d),/'=1\+1/);
});
test('rejects partial interpretation and unsupported units',()=>{
 assert.throws(()=>parseNatural('周一120杯，周二未知，周三90杯'));
 assert.throws(()=>parseNatural('甲10公斤，乙20公斤'));
});
test('malformed numbers cannot silently remove a column',()=>assert.throws(()=>fromMatrix([['部门','收入'],['甲','100'],['乙','oops']]),/收入/));
test('all missing numbers have no total or average',()=>{
 const d=validateDataset({metrics:[{key:'值',unit:''}],rows:[{name:'甲',值:null}]});
 assert.equal(summarize(d,'值').total,null);
});
test('labels and metrics cannot contain structured model values',()=>assert.throws(()=>validateDataset({title:'x',metrics:[{key:{x:1},unit:''}],rows:[{name:'a','[object Object]':1}]})));

test('spreadsheet headers keep metric names separate from unit suffixes',()=>{
 const d=fromMatrix([['日期','销量（杯）','收入(元)'],['周一',120,2160]]);
 assert.deepEqual(d.metrics,[{key:'销量',unit:'杯'},{key:'收入',unit:'元'}]);
 assert.deepEqual(d.rows,[{name:'周一',销量:120,收入:2160}]);
});
test('spreadsheet units in header cannot contradict cell units',()=>{
 assert.throws(()=>fromMatrix([['分类','收入（元）'],['甲','100美元']]),/单位/);
});

test('CSV save and restore retains units and zero and missing numbers',()=>{
 const input=validateDataset({title:'样例',metrics:[{key:'收入',unit:'元'}],rows:[{name:'甲',收入:0},{name:'乙',收入:null},{name:'丙',收入:100}]});
 const restored=fromMatrix(Papa.parse(csvExport(input),{skipEmptyLines:true}).data);
 assert.deepEqual(restored.metrics,input.metrics);assert.deepEqual(restored.rows,input.rows);
});
test('empty metric columns survive import and export round trip',()=>{
 const d=fromMatrix([['分类','已知（人）','待填（人）'],['甲',10,null],['乙',0,null]]);
 assert.equal(d.metrics.length,2);assert.deepEqual(d.rows.map(r=>r.待填),[null,null]);
 const restored=fromMatrix(Papa.parse(csvExport(d),{skipEmptyLines:true}).data);
 assert.deepEqual(restored.metrics,d.metrics);assert.deepEqual(restored.rows,d.rows);
 assert.equal(summarize(restored,'待填').total,null);
});
