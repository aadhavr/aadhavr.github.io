// Run: node check-data.js  — validates interventions.js before you publish.
global.window = {};
require("./interventions.js");
const D = window.DEVDLE_DATA, errs = [], warn = [];
const keys = D.config.feedback.map(f => f.key);
const ids = new Set();
for (const d of D.interventions) {
  if (ids.has(d.id)) errs.push(`duplicate id ${d.id}`); ids.add(d.id);
  for (const k of ["id", "name", "short_name", "icon", "description", "sources"]) if (!d[k]) errs.push(`${d.id}: missing ${k}`);
  for (const k of keys) for (const v of [].concat(d[k] ?? []))
    if (!(v in (D.taxonomy[k] || {}))) errs.push(`${d.id}: "${v}" is not in taxonomy.${k}`);
  if ((d.cost_effectiveness_estimate != null || d.evidence_strength != null) && !d.sources.some(s => s.url))
    errs.push(`${d.id}: evidence or cost-effectiveness value has no source URL`);
  if (d.status === "draft") warn.push(d.id);
  if (!d.sources.some(s => s.url)) errs.push(`${d.id}: no source URL`);
}
// an answer must differ from every other card on at least one feedback attribute,
// or a wrong guess could show four green tiles
const list = D.interventions;
for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++)
  if ((list[i].in_answer_pool !== false || list[j].in_answer_pool !== false) &&
      keys.every(k => JSON.stringify(list[i][k]) === JSON.stringify(list[j][k])))
    errs.push(`${list[i].id} and ${list[j].id} look identical on all feedback attributes`);
console.log(`${list.length} interventions, ${warn.length} still draft`);
if (errs.length) { console.error(errs.join("\n")); process.exit(1); }
console.log("OK");
