import {test} from 'node:test';import assert from 'node:assert/strict';
import {breadcrumbs} from '../src/breadcrumbs.mjs';test('single root',()=>assert.deepEqual(breadcrumbs([{id:'r',label:'Root',href:'/r',hidden:false,children:[]}],'r'),[{id:'r',label:'Root',href:null,current:true}]));
