import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

let supabase = null;
let currentUser = null;
let users = [];
let config = {};
let projects = [];
let scope = "own";

const DEFAULT_CONFIG = {
  regions:["北京","天津","山东","东北","华东","华南","西北"],
  categories:["高校","医院","研究院","企业","产业园区","政府/平台"],
  levels:["S","A","B","C"],
  priorities:["S","A","B","C"],
  stages:[
    {name:"线索发现", win:0.10, tip:"确认客户基本需求、应用方向与预算窗口。"},
    {name:"初步接触", win:0.20, tip:"完成首访，识别关键联系人与潜在采购场景。"},
    {name:"需求确认", win:0.35, tip:"确认应用场景、预算来源、决策链和技术痛点。"},
    {name:"方案交流", win:0.50, tip:"组织产品/应用方案交流，形成配置清单。"},
    {name:"报价/预算论证", win:0.65, tip:"提交报价、配置和论证材料，推动预算立项。"},
    {name:"采购/招标流程", win:0.80, tip:"跟进采购路径、参数、评分、专家论证与流程节点。"},
    {name:"合同/成交", win:0.95, tip:"完成合同、发货、验收和回款计划。"},
    {name:"暂缓/丢单", win:0.00, tip:"沉淀暂缓/丢单原因，评估后续复活机会。"}
  ],
  teams:["华北销售组","华东销售组","华南销售组","行业大客户组"],
  risks:["低","中","高"],
  yesNo:["是","否"],
  productLines:{
    "科研仪器解决方案":["FlowRACS 高通量流式拉曼分选仪","FlowRACS 单细胞拉曼分选系统","3Brain 高密度微电极阵列 MEA 系统","RapidXAFS 实验室级 XAFS 系统"],
    "医疗科研解决方案":["3Brain 高密度微电极阵列 MEA 系统","自动化样本库系统","单细胞可视化筛选系统"],
    "生命科学仪器方案":["共聚焦扫描成像显微镜 CSIM131","智能化3D细胞打印平台","激光捕获显微切割系统 LCM-FL1A"],
    "智慧运维平台":["智维云高校科研仪器智慧运维平台","大型仪器维保服务平台","实验室设备全生命周期管理平台"]
  }
};

const $ = id => document.getElementById(id);
const pageMeta = {
  dashboard:["总经理驾驶舱","集中查看销售规模、加权预测、重点项目、区域与产品线机会分布。"],
  projects:["项目明细台账","用于销售日常录入、查询、筛选、更新阶段和维护下一步动作。"],
  keyprojects:["重点项目推进","面向总经理和销售总监，突出高金额、高优先级、需管理层介入项目。"],
  funnel:["销售漏斗分析","按标准销售阶段统计项目数量、金额和加权预测，辅助例会复盘。"],
  settings:["基础配置","区域、产品线、具体产品名、销售阶段、人员和风险字段均可配置。"],
  architecture:["权限架构","销售看自己项目，总经理/管理员看全量项目。"]
};

async function initSupabase(){
  const res = await fetch("/api/public-config");
  const cfg = await res.json();
  if(!res.ok || cfg.ok === false) throw new Error(cfg.error || "无法读取 Supabase 配置。");
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
}

