/* Pure selection and aggregation rules, shared by the page and tests. */
(function (root) {
  'use strict';
  const METRICS = [
    {id:'wishlist.current', label:'Current wishlists', group:'Wishlists', source:'details', field:'wishlistCurrent', unit:'count', lifetime:true},
    {id:'wishlist.additions', label:'Wishlist additions', group:'Wishlists', source:'wishlist', field:'additions', unit:'count'},
    {id:'wishlist.deletions', label:'Wishlist deletions', group:'Wishlists', source:'wishlist', field:'deletions', unit:'count'},
    {id:'wishlist.purchases', label:'Wishlist purchases and activations', group:'Wishlists', source:'wishlist', field:'purchases', unit:'count'},
    {id:'wishlist.balance', label:'Wishlist activity balance', group:'Wishlists', source:'wishlist', field:'balance', unit:'count'},
    {id:'sales.units', label:'Units in period', group:'Sales', source:'details', field:'periodUnits', unit:'count'},
    {id:'sales.revenue', label:'Gross revenue in period', group:'Sales', source:'details', field:'periodRevenue', unit:'usd'},
    {id:'sales.lifetimeUnits', label:'Lifetime Steam units', group:'Sales', source:'details', field:'lifetimeUnits', unit:'count', lifetime:true},
    {id:'sales.lifetimeGross', label:'Lifetime gross Steam revenue', group:'Sales', source:'details', field:'lifetimeGross', unit:'usd', lifetime:true},
    {id:'sales.lifetimeNet', label:'Lifetime net Steam revenue', group:'Sales', source:'details', field:'lifetimeNet', unit:'usd', lifetime:true}
  ];
  const BY_ID = Object.fromEntries(METRICS.map(m=>[m.id,m]));
  function aggregate(metricId, selected, rows) {
    const metric=BY_ID[metricId];
    if (!metric) throw new Error('Unknown statistic');
    if (!selected.length) return {complete:false,total:null,items:[],missing:[],message:'Select at least one game'};
    const items=[],missing=[];
    for (const game of selected) {
      const row=rows.get(String(game.id));
      const value=row && row[metric.field];
      if (typeof value !== 'number' || !Number.isFinite(value)) missing.push(game);
      else items.push({game,value});
    }
    return {complete:missing.length===0,total:missing.length?null:items.reduce((n,x)=>n+x.value,0),items,missing,
      message:missing.length?`${items.length} of ${selected.length} games loaded`:''};
  }
  function format(value,unit) {
    return unit==='usd' ? new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value)
      : new Intl.NumberFormat().format(value);
  }
  const api={METRICS,BY_ID,aggregate,format};
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.SteamfolioModel=api;
})(globalThis);
