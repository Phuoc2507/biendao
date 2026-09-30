// Đội hình (formation): xếp N vũ công thành một hình khối trên sàn, quay mặt về
// khán giả. Trả về vị trí [x, z] THEO THỨ TỰ vũ công (người thứ i -> chỗ thứ i).
// Thuần hàm, không phụ thuộc store/DOM nên dễ suy luận & kiểm chứng.
//
// Quy ước sân khấu (khớp Stage.tsx + Mannequin.tsx): khán giả ở phía +Z (mốc
// vàng FrontMarker đặt tại z=3.2); vũ công quay mặt +Z cục bộ là "nhìn khán giả"
// (rotationY = 0). Vì vậy z LỚN = gần khán giả (trước sân khấu), z NHỎ = lùi hậu
// đài. Tâm đội hình đặt ở gốc để camera mặc định bắt trọn.

export type FormationShape = "line" | "vee" | "arc" | "columns" | "grid" | "circle";

// Danh mục hiển thị trên bảng điều khiển (nhãn tiếng Việt).
export const FORMATIONS: { shape: FormationShape; label: string }[] = [
  { shape: "line", label: "Hàng ngang" },
  { shape: "vee", label: "Chữ V" },
  { shape: "arc", label: "Vòng cung" },
  { shape: "columns", label: "Cột so le" },
  { shape: "grid", label: "Lưới" },
  { shape: "circle", label: "Vòng tròn" },
];

// Giãn cách mặc định giữa hai người liền kề (mét) — đủ rộng để hình nộm không
// chồng nhau (bán kính bóng/vòng chọn ~0.4m).
const GAP = 1.0;
// Kẹp trong lòng sân khấu để đội hình đông người không tràn khỏi lưới sàn.
const BOUND = 5;

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

// Dời cả cụm về tâm gốc toạ độ (trung bình x,z = 0) để mọi hình đều cân giữa.
function recenter(pts: [number, number][]): [number, number][] {
  const n = pts.length || 1;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n;
  const mz = pts.reduce((a, p) => a + p[1], 0) / n;
  return pts.map(([x, z]) => [x - mx, z - mz]);
}

const clamp = (v: number): number => Math.max(-BOUND, Math.min(BOUND, v));

// Hàng ngang: dàn đều theo trục X, cùng một hàng z.
function line(n: number, gap: number): [number, number][] {
  const span = (n - 1) * gap;
  return range(n).map((i) => [i * gap - span / 2, 0]);
}

// Chữ V: đỉnh hướng khán giả (người giữa ra trước, hai cánh lùi dần về sau theo
// độ lệch |x|). Đọc rõ thành hình V khi nhìn từ trên/từ khán giả.
function vee(n: number, gap: number): [number, number][] {
  return line(n, gap).map(([x]) => [x, -Math.abs(x) * 0.7]);
}

// Vòng cung: đường cong lồi về phía khán giả (người giữa nhô ra, hai đầu lùi).
function arc(n: number, gap: number): [number, number][] {
  const half = ((n - 1) * gap) / 2 || 1;
  const depth = gap * 1.2;
  return line(n, gap).map(([x]) => [x, depth * (1 - (x / half) ** 2)]);
}

// Hai cột dọc, so le kiểu gạch (người cột phải lùi thêm nửa bước) — đội hình
// "hộp" hay dùng khi quay mặt nhau/đổi chỗ.
function columns(n: number, gap: number): [number, number][] {
  return range(n).map((i) => {
    const col = i % 2; // 0 = trái, 1 = phải
    const row = Math.floor(i / 2);
    const x = (col - 0.5) * gap;
    const z = -row * gap - (col === 1 ? gap * 0.5 : 0);
    return [x, z];
  });
}

// Lưới gần vuông: lấp theo hàng, hàng trước (z lớn) trước.
function grid(n: number, gap: number): [number, number][] {
  const cols = Math.ceil(Math.sqrt(n));
  return range(n).map((i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return [c * gap, -r * gap];
  });
}

