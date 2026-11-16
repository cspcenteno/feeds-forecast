const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, 'Feed Sales Dashboard');
function write(file, data) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}
const sql = `with months as (
  select distinct year, m as month from public.budgets cross join generate_series(1,12) m
), monthly_budgets as (
  select make_date(b.year, m.month, 1) as month_date,
    b.region_id, b.subregion_id, b.customer_id, b.product_id,
    case when count(*) filter (where b.month is not null) > 0
      then sum(coalesce(b.volume,0)) filter (where b.month is not null)
      else sum(coalesce(b.volume,0)) / 12.0 end as volume
  from public.budgets b join months m on m.year=b.year and (b.month=m.month or b.month is null)
  group by b.year,m.month,b.region_id,b.subregion_id,b.customer_id,b.product_id
), facts as (
  select b.month_date,b.region_id,b.subregion_id,b.customer_id,b.product_id,
    'Budget' as record_type,0::numeric as quantity,b.volume
  from monthly_budgets b where b.customer_id is not null or not exists (
    select 1 from monthly_budgets d where d.month_date=b.month_date
      and d.region_id=b.region_id and d.product_id=b.product_id
      and d.subregion_id is not distinct from b.subregion_id and d.customer_id is not null)
  union all
  select date_trunc('month',date_trunc('week',make_date(f.year,1,4)::timestamp)
      + (f.week-1)*interval '7 days'+interval '3 days')::date,
    f.region_id,f.subregion_id,f.customer_id,f.product_id,'Forecast',coalesce(f.forecast,0),coalesce(f.volume,0)
  from public.sales_forecasts f where f.status='Approved'
  union all
  select date_trunc('month',a.actual_date)::date,a.region_id,a.subregion_id,a.customer_id,a.product_id,
    'Actual',0::numeric,coalesce(a.volume,0) from public.actuals a where a.actual_date is not null
)
select f.month_date as "MonthDate",coalesce(r.name,'Unassigned') as "Region",
  coalesce(s.name,'Unassigned') as "Area",
  coalesce(asm.full_name,'Unassigned ASM') as "ASM",
  coalesce(rsm.full_name,'Unassigned RSM') as "RSM",
  coalesce(nullif(trim(c.salesman),''),'Unassigned KAM') as "KAM",
  coalesce(c.customer,'Area budget') as "Customer",
  coalesce(concat_ws(' - ',p.code,p.name),'Unassigned product') as "Product",
  f.record_type as "RecordType",f.quantity as "Quantity",f.volume as "Volume"
from facts f left join public.regions r on r.id=f.region_id
left join public.subregions s on s.id=f.subregion_id
left join public.customers c on c.id=f.customer_id left join public.products p on p.id=f.product_id
left join lateral (select min(u.full_name) as full_name from public.users u
  where u.is_active and u.role='Manager' and u.position='ASM' and u.region_id=f.region_id) asm on true
left join lateral (select min(u.full_name) as full_name from public.users u
  where u.is_active and u.role='Manager' and u.position='RSM' and u.region_id=f.region_id and u.subregion_id=f.subregion_id) rsm on true`;
