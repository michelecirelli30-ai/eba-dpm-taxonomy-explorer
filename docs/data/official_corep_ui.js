(function(){
"use strict";
var db=null,baseDb=null,creditManifest=null,riskManifest=null,creditCache={},loadSequence=0,selectedCell=null,selectedRule=null,selectedTemplate="C_01.00",expandedRow=null,multiTemplateLoaded=false;
function el(id){return document.getElementById(id)}
function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function rows(){return db?db.cells.filter(function(c){return (c.table_code||"C_01.00")===selectedTemplate}):[]}
function rules(){return db&&db.validation_rules||[]}
function rowLabel(c){var h=c.headers&&c.headers.row_header_id||[];return h.length&&h[0].label||c.cell_code||"Row "+c.row}
function getCell(row){return rows().find(function(c){return c.row===row&&c.column==="0010"})||rows().find(function(c){return c.row===row})}
function openOfficial(row){if(db){selectedTemplate="C_01.00";el("officialTemplateSelect").value=selectedTemplate;updateTemplate();var c=getCell(row);if(c)selectedCell=c.cell_id;el("officialSearch").value="";renderCells()}show("official")}
window.openOfficialRow=openOfficial;
function openIFRS(row){if(!COREP_IFRS.rows.some(function(x){return x.r===row}))return;activeMapRow=row;el("mapSearch").value="";renderMap();show("cellmap")}
function showTemplate(){
 if(!db)return;
 var rs=rows(),table=db.table_versions.find(function(t){return t.code===selectedTemplate});
 el("officialCountCells").textContent=String(rs.length);
 el("officialTemplateCode").textContent=selectedTemplate;
 el("officialListTitle").textContent="Actual "+selectedTemplate.replace("_"," ")+" cells";
 el("officialRulesPanel").style.display=selectedTemplate==="C_01.00"?"":"none";
 el("officialTemplateNotice").textContent=table?
  table.name+" · TableVID "+table.table_vid+" · "+rs.length+" authentic DPM positions ("+
  rs.filter(function(c){return c.is_excluded===1}).length+" excluded)"+
  (selectedTemplate==="C_01.00"?" · 52 source validation rules":" · validation rule corpus not yet imported"):
  "No verified cells for this template.";
 el("officialOrigin").textContent=db.source.reporting_family+" · "+selectedTemplate+
  " · TableVID "+(table?table.table_vid:"—")+" · ZIP SHA-256 "+db.source.zip_sha256.slice(0,16)+"…";
 el("officialDatasetLink").href=selectedTemplate==="C_01.00"||!([].concat(creditManifest&&creditManifest.templates||[],riskManifest&&riskManifest.templates||[])).some(function(e){return e.code===selectedTemplate})?
  (multiTemplateLoaded?"data/corep_of_multitemplate.json":"data/corep_c0100_official.json"):
  ([].concat(creditManifest&&creditManifest.templates||[],riskManifest&&riskManifest.templates||[])).find(function(e){return e.code===selectedTemplate}).file;
 selectedCell=rs.length?rs[0].cell_id:null;
 expandedRow=null;
 el("officialViewMode").value=rs.length>150?"rows":"cells";
 el("officialSearch").value="";
 renderCells();
 if(selectedTemplate==="C_01.00")renderRules();
}
function updateTemplate(){
 if(!baseDb)return;
 var option=el("officialTemplateSelect").selectedOptions[0];
 selectedTemplate=option?option.value:"C_01.00";
 var ticket=++loadSequence;
 var entry=([].concat(creditManifest&&creditManifest.templates||[],riskManifest&&riskManifest.templates||[])).find(function(e){return e.code===selectedTemplate});
 if(!entry){
  db=baseDb;showTemplate();return;
 }
 if(creditCache[entry.code]){
  db=creditCache[entry.code];showTemplate();return;
 }
 el("officialTemplateCode").textContent=selectedTemplate;
 el("officialListTitle").textContent="Loading "+selectedTemplate+" source cells…";
 el("officialMatches").textContent="";
 el("officialCellList").innerHTML='<p class="fine">Loading verified EBA DPM data for '+esc(selectedTemplate)+'…</p>';
 el("officialDetail").innerHTML='<p class="fine">Template information will appear once the official source file is loaded.</p>';
 el("officialRulesPanel").style.display="none";
 el("officialTemplateNotice").textContent="Loading "+entry.cell_count+" imported positions for "+selectedTemplate+"…";
 loadSource(entry.file).then(function(data){
  if(ticket!==loadSequence)return;
  if(!data||data.source?.reporting_family!=="COREP_OF"||
   data.source?.zip_sha256!==(entry.file.indexOf("corep_risks/")>=0?riskManifest:creditManifest).source.zip_sha256||
   data.table_versions?.length!==1||
   data.table_versions[0].code!==entry.code||
   data.table_versions[0].table_vid!==entry.table_vid||
   !Array.isArray(data.cells)||data.cells.length!==entry.cell_count||
   !Array.isArray(data.validation_rules)||data.validation_rules.length!==0||
   data.cells.some(function(c){return c.table_code!==entry.code||c.table_vid!==entry.table_vid||
     c.cell_id==null||(c.variable_vid==null&&c.is_excluded!==1)}))
    throw Error("Unexpected official template source or provenance; file not displayed");
  creditCache[entry.code]=data;
  db=data;showTemplate();
 }).catch(function(err){
  if(ticket!==loadSequence)return;
  el("officialTemplateNotice").textContent="Could not verify "+selectedTemplate+": "+err.message;
  el("officialCellList").textContent="The selected COREP template is temporarily unavailable. Other templates remain accessible.";
  el("officialStatus").textContent="Template loading error";
 });
}
el("officialTemplateSelect").onchange=updateTemplate;
function matchingCells(){
 var q=el("officialSearch").value.trim().toLowerCase();
 return rows().filter(function(c){
  if(!q)return true;
  var head=c.headers&&c.headers.column_header_id||[];
  var label=head.length&&head[0].label||"";
  return [c.row,c.column,c.cell_id,c.variable_vid,c.cell_code,c.metric_item_name,
    rowLabel(c),label].concat((c.context_dimensions||[]).flatMap(function(d){
     return [d.member&&d.member.name].concat((d.item_categories||[]).map(function(x){return x.signature}))
    })).join(" ").toLowerCase().includes(q)
 });
}
function rowGroupKey(c){
 // A parametric r* has no fixed row identifier; don't merge unrelated cells into a fabricated row.
 return c.row?"r"+c.row:"open:"+c.cell_code;
}
function columnLabel(c){
 var h=c.headers&&c.headers.column_header_id||[];
 return h.length&&h[0].label||c.metric_item_name||c.cell_code||"Column "+(c.column||"open");
}
function renderCells(){
 if(!db)return;
 var found=matchingCells(),source=rows();
 var mode=el("officialViewMode").value;
 var list=el("officialCellList"),count=el("officialMatches");
 if(mode==="rows"){
  var groups=new Map();
  found.forEach(function(c){
   var key=rowGroupKey(c);
   if(!groups.has(key))groups.set(key,{key:key,label:rowLabel(c),row:c.row,cells:[]});
   groups.get(key).cells.push(c);
  });
  var items=Array.from(groups.values());
  var groupLimit=180;
  count.textContent=items.length+" regulatory row groups · "+found.length+" / "+source.length+
   " matching DPM positions"+(items.length>groupLimit?" · first "+groupLimit+" rows shown; refine search":"");
  list.innerHTML='<div class="odpm-intro">Choose a reporting row to inspect its columns and then select a source cell. Repeated row IDs reflect different columns, not duplicated records.</div>'+
   (items.length?items.slice(0,groupLimit).map(function(group){
    var opened=expandedRow===group.key;
    var excluded=group.cells.filter(function(c){return c.is_excluded===1}).length;
    var groupLabel=group.row?"r"+group.row:"r*";
    return '<div class="odpm-row-group '+(opened?'is-expanded':'')+'">'+
     '<button type="button" data-group="'+esc(group.key)+'" aria-expanded="'+opened+'">'+
     '<span class="odpm-group-code">'+esc(groupLabel)+'</span>'+
     '<span class="odpm-group-info">'+esc(group.label)+
      '<small>'+group.cells.length+' matching column '+(group.cells.length===1?'position':'positions')+
      (excluded?' · '+excluded+' excluded':'')+'</small></span>'+
     '<span class="odpm-group-chevron" aria-hidden="true">'+(opened?'▾':'▸')+'</span></button>'+
     (opened?'<div class="odpm-columns">'+group.cells.map(function(c){
       return '<button type="button" class="odpm-column '+(selectedCell===c.cell_id?'selected':'')+
        '" data-cell="'+esc(c.cell_id)+'"><strong>'+esc(c.column?'c'+c.column:'Dynamic column')+
        '</strong> · '+esc(columnLabel(c))+
        '<small>CellID '+esc(c.cell_id)+(c.is_excluded===1?' · Excluded / non-reportable':
         ' · VariableVID '+esc(c.variable_vid))+
        (/(?:,\s*[rcs]\*)/.test(c.cell_code||"")?' · Open DPM coordinate':'')+'</small></button>';
      }).join("")+'</div>':'')+'</div>';
    }).join(""):'<p class="fine" style="padding:12px">No matching regulatory row.</p>');
  list.querySelectorAll("[data-group]").forEach(function(b){
   b.onclick=function(){
    expandedRow=expandedRow===b.dataset.group?null:b.dataset.group;
    var group=groups.get(b.dataset.group);
    if(expandedRow&&group&&group.cells.length)selectedCell=group.cells[0].cell_id;
    renderCells();
   }
  });
 }else{
  var limit=250;
  count.textContent=found.length+" / "+source.length+" matching DPM positions"+(found.length>limit?
   " · displaying first "+limit+"; refine search":"");
  list.innerHTML=found.slice(0,limit).map(function(c){
    return '<button type="button" class="odpm-row '+(selectedCell===c.cell_id?'selected':'')+
      '" data-cell="'+esc(c.cell_id)+'"><strong>'+esc(c.row?'r'+c.row:'Open row')+'</strong>'+
      '<span>'+esc(rowLabel(c))+'<small>'+esc(c.column?'c'+c.column:'Open column')+
      ' · '+esc(columnLabel(c))+' · CellID '+esc(c.cell_id)+
      ' · VariableVID '+esc(c.variable_vid==null?'Excluded':c.variable_vid)+
      '</small></span></button>';
  }).join("")||'<p class="fine" style="padding:12px">No matching DPM cell.</p>';
 }
 list.querySelectorAll("[data-cell]").forEach(function(b){
  b.onclick=function(){selectedCell=Number(b.dataset.cell);renderCells()}
 });
 if(!found.length){el("officialDetail").innerHTML='<p class="fine">No cell matches this search.</p>';return}
 var selected=found.find(function(c){return c.cell_id===selectedCell})||found[0];
 selectedCell=selected.cell_id;
 renderCellDetail(selected);
}
el("officialViewMode").onchange=function(){
 expandedRow=null;
 var current=rows().find(function(c){return c.cell_id===selectedCell});
 if(current&&el("officialViewMode").value==="rows")expandedRow=rowGroupKey(current);
 renderCells();
};
function renderCellDetail(c){
var v=c.variable||{}, dimensions=c.context_dimensions||[];
var isParametric=/\b[rcs]\*/i.test(c.cell_code||"");
var related=selectedTemplate==="C_01.00"?rules().filter(function(r){return r.type==="validation"&&new RegExp("\\br"+c.row+"\\b","i").test(r.expression||"")}):[];
var memberHtml=dimensions.map(function(d){var sig=(d.item_categories||[]).map(function(x){return x.signature}).filter(Boolean).join(", ");return '<div class="odpm-member"><b>'+esc(d.member&&d.member.name||"Unnamed member")+'</b><small>PropertyID '+esc(d.property_id)+' · ItemID '+esc(d.item_id)+'</small><small>Member signature: '+esc(sig||"Not available")+'</small></div>'}).join("");
var editorial=selectedTemplate==="C_01.00"&&COREP_IFRS.rows.some(function(x){return x.r===c.row});
el("officialDetail").innerHTML='<span class="pill">'+(c.is_excluded===1?'Excluded template position · non-reportable':isParametric?'Parametric DPM cell template':'Official EBA source cell')+'</span><h2 style="font-size:21px;margin:13px 0 5px">'+esc(c.cell_code)+'</h2><p class="lead">'+esc(rowLabel(c))+'</p>'+
'<div class="odpm-stats"><div><small>CellID</small><strong>'+esc(c.cell_id)+'</strong></div><div><small>VariableVID</small><strong>'+esc(c.variable_vid==null?'Not assigned':c.variable_vid)+'</strong></div><div><small>TableVID</small><strong>'+esc(c.table_vid)+'</strong></div></div>'+
'<h3>Actual DPM metric</h3><p class="lead">'+esc(c.is_excluded===1?"Excluded cell (no reportable metric)":c.metric_item_name||"Metric name unavailable")+'</p><p class="fine">Metric PropertyID '+esc(v.property_id)+' · VariableID '+esc(v.variable_id)+' · ContextID '+esc(v.context_id)+'</p>'+
'<h3>Actual dimensional members ('+dimensions.length+')</h3>'+(memberHtml||'<p class="fine">No ContextComposition members found for this cell.</p>')+
'<h3>Template coordinate</h3><p class="fine">'+esc(c.cell_code)+' · Row '+esc(c.row?'r'+c.row:'dynamic / unspecified')+' · Column '+esc(c.column?'c'+c.column:'dynamic / unspecified')+' · Row HeaderVID '+esc(c.headers&&c.headers.row_header_id&&c.headers.row_header_id[0]&&c.headers.row_header_id[0].header_vid||'not assigned')+' · Column HeaderVID '+esc(c.headers&&c.headers.column_header_id&&c.headers.column_header_id[0]&&c.headers.column_header_id[0].header_vid||'not assigned')+'</p>'+(isParametric?'<p class="fine">An asterisk in the original cell code denotes an open row, column or sheet coordinate. This is a DPM template position, not an invented concrete filing data point.</p>':'')+
(selectedTemplate==='C_01.00'?'<h3>Validation formulas referencing this row: '+related.length+'</h3><div class="odpm-inline">'+related.slice(0,16).map(function(r){return '<button type="button" class="odpm-link" data-rule="'+esc(r.operation_vid)+'">'+esc(r.code)+'</button>'}).join("")+'</div>':'<h3>Validation rules</h3><p class="fine">Official validation expressions for this template have not yet been imported. No rule coverage is implied.</p>')+
(editorial?'<button type="button" id="openIFRS" class="btn">Open IFRS accounting bridge ↗</button>':'<p class="fine">No curated IFRS bridge for this row.</p>')+
'<p class="fine" style="margin-top:14px">Native DPM identifiers are not XBRL QNames. Excluded template positions with no VariableVID are not reportable data points. Other key/subcategory qualifiers may exist. C 01.00 rules are not evidence of validation coverage for the other templates.</p>';
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
var longRule=(r.expression||"").length>320||references.length>8;
var explanation=window.EbaRuleTranslator?window.EbaRuleTranslator.interpret(r.expression,rows()):null;
var structured=explanation&&window.EbaRuleTranslator.readableStructure(explanation);
var rowSet=explanation&&window.EbaRuleTranslator.rowSetStructure(explanation);
var isSupported=explanation&&explanation.status==="supported";
var html='<span class="pill">'+esc(r.type)+' · official Access database</span><h2 style="margin-top:14px">'+esc(r.code)+'</h2>'+
'<p class="fine">OperationID '+esc(r.operation_id)+' · OperationVID '+esc(r.operation_vid)+' · StartReleaseID '+esc(r.start_release_id)+'</p>';
if(explanation){
  html+='<div class="map-warn" style="margin:14px 0"><b>EBA Rule Translator · '+(isSupported?'Deterministic interpretation':'Requires technical review')+'</b>'+
  '<p class="fine">Explanations use the imported EBA DPM labels. The original EBA expression is the authoritative source.</p></div>';
  if(isSupported&&rowSet){
    var readableSign=rowSet.operator==="<="?"non-positive (≤ 0)":"non-negative (≥ 0)";
    html+='<div class="odpm-quick"><h3>Quick formula</h3>'+
      '<p class="odpm-equation">Each selected reporting cell '+esc(rowSet.operator)+' 0</p>'+
      '<p class="fine">'+esc(rowSet.count)+' verified COREP '+esc(rowSet.table)+
      ' cells · column c'+esc(rowSet.column)+' · individual sign constraint ('+esc(readableSign)+')</p></div>'+
      '<h3>Plain English</h3><p class="lead">'+esc(explanation.plainEnglish)+'</p>'+
      '<p class="fine">This is NOT a sum: the comparison applies separately to each listed cell.</p>'+
      '<details class="odpm-fold"><summary>View all '+rowSet.count+' selected EBA rows and CellIDs</summary>'+
      '<div class="table-scroll"><table><thead><tr><th>Row</th><th>Official description</th><th>CellID</th></tr></thead><tbody>'+
      rowSet.members.map(function(member){return '<tr><td><button type="button" class="odpm-link" data-row="'+esc(member.row)+
        '">r'+esc(member.row)+'</button></td><td>'+esc(member.label)+
        '</td><td>'+esc(member.cellId)+'</td></tr>'}).join("")+
      '</tbody></table></div></details>'+
      '<div class="map-warn"><b>Evaluation scope:</b> default: '+esc(rowSet.defaultValue)+
      ', interval: '+esc(rowSet.interval)+'. This description does not evaluate missing or null facts, or establish a requirement to populate every cell. Verify the applicable EBA rule status separately.</div>';
  }else if(isSupported&&structured&&!structured.long&&structured.termCount<=6){
    var names={
      "Capital instruments and share premium eligible as CET1 Capital":"CET1-eligible instruments & share premium",
      "Fully paid up capital instruments":"Fully paid-up capital",
      "(-) Actual or contingent obligations to purchase own CET1 instruments":"(-) Own CET1 purchase obligations",
      "Previous years retained earnings":"Previous years' retained earnings",
      "Profit or loss eligible":"Eligible profit or loss"
    };
    var shorten=function(x){return Object.prototype.hasOwnProperty.call(names,x)?names[x]:x};
    var quick=shorten(structured.lhs.label)+" = "+structured.terms.map(function(t,i){
      return (i===0?(t.coefficient<0?"− ":""):(t.coefficient<0?" − ":" + "))+shorten(t.label);
    }).join("");
    html+='<div class="odpm-quick"><h3>Quick formula</h3><p class="odpm-equation">'+esc(quick)+'</p>'+
      '<p class="fine">Concise editorial labels based on official EBA rows. Original formula below is authoritative.</p>'+
      (structured.caution?'<p class="fine">'+esc(structured.caution)+'</p>':'')+'</div>';
  }
  if(isSupported&&structured&&structured.long){
    html+='<h3>Business summary</h3><p class="lead" style="font-weight:650">'+esc(structured.shortPlain)+'</p>'+
    '<p class="fine">Target: '+esc(structured.lhs.label)+' · r'+esc(structured.lhs.row)+' · CellID '+esc(structured.lhs.cellId)+'</p>';
    if(structured.caution)html+='<div class="map-warn">'+esc(structured.caution)+'</div>';
    html+='<details class="odpm-fold"><summary>View '+structured.termCount+' official components and their signs</summary>'+
    '<div class="table-scroll"><table><thead><tr><th>COREP row</th><th>Official EBA description</th><th>Operator</th></tr></thead><tbody>'+
    structured.terms.map(function(term){return '<tr><td><button type="button" class="odpm-link" data-row="'+esc(term.row)+'">r'+esc(term.row)+'</button></td><td>'+esc(term.label)+'</td><td>'+esc(term.coefficient===1?'+':'−')+'</td></tr>'}).join("")+
    '</tbody></table></div></details>';
    html+='<details class="odpm-fold"><summary>View expanded Business Formula and Plain English</summary>'+
    '<h3>Business formula</h3><p class="lead">'+esc(explanation.businessFormula)+'</p>'+
    '<h3>Full Plain English</h3><p class="lead">'+esc(explanation.plainEnglish)+'</p></details>';
  }else if(isSupported){
    html+='<h3>Plain English</h3><p class="lead">'+esc(explanation.plainEnglish)+'</p>'+
    '<h3>Business formula</h3><p class="lead">'+esc(explanation.businessFormula)+'</p>';
  }else{
    html+='<h3>Requires technical review</h3><p class="fine">'+esc(explanation.reason.join("; "))+'</p>';
  }
  html+='<details class="odpm-fold"'+(longRule?'':' open')+'><summary>Technical breakdown</summary>'+
    explanation.technical.map(function(line){return '<p class="fine">'+esc(line)+'</p>'}).join("")+'</details>';
  if(!rowSet&&explanation.references.some(function(item){return item.cellId!==null})){
    html+='<details class="odpm-fold"><summary>Verified cell references ('+explanation.references.filter(function(item){return item.cellId!==null}).length+')</summary><div class="odpm-ref-list">'+
    explanation.references.filter(function(item){return item.cellId!==null}).map(function(item){return '<div><button class="odpm-link" type="button" data-row="'+esc(item.row)+'">r'+esc(item.row)+'</button> '+esc(item.label)+' · c'+esc(item.column)+' · CellID '+esc(item.cellId)+' · VariableVID '+esc(item.variableVid)+'</div>'}).join("")+'</div></details>';
  }
}else{
  html+='<p class="fine">The rule translator script is unavailable; the unmodified source expression is preserved below.</p>';
}
html+='<details class="odpm-fold"'+(longRule?'':' open')+'><summary>Original EBA expression (unaltered)</summary>'+
  '<pre class="odpm-formula">'+esc(r.expression||"")+'</pre></details>'+
  '<button class="btn outline" style="margin:7px 0 12px" type="button" id="copyEbaExpression">Copy original EBA expression</button>';
if(r.description)html+='<details class="odpm-fold"'+(longRule?'':' open')+'><summary>Official EBA rule description</summary><p class="lead">'+esc(r.description)+'</p></details>';
html+='<details class="odpm-fold"'+(longRule?'':' open')+'><summary>Source formula row references ('+references.length+')</summary><div class="odpm-inline">'+
  references.map(function(row){return '<button class="odpm-link" type="button" data-row="'+esc(row)+'">r'+esc(row)+'</button>'}).join("")+'</div></details>'+
'<p class="fine" style="margin-top:13px">Current EBA rule activation/deactivation and severity are not determined from this DPM database alone. Verify the applicable official EBA rule-status package.</p>';
el("officialRuleDetail").innerHTML=html;
el("officialRuleDetail").querySelectorAll("[data-row]").forEach(function(b){b.onclick=function(){openOfficial(b.dataset.row);el("officialDetail").scrollIntoView({behavior:"smooth",block:"start"})}});
el("copyEbaExpression").onclick=function(){
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(r.expression||"").then(function(){el("copyEbaExpression").textContent="Expression copied";}).catch(function(){el("copyEbaExpression").textContent="Select and copy the original expression";});
  }else{
    el("copyEbaExpression").textContent="Select and copy the expression above";
    var source=el("officialRuleDetail").querySelector(".odpm-formula");
    if(source){source.parentElement.open=true;}
  }
};
}
function download(filename,mime,text){var u=URL.createObjectURL(new Blob([text],{type:mime})),a=document.createElement("a");a.href=u;a.download=filename;a.click();setTimeout(function(){URL.revokeObjectURL(u)},1000)}
el("officialCsv").onclick=function(){if(!db)return;var cols=["TableCode","CellCode","Row","Column","CellID","VariableVID","TableVID","MetricPropertyID","ContextID","MemberSignatures"];var values=rows().map(function(c){return [c.table_code||selectedTemplate,c.cell_code,c.row,c.column,c.cell_id,c.variable_vid,c.table_vid,c.variable&&c.variable.property_id,c.variable&&c.variable.context_id,(c.context_dimensions||[]).flatMap(function(d){return (d.item_categories||[]).map(function(x){return x.signature})}).join(";")]});var csv=[cols].concat(values).map(function(line){return line.map(function(x){return '"'+String(x==null?"":x).replace(/"/g,'""')+'"'}).join(",")}).join("\r\n");download("eba_corep_"+selectedTemplate.replace(/[^a-z0-9]/gi,"_")+"_official.csv","text/csv;charset=utf-8","\ufeff"+csv)};
el("officialJson").onclick=function(){
 if(!db)return;
 var out={source:db.source,module_versions:db.module_versions,
 table_versions:db.table_versions.filter(function(t){return t.code===selectedTemplate}),
 cells:rows(),limitations:db.limitations,
 validation_rules:selectedTemplate==="C_01.00"?db.validation_rules:[],
 scope_note:selectedTemplate==="C_01.00"?"Imported rules citing C 01.00":"Rule expressions not imported for this template yet"};
 download("eba_corep_"+selectedTemplate.replace(/[^a-z0-9]/gi,"_")+"_official.json",
  "application/json",JSON.stringify(out,null,2))
};
el("officialSearch").oninput=renderCells;
el("officialRuleSearch").oninput=renderRules;
el("officialRuleType").onchange=renderRules;
function loadSource(path){
 return fetch(path,{cache:"no-cache"}).then(function(r){if(!r.ok)throw Error("HTTP "+r.status+" for "+path);return r.json()});
}
loadSource("data/corep_of_multitemplate.json").then(function(d){multiTemplateLoaded=true;return d})
.catch(function(err){
 multiTemplateLoaded=false;
 console.warn("COREP multi-template extract unavailable; using C 01.00 only",err);
 return loadSource("data/corep_c0100_official.json");
}).then(function(data){
 if(!data||!data.source||data.source.reporting_family!=="COREP_OF"||!Array.isArray(data.cells)||
 !data.cells.length||!Array.isArray(data.table_versions)||!Array.isArray(data.validation_rules))
 throw Error("Unexpected EBA data structure");
 db=baseDb=data;
 var byVid=Object.fromEntries(data.table_versions.map(function(t){return [t.table_vid,t.code]}));
 data.cells.forEach(function(c){if(!c.table_code)c.table_code=byVid[c.table_vid]||"C_01.00"});
 var templates=data.table_versions.filter(function(t){return data.cells.some(function(c){return c.table_vid===t.table_vid})}).sort(function(a,b){return a.code.localeCompare(b.code)});
 el("officialTemplateSelect").innerHTML=templates.map(function(t){
   return '<option value="'+esc(t.code)+'">'+esc(t.code.replace("_"," "))+' — '+esc(t.name||"COREP")+'</option>'
 }).join("");
 selectedTemplate=templates.some(function(t){return t.code==="C_01.00"})?"C_01.00":templates[0].code;
 el("officialTemplateSelect").value=selectedTemplate;
 selectedRule=(rules().find(function(x){return x.code==="v0172_m"})||rules()[0]).operation_vid;
 el("officialStatus").textContent=multiTemplateLoaded?
  "EBA DPM 4.3 · "+templates.length+" template versions imported":"C 01.00 only · expanded extract pending";
 el("officialDatasetLink").href=multiTemplateLoaded?"data/corep_of_multitemplate.json":"data/corep_c0100_official.json";
 updateTemplate();
 loadSource("data/corep_creditrisk_manifest.json").then(function(manifest){
  if(!manifest||manifest.status!=="validated"||
   manifest.reporting_family!=="COREP_OF"||
   manifest.source?.zip_sha256!==baseDb.source.zip_sha256||
   !Array.isArray(manifest.templates))throw Error("Unverified or incompatible C05-C10 manifest");
  var extra=manifest.templates.filter(function(e){
   return /^C_(?:0[5-9]|10)\.\d{2}(?:\.\d+)?(?:\.[a-z])?$/.test(e.code)&&
    e.cell_count>0&&
    e.reportable_count>=0&&
    e.table_vid!=null&&
    e.file==="data/corep_creditrisk/"+e.code+".json";
  });
  if(extra.length!==manifest.templates.length)throw Error("C05-C10 manifest contains invalid template entries");
  creditManifest=manifest;
  extra.forEach(function(e){
   var opt=document.createElement("option");
   opt.value=e.code;
   opt.textContent=e.code.replace("_"," ")+" — "+e.name+" ("+e.cell_count+" cells)";
   el("officialTemplateSelect").appendChild(opt);
  });
  el("officialStatus").textContent="EBA DPM 4.3 · "+el("officialTemplateSelect").options.length+" templates available";
  el("officialTemplateNotice").textContent+=" · Plus "+extra.length+" C05–C10 templates available in selector";
 }).catch(function(err){
  console.warn("COREP C05-C10 manifest unavailable; only verified C01-C04 templates shown",err);
 });
 loadSource("data/corep_risks_manifest.json").then(function(manifest){
  if(!manifest||manifest.status!=="validated"||manifest.reporting_family!=="COREP_OF"||
  manifest.source?.release_code!=="4.3"||manifest.source?.zip_sha256!==baseDb.source.zip_sha256||
  !Array.isArray(manifest.templates))throw Error("Incompatible official C11-C25 manifest");
  var extra=manifest.templates.filter(function(e){return /^C_(?:1[1-9]|2[0-5])\\.\\d{2}(?:\\.\\d+)?(?:\\.[a-z])?$/.test(e.code)&&e.cell_count>0&&
    e.table_vid!=null&&e.file==="data/corep_risks/"+e.code+".json"});
  if(extra.length!==manifest.templates.length)throw Error("Unexpected official C11-C25 entries");
  riskManifest=manifest;
  extra.forEach(function(e){if(Array.from(el("officialTemplateSelect").options).some(function(o){return o.value===e.code}))return;
   var opt=document.createElement("option");opt.value=e.code;opt.textContent=e.code.replace("_"," ")+" — "+e.name+" ("+e.cell_count+" cells)";
   el("officialTemplateSelect").appendChild(opt);
  });
  el("officialStatus").textContent="EBA DPM 4.3 · "+el("officialTemplateSelect").options.length+" templates available";
 }).catch(function(err){console.info("C11-C25 not yet imported or source unavailable",err)});
 if(selectedTemplate==="C_01.00"){var retained=getCell("0130");if(retained){selectedCell=retained.cell_id;renderCells()}}
}).catch(function(err){
 el("officialStatus").textContent="Official extract unavailable";
 el("officialOrigin").textContent="Cannot load official EBA data: "+err.message;
 el("officialCellList").textContent="Please refresh after GitHub Pages has deployed the source data.";
});
})();
