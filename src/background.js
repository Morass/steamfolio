const SALES='https://partner.steampowered.com';
const onSales=url=>{try{return new URL(url).origin===SALES;}catch{return false;}};

chrome.action.onClicked.addListener(tab=>{
  if(tab.url&&onSales(tab.url))chrome.tabs.sendMessage(tab.id,'steamfolio:toggle').catch(()=>chrome.tabs.reload(tab.id));
  else chrome.tabs.create({url:SALES+'/'});
});
