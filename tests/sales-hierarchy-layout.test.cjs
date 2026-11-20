const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');const ts=require('typescript');const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
const originalResolve=Module._resolveFilename;
Module._resolveFilename=function(specifier,parent,...rest){let target=specifier.startsWith('file:')?require('node:url').fileURLToPath(specifier):specifier.startsWith('@/')?path.join(process.cwd(),specifier.slice(2)):specifier;if(target.endsWith('.ts')&&!fs.existsSync(target)&&fs.existsSync(target+'x'))target+='x';return originalResolve.call(this,target,parent,...rest)};
const options={module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022};
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:options}).outputText,filename);
const {SalesHierarchyTable}=require('../components/ui/sales-hierarchy-table.tsx');
const {TableActionButton}=require('../components/ui/table-action-button.tsx');

test('shared table preserves Action, Status and all monthly reference headers with accessible icon-only actions',()=>{
  const html=renderToStaticMarkup(React.createElement(SalesHierarchyTable,{label:'Sales',emptyMessage:'No data',summary:{records:1},rows:[
    {key:'week',kind:'week',label:'Week 49, 2026'},
    {key:'kam',kind:'group',depth:0,label:'KAM A',status:'Draft',values:[1,1,100,90,80,2],expanded:true,onToggle:()=>{},actions:React.createElement(TableActionButton,{action:'submit',compact:true,title:'Submit KAM forecasts'})},
    {key:'product',kind:'product',depth:2,label:'Long product name',values:[1,1,100,90,80,2]},
  ]}));
  const headers=[...html.matchAll(/<th\b[^>]*scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map(match=>match[1].replace(/<[^>]*>/g,''));
  assert.deepEqual(headers,['Action','Status','Sales Structure','Area','Forecast(Qty.)','Volume(50kg)','Budget(Vol.)','Actual(Cum. Vol.)','Actual(Prev. Mo.)','Forecast(Cum. Vol.)']);
  assert.match(html,/colSpan="10"/i);
  assert.match(html,/aria-expanded="true"/);
  assert.match(html,/aria-label="Submit KAM forecasts"/);
  assert.match(html,/data-action-label="[^"]*" style="display:none"/);
  const dashboard=renderToStaticMarkup(React.createElement(SalesHierarchyTable,{showActions:false,showStatus:false,label:'Monthly',emptyMessage:'Empty',summary:{records:0},rows:[]}));
  assert.match(dashboard,/colSpan="8"/i);
  assert.doesNotMatch(dashboard,/>Action<|>Status</);
});

// Exercise the actual page adapter without its authenticated data-loading hooks.
const source=fs.readFileSync(path.join(process.cwd(),'components/sales-submissions-page.tsx'),'utf8');
const file=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let builder;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='reviewHierarchyRows')builder=node.getText(file);ts.forEachChild(node,visit)}visit(file);
const compiled=ts.transpileModule(builder,{compilerOptions:options}).outputText;
function fixture(flags){
  const items=[['kam-a','rsm-a',1],['kam-b','rsm-a',2],['kam-c','rsm-b',3]].map(([submitted_by,endorsed_by,id])=>({id,customer_id:id,product_id:id,region_id:1,subregion_id:1,submitted_by,endorsed_by,asm_id:'asm',asm_name:'ASM A',forecast:10,volume:10,status:flags.weekly===false?'Pending':'Approved',year:2026,week:49}));
  const key=(...parts)=>JSON.stringify(parts);
  const context={weekly:true,weeklyAsmLevel:false,customerOnly:false,nestedKamGroups:false,groupByEndorser:false,stage:'Pending',canShowActions:false,...flags,
    weekGroups:[{key:'49',year:2026,week:49,customers:items.map(item=>({key:'customer-'+item.id,customer_id:item.customer_id,items:[item],forecast:10,volume:10,products:[{key:'product-'+item.id,product_id:item.product_id,items:[item],forecast:10,volume:10}]}))}],
    getWeekDateLabel:()=> 'Nov 30 - Dec 06',getAreaName:()=> 'Area',getSubmittedByName:id=>id,getCustomerName:id=>'Customer '+id,getProductName:id=>'Product '+id,
    getReviewGroupId:item=>flags.groupByEndorser?item.endorsed_by:item.submitted_by,
    getReviewGroupKey:(week,id)=>key(week,'review',id),getKamGroupKey:(week,item)=>key(week,'kam',item.endorsed_by,item.submitted_by),getAsmGroupKey:week=>key(week,'asm'),
    expandedGroups:{has:()=>true},toggleGroup:()=>{},referencesLoading:false,referencesError:false,teamReferences:{get:()=>({budget_volume:100,actual_volume:90,previous_actual_volume:80,forecast_volume:20})},monthlyReferenceKey:key,
    getCustomerMonthlyBudget:()=>100,getCustomerMonthlyActual:()=>90,getCustomerForecastMonthlyTotal:()=>20,getSavedBudgetVolume:()=>100,getSavedActualMonthly:()=>90,getSavedForecastMonthly:()=>20,
    weeklyBudget:value=>value/4,getMonthForWeek:()=>12,StatusBadge:()=>null,ActionButtons:()=>React.createElement('button',null,'Action'),
  };
  return {context,run:()=>new Function('context','require','exports',`with(context){${compiled};return reviewHierarchyRows()}`)(context,require,{})};
}

