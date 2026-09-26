// The toolbar button: on a Steamworks page it opens or closes the pane; anywhere else it
// opens Sales & Activations. Pages on partner.steamgames.com read their reports through here.
const SALES='https://partner.steampowered.com';
const SITES=[SALES,'https://partner.steamgames.com'];
const onSite=url=>{try{return SITES.includes(new URL(url).origin);}catch{return false;}};

chrome.action.onClicked.addListener(tab=>{
  if(tab.url&&onSite(tab.url))chrome.tabs.sendMessage(tab.id,'steamfolio:toggle').catch(()=>chrome.tabs.reload(tab.id));
  else chrome.tabs.create({url:SALES+'/'});
});

async function report(path){
  if(typeof path!=='string'||!/^\/[^/\\]/.test(path))return {ok:false};
  const url=new URL(path,SALES);
  if(url.origin!==SALES)return {ok:false};
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  if(!response.ok||new URL(response.url).origin!==SALES)return {ok:false};
  return {ok:true,html:await response.text()};
}

chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(msg?.type!=='steamfolio:report'||sender.id!==chrome.runtime.id||!onSite(sender.url||''))return false;
  report(msg.path).then(reply,()=>reply({ok:false}));
  return true;
});
