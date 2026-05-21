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
  salesstats:["销售统计","统计今年已成交金额、预计成交金额、客户数量、销售负责人和产品线贡献。"],
  projects:["项目明细台账","用于销售日常录入、查询、筛选、更新阶段和维护下一步动作。"],
  keyprojects:["重点项目推进","面向总经理和销售总监，突出高金额、高优先级、需管理层介入项目。"],
  funnel:["销售漏斗分析","按标准销售阶段统计项目数量、金额和加权预测，辅助例会复盘。"],
  settings:["基础配置","区域、产品线、具体产品名、销售阶段、人员和风险字段均可配置。"],
  profile:["个人资料","维护个人信息、联系方式和登录密码。"],
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

    await loadAll();

    $("loginScreen").classList.add("hidden");
    $("appRoot").classList.remove("hidden");
    applyRoleBasedNavigation();
  }catch(err){
    console.error("登录后加载系统失败：", err);
    if($("loginMsg")) $("loginMsg").textContent = err.message || "登录后加载系统失败。";
    if($("loginScreen")) $("loginScreen").classList.remove("hidden");
    if($("appRoot")) $("appRoot").classList.add("hidden");
    await supabase.auth.signOut();
  }
}

function roleLabel(role){
  return {sales:"销售账号：仅看本人项目", general_manager:"总经理：查看全量项目", admin:"管理员：全量权限"}[role] || role;
}

function canSeeAll(){ return ["general_manager","admin"].includes(currentUser?.role); }
function canEditConfig(){ return ["general_manager","admin"].includes(currentUser?.role); }

function getDefaultPageId(){
  return canSeeAll() ? "dashboard" : "projects";
}

function setActivePage(pageId){
  if(!canSeeAll() && pageId === "dashboard") pageId = "projects";

  document.querySelectorAll(".nav button").forEach(b=>{
    b.classList.toggle("active", b.dataset.page === pageId);
  });

  document.querySelectorAll(".page").forEach(p=>{
    p.classList.toggle("active", p.id === pageId);
  });

  if(pageMeta[pageId]){
    $("pageTitle").textContent = pageMeta[pageId][0];
    $("pageDesc").textContent = pageMeta[pageId][1];
  }
}

function applyRoleBasedNavigation(){
  const salesOnly = !canSeeAll();

  document.querySelectorAll("[data-manager-only='true']").forEach(el=>{
    el.classList.toggle("hidden", salesOnly);
  });

  // 销售账号不显示总经理驾驶舱，默认进入项目明细台账
  setActivePage(getDefaultPageId());
}


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
  if(currentUser) {
    document.querySelectorAll("[data-manager-only='true']").forEach(el=>{
      el.classList.toggle("hidden", !canSeeAll());
    });
    if(!canSeeAll() && document.querySelector("#dashboard")?.classList.contains("active")){
      setActivePage("projects");
    }
  }
}

function money(n){n=Number(n||0); if(n>=100000000)return(n/100000000).toFixed(2)+"亿"; if(n>=10000)return(n/10000).toFixed(1)+"万"; return n.toLocaleString();}
function weight(p){return Number(p.amount||0)*Number(p.win||0)}
function sum(arr,field){return arr.reduce((a,b)=>a+Number(b[field]||0),0)}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function groupBy(arr,key,valueFn){const out={}; arr.forEach(x=>{const k=(typeof key==="function"?key(x):x[key])||"未填写"; out[k]=(out[k]||0)+(valueFn?valueFn(x):1)}); return out;}
function isClosedProject(p){ return p.stage === "合同/成交"; }
function projectDate(p){
  const raw = p.updatedAt || p.createdAt || "";
  const d = raw ? new Date(raw) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}
function isThisYearProject(p){
  const d = projectDate(p);
  return !!d && d.getFullYear() === new Date().getFullYear();
}
function uniqueCount(arr, field){
  return new Set(arr.map(x => (x[field] || "").trim()).filter(Boolean)).size;
}
function dateText(raw){
  if(!raw) return "";
  const d = new Date(raw);
  if(Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0,10);
}

function excelSafeText(value){
  if(value === null || value === undefined) return "";
  return String(value);
}

