// Tệp ▸ Phương án…: lưu nhiều bản chụp có tên của bài, mở qua lại, so sánh
// với bản đang làm. Bản chụp nằm trong trình duyệt, dùng chung video và nhạc.

import { useEffect, useMemo, useRef, useState } from "react";
import { st, useProject } from "../store";
import { applyProject } from "../export/save";
import { normalizeProject } from "../intake";
import {
  type Variant, backupBeforeSwitch, changeText, defaultVariantName, diffProjects, fmtSavedAt, sameProject, variantSummary,
} from "../variants";
import { variants, onVariantsChange } from "../variantsDb";
import { errText } from "../storage";
import { Icon } from "./icons";
import "../export/export.css";

const SHOW = 40; // so sánh: hiện tối đa từng ấy dòng

export function VariantsDialog({ onClose }: { onClose: () => void }) {
  const p = useProject();
  const [list, setList] = useState<Variant[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cmp, setCmp] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string; text: string } | null>(null);
  const [working, setWorking] = useState(false);
  const skipRename = useRef(false); // Esc ở ô đổi tên: bỏ, không lưu khi ô mất focus

  useEffect(() => {
    let live = true;
    const load = () =>
      variants.list().then(
        (l) => live && (setList(l), setErr(null)),
        (e) => live && (setList([]), setErr(errText(e, "Không đọc được phương án đã lưu"))),
      );
    void load();
    const off = onVariantsChange(() => void load());
    return () => {
      live = false;
      off();
    };
  }, []);

  // Esc đóng hộp (ô đổi tên tự lo Esc của nó); chặn phím tắt chung
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement | null)?.dataset?.rename) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", f, true);
    return () => window.removeEventListener("keydown", f, true);
  }, [onClose]);

  const names = (list ?? []).map((v) => v.name);
  const placeholder = defaultVariantName(names);
  const now = Date.now();

  const fail = (e: unknown, what: string) => st().notify(errText(e, what), { kind: "error" });

  const save = async () => {
    const n = name.trim() || placeholder;
    try {
      const v = await variants.add(n, st().project);
      setName("");
      st().notify(`Đã lưu phương án "${v.name}".`);
    } catch (e) {
      fail(e, "Không lưu được phương án");
    }
  };

  const open = async (v: Variant) => {
    if (working) return;
    const next = normalizeProject(v.project);
    if (!next) return void st().notify(`Phương án "${v.name}" bị hỏng, không mở được.`, { kind: "error" });
    setWorking(true);
    try {
      const cur = st().project;
      const bk = backupBeforeSwitch(cur, await variants.list());
      if (bk) await variants.add(bk, cur);
      const missing = await applyProject(next);
      const tail = bk ? ` Bản đang làm đã cất thành phương án "${bk}".` : "";
      st().notify(
        missing.length
          ? `Đã mở phương án "${v.name}", thiếu ${missing.length} tệp nhạc/video: thả chúng vào để gắn lại.${tail}`
          : `Đã mở phương án "${v.name}".${tail}`,
        { undo: true, kind: missing.length ? "warn" : "info" },
      );
      onClose();
    } catch (e) {
      fail(e, "Không mở được phương án");
    } finally {
      setWorking(false);
    }
  };

  const commitRename = async () => {
    if (!edit || skipRename.current) return void (skipRename.current = false);
    const { id, text } = edit;
    setEdit(null);
    try {
      await variants.rename(id, text);
    } catch (e) {
      fail(e, "Không đổi tên được");
    }
  };

  const remove = async (v: Variant) => {
    if (!confirm(`Xoá phương án "${v.name}"? Video và nhạc vẫn giữ.`)) return;
    try {
      const gone = await variants.remove(v.id);
      if (cmp === v.id) setCmp(null);
      if (gone)
        st().notify(`Đã xoá phương án "${gone.name}".`, {
          action: { label: "Hoàn tác", run: () => void variants.restore(gone).catch((e) => fail(e, "Không đưa lại được")) },
        });
    } catch (e) {
      fail(e, "Không xoá được phương án");
    }
  };

  const picked = list?.find((v) => v.id === cmp) ?? null;
  const changes = useMemo(() => (picked ? diffProjects(p, picked.project).map(changeText) : []), [p, picked]);

  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal xv va" role="dialog" aria-label="Phương án">
        <h2>Phương án <span className="grow" /><button className="btn icon ghost" onClick={onClose} title="Đóng (Esc)" aria-label="Đóng"><Icon name="close" /></button></h2>
        <p className="xv-hint" style={{ marginTop: 0 }}>
          Cất bản đang làm thành một phương án có tên để thử cách khác mà không mất bản đang ổn. Phương án nằm trong trình duyệt này, dùng chung video và nhạc với bài.
        </p>
        <div className="xv-row">
          <input
            className="va-name" value={name} placeholder={placeholder} aria-label="Tên phương án" maxLength={60}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()}
          />
          <button className="btn primary" onClick={() => void save()} disabled={!list}>
            <Icon name="bookmark" size={16} /> Lưu phương án hiện tại
          </button>
        </div>
        {err && <p className="xv-hint xv-err">{err}</p>}
        {list && !list.length && !err && <p className="xv-hint">Chưa có phương án nào.</p>}
        {!!list?.length && (
          <ul className="va-list">
            {list.map((v) => {
              const same = sameProject(v.project, p);
              const on = cmp === v.id;
              return (
                <li key={v.id} className={on ? "on" : ""}>
                  <div className="va-row">
                    <div className="va-main">
                      {edit?.id === v.id ? (
                        <input
                          className="va-name" autoFocus data-rename="1" value={edit.text} maxLength={60} aria-label="Tên mới"
                          onChange={(e) => setEdit({ id: v.id, text: e.target.value })}
                          onBlur={() => void commitRename()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            else if (e.key === "Escape") {
                              e.stopPropagation();
                              skipRename.current = true;
                              setEdit(null);
                            }
                          }}
                        />
                      ) : (
                        <b>{v.name}</b>
                      )}
                      <span className="va-meta">
                        {fmtSavedAt(v.savedAt, now)} · {variantSummary(v.project)}
                        {same && <em> · giống bản đang làm</em>}
                      </span>
                    </div>
                    <button className={`btn sm${on ? " on" : ""}`} onClick={() => setCmp(on ? null : v.id)} aria-pressed={on} title="Xem phương án này khác gì bản đang làm">
                      So sánh
                    </button>
                    <button className="btn sm" disabled={same || working} onClick={() => void open(v)} title="Chuyển sang phương án này (Hoàn tác được)">
                      Mở
                    </button>
                    <button className="btn sm icon" onClick={() => { skipRename.current = false; setEdit({ id: v.id, text: v.name }); }} title="Đổi tên" aria-label={`Đổi tên ${v.name}`}>
                      <Icon name="edit" />
                    </button>
                    <button className="btn sm icon danger" onClick={() => void remove(v)} title="Xoá" aria-label={`Xoá ${v.name}`}>
                      <Icon name="trash" />
                    </button>
                  </div>
                  {on && (
                    <div className="va-diff">
                      {changes.length ? (
                        <>
                          <div className="va-diff-head">Mở phương án này thì bài đổi {changes.length} chỗ:</div>
                          <ul>
                            {changes.slice(0, SHOW).map((t, i) => <li key={i}>{t}</li>)}
                          </ul>
                          {changes.length > SHOW && <div className="va-meta">và {changes.length - SHOW} chỗ khác.</div>}
                        </>
                      ) : (
                        <div className="va-meta">Giống hệt bản đang làm.</div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="xv-hint">
          Mở một phương án thì bài trên màn hình đổi theo (Ctrl Z để quay lại). Nếu bản đang làm chưa có trong danh sách, app tự cất nó thành phương án "Trước khi đổi" để không mất.
        </p>
        <div className="xv-row">
          <span className="grow" />
          <button className="btn ghost" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
