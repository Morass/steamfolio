const test=require('node:test');
const assert=require('node:assert/strict');
const {aggregate,runLimited}=require('../src/model');

const games=[{id:'10',name:'First'},{id:'20',name:'Second'}];

test('sums only selected games',()=>{
  const rows=new Map([['10',{additions:12}],['20',{additions:7}]]);
  assert.equal(aggregate('wishlist.additions',[games[1]],rows).total,7);
  assert.equal(aggregate('wishlist.additions',games,rows).total,19);
});

test('withholds a partial total when a selected game is unreadable',()=>{
  const rows=new Map([['10',{periodRevenue:12.5}]]);
  const result=aggregate('sales.revenue',games,rows);
  assert.equal(result.complete,false);
  assert.equal(result.total,null);
  assert.deepEqual(result.missing,[games[1]]);
});

test('zero is a valid result, while empty selection has no total',()=>{
  assert.equal(aggregate('wishlist.balance',games,new Map(games.map(g=>[g.id,{balance:0}]))).total,0);
  assert.equal(aggregate('wishlist.balance',[],new Map()).total,null);
});

test('report pool runs every item even when the host page replaces Array.from',async()=>{
  const original=Array.from,seen=[];
  Array.from=()=>[];
  try {
    await runLimited([1,2,3,4],2,async n=>{seen.push(n);});
    assert.deepEqual(seen.sort(),[1,2,3,4]);
  } finally {Array.from=original;}
});
