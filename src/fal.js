// فال حافظ از یه سرویس عمومی رایگان گرفته میشه (نه تولید داخلی)
export async function getHafezFal() {
  try {
    const res = await fetch("https://hafez-dxle.onrender.com/fal", {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const poem = data?.poem || data?.text || data?.ghazal;
    if (!poem) return { ok: false };
    return { ok: true, poem: poem.trim(), interpretation: data?.interpretation || "" };
  } catch {
    return { ok: false };
  }
}
