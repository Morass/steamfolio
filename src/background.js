// The toolbar button: on a Sales & Activations page it opens or closes the pane; anywhere
// else (including partner.steamgames.com, where the reports are not) it opens that site.
const SALES='https://partner.steampowered.com/';
chrome.action.onClicked.addListener(tab=>{
  if(tab.url&&tab.url.startsWith(SALES))chrome.tabs.sendMessage(tab.id,'steamfolio:toggle').catch(()=>chrome.tabs.reload(tab.id));
  else chrome.tabs.create({url:SALES});
});
