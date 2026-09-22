const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
global.DOMParser=new JSDOM('').window.DOMParser;
const {number,catalog,detail,wishlist}=require('../src/sources');

test('reads the game directory and deduplicates links',()=>{
  const html='<a href="/app/details/10/">Alpha</a><a href="/app/details/10/">Alpha</a><a href="/app/details/20/">Beta</a>';
  assert.deepEqual(catalog(html).map(x=>x.id),['10','20']);
});

test('reads reported lifetime and period values by their labels',()=>{
  const html=`<h1>Game</h1><table>
    <tr><td>Lifetime Steam revenue (gross)</td><td>$1,200.50</td></tr>
    <tr><td>Lifetime Steam revenue (net)</td><td>$900.25</td></tr>
    <tr><td>Lifetime Steam units (?)</td><td>1,024</td></tr>
    <tr><td>Wishlists</td><td>55 +</td></tr></table>
    <table><tr><td>Total units</td><td></td><td>3</td></tr><tr><td>Total revenue</td><td></td><td>$12.00</td></tr></table>`;
  assert.deepEqual(detail(html),{lifetimeGross:1200.5,lifetimeNet:900.25,lifetimeUnits:1024,wishlistCurrent:55,periodUnits:3,periodRevenue:12});
});

test('reads wishlist report and fills only absent games with zero',()=>{
  const html=`<h2>Per-App Wishlist Activity</h2><table><tr><th>Game</th><th>Wishlist Additions</th><th>Wishlist Deletions</th><th>Wishlist Purchases and Activations</th><th>Wishlist Gifts</th><th>Period Wishlist Balance</th></tr>
    <tr><td><a href="/app/wishlist/10/">Alpha</a></td><td>8</td><td>2</td><td>1</td><td>0</td><td>5</td></tr></table>`;
  const result=wishlist(html,[{id:'10'},{id:'20'}]);
  assert.equal(result.get('10').balance,5);
  assert.equal(result.get('20').balance,0);
});

test('rejects a malformed report instead of showing false zeroes',()=>{
  assert.throws(()=>wishlist('<h1>Sign in</h1>',[{id:'10'}]),/unavailable/);
  assert.equal(number('—'),0);
  assert.equal(number('$1,234.50'),1234.5);
});
