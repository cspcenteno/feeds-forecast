# Feed Sales Dashboard

Open **Feed Sales Dashboard.pbip** in Power BI Desktop. This report uses the app's PostgreSQL database directly. No database credentials or private data snapshot are included.

1. Transform data → Edit parameters: verify DatabaseServer and DatabaseName. Use the Supabase PostgreSQL host/pooler provided by your database settings if the direct host is unavailable.
2. Refresh and enter your database credentials in Power BI. Use an authorized read-only reporting account with access to all regions. App role permissions do not automatically transfer to a PostgreSQL login.
3. Save As → Power BI files (*.pbix).

The model is Import mode; Refresh reads current data from PostgreSQL. The report initially opens without cached data.

## Calculation rules
Approved forecasts only; ISO week is assigned to the month of its Thursday. Actuals use actual_date. Monthly budgets override annual budgets within the same region/subregion/customer/product; annual values are divided by 12. Generic product budgets are excluded where customer-specific budgets exist, matching the all-region dashboard's regional totals. Quantities and volumes remain separate. All volume measures are 50 kg bags.

The monthly matrix uses customer salesman and current regional ASM/RSM assignments. It includes budget/actual-only rows, unlike the web dashboard's forecast-led detail list. Card click navigation is represented by the comparison dropdown. Power BI native charts and matrix reproduce the layout while retaining filtering and drill-down.

Before publishing, validate database totals against the app for a selected month. Never publish this all-region report to regional users without configured Power BI RLS.
