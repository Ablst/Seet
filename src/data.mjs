const forbidden = new Set(['__proto__','constructor','prototype','name']);
export function validateDataset(input) {
 if (!input || !Array.isArray(input.metrics) || !Array.isArray(input.rows) || input.metrics.length<1 || input.metrics.length>32 || input.rows.length<1 || input.rows.length>50000) throw new Error('需要 1–50000 行数据、1–32 个数值指标。');
 if(input.metrics.some(m=>!m||typeof m.key!=='string'||(m.unit!==undefined&&typeof m.unit!=='string'))) throw new Error('指标名称和单位必须是文本。');
 const metrics=input.metrics.map(m=>({key:m.key.trim(),unit:(m.unit||'').slice(0,12)}));
 if(metrics.some(m=>!m.key||m.key.length>40||forbidden.has(m.key))||new Set(metrics.map(m=>m.key)).size!==metrics.length) throw new Error('指标名为空、重复或不受支持。');
 const dimensions=Array.isArray(input.dimensions)?input.dimensions.map(d=>({key:String(d?.key||'').trim(),type:d?.type==='date'?'date':'text'})):[];
 if(dimensions.length>24||dimensions.some(d=>!d.key||d.key.length>60||forbidden.has(d.key)||metrics.some(m=>m.key===d.key))||new Set(dimensions.map(d=>d.key)).size!==dimensions.length)throw new Error('分类字段不受支持或重复。');
 const rows=input.rows.map(r=>{
  if(typeof r.name!=='string'||!r.name.trim()) throw new Error('每行都需要一个分类名称。');
  const row={name:r.name.trim().slice(0,100)};
  for(const d of dimensions){if(r[d.key]!==null&&typeof r[d.key]!=='string')throw new Error('分类字段必须是文本或空值。');row[d.key]=r[d.key]===null?null:r[d.key].slice(0,200);}
  for(const m of metrics) { const v=r[m.key]; if(v!==null && (typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1e15)) throw new Error(`“${m.key}”必须是有限数字或空值。`); row[m.key]=v; }
  return row;
 });
 return {title:String(input.title||'我的数据分析').slice(0,80),metrics,rows,...(dimensions.length?{dimensions}:{})};
}
function numberCell(raw) {
 if(raw===null||raw===undefined||String(raw).trim()===''||/^(—|-|N\/A|null)$/i.test(String(raw).trim())) return {value:null,unit:''};
 if(typeof raw==='number') return {value:raw,unit:''};
 const match=String(raw).trim().replace(/[,，](?=\d{3}(?:\D|$))/g,'').match(/^([+-]?\d+(?:\.\d+)?)\s*(万|千)?\s*(美元|元|人|杯|件|个|次|份|小时|分钟|%|％)?$/);
 if(!match) return null;
 return {value:Number(match[1])*(match[2]==='万'?10000:match[2]==='千'?1000:1),unit:match[3]?.replace('％','%')||''};
}
export function fromMatrix(matrix,title='导入数据') {
 const body=matrix.filter(r=>Array.isArray(r)&&r.some(v=>v!==null&&v!==undefined&&String(v).trim()!==''));
 if(body.length<2) throw new Error('需要表头和至少一行数据。');
 if(body.length>50001) throw new Error('当前支持最多 50000 行，请拆分更大的文件。');
 const headers=body[0].map(v=>String(v??'').trim());
 if(headers.some(h=>!h)||new Set(headers).size!==headers.length) throw new Error('表头不能为空或重复。');
 if(body.some(r=>r.length>headers.length))throw new Error('部分行比表头多出字段，请检查分隔符。');
 const columns=headers.map((h,i)=>({h,i,cells:body.slice(1).map(r=>numberCell(r[i]))}));
 for(const c of columns)if(c.cells.some(v=>v&&v.value!==null)&&c.cells.some(v=>v===null))throw new Error(`“${c.h}”列包含无法识别的数字，请修正后导入。`);
 const numeric=columns.filter(c=>c.cells.every(v=>v!==null));
 if(!numeric.length) throw new Error('没有找到数值列。请检查数字格式及单位是否一致。');
 const textColumns=columns.filter(c=>!numeric.includes(c));
 const labelIndex=headers.findIndex((_,i)=>!numeric.some(c=>c.i===i));
 const metrics=numeric.map(c=>{
  const suffix=c.h.match(/[（(]([^（）()]+)[）)]$/);
  const headerUnit=suffix?.[1].trim().replace('％','%')||'';
  const units=[...new Set(c.cells.map(v=>v.unit).filter(Boolean))];
  if(units.length>1||(headerUnit&&units[0]&&headerUnit!==units[0]))throw new Error(`“${c.h}”列的单位不一致，请先统一。`);
  return {key:suffix?c.h.slice(0,suffix.index).trim():c.h,unit:units[0]||headerUnit};
 });
 const dateString=v=>v instanceof Date?v.toISOString().slice(0,10):String(v??'').trim();
 const dimensions=textColumns.length>1?textColumns.map(c=>({key:c.h,type:body.slice(1).filter(r=>r[c.i]!=null).every(r=>r[c.i] instanceof Date||/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(String(r[c.i])))?'date':'text'})):[];
 const rows=body.slice(1).map((r,idx)=>Object.fromEntries([['name',labelIndex<0?`记录 ${idx+1}`:dateString(r[labelIndex])||`记录 ${idx+1}`],...dimensions.map(d=>[d.key,r[headers.indexOf(d.key)]==null?null:dateString(r[headers.indexOf(d.key)])]),...numeric.map((c,i)=>[metrics[i].key,c.cells[idx].value])]));
 return validateDataset({title,metrics,rows,dimensions});
}
export function parseNatural(text) {
 const normalized=text.replace(/[,，](?=\d{3}(?:\D|$))/g,'');
 const matcher=/([^\d，,；;。\n、]+?)\s*([+-]?\d+(?:\.\d+)?)\s*(万|千)?\s*(美元|元|人|杯|件|个|次|份|小时|分钟|%|％)?/g;
 const rows=[]; const metrics=[]; let lastName=''; let cursor=0;
 for(const match of normalized.matchAll(matcher)) {
  if(!/^[\s，,；;。\n、]*$/.test(normalized.slice(cursor,match.index)))throw new Error('部分内容或单位无法识别，请分句补全数据，或连接 AI 解析。');
  cursor=match.index+match[0].length;
  let prefix=match[1].trim().replace(/^[：:\s]+/,'');
  if(/年|月|日|\/$/.test(prefix) || /^\d/.test(prefix)) throw new Error('带日期的复杂描述请改用表格，或连接 AI 解析。');
  const metricMatch=prefix.match(/(报名|到场|收入|销售额|销量|支出|利润|订单量|订单|人数|成本|预算|满意度)\s*(?:为|是|有|共|达到|[:：])?\s*$/);
  let key='数值'; let name=prefix;
  if(metricMatch){key=metricMatch[1]; name=prefix.slice(0,metricMatch.index).trim();}
  name=name.replace(/(?:卖了|售出|卖出|销售了|销售|为|是|有|共|达到|[:：])\s*$/,'').trim();
  if(!name) name=lastName;
  if(!name || name.length>24 || /帮我|分析|比较|我们|分别|一共/.test(name)) throw new Error('请按“名称 + 指标 + 数字”分句，或连接 AI 解析更复杂的描述。');
  let metric=metrics.find(m=>m.key===key);
  const unit=(match[4]||metric?.unit||'').replace('％','%');
  if(metric&&metric.unit&&unit&&metric.unit!==unit) throw new Error('同一指标的单位不一致，请先统一单位。');
  if(!metric){metric={key,unit};metrics.push(metric);}else if(!metric.unit)metric.unit=unit;
  const value=Number(match[2])*(match[3]==='万'?10000:match[3]==='千'?1000:1);
  let row=rows.at(-1);
  if(!row||row.name!==name||row[key]!==undefined){row={name};rows.push(row);}
  row[key]=value;lastName=name;
 }
 if(!rows.length) throw new Error('没有找到可分析的数字。请补充数据，或导入文件。');
 const remainder=normalized.slice(cursor).replace(/^[\s，,；;。\n、]+|[\s，,；;。\n、]+$/g,'');
 if(remainder&&!/^(?:请|帮我)?(?:比较一下效果|比较一下|比较|画个趋势图|画个柱状图|画图|生成图表|分析一下|分析)$/.test(remainder))throw new Error('部分内容或单位无法识别，请分句补全数据，或连接 AI 解析。');
 for(const row of rows)for(const m of metrics)if(row[m.key]===undefined)row[m.key]=null;
 return validateDataset({title:'自然语言数据分析',metrics,rows});
}
export function summarize(dataset,key) {
 const values=dataset.rows.filter(r=>r[key]!==null);
 const count=values.length,total=count?values.reduce((s,r)=>s+r[key],0):null;
 const max=count?Math.max(...values.map(r=>r[key])):null;
 return {total,count,missing:dataset.rows.length-count,average:count?total/count:null,max,min:count?Math.min(...values.map(r=>r[key])):null,leaders:values.filter(r=>r[key]===max).map(r=>r.name)};
}
export function csvExport(d) {
 const cell=v=>{let s=v===null?'':String(v); if(typeof v==='string'&&/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const dimensions=d.dimensions||[];
 return '\uFEFF'+[[...(dimensions.length?dimensions.map(x=>x.key):['分类']),...d.metrics.map(m=>m.key+(m.unit?`（${m.unit}）`:''))],...d.rows.map(r=>[...(dimensions.length?dimensions.map(x=>r[x.key]):[r.name]),...d.metrics.map(m=>r[m.key])])].map(r=>r.map(cell).join(',')).join('\r\n');
}
export const samples=[
 {id:'coffee',title:'一周咖啡销售',description:'从一周记录，看见每日变化',source:'演示数据',metrics:[{key:'销量',unit:'杯'},{key:'收入',unit:'元'}],rows:[{name:'周一',销量:120,收入:2160},{name:'周二',销量:150,收入:2700},{name:'周三',销量:90,收入:1620},{name:'周四',销量:180,收入:3240},{name:'周五',销量:210,收入:3780},{name:'周六',销量:280,收入:5040},{name:'周日',销量:230,收入:4140}]},
 {id:'clubs',title:'社团活动复盘',description:'比较报名与到场人数',source:'演示数据',metrics:[{key:'报名',unit:'人'},{key:'到场',unit:'人'}],rows:[{name:'摄影社',报名:80,到场:62},{name:'篮球社',报名:120,到场:108},{name:'读书会',报名:50,到场:45}]},
 {id:'budget',title:'活动预算分布',description:'了解每一笔支出的占比',source:'演示数据',metrics:[{key:'预算',unit:'元'}],rows:[{name:'场地',预算:1200},{name:'物料',预算:680},{name:'宣传',预算:320},{name:'餐饮',预算:800},{name:'其他',预算:200}]}
];