test('role adapters retain weekly hierarchy and collapse hides all descendants',()=>{
  for(const [flags,expectedDepth,groups] of [
    [{customerOnly:true},1,3],
    [{},2,6],
    [{nestedKamGroups:true,groupByEndorser:true},3,8],
    [{nestedKamGroups:true,groupByEndorser:true,weeklyAsmLevel:true},4,9],
    [{weekly:false,canShowActions:true},2,6],
    [{weekly:false,canShowActions:true,nestedKamGroups:true,groupByEndorser:true,stage:'Endorsed'},3,8],
  ]){
    const {context,run}=fixture(flags);const rows=run();
    assert.equal(rows[0].kind,'week');assert.equal(Math.max(...rows.map(row=>row.depth??0)),expectedDepth);
    assert.equal(rows.filter(row=>row.kind==='group').length,groups);
    assert.equal(rows.filter(row=>row.kind==='product').length,3);
    assert.ok(rows.filter(row=>row.kind!=='week').every(row=>row.values.length===6));
    context.expandedGroups={has:()=>false};
    assert.equal(run().filter(row=>row.kind==='product').length,0);
  }
});

test('Supervisor and SV Weekly Sales use the same RSM hierarchy as ASM',()=>{
  const names=['customerOnly','weeklyKamLevel','weeklyAsmLevel','nestedKamGroups','groupByEndorser']
  const initializers={}
  function collect(node){if(ts.isVariableDeclaration(node)&&names.includes(node.name.getText(file)))initializers[node.name.getText(file)]=node.initializer.getText(file);ts.forEachChild(node,collect)}collect(file)
  const getFlags=(userRole,reviewPosition)=>new Function('context',`with(context){${names.map(name=>'const '+name+'='+initializers[name]+';').join('')}return {${names.join(',')}}}`)({userRole,reviewPosition,weekly:true,stage:'Pending'})
  const asm=getFlags('Manager','ASM')
  for(const position of ['Supervisor','SV']){
    const flags=getFlags('Superuser',position)
    assert.deepEqual(flags,asm)
    const rows=fixture(flags).run()
    assert.match(rows[1].label,/^RSM:/)
    assert.equal(Math.max(...rows.map(row=>row.depth??0)),3)
  }
})

