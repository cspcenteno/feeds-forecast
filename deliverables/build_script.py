from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pathlib import Path

out = Path(__file__).parent
doc = Document()
sec = doc.sections[0]
sec.top_margin = sec.bottom_margin = Inches(.7)
sec.left_margin = sec.right_margin = Inches(.8)
sec.page_width, sec.page_height = Inches(8.27), Inches(11.69)
for name in ['Normal','Title','Subtitle','Heading 1','Heading 2']:
    s=doc.styles[name]; s.font.name='Calibri'; s.font.color.rgb=RGBColor(0,0,0)
doc.styles['Normal'].font.size=Pt(11)
doc.styles['Normal'].paragraph_format.space_after=Pt(6)
doc.styles['Normal'].paragraph_format.line_spacing=1.08
doc.styles['Title'].font.size=Pt(25)
doc.styles['Heading 1'].font.size=Pt(17)
doc.styles['Heading 2'].font.size=Pt(13)
for name in ['Heading 1','Heading 2']:
    doc.styles[name].paragraph_format.space_before=Pt(12)
    doc.styles[name].paragraph_format.space_after=Pt(6)

def p(t): doc.add_paragraph(t)
def label(k,t):
    a=doc.add_paragraph(); a.add_run(k+'  ').bold=True; a.add_run(t)
def section(title,say,do,check,discuss=None):
    doc.add_heading(title,2)
    label('Say',say)
    label('Demonstrate',do)
    label('Verify',check)
    if discuss: label('Discuss',discuss)
def page(title):
    doc.add_page_break(); doc.add_heading(title,1)

doc.add_paragraph('Feed Sales Forecast', 'Title')
doc.add_paragraph('Stakeholder demonstration script', 'Subtitle')
p('A complete walkthrough of the modules, role logins, forecast review process, and reporting. Use the spoken script while demonstrating each screen, then record the results of the verification steps.')
label('Estimated duration','30 to 45 minutes, excluding detailed stakeholder questions.')
doc.add_heading('Preparation',1)
p('Prepare the following accounts and confirm their saved permissions. The access described here reflects default role permissions; individual account permissions may differ. Use demo records when making changes.')
rows=[('Admin','All setup, permissions, master data, and audit logs'),('Superuser / Supervisor or SV','Operational data maintenance and week controls'),('User / KAM','Forecast entry, drafts, revision, and submission'),('Manager / RSM','Pending forecast review and endorsement'),('Manager / ASM','Endorsed forecast review and approval'),('Manager / NSM','Dashboard and consolidated Weekly Sales')]
t=doc.add_table(rows=1, cols=2); t.columns[0].width=Inches(2); t.columns[1].width=Inches(4.6)
t.rows[0].cells[0].text='Login'; t.rows[0].cells[1].text='Demonstration focus'
for a,b in rows:
    c=t.add_row().cells;c[0].text=a;c[1].text=b
for i,row in enumerate(t.rows):
    for cell in row.cells:
        tcPr=cell._tc.get_or_add_tcPr(); borders=OxmlElement('w:tcBorders')
        for edge in ['top','left','bottom','right']:
            e=OxmlElement('w:'+edge);e.set(qn('w:val'),'single');e.set(qn('w:sz'),'4');e.set(qn('w:color'),'D9D9D9');borders.append(e)
        tcPr.append(borders)
        shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'E8EDF2' if i==0 else 'FFFFFF');tcPr.append(shade)
        for para in cell.paragraphs:
            para.paragraph_format.space_before=Pt(5);para.paragraph_format.space_after=Pt(5)
            if i==0:
                for r in para.runs:r.bold=True
p('Choose one customer, product, region, subregion, and open forecast week. Prepare a matching budget and actual sales reference. Follow the same forecast from draft through approval so stakeholders can see each handoff.')
doc.add_heading('1 Opening',1)
p('Good morning, everyone. Today, I will demonstrate the Feed Sales Forecast system module by module. We will follow the process from maintaining reference data to preparing, reviewing, and approving forecasts, then monitoring the results against budgets and actual sales.')
p('I will log in using different roles so we can check the modules, actions, and records available to each user. As we go through the system, please confirm whether the workflow matches our business process.')

