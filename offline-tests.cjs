/* Service-worker behavior checks, independent of a browser installation. */
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const scope = 'https://example.test/michi/';
  const handlers = {};
  const entries = new Map();
  const oldPrefix = `michi-shell-${encodeURIComponent(scope)}-`;
  const deleted = [];
  const caches = {
    open: async name => ({ addAll: async files => {
      for (const file of files) {
        const local = file === './' ? 'index.html' : file.slice(2);
        assert(fs.existsSync(path.join(__dirname,local)), `Missing offline asset: ${local}`);
        entries.set(new URL(file,scope).href, {cached:true,path:local,cache:name});
      }
    }}),
    keys: async () => [`${oldPrefix}v0`,'another-app-cache','michi-shell-another-scope-v0'],
    delete: async key => { deleted.push(key); return true; },
    match: async request => entries.get(request.url)
  };
  const self = { registration:{scope}, location:{origin:'https://example.test'}, clients:{claim:async()=>{}}, skipWaiting:async()=>{}, addEventListener:(name,handler)=>{handlers[name]=handler;} };
  let networkCalls = 0;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'sw.js'),'utf8'), {self,caches,URL,fetch:async()=>{networkCalls++;throw new Error('Offline');}});
  let pending;
  handlers.install({waitUntil:p=>{pending=p;}}); await pending;
  assert.equal(entries.size,11);
  handlers.activate({waitUntil:p=>{pending=p;}}); await pending;
  assert.deepEqual(deleted,[`${oldPrefix}v0`]);
  for (const url of ['index.html','app.js','deck.js','srs.js','grading.js','icon-192.png']) {
    let response;
    handlers.fetch({request:{method:'GET',url:new URL(url,scope).href},respondWith:p=>{response=p;}});
    assert((await response).cached,`Offline cached ${url}`);
  }
  for (const request of [{method:'POST',url:scope+'app.js'}, {method:'GET',url:'https://other.test/app.js'}, {method:'GET',url:scope+'backup.json'}]) {
    let intercepted=false;
    handlers.fetch({request,respondWith:()=>{intercepted=true;}});
    assert.equal(intercepted,false);
  }
  assert.equal(networkCalls,0);
  console.log('PASS: offline asset completeness, cached core responses, scoped cache cleanup, no interception of user data or other origins.');
})().catch(e=>{console.error(e);process.exit(1);});
