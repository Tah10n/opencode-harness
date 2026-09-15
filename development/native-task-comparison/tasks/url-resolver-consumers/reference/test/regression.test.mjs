import {test} from 'node:test';import assert from 'node:assert/strict';
import {resolveLink} from '../src/resolve.mjs';import {buildMenu} from '../src/menu.mjs';
test('relative path, query and fragment rules',()=>{
 const base='https://example.test/a/page?old=1#top';
 for(const [link,expected]of [['next','https://example.test/a/next'],['../x','https://example.test/x'],['/x','https://example.test/x'],['?q=2','https://example.test/a/page?q=2'],['#new','https://example.test/a/page?old=1#new'],['','https://example.test/a/page?old=1'],['//cdn.test/x','https://cdn.test/x'],['./a%2Fb','https://example.test/a/a%2Fb']])assert.equal(resolveLink(base,link),expected);
 assert.equal(resolveLink('https://example.test/a/','b'),'https://example.test/a/b');
});
test('URL objects reach consumer without mutation',()=>{
 const base=new URL('https://example.test/a/?x=1#old'),absolute=new URL('https://other.test:443/z?x=%2F#h');
 const beforeBase=base.href,beforeAbsolute=absolute.href,items=Object.freeze([Object.freeze({label:'rel',href:'next'}),Object.freeze({label:'abs',href:absolute})]);
 let menu;assert.doesNotThrow(()=>{menu=buildMenu(base,items);});assert.deepEqual(menu,[{label:'rel',href:'https://example.test/a/next'},{label:'abs',href:'https://other.test/z?x=%2F#h'}]);
 assert.equal(base.href,beforeBase);assert.equal(absolute.href,beforeAbsolute);assert.equal(items[1].href,absolute);assert.notEqual(menu[0],items[0]);
 assert.equal(resolveLink('https://example.test/',absolute),beforeAbsolute);
});
test('normalization uses URL semantics without decode/reencode',()=>{
 assert.equal(resolveLink('HTTPS://EXAMPLE.TEST:443/a/b','../c d'),'https://example.test/c%20d');
 assert.equal(resolveLink(new URL('http://example.test:80/a/'),'./%2f?q=a+b#x%20y'),'http://example.test/a/%2f?q=a+b#x%20y');
 assert.equal(resolveLink('https://example.test/a/','http://other.test:80/z'),'http://other.test/z');
});
test('invalid types, base and protocols reject through both entry points',()=>{
 for(const pair of [[{},'x'],['https://example.test/',{}],['bad base','x'],['file:///tmp/x','a'],['https://example.test/','javascript:alert(1)'],['https://example.test/',new URL('mailto:x@example.test')]])assert.throws(()=>resolveLink(...pair),TypeError);
 assert.throws(()=>buildMenu(new URL('https://example.test/'),[{label:'bad',href:'data:text/plain,x'}]),TypeError);
});

test('empty menu still validates base',()=>{
 assert.deepEqual(buildMenu(new URL('https://example.test/a/'),[]),[]);
 for(const base of ['file:///tmp/x','bad base',{},null])assert.throws(()=>buildMenu(base,[]),TypeError);
});
