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
      // DPM row-set selector: {(r0040, r0045, ...)}.
      // Only explicit row IDs are expanded. Ranges, nested selectors,
      // column groups and partial syntax remain unsupported.
      const raw=t.value.trim();
      if(raw.startsWith("(")){
        if(!/^\(\s*r\d{3,4}(?:\s*,\s*r\d{3,4})+\s*\)$/i.test(raw))
          fail("Unsupported row-set selector syntax: "+t.original.slice(0,110));
        const rows=raw.slice(1,-1).split(",").map(x=>x.trim().slice(1).padStart(4,"0"));
        if(new Set(rows).size!==rows.length)fail("Duplicate row within a row-set selector");
        if(!scope||!scope.table||!scope.column)
          fail("Row-set selector needs an explicit template and column in the with-scope");
        return {type:"row_set",original:t.original,
          members:rows.map(row=>({type:"ref",raw:"r"+row,table:scope.table,row,
            column:scope.column,defaultValue:scope.defaultValue,
            interval:scope.interval,unknown:[],original:"r"+row+" (row-set member)"}))};
      }
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
  if(ast.type==="row_set")return ast.members;
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
  if(ast.type==="row_set")return "each of "+ast.members.length+" selected cells";
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
    // Expanded row sets are supported only for element-wise >= 0 or <= 0
    // comparisons. We do not transform group references into sums or treat
    // default:null as a requirement for the bank to submit a numeric fact.
    const group=parsed.ast.type==="binary"&&parsed.ast.left.type==="row_set"?
      parsed.ast.left:null;
    if(group){
      const valid=["<=",">="].includes(parsed.ast.op)&&
        parsed.ast.right.type==="number"&&parsed.ast.right.value==="0"&&
        refs.length===group.members.length;
      if(!valid)result.reason.push("Row-set semantics supported only for a direct >= 0 or <= 0 comparison");
      if(parsed.scope?.defaultValue!=="null"||parsed.scope?.interval!=="false")
        result.reason.push("Row-set comparison requires verified default: null and interval: false scope");
      if(!result.reason.length){
        result.status="supported";
        const direction=parsed.ast.op==="<="?"less than or equal to":"greater than or equal to";
        const scopeName=group.members[0].table, col=group.members[0].column;
        result.plainEnglish="For each of the "+group.members.length+
          " selected reporting cells in "+scopeName+", column c"+col+
          ", the reported value must be "+direction+
          " zero when the EBA rule is applicable.";
        result.businessFormula="Each of "+group.members.length+" selected "+scopeName+
          " cells (c"+col+") "+parsed.ast.op+" 0; evaluated per selected cell, not as a sum.";
        result.technical.push("Row-set: "+group.members.length+" explicit, individually referenced rows. No aggregation or cross-row total is implied.");
        result.technical.push("default: null does not itself require reporting a numeric value. The official EBA engine determines how missing facts are handled.");
      }
    }else if(refs.some(r=>r.type==="ref")&&JSON.stringify(parsed.ast).includes('"type":"row_set"')){
      result.reason.push("Row-set selector is unsupported inside arithmetic, functions, or compound conditions");
    }else if(result.reason.length===0){
      result.status="supported";
      result.businessFormula=pretty(parsed.ast,"business");
      result.plainEnglish=sentence(pretty(parsed.ast,"plain"));
    }
    if(result.reason.length)result.reason=[...new Set(result.reason)];
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

/**
 * Compact, lossless rendering of an already-resolved AST using official row codes.
 * Scoped to the imported C_01.00 cells and column only: never invent XBRL IDs.
 * The source EBA expression remains authoritative for evaluation semantics.
 */
function simpleFormula(interpretation){
  if(!interpretation||interpretation.status!=="supported"||!interpretation.ast)return null;
  const refs=refsOf(interpretation.ast);
  if(!refs.length||refs.some(r=>!r.cellId||!r.row||!r.column||!r.table))return null;
  const tables=[...new Set(refs.map(r=>r.table))];
  const columns=[...new Set(refs.map(r=>r.column))];
  if(tables.length!==1||columns.length!==1)return null;
  function draw(node,parentPrec=0,side=""){
    if(node.type==="ref")return "r"+node.row;
    if(node.type==="number")return node.value;
    if(node.type==="unary"){
      const inner=draw(node.value,6);
      return node.op==="not"?"not "+inner:node.op+inner;
    }
    if(node.type==="call")return node.name+"("+node.args.map(v=>draw(v)).join(", ")+")";
    if(node.type==="conditional")return "if "+draw(node.condition)+" then "+draw(node.outcome)+" endif";
    if(node.type==="binary"){
      const prec=PREC[node.op];
      if(!prec)return null;
      const l=draw(node.left,prec,"left"),r=draw(node.right,prec,"right");
      if(l===null||r===null)return null;
      const parens=prec<parentPrec||(side==="right"&&prec===parentPrec);
      const text=l+" "+node.op+" "+r;
      return parens?"("+text+")":text;
    }
    return null;
  }
  const formula=draw(interpretation.ast);
  if(!formula)return null;
  return {formula,table:tables[0],column:columns[0],originalAvailable:true,
    note:"Cell amounts use the original EBA arithmetic signs. Rows marked (-) are not automatically subtracted again."};
}

/**
 * Safe presentation model for scoped DPM row-set comparisons.
 * Element-wise sign constraints only; not an executable regulatory validator.
 */
function rowSetStructure(interpretation){
  if(!interpretation||interpretation.status!=="supported")return null;
  const ast=interpretation.ast;
  if(!ast||ast.type!=="binary"||ast.left?.type!=="row_set"||
    !["<=",">="].includes(ast.op)||ast.right?.type!=="number"||ast.right.value!=="0")
    return null;
  const members=ast.left.members;
  if(!members.length||members.some(r=>r.cellId==null||!r.label||r.table!=="C_01.00"))
    return null;
  const scopes=[...new Set(members.map(r=>r.table+"|"+r.column))];
  if(scopes.length!==1)return null;
  return {kind:"row_set_comparison",operator:ast.op,threshold:0,
    count:members.length,table:members[0].table,column:members[0].column,
    defaultValue:members[0].defaultValue,interval:members[0].interval,
    members:members.map(r=>({row:r.row,column:r.column,label:r.label,
      cellId:r.cellId,variableVid:r.variableVid,table:r.table}))};
}

function summary(expressions,cells){
  const result={supported:0,requires_review:0,total:0,review_codes:[]};
  (expressions||[]).filter(r=>r.type==="validation").forEach(r=>{
    const entry=interpret(r.expression,cells);result.total++;
    result[entry.status]++;if(entry.status!=="supported")result.review_codes.push({code:r.code,reasons:entry.reason});
  });
  return result;
}
const api={tokenize,parse,interpret,summary,refsOf,readableStructure,rowSetStructure,simpleFormula,version:"1.3.0"};
if(typeof module==="object"&&module.exports)module.exports=api;
if(root)root.EbaRuleTranslator=api;
})(typeof window!=="undefined"?window:null);