page('Admin login and system setup')
section('2 Login and navigation','Access starts with an individual account. The role, sales position, assigned area, and module permissions determine access. I am starting as Admin so we can see the full setup before comparing it with the other roles.','Log in as Admin. Show the profile role, Main Menu, Master Data, and Administration groups.','The correct account is displayed and the expected Admin modules appear.')
section('3 Users','The Users module controls accounts and access. We assign a role and sales position, then the applicable region and subregion. Permissions control viewing, adding, editing, importing, exporting, and deleting where supported. Role defaults provide a starting point, and authorized administrators can customize permissions.','Open a demo user. Show role, position, area assignment, active status, permission checkboxes, and dashboard configuration where available.','Each demonstration account has the intended role, position, area, and saved permissions.','Who approves new accounts and access changes? Who updates assignments when responsibilities change?')
section('4 Regions and Subregions','These modules define the sales coverage structure. Regions provide the main grouping and subregions provide a more detailed area assignment. Accurate assignments help users see the appropriate records and managers review the correct submissions.','Open Regions, then Subregions. Show how the sample subregion relates to its region.','The demonstration accounts and sample records use the intended area assignments.','Does the structure match the sales organization, and who maintains it?')
section('5 Categories','Categories organize products into consistent classifications. This helps users find products and supports grouped reporting.','Open Categories and locate the category used by the sample product.','The category exists and is correctly named.')

page('Master data and performance references')
section('6 Products','Products maintains the feed items used in forecasts and sales records. Codes and names identify the item. Category, product line, and species support classification. Product weight supports consistent volume calculations. Quantities and standardized volume should be reviewed separately; forecast volume is expressed in 50 kilogram bag equivalents.','Show the sample product code, name, category, product line, species, and weight.','The demonstration product has the correct code, classification, and weight.','Who maintains product details and validates weights?')
section('7 Customers','Customers maintains the accounts used in forecast preparation. Customer details and sales assignments help organize records and reports. These details need updating when an account moves between representatives or areas.','Show the sample customer, salesman or KAM information, segment, and area fields.','The sample customer appears under the intended sales assignment.')
section('8 Budgets','Budgets stores the targets used for performance comparisons. The system supports annual and monthly budget references. A matching monthly budget takes priority over the annual monthly allocation. We will use the budget corresponding to our demonstration forecast.','Show the selected period and sample budget. Point out the entry and import actions available to this account.','The budget uses the intended period, customer, product, and reporting scope.','Who owns budget preparation and updates? How should revised targets be authorized?')
section('9 Actuals','Actuals stores recorded sales performance. Authorized users can maintain records and import actual sales, including the supported Oracle format. Accurate dates, customer and product references, and volumes make forecast comparisons meaningful.','Show a sample actual sales record and the available import function. Identify the source of the demonstration data.','The sample record agrees with its source.','How often will actual sales be updated, and who reconciles the data?')

page('Operational controls and KAM forecast entry')
section('10 Week Locks','Week Locks controls which forecast weeks are open for changes. Authorized Admin and Superuser accounts can lock a week or temporarily reopen it for 24 hours, with a reason. This supports deadlines and controlled corrections.','Show an open week and a locked week. Point out Lock week and Reopen for 24 hours. Keep the demonstration week open.','The selected demo week is open. Use a separate locked week to verify restrictions.','Who can authorize reopening a week?')
section('11 Superuser login','I am now using the Superuser account for operational support. By default, this role can maintain customers, budgets, and actuals, view products, manage week locks, and access Dashboard and Weekly Sales. Weekly Sales export is also available.','Log out and log in as Superuser. Open Customers, Budgets, Actuals, Week Locks, and Weekly Sales.','Expected maintenance actions and Actuals import are available. Weekly Sales export is available. Users and Audit Logs remain unavailable unless specifically granted.')
section('12 KAM login and forecast preparation','I am now logged in as a KAM, the person preparing the forecast. The Forecasts module lets the user choose a customer, product, and week, then enter expected sales volume. A draft allows preparation and review before submission. Budget and sales references help assess whether the proposed volume is reasonable.','Log in as User / KAM. Confirm Dashboard, Forecasts, and Weekly Sales. In Forecasts, choose the sample customer, product, and open week. Enter a volume, save a draft, reopen it, edit it, and show the available references.','The draft retains the values and the customer and product are correct. Editing and deletion follow the status restrictions. A locked week prevents the restricted forecast action.')
label('Say before submission','Before submission, the system summarizes the records, customers, products, and total volume. Once confirmed, the forecast moves to Pending status for RSM review.')
label('Demonstrate','Submit the forecast, review the confirmation summary, and confirm the Pending status.')

