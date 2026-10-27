(function(){
"use strict";
var select=document.getElementById("officialTemplateSelect");
var stage=document.getElementById("official");
if(!select||!stage)return;
var sourceCard=select.closest(".card");
var panel=document.createElement("article");
panel.className="card pad";
panel.id="officialMatrixPanel";
panel.style.marginBottom="16px";
panel.innerHTML='<div class="panel-head"><div><h2>Regulatory Template View · DPM coordinate matrix</h2><p class="description">Original reporting row and column coordinates, with reportable and excluded DPM positions. Select a position to inspect its source metadata.</p></div><button type="button" class="btn outline" id="officialMatrixToggle" aria-expanded="false">Show matrix</button></div><div id="officialMatrixBody" hidden><p class="fine" id="officialMatrixStatus" aria-live="polite"></p><div style="overflow:auto;max-height:650px;border:1px solid var(--line);border-radius:9px"><table id="officialMatrixTable" style="border-collapse:separate;border-spacing:0;width:max-content;min-width:100%;font-size:12px"></table></div><p class="fine" style="margin-top:12px">This matrix reproduces imported DPM row/column positions, not the EBA formatted Excel layout. Parametric coordinates appear as * and may represent several reporting instances. An absent source position is left blank, not treated as an excluded cell.</p></div>';
sourceCard.insertAdjacentElement("afterend",panel);
var toggle=document.getElementById("officialMatrixToggle"),body=document.getElementById("officialMatrixBody"),table=document.getElementById("officialMatrixTable"),status=document.getElementById("officialMatrixStatus");
var cache={},token=0;
var css=document.createElement("style");
css.textContent='#officialMatrixPanel th,#officialMatrixPanel td{padding:7px 9px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);vertical-align:middle;max-width:180px}#officialMatrixPanel th{background:#f7f2f5;text-align:left;position:sticky;top:0;z-index:2}#officialMatrixPanel th:first-child{left:0;z-index:4}#officialMatrixPanel td:first-child{position:sticky;left:0;background:#fff;z-index:1;min-width:210px;max-width:270px}#officialMatrixPanel .dpm-matrix-cell{padding:7px;border-radius:5px;border:1px solid #d5b7c7;background:#fff;color:#742948;cursor:pointer;width:100%;font-size:11px}#officialMatrixPanel .dpm-matrix-cell.excluded{background:#ededed;color:#555;border-color:#ccc}#officialMatrixPanel .dpm-matrix-cell:hover{outline:2px solid #742948}#officialMatrixPanel small{display:block;color:#777;margin-top:3px;white-space:normal;line-height:1.2}';
document.head.appendChild(css);
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function natural(a,b){return String(a).localeCompare(String(b),undefined,{numeric:true})}
function coord(x){return x||"*"}
function label(c,k){var a=c.headers&&c.headers[k+"_header_id"]||[];return a.length&&a[0].label||""}
async function render(){
 var id=++token,code=select.value;
 table.innerHTML="";
 status.textContent="Loading "+code+" official source coordinates…";
 try{
  var file=/^C_(?:0[5-9]|10)\./.test(code)?"data/corep_creditrisk/"+code+".json":"data/corep_of_multitemplate.json";
  if(!cache[file]){
   var response=await fetch(file,{cache:"no-cache"});
   if(!response.ok)throw Error("HTTP "+response.status);
   cache[file]=await response.json();
  }
  if(id!==token||!body.hidden===false)return;
  var raw=cache[file],cells=(raw.cells||[]).filter(function(c){return (c.table_code||code)===code});
  if(!cells.length)throw Error("No source coordinates for this template");
  var rmap=new Map(),cmap=new Map(),grid=new Map();
  cells.forEach(function(c){
   var r=coord(c.row),col=coord(c.column),key=r+"|"+col;
   if(!rmap.has(r))rmap.set(r,label(c,"row"));
   if(!cmap.has(col))cmap.set(col,label(c,"column"));
   if(!grid.has(key))grid.set(key,[]);
   grid.get(key).push(c);
  });
  var rs=Array.from(rmap.keys()).sort(natural),cs=Array.from(cmap.keys()).sort(natural);
  var head='<thead><tr><th scope="col">Reporting row / column</th>'+cs.map(function(c){return '<th scope="col">c'+esc(c)+'<small>'+esc(cmap.get(c))+'</small></th>'}).join("")+'</tr></thead>';
  var html='<tbody>'+rs.map(function(r){
   return '<tr><td><b>r'+esc(r)+'</b><small>'+esc(rmap.get(r))+'</small></td>'+cs.map(function(c){
    var matches=grid.get(r+"|"+c)||[];
    if(!matches.length)return '<td aria-label="No source position">—</td>';
    var excluded=matches.every(function(x){return Number(x.is_excluded)===1});
    return '<td><button type="button" class="dpm-matrix-cell '+(excluded?'excluded':'')+'" data-cell="'+esc(matches[0].cell_id)+'" title="'+esc(matches[0].cell_code)+'">'+(excluded?'Excluded':'Reportable')+(matches.length>1?' ('+matches.length+')':'')+'</button></td>';
   }).join("")+'</tr>';
  }).join("")+'</tbody>';
  table.innerHTML=head+html;
  status.textContent=code+" · "+rs.length+" reporting rows · "+cs.length+" columns · "+cells.length+" imported positions · "+cells.filter(function(c){return Number(c.is_excluded)===1}).length+" excluded. Grey = excluded; outlined = reportable.";
 }catch(e){if(id!==token)return;status.textContent="Matrix unavailable: "+e.message}
}
toggle.addEventListener("click",function(){
 var opening=body.hidden;
 body.hidden=!opening;
 toggle.textContent=opening?"Hide matrix":"Show matrix";
 toggle.setAttribute("aria-expanded",String(opening));
 if(opening)render();
});
select.addEventListener("change",function(){token++;table.innerHTML="";status.textContent="Template changed.";if(!body.hidden)render()});
table.addEventListener("click",function(event){
 var b=event.target.closest("[data-cell]");
 if(!b)return;
 var id=b.dataset.cell,search=document.getElementById("officialSearch"),mode=document.getElementById("officialViewMode");
 if(!search||!mode)return;
 mode.value="cells";mode.dispatchEvent(new Event("change"));
 search.value=id;search.dispatchEvent(new Event("input"));
 var target=document.querySelector('#officialCellList [data-cell="'+id+'"]');
 if(target){target.click();document.getElementById("officialDetail").scrollIntoView({behavior:"smooth",block:"start"})}
});
})();
