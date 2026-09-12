import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import type { Resident } from "../types";

type Category = "HARD_ELIGIBILITY" | "PRIORITY";
type Rule = { id:number; rule_name:string; category:Category; field_name:string; operator:string; comparison_value:string|null; priority_points:number; is_active:number; explanation:string; sort_order:number };
type RuleSet = { id:number; building_id:number; version:number; name:string; description:string; status:"Draft"|"Active"|"Inactive"; updated_at:string; rules:Rule[] };
type Summary = { total_registered:number; total_eligible:number; total_ineligible:number };
type Result = { resident_id:number; eligible:boolean; status:string; rule_version:number|null; priority_score:number; explanation:string; configuration_status:string; results:Array<{rule_id:number;rule_name:string;category:Category;passed:boolean;points_awarded:number;explanation:string;missing_field:boolean}> };
const fields:Record<string,{label:string;kind:"text"|"number"|"boolean"}> = {
  verification_status:{label:"Verification Status",kind:"text"}, family_members:{label:"Household Size",kind:"number"},
  annual_income:{label:"Annual Income",kind:"number"}, age:{label:"Age",kind:"number"},
  residency_years:{label:"Residency Years",kind:"number"}, priority_category:{label:"Priority Category",kind:"text"},
  resident_category:{label:"Policy Category",kind:"text"}, building_wing:{label:"Building Wing",kind:"text"},
  consent:{label:"Resident Consent",kind:"boolean"}, document_present:{label:"Document Present",kind:"boolean"}
};
const operators:Record<string,string[]> = {
  text:["equals","not equals","contains","exists","does not exist"],
  number:["equals","not equals","greater than","greater than or equal","less than","less than or equal","between","exists","does not exist"],
  boolean:["is true","is false","exists","does not exist"]
};
type RuleForm = Omit<Rule,"id"|"is_active"> & {is_active:boolean};
const blank:RuleForm = {rule_name:"",category:"HARD_ELIGIBILITY",field_name:"verification_status",operator:"equals",comparison_value:"Verified",priority_points:0,is_active:true,explanation:"",sort_order:100};

