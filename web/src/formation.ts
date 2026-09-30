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
