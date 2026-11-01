import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {families,queryStore,accounts,openStore} from '../drivers/local-store.mjs';
import {profiles,installation} from '../drivers/installed.mjs';
const fixture=callback=>{const directory=fs.mkdtempSync(path.join(process.env.TEMP||os.tmpdir(),'messenger-store-'));try{return callback(directory);}finally{fs.rmSync(directory,{recursive:true,force:true});}};
function database(directory,family,kind){
  const spec=families[family].stores[kind],file=path.join(directory,kind+'.db'),db=new DatabaseSync(file);
  const columns=[...new Set([...Object.values(spec.fields),...spec.search])];
  db.exec('CREATE TABLE "'+spec.table+'" ('+columns.map(c=>'"'+c+'" BLOB').join(',')+')');
  const insert=(values)=>db.prepare('INSERT INTO "'+spec.table+'" ('+columns.map(c=>'"'+c+'"').join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').run(...columns.map(c=>values[Object.entries(spec.fields).find(([a,col])=>col===c)?.[0]]??''));
  return {file,db,insert};
}
test('all six installed builds contain every field used by their family driver',()=>{
  assert.equal(Object.keys(profiles).length,6);
  for(const profile of Object.values(profiles))for(const [kind,spec]of Object.entries(families[profile.family].stores)){
    const schema=profile.nativeSchemas[spec.table];assert.ok(schema,profile.product+' '+kind);
    for(const field of [...Object.values(spec.fields),...spec.search])assert.ok(schema.columns.includes(field),profile.product+' '+field);
  }
});
for(const family of Object.keys(families))test(family+' isolates owners and reads without changing read status or file bytes',()=>fixture(directory=>{
  const f=database(directory,family,'notes');
  f.insert({id:'one',owner:'my-account',sender:'김교사',subject:'회의 자료',date:'20261101',content:'원문',readFlag:'N',readDate:'',searchText:'원문'});
  f.insert({id:'two',owner:'other-account',sender:'다른 계정',subject:'회의 자료',date:'20261102',content:'접근하지 않을 기록'});f.db.close();
  const before=fs.readFileSync(f.file);
  assert.equal(accounts(f.file,family,'notes').length,2);
  const result=queryStore(f.file,family,'notes',{owner:'my-account',query:'회의'});
  assert.equal(result.records.length,1);assert.equal(result.records[0].id,'one');assert.equal(result.marksRead,false);assert.equal(result.serverSynchronized,false);
  assert.throws(()=>queryStore(f.file,family,'notes',{owner:'unknown'}),/계정/);
  assert.equal(queryStore(f.file,family,'notes',{owner:'my-account',id:'two'}).records.length,0);
  assert.deepEqual(fs.readFileSync(f.file),before);
}));
test('parameterized literal search handles Korean, percent, underscore, backslash and SQL-like input',()=>fixture(directory=>{
  const f=database(directory,'ucware-delphi','notes');
  f.insert({id:'1',owner:'me',subject:'한글 100%_\\ 자료',date:'20260101'});
  f.insert({id:'2',owner:'me',subject:'한글 100다른자료',date:'20260102'});f.db.close();
  assert.equal(queryStore(f.file,'ucware-delphi','notes',{owner:'me',query:'%_\\'}).records.length,1);
  assert.equal(queryStore(f.file,'ucware-delphi','notes',{owner:'me',query:"' OR 1=1 --"}).records.length,0);
  assert.throws(()=>queryStore(f.file,'ucware-delphi','notes',{owner:'me',limit:101}),/limit/);
}));
test('different vendor schema, views, encrypted data and missing columns are refused',()=>fixture(directory=>{
  const f=database(directory,'ucware-delphi','notes');f.db.close();
  assert.throws(()=>openStore(f.file,'ultari-atmessenger7','notes'),/테이블/);
  const encrypted=path.join(directory,'encrypted.db');fs.writeFileSync(encrypted,Buffer.alloc(128));assert.throws(()=>openStore(encrypted,'ucware-delphi','notes'),/암호화/);
  const v=path.join(directory,'view.db'),db=new DatabaseSync(v);db.exec('CREATE TABLE source(value); CREATE VIEW tbl_message AS SELECT * FROM source');db.close();assert.throws(()=>openStore(v,'ucware-delphi','notes'),/테이블/);
  const changed=path.join(directory,'changed.db'),c=new DatabaseSync(changed);c.exec('CREATE TABLE tbl_message(msg_key)');c.close();assert.throws(()=>openStore(changed,'ucware-delphi','notes'),/스키마/);
}));
test('binary rich text remains opaque and duplicate message keys are never resolved arbitrarily',()=>fixture(directory=>{
  const f=database(directory,'ucware-delphi','notes');f.insert({id:'blob',owner:'me',date:'20260101',content:Buffer.from([0x78,0x9c,0xff,0]),searchText:'앱의 검색용 텍스트'});f.db.close();
  const value=queryStore(f.file,'ucware-delphi','notes',{owner:'me',id:'blob'}).records[0];assert.equal(value.content.format,'opaque-binary');assert.equal(value.content.text,null);assert.equal(value.searchText,'앱의 검색용 텍스트');assert.equal(value.attachments.downloadSupported,false);
  const db=new DatabaseSync(f.file);db.exec('INSERT INTO tbl_message SELECT * FROM tbl_message');db.close();assert.throws(()=>queryStore(f.file,'ucware-delphi','notes',{owner:'me',id:'blob'}),/여러 기록/);
}));
test('pagination is bounded and chat-room filtering does not mix rooms or owners',()=>fixture(directory=>{
  const f=database(directory,'ultari-atmessenger7','chatMessages');for(let i=0;i<5;i++)f.insert({id:String(i),roomId:i===4?'other':'room',owner:'me',date:'2026010'+i,content:'본문'+i});f.db.close();
  const first=queryStore(f.file,'ultari-atmessenger7','chatMessages',{owner:'me',roomId:'room',limit:2});assert.deepEqual(first.records.map(r=>r.id),['3','2']);assert.equal(first.nextOffset,2);
  const second=queryStore(f.file,'ultari-atmessenger7','chatMessages',{owner:'me',roomId:'room',limit:2,offset:2});assert.deepEqual(second.records.map(r=>r.id),['1','0']);assert.equal(second.nextOffset,null);
}));
test('shared executable names cannot bind another regional product or an updated binary',()=>fixture(directory=>{
  fs.writeFileSync(path.join(directory,'ucware_m.exe'),'synthetic binary');fs.writeFileSync(path.join(directory,'ucw_config.ini'),'program_title=이음(EUM)');
  const sha256=createHash('sha256').update('synthetic binary').digest('hex'),base={installDirectory:'test',executable:'ucware_m.exe',sha256,config:{file:'ucw_config.ini',encoding:'utf-8',key:'program_title',value:'이음(EUM)'}};
  assert.equal(installation(base,directory).verified,true);assert.equal(installation({...base,config:{...base.config,value:'제주특별자치도교육청 메신저'}},directory).verified,false);
  fs.appendFileSync(path.join(directory,'ucware_m.exe'),'changed');assert.equal(installation(base,directory).verified,false);
}));
