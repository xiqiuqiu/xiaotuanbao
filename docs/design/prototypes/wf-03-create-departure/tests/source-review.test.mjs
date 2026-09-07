import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceAmounts,sourceErrors,initialReceivables,switchCollection} from '../src/source-review-model.mjs';
const v={partner:'客户',adults:8,children:2,adultPrice:6800,childPrice:4200,adjustments:[{kind:'single_room',direction:'increase',amount:600},{kind:'hotel_deduction',direction:'decrease',amount:400}],discountType:'lump',discount:2000,collectionMode:'split',deposit:20000,balance:41000};
test('报价调整优惠、缺失值与精度校验',()=>{
 assert.equal(sourceAmounts(v).net,61000);assert.equal(sourceAmounts(v).topUp,20000);
 assert.equal(sourceAmounts({...v,discountType:'none'}).net,63000);assert.deepEqual(sourceErrors(v),[]);
 for(const patch of [{balance:null},{balance:0},{adultPrice:6800.125},{discount:100000},{children:null},{adjustments:[{kind:'other',direction:'increase',amount:0}]}])assert.ok(sourceErrors({...v,...patch}).length);
 assert.ok(sourceErrors({...v,adjustments:[v.adjustments[0],v.adjustments[0]]}).length);
});
test('分拆只生成尾款与补款，超额代收合法且不生成返利支付',()=>{
 assert.deepEqual(initialReceivables(v,61000).map(r=>[r.title,r.amount]),[['尾款代收',41000],['客户补款',20000]]);
 const excess={...v,deposit:80000,balance:65000};assert.deepEqual(sourceErrors(excess),[]);assert.equal(sourceAmounts(excess).rebate,4000);
 assert.deepEqual(initialReceivables(excess,61000).map(r=>[r.title,r.amount]),[['尾款代收',65000]]);
 assert.deepEqual(initialReceivables({...v,collectionMode:'guest',deposit:10000,balance:0},61000).map(r=>[r.title,r.amount]),[['定金代收',10000],['客户补款',51000]]);
 assert.deepEqual(initialReceivables({...v,collectionMode:'partner'},0),[]);
});
test('模式切换不转用金额，切回恢复同次编辑草稿',()=>{
 const saved={};const guest=switchCollection(v,'guest',saved);assert.equal(guest.deposit,null);assert.equal(guest.balance,null);
 const restored=switchCollection({...guest,deposit:5000,balance:56000},'split',saved);assert.equal(restored.deposit,20000);assert.equal(restored.balance,41000);
 assert.equal(switchCollection(restored,'guest',saved).deposit,5000);
});
