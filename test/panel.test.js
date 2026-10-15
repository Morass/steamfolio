const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');

const source=name=>fs.readFileSync(path.join(__dirname,'../src',name),'utf8');
const catalog='<a href="/app/details/10/">Alpha</a><a href="/app/details/20/">Beta</a>';
function report(id) {return `<h1>Game</h1><table><tr><td>Lifetime Steam revenue (gross)</td><td>$${id==='10'?10:20}</td></tr><tr><td>Lifetime Steam revenue (net)</td><td>$0</td></tr><tr><td>Lifetime Steam units (?)</td><td>0</td></tr><tr><td>Wishlists</td><td>${id==='10'?3:5}</td></tr></table><table><tr><td>Total units</td><td></td><td>0</td></tr><tr><td>Total revenue</td><td></td><td>$0</td></tr></table>`;}
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
test('panel changes metric and accumulates any nonempty game subset',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://partner.steampowered.com/',runScripts:'outside-only'});
  const {window}=dom;
  window.chrome={runtime:{getURL:()=>'/panel.css'},storage:{local:{get:async()=>({}),set:()=>{}}}};
  window.eval(source('model.js'));
  window.eval(source('sources.js'));
  window.SteamfolioSources.fetchReport=async url=>url==='/dir.php'?catalog:report(url.match(/details\/(\d+)/)[1]);
  window.eval(source('content.js'));
  const root=window.document.querySelector('#steamfolio-root').shadowRoot;
  root.querySelector('.sf-launch').click();
  await tick();
  assert.equal(root.querySelector('#sf-count').textContent,'2/2');
  assert.equal(root.querySelector('.sf-total strong').textContent,'8');
  const boxes=root.querySelectorAll('#sf-games input');
  boxes[1].checked=false;boxes[1].dispatchEvent(new window.Event('change'));
  root.querySelector('#sf-refresh').click();await tick();
  assert.equal(root.querySelector('.sf-total strong').textContent,'3');
  const select=root.querySelector('#sf-metric');select.value='sales.lifetimeGross';select.dispatchEvent(new window.Event('change'));await tick();
  assert.match(root.querySelector('.sf-total strong').textContent,/10/);
  root.querySelector('#sf-none').click();await tick();
  assert.equal(root.querySelector('.sf-total strong'),null);
  assert.match(root.querySelector('#sf-status').textContent,/Select at least one/);
  dom.window.close();
});
test('selection change cannot show an old in-flight total',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://partner.steampowered.com/',runScripts:'outside-only'});
  const {window}=dom;
  window.chrome={runtime:{getURL:()=>'/panel.css'},storage:{local:{get:async()=>({}),set:()=>{}}}};
  window.eval(source('model.js'));
  window.eval(source('sources.js'));
  window.SteamfolioSources.fetchReport=async url=>url==='/dir.php'?catalog:report(url.match(/details\/(\d+)/)[1]);
  window.eval(source('content.js'));
  const root=window.document.querySelector('#steamfolio-root').shadowRoot;
  root.querySelector('.sf-launch').click();
  await tick();
  const releases=[];
  window.SteamfolioSources.fetchReport=()=>new Promise(resolve=>{releases.push(resolve);});
  root.querySelector('#sf-refresh').click();
  await tick();
  const box=root.querySelector('#sf-games input');
  box.checked=false;box.dispatchEvent(new window.Event('change'));
  releases.forEach((release,i)=>release(report(i===0?'10':'20')));
  await tick();
  assert.equal(root.querySelector('.sf-total strong'),null);
  assert.equal(root.querySelector('#sf-refresh').disabled,false);
  dom.window.close();
});
test('opening the pane triggers the first report load',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://partner.steampowered.com/',runScripts:'outside-only'});
  const {window}=dom;
  window.chrome={runtime:{getURL:()=>'/panel.css'},storage:{local:{get:async()=>({}),set:()=>{}}}};
  window.eval(source('model.js'));window.eval(source('sources.js'));
  const calls=[];
  window.SteamfolioSources.fetchReport=async url=>{calls.push(url);return url==='/dir.php'?catalog:report(url.match(/details\/(\d+)/)[1]);};
  window.eval(source('content.js'));
  await tick();assert.equal(calls.length,0);
  const root=window.document.querySelector('#steamfolio-root').shadowRoot;
  root.querySelector('.sf-launch').click();await tick();
  assert.equal(calls.length,3);
  assert.equal(root.querySelector('#sf-end').value,'');
  assert.equal(root.querySelector('#sf-today').checked,true);
  assert.equal(root.querySelector('#sf-all-time').checked,true);
  dom.window.close();
});
test('content stylesheet stays inside the shadow root',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../manifest.json'),'utf8'));
  assert.equal(manifest.content_scripts[0].css,undefined);
});
test('the extension runs only on the site that owns the reports',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../manifest.json'),'utf8'));
  const sales=['https://partner.steampowered.com/*'];
  assert.deepEqual(manifest.host_permissions,sales);
  assert.deepEqual(manifest.content_scripts.flatMap(script=>script.matches),sales);
  assert.deepEqual(manifest.web_accessible_resources.flatMap(resource=>resource.matches),sales);
});
test('failed game report explains why the combined total is withheld',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://partner.steampowered.com/',runScripts:'outside-only'});
  const {window}=dom;
  window.chrome={runtime:{getURL:()=>'/panel.css'},storage:{local:{get:async()=>({}),set:()=>{}}}};
  window.eval(source('model.js'));window.eval(source('sources.js'));
  window.SteamfolioSources.fetchReport=async url=>{
    if(url==='/dir.php')return catalog;
    if(url.includes('/20/'))throw new Error('Sign in again');
    return report('10');
  };
  window.eval(source('content.js'));
  const root=window.document.querySelector('#steamfolio-root').shadowRoot;
  root.querySelector('.sf-launch').click();await tick();
  root.querySelector('#sf-metric').value='sales.lifetimeGross';
  root.querySelector('#sf-metric').dispatchEvent(new window.Event('change'));await tick();
  assert.equal(root.querySelector('.sf-total strong').textContent,'—');
  assert.match(root.querySelector('#sf-status').textContent,/Beta: Sign in again/);
  dom.window.close();
});
test('large catalogs explain the visible game limit',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://partner.steampowered.com/',runScripts:'outside-only'});
  const {window}=dom;
  window.chrome={runtime:{getURL:()=>'/panel.css'},storage:{local:{get:async()=>({}),set:()=>{}}}};
  window.eval(source('model.js'));window.eval(source('sources.js'));
  window.SteamfolioSources.fetchReport=async url=>url==='/dir.php'
    ?Array.from({length:201},(_,i)=>`<a href="/app/details/${i+1}/">Game ${i+1}</a>`).join('')
    :report('10');
  window.eval(source('content.js'));
  const root=window.document.querySelector('#steamfolio-root').shadowRoot;
  root.querySelector('.sf-launch').click();await tick();
  assert.match(root.querySelector('#sf-games').textContent,/Showing 200 of 201 games/);
  dom.window.close();
});