page('Forecast review and approval')
section('13 RSM login and return','The RSM reviews Pending submissions within the assigned area. The reviewer checks customer and product details, volumes, and available references before endorsing the forecast or returning it for revision. A return reason explains the required correction.','Log in as Manager / RSM. Open Approvals and find the KAM submission. Return it with a reason such as Please confirm the expected customer order volume.','The correct record is returned and the reason is recorded. Records are limited to the intended review scope.')
section('14 KAM revision and RSM endorsement','The KAM can identify the returned forecast, read the feedback, and correct the entry. After revision, the forecast is submitted again for RSM review. Once satisfied, the RSM endorses it for the ASM approval stage.','Log back in as KAM. Show the return notice, review the reason, revise the volume, and resubmit. Switch to RSM, review the revised record, and endorse it.','The revised values persist. Resubmission returns the record to review, and endorsement changes it to Endorsed.')
section('15 ASM login and final approval','The ASM reviews forecasts endorsed by the RSM. The ASM can approve the forecast or return it for revision. Approval completes this review cycle and makes the forecast available in approved forecast reporting.','Log in as Manager / ASM. Open Approvals, find the endorsed forecast, review the details, and approve it.','The endorsed record appears within the intended scope. Approval changes its status to Approved. It appears in Weekly Sales for the selected week.','Does this review sequence match the required approval authority?')
doc.add_heading('Workflow to confirm',2)
p('KAM draft > KAM submission > Pending RSM review > RSM endorsement > Endorsed ASM review > ASM approval > Approved forecast reporting')
p('Include a return and revision during the demonstration so stakeholders can verify the correction process as well as the approval path.')

page('Reporting and management review')
section('16 Weekly Sales','Weekly Sales presents approved forecasts for weekly reporting. It represents the approved sales plan; recorded sales performance is maintained in Actuals. Grouping and visible records depend on the user position and assigned scope.','Filter to the demonstration week. Expand the available hierarchy and locate the sample customer, product, and approved volume. Demonstrate export with Superuser or Admin.','The report matches the approved forecast. Export appears only where permission is granted.')
section('17 NSM login and Dashboard','I am now using the NSM account for management monitoring. By default, this account has Dashboard and Weekly Sales access. Dashboard presentation depends on account configuration and may use the system dashboard or an embedded Power BI report. We use the available comparisons to identify gaps and follow up with the responsible team.','Log in as Manager / NSM. Open Dashboard and Weekly Sales. Select the demonstration period and show the available forecast, budget, and actual comparisons.','Figures use the intended period, scope, and units. Confirm consolidated visibility. If using Power BI, confirm refresh timing and access settings separately.','Are we forecasting enough to meet the target? Are actual sales keeping pace? Which areas, customers, or products explain the gaps?')
section('18 Admin login and Audit Logs','Audit Logs supports traceability by showing recorded system activity. The available filters and record references help investigate changes. We should confirm that the activities stakeholders need to trace are captured with enough detail.','Return to Admin. Open Audit Logs and filter or search for the demonstration activity where recorded.','Relevant logged actions identify the correct user and record.','Which activities must be traceable for operational review?')
doc.add_heading('Account controls',2)
p('At a convenient role switch, show the profile menu, Change Password, Refresh App, and Logout. Explain that Refresh App reloads current data and settings and can discard unsaved changes. Confirm the next login shows the new account identity before continuing.')

page('Final verification and stakeholder decisions')
doc.add_heading('19 Role verification checklist',2)
p('For each account, confirm the visible modules, permitted actions, and record scope. Check that records outside the intended scope are restricted. Record Pass, Issue, or Not tested for each item.')
for role,check in [
('KAM','Prepare, save, revise, and submit forecasts; view the intended customer records.'),
('RSM','Review Pending submissions; return or endorse; stay within the assigned area.'),
('ASM','Review Endorsed submissions; approve or return within the assigned scope.'),
('NSM','View Dashboard and Weekly Sales with the intended consolidated visibility.'),
('Superuser','Maintain operational data, manage week locks, and export Weekly Sales.'),
('Admin','Maintain setup and accounts, review permissions, and inspect audit logs.')]:
    label(role,check+'  Result: ____________________')
doc.add_heading('20 Closing script',2)
p('We have now followed the complete process: setup, forecast preparation, revision, endorsement, approval, and reporting. Before rollout, I would like us to confirm the following decisions.')
for v in ['Does each role have the correct responsibilities and access?', 'What are the submission, endorsement, and approval deadlines?', 'Who owns master data, budgets, and actual sales updates?', 'Who can authorize reopening a locked week?', 'Which reports and acceptance checks are required before launch?']:
    doc.add_paragraph(v,style='List Bullet')
p('We will record the issues identified today, assign owners, and agree on the required changes. Once the workflow and figures are validated, we can proceed with a pilot using the agreed users and sales area.')
doc.add_heading('Meeting action record',2)
for v in ['Decision or issue', 'Responsible owner', 'Target date', 'Pilot users and sales area']:
    label(v,'________________________________________________________')

footer=sec.footer.paragraphs[0];footer.alignment=2
r=footer.add_run('Page ');r.font.size=Pt(9)
f=OxmlElement('w:fldSimple');f.set(qn('w:instr'),'PAGE');footer._p.append(f)
doc.core_properties.title='Feed Sales Forecast Stakeholder Demonstration Script'
doc.core_properties.subject='Module walkthrough and role verification'
doc.save(out/'Feed Sales Forecast Stakeholder Script.docx')
print(out/'Feed Sales Forecast Stakeholder Script.docx')