// Vòng tròn: chia đều theo chu vi (chu vi = n*gap -> bán kính = n*gap/2π). Người
// đầu tiên đặt phía khán giả (+Z), đi theo chiều kim đồng hồ.
function circle(n: number, gap: number): [number, number][] {
  const R = Math.max((n * gap) / (2 * Math.PI), gap);
  return range(n).map((i) => {
    const a = Math.PI / 2 - (i / n) * Math.PI * 2;
    return [R * Math.cos(a), R * Math.sin(a)];
  });
}

export function formationPositions(
  shape: FormationShape,
  n: number,
  gap = GAP
): [number, number][] {
  if (n <= 0) return [];
  if (n === 1) return [[0, 0]];
  let pts: [number, number][];
  switch (shape) {
    case "line": pts = line(n, gap); break;
    case "vee": pts = vee(n, gap); break;
    case "arc": pts = arc(n, gap); break;
    case "columns": pts = columns(n, gap); break;
    case "grid": pts = grid(n, gap); break;
    case "circle": pts = circle(n, gap); break;
  }
  return recenter(pts).map(([x, z]) => [clamp(x), clamp(z)]);
}

// ============================================================================
// Đội hình THEO THỜI GIAN (formation keyframes): biên đạo thật đổi đội hình
// giữa các đoạn nhạc. Một "mốc" (cue) gắn một đội hình với một count (ô nhịp).
// Giữa hai mốc, mỗi vũ công TRƯỢT từ vị trí đội hình này sang đội hình kia.
// ============================================================================

// Hướng mặt của cả đội hình. Quy ước sân khấu: yaw=0 nhìn +Z (khán giả).
//  - audience: ai cũng quay ra khán giả (đội hình "trình diễn" cổ điển).
//  - center:   quay VÀO tâm (gốc) — vòng tròn nhìn nhau, cảnh "tụ".
//  - out:      quay RA ngoài (lưng vào tâm) — vòng tròn "nở", cảnh xoè.
export type FormationFacing = "audience" | "center" | "out";

// Danh mục hiển thị (nhãn tiếng Việt), thứ tự dùng chung cho nút chọn ở Panel.
export const FACINGS: { facing: FormationFacing; label: string }[] = [
  { facing: "audience", label: "Ra khán giả" },
  { facing: "center", label: "Vào tâm" },
  { facing: "out", label: "Ra ngoài" },
];

export function facingLabel(facing: FormationFacing): string {
  return FACINGS.find((f) => f.facing === facing)?.label ?? facing;
}

export interface FormationCue {
  id: string;
  count: number; // ô nhịp 1-based tại BPM sân khấu (count 1 = giây 0)
  shape: FormationShape;
  facing: FormationFacing; // hướng mặt cả đội ở mốc này
}

// Nhãn hiển thị cho một hình (tra từ FORMATIONS).
export function formationLabel(shape: FormationShape): string {
  return FORMATIONS.find((f) => f.shape === shape)?.label ?? shape;
}

// Ease in-out: chuyển đội hình mượt (không giật) thay vì trượt tuyến tính.
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

// Yaw (radian, quanh trục Y) để vũ công ở [x,z] nhìn theo kiểu `facing`. Quy ước
// khớp Mannequin/CameraRig: local +Z ->(sin yaw, cos yaw) trong mặt XZ thế giới,
// nên muốn nhìn hướng (dx,dz) thì yaw = atan2(dx, dz). Tại gốc (x=z=0) mọi kiểu
// đều về 0 (nhìn khán giả) vì atan2(0,0)=0 — hợp lý, không có hướng "vào/ra".
function facingYaw(facing: FormationFacing, x: number, z: number): number {
  switch (facing) {
    case "audience":
      return 0;
    case "center":
      return Math.atan2(-x, -z); // hướng về gốc toạ độ
    case "out":
      return Math.atan2(x, z); // hướng ra xa gốc
  }
}