test('the toolbar button opens and closes the pane',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://partner.steampowered.com/',runScripts:'outside-only'});
  const {window}=dom;let listener=null;
  window.chrome={runtime:{getURL:()=>'/panel.css',onMessage:{addListener:f=>{listener=f;}}},storage:{local:{get:async()=>({}),set:()=>{}}}};
  window.eval(source('model.js'));
  window.eval(source('sources.js'));
  window.SteamfolioSources.fetchReport=async url=>url==='/dir.php'?catalog:report(url.match(/details\/(\d+)/)[1]);
  window.eval(source('content.js'));
  const panel=window.document.querySelector('#steamfolio-root').shadowRoot.querySelector('.sf-panel');
  listener('steamfolio:toggle');await tick();
  assert.equal(panel.hidden,false);
  listener('steamfolio:toggle');
  assert.equal(panel.hidden,true);
});

function background(fetchImpl) {
  let clicked=null,onMessage=null;const created=[];const sent=[];let messageListeners=0;
  const chrome={runtime:{id:'me',onMessage:{addListener:f=>{onMessage=f;}}},action:{onClicked:{addListener:f=>{clicked=f;}}},tabs:{create:o=>created.push(o.url),sendMessage:(id,m)=>{sent.push([id,m]);return Promise.resolve();},reload:()=>{}}};
  chrome.runtime.onMessage.addListener=f=>{messageListeners++;onMessage=f;};
  new Function('chrome','fetch',source('background.js'))(chrome,fetchImpl||(async()=>{throw new Error('no fetch');}));
  const ask=(msg,sender)=>new Promise(resolve=>{if(!onMessage||!onMessage(msg,sender,resolve))resolve('ignored');});
  return {clicked,created,sent,ask,messageListeners};
}

test('the toolbar toggles only on Sales & Activations and opens it everywhere else',()=>{
  const b=background();
  b.clicked({id:1,url:'https://partner.steamgames.com/apps/'});
  b.clicked({id:2});
  b.clicked({id:3,url:'https://partner.steampowered.com/app/details/10/'});
  b.clicked({id:4,url:'https://example.com/'});
  assert.deepEqual(b.created,['https://partner.steampowered.com/','https://partner.steampowered.com/','https://partner.steampowered.com/']);
  assert.deepEqual(b.sent,[[3,'steamfolio:toggle']]);
});

test('the background worker does not relay Steamworks report contents',()=>{
  const b=background();
  assert.equal(b.messageListeners,0);
});

test('legacy dates migrate to all time through today and refresh crosses midnight',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://partner.steampowered.com/',runScripts:'outside-only'});
  const {window}=dom;const RealDate=window.Date;let now='2026-10-15T12:00:00';
  window.Date=class extends RealDate {constructor(...args){super(...(args.length?args:[now]));}};
  window.chrome={runtime:{getURL:()=>'/panel.css'},storage:{local:{get:async()=>({metric:'sales.units',start:'2026-09-21',end:'2026-09-27'}),set:()=>{}}}};
  window.eval(source('model.js'));window.eval(source('sources.js'));
  const calls=[];
  window.SteamfolioSources.fetchReport=async url=>{
    calls.push(url);if(url==='/dir.php')return catalog;
    const q=new URL(url,'https://partner.steampowered.com').searchParams;
    return report('10')+`<input name="dateStart" value="${q.get('dateStart')}"><input name="dateEnd" value="${q.get('dateEnd')}">`;
  };
  window.eval(source('content.js'));
  const root=window.document.querySelector('#steamfolio-root').shadowRoot;
  root.querySelector('.sf-launch').click();await tick();
  assert.match(calls[1],/dateStart=1970-01-01&dateEnd=2026-10-15/);
  now='2026-10-16T12:00:00';root.querySelector('#sf-refresh').click();await tick();
  assert.match(calls.at(-1),/dateEnd=2026-10-16/);
  assert.match(root.querySelector('.sf-total small').textContent,/All time to Today/);
  dom.window.close();
});
