import json, itertools
from rows import R
SHEET="https://docs.google.com/spreadsheets/d/1TG7WRU85p1SEjir-5qvIEg4kVG9a4Lnzdgwcub8aKSs/edit#gid=0"
PAGE="https://www.givewell.org/research/research-on-programs"
def fam(d): return {v:k for k,vs in d.items() for v in vs}
TAX = {
 "health_or_development_domain": fam({
  "Infectious disease":["Malaria","Tuberculosis","HIV & STIs","Neglected tropical diseases","Vaccine-preventable disease","Diarrheal disease & water","Fungal infections","Other infections"],
  "Maternal & child":["Maternal health","Newborn health","Family planning","Child survival"],
  "Nutrition":["Micronutrients","Undernutrition","Infant & child nutrition"],
  "Other health":["Cancer & chronic disease","Vision","Surgery & disability","Mental health","Air pollution"],
  "Livelihoods":["Income & assets","Agriculture","Finance","Infrastructure","Jobs & skills"],
  "Learning":["Education","Early childhood development"]}),
 "mechanism": fam({
  "Prevention":["Vector control","Preventive drugs","Mass drug administration","Vaccination","Water treatment","Hygiene & safe practices","Cleaner household technology"],
  "Treatment":["Screen & treat","Medicine","Surgery","Assistive devices","Care practice","Psychotherapy","Therapeutic feeding"],
  "Nutrition":["Supplementation","Food supply change","Food provision"],
  "Behavior & information":["Incentives","Reminders & nudges","Mass media","Education & counseling","Advice & information"],
  "Transfers & assets":["Cash","Asset + coaching bundle","Productive inputs"],
  "Systems & markets":["Health worker training","Health system tools","Workforce expansion","Community health workers","Commodity supply","Build infrastructure","Credit & financial services","Certification"],
  "Teaching":["Mentoring & skills training","Teaching & school inputs"]}),
 "target_population": fam({
  "Young children & caregivers":["Children under 5","Infants","Newborns","Low-birthweight or preterm newborns","Caregivers of young children","Sick children"],
  "Women":["Pregnant women","Women giving birth","Women of reproductive age","Women with depression"],
  "Students & adolescents":["School-age children","Secondary students","Adolescent girls"],
  "Households & workers":["Whole household","Poor households","Ultra-poor households","Rural households","Smallholder farmers","Workers"],
  "Patients & at-risk adults":["People living with HIV","Contacts of TB patients","Adults at cardiovascular risk","Patients needing surgery","Patients with lung disease","Patients with a chronic condition","Sick people","People with a diagnosed infection","Adults"],
  "Everyone":["Whole community"]}),
 "delivery_channel": fam({
  "Campaign":["Mass campaign","Door-to-door"],
  "Health system":["Health facility","Routine immunization visits"],
  "School":["School"],
  "Community outreach":["Home visits","Community groups","Community health workers","NGO field staff","Direct distribution"],
  "Remote":["Mobile phone","Radio & TV"],
  "Payments & vouchers":["Cash payment","Voucher"],
  "Markets & lenders":["Local market / sales","Workplace","Microfinance institution","Supply chain"],
  "Infrastructure & home":["Community water point","Construction","Home installation","Environmental works","Home"]}),
}
FEED=["health_or_development_domain","mechanism","target_population","delivery_channel"]
out=[]
for (row,i,gw,short,icon,dom,mech,who,dlv,geo,st,upd,ans,desc,why,view) in R:
  src=[{"org":"GiveWell","title":f"Program reviews sheet, row {row}: “{gw}”","url":SHEET}]
  if i=="chlorine-vouchers": src.append({"org":"GiveWell","title":"Program reviews sheet, row 44: “Vouchers for water treatment” (merged here; status there: research ongoing)","url":SHEET})
  out.append({"id":i,"name":gw,"short_name":short,"icon":icon,
    "category":TAX["health_or_development_domain"][dom],
    "health_or_development_domain":dom,"mechanism":mech,"target_population":who,"delivery_channel":dlv,
    "geography":geo,"evidence_type":None,"evidence_strength":None,
    "cost_effectiveness_metric":None,"cost_effectiveness_estimate":None,
    "givewell_status":st,"givewell_review_updated":upd,"givewell_view":view,
    "description":desc,"why_it_works":why,"sources":src,
    "source_org":"GiveWell","in_answer_pool":bool(ans),"status":"sourced"})
# validation
bad=[(o["id"],k,o[k]) for o in out for k in FEED if o[k] not in TAX[k]]
assert not bad, bad
ids=[o["id"] for o in out]; assert len(ids)==len(set(ids))
sig=lambda o: tuple(o[k] for k in FEED)
clash=[(a["id"],b["id"]) for a,b in itertools.combinations(out,2) if sig(a)==sig(b) and (a["in_answer_pool"] or b["in_answer_pool"])]
assert not clash, clash
data={"meta":{"source":"GiveWell, Research on Programs → Program reviews sheet","source_urls":[PAGE,SHEET],"retrieved":"2026-09-23",
  "notes":["Program names, GiveWell status and review dates come from the sheet.","description and givewell_view paraphrase the sheet. why_it_works is an editorial theory of change, not an evidence claim.",
  "The four feedback attributes are an editorial classification.","evidence_* and cost_effectiveness_* stay null until copied from a GiveWell review page with its URL.",
  "GiveWell content is CC BY-NC-SA 3.0 US; keep attribution on the page."]},
 "config":{"startDate":"2026-09-23","seed":20260923,"maxGuesses":6,
  "feedback":[{"key":"health_or_development_domain","label":"Domain"},{"key":"mechanism","label":"Mechanism"},{"key":"target_population","label":"Who"},{"key":"delivery_channel","label":"Delivery"}]},
 "taxonomy":{k:dict(sorted(v.items(),key=lambda x:(x[1],x[0]))) for k,v in TAX.items()},
 "interventions":out}
js="/* DEVdle dataset. Generated from GiveWell's Program reviews sheet. See meta.notes. */\nwindow.DEVDLE_DATA = "+json.dumps(data,ensure_ascii=False,indent=1)+";\n"
open("../interventions.js","w").write(js)
json.dump(data,open("../interventions.json","w"),ensure_ascii=False,indent=1)
# csv for review
import csv
with open("../interventions.csv","w",newline="") as f:
  w=csv.writer(f); cols=["id","short_name","name","category"]+FEED+["geography","givewell_status","givewell_review_updated","in_answer_pool","description","givewell_view","why_it_works"]
  w.writerow(cols)
  for o in out: w.writerow([";".join(o[c]) if isinstance(o[c],list) else o[c] for c in cols])
from collections import Counter
print(len(out),"programs;",sum(o["in_answer_pool"] for o in out),"in answer pool")
for k in FEED: print(k, len(set(o[k] for o in out)),"values")
print(Counter(o["givewell_status"] for o in out))