// Nội suy GÓC theo đường ngắn nhất (bọc ±π) để không quay "vòng dài" khi hai mốc
// có hướng lệch nhau qua mốc ±π (vd +170° -> -170° chỉ nên nhích 20°).
function lerpAngle(a: number, b: number, f: number): number {
  let d = b - a;
  d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return a + d * f;
}

export interface FormationPose {
  x: number;
  z: number;
  yaw: number;
}

// Tư thế (vị trí [x,z] + hướng mặt yaw) của vũ công thứ i (trong n người) tại
// thời điểm tSec, nội suy theo timeline đội hình. GIẢ ĐỊNH `cues` đã sắp tăng dần
// theo count (store giữ bất biến này). beatSec = 60/bpm để đổi count -> giây.
// Trả null khi không có mốc nào (khi đó Mannequin quay lại dùng vị trí/hướng
// tĩnh hoặc đường đi như cũ). Vị trí nội suy smoothstep; hướng nội suy theo góc
// đường-ngắn-nhất, mỗi mốc tự suy hướng từ vị trí của chính nó ở mốc đó.
export function formationPose(
  cues: FormationCue[],
  i: number,
  n: number,
  tSec: number,
  beatSec: number
): FormationPose | null {
  if (cues.length === 0) return null;
  const at = (c: FormationCue): number => (c.count - 1) * beatSec;
  const poseOf = (c: FormationCue): FormationPose | null => {
    const p = formationPositions(c.shape, n)[i];
    if (!p) return null;
    return { x: p[0], z: p[1], yaw: facingYaw(c.facing, p[0], p[1]) };
  };

  // Trước mốc đầu / sau mốc cuối: giữ nguyên đội hình ở biên (không ngoại suy).
  if (tSec <= at(cues[0])) return poseOf(cues[0]);
  const last = cues[cues.length - 1];
  if (tSec >= at(last)) return poseOf(last);

  // Tìm cặp mốc bao quanh t rồi nội suy smoothstep (vị trí) + góc (hướng).
  for (let k = 0; k < cues.length - 1; k++) {
    const a = cues[k];
    const b = cues[k + 1];
    const ta = at(a);
    const tb = at(b);
    if (tSec >= ta && tSec <= tb) {
      const span = tb - ta;
      const f = span > 1e-6 ? smoothstep((tSec - ta) / span) : 0;
      const pa = poseOf(a);
      const pb = poseOf(b);
      if (!pa || !pb) return null;
      return {
        x: pa.x + (pb.x - pa.x) * f,
        z: pa.z + (pb.z - pa.z) * f,
        yaw: lerpAngle(pa.yaw, pb.yaw, f),
      };
    }
  }
  return poseOf(last);
}

// Độ trễ (giây) của vũ công thứ i (trong n người) cho hiệu ứng "làn sóng"/canon
// khi chuyển đội hình: người đầu (i=0) rời chỗ TRƯỚC, người cuối (i=n-1) rời SAU
// cùng, tạo sóng lan chạy dọc nhóm — rất đặc trưng đội hình K-pop. `wave` tính
// bằng COUNT (đơn vị nhịp) = TỔNG độ trải của cả nhóm (không phụ thuộc sĩ số);
// 0 = mọi người chuyển đồng thời (hành vi cũ). Cách dùng: lấy mẫu đội hình của
// người i tại thời gian ĐÃ DỊCH `tSec - waveDelay(...)` — họ vào/ra đội hình muộn
// hơn nhưng trước mốc đầu vẫn kẹp về đội hình đầu nên lúc đứng yên không lệch.
export function waveDelay(
  wave: number,
  i: number,
  n: number,
  beatSec: number
): number {
  if (wave === 0 || n <= 1) return 0;
  return wave * beatSec * (i / (n - 1));
}
