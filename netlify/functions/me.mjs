import { JSON_HEADERS, error, getAuthContext, json, profileToUser, readBody } from "./utils.mjs";

function cleanText(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

export default async (request) => {
  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: JSON_HEADERS });

  try {
    const { db, profile } = await getAuthContext(request);

    if (request.method === "GET") {
      return json({ ok: true, user: profileToUser(profile) });
    }

    if (request.method === "PUT" || request.method === "POST") {
      const body = await readBody(request);

      const payload = {
        p_name: cleanText(body.name, 80),
        p_phone: cleanText(body.phone, 40),
        p_title: cleanText(body.title, 80),
        p_department: cleanText(body.department, 120),
        p_note: cleanText(body.note, 500)
      };

      if (!payload.p_name) {
        return error("姓名不能为空。", 422);
      }

      const { data, error: dbError } = await db.rpc("update_my_profile", payload).single();

      if (dbError) {
        return error(dbError.message, 500);
      }

      return json({ ok: true, user: profileToUser(data) });
    }

    return error(`不支持的请求方法：${request.method}`, 405);
  } catch (err) {
    return error(err.message || "未授权。", err.status || 500);
  }
};