write('dashboard-source.sql', sql + ';\n');
const textCol = name => ({name,dataType:'string',sourceColumn:name,summarizeBy:'none'});
const dateCol = name => ({name,dataType:'dateTime',sourceColumn:name,formatString:'yyyy-MM-dd',summarizeBy:'none'});
const numCol = name => ({name,dataType:'double',sourceColumn:name,formatString:'#,0.00;(#,0.00);–',summarizeBy:'sum'});
const measure = (name,expression,formatString='#,0.00;(#,0.00);–') => ({name,expression,formatString,displayFolder:'Dashboard'});
const salesMeasures = [
  measure('Budget Volume',`COALESCE(CALCULATE(SUM(Sales[Volume]), Sales[RecordType] = "Budget"), 0)`),
  measure('Forecast Volume',`COALESCE(CALCULATE(SUM(Sales[Volume]), Sales[RecordType] = "Forecast"), 0)`),
  measure('Actual Volume',`COALESCE(CALCULATE(SUM(Sales[Volume]), Sales[RecordType] = "Actual"), 0)`),
  measure('Forecast Quantity',`COALESCE(CALCULATE(SUM(Sales[Quantity]), Sales[RecordType] = "Forecast"), 0)`),
  measure('Prior Year Actual',`VAR Months = SELECTCOLUMNS(VALUES('Month'[MonthDate]), "Previous", EDATE('Month'[MonthDate], -12)) RETURN CALCULATE([Actual Volume], REMOVEFILTERS('Month'), TREATAS(Months, 'Month'[MonthDate]))`),
  measure('Baseline Volume',`SWITCH(SELECTEDVALUE(Comparison[Comparison], "Budget vs Forecast"), "Forecast vs Actual", [Forecast Volume], [Budget Volume])`),
  measure('Measured Volume',`SWITCH(SELECTEDVALUE(Comparison[Comparison], "Budget vs Forecast"), "Budget vs Forecast", [Forecast Volume], [Actual Volume])`),
  measure('Variance',`[Measured Volume] - [Baseline Volume]`),
  measure('Achievement %',`DIVIDE([Measured Volume], [Baseline Volume])`,'0.0%;(0.0%);–'),
  measure('Forecast vs Budget %',`DIVIDE([Forecast Volume],[Budget Volume])`,'0.0%'),
  measure('Actual vs Forecast %',`DIVIDE([Actual Volume],[Forecast Volume])`,'0.0%'),
  measure('Actual vs Budget %',`DIVIDE([Actual Volume],[Budget Volume])`,'0.0%'),
  measure('Contribution Volume',`SWITCH(SELECTEDVALUE(Metric[Metric], "Actual"), "Budget", [Budget Volume], "Forecast", [Forecast Volume], [Actual Volume])`),
  measure('Comparison Title',`SELECTEDVALUE(Comparison[Comparison], "Budget vs Forecast") & " by Region (bags)"`,'@'),
  measure('Leading Region',`VAR Regions = ADDCOLUMNS(VALUES(Sales[Region]), "Amount", [Measured Volume]) RETURN CONCATENATEX(TOPN(1, Regions, [Amount], DESC, Sales[Region], ASC), Sales[Region], ", ")`,'@'),
  measure('Monthly Highlight',`VAR Gap = [Variance] RETURN SELECTEDVALUE(Comparison[Comparison], "Budget vs Forecast") & UNICHAR(10) & IF(ISBLANK([Achievement %]), "No positive baseline", FORMAT([Achievement %], "0.0%") & " achievement") & UNICHAR(10) & FORMAT(Gap, "+#,0.00;-#,0.00;0") & " bags variance"`,'@'),
];
let server='SET_DATABASE_HOST';
if(fs.existsSync('.env.local')) {
  const match=fs.readFileSync('.env.local','utf8').match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?https:\/\/([^.\s]+)\.supabase\.co/m);
  if(match) server=`db.${match[1]}.supabase.co`;
}
// Power Query strings escape quotes by doubling them, not with backslashes.
const mQuote = s => '"'+s.replaceAll('"','""')+'"';
const factsSource = `let\n    Source = PostgreSQL.Database(DatabaseServer, DatabaseName, [Query = ${mQuote(sql)}, CreateNavigationProperties = false]),\n    Typed = Table.TransformColumnTypes(Source, {{"MonthDate", type date}, {"Quantity", type number}, {"Volume", type number}})\nin\n    Typed`;
const table=(name,columns,expression,extra={})=>({name,columns,partitions:[{name,mode:'import',source:{type:'m',expression:expression.split('\n')}}],...extra});
const model={name:'Feed Sales Dashboard',compatibilityLevel:1567,model:{culture:'en-US',defaultPowerBIDataSourceVersion:'powerBI_V3',
  expressions:[
    {name:'DatabaseServer',kind:'m',expression:mQuote(server)+' meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]'},
    {name:'DatabaseName',kind:'m',expression:'"postgres" meta [IsParameterQuery=true, Type="Text", IsParameterQueryRequired=true]'},
  ],tables:[
    table('Sales',[dateCol('MonthDate'),...['Region','Area','ASM','RSM','KAM','Customer','Product','RecordType'].map(textCol),numCol('Quantity'),numCol('Volume')],factsSource,{measures:salesMeasures}),
    table('Month',[dateCol('MonthDate'),textCol('Month')],`let\n Dates = List.Transform({0..251}, each Date.AddMonths(#date(2020,1,1), _)),\n Rows = List.Transform(Dates, each {_, Date.ToText(_, "yyyy-MM")}),\n Result = #table(type table [MonthDate=date, Month=text], Rows)\nin Result`),
    table('Comparison',[textCol('Comparison')],'#table(type table [Comparison=text], {{"Budget vs Forecast"},{"Actual vs Budget"},{"Forecast vs Actual"}})'),
    table('Metric',[textCol('Metric')],'#table(type table [Metric=text], {{"Budget"},{"Forecast"},{"Actual"}})'),
  ],relationships:[{name:crypto.randomUUID(),fromTable:'Sales',fromColumn:'MonthDate',toTable:'Month',toColumn:'MonthDate'}],annotations:[{name:'__PBI_TimeIntelligenceEnabled',value:'0'}]}};
