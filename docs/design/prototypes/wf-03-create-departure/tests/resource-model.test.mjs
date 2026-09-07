import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blocked,capacityWarning,reviseGroup,confirmGroups} from '../src/resource-model.mjs';
test('容量只提醒，非法总价或供应商只阻断对应项，已写入项不重复修订',()=>{
 const hotel={id:'hotel',title:'入住',kind:'酒店',supplier:'大阪樱花酒店',amount:7200,version:1};
 const bus={id:'bus',title:'接送',kind:'用车',supplier:'关西交通',amount:2400,evidenceCapacity:28,version:1};
 assert.equal(capacityWarning(bus),true);assert.equal(blocked(bus),false);
 const result=confirmGroups([hotel,bus,{...bus,id:'invalid',amount:0}],['hotel','bus','invalid']);
 assert.equal(result[0].written,true);assert.equal(result[1].written,true);assert.equal(result[2].written,undefined);
 assert.equal(blocked({...bus,kind:'酒店'}),true);assert.equal(blocked({...bus,amount:0.001}),true);
 assert.equal(reviseGroup(result,'hotel',{amount:1})[0],result[0]);assert.equal(reviseGroup([bus],'bus',{amount:2800})[0].version,2);
});
