import {
  JSON_HEADERS,
  canWriteConfig,
  error,
  getAuthContext,
  json,
  readBody
} from "./utils.mjs";

function validateConfig(config) {
  if (!config || typeof config !== "object") return "配置必须是对象。";
  if (!Array.isArray(config.regions)) return "regions 必须是数组。";
  if (!Array.isArray(config.stages)) return "stages 必须是数组。";
  if (!config.productLines || typeof config.productLines !== "object") return "productLines 必须是对象。";
  return "";
}

export default async (request) => {
  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: JSON_HEADERS });

  try {
    const { db, profile } = await getAuthContext(request);

    if (request.method === "GET") {
      const { data, error: dbError } = await db.from("app_config").select("value").eq("key", "main").single();
      if (dbError) return error(dbError.message, 500);
      return json({ ok: true, config: data.value });
    }

    if (!canWriteConfig(profile)) return error("只有总经理或管理员可以修改基础配置。", 403);

    if (request.method === "PUT" || request.method === "POST") {
      const body = await readBody(request);
      const config = body.config || body;
      const msg = validateConfig(config);
      if (msg) return error(msg, 422);

      const { error: dbError } = await db.from("app_config").upsert({ key: "main", value: config });
      if (dbError) return error(dbError.message, 500);
      return json({ ok: true, config });
    }

    return error(`不支持的请求方法：${request.method}`, 405);
  } catch (err) {
    return error(err.message || "服务器处理失败。", err.status || 500);
  }
};