write('Feed Sales.SemanticModel/model.bim',model);
write('Feed Sales.SemanticModel/definition.pbism',{$schema:'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json',version:'4.0',settings:{}});
write('Feed Sales Dashboard.pbip',{$schema:'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json',version:'1.0',artifacts:[{report:{path:'Feed Sales.Report'}}],settings:{enableAutoRecovery:true}});
write('Feed Sales.Report/definition.pbir',{$schema:'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json',version:'4.0',datasetReference:{byPath:{path:'../Feed Sales.SemanticModel'}}});
const schema=(kind,version)=>`https://developer.microsoft.com/json-schemas/fabric/item/report/definition/${kind}/${version}/schema.json`;
const lit=v=>({expr:{Literal:{Value:typeof v==='string'?"'"+v.replaceAll("'","''")+"'":String(v)}}});
const color=c=>({solid:{color:lit(c)}});
const props=p=>[{properties:p}];
const field=(table,name,kind='Measure')=>({[kind]:{Expression:{SourceRef:{Entity:table}},Property:name}});
const proj=(table,name,kind='Measure')=>({field:field(table,name,kind),queryRef:`${table}.${name}`,nativeQueryRef:name});
const page='SalesDashboard'; let z=0;
const visualDirectory=path.join(root,'Feed Sales.Report','definition','pages',page,'visuals');
// This directory contains only the visuals generated by this script.
if(fs.existsSync(visualDirectory)) {
 for(const name of fs.readdirSync(visualDirectory)) {
  if(!/^[a-f0-9]{20}$/.test(name)) throw new Error('Unexpected visual directory');
  const directory=path.join(visualDirectory,name);
  fs.unlinkSync(path.join(directory,'visual.json'));
  fs.rmdirSync(directory);
 }
}
write('Feed Sales.Report/definition/version.json',{$schema:schema('versionMetadata','1.0.0'),version:'2.0.0'});
write('Feed Sales.Report/definition/pages/pages.json',{$schema:schema('pagesMetadata','1.0.0'),pageOrder:[page],activePageName:page});
write(`Feed Sales.Report/definition/pages/${page}/page.json`,{$schema:schema('page','2.0.0'),name:page,displayName:'Sales Performance Dashboard',displayOption:'FitToWidth',height:1296,width:1440,objects:{background:props({color:color('#F8FAFC'),transparency:lit(0)})}});
const theme={name:'Feed Sales',dataColors:['#D97706','#059669','#0284C7','#8B5CF6','#F43F5E','#14B8A6'],background:'#FFFFFF',foreground:'#0F172A',tableAccent:'#059669',textClasses:{label:{fontFace:'Segoe UI',fontSize:11,color:'#475569'},title:{fontFace:'Segoe UI Semibold',fontSize:14,color:'#0F172A'},callout:{fontFace:'Segoe UI Semibold',fontSize:30,color:'#0F172A'}},visualStyles:{'*':{'*':{visualHeader:[{show:false}],title:[{show:true,fontColor:{solid:{color:'#0F172A'}},fontSize:13,fontFamily:'Segoe UI Semibold'}]}},tableEx:{'*':{columnHeaders:[{fontColor:{solid:{color:'#475569'}},backColor:{solid:{color:'#F1F5F9'}},fontSize:11}],values:[{fontSize:11}]}},pivotTable:{'*':{columnHeaders:[{fontSize:11}],values:[{fontSize:10}]}}}};
write('Feed Sales.Report/StaticResources/RegisteredResources/FeedSalesTheme.json',theme);
write('Feed Sales.Report/definition/report.json',{$schema:schema('report','3.0.0'),themeCollection:{baseTheme:{name:'CY24SU10',reportVersionAtImport:{visual:'1.8.0',report:'3.0.0',page:'2.0.0'},type:'SharedResources'},customTheme:{name:'FeedSalesTheme',reportVersionAtImport:{visual:'1.8.0',report:'3.0.0',page:'2.0.0'},type:'RegisteredResources'}},resourcePackages:[{name:'SharedResources',type:'SharedResources',items:[{name:'CY24SU10',path:'BaseThemes/CY24SU10.json',type:'BaseTheme'}]},{name:'RegisteredResources',type:'RegisteredResources',items:[{name:'FeedSalesTheme',path:'FeedSalesTheme.json',type:'CustomTheme'}]}],settings:{useStylableVisualContainerHeader:true}});
function visual(type,title,x,y,w,h,roles={},objects={},vco={}){
 const name=crypto.createHash('sha256').update(`${type}:${title}:${x}:${y}`).digest('hex').slice(0,20);z+=1000;
 const v={visualType:type,objects,visualContainerObjects:{title:props({show:lit(Boolean(title)),text:lit(title),fontSize:lit(13),fontColor:color('#0F172A')}),background:props({show:lit(true),color:color('#FFFFFF'),transparency:lit(0)}),border:props({show:lit(true),color:color('#E2E8F0'),radius:lit(10)}),...vco},drillFilterOtherVisuals:true};
 if(Object.keys(roles).length)v.query={queryState:Object.fromEntries(Object.entries(roles).map(([role,ps])=>[role,{projections:ps}]))};
 const item={$schema:schema('visualContainer','2.0.0'),name,position:{x,y,z,width:w,height:h,tabOrder:z},visual:v};
 write(`Feed Sales.Report/definition/pages/${page}/visuals/${name}/visual.json`,item);return item;
}
function text(text,x,y,w,h,size=18,c='#0F172A'){
 return visual('textbox','',x,y,w,h,{}, {general:props({paragraphs:[{textRuns:[{value:text,textStyle:{fontFamily:'Segoe UI Semibold',fontSize:`${size}pt`,color:c}}]}]})});
}
text('Sales Performance Dashboard',24,18,770,66,22);
text('ALL REGIONS  •  VOLUME IN 50 KG BAGS',24,80,660,30,10,'#64748B');
function slicer(table,column,title,x,y,w,h,selection){
 const objects={data:props({mode:lit('Dropdown')}),header:props({show:lit(false)}),selection:props({singleSelect:lit(Boolean(selection)),selectAllCheckboxEnabled:lit(!selection)})};
 if(selection)objects.general=props({filter:{filter:{Version:2,From:[{Name:'s',Entity:table,Type:0}],Where:[{Condition:{In:{Expressions:[{Column:{Expression:{SourceRef:{Source:'s'}},Property:column}}],Values:[[{Literal:{Value:"'"+selection+"'"}}]]}}}]}}});
 return visual('slicer',title,x,y,w,h,{Values:[proj(table,column,'Column')]},objects);
}
slicer('Month','Month','Month',1010,18,196,88,'2026-11');
slicer('Sales','Region','Region',1220,18,196,88);
const cardData=[['Budget Volume','#D97706','#FFFBEB'],['Forecast Volume','#059669','#ECFDF5'],['Actual Volume','#0284C7','#F0F9FF']];
cardData.forEach(([m,c,bg],i)=>{
 visual('cardVisual',m.toUpperCase()+' · BAGS',24+i*468,124,456,130,{Data:[proj('Sales',m)]},{value:props({fontSize:lit(28),fontColor:color(c)}),label:props({show:lit(false)})},{background:props({show:lit(true),color:color(bg),transparency:lit(0)}),border:props({show:lit(true),color:color(c),radius:lit(10)})});
});
slicer('Comparison','Comparison','Compare volumes',24,270,684,80,'Budget vs Forecast');
slicer('Metric','Metric','Contribution metric',732,270,684,80,'Actual');
const tableObjects={columnHeaders:props({fontSize:lit(11),backColor:color('#F1F5F9'),autoSizeColumnWidth:lit(true)}),values:props({fontSize:lit(11),backColorPrimary:color('#FFFFFF'),backColorSecondary:color('#F8FAFC')})};
visual('tableEx','Regional Volume Performance',24,366,684,282,{Values:[proj('Sales','Region','Column'),...['Baseline Volume','Measured Volume','Variance','Achievement %'].map(m=>proj('Sales',m))]},tableObjects);
visual('clusteredColumnChart','Comparison by Region (bags)',732,366,684,282,{Category:[proj('Sales','Region','Column')],Y:['Baseline Volume','Measured Volume'].map(m=>proj('Sales',m))},{legend:props({show:lit(true),position:lit('Top')}),categoryAxis:props({show:lit(true)}),valueAxis:props({show:lit(true)}),dataPoint:[{selector:{metadata:'Sales.Baseline Volume'},properties:{fill:color('#D97706')}},{selector:{metadata:'Sales.Measured Volume'},properties:{fill:color('#059669')}}]},{title:props({show:lit(true),text:{expr:field('Sales','Comparison Title')},fontSize:lit(13)})});
visual('donutChart','Volume Contribution by Region',24,664,684,282,{Category:[proj('Sales','Region','Column')],Y:[proj('Sales','Contribution Volume')]},{legend:props({show:lit(true),position:lit('Right')}),labels:props({show:lit(true)})});
visual('cardVisual','Monthly Highlights',732,664,684,282,{Data:[proj('Sales','Leading Region'),proj('Sales','Monthly Highlight')]},{value:props({fontSize:lit(18)}),label:props({fontSize:lit(11)})});
visual('pivotTable','Monthly Sales · expand the sales structure',24,962,1392,306,{Rows:['Region','ASM','RSM','KAM','Customer','Product'].map(c=>proj('Sales',c,'Column')),Values:['Forecast Quantity','Forecast Volume','Budget Volume','Actual Volume','Prior Year Actual','Variance'].map(m=>proj('Sales',m))},{...tableObjects,rowHeaders:props({fontSize:lit(10),stepped:lit(true)}),rowTotal:props({fontColor:color('#0F172A'),backColor:color('#ECFDF5')})});
write('README.md',`# Feed Sales Dashboard\n\nOpen **Feed Sales Dashboard.pbip** in Power BI Desktop. This report uses the app's PostgreSQL database directly. No database credentials or private data snapshot are included.\n\n1. Transform data → Edit parameters: verify DatabaseServer and DatabaseName. Use the Supabase PostgreSQL host/pooler provided by your database settings if the direct host is unavailable.\n2. Refresh and enter your database credentials in Power BI. Use an authorized read-only reporting account with access to all regions. App role permissions do not automatically transfer to a PostgreSQL login.\n3. Save As → Power BI files (*.pbix).\n\nThe model is Import mode; Refresh reads current data from PostgreSQL. The report initially opens without cached data.\n\n## Calculation rules\nApproved forecasts only; ISO week is assigned to the month of its Thursday. Actuals use actual_date. Monthly budgets override annual budgets within the same region/subregion/customer/product; annual values are divided by 12. Generic product budgets are excluded where customer-specific budgets exist, matching the all-region dashboard's regional totals. Quantities and volumes remain separate. All volume measures are 50 kg bags.\n\nThe monthly matrix uses customer salesman and current regional ASM/RSM assignments. It includes budget/actual-only rows, unlike the web dashboard's forecast-led detail list. Card click navigation is represented by the comparison dropdown. Power BI native charts and matrix reproduce the layout while retaining filtering and drill-down.\n\nBefore publishing, validate database totals against the app for a selected month. Never publish this all-region report to regional users without configured Power BI RLS.\n`);
console.log(`Prepared Power BI project: ${root}`);
