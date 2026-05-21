import { createClient } from "@supabase/supabase-js";

export const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "Content-Type,Authorization"
};

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

export function error(message, status = 400, detail = undefined) {
  return json({ ok: false, error: message, detail }, status);
}

export function publicConfig() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("缺少 SUPABASE_URL 或 SUPABASE_ANON_KEY。");
  return { supabaseUrl: url, supabaseAnonKey: anonKey };
}

export function userClient(accessToken) {
  const { supabaseUrl, supabaseAnonKey } = publicConfig();
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

export function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

export async function getAuthContext(request) {
  const token = bearerToken(request);
  if (!token) throw Object.assign(new Error("未登录或登录已过期。"), { status: 401 });

  const db = userClient(token);

  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData?.user) {
    throw Object.assign(new Error("登录状态无效，请重新登录。"), { status: 401 });
  }

  const user = userData.user;

  const { data: profile, error: profileError } = await db
    .from("app_users")
    .select("*")
    .eq("id", user.id)
    .eq("enabled", true)
    .single();

  if (profileError || !profile) {
    throw Object.assign(
      new Error("该账号尚未在 app_users 表中配置角色，或已被停用。"),
      { status: 403 }
    );
  }

  return { db, user, profile };
}

export function canSeeAll(profile) {
  return ["general_manager", "admin"].includes(profile.role);
}

export function canWriteConfig(profile) {
  return ["general_manager", "admin"].includes(profile.role);
}

export async function readBody(request) {
  try { return await request.json(); }
  catch { throw new Error("请求体不是有效 JSON。"); }
}

export function profileToUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    enabled: row.enabled,
    teamName: row.team_name || "",
    phone: row.phone || "",
    title: row.title || "",
    department: row.department || "",
    note: row.note || ""
  };
}

export function rowToProject(row) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    createdByUserId: row.created_by_user_id,
    region: row.region || "",
    category: row.category || "",
    company: row.company || "",
    department: row.department || "",
    contact: row.contact || "",
    title: row.title || "",
    level: row.customer_level || "",
    productLine: row.product_line || "",
    productName: row.product_name || "",
    budget: Number(row.budget || 0),
    amount: Number(row.amount || 0),
    win: Number(row.win || 0),
    stage: row.stage || "",
    owner: row.owner_name || "",
    team: row.team_name || "",
    priority: row.priority || "",
    key: row.is_key_project ? "是" : "否",
    risk: row.risk_level || "",
    boss: row.need_boss ? "是" : "否",
    research: row.research || "",
    next: row.next_action || "",
    note: row.note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function projectToRow(input, ownerUserId, createdByUserId) {
  return {
    owner_user_id: ownerUserId,
    created_by_user_id: createdByUserId || null,
    region: input.region || "",
    category: input.category || "",
    company: input.company || "",
    department: input.department || "",
    contact: input.contact || "",
    title: input.title || "",
    customer_level: input.level || "",
    product_line: input.productLine || "",
    product_name: input.productName || "",
    budget: Number(input.budget || 0),
    amount: Number(input.amount || 0),
    win: Number(input.win || 0),
    stage: input.stage || "",
    owner_name: input.owner || "",
    team_name: input.team || "",
    priority: input.priority || "",
    is_key_project: input.key === "是" || input.is_key_project === true,
    risk_level: input.risk || "",
    need_boss: input.boss === "是" || input.need_boss === true,
    research: input.research || "",
    next_action: input.next || "",
    note: input.note || ""
  };
}

export function validateProject(p) {
  if (!p.company) return "单位名称不能为空。";
  if (!p.productLine) return "产品线/解决方案不能为空。";
  if (!p.productName) return "具体产品名不能为空。";
  if (Number.isNaN(Number(p.budget)) || Number.isNaN(Number(p.amount)) || Number.isNaN(Number(p.win))) {
    return "预算、预计成交金额、赢率必须是数字。";
  }
  if (Number(p.win) < 0 || Number(p.win) > 1) return "赢率必须在 0 到 1 之间。";
  return "";
}
