import { JSON_HEADERS, canSeeAll, error, getAuthContext, json, profileToUser } from "./utils.mjs";

export default async (request) => {
  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: JSON_HEADERS });
  try {
    const { db, profile } = await getAuthContext(request);

    let query = db.from("app_users").select("*").eq("enabled", true).order("name", { ascending: true });
    if (!canSeeAll(profile)) query = query.eq("id", profile.id);

    const { data, error: dbError } = await query;
    if (dbError) return error(dbError.message, 500);

    return json({ ok: true, users: (data || []).map(profileToUser) });
  } catch (err) {
    return error(err.message || "未授权。", err.status || 500);
  }
};
