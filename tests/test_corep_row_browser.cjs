#!/usr/bin/env node
'use strict';
/* Regression test: browser grouping must not change official COREP DPM source records. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const base=JSON.parse(read('docs/data/corep_of_multitemplate.json'));
const manifest=JSON.parse(read('docs/data/corep_creditrisk_manifest.json'));
const c07=JSON.parse(read('docs/data/corep_creditrisk/C_07.00.a.json'));
const content=read('docs/data/official_corep_ui.js');
const docElements=new Map();
function element(id) {
 if(docElements.has(id))return docElements.get(id);
 const obj={id,value:'',textContent:'',style:{},options:[],dataset:{},href:'',_html:'',_buttons:{},
  get selectedOptions(){return this.options.filter(x=>x.value===this.value);},
  get innerHTML(){return this._html;},
  set innerHTML(v){
   this._html=v;this._buttons={};
   if(id==='officialTemplateSelect')
    this.options=[...v.matchAll(/<option value="([^"]+)">([^<]*)<\/option>/g)]
     .map(m=>({value:m[1],textContent:m[2]}));
  },
  appendChild(n){this.options.push(n);},
  querySelectorAll(sel){
   if(!this._buttons[sel]){
    const attr={'[data-group]':'group','[data-cell]':'cell','[data-rule]':'rule'}[sel];
    this._buttons[sel]=attr?[...this._html.matchAll(new RegExp('data-'+attr+'="([^"]+)"','g'))]
      .map(m=>({dataset:{[attr]:m[1]},onclick:null})):[];
   }
   return this._buttons[sel];
  },
  scrollIntoView(){}
 };
 docElements.set(id,obj);
 return obj;
}
const document={getElementById:element,createElement:tag=>({tag,value:'',textContent:'',style:{}})};
const fixtures={
 'data/corep_of_multitemplate.json':base,
 'data/corep_creditrisk_manifest.json':manifest,
 'data/corep_creditrisk/C_07.00.a.json':c07
};
const requested=[];
const fetch=path=>{
 requested.push(path);
 return Promise.resolve(fixtures[path]?
  {ok:true,json:()=>Promise.resolve(fixtures[path])}:
  {ok:false,status:404});
};
const warnings=[];
new Function('window','document','fetch','COREP_IFRS','console','navigator',content)(
 {},document,fetch,{rows:[]},{warn:(...a)=>warnings.push(a.join(' '))},{});
async function flush(){for(let i=0;i<20;i++)await Promise.resolve();}
(async function main(){
 await flush();
 assert.equal(element('officialTemplateSelect').options.length,31);
 assert.equal(element('officialViewMode').value,'cells');
 assert.equal(element('officialCountCells').textContent,'110');
 element('officialTemplateSelect').value='C_07.00.a';
 element('officialTemplateSelect').onchange();
 await flush();
 const list=()=>element('officialCellList');
 assert.equal(element('officialCountCells').textContent,'1316');
 assert.equal(element('officialViewMode').value,'rows');
 assert.equal(list().querySelectorAll('[data-group]').length,47);
 assert.equal(list().querySelectorAll('[data-cell]').length,0);
 assert.match(element('officialMatches').textContent,/47 regulatory row groups/);
 list().querySelectorAll('[data-group]')[0].onclick();
 assert.equal(list().querySelectorAll('[data-cell]').length,28);
 assert.match(list().innerHTML,/Original exposure pre conversion factors/);
 list().querySelectorAll('[data-cell]')[1].onclick();
 assert.match(element('officialDetail').innerHTML,/c0030/);
 element('officialSearch').value='c0030';
 element('officialSearch').oninput();
 assert.match(element('officialMatches').textContent,/47 regulatory row groups/);
 element('officialSearch').value='';
 element('officialViewMode').value='cells';
 element('officialViewMode').onchange();
 assert.equal(list().querySelectorAll('[data-cell]').length,250);
 element('officialTemplateSelect').value='C_01.00';
 element('officialTemplateSelect').onchange();
 assert.equal(element('officialViewMode').value,'cells');
 assert.equal(element('officialCountCells').textContent,'110');
 assert.equal(element('officialRulesPanel').style.display,'');
 assert.equal(warnings.length,0);
 assert(requested.includes('data/corep_creditrisk/C_07.00.a.json'));
 console.log('PASS COREP browser: 47 grouped C07 rows / 28 columns in r0010; 1316 intact; C01 unaffected');
})().catch(err=>{console.error(err);process.exitCode=1;});
