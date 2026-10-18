/* EBA DPM Rule Translator — deterministic parser for a documented expression subset.
 * Generated interpretations are NON-AUTHORITATIVE educational descriptions.
 * Original formula, published validity and complex semantics are always preserved.
 * No eval, no remote API and no language model involved.
 */
(function(root){
"use strict";
const PREC={"or":1,"and":2,"=":3,"==":3,"!=":3,"<>":3,"<":3,">":3,"<=":3,">=":3,"+":4,"-":4,"*":5,"/":5};
const RE_WORD=/^[a-zA-Z_][a-zA-Z_0-9]*/;
const RE_NUM=/^(?:\d+(?:\.\d+)?|\.\d+)%?/;
function fail(message){throw new Error(message)}
function tokenize(source){
  let pos=0;const out=[];
  while(pos<source.length){
    const s=source.slice(pos);const space=/^\s+/.exec(s);if(space){pos+=space[0].length;continue}
    if(s[0]==="{"){
      const end=source.indexOf("}",pos+1);if(end===-1)fail("Unclosed EBA cell reference");
      out.push({type:"ref",value:source.slice(pos+1,end),original:source.slice(pos,end+1)});
      pos=end+1;continue;
    }
    const num=RE_NUM.exec(s);if(num){out.push({type:"number",value:num[0]});pos+=num[0].length;continue}
    const word=RE_WORD.exec(s);if(word){out.push({type:"word",value:word[0].toLowerCase()});pos+=word[0].length;continue}
    const op=/^(?:<=|>=|!=|<>|==|[()+\-*/<>=,])/.exec(s);
    if(op){out.push({type:"symbol",value:op[0]});pos+=op[0].length;continue}
    fail("Unrecognised token near: "+s.slice(0,28));
  }
  out.push({type:"end",value:"<end>"});return out;
}
function reference(raw,scope){
  const parts=raw.split(",").map(x=>x.trim()).filter(Boolean);
  const result={raw:raw,table:null,row:null,column:null,defaultValue:null,interval:null,unknown:[]};
  for(const part of parts){
    if(/^t[A-Za-z]_[0-9]{2}\.[0-9]{2}(?:\.[a-z])?$/i.test(part))result.table=part.slice(1).toUpperCase();
    else if(/^r\d{3,4}$/i.test(part))result.row=part.slice(1).padStart(4,"0");
    else if(/^c\d{3,4}$/i.test(part))result.column=part.slice(1).padStart(4,"0");
    else if(/^default\s*:\s*(?:null|-?\d+(?:\.\d+)?)$/i.test(part))result.defaultValue=part.split(":")[1].trim().toLowerCase();
    else if(/^interval\s*:\s*(?:true|false)$/i.test(part))result.interval=part.split(":")[1].trim().toLowerCase();
    else result.unknown.push(part);
  }
  if(scope){
    result.table=result.table||scope.table;
    result.column=result.column||scope.column;
    if(result.defaultValue===null)result.defaultValue=scope.defaultValue;
    if(result.interval===null)result.interval=scope.interval;
  }
  return result;
}
function parse(source){
  if(typeof source!=="string"||!source.trim())fail("Empty expression");
  let expression=source.trim(),scope=null;
  const m=/^with\s*\{([^{}]*)\}\s*:\s*/i.exec(expression);
  if(m){
    scope=reference(m[1],null);
    if(scope.row)fail("A row selector in the global scope requires review");
    if(scope.unknown.length)fail("Unrecognised scope option: "+scope.unknown.join(", "));
    expression=expression.slice(m[0].length);
  }else if(/^with\b/i.test(expression))fail("Malformed with-scope expression");
  const tokens=tokenize(expression);let i=0;
  const peek=()=>tokens[i];const next=()=>tokens[i++];
  function need(value){if(peek().value!==value)fail("Expected '"+value+"' but found '"+peek().value+"'");next()}
  function prefix(){
    const t=next();
    if(t.type==="number")return {type:"number",value:t.value};
    if(t.type==="ref"){
      const ref=reference(t.value,scope);
      if(ref.unknown.length)fail("Unsupported cell reference selector(s): "+ref.unknown.join(", "));
      if(!ref.row)fail("Cell reference lacks a single explicit row: "+t.original);
      return {type:"ref",...ref,original:t.original};
    }
    if(t.value==="("){const inside=expr(0);need(")");return inside}
    if(t.value==="-"||t.value==="+")return {type:"unary",op:t.value,value:expr(6)};
    if(t.value==="not")return {type:"unary",op:"not",value:expr(6)};
    if(["abs","min","max","isnull"].includes(t.value)){
      need("(");const args=[];
      if(peek().value!==")"){args.push(expr(0));while(peek().value===","){next();args.push(expr(0))}}
      need(")");
      if((["abs","isnull"].includes(t.value)&&args.length!==1)||(["min","max"].includes(t.value)&&args.length<2))fail("Invalid argument count for "+t.value);
      return {type:"call",name:t.value,args};
    }
    if(t.value==="if"){
      const condition=expr(0);need("then");const outcome=expr(0);need("endif");
      return {type:"conditional",condition,outcome};
    }
    fail("Unsupported expression element: "+t.value);
  }
  function expr(min){
    let left=prefix();
    while(true){
      const tok=peek();const op=tok.value;const precedence=PREC[op];
      if(!precedence||precedence<min)break;
      next();const right=expr(precedence+1);
      left={type:"binary",op,left,right};
    }
    return left;
  }
  const ast=expr(0);
  if(peek().type!=="end")fail("Unparsed trailing expression near "+peek().value);
  return {scope,ast,original:source};
}
function refsOf(ast){
  if(!ast)return [];
  if(ast.type==="ref")return [ast];
  if(ast.type==="binary")return [...refsOf(ast.left),...refsOf(ast.right)];
  if(ast.type==="unary")return refsOf(ast.value);
  if(ast.type==="call")return ast.args.flatMap(refsOf);
  if(ast.type==="conditional")return [...refsOf(ast.condition),...refsOf(ast.outcome)];
  return [];
}
function lowerFirst(s){return s?s[0].toLowerCase()+s.slice(1):s}
function makeIndex(cells){
  const idx=new Map;
  (cells||[]).forEach(c=>{
    if(c&&c.row&&c.column&&c.table_vid!=null){
      const key="C_01.00|"+c.row+"|"+c.column;
      if(!idx.has(key))idx.set(key,c);
    }
  });
  return idx;
}
function labelOf(c){
  const headers=c?.headers?.row_header_id;
  return Array.isArray(headers)&&headers[0]?.label?headers[0].label:null;
}
function pretty(ast,mode){
  if(ast.type==="number")return ast.value;
  if(ast.type==="ref"){
    const raw=ast.label||ast.original;
    if(mode==="plain"&&ast.label){
      // Exact, dictionary-based transformation of an official row label.
      if(raw==="Profit or loss eligible")return "eligible profit or loss";
      return lowerFirst(raw);
    }
    return raw;
  }
  if(ast.type==="unary")return (ast.op==="not"?"not ":""+ast.op)+pretty(ast.value,mode);
  if(ast.type==="call")return ast.name+"("+ast.args.map(x=>pretty(x,mode)).join(", ")+")";
  if(ast.type==="conditional")return "if "+pretty(ast.condition,mode)+" then "+pretty(ast.outcome,mode);
  if(ast.type==="binary"){
    const left=pretty(ast.left,mode),right=pretty(ast.right,mode);
    if(mode==="plain"){
      const map={"=":" must equal ","==":" must equal ","!=":" must not equal ","<>":" must not equal ",
        "<":" must be less than ",">":" must be greater than ","<=":" must be less than or equal to ",
        ">=":" must be greater than or equal to ","+":" plus ","-":" minus ","*":" multiplied by ",
        "/":" divided by ","and":" and ","or":" or "};
      return left+(map[ast.op]||" "+ast.op+" ")+right;
    }
    return left+" "+ast.op+" "+right;
  }
  return "?";
}
function sentence(s){if(!s)return "";return s[0].toUpperCase()+s.slice(1)+(/[.!?]$/.test(s)?"":".")}
function interpret(expression,cells){
  const result={status:"requires_review",original:expression,plainEnglish:null,businessFormula:null,technical:[],
    references:[],reason:[],ast:null};
  try{
    const parsed=parse(expression);
    result.ast=parsed.ast;
    const refs=refsOf(parsed.ast),index=makeIndex(cells);
    for(const ref of refs){
      if(!ref.table||!ref.column){result.reason.push("Unresolved template/column scope for "+ref.original);continue}
      if(ref.table!=="C_01.00"){result.reason.push("Referenced template "+ref.table+" is not in the imported C_01.00 cell corpus");continue}
      const source=index.get(ref.table+"|"+ref.row+"|"+ref.column);
      if(!source){result.reason.push("No official cell metadata for "+ref.original);continue}
      const label=labelOf(source);
      if(!label){result.reason.push("Missing official EBA header label for "+ref.original);continue}
      ref.label=label;ref.cellId=source.cell_id;ref.variableVid=source.variable_vid;
    }
    const unique=new Map;
    refs.forEach(r=>{
      const id=[r.table,r.row,r.column].join("|");
      if(!unique.has(id))unique.set(id,{table:r.table,row:r.row,column:r.column,
        label:r.label||null,cellId:r.cellId??null,variableVid:r.variableVid??null,
        defaultValue:r.defaultValue,interval:r.interval});
    });
    result.references=[...unique.values()];
    const sc=parsed.scope;
    if(sc)result.technical.push("Global scope: "+[sc.table?"template "+sc.table:null,sc.column?"column c"+sc.column:null,
      sc.defaultValue!==null?"default: "+sc.defaultValue:null,sc.interval!==null?"interval: "+sc.interval:null].filter(Boolean).join("; ")+".");
    else result.technical.push("No global 'with' scope in source expression.");
    const deviations=[...new Set(refs.filter(r=>(r.defaultValue!==null&&r.defaultValue!==sc?.defaultValue)||(r.interval!==null&&r.interval!==sc?.interval))
      .map(r=>r.original+" (default: "+String(r.defaultValue)+", interval: "+String(r.interval)+")"))];
    if(deviations.length)result.technical.push("Resolved cell-level evaluation settings: "+deviations.slice(0,7).join("; ")+".");
    result.technical.push(refs.length+" cell reference(s), "+result.references.length+" distinct reference(s).");
    result.technical.push("Scope options 'default' and 'interval' are preserved from EBA syntax; this explanation does not itself execute EBA filing/interval semantics.");
    result.technical.push("Cell labels and DPM IDs come from imported official C_01.00 metadata; original EBA formula is authoritative.");
    if(result.reason.length===0){
      result.status="supported";
      result.businessFormula=pretty(parsed.ast,"business");
      result.plainEnglish=sentence(pretty(parsed.ast,"plain"));
    }else result.reason=[...new Set(result.reason)];
  }catch(err){result.reason.push(err.message)}
  return result;
}

/**
 * Presentation metadata for long, fully-resolved additive EBA equations.
 * An algebraic plus sign means adding the REPORTED cell amount, even for rows
 * officially marked (-); never invert a term merely because of its label.
 */
function readableStructure(interpretation){
  const ast=interpretation&&interpretation.ast;
  if(!interpretation||interpretation.status!=="supported"||!ast)return null;
  if(ast.type!=="binary"||!["=","=="].includes(ast.op)||ast.left.type!=="ref")return null;
  const terms=[];
  function flatten(node,sign){
    if(node.type==="binary"&&node.op==="+"){return flatten(node.left,sign)&&flatten(node.right,sign)}
    if(node.type==="binary"&&node.op==="-"){return flatten(node.left,sign)&&flatten(node.right,-sign)}
    if(node.type==="unary"&&node.op==="-")return flatten(node.value,-sign);
    if(node.type==="ref"&&node.label&&node.cellId!=null){
      terms.push({row:node.row,column:node.column,table:node.table,
        label:node.label,cellId:node.cellId,variableVid:node.variableVid,coefficient:sign,
        markedDeduction:/^\s*\(-\)/.test(node.label)});
      return true;
    }
    return false;
  }
  if(!flatten(ast.right,1)||terms.length<2)return null;
  const long=terms.length>=7;
  const lhs=ast.left;
  const name=lhs.label===lhs.label.toUpperCase()?
    lhs.label.toLowerCase().replace(/^./,c=>c.toUpperCase()):lhs.label;
  const hasSigned=terms.some(x=>x.markedDeduction);
  const signedCount=terms.filter(x=>x.markedDeduction).length;
  const simple=terms.length<=6;
  const shortPlain=long?
    name+" (r"+lhs.row+") must equal the algebraic sum of "+terms.length+
      " reported line items in "+lhs.table+", column c"+lhs.column+".":
    interpretation.plainEnglish;
  const caution=hasSigned?
    "The "+signedCount+" row(s) labelled (-) identify deduction items. This formula adds each REPORTED value with its algebraic sign; do not automatically subtract those rows again.":"";
  return {kind:"additive",long:long,termCount:terms.length,terms:terms,
    lhs:{row:lhs.row,column:lhs.column,label:lhs.label,cellId:lhs.cellId,
      variableVid:lhs.variableVid},shortPlain:shortPlain,caution:caution,
    sourceOperator:"=",signedMarkedCount:signedCount};
}

function summary(expressions,cells){
  const result={supported:0,requires_review:0,total:0,review_codes:[]};
  (expressions||[]).filter(r=>r.type==="validation").forEach(r=>{
    const entry=interpret(r.expression,cells);result.total++;
    result[entry.status]++;if(entry.status!=="supported")result.review_codes.push({code:r.code,reasons:entry.reason});
  });
  return result;
}
const api={tokenize,parse,interpret,summary,refsOf,readableStructure,version:"1.1.0"};
if(typeof module==="object"&&module.exports)module.exports=api;
if(root)root.EbaRuleTranslator=api;
})(typeof window!=="undefined"?window:null);
