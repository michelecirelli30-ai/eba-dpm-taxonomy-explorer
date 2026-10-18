(function(){
"use strict";
var db=null,selectedCell=null,selectedRule=null;
function el(id){return document.getElementById(id)}
function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function rows(){return db&&db.cells||[]}
function rules(){return db&&db.validation_rules||[]}
function rowLabel(c){var h=c.headers&&c.headers.row_header_id||[];return h.length&&h[0].label||"Row "+c.row}
function getCell(row){return rows().find(function(c){return c.row===row&&c.column==="0010"})||rows().find(function(c){return c.row===row})}
function openOfficial(row){if(db){var c=getCell(row);if(c)selectedCell=c.cell_id;el("officialSearch").value="";renderCells()}show("official")}
window.openOfficialRow=openOfficial;
function openIFRS(row){if(!COREP_IFRS.rows.some(function(x){return x.r===row}))return;activeMapRow=row;el("mapSearch").value="";renderMap();show("cellmap")}
function renderCells(){
if(!db)return;
var q=el("officialSearch").value.trim().toLowerCase();
var found=rows().filter(function(c){if(!q)return true;return [c.row,c.column,c.cell_id,c.variable_vid,c.cell_code,c.metric_item_name,rowLabel(c)].concat((c.context_dimensions||[]).flatMap(function(d){return [d.member&&d.member.name].concat((d.item_categories||[]).map(function(x){return x.signature}))})).join(" ").toLowerCase().includes(q)});
el("officialMatches").textContent=found.length+" / "+rows().length+" authentic C 01.00 cells";
el("officialCellList").innerHTML=found.map(function(c){return '<button type="button" class="odpm-row '+(selectedCell===c.cell_id?'selected':'')+'" data-cell="'+esc(c.cell_id)+'"><strong>r'+esc(c.row)+'</strong><span>'+esc(rowLabel(c))+'<small>c'+esc(c.column)+' · CellID '+esc(c.cell_id)+' · VariableVID '+esc(c.variable_vid)+'</small></span></button>'}).join("")||'<p class="fine">No matching official cell.</p>';
el("officialCellList").querySelectorAll("[data-cell]").forEach(function(b){b.onclick=function(){selectedCell=Number(b.dataset.cell);renderCells()}});
var c=rows().find(function(x){return x.cell_id===selectedCell})||rows()[0];if(c){selectedCell=c.cell_id;renderCellDetail(c)}
}
function renderCellDetail(c){
var v=c.variable||{}, dimensions=c.context_dimensions||[];
var related=rules().filter(function(r){return r.type==="validation"&&new RegExp("\\br"+c.row+"\\b","i").test(r.expression||"")});
var memberHtml=dimensions.map(function(d){var sig=(d.item_categories||[]).map(function(x){return x.signature}).filter(Boolean).join(", ");return '<div class="odpm-member"><b>'+esc(d.member&&d.member.name||"Unnamed member")+'</b><small>PropertyID '+esc(d.property_id)+' · ItemID '+esc(d.item_id)+'</small><small>Member signature: '+esc(sig||"Not available")+'</small></div>'}).join("");
var editorial=COREP_IFRS.rows.some(function(x){return x.r===c.row});
el("officialDetail").innerHTML='<span class="pill">Official EBA source cell</span><h2 style="font-size:21px;margin:13px 0 5px">'+esc(c.cell_code)+'</h2><p class="lead">'+esc(rowLabel(c))+'</p>'+
'<div class="odpm-stats"><div><small>CellID</small><strong>'+esc(c.cell_id)+'</strong></div><div><small>VariableVID</small><strong>'+esc(c.variable_vid)+'</strong></div><div><small>TableVID</small><strong>'+esc(c.table_vid)+'</strong></div></div>'+
'<h3>Actual DPM metric</h3><p class="lead">'+esc(c.metric_item_name||"Metric name unavailable")+'</p><p class="fine">Metric PropertyID '+esc(v.property_id)+' · VariableID '+esc(v.variable_id)+' · ContextID '+esc(v.context_id)+'</p>'+
'<h3>Actual dimensional members ('+dimensions.length+')</h3>'+(memberHtml||'<p class="fine">No ContextComposition members found for this cell.</p>')+
'<h3>Template coordinate</h3><p class="fine">Row r'+esc(c.row)+' · Column c'+esc(c.column)+' · Row HeaderVID '+esc(c.headers&&c.headers.row_header_id&&c.headers.row_header_id[0]&&c.headers.row_header_id[0].header_vid)+' · Column HeaderVID '+esc(c.headers&&c.headers.column_header_id&&c.headers.column_header_id[0]&&c.headers.column_header_id[0].header_vid)+'</p>'+
'<h3>Validation formulas referencing this row: '+related.length+'</h3><div class="odpm-inline">'+related.slice(0,16).map(function(r){return '<button type="button" class="odpm-link" data-rule="'+esc(r.operation_vid)+'">'+esc(r.code)+'</button>'}).join("")+'</div>'+
(editorial?'<button type="button" id="openIFRS" class="btn">Open IFRS accounting bridge ↗</button>':'<p class="fine">No curated IFRS bridge for this row.</p>')+
'<p class="fine" style="margin-top:14px">Native DPM identifiers are not XBRL QNames. Additional key/subcategory qualifiers may exist outside the ContextComposition mapping shown.</p>';
if(editorial)el("openIFRS").onclick=function(){openIFRS(c.row)};
el("officialDetail").querySelectorAll("[data-rule]").forEach(function(b){b.onclick=function(){selectedRule=Number(b.dataset.rule);el("officialRuleSearch").value="";el("officialRuleType").value="all";renderRules();el("officialRuleDetail").scrollIntoView({behavior:"smooth",block:"start"})}});
}
function referencedRows(text){var found=new Set();var re=/\br(\d{3,4})\b/gi,m;while((m=re.exec(text||""))!==null)found.add(m[1].padStart(4,"0"));return [...found]}
function renderRules(){
if(!db)return;
var q=el("officialRuleSearch").value.trim().toLowerCase(),type=el("officialRuleType").value;
var filtered=rules().filter(function(r){return (type==="all"||r.type===type)&&[r.code,r.description,r.expression,r.operation_id].join(" ").toLowerCase().includes(q)});
el("officialRuleCount").textContent=filtered.length+" matching operations";
el("officialRuleList").innerHTML=filtered.map(function(r){return '<button type="button" class="odpm-row '+(selectedRule===r.operation_vid?'selected':'')+'" data-rule="'+esc(r.operation_vid)+'"><strong>'+esc(r.code)+'</strong><span>'+esc(r.type)+'<small>'+esc((r.description||r.expression||"").slice(0,90))+'</small></span></button>'}).join("")||'<p class="fine">No matching official operation.</p>';
el("officialRuleList").querySelectorAll("[data-rule]").forEach(function(b){b.onclick=function(){selectedRule=Number(b.dataset.rule);renderRules()}});
var r=filtered.find(function(x){return x.operation_vid===selectedRule})||filtered[0];if(r){selectedRule=r.operation_vid;renderRuleDetail(r)}else el("officialRuleDetail").innerHTML='<p class="fine">No rule matches this filter.</p>';
}
function renderRuleDetail(r){
var references=referencedRows(r.expression).filter(function(row){return !!getCell(row)});
el("officialRuleDetail").innerHTML='<span class="pill">'+esc(r.type)+' · official Access database</span><h2 style="margin-top:14px">'+esc(r.code)+'</h2><p class="fine">OperationID '+esc(r.operation_id)+' · OperationVID '+esc(r.operation_vid)+' · StartReleaseID '+esc(r.start_release_id)+'</p><h3>Original expression</h3><pre class="odpm-formula">'+esc(r.expression||"")+'</pre><h3>Description</h3><p class="lead">'+esc(r.description||"—")+'</p><h3>Referenced C 01.00 cells ('+references.length+')</h3><div class="odpm-inline">'+references.map(function(row){return '<button class="odpm-link" data-row="'+esc(row)+'">r'+esc(row)+'</button>'}).join("")+'</div><p class="fine">Current EBA activation/deactivation and severity are NOT determined from this database alone. Verify against the applicable published validation-rule package.</p>';
el("officialRuleDetail").querySelectorAll("[data-row]").forEach(function(b){b.onclick=function(){openOfficial(b.dataset.row);el("officialDetail").scrollIntoView({behavior:"smooth",block:"start"})}});
}
function download(filename,mime,text){var u=URL.createObjectURL(new Blob([text],{type:mime})),a=document.createElement("a");a.href=u;a.download=filename;a.click();setTimeout(function(){URL.revokeObjectURL(u)},1000)}
el("officialCsv").onclick=function(){if(!db)return;var cols=["CellCode","Row","Column","CellID","VariableVID","TableVID","MetricPropertyID","ContextID","MemberSignatures"];var values=rows().map(function(c){return [c.cell_code,c.row,c.column,c.cell_id,c.variable_vid,c.table_vid,c.variable&&c.variable.property_id,c.variable&&c.variable.context_id,(c.context_dimensions||[]).flatMap(function(d){return (d.item_categories||[]).map(function(x){return x.signature})}).join(";")]});var csv=[cols].concat(values).map(function(line){return line.map(function(x){return '"'+String(x==null?"":x).replace(/"/g,'""')+'"'}).join(",")}).join("\r\n");download("eba_corep_c0100_official.csv","text/csv;charset=utf-8","\ufeff"+csv)};
el("officialJson").onclick=function(){if(db)download("eba_corep_c0100_official.json","application/json",JSON.stringify(db,null,2))};
el("officialSearch").oninput=renderCells;
el("officialRuleSearch").oninput=renderRules;
el("officialRuleType").onchange=renderRules;
fetch("data/corep_c0100_official.json",{cache:"no-cache"}).then(function(r){if(!r.ok)throw Error("HTTP "+r.status);return r.json()}).then(function(data){
if(!data||!data.source||data.source.reporting_family!=="COREP_OF"||!Array.isArray(data.cells)||!data.cells.length||!Array.isArray(data.validation_rules))throw Error("Unexpected official data format");
db=data;selectedCell=(getCell("0130")||data.cells[0]).cell_id;selectedRule=(rules().find(function(x){return x.code==="v0172_m"})||rules()[0]).operation_vid;
el("officialStatus").textContent="EBA 4.3 Access · imported";
el("officialCountCells").textContent=String(data.cells.length);
el("officialCountRules").textContent=String(rules().filter(function(x){return x.type==="validation"}).length);
el("officialOrigin").textContent="COREP_OF · ModuleVID "+data.module_versions[0].module_vid+" · C 01.00 TableVID "+data.table_versions[0].table_vid+" · ZIP SHA-256 "+data.source.zip_sha256.slice(0,16)+"…";
renderCells();renderRules()
}).catch(function(err){el("officialStatus").textContent="Import unavailable";el("officialOrigin").textContent="Unable to read official JSON: "+err.message;el("officialCellList").textContent="Refresh after the GitHub Pages deployment has completed."})
})();