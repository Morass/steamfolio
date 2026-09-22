(function () {
  'use strict';
  if (document.getElementById('steamfolio-root')) return;
  const Model=globalThis.SteamfolioModel, Sources=globalThis.SteamfolioSources;
  const state={games:[],selected:new Set(),metric:'wishlist.current',start:'',end:'',busy:false,open:false,query:'',generation:0};
  const latest=new Date();latest.setDate(latest.getDate()-1);
  const prior=new Date(latest);prior.setDate(prior.getDate()-6);
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  state.start=iso(prior);state.end=iso(latest);
  const host=document.createElement('div');host.id='steamfolio-root';document.documentElement.append(host);
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('link');style.rel='stylesheet';style.href=chrome.runtime.getURL('src/panel.css');shadow.append(style);
  const launcher=document.createElement('button');launcher.className='sf-launch';launcher.type='button';launcher.textContent='▥';launcher.title='Open Steamfolio';shadow.append(launcher);
  const panel=document.createElement('section');panel.className='sf-panel';panel.hidden=true;panel.setAttribute('aria-label','Steamfolio portfolio statistics');shadow.append(panel);
  panel.innerHTML='<header><div><small>STEAMWORKS PORTFOLIO</small><h2>Steamfolio</h2></div><button class="sf-close" type="button" aria-label="Close">×</button></header><div class="sf-body"><label class="sf-label" for="sf-metric">Statistic</label><select id="sf-metric"></select><div class="sf-dates"><label>From<input id="sf-start" type="date"></label><label>Through<input id="sf-end" type="date"></label></div><div class="sf-games-head"><span>Games <b id="sf-count"></b></span><div><button id="sf-all" type="button">All</button><button id="sf-none" type="button">None</button></div></div><input id="sf-search" type="search" placeholder="Filter game names" aria-label="Filter game names"><div id="sf-games" class="sf-games"></div><button id="sf-refresh" class="sf-refresh" type="button">Update totals</button><div id="sf-status" class="sf-status" role="status"></div><div id="sf-result" class="sf-result"></div><p class="sf-foot">Read from your signed-in Steamworks reports. Values stay in this browser tab.</p></div>';
  const $=s=>panel.querySelector(s);
  const metric=$('#sf-metric'),start=$('#sf-start'),end=$('#sf-end'),gameList=$('#sf-games'),result=$('#sf-result'),status=$('#sf-status');
  for (const group of ['Wishlists','Sales']) {
    const optgroup=document.createElement('optgroup');optgroup.label=group;
    for (const m of Model.METRICS.filter(x=>x.group===group)) {const option=document.createElement('option');option.value=m.id;option.textContent=m.label;optgroup.append(option);}
    metric.append(optgroup);
  }
  start.value=state.start;end.value=state.end;
  function save() {chrome.storage.local.set({metric:state.metric,selected:[...state.selected],start:state.start,end:state.end});}
  function selectedGames() {return state.games.filter(g=>state.selected.has(g.id));}
  function controls() {
    const m=Model.BY_ID[state.metric];
    $('.sf-dates').hidden=!!m.lifetime;
    $('#sf-count').textContent=`${state.selected.size}/${state.games.length}`;
    $('#sf-refresh').disabled=state.busy || !state.selected.size;
    $('#sf-refresh').textContent=state.busy?'Loading…':'Update totals';
  }
  function renderGames() {
    gameList.replaceChildren();
    for (const game of state.games.filter(g=>g.name.toLocaleLowerCase().includes(state.query)).slice(0,200)) {
      const label=document.createElement('label'),input=document.createElement('input'),name=document.createElement('span');
      input.type='checkbox';input.checked=state.selected.has(game.id);input.value=game.id;
      input.addEventListener('change',()=>{if(input.checked)state.selected.add(game.id);else state.selected.delete(game.id);state.generation++;state.busy=false;controls();save();result.replaceChildren();status.textContent='Selection changed. Update totals to recalculate.';});
      name.textContent=game.name;label.append(input,name);gameList.append(label);
    }
    controls();
  }
  function renderTotals(summary,m) {
    result.replaceChildren();
    const card=document.createElement('div');card.className='sf-total';
    const caption=document.createElement('span');caption.textContent=m.label;
    const value=document.createElement('strong');value.textContent=summary.complete?Model.format(summary.total,m.unit):'—';
    const sub=document.createElement('small');sub.textContent=summary.complete?`${summary.items.length} games included${m.lifetime?'':` · ${state.start} to ${state.end}`}`:summary.message+' · total withheld';
    card.append(caption,value,sub);result.append(card);
    const max=Math.max(1,...summary.items.map(x=>Math.abs(x.value)));
    for (const item of summary.items.sort((a,b)=>Math.abs(b.value)-Math.abs(a.value))) {
      const row=document.createElement('div');row.className='sf-row';
      const top=document.createElement('div');top.className='sf-row-top';
      const name=document.createElement('span');name.textContent=item.game.name;
      const figure=document.createElement('b');figure.textContent=Model.format(item.value,m.unit);
      top.append(name,figure);
      const bar=document.createElement('div');bar.className='sf-bar';
      const fill=document.createElement('i');fill.style.width=`${Math.max(2,Math.abs(item.value)/max*100)}%`;if(item.value<0)fill.className='negative';bar.append(fill);
      row.append(top,bar);result.append(row);
    }
    for (const game of summary.missing) {const row=document.createElement('div');row.className='sf-missing';row.textContent=`${game.name}: unavailable`;result.append(row);}
  }
  async function load() {
    const games=selectedGames(),m=Model.BY_ID[state.metric],generation=++state.generation;
    if (!games.length){state.busy=false;status.textContent='Select at least one game.';result.replaceChildren();controls();return;}
    if (!m.lifetime && (!/^\d{4}-\d\d-\d\d$/.test(state.start)||!/^\d{4}-\d\d-\d\d$/.test(state.end)||state.start>state.end)) {state.busy=false;status.textContent='Choose a valid date range.';result.replaceChildren();controls();return;}
    state.busy=true;controls();status.textContent='Reading Steamworks reports…';result.replaceChildren();
    const rows=new Map();
    try {
      if (m.source==='wishlist') {
        const q=new URLSearchParams({dateStart:state.start,dateEnd:state.end});
        const html=await Sources.fetchReport(`/wishlist/daily/?${q}`);
        Sources.verifyDates(html,state.start,state.end);
        const all=Sources.wishlist(html,state.games);
        for(const game of games) if(all.has(game.id))rows.set(game.id,all.get(game.id));
      } else {
        await Model.runLimited(games,3,async game=>{
          try {
            const q=m.lifetime?'':`?${new URLSearchParams({dateStart:state.start,dateEnd:state.end})}`;
            const html=await Sources.fetchReport(`/app/details/${game.id}/${q}`);
            if(!m.lifetime)Sources.verifyDates(html,state.start,state.end);
            rows.set(game.id,Sources.detail(html));
          } catch (_) { /* A missing game remains missing in the total. */ }
        });
      }
      if(generation!==state.generation)return;
      const summary=Model.aggregate(state.metric,games,rows);
      status.textContent=summary.complete?'All selected games loaded.':summary.message+'. The total is unavailable.';
      renderTotals(summary,m);
    } catch(e) {
      if(generation!==state.generation)return;
      status.textContent=e.message || 'Report unavailable';result.replaceChildren();
    } finally {if(generation===state.generation){state.busy=false;controls();}}
  }
  launcher.addEventListener('click',()=>{state.open=!state.open;panel.hidden=!state.open;launcher.hidden=state.open;if(state.open&&!state.initialized){state.initialized=true;init();}});
  $('.sf-close').addEventListener('click',()=>{state.open=false;panel.hidden=true;launcher.hidden=false;});
  metric.addEventListener('change',()=>{state.metric=metric.value;controls();save();load();});
  for (const [element,key] of [[start,'start'],[end,'end']])element.addEventListener('change',()=>{state[key]=element.value;save();load();});
  $('#sf-search').addEventListener('input',e=>{state.query=e.target.value.toLocaleLowerCase();renderGames();});
  $('#sf-all').addEventListener('click',()=>{for(const g of state.games)state.selected.add(g.id);renderGames();save();load();});
  $('#sf-none').addEventListener('click',()=>{state.selected.clear();renderGames();save();load();});
  $('#sf-refresh').addEventListener('click',load);
  async function init() {
    try {
      const [stored,html]=await Promise.all([chrome.storage.local.get(['metric','selected','start','end']),Sources.fetchReport('/dir.php')]);
      state.games=Sources.catalog(html);
      if(Model.BY_ID[stored.metric])state.metric=stored.metric;
      state.selected=new Set(Array.isArray(stored.selected)?stored.selected.map(String).filter(id=>state.games.some(g=>g.id===id)):state.games.map(g=>g.id));
      if(/^\d{4}-\d\d-\d\d$/.test(stored.start))state.start=stored.start;
      if(/^\d{4}-\d\d-\d\d$/.test(stored.end))state.end=stored.end;
      metric.value=state.metric;start.value=state.start;end.value=state.end;renderGames();await load();
    } catch(e){state.initialized=false;status.textContent=e.message||'Steamworks game list unavailable';}
  }
})();
