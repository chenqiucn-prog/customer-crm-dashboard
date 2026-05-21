import { error, json, publicConfig } from "./utils.mjs";

export default async () => {
  try {
    return json({ ok: true, ...publicConfig() });
  } catch (err) {
    return error("读取公开配置失败。", 500, err.message);
  }
};