function buildProjectRowsForExcel(projectList){
  return projectList.map((p, index) => ({
    "序号": index + 1,
    "项目ID": p.id || "",
    "负责人": p.owner || "",
    "负责人ID": p.ownerUserId || "",
    "区域": p.region || "",
    "客户分类": p.category || "",
    "客户单位": p.company || "",
    "院系/科室/平台": p.department || "",
    "联系人": p.contact || "",
    "职务/角色": p.title || "",
    "客户等级": p.level || "",
    "产品线/解决方案": p.productLine || "",
    "具体产品名": p.productName || "",
    "项目预算（元）": Number(p.budget || 0),
    "预计成交金额（元）": Number(p.amount || 0),
    "商机赢率": Number(p.win || 0),
    "加权预测金额（元）": Math.round(weight(p) * 100) / 100,
    "销售阶段": p.stage || "",
    "项目优先级": p.priority || "",
    "是否重点项目": p.key || "",
    "风险等级": p.risk || "",
    "是否需要总经理介入": p.boss || "",
    "研究方向/应用场景": p.research || "",
    "下一步动作": p.next || "",
    "备注/风险原因": p.note || "",
    "创建时间": dateText(p.createdAt),
    "更新时间": dateText(p.updatedAt)
  }));
}

function buildCustomerRowsForExcel(projectList){
  const map = new Map();

  projectList.forEach(p => {
    const key = (p.company || "未填写客户单位").trim();
    if(!map.has(key)){
      map.set(key, {
        company: key,
        regionSet: new Set(),
        categorySet: new Set(),
        departmentSet: new Set(),
        contactSet: new Set(),
        titleSet: new Set(),
        levelSet: new Set(),
        ownerSet: new Set(),
        productLineSet: new Set(),
        productNameSet: new Set(),
        stages: new Set(),
        risks: new Set(),
        projectCount: 0,
        budget: 0,
        amount: 0,
        weighted: 0,
        closedAmount: 0,
        keyProjectCount: 0,
        bossCount: 0,
        lastAction: "",
        updatedAt: "",
        createdAt: ""
      });
    }

    const row = map.get(key);
    const add = (set, value) => { if(value) set.add(value); };

    add(row.regionSet, p.region);
    add(row.categorySet, p.category);
    add(row.departmentSet, p.department);
    add(row.contactSet, p.contact);
    add(row.titleSet, p.title);
    add(row.levelSet, p.level);
    add(row.ownerSet, p.owner);
    add(row.productLineSet, p.productLine);
    add(row.productNameSet, p.productName);
    add(row.stages, p.stage);
    add(row.risks, p.risk);

    row.projectCount += 1;
    row.budget += Number(p.budget || 0);
    row.amount += Number(p.amount || 0);
    row.weighted += weight(p);
    if(isClosedProject(p)) row.closedAmount += Number(p.amount || 0);
    if(p.key === "是") row.keyProjectCount += 1;
    if(p.boss === "是") row.bossCount += 1;

    const pDate = projectDate(p);
    const rowDate = row.updatedAt ? new Date(row.updatedAt) : null;
    if(pDate && (!rowDate || pDate > rowDate)){
      row.updatedAt = p.updatedAt || p.createdAt || "";
      row.createdAt = p.createdAt || "";
      row.lastAction = p.next || "";
    }
  });

  return Array.from(map.values()).map((c, index) => ({
    "序号": index + 1,
    "客户单位": c.company,
    "区域": Array.from(c.regionSet).join("、"),
    "客户分类": Array.from(c.categorySet).join("、"),
    "院系/科室/平台": Array.from(c.departmentSet).join("、"),
    "联系人": Array.from(c.contactSet).join("、"),
    "职务/角色": Array.from(c.titleSet).join("、"),
    "客户等级": Array.from(c.levelSet).join("、"),
    "负责人": Array.from(c.ownerSet).join("、"),
    "产品线/解决方案": Array.from(c.productLineSet).join("、"),
    "具体产品名": Array.from(c.productNameSet).join("、"),
    "涉及项目数": c.projectCount,
    "项目预算合计（元）": Math.round(c.budget * 100) / 100,
    "预计成交金额合计（元）": Math.round(c.amount * 100) / 100,
    "已成交金额合计（元）": Math.round(c.closedAmount * 100) / 100,
    "加权预测金额合计（元）": Math.round(c.weighted * 100) / 100,
    "重点项目数": c.keyProjectCount,
    "需总经理介入项目数": c.bossCount,
    "销售阶段": Array.from(c.stages).join("、"),
    "风险等级": Array.from(c.risks).join("、"),
    "最近下一步动作": c.lastAction,
    "最近更新时间": dateText(c.updatedAt),
    "首次创建时间": dateText(c.createdAt)
  })).sort((a,b) => Number(b["预计成交金额合计（元）"] || 0) - Number(a["预计成交金额合计（元）"] || 0));
}

