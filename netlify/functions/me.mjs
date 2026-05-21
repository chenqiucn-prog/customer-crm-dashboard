import { JSON_HEADERS, error, getAuthContext, json, profileToUser } from "./utils.mjs";

export default async (request) => {
  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: JSON_HEADERS });
  try {
    const { profile } = await getAuthContext(request);
    return json({ ok: true, user: profileToUser(profile) });
  } catch (err) {
    return error(err.message || "未授权。", err.status || 500);
  }
};