test('ASM Approvals shows Status and Area only on RSM rows',()=>{
  const rows=fixture({weekly:false,canShowActions:true,nestedKamGroups:true,groupByEndorser:true,stage:'Endorsed'}).run()
  for(const row of rows.filter(row=>row.kind!=='week')){
    if(String(row.label).startsWith('RSM:')){assert.ok(row.status);assert.equal(row.area,'Area')}
    else {assert.equal(row.status,undefined);assert.ok(!row.area)}
  }
  const rsmRows=fixture({weekly:false,canShowActions:true,stage:'Pending'}).run()
  assert.ok(rsmRows.find(row=>String(row.label).startsWith('KAM:')).status)
})

test('Admin and NSM Weekly Sales omit KAM areas while retaining ASM and RSM areas',()=>{
  const rows=fixture({weeklyAsmLevel:true,nestedKamGroups:true,groupByEndorser:true}).run()
  for(const row of rows.filter(row=>row.kind==='group')){
    if(String(row.label).startsWith('ASM:')||String(row.label).startsWith('RSM:'))assert.equal(row.area,'Area')
    if(String(row.label).startsWith('KAM:'))assert.equal(row.area,'')
  }
  assert.equal(fixture({}).run().find(row=>String(row.label).startsWith('KAM:')).area,'Area')
})

