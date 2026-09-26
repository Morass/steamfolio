/* Read only the reports visible to the signed-in Steamworks user. */
(function (root) {
  'use strict';
  function number(text) {
    const value=String(text).replace(/\u00a0/g,' ').trim();
    if (value==='-' || value==='—') return null;
    const matched=value.match(/^(-)?\s*(?:US)?\$?\s*((?:\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.\d+)?)(?:\s*\+)?$/i);
    if (!matched) return null;
    const n=Number(matched[2].replace(/[ ,]/g,''))*(matched[1]?-1:1);
    return Number.isFinite(n)?n:null;
  }
  function doc(html) {return new DOMParser().parseFromString(html,'text/html');}
  function catalog(html) {
    const document=doc(html),games=new Map();
    for (const link of document.querySelectorAll('a[href*="/app/details/"]')) {
      const match=link.getAttribute('href').match(/\/app\/details\/(\d+)\//);
      const name=link.textContent.trim();
      if (match && name && !games.has(match[1])) games.set(match[1],{id:match[1],name});
    }
    if (!games.size) throw new Error('Steamworks game list unavailable');
    return [...games.values()].sort((a,b)=>a.name.localeCompare(b.name));
  }
  function detail(html) {
    const document=doc(html),data={};
    const put=(field,value)=>{if(Object.prototype.hasOwnProperty.call(data,field))throw new Error('Game report has a repeated report value');data[field]=value;};
    const heading=document.querySelector('h1,h2,h3');
    if (!document.body.textContent.includes('Lifetime Steam revenue') || !heading) throw new Error('Game report unavailable');
    const tables=[...document.querySelectorAll('table')];
    for (const table of tables) for (const tr of table.rows) {
      const cells=[...tr.cells].map(c=>c.textContent.trim());
      if (cells.length<2) continue;
      const label=cells[0].replace(/\s*\(\?\)[\s\S]*$/,'').trim();
      const v=number(cells[1]);
      if (label==='Lifetime Steam revenue (gross)') put('lifetimeGross',v);
      if (label==='Lifetime Steam revenue (net)') put('lifetimeNet',v);
      if (label==='Lifetime Steam units') put('lifetimeUnits',v);
      if (label==='Wishlists') put('wishlistCurrent',v);
      if (label==='Total units') put('periodUnits',number(cells[2]));
      if (label==='Total revenue') put('periodRevenue',number(cells[2]));
    }
    return data;
  }
  function wishlist(html,games) {
    const document=doc(html),map=new Map();
    const expected=['Game','Wishlist Additions','Wishlist Deletions','Wishlist Purchases and Activations','Wishlist Gifts','Period Wishlist Balance'];
    const table=[...document.querySelectorAll('table')].find(t=>{
      const cells=t.rows[0] && [...t.rows[0].cells].map(c=>c.textContent.trim());
      return cells && expected.every((label,i)=>cells[i]===label);
    });
    if (!table || !document.body.textContent.includes('Per-App Wishlist Activity')) throw new Error('Wishlist report unavailable');
    for (const tr of [...table.rows].slice(1)) {
      const cells=[...tr.cells],link=cells[0]?.querySelector('a[href*="/app/wishlist/"]');
      const id=link?.getAttribute('href').match(/\/app\/wishlist\/(\d+)\//)?.[1];
      if (!id) throw new Error('Wishlist report row is missing a game link');
      if (cells.length<6) throw new Error('Wishlist report contains an incomplete game row');
      const values=cells.slice(1,6).map(c=>number(c.textContent));
      if (values.some(v=>v===null)) throw new Error('Wishlist report contains an unreadable value');
      map.set(id,{additions:values[0],deletions:values[1],purchases:values[2],gifts:values[3],balance:values[4]});
    }
    // The report omits games without any activity in the selected period.
    for (const game of games) if (!map.has(String(game.id))) map.set(String(game.id),{additions:0,deletions:0,purchases:0,gifts:0,balance:0});
    return map;
  }
  function verifyDates(html,start,end) {
    const document=doc(html);
    for (const [name,wanted] of [['dateStart',start],['dateEnd',end]]) {
      const fields=[...document.querySelectorAll(`input[name="${name}"]`)];
      if (!fields.length || fields.some(input=>input.getAttribute('value')!==wanted)) throw new Error('Steamworks report used a different date range');
    }
  }
  const SALES='https://partner.steampowered.com';
  async function fetchReport(path) {
    let html;
    if (location.origin===SALES) {
      const response=await fetch(path,{credentials:'same-origin',cache:'no-store'});
      if (!response.ok || new URL(response.url).origin!==location.origin) throw new Error('Steamworks report could not be loaded');
      html=await response.text();
    } else {
      // Elsewhere in Steamworks the reports are still read from Sales & Activations, by the
      // extension's background worker, with the user's sign-in there.
      const reply=await chrome.runtime.sendMessage({type:'steamfolio:report',path});
      if (!reply || !reply.ok) throw new Error('Steamworks report could not be loaded');
      html=reply.html;
    }
    if (/name=["']password["']|id=["']login_form["']/i.test(html)) throw new Error(location.origin===SALES?'Steamworks sign-in required':'Sign in to Steamworks Sales & Activations (partner.steampowered.com) first');
    return html;
  }
  const api={number,catalog,detail,wishlist,verifyDates,fetchReport};
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.SteamfolioSources=api;
})(globalThis);
