import test from 'node:test';
import assert from 'node:assert/strict';
import {balance,available,canVerify} from '../src/finance-model.mjs';
test('核销只消耗同方向同对象余额；撤销不改变流水金额',()=>{
 const s={id:'AR',partner:'客户',direction:'收入',amount:100.1};
 const t={id:'TX',partner:'客户',direction:'收入',amount:60.1};
 assert.equal(canVerify(s,t,[],60.1),true);
 assert.equal(canVerify(s,{...t,direction:'支出'},[],10),false);
 assert.equal(canVerify(s,{...t,partner:'另一客户'},[],10),false);
 assert.equal(canVerify(s,t,[],60.11),false);
 const v=[{scheduleId:'AR',transactionId:'TX',amount:60.1}];
 assert.equal(balance(s,v),40); assert.equal(available(t,v),0);
 assert.equal(canVerify(s,t,v,0.01),false);
 assert.equal(balance(s,[]),100.1); assert.equal(available(t,[]),60.1);
});