const savedSource=fs.readFileSync(path.join(process.cwd(),'app/(authenticated)/forecasts/page.tsx'),'utf8');
const savedFile=ts.createSourceFile('saved.tsx',savedSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let savedBuilder;function visitSaved(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='savedHierarchyRows')savedBuilder=node.getText(savedFile);ts.forEachChild(node,visitSaved)}visitSaved(savedFile);
const savedCompiled=ts.transpileModule(savedBuilder,{compilerOptions:options}).outputText;
test('Saved Forecasts combines month, region and status filters',()=>{
  let predicate
  function find(node){if(ts.isVariableDeclaration(node)&&node.name.getText(savedFile)==='visibleSavedForecasts')predicate=node.initializer.arguments[0].getText(savedFile);ts.forEachChild(node,find)}find(savedFile)
  const forecasts=[
    {id:1,year:2026,week:49,region_id:1,status:'Draft'},
    {id:2,year:2026,week:50,region_id:2,status:'Pending'},
    {id:3,year:2025,week:49,region_id:1,status:'Draft'},
    {id:4,year:2026,week:48,region_id:1,status:'Approved'},
    {id:5,year:2026,week:48,region_id:1,status:'Draft'},
  ]
  const {savedForecastMatchesStatus}=require('../lib/saved-forecast-status.ts')
  const context={forecasts,isAdmin:true,customerAssignmentRestricted:false,customers:[],savedForecastMatchesStatus,
    savedMonthFilter:'2026-12',effectiveSavedRegion:'1',savedStatusFilter:'',getMonthForWeek:(_year,week)=>week>=49?12:11}
  const ids=()=>new Function('context',`with(context){return (${predicate})().map(item=>item.id)}`)(context)
  assert.deepEqual(ids(),[1])
  context.effectiveSavedRegion='all';assert.deepEqual(ids(),[1,2])
  context.savedMonthFilter='2026-11';context.savedStatusFilter='all';assert.deepEqual(ids(),[4,5])
  context.savedMonthFilter='';context.savedStatusFilter='';assert.deepEqual(ids(),[1,2,3,5])
  context.effectiveSavedRegion='';assert.deepEqual(ids(),[])
})
const {canReviseRsmForecast}=require('../lib/rsm-returned-forecasts.ts');
test('Saved Forecasts keeps KAM and customer actions scoped to existing role permissions',()=>{
  for(const mode of ['admin','rsm','kam','readonly']){
    let deletion
    const allowed=mode!=='readonly';const grouped=mode!=='kam';
    const items=[1,2].map(id=>({id,user_id:'kam-'+id,customer_id:id,region_id:1,subregion_id:10,year:2026,week:49,forecast:10,volume:10,status:'Draft',returned_at:'2026-11-19'}));
    const context={savedWeekGroups:[{key:'49',year:2026,week:49,customers:items.map(item=>({key:'customer-'+item.id,customer_id:item.customer_id,items:[item],products:[{key:'product-'+item.id,product_id:item.id,forecast:10,volume:10,budget:100,actualMonthly:90,actualPreviousMonth:80,forecastMonthly:20}]}))}],
      isAdmin:mode==='admin',isRsmSavedViewer:mode==='rsm',groupSavedByKam:grouped,canSubmitForecasts:allowed,role:mode==='rsm'?'Manager':'User',salesPosition:mode==='rsm'?'RSM':'KAM',userId:mode==='rsm'?'rsm':'kam-1',assignedRegionId:1,assignedSubregionId:10,
      regions:[{id:1,name:'Region'}],subregions:[{id:10,name:'Area'}],savedOwnerNames:{'kam-1':'KAM 1','kam-2':'KAM 2'},authorization:{can:()=>allowed},loading:false,savedActualsLoading:false,savedActualsError:false,forecastLoadError:false,
      collapsedKams:new Set(),expandedCustomers:new Set(['customer-1','customer-2']),savedKamGroupKey:(week,owner)=>week+'-'+owner,monthlyReferenceKey:(...parts)=>JSON.stringify(parts),savedMonthlyReferences:{get:()=>({budget_volume:100,actual_volume:90,previous_actual_volume:80,forecast_volume:20})},
      getCustomerName:id=>'Customer '+id,getProductName:id=>'Product '+id,getWeekDateLabel:()=> 'Nov 30 - Dec 06',getMonthForWeek:()=>12,weeklyBudget:value=>value/4,
      savedStatusLabels:{Draft:'Draft'},StatusBadge:()=>null,TableActionButton,canReviseRsmForecast,isEditableForecast:()=>true,canDeleteSavedForecastStatus:status=>status==='Draft',
      canSubmitItem:item=>allowed&&item.status==='Draft'&&(grouped||item.user_id==='kam-1'),handleEditCustomer:()=>{},handleDeleteMany:(...args)=>{deletion=args},handleSubmitCustomer:()=>{},setCollapsedKams:()=>{},toggleCustomer:()=>{},
    };
    const run=()=>new Function('context','require','exports',`with(context){${savedCompiled};return savedHierarchyRows()}`)(context,require,{});
    const rows=run();assert.equal(rows[0].kind,'week');assert.equal(rows.filter(row=>row.kind==='product').length,2);
    if(grouped){assert.equal(rows.filter(row=>String(row.label).startsWith('KAM:')).length,2);assert.equal(rows.find(row=>String(row.label).startsWith('KAM:')).actions!==null,allowed);}
    const actions=rows.filter(row=>row.actions).map(row=>renderToStaticMarkup(React.createElement(React.Fragment,null,row.actions))).join('');
    if(mode==='readonly')assert.doesNotMatch(actions,/<button/);else assert.match(actions,/aria-label="Submit/);
    const kamActions=rows.filter(row=>String(row.label).startsWith('KAM:')).map(row=>renderToStaticMarkup(React.createElement(React.Fragment,null,row.actions))).join('')
    if(mode==='admin'){
      assert.match(kamActions,/aria-label="Delete KAM drafts"/)
      const first=context.savedWeekGroups[0].customers[0]
      context.savedWeekGroups[0].customers.push({...first,key:'approved',items:[{...items[0],id:99,status:'Approved'}],products:[]})
      const kam=run().find(row=>String(row.label)==='KAM: KAM 1')
      const button=React.Children.toArray(kam.actions.props.children).find(child=>child.props.action==='delete')
      button.props.onClick()
      assert.deepEqual(deletion[0].map(item=>item.id),[1])
      assert.equal(deletion[1],'kam')
      assert.equal(deletion[2],'KAM 1')
    }else assert.doesNotMatch(kamActions,/Delete KAM drafts/)
    if(grouped){context.collapsedKams=new Set(['49-kam-1','49-kam-2']);assert.equal(run().length,3);}
  }
});


