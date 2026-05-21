import { canSeeAll, error, getAuthContext, json, rowToProject } from "./utils.mjs";

export default async (request) => {
  try {
    const { db, user, profile } = await getAuthContext(request);
    const fullAccess = canSeeAll(profile);

    const cfg = await db.from("app_config").select("value").eq("key", "main").single();
    if (cfg.error) return error(cfg.error.message, 500);

    let query = db.from("sales_projects").select("*").order("updated_at", { ascending: false });
    if (!fullAccess) query = query.eq("owner_user_id", user.id);

    const prj = await query;
    if (prj.error) return error(prj.error.message, 500);

    return json({
      ok: true,
      exportedAt: new Date().toISOString(),
      scope: fullAccess ? "all" : "own",
      user: { id: profile.id, name: profile.name, email: profile.email, role: profile.role },
      config: cfg.data.value,
      projects: (prj.data || []).map(rowToProject)
    });
  } catch (err) {
    return error(err.message || "导出失败。", err.status || 500);
  }
};
