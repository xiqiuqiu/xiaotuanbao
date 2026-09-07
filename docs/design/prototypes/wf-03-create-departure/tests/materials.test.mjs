import test from 'node:test';
import assert from 'node:assert/strict';
import {materials,materialKinds} from '../src/materials.mjs';
test('只有已提供的完整演示材料可以生成对应演示提案',()=>{
 assert.deepEqual(materialKinds('请帮我安排资源'),[]);
 assert.deepEqual(materialKinds('华东旅行社有3人报名'),[]);
 assert.deepEqual(materialKinds(materials.source.text),['source']);
 assert.deepEqual(materialKinds(materials.resources.text),['resources']);
 assert.deepEqual(materialKinds(materials.source.text.replace('6800','5000')),[]);
 assert.deepEqual(materialKinds('文件名：资源确认材料示例.txt'),[]);
});

test('联合材料形成两个业务事项，修改材料不会套用固定结果',()=>{
 assert.deepEqual(materialKinds(materials.combined.text),['source','resources']);
 assert.deepEqual(materialKinds(materials.combined.text.replace('2400','2800')),[]);
});
