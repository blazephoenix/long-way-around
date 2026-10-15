// Save a generated file: through the artifact `downloads` capability when hosted on claude.ai,
// otherwise a plain browser download (local or zip builds).
type DL = { save(r: { filename: string; data: Blob | string | ArrayBuffer }): Promise<unknown> } | null;
let dl: Promise<DL> | null = null;

function capability(): Promise<DL> {
  if (dl) return dl;
  const c = (window as any).claude;
  dl = c?.use ? Promise.race([c.use('downloads') as Promise<DL>, new Promise<DL>((r) => setTimeout(() => r(null), 4000))]).catch(() => null) : Promise.resolve(null);
  return dl;
}

export async function saveFile(filename: string, data: Blob): Promise<'saved' | 'declined' | 'fallback'> {
  const cap = await capability();
  if (cap) {
    try {
      await cap.save({ filename, data });
      return 'saved';
    } catch (e: any) {
      if (e?.code === 'declined' || e?.code === 'rate_limited') return 'declined';
    }
  }
  try {
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch {
    /* downloads unavailable */
  }
  return 'fallback';
}