function autosizeWorksheetColumns(ws, rows){
  if(!rows || !rows.length) return;
  const headers = Object.keys(rows[0]);
  ws["!cols"] = headers.map(h => {
    const maxLen = Math.max(
      String(h).length,
      ...rows.slice(0, 200).map(r => excelSafeText(r[h]).length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 42) };
  });
}

async function exportExcel(){
  try{
    const exportData = await api("/api/export");
    const exportProjects = exportData.projects || projects || [];
    if(!exportProjects.length){
      showToast("当前没有可导出的项目数据。");
      return;
    }

    const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");

    const customerRows = buildCustomerRowsForExcel(exportProjects);
    const projectRows = buildProjectRowsForExcel(exportProjects);

    const wb = XLSX.utils.book_new();

    const customerWs = XLSX.utils.json_to_sheet(customerRows);
    autosizeWorksheetColumns(customerWs, customerRows);
    XLSX.utils.book_append_sheet(wb, customerWs, "客户信息");

    const projectWs = XLSX.utils.json_to_sheet(projectRows);
    autosizeWorksheetColumns(projectWs, projectRows);
    XLSX.utils.book_append_sheet(wb, projectWs, "项目明细");

    const statRows = [
      {"指标":"导出范围", "数值": exportData.scope === "all" ? "全量项目" : "本人项目"},
      {"指标":"导出人", "数值": exportData.user?.name || currentUser?.name || ""},
      {"指标":"导出时间", "数值": new Date().toLocaleString()},
      {"指标":"客户总数", "数值": customerRows.length},
      {"指标":"项目总数", "数值": projectRows.length},
      {"指标":"预计成交金额合计", "数值": sum(exportProjects, "amount")},
      {"指标":"已成交金额合计", "数值": exportProjects.filter(isClosedProject).reduce((a,b)=>a+Number(b.amount||0),0)},
      {"指标":"加权预测金额合计", "数值": exportProjects.reduce((a,b)=>a+weight(b),0)}
    ];
    const statWs = XLSX.utils.json_to_sheet(statRows);
    autosizeWorksheetColumns(statWs, statRows);
    XLSX.utils.book_append_sheet(wb, statWs, "导出说明");

    const scopeText = exportData.scope === "all" ? "全量" : "本人";
    const fileName = `客户项目管理_${scopeText}_客户信息与项目明细_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);

    showToast("Excel 已导出。");
  }catch(e){
    console.error(e);
    showToast(e.message || "Excel 导出失败，请稍后重试。");
  }
}

function groupedStats(arr, keyFn){
  const map = {};
  arr.forEach(p => {
    const key = keyFn(p) || "未填写";
    if(!map[key]) map[key] = { key, projects:0, customers:new Set(), amount:0, closed:0, weighted:0 };
    map[key].projects += 1;
    if(p.company) map[key].customers.add(p.company.trim());
    map[key].amount += Number(p.amount || 0);
    map[key].weighted += weight(p);
    if(isClosedProject(p)) map[key].closed += Number(p.amount || 0);
  });
  return Object.values(map).map(x => ({...x, customerCount:x.customers.size})).sort((a,b)=>b.amount-a.amount);
}

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



function renderProfile(){
  if(!currentUser) return;
  const roleMap = {sales:"销售账号", general_manager:"总经理", admin:"管理员"};
  if($("profileEmail")) $("profileEmail").value = currentUser.email || "";
  if($("profileName")) $("profileName").value = currentUser.name || "";
  if($("profileRole")) $("profileRole").value = `${roleMap[currentUser.role] || currentUser.role}（${currentUser.role || ""}）`;
  if($("profileTeam")) $("profileTeam").value = currentUser.teamName || "";
  if($("profilePhone")) $("profilePhone").value = currentUser.phone || "";
  if($("profileTitle")) $("profileTitle").value = currentUser.title || "";
  if($("profileDepartment")) $("profileDepartment").value = currentUser.department || "";
  if($("profileNote")) $("profileNote").value = currentUser.note || "";
}

async function saveProfile(){
  try{
    const payload = {
      name: $("profileName").value.trim(),
      phone: $("profilePhone").value.trim(),
      title: $("profileTitle").value.trim(),
      department: $("profileDepartment").value.trim(),
      note: $("profileNote").value.trim()
    };
    if(!payload.name){
      showToast("姓名 / 显示名称不能为空。");
      return;
    }
    const res = await api("/api/me", { method:"PUT", body: JSON.stringify(payload) });
    currentUser = res.user;
    $("currentUserName").textContent = currentUser.name;
    $("currentUserRole").textContent = roleLabel(currentUser.role);
    $("currentUserEmail").textContent = currentUser.email;
    renderProfile();
    showToast("个人资料已保存。");
    await loadAll();
  }catch(e){
    showToast(e.message);
  }
}

async function changePassword(){
  try{
    const p1 = $("newPassword").value;
    const p2 = $("confirmPassword").value;
    if(!p1 || !p2){
      showToast("请输入新密码并再次确认。");
      return;
    }
    if(p1 !== p2){
      showToast("两次输入的新密码不一致。");
      return;
    }
    if(p1.length < 6){
      showToast("新密码至少需要 6 位。");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: p1 });
    if(error) throw error;
    $("newPassword").value = "";
    $("confirmPassword").value = "";
    showToast("密码已修改。建议退出后用新密码重新登录验证。");
  }catch(e){
    showToast(e.message || "密码修改失败。");
  }
}

function renderSalesStats(){
  const yearProjects = projects.filter(isThisYearProject);
  const closedProjects = projects.filter(isClosedProject);
  const yearClosed = projects.filter(p => isClosedProject(p) && isThisYearProject(p));

  const setText = (id, value) => { if($(id)) $(id).textContent = value; };

  setText("statYearClosedAmount", money(sum(yearClosed, "amount")));
  setText("statYearClosedCount", yearClosed.length);
  setText("statPipelineAmount", money(sum(projects, "amount")));
  setText("statWeightedAmount", money(projects.reduce((a,b)=>a+weight(b),0)));
  setText("statCustomerCount", uniqueCount(projects, "company"));
  setText("statYearNewCustomers", uniqueCount(yearProjects, "company"));
  setText("statHighPriorityCount", projects.filter(p=>["S","A"].includes(p.priority)).length);
  setText("statHighRiskCount", projects.filter(p=>p.risk==="高").length);
  setText("statNeedBossCount", projects.filter(p=>p.boss==="是").length);
  setText("statAvgAmount", money(projects.length ? sum(projects, "amount") / projects.length : 0));

  const ownerStats = groupedStats(projects, p => p.owner || "未分配");
  const ownerBody = $("ownerStatsRows");
  if(ownerBody){
    ownerBody.innerHTML = ownerStats.length ? ownerStats.map(x=>`
      <tr>
        <td><strong>${esc(x.key)}</strong></td>
        <td>${x.projects}</td>
        <td>${x.customerCount}</td>
        <td>${money(x.amount)}</td>
        <td><span class="stat-positive">${money(x.closed)}</span></td>
        <td>${money(x.weighted)}</td>
      </tr>`).join("") : `<tr><td colspan="6" class="empty">暂无销售统计数据</td></tr>`;
  }

  const productStats = groupedStats(projects, p => p.productLine || "未填写");
  const productBody = $("productStatsRows");
  if(productBody){
    productBody.innerHTML = productStats.length ? productStats.map(x=>`
      <tr>
        <td><strong>${esc(x.key)}</strong></td>
        <td>${x.projects}</td>
        <td>${money(x.amount)}</td>
        <td><span class="stat-positive">${money(x.closed)}</span></td>
        <td>${money(x.weighted)}</td>
      </tr>`).join("") : `<tr><td colspan="5" class="empty">暂无产品线统计数据</td></tr>`;
  }

  const categoryAmounts = groupBy(projects, p => p.category || "未填写", p => Number(p.amount || 0));
  renderBars("categoryStatsBars", categoryAmounts, "orange");

  const closedTop = yearClosed.sort((a,b)=>Number(b.amount||0)-Number(a.amount||0)).slice(0,10);
  const closedBody = $("closedTopRows");
  if(closedBody){
    closedBody.innerHTML = closedTop.length ? closedTop.map(p=>`
      <tr>
        <td><strong>${esc(p.company)}</strong></td>
        <td>${esc(p.owner)}</td>
        <td>${esc(p.productLine)}</td>
        <td><span class="stat-positive">${money(p.amount)}</span></td>
        <td class="stat-muted">${dateText(p.updatedAt || p.createdAt)}</td>
      </tr>`).join("") : `<tr><td colspan="5" class="empty">今年暂无合同/成交项目</td></tr>`;
  }
}

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
function renderSettings(){
  if($("regionPills")){
    $("regionPills").innerHTML = (config.regions || []).map(x =>
      `<span class="pill">${esc(x)}${canEditConfig()?`<button data-remove-region="${esc(x)}">×</button>`:""}</span>`
    ).join("");
  }

  fillSelect("configProductLine", Object.keys(config.productLines || {}));
  renderProductConfig();
  renderTeamConfig();
}

function renderProductConfig(){
  const lines = Object.keys(config.productLines || {});
  const line = $("configProductLine")?.value || lines[0] || "";

  if($("configProductLine")){
    fillSelect("configProductLine", lines);
    $("configProductLine").value = line;
  }

  if($("editProductLineName")) $("editProductLineName").value = line || "";

  const items = (config.productLines || {})[line] || [];

  if($("configProductName")){
    fillSelect("configProductName", items);
  }

  const selectedProductName = $("configProductName")?.value || items[0] || "";
  if($("configProductName")) $("configProductName").value = selectedProductName;
  if($("editProductName")) $("editProductName").value = selectedProductName || "";

  if($("productPills")){
    $("productPills").innerHTML = `<div class="pill-list">${items.map(x=>`<span class="pill">${esc(x)}${canEditConfig()?`<button data-remove-product="${esc(x)}">×</button>`:""}</span>`).join("")}</div>`;
  }
}

function renderTeamConfig(){
  const teams = config.teams || [];

  if($("configTeam")){
    fillSelect("configTeam", teams);
  }

  const selectedTeam = $("configTeam")?.value || teams[0] || "";
  if($("configTeam")) $("configTeam").value = selectedTeam;
  if($("editTeamName")) $("editTeamName").value = selectedTeam || "";

  if($("teamPills")){
    $("teamPills").innerHTML = `<div class="pill-list">${teams.map(x=>`<span class="pill">${esc(x)}${canEditConfig()?`<button data-remove-team="${esc(x)}">×</button>`:""}</span>`).join("")}</div>`;
  }
}

async function saveConfig(){ if(!canEditConfig()) throw new Error("只有总经理或管理员可以修改基础配置。"); await api("/api/config",{method:"PUT",body:JSON.stringify({config})}); }
async function addRegion(){try{const v=$("newRegion").value.trim(); if(v&&!config.regions.includes(v)){config.regions.push(v); await saveConfig(); showToast("区域已保存。"); await loadAll();} $("newRegion").value="";}catch(e){showToast(e.message)}}
async function addProductLine(){
  try{
    const input = $("newProductLineName");
    let name = input?.value?.trim();
    if(!name){
      name = prompt("请输入新的产品线/解决方案名称");
    }
    if(name && !config.productLines[name]){
      config.productLines[name]=[];
      await saveConfig();
      if(input) input.value="";
      showToast("产品线已保存。");
      await loadAll();
      if($("configProductLine")){
        $("configProductLine").value = name;
        renderProductConfig();
      }
    }else if(name){
      showToast("该产品线已存在。");
    }
  }catch(e){showToast(e.message)}
}
async function addProductName(){
  try{
    const line=$("configProductLine")?.value;
    const name=$("newProductName")?.value?.trim();
    if(line&&name&&!config.productLines[line].includes(name)){
      config.productLines[line].push(name);
      await saveConfig();
      showToast("具体产品名已保存。");
      $("newProductName").value="";
      await loadAll();
      if($("configProductLine")){
        $("configProductLine").value = line;
        renderProductConfig();
      }
    }else if(name){
      showToast("该产品名已存在。");
    }
  }catch(e){showToast(e.message)}
}

async function renameProductLine(){
  try{
    if(!canEditConfig()) throw new Error("只有总经理或管理员可以修改基础配置。");
    const oldName = $("configProductLine")?.value || "";
    const newName = $("editProductLineName")?.value?.trim() || "";
    if(!oldName){ showToast("请先选择要修改的产品线。"); return; }
    if(!newName){ showToast("产品线名称不能为空。"); return; }
    if(oldName === newName){ showToast("产品线名称未变化。"); return; }
    if(config.productLines[newName]){ showToast("新的产品线名称已存在。"); return; }

    config.productLines[newName] = config.productLines[oldName] || [];
    delete config.productLines[oldName];
    await saveConfig();

    const affected = projects.filter(p => p.productLine === oldName);
    for(const p of affected){
      await api("/api/projects",{method:"PUT",body:JSON.stringify({...p, productLine:newName})});
    }

    showToast(affected.length ? `产品线已修改，并同步更新 ${affected.length} 个项目。` : "产品线已修改。");
    await loadAll();
    if($("configProductLine")){
      $("configProductLine").value = newName;
      renderProductConfig();
    }
  }catch(e){showToast(e.message)}
}

async function deleteProductLine(){
  try{
    if(!canEditConfig()) throw new Error("只有总经理或管理员可以修改基础配置。");
    const line = $("configProductLine")?.value || "";
    if(!line){ showToast("请先选择要删除的产品线。"); return; }

    const usedCount = projects.filter(p => p.productLine === line).length;
    const products = config.productLines[line] || [];
    const msg = usedCount
      ? `该产品线已有 ${usedCount} 个项目在使用。建议先重命名或调整项目后再删除。仍要删除吗？`
      : `确认删除产品线“${line}”及其 ${products.length} 个具体产品名吗？`;
    if(!confirm(msg)) return;

    delete config.productLines[line];
    await saveConfig();

    showToast("产品线已删除。");
    await loadAll();
  }catch(e){showToast(e.message)}
}

async function renameProductName(){
  try{
    if(!canEditConfig()) throw new Error("只有总经理或管理员可以修改基础配置。");
    const line = $("configProductLine")?.value || "";
    const oldName = $("configProductName")?.value || "";
    const newName = $("editProductName")?.value?.trim() || "";

    if(!line){ showToast("请先选择产品线。"); return; }
    if(!oldName){ showToast("请先选择要修改的具体产品名。"); return; }
    if(!newName){ showToast("具体产品名不能为空。"); return; }
    if(oldName === newName){ showToast("具体产品名未变化。"); return; }
    if((config.productLines[line] || []).includes(newName)){ showToast("新的具体产品名已存在。"); return; }

    config.productLines[line] = (config.productLines[line] || []).map(x => x === oldName ? newName : x);
    await saveConfig();

    const affected = projects.filter(p => p.productLine === line && p.productName === oldName);
    for(const p of affected){
      await api("/api/projects",{method:"PUT",body:JSON.stringify({...p, productName:newName})});
    }

    showToast(affected.length ? `产品名已修改，并同步更新 ${affected.length} 个项目。` : "产品名已修改。");
    await loadAll();
    if($("configProductLine")){
      $("configProductLine").value = line;
      renderProductConfig();
      if($("configProductName")) $("configProductName").value = newName;
      if($("editProductName")) $("editProductName").value = newName;
    }
  }catch(e){showToast(e.message)}
}

async function deleteProductName(){
  try{
    if(!canEditConfig()) throw new Error("只有总经理或管理员可以修改基础配置。");
    const line = $("configProductLine")?.value || "";
    const name = $("configProductName")?.value || "";

    if(!line || !name){ showToast("请先选择要删除的具体产品名。"); return; }

    const usedCount = projects.filter(p => p.productLine === line && p.productName === name).length;
    const msg = usedCount
      ? `该产品名已有 ${usedCount} 个项目在使用。删除后不会自动清空历史项目，但后续下拉不再出现。仍要删除吗？`
      : `确认删除具体产品名“${name}”吗？`;
    if(!confirm(msg)) return;

    config.productLines[line] = (config.productLines[line] || []).filter(x => x !== name);
    await saveConfig();

    showToast("具体产品名已删除。");
    await loadAll();
    if($("configProductLine")){
      $("configProductLine").value = line;
      renderProductConfig();
    }
  }catch(e){showToast(e.message)}
}

async function removeRegion(name){try{config.regions=config.regions.filter(x=>x!==name); await saveConfig(); await loadAll();}catch(e){showToast(e.message)}}
async function removeProduct(name){
  try{
    const line=$("configProductLine")?.value;
    if(!line || !name) return;
    const usedCount = projects.filter(p => p.productLine === line && p.productName === name).length;
    const msg = usedCount
      ? `该产品名已有 ${usedCount} 个项目在使用。删除后不会自动清空历史项目，但后续下拉不再出现。仍要删除吗？`
      : `确认删除具体产品名“${name}”吗？`;
    if(!confirm(msg)) return;
    config.productLines[line]=(config.productLines[line]||[]).filter(x=>x!==name);
    await saveConfig();
    await loadAll();
    if($("configProductLine")){
      $("configProductLine").value = line;
      renderProductConfig();
    }
  }catch(e){showToast(e.message)}
}

async function addTeam(){
  try{
    if(!canEditConfig()) throw new Error("只有总经理或管理员可以修改基础配置。");
    const name = $("newTeamName")?.value?.trim() || "";
    if(!name){ showToast("请输入团队名称。"); return; }
    config.teams = config.teams || [];
    if(config.teams.includes(name)){ showToast("该团队已存在。"); return; }

    config.teams.push(name);
    await saveConfig();

    $("newTeamName").value = "";
    showToast("销售团队已新增。");
    await loadAll();
    if($("configTeam")){
      $("configTeam").value = name;
      renderTeamConfig();
    }
  }catch(e){showToast(e.message)}
}

async function renameTeam(){
  try{
    if(!canEditConfig()) throw new Error("只有总经理或管理员可以修改基础配置。");
    const oldName = $("configTeam")?.value || "";
    const newName = $("editTeamName")?.value?.trim() || "";
    if(!oldName){ showToast("请先选择要修改的团队。"); return; }
    if(!newName){ showToast("团队名称不能为空。"); return; }
    if(oldName === newName){ showToast("团队名称未变化。"); return; }
    if((config.teams || []).includes(newName)){ showToast("新的团队名称已存在。"); return; }

    config.teams = (config.teams || []).map(x => x === oldName ? newName : x);
    await saveConfig();

    const affected = projects.filter(p => p.team === oldName);
    for(const p of affected){
      await api("/api/projects",{method:"PUT",body:JSON.stringify({...p, team:newName})});
    }

    showToast(affected.length ? `团队已修改，并同步更新 ${affected.length} 个项目。` : "团队已修改。");
    await loadAll();
    if($("configTeam")){
      $("configTeam").value = newName;
      renderTeamConfig();
    }
  }catch(e){showToast(e.message)}
}

async function deleteTeam(){
  try{
    if(!canEditConfig()) throw new Error("只有总经理或管理员可以修改基础配置。");
    const team = $("configTeam")?.value || "";
    if(!team){ showToast("请先选择要删除的团队。"); return; }

    const usedCount = projects.filter(p => p.team === team).length;
    const msg = usedCount
      ? `该团队已有 ${usedCount} 个项目在使用。删除后不会自动清空历史项目，但新增项目下拉不再出现。仍要删除吗？`
      : `确认删除团队“${team}”吗？`;
    if(!confirm(msg)) return;

    config.teams = (config.teams || []).filter(x => x !== team);
    await saveConfig();

    showToast("销售团队已删除。");
    await loadAll();
  }catch(e){showToast(e.message)}
}

async function removeTeam(name){
  try{
    if(!canEditConfig()) throw new Error("只有总经理或管理员可以修改基础配置。");
    if(!name) return;

    const usedCount = projects.filter(p => p.team === name).length;
    const msg = usedCount
      ? `该团队已有 ${usedCount} 个项目在使用。删除后不会自动清空历史项目，但新增项目下拉不再出现。仍要删除吗？`
      : `确认删除团队“${name}”吗？`;
    if(!confirm(msg)) return;

    config.teams = (config.teams || []).filter(x => x !== name);
    await saveConfig();

    showToast("销售团队已删除。");
    await loadAll();
  }catch(e){showToast(e.message)}
}

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
async function exportJSON(){
  await exportExcel();
}
function renderAll(){renderDashboard(); renderSalesStats(); renderProjects(); renderKeyProjects(); renderFunnel(); renderSettings(); renderProfile();}
function showToast(msg){const el=$("toast"); el.textContent=msg; el.classList.add("show"); setTimeout(()=>el.classList.remove("show"),3200)}
function on(id, eventName, handler){
  const el = $(id);
  if(el) el.addEventListener(eventName, handler);
}

function bind(){
  on("loginBtn", "click", login);
  on("loginPassword", "keydown", e=>{ if(e.key==="Enter") login(); });
  on("logoutBtn", "click", logout);

  document.querySelectorAll(".nav button").forEach(btn=>btn.addEventListener("click",()=>{
    const id=btn.dataset.page;
    if(!canSeeAll() && id==="dashboard"){
      setActivePage("projects");
      return;
    }
    setActivePage(id);
    renderAll();
  }));

  on("refreshBtn", "click", loadAll);
  on("exportBtn", "click", exportJSON);
  on("newBtn", "click", ()=>openDrawer());
  on("saveProfileBtn", "click", saveProfile);
  on("changePasswordBtn", "click", changePassword);
  on("closeDrawerBtn", "click", closeDrawer);
  on("cancelProjectBtn", "click", closeDrawer);
  on("saveProjectBtn", "click", saveProject);
  on("f_productLine", "change", syncProductOptions);
  on("f_stage", "change", ()=>syncWinFromStage(true));
  on("resetFilterBtn", "click", clearFilters);

  ["searchText","filterRegion","filterProductLine","filterStage","filterOwner","filterRisk"].forEach(id=>{
    on(id, "input", renderProjects);
    on(id, "change", renderProjects);
  });

  on("addRegionBtn", "click", addRegion);
  on("addProductLineBtn", "click", addProductLine);
  on("addProductNameBtn", "click", addProductName);
  on("renameProductLineBtn", "click", renameProductLine);
  on("deleteProductLineBtn", "click", deleteProductLine);
  on("renameProductNameBtn", "click", renameProductName);
  on("deleteProductNameBtn", "click", deleteProductName);
  on("configProductLine", "change", renderProductConfig);
  on("configProductName", "change", ()=>{
    if($("editProductName")) $("editProductName").value = $("configProductName").value || "";
  });

  on("configTeam", "change", ()=>{
    if($("editTeamName")) $("editTeamName").value = $("configTeam").value || "";
  });
  on("addTeamBtn", "click", addTeam);
  on("renameTeamBtn", "click", renameTeam);
  on("deleteTeamBtn", "click", deleteTeam);

  if(document.body){
    document.body.addEventListener("click",(e)=>{
      if(e.target.dataset.edit) openDrawer(projects.find(p=>p.id===e.target.dataset.edit));
      if(e.target.dataset.del) deleteProject(e.target.dataset.del);
      if(e.target.dataset.removeRegion) removeRegion(e.target.dataset.removeRegion);
      if(e.target.dataset.removeProduct) removeProduct(e.target.dataset.removeProduct);
      if(e.target.dataset.removeTeam) removeTeam(e.target.dataset.removeTeam);
    });
  }
}

async function start(){
  try{
    bind();
  }catch(err){
    console.error("初始化事件绑定失败：", err);
    if($("loginMsg")) $("loginMsg").textContent = "页面初始化失败：" + (err.message || err);
    return;
  }

  try{
    await initSupabase();
    const s = await session();
    if(s) await bootstrapAfterLogin();
  }catch(err){
    console.error("初始化 Supabase 失败：", err);
    if($("loginMsg")) $("loginMsg").textContent = err.message || "初始化失败，请检查环境变量。";
    if($("loginScreen")) $("loginScreen").classList.remove("hidden");
    if($("appRoot")) $("appRoot").classList.add("hidden");
  }
}
start();

