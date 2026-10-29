import test from 'node:test';
import assert from 'node:assert/strict';
import { readCompletion } from '../server/report/narrative.mjs';
function stream(events) { return new Response(events,{headers:{'Content-Type':'text/event-stream'}}); }
const event=(content,finish_reason)=>'data: '+JSON.stringify({choices:[{delta:{content},finish_reason}]});
test('report stream retains final event without a trailing newline',async()=>{
 assert.equal(await readCompletion(stream(event('{"summary":',undefined)+'\n\n'+event('"完整"}','stop')),()=>{}),'{"summary":"完整"}');
});
test('report stream reports truncated final event even without newline',async()=>{
 await assert.rejects(readCompletion(stream(event('{}','length')),()=>{}),/truncated/);
});
test('report stream distinguishes interrupted transport from invalid data',async()=>{
 await assert.rejects(readCompletion(stream(event('{"summary":','')+'\n'),()=>{}),/interrupted/);
});
