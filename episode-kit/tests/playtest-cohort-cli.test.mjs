import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createPlaytestRecord } from '../lib/playtest-export.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const entrypoints=[['playtest-cohort.mjs'],['cli.mjs','playtest-cohort']];
const fixture=async name=>JSON.parse(await readFile(new URL('./fixtures/playtest-v0.1-'+name+'.json',import.meta.url),'utf8'));
async function temporary(t) {
  const directory=await mkdtemp(join(tmpdir(),'ludolingua-cohort-cli-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  return directory;
}
async function save(directory,name,value) {
  const path=join(directory,name);
  await writeFile(path,typeof value==='string'?value:JSON.stringify(value));
  return path;
}
function invoke(entry,args) {
  const result=spawnSync(process.execPath,[...entry,...args],{
    cwd:root,encoding:'utf8',timeout:30000,maxBuffer:2_000_000
  });
  assert.equal(result.error,undefined,'CLI process must start and finish');
  assert.equal(result.signal,null,'CLI must exit normally');
  assert.equal(result.stderr,'','CLI must emit its structured result without runtime errors');
  return {status:result.status,value:JSON.parse(result.stdout)};
}
function both(args,expectedStatus) {
  const results=entrypoints.map(entry=>invoke(entry,args));
  for(const result of results) assert.equal(result.status,expectedStatus);
  assert.deepEqual(results[0].value,results[1].value,'maintained alias and standalone entrypoint agree');
  return results[0].value;
}
function rejected(args,pattern) {
  const value=both(args,1);
  assert.equal(value.ok,false);
  assert.equal(typeof value.error,'string');
  assert.ok(value.error.length>0);
  assert.equal(Object.hasOwn(value,'episodes'),false,'failure must not contain a partial cohort');
  assert.equal(Object.hasOwn(value,'integrity'),false,'failure must not claim verified aggregate integrity');
  if(pattern) assert.match(value.error,pattern);
}
async function sparse(directory,name,bytes) {
  const path=join(directory,name),file=await open(path,'wx');
  try { await file.truncate(bytes); } finally { await file.close(); }
  return path;
}

test('both CLI routes receive real empty and failed journals as integrity-success without inventing success',async t=>{
  const directory=await temporary(t);
  const empty=await save(directory,'empty record.json',await fixture('empty'));
  const failed=await save(directory,'failed record.json',await fixture('attempt'));
  const value=both([empty,failed],0);
  assert.equal(value.schema,'ludolingua.playtest-cohort-report.v1');
  assert.equal(value.integrity.allInputRecordsRecomputed,true);
  assert.equal(value.inputs.uniqueSessions,2);
  assert.equal(value.episodes.length,1);
  assert.equal(value.episodes[0].recorded.sessions,2);
  assert.equal(value.episodes[0].recorded.attempts,1);
  assert.equal(value.episodes[0].recorded.successfulAttempts,0);
  assert.equal(value.episodes[0].recorded.sessionsWithSuccess,0);
});

test('both CLI routes reject malformed and conflicting inputs without a partial aggregate',async t=>{
  const directory=await temporary(t),old=await fixture('empty');
  const good=await save(directory,'good.json',old);
  const malformed=await save(directory,'broken.json','{');
  rejected([good,malformed]);
  const first=await createPlaytestRecord(old.episode,'conflicting-cli',[{type:'hint',elapsedMs:0}]);
  const second=await createPlaytestRecord(old.episode,'conflicting-cli',[{type:'reveal',elapsedMs:0}]);
  const a=await save(directory,'first.json',first),b=await save(directory,'second.json',second);
  rejected([good,a,b],/conflict/i);
  rejected([b,a,good],/conflict/i);
});

test('both CLI routes reject absent arguments, directories, missing paths and more than 100 files',async t=>{
  const directory=await temporary(t);
  rejected([]);
  rejected([directory],/regular file/i);
  rejected([join(directory,'missing.json')]);
  // A nonexistent path proves argument-count rejection precedes file access.
  rejected(Array(101).fill(join(directory,'never-read.json')),/1-100|between 1 and 100/i);
});

test('sparse oversized input fails its file-size guard before JSON parsing',async t=>{
  const directory=await temporary(t);
  const path=await sparse(directory,'oversized.json',20_000_001);
  rejected([path],/20 MB|record limit/i);
});

test('individually permitted sparse files exceeding aggregate size fail before JSON parsing',async t=>{
  const directory=await temporary(t),paths=[];
  for(let index=0;index<3;index++) paths.push(await sparse(directory,'part-'+index+'.json',14_000_000));
  rejected(paths,/40 MB|combined input/i);
});