async function session(){
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function authHeaders(){
  const s = await session();
  return {
    "content-type":"application/json",
    "authorization": `Bearer ${s?.access_token || ""}`
  };
}

async function api(path, options={}){
  const res = await fetch(path, {
    ...options,
    headers: { ...(await authHeaders()), ...(options.headers || {}) }
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok || data.ok === false) throw new Error(data.error || data.detail || `请求失败：${res.status}`);
  return data;
}

async function login(){
  $("loginMsg").textContent = "";
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if(error){
    $("loginMsg").textContent = error.message;
    return;
  }
  await bootstrapAfterLogin();
}

async function logout(){
  await supabase.auth.signOut();
  currentUser = null;
  $("appRoot").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
}

async function bootstrapAfterLogin(){
  try{
    const me = await api("/api/me");
    currentUser = me.user;
    $("currentUserName").textContent = currentUser.name;
    $("currentUserRole").textContent = roleLabel(currentUser.role);
    $("currentUserEmail").textContent = currentUser.email;
    $("loginScreen").classList.add("hidden");
    $("appRoot").classList.remove("hidden");
    await loadAll();
  }catch(err){
    $("loginMsg").textContent = err.message;
    await supabase.auth.signOut();
  }
}

function roleLabel(role){
  return {sales:"销售账号：仅看本人项目", general_manager:"总经理：查看全量项目", admin:"管理员：全量权限"}[role] || role;
}

function canSeeAll(){ return ["general_manager","admin"].includes(currentUser?.role); }
function canEditConfig(){ return ["general_manager","admin"].includes(currentUser?.role); }

async function loadAll(){
  $("statusNotice").textContent = "正在读取云端数据...";
  const [cfg, usr, prj] = await Promise.all([
    api("/api/config"),
    api("/api/users"),
    api("/api/projects")
  ]);
  config = cfg.config || DEFAULT_CONFIG;
  users = usr.users || [];
  projects = prj.projects || [];
  scope = prj.scope || (canSeeAll() ? "all" : "own");
  $("statusNotice").textContent = scope === "all"
    ? "当前账号可查看全量项目。"
    : "当前账号为销售角色，仅显示自己名下项目。";
  $("scopeHint").textContent = scope === "all" ? "全量项目" : "本人项目";
  $("projectScopeText").textContent = scope === "all" ? "总经理/管理员视图：显示全量项目" : "销售视图：仅显示自己名下项目";
  initControls();
  renderAll();
}

function money(n){n=Number(n||0); if(n>=100000000)return(n/100000000).toFixed(2)+"亿"; if(n>=10000)return(n/10000).toFixed(1)+"万"; return n.toLocaleString();}
function weight(p){return Number(p.amount||0)*Number(p.win||0)}
function sum(arr,field){return arr.reduce((a,b)=>a+Number(b[field]||0),0)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function groupBy(arr,key,valueFn){const out={}; arr.forEach(x=>{const k=(typeof key==="function"?key(x):x[key])||"未填写"; out[k]=(out[k]||0)+(valueFn?valueFn(x):1)}); return out;}
function fillSelect(id, arr, placeholder, valueKey="value", labelKey="label"){
  const el=$(id); if(!el)return; const old=el.value;
  el.innerHTML=placeholder?`<option value="">${placeholder}</option>`:"";
  (arr||[]).forEach(v=>{
    const o=document.createElement("option");
    if(typeof v==="object"){
      o.value=v[valueKey] ?? v.id ?? v.name;
      o.textContent=v[labelKey] ?? v.name ?? v.email ?? o.value;
    }else{
      o.value=v; o.textContent=v;
    }
    el.appendChild(o);
  });
  if(old && [...el.options].some(o=>o.value===old)) el.value=old;
}
function renderBars(id,data,cls=""){const el=$(id); if(!el)return; const entries=Object.entries(data).sort((a,b)=>b[1]-a[1]); const max=Math.max(...entries.map(x=>x[1]),1); el.innerHTML=entries.length?entries.map(([k,v])=>`<div class="bar-row"><div class="bar-label" title="${esc(k)}">${esc(k)}</div><div class="bar-bg"><div class="bar ${cls}" style="width:${Math.max(4,v/max*100)}%"></div></div><div class="bar-value">${money(v)}</div></div>`).join(""):`<div class="empty">暂无数据</div>`;}

function renderDashboard(){
  $("kpiCount").textContent=projects.length;
  $("kpiAmount").textContent=money(sum(projects,"amount"));
  $("kpiWeighted").textContent=money(projects.reduce((a,b)=>a+weight(b),0));
  $("kpiA").textContent=projects.filter(p=>["S","A"].includes(p.priority)).length;
  $("kpiBoss").textContent=projects.filter(p=>p.boss==="是").length;
  renderBars("stageBars",groupBy(projects,"stage",weight));
  renderBars("regionBars",groupBy(projects,"region",weight),"orange");
  renderBars("productBars",groupBy(projects,"productLine",weight),"purple");
  const risks=projects.filter(p=>p.risk==="高"||p.boss==="是"||p.key==="是").slice(0,8);
  $("riskList").innerHTML=risks.length?risks.map(p=>`<div style="border-bottom:1px solid #edf2f7;padding:11px 0"><div style="display:flex;justify-content:space-between;gap:10px"><strong>${esc(p.company)}</strong><span class="tag ${p.risk==='高'?'red':'orange'}">${esc(p.risk)}风险</span></div><div style="color:#64748b;font-size:13px;margin-top:4px">${esc(p.owner)} · ${esc(p.productName)} · ${esc(p.next||"待补充下一步动作")}</div></div>`).join(""):`<div class="empty">暂无预警项目</div>`;
}

function filteredProjects(){
  const q=($("searchText")?.value||"").toLowerCase().trim(), r=$("filterRegion")?.value||"", pl=$("filterProductLine")?.value||"", s=$("filterStage")?.value||"", o=$("filterOwner")?.value||"", risk=$("filterRisk")?.value||"";
  return projects.filter(p=>{const text=[p.company,p.contact,p.department,p.research,p.productName,p.productLine,p.owner].join(" ").toLowerCase(); return(!q||text.includes(q))&&(!r||p.region===r)&&(!pl||p.productLine===pl)&&(!s||p.stage===s)&&(!o||p.ownerUserId===o)&&(!risk||p.risk===risk)});
}
function renderProjects(){
  const rows=filteredProjects(); const tbody=$("projectRows"); if(!tbody)return;
  tbody.innerHTML=rows.length?rows.map(p=>`<tr>
    <td><button class="action-link" data-edit="${p.id}">编辑</button><button class="action-link" data-del="${p.id}">删除</button></td>
    <td>${esc(p.owner)}</td><td>${esc(p.region)}</td><td>${esc(p.category)}</td><td><strong>${esc(p.company)}</strong><div style="color:#64748b">${esc(p.department||"")}</div></td>
    <td>${esc(p.contact)}<div style="color:#64748b">${esc(p.title||"")}</div></td><td><span class="tag purple">${esc(p.level)}</span></td>
    <td>${esc(p.productLine)}</td><td><strong>${esc(p.productName)}</strong></td><td>${money(p.budget)}</td><td>${money(p.amount)}</td>
    <td><span class="tag green">${esc(p.stage)}</span></td><td>${Math.round((p.win||0)*100)}%</td>
    <td><span class="tag ${p.risk==='高'?'red':p.risk==='中'?'orange':'green'}">${esc(p.risk)}</span></td><td>${esc(p.next||"")}</td><td>${p.boss==="是"?'<span class="tag red">是</span>':'<span class="tag">否</span>'}</td>
  </tr>`).join(""):`<tr><td colspan="16" class="empty">暂无匹配项目</td></tr>`;
}
function renderKeyProjects(){const tbody=$("keyRows"); if(!tbody)return; const score={S:4,A:3,B:2,C:1}; const rows=[...projects].sort((a,b)=>(score[b.priority]||0)-(score[a.priority]||0)||weight(b)-weight(a)||Number(b.amount||0)-Number(a.amount||0)).slice(0,10); tbody.innerHTML=rows.length?rows.map((p,i)=>`<tr><td>${i+1}</td><td><strong>${esc(p.company)}</strong></td><td>${esc(p.owner)}</td><td>${esc(p.productLine)}</td><td>${esc(p.productName)}</td><td><span class="tag purple">${esc(p.priority)}</span></td><td>${esc(p.stage)}</td><td>${money(p.amount)}</td><td>${money(weight(p))}</td><td>${esc(p.next||"")}</td><td><span class="tag ${p.risk==='高'?'red':p.risk==='中'?'orange':'green'}">${esc(p.risk)}</span></td><td>${p.boss==="是"?'<span class="tag red">是</span>':'否'}</td></tr>`).join(""):`<tr><td colspan="12" class="empty">暂无重点项目</td></tr>`;}
function renderFunnel(){const amounts={}; (config.stages||[]).forEach(s=>amounts[s.name]=0); projects.forEach(p=>amounts[p.stage]=(amounts[p.stage]||0)+weight(p)); renderBars("funnelBars",amounts); $("stageTips").innerHTML=(config.stages||[]).map(s=>`<div style="border-bottom:1px solid #edf2f7;padding:10px 0"><strong>${esc(s.name)}</strong><span class="tag" style="margin-left:8px">${Math.round(s.win*100)}%</span><div style="color:#64748b;font-size:13px;margin-top:4px">${esc(s.tip)}</div></div>`).join("");}
function renderSettings(){ $("regionPills").innerHTML=(config.regions||[]).map(x=>`<span class="pill">${esc(x)}${canEditConfig()?`<button data-remove-region="${esc(x)}">×</button>`:""}</span>`).join(""); fillSelect("configProductLine",Object.keys(config.productLines||{})); renderProductConfig();}
function renderProductConfig(){const line=$("configProductLine")?.value||Object.keys(config.productLines||{})[0]; if($("configProductLine"))$("configProductLine").value=line||""; const items=(config.productLines||{})[line]||[]; $("productPills").innerHTML=`<div class="pill-list">${items.map(x=>`<span class="pill">${esc(x)}${canEditConfig()?`<button data-remove-product="${esc(x)}">×</button>`:""}</span>`).join("")}</div>`;}
async function saveConfig(){ if(!canEditConfig()) throw new Error("只有总经理或管理员可以修改基础配置。"); await api("/api/config",{method:"PUT",body:JSON.stringify({config})}); }
async function addRegion(){try{const v=$("newRegion").value.trim(); if(v&&!config.regions.includes(v)){config.regions.push(v); await saveConfig(); showToast("区域已保存。"); await loadAll();} $("newRegion").value="";}catch(e){showToast(e.message)}}
async function addProductLine(){try{const name=prompt("请输入新的产品线/解决方案名称"); if(name&&!config.productLines[name]){config.productLines[name]=[]; await saveConfig(); showToast("产品线已保存。"); await loadAll();}}catch(e){showToast(e.message)}}
async function addProductName(){try{const line=$("configProductLine").value, name=$("newProductName").value.trim(); if(line&&name&&!config.productLines[line].includes(name)){config.productLines[line].push(name); await saveConfig(); showToast("具体产品名已保存。"); await loadAll();} $("newProductName").value="";}catch(e){showToast(e.message)}}
async function removeRegion(name){try{config.regions=config.regions.filter(x=>x!==name); await saveConfig(); await loadAll();}catch(e){showToast(e.message)}}
async function removeProduct(name){try{const line=$("configProductLine").value; config.productLines[line]=(config.productLines[line]||[]).filter(x=>x!==name); await saveConfig(); await loadAll();}catch(e){showToast(e.message)}}
function initControls(){
  fillSelect("filterRegion",config.regions,"全部区域"); fillSelect("filterProductLine",Object.keys(config.productLines||{}),"全部产品线"); fillSelect("filterStage",config.stages,"全部阶段"); fillSelect("filterOwner",users.map(u=>({value:u.id,label:u.name})),"全部负责人"); fillSelect("filterRisk",config.risks,"全部风险");
  fillSelect("f_ownerUserId",users.map(u=>({value:u.id,label:`${u.name}（${u.role==='sales'?'销售':u.role==='general_manager'?'总经理':'管理员'}）`}))); $("f_ownerUserId").disabled = !canSeeAll();
  fillSelect("f_region",config.regions); fillSelect("f_category",config.categories); fillSelect("f_level",config.levels); fillSelect("f_productLine",Object.keys(config.productLines||{})); fillSelect("f_stage",config.stages); fillSelect("f_team",config.teams); fillSelect("f_priority",config.priorities); fillSelect("f_key",config.yesNo); fillSelect("f_risk",config.risks); fillSelect("f_boss",config.yesNo); syncProductOptions();
}
function syncProductOptions(){const line=$("f_productLine")?.value||Object.keys(config.productLines||{})[0]; fillSelect("f_productName",(config.productLines||{})[line]||[]);}
function syncWinFromStage(force=false){
  const stageName = $("f_stage")?.value || "";
  const stage = (config.stages || []).find(s => s.name === stageName);
  if(stage && $("f_win") && (force || $("f_win").value === "" || Number($("f_win").value) === 0)){
    $("f_win").value = Number(stage.win || 0).toFixed(2);
  }
}

function clearFilters(){["searchText","filterRegion","filterProductLine","filterStage","filterOwner","filterRisk"].forEach(id=>{if($(id))$(id).value=""}); renderProjects();}
function openDrawer(project=null){$("drawerTitle").textContent=project?"编辑销售项目":"新增销售项目"; ["f_id","f_company","f_department","f_contact","f_title","f_budget","f_amount","f_win","f_research","f_next","f_note"].forEach(id=>$(id).value=""); initControls(); if(!canSeeAll()) $("f_ownerUserId").value=currentUser.id; if(project){Object.entries({f_id:project.id,f_ownerUserId:project.ownerUserId,f_region:project.region,f_category:project.category,f_company:project.company,f_department:project.department,f_contact:project.contact,f_title:project.title,f_level:project.level,f_productLine:project.productLine,f_budget:project.budget,f_amount:project.amount,f_win:project.win,f_stage:project.stage,f_team:project.team,f_priority:project.priority,f_key:project.key,f_risk:project.risk,f_boss:project.boss,f_research:project.research,f_next:project.next,f_note:project.note}).forEach(([id,v])=>{if($(id))$(id).value=v??""}); syncProductOptions(); $("f_productName").value=project.productName||"";} else { if(!$("f_stage").value && (config.stages||[])[0]) $("f_stage").value=(config.stages||[])[0].name; syncWinFromStage(true); } $("drawer").classList.add("open");}
function closeDrawer(){$("drawer").classList.remove("open")}
function collectProject(){return {id:val("f_id"),ownerUserId:val("f_ownerUserId"),region:val("f_region"),category:val("f_category"),company:val("f_company")||"未命名客户",department:val("f_department"),contact:val("f_contact")||"待补充",title:val("f_title"),level:val("f_level"),productLine:val("f_productLine"),productName:val("f_productName"),budget:Number(val("f_budget")||0),amount:Number(val("f_amount")||0),win:Number(val("f_win")||0),stage:val("f_stage"),team:val("f_team"),priority:val("f_priority"),key:val("f_key"),risk:val("f_risk"),boss:val("f_boss"),research:val("f_research"),next:val("f_next"),note:val("f_note")};}
async function saveProject(){try{const p=collectProject(); if(!p.company || !p.productLine || !p.productName){showToast("请至少填写：客户单位名称、产品线/解决方案、具体产品名。"); return;} if(p.win < 0 || p.win > 1){showToast("商机赢率请填写 0 到 1 之间的小数，例如 0.50。"); return;} if(p.id){await api("/api/projects",{method:"PUT",body:JSON.stringify(p)});}else{await api("/api/projects",{method:"POST",body:JSON.stringify(p)});} closeDrawer(); showToast("项目已保存。"); await loadAll();}catch(e){showToast(e.message)}}
async function deleteProject(id){if(!confirm("确认删除该项目？"))return; try{await api(`/api/projects?id=${encodeURIComponent(id)}`,{method:"DELETE"}); showToast("项目已删除。"); await loadAll();}catch(e){showToast(e.message)}}
function val(id){return $(id)?.value||""}
async function exportJSON(){try{const data=await api("/api/export"); const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json;charset=utf-8"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`客户项目管理系统_${scope==='all'?'全量':'本人'}数据备份.json`; a.click(); URL.revokeObjectURL(a.href);}catch(e){showToast(e.message)}}
function renderAll(){renderDashboard(); renderProjects(); renderKeyProjects(); renderFunnel(); renderSettings();}
function showToast(msg){const el=$("toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3200)}
function bind(){
  $("loginBtn").addEventListener("click", login);
  $("loginPassword").addEventListener("keydown", e=>{if(e.key==="Enter")login();});
  $("logoutBtn").addEventListener("click", logout);
  document.querySelectorAll(".nav button").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".nav button").forEach(b=>b.classList.remove("active")); btn.classList.add("active"); const id=btn.dataset.page; document.querySelectorAll(".page").forEach(p=>p.classList.remove("active")); $(id).classList.add("active"); $("pageTitle").textContent=pageMeta[id][0]; $("pageDesc").textContent=pageMeta[id][1]; renderAll();}));
  $("refreshBtn").addEventListener("click",loadAll); $("exportBtn").addEventListener("click",exportJSON); $("newBtn").addEventListener("click",()=>openDrawer()); $("closeDrawerBtn").addEventListener("click",closeDrawer); $("cancelProjectBtn").addEventListener("click",closeDrawer); $("saveProjectBtn").addEventListener("click",saveProject); $("f_productLine").addEventListener("change",syncProductOptions); $("f_stage").addEventListener("change",()=>syncWinFromStage(true)); $("resetFilterBtn").addEventListener("click",clearFilters);
  ["searchText","filterRegion","filterProductLine","filterStage","filterOwner","filterRisk"].forEach(id=>{ $(id).addEventListener("input",renderProjects); $(id).addEventListener("change",renderProjects); });
  $("addRegionBtn").addEventListener("click",addRegion); $("addProductLineBtn").addEventListener("click",addProductLine); $("addProductNameBtn").addEventListener("click",addProductName); $("configProductLine").addEventListener("change",renderProductConfig);
  document.body.addEventListener("click",(e)=>{if(e.target.dataset.edit)openDrawer(projects.find(p=>p.id===e.target.dataset.edit)); if(e.target.dataset.del)deleteProject(e.target.dataset.del); if(e.target.dataset.removeRegion)removeRegion(e.target.dataset.removeRegion); if(e.target.dataset.removeProduct)removeProduct(e.target.dataset.removeProduct);});
}
async function start(){
  bind();
  try{
    await initSupabase();
    const s = await session();
    if(s) await bootstrapAfterLogin();
  }catch(err){
    $("loginMsg").textContent = err.message;
  }
}
start();
