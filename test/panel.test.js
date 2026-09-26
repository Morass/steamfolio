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
  const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
  const day=`${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
  assert.equal(root.querySelector('#sf-end').value,day);
  dom.window.close();
});
test('content stylesheet stays inside the shadow root',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../manifest.json'),'utf8'));
  assert.equal(manifest.content_scripts[0].css,undefined);
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
  let clicked=null,onMessage=null;const created=[];const sent=[];
  const chrome={runtime:{id:'me',onMessage:{addListener:f=>{onMessage=f;}}},action:{onClicked:{addListener:f=>{clicked=f;}}},tabs:{create:o=>created.push(o.url),sendMessage:(id,m)=>{sent.push([id,m]);return Promise.resolve();},reload:()=>{}}};
  new Function('chrome','fetch',source('background.js'))(chrome,fetchImpl||(async()=>{throw new Error('no fetch');}));
  const ask=(msg,sender)=>new Promise(resolve=>{if(!onMessage(msg,sender,resolve))resolve('ignored');});
  return {clicked,created,sent,ask};
}

test('the toolbar button works on both Steamworks sites and opens Sales & Activations elsewhere',()=>{
  const b=background();
  b.clicked({id:1,url:'https://partner.steamgames.com/apps/'});
  b.clicked({id:2});
  b.clicked({id:3,url:'https://partner.steampowered.com/app/details/10/'});
  b.clicked({id:4,url:'https://example.com/'});
  assert.deepEqual(b.created,['https://partner.steampowered.com/','https://partner.steampowered.com/']);
  assert.deepEqual(b.sent,[[1,'steamfolio:toggle'],[3,'steamfolio:toggle']]);
});

test('the background worker reads only Sales & Activations reports, for Steamworks pages only',async()=>{
  const asked=[];
  const b=background(async(url,opts)=>{asked.push([String(url),opts.credentials]);return {ok:true,url:String(url),text:async()=>'<html>report</html>'};});
  const page={id:'me',url:'https://partner.steamgames.com/apps/'};
  assert.deepEqual(await b.ask({type:'steamfolio:report',path:'/dir.php'},page),{ok:true,html:'<html>report</html>'});
  assert.deepEqual(asked,[['https://partner.steampowered.com/dir.php','include']]);
  for (const path of ['//evil.example/x','https://evil.example/','dir.php','/\\evil.example',null]) assert.deepEqual(await b.ask({type:'steamfolio:report',path},page),{ok:false});
  assert.equal(await b.ask({type:'steamfolio:report',path:'/dir.php'},{id:'other',url:page.url}),'ignored');
  assert.equal(await b.ask({type:'steamfolio:report',path:'/dir.php'},{id:'me',url:'https://example.com/'}),'ignored');
  assert.equal(asked.length,1);
  const moved=background(async url=>({ok:true,url:'https://store.steampowered.com/login/',text:async()=>'x'}));
  assert.deepEqual(await moved.ask({type:'steamfolio:report',path:'/dir.php'},page),{ok:false});
});

test('on partner.steamgames.com the pane reads Sales & Activations through the worker',async()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://partner.steamgames.com/apps/',runScripts:'outside-only'});
  const {window}=dom;const paths=[];
  window.fetch=()=>{throw new Error('the page must not fetch reports itself');};
  window.chrome={runtime:{getURL:()=>'/panel.css',sendMessage:async m=>{paths.push(m.path);return {ok:true,html:m.path==='/dir.php'?catalog:report(m.path.match(/details\/(\d+)/)[1])};}},storage:{local:{get:async()=>({}),set:()=>{}}}};
  window.eval(source('model.js'));
  window.eval(source('sources.js'));
  window.eval(source('content.js'));
  const root=window.document.querySelector('#steamfolio-root').shadowRoot;
  root.querySelector('.sf-launch').click();
  await tick();
  assert.equal(root.querySelector('.sf-total strong').textContent,'8');
  assert.equal(paths[0],'/dir.php');
  window.chrome.runtime.sendMessage=async()=>({ok:true,html:'<form id="login_form"><input name="password"></form>'});
  await assert.rejects(window.SteamfolioSources.fetchReport('/dir.php'),/partner\.steampowered\.com/);
});
