import {
  JSON_HEADERS,
  canSeeAll,
  error,
  getAuthContext,
  json,
  projectToRow,
  readBody,
  rowToProject,
  validateProject
} from "./utils.mjs";

async function getExistingProject(db, id) {
  const { data, error: dbError } = await db.from("sales_projects").select("*").eq("id", id).single();
  if (dbError || !data) return null;
  return data;
}

export default async (request) => {
  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: JSON_HEADERS });

  try {
    const { db, user, profile } = await getAuthContext(request);
    const fullAccess = canSeeAll(profile);

    if (request.method === "GET") {
      let query = db.from("sales_projects").select("*").order("updated_at", { ascending: false });
      if (!fullAccess) query = query.eq("owner_user_id", user.id);

      const { data, error: dbError } = await query;
      if (dbError) return error(dbError.message, 500);
      return json({ ok: true, projects: (data || []).map(rowToProject), scope: fullAccess ? "all" : "own" });
    }

    if (request.method === "POST") {
      const input = await readBody(request);
      const msg = validateProject(input);
      if (msg) return error(msg, 422);

      let ownerUserId = fullAccess && input.ownerUserId ? input.ownerUserId : user.id;

      // 销售创建项目时，强制归属自己；总经理/管理员可以指定归属销售
      const ownerProfile = await db.from("app_users").select("*").eq("id", ownerUserId).eq("enabled", true).single();
      if (ownerProfile.error || !ownerProfile.data) return error("项目归属人不存在或已停用。", 422);

      const row = projectToRow(
        { ...input, owner: ownerProfile.data.name, team: ownerProfile.data.team_name || input.team || "" },
        ownerUserId,
        user.id
      );

      const { data, error: dbError } = await db.from("sales_projects").insert(row).select("*").single();
      if (dbError) return error(dbError.message, 500);
      return json({ ok: true, project: rowToProject(data) }, 201);
    }

    if (request.method === "PUT") {
      const input = await readBody(request);
      if (!input.id) return error("更新项目必须提供 id。", 422);

      const existing = await getExistingProject(db, input.id);
      if (!existing) return error("未找到对应项目。", 404);
      if (!fullAccess && existing.owner_user_id !== user.id) return error("无权编辑非本人项目。", 403);

      const msg = validateProject(input);
      if (msg) return error(msg, 422);

      let ownerUserId = existing.owner_user_id;
      if (fullAccess && input.ownerUserId) ownerUserId = input.ownerUserId;

      const ownerProfile = await db.from("app_users").select("*").eq("id", ownerUserId).eq("enabled", true).single();
      if (ownerProfile.error || !ownerProfile.data) return error("项目归属人不存在或已停用。", 422);

      const row = projectToRow(
        { ...input, owner: ownerProfile.data.name, team: ownerProfile.data.team_name || input.team || "" },
        ownerUserId,
        existing.created_by_user_id || user.id
      );

      const { data, error: dbError } = await db.from("sales_projects").update(row).eq("id", input.id).select("*").single();
      if (dbError) return error(dbError.message, 500);
      return json({ ok: true, project: rowToProject(data) });
    }

    if (request.method === "DELETE") {
      const url = new URL(request.url);
      const id = url.searchParams.get("id");
      if (!id) return error("删除项目必须提供 id。", 422);

      const existing = await getExistingProject(db, id);
      if (!existing) return error("未找到对应项目。", 404);
      if (!fullAccess && existing.owner_user_id !== user.id) return error("无权删除非本人项目。", 403);

      const { error: dbError } = await db.from("sales_projects").delete().eq("id", id);
      if (dbError) return error(dbError.message, 500);
      return json({ ok: true, deletedId: id });
    }

    return error(`不支持的请求方法：${request.method}`, 405);
  } catch (err) {
    return error(err.message || "服务器处理失败。", err.status || 500);
  }
};
