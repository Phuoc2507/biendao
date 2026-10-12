// Kế hoạch <video> phát (thuần, test bằng node --test). Mỗi element gắn với một
// khoá mediaId@offset: các vũ công cùng tệp và cùng độ lệch (bản nhân bản chưa
// canon) dùng chung MỘT element + một texture; lệch khác nhau thì element riêng.

export interface PlayerDancer {
  id: string;
  mediaId: string | null;
  offsetSec: number;
  durationSec: number;
  hidden: boolean;
}

const ms = (x: number) => Math.round((Number.isFinite(x) ? x : 0) * 1000);

export const playerKey = (mediaId: string, offsetSec: number): string => `${mediaId}@${ms(offsetSec)}`;
export const keyMedia = (key: string): string => key.slice(0, key.lastIndexOf("@"));

export interface Want {
  mediaId: string;
  offsetSec: number;
  durationSec: number;
}

/** Element cần có: vũ công đang hiện, video đã nạp. Trả khoá theo vũ công và theo element. */
export function wantPlayers(ds: PlayerDancer[], hasMedia: (id: string) => boolean): {
  byKey: Map<string, Want>;
  assign: Map<string, string>;
} {
  const byKey = new Map<string, Want>();
  const assign = new Map<string, string>();
  for (const d of ds) {
    if (d.hidden || !d.mediaId || !hasMedia(d.mediaId)) continue;
    const k = playerKey(d.mediaId, d.offsetSec);
    assign.set(d.id, k);
    const w = byKey.get(k);
    if (!w) byKey.set(k, { mediaId: d.mediaId, offsetSec: d.offsetSec, durationSec: d.durationSec });
    else if (d.durationSec > w.durationSec) w.durationSec = d.durationSec;
  }
  return { byKey, assign };
}

/**
 * Đối chiếu element đang có với element cần có. Element mồ côi cùng tệp được
 * đổi khoá (dùng lại, khỏi tạo mới, không chớp trắng khi kéo độ lệch), ưu tiên
 * element mà chính vũ công đó đang dùng trước đây.
 */
export function planPlayers(
  want: Map<string, Want>,
  assign: Map<string, string>,
  prevAssign: Map<string, string>,
  existing: Iterable<string>,
): { renames: [string, string][]; creates: string[]; drops: string[] } {
  const have = new Set(existing);
  const orphans = [...have].filter((k) => !want.has(k));
  const missing = [...want.keys()].filter((k) => !have.has(k));
  const renames: [string, string][] = [];
  const used = new Set<string>();
  const creates: string[] = [];
  for (const k of missing) {
    const media = want.get(k)!.mediaId;
    // element trước đây của một vũ công nay mang khoá k
    let from: string | undefined;
    for (const [did, nk] of assign) {
      if (nk !== k) continue;
      const pk = prevAssign.get(did);
      if (pk && !used.has(pk) && orphans.includes(pk) && keyMedia(pk) === media) { from = pk; break; }
    }
    from ??= orphans.find((o) => !used.has(o) && keyMedia(o) === media);
    if (from) {
      used.add(from);
      renames.push([from, k]);
    } else creates.push(k);
  }
  const drops = orphans.filter((o) => !used.has(o));
  return { renames, creates, drops };
}