export function EligibilityCriteria({buildingId,buildingName,residents}:{buildingId:number;buildingName:string;residents:Resident[]}) {
  const base = `/buildings/${buildingId}/eligibility`;
  const [versions,setVersions] = useState<RuleSet[]>([]);
  const [selected,setSelected] = useState<RuleSet|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string|null>(null);
  const [message,setMessage] = useState<string|null>(null);
  const [form,setForm] = useState<RuleForm>(blank);
  const [editingId,setEditingId] = useState<number|null>(null);
  const [residentId,setResidentId] = useState<number|null>(null);
  const [result,setResult] = useState<Result|null>(null);
  const [summary,setSummary] = useState<Summary|null>(null);
  const [busy,setBusy] = useState(false);
  const [creatingVersion,setCreatingVersion] = useState(false);
  const [versionName,setVersionName] = useState("");
  const [versionDescription,setVersionDescription] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setSelected(null); setVersions([]); setResult(null); setSummary(null);
    apiRequest<Array<Omit<RuleSet,"rules">>>(`${base}/rule-sets`).then(async list => {
      const details = await Promise.all(list.map(item => apiRequest<RuleSet>(`${base}/rule-sets/${item.id}`)));
      if (!cancelled) { setVersions(details); setSelected(details[0] ?? null); setLoading(false); }
    }).catch(err => { if (!cancelled) { setError(err instanceof Error?err.message:"Criteria could not be loaded."); setLoading(false); } });
    return () => { cancelled = true; };
  },[base]);

  async function refresh(preferredId?:number) {
    const list = await apiRequest<Array<Omit<RuleSet,"rules">>>(`${base}/rule-sets`);
    const details = await Promise.all(list.map(item => apiRequest<RuleSet>(`${base}/rule-sets/${item.id}`)));
    setVersions(details);
    setSelected(details.find(item=>item.id === (preferredId ?? selected?.id)) ?? details[0] ?? null);
    setResult(null); setSummary(null);
  }
  async function perform(action:()=>Promise<unknown>, success:string, preferredId?:number):Promise<boolean> {
    setBusy(true); setError(null); setMessage(null);
    try { await action(); await refresh(preferredId); setMessage(success); return true; }
    catch (err) { setError(err instanceof Error?err.message:"The change could not be saved."); return false; }
    finally { setBusy(false); }
  }
  async function newVersion(event:FormEvent) {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const created = await apiRequest<RuleSet>(`${base}/rule-sets`,{method:"POST",body:JSON.stringify({name:versionName.trim(),description:versionDescription.trim(),copy_from_id:selected?.id ?? null})});
      await refresh(created.id); setMessage(`Draft version ${created.version} created. Review and activate it when ready.`); setCreatingVersion(false);
    } catch(err) { setError(err instanceof Error?err.message:"Version could not be created."); }
    finally { setBusy(false); }
  }
  function edit(rule:Rule) {
    setEditingId(rule.id);
    setForm({rule_name:rule.rule_name,category:rule.category,field_name:rule.field_name,operator:rule.operator,
      comparison_value:rule.comparison_value,priority_points:rule.priority_points,is_active:Boolean(rule.is_active),
      explanation:rule.explanation,sort_order:rule.sort_order});
  }
  function setField(field:string) {
    const kind = fields[field].kind;
    const operator = operators[kind][0];
    setForm({...form,field_name:field,operator,comparison_value:kind==="boolean"?null:""});
  }
  async function saveRule(event:FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const path = editingId ? `${base}/rule-sets/${selected.id}/rules/${editingId}` : `${base}/rule-sets/${selected.id}/rules`;
    const saved = await perform(()=>apiRequest(path,{method:editingId?"PUT":"POST",body:JSON.stringify({...form,comparison_value:form.comparison_value || null,
      priority_points:form.category==="PRIORITY"?form.priority_points:0})}),"Draft rule saved.",selected.id);
    if (saved) { setForm(blank); setEditingId(null); }
  }
  async function preview() {
    if (!residentId) return;
    setBusy(true); setError(null);
    try { setResult(await apiRequest<Result>(`${base}/residents/${residentId}${selected?`?rule_set_id=${selected.id}`:""}`)); }
    catch(err) { setError(err instanceof Error?err.message:"Preview failed."); }
    finally { setBusy(false); }
  }
  async function evaluateAll() {
    setBusy(true); setError(null);
    try { const data = await apiRequest<{summary:Summary}>(`${base}/evaluate-all${selected?`?rule_set_id=${selected.id}`:""}`,{method:"POST"}); setSummary(data.summary); }
    catch(err) { setError(err instanceof Error?err.message:"Evaluation failed."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <section className="rounded-xl border border-sage bg-gradient-to-r from-cream via-white to-sage-light p-6 shadow-soft">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-earth">Transparent policy before the lottery</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-3xl font-bold text-navy">Eligibility Criteria</h2><p className="mt-2 text-slate-600">Configure explainable rules for {buildingName}. Priority points are shown and audited; the existing lottery selects winners.</p></div>
      <button className="focus-ring rounded-lg bg-earth px-4 py-2 font-semibold text-white hover:bg-forest disabled:opacity-50" disabled={busy} onClick={()=>{setVersionName(selected?.name ?? "Building Eligibility");setVersionDescription(selected?.description ?? "");setCreatingVersion(true);}} type="button">{selected?"Create New Version":"Create Rule Set"}</button></div>
    </section>
    {creatingVersion?<section className="rounded-xl border border-sage bg-white p-5 shadow-soft"><h3 className="text-xl font-bold text-navy">New Criteria Version</h3><p className="mt-1 text-sm text-slate-600">{selected?`Rules from version ${selected.version} will be copied into an editable draft.`:"Start with a blank, editable rule set."}</p><form className="mt-4 space-y-3" onSubmit={event=>void newVersion(event)}><label className="block text-sm font-semibold text-slate-700">Rule Set Name<input required minLength={2} maxLength={120} className="mt-1 w-full rounded-lg border border-slate-300 p-2" value={versionName} onChange={event=>setVersionName(event.target.value)}/></label><label className="block text-sm font-semibold text-slate-700">Description<textarea maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 p-2" value={versionDescription} onChange={event=>setVersionDescription(event.target.value)}/></label><div className="flex gap-2"><button className="rounded-lg bg-earth px-4 py-2 font-bold text-white hover:bg-forest disabled:opacity-50" disabled={busy} type="submit">Save Draft Version</button><button className="rounded-lg border border-slate-300 px-4 py-2 font-bold text-slate-700" onClick={()=>setCreatingVersion(false)} type="button">Cancel</button></div></form></section>:null}
    {error?<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</p>:null}
    {message?<p className="rounded-lg border border-sage bg-sage-light p-3 text-forest">{message}</p>:null}
    {loading?<p className="text-slate-600">Loading criteria...</p>:null}
    {!loading && !selected?<section className="rounded-xl border border-sage bg-white p-6 shadow-soft"><h3 className="font-bold text-navy">No eligibility criteria configured</h3><p className="mt-2 text-slate-600">Verified residents with consent continue through the existing draw process until a rule set is activated.</p></section>:null}
    {selected?<section className="rounded-xl border border-sage bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wide text-earth">Rule set · Version {selected.version}</p><h3 className="mt-1 text-xl font-bold text-navy">{selected.name}</h3><p className="mt-1 text-sm text-slate-600">{selected.description || "No description"} · Updated {new Date(selected.updated_at).toLocaleString()}</p></div><span className="rounded-full bg-sage-light px-3 py-1 text-sm font-bold text-forest">{selected.status}</span></div>
      {versions.length>1?<label className="mt-4 block text-sm font-semibold text-slate-700">View version<select className="mt-1 block w-full max-w-sm rounded-lg border border-slate-300 p-2" value={selected.id} onChange={e=>{setSelected(versions.find(v=>v.id===Number(e.target.value))??null);setResult(null);setSummary(null);setEditingId(null);setForm(blank);}}>{versions.map(v=><option value={v.id} key={v.id}>Version {v.version} — {v.name} ({v.status})</option>)}</select></label>:null}
      {selected.status==="Draft"?<button className="mt-4 rounded-lg border border-earth px-4 py-2 font-semibold text-earth hover:bg-cream disabled:opacity-50" disabled={busy} onClick={()=>{if(window.confirm(`Activate version ${selected.version}? It will become immutable and future draws will use it.`)) void perform(()=>apiRequest(`${base}/rule-sets/${selected.id}/activate`,{method:"POST"}),"Criteria activated.",selected.id);}} type="button">Activate Version</button>:<p className="mt-4 text-sm text-slate-600">This version is immutable. Create a new version to change its rules.</p>}
    </section>:null}
    {selected?<section className="rounded-xl border border-sage bg-white p-5 shadow-soft"><h3 className="text-xl font-bold text-navy">Rules</h3>
      {selected.rules.length===0?<p className="mt-3 text-sm text-slate-600">No rules in this version. Verification and consent still apply.</p>:<div className="mt-4 grid gap-3">{selected.rules.map(rule=><article className="rounded-lg border border-sage bg-cream/40 p-4" key={rule.id}><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-bold text-navy">{rule.rule_name}</p><p className="text-sm text-slate-600">{fields[rule.field_name]?.label ?? rule.field_name} {rule.operator} {rule.comparison_value ?? ""}</p></div><div className="flex gap-2"><span className="rounded-full bg-sage-light px-2 py-1 text-xs font-bold text-forest">{rule.category==="PRIORITY"?"Priority":"Hard"}</span><span className="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-700">{rule.is_active?"Active":"Inactive"}</span></div></div><p className="mt-2 text-sm text-slate-600">{rule.explanation || "No explanation provided."}{rule.category==="PRIORITY"?` · +${rule.priority_points} points on match`:""}</p>{selected.status==="Draft"?<div className="mt-3 flex gap-3"><button type="button" className="text-sm font-bold text-earth" onClick={()=>edit(rule)}>Edit</button><button type="button" className="text-sm font-bold text-red-700" onClick={()=>{if(window.confirm(`Remove ${rule.rule_name} from this draft?`))void perform(()=>apiRequest(`${base}/rule-sets/${selected.id}/rules/${rule.id}`,{method:"DELETE"}),"Draft rule removed.",selected.id);}}>Remove</button></div>:null}</article>)}</div>}
    </section>:null}
    {selected?.status==="Draft"?<section className="rounded-xl border border-sage bg-white p-5 shadow-soft"><h3 className="text-xl font-bold text-navy">{editingId?"Edit Draft Rule":"Add Rule"}</h3><form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={event=>void saveRule(event)}>
      <label className="text-sm font-semibold text-slate-700">Rule Name<input required minLength={2} className="mt-1 w-full rounded-lg border border-slate-300 p-2" value={form.rule_name} onChange={e=>setForm({...form,rule_name:e.target.value})}/></label>
      <label className="text-sm font-semibold text-slate-700">Type<select className="mt-1 w-full rounded-lg border border-slate-300 p-2" value={form.category} onChange={e=>setForm({...form,category:e.target.value as Category,priority_points:e.target.value==="PRIORITY"?form.priority_points:0})}><option value="HARD_ELIGIBILITY">Hard Eligibility</option><option value="PRIORITY">Priority</option></select></label>
      <label className="text-sm font-semibold text-slate-700">Resident Field<select className="mt-1 w-full rounded-lg border border-slate-300 p-2" value={form.field_name} onChange={e=>setField(e.target.value)}>{Object.entries(fields).map(([key,value])=><option value={key} key={key}>{value.label}</option>)}</select></label>
      <label className="text-sm font-semibold text-slate-700">Operator<select className="mt-1 w-full rounded-lg border border-slate-300 p-2" value={form.operator} onChange={e=>setForm({...form,operator:e.target.value,comparison_value:["exists","does not exist","is true","is false"].includes(e.target.value)?null:form.comparison_value})}>{operators[fields[form.field_name].kind].map(op=><option key={op}>{op}</option>)}</select></label>
      {!["exists","does not exist","is true","is false"].includes(form.operator)?<label className="text-sm font-semibold text-slate-700">Value {form.operator==="between"?"(low,high)":""}<input required className="mt-1 w-full rounded-lg border border-slate-300 p-2" value={form.comparison_value??""} onChange={e=>setForm({...form,comparison_value:e.target.value})}/></label>:null}
      {form.category==="PRIORITY"?<label className="text-sm font-semibold text-slate-700">Points<input required min={0} max={10000} type="number" className="mt-1 w-full rounded-lg border border-slate-300 p-2" value={form.priority_points} onChange={e=>setForm({...form,priority_points:Number(e.target.value)})}/></label>:null}
      <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Explanation<input className="mt-1 w-full rounded-lg border border-slate-300 p-2" value={form.explanation} onChange={e=>setForm({...form,explanation:e.target.value})}/></label>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.is_active} onChange={e=>setForm({...form,is_active:e.target.checked})}/>Rule active</label>
      <div className="flex gap-2 sm:col-span-2"><button disabled={busy} className="rounded-lg bg-earth px-4 py-2 font-bold text-white hover:bg-forest disabled:opacity-50" type="submit">{editingId?"Save Rule":"Add Rule"}</button>{editingId?<button className="rounded-lg border border-slate-300 px-4 py-2 font-bold text-slate-700" onClick={()=>{setEditingId(null);setForm(blank);}} type="button">Cancel Edit</button>:null}</div>
    </form></section>:null}
    <section className="rounded-xl border border-sage bg-white p-5 shadow-soft"><h3 className="text-xl font-bold text-navy">Eligibility Preview</h3><p className="mt-1 text-sm text-slate-600">Preview uses the selected version without changing resident records. Draws use the active version when confirmed.</p>
      <div className="mt-4 flex flex-wrap gap-3"><select aria-label="Select resident" className="min-w-56 rounded-lg border border-slate-300 p-2" value={residentId??""} onChange={e=>{setResidentId(Number(e.target.value)||null);setResult(null);}}><option value="">Select a resident</option>{residents.map(r=><option key={r.id} value={r.id}>{r.full_name} · {r.old_room_number}</option>)}</select><button disabled={!residentId||busy} className="rounded-lg bg-earth px-4 py-2 font-bold text-white disabled:opacity-50" onClick={()=>void preview()} type="button">Preview Resident</button><button disabled={busy} className="rounded-lg border border-earth px-4 py-2 font-bold text-earth disabled:opacity-50" onClick={()=>void evaluateAll()} type="button">Evaluate All</button></div>
      {summary?<div className="mt-4 grid gap-3 sm:grid-cols-3">{[["Evaluated",summary.total_registered],["Eligible",summary.total_eligible],["Ineligible",summary.total_ineligible]].map(([label,value])=><div key={label} className="rounded-lg bg-sage-light p-3"><p className="text-sm text-slate-600">{label}</p><p className="text-2xl font-bold text-forest">{value}</p></div>)}</div>:null}
      {result?<div className="mt-4 rounded-lg border border-sage bg-cream/50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className={`text-lg font-bold ${result.eligible?"text-forest":"text-red-700"}`}>{result.status}</p><p className="text-sm font-semibold text-earth">Version {result.rule_version??"fallback"} · Priority score {result.priority_score}</p></div><p className="mt-2 text-sm text-slate-700">{result.explanation}</p>{result.results.length===0?<p className="mt-2 text-sm text-slate-600">{result.configuration_status}</p>:<ul className="mt-3 space-y-2">{result.results.map(item=><li className="rounded-lg bg-white p-2 text-sm" key={item.rule_id}><span className={item.passed?"font-bold text-forest":"font-bold text-red-700"}>{item.passed?"Pass":"Fail"}</span> · {item.rule_name} ({item.category==="PRIORITY"?"Priority":"Hard"}){item.points_awarded?` · +${item.points_awarded}`:""}<p className="text-slate-600">{item.explanation}{item.missing_field?" Required resident field is missing.":""}</p></li>)}</ul>}</div>:null}
    </section>
  </div>;
}
