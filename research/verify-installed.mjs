// Real installation identity + synthetic local-cache end-to-end verification.
// This never starts a messenger, logs in, or sends a network message.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {profiles} from '../drivers/installed.mjs';
import {families} from '../drivers/local-store.mjs';
import {run,regions} from '../cli.mjs';
const tempRoot=path.resolve(process.env.TEMP||'D:/Codex/tmp');
const directory=fs.mkdtempSync(path.join(tempRoot,'regional-installed-check-'));
const result={schema:1,date:new Date().toISOString(),verification:'installed-product-identity-plus-synthetic-cache',authenticatedLiveTested:false,networkActions:0,regions:[]};
try{
  for(const [id,profile]of Object.entries(profiles)){
    const region=regions.find(r=>r.id===id).region,opts={home:path.join(directory,'home')};
    const status=await run(['--region',region,'status'],opts);assert.equal(status.verified,true,region);
    const spec=families[profile.family].stores.notes,file=path.join(directory,id+'.db'),db=new DatabaseSync(file);
    const columns=[...new Set(Object.values(spec.fields))];
    db.exec('CREATE TABLE "'+spec.table+'" ('+columns.map(c=>'"'+c+'" TEXT').join(',')+')');
    const row={id:'synthetic-note',owner:'SYNTHETIC-OWNER',subject:'합성 검증 자료',sender:'가상 교직원',date:'20261101',content:'실제 쪽지가 아닌 회귀 검증',searchText:'합성 검증'};
    const values=columns.map(c=>row[Object.entries(spec.fields).find(([key,value])=>value===c)[0]]||'');
    db.prepare('INSERT INTO "'+spec.table+'" VALUES ('+columns.map(()=>'?').join(',')+')').run(...values);db.close();
    const account=await run(['--region',region,'accounts','--database',file],opts);assert.equal(account.accounts[0].owner,'SYNTHETIC-OWNER');
    await run(['--region',region,'bind-store','--database',file,'--owner','SYNTHETIC-OWNER'],opts);
    const found=await run(['--region',region,'notes','--query','합성 검증'],opts);assert.equal(found.records.length,1);
    const one=await run(['--region',region,'note','--id','synthetic-note'],opts);assert.equal(one.records[0].content.text,row.content);
    result.regions.push({region,id,family:profile.family,installationVerified:true,sha256:status.sha256,syntheticAccountsBindSearchReadPassed:true,authenticatedLiveTested:false});
  }
  const output=process.argv[2];if(output)fs.writeFileSync(path.resolve(output),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}finally{
  const relative=path.relative(tempRoot,path.resolve(directory));
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!path.basename(directory).startsWith('regional-installed-check-'))throw Error('Temporary cleanup target rejected');
  fs.rmSync(directory,{recursive:true,force:true});
}
