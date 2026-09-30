"""Camera ảo kiểu pinhole + phép chiếu 3D->2D, khớp quy ước CameraCalib (schema).

Quy ước (giống OpenCV/schema): R, t đưa điểm từ world sang cam (X_cam = R X_world + t);
camera nhìn dọc trục +Z của hệ cam; ma trận chiếu P = K [R | t]. Điểm ảnh:
    x_h = P @ [X, Y, Z, 1]^T,   (u, v) = (x_h[0], x_h[1]) / x_h[2].

Ta dựng camera bằng look-at (đặt ở `eye`, ngắm `target`) để mô phỏng người quay
bằng điện thoại đứng quanh sân khấu — tham số hoá bằng góc phương vị/độ cao/khoảng
cách, đúng thứ ngôn ngữ "đặt máy lệch bao nhiêu độ" trong luận văn.
"""

from __future__ import annotations

import numpy as np

from choreo.schema import CameraCalib


def _normalize(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    if n < 1e-12:
        raise ValueError("Vector không thể chuẩn hoá (độ dài ~0)")
    return v / n


def intrinsics_from_fov(
    fov_y_deg: float, image_size: tuple[int, int]
) -> np.ndarray:
    """Ma trận nội tại K (3x3) từ góc mở dọc và kích thước ảnh (pixel vuông)."""
    w, h = image_size
    fy = (h / 2.0) / np.tan(np.radians(fov_y_deg) / 2.0)
    fx = fy  # pixel vuông
    cx, cy = w / 2.0, h / 2.0
    return np.array([[fx, 0.0, cx], [0.0, fy, cy], [0.0, 0.0, 1.0]], dtype=np.float64)


def look_at_camera(
    azimuth_deg: float,
    distance: float,
    *,
    elevation_deg: float = 8.0,
    target: tuple[float, float, float] = (0.0, 1.0, 0.0),
    fov_y_deg: float = 50.0,
    image_size: tuple[int, int] = (1920, 1080),
) -> CameraCalib:
    """Camera đặt trên quả cầu quanh `target`, ngắm thẳng vào `target`.

    azimuth_deg: phương vị quanh trục Y (0° = phía +Z trước mặt, tăng ngược chiều
        kim đồng hồ nhìn từ trên xuống). distance: khoảng cách máy->tâm (m).
    elevation_deg: độ cao máy so với mặt phẳng ngang qua target (điện thoại thường
        hơi cao hơn hông, ~5-15°). Trả về CameraCalib (không méo).
    """
    az = np.radians(azimuth_deg)
    el = np.radians(elevation_deg)
    tgt = np.asarray(target, dtype=np.float64)

    # Vị trí máy (eye) trên quả cầu bán kính `distance` quanh target.
    eye = tgt + distance * np.array(
        [np.cos(el) * np.sin(az), np.sin(el), np.cos(el) * np.cos(az)],
        dtype=np.float64,
    )

    # Hệ trục cam: z = hướng ngắm (eye->target), x = phải, y = xuống-ảnh.
    z = _normalize(tgt - eye)
    world_up = np.array([0.0, 1.0, 0.0])
    x = _normalize(np.cross(world_up, z))
    y = np.cross(z, x)  # (x,y,z) thuận tay phải, R là phép quay chuẩn

    R = np.vstack([x, y, z])          # hàng = trục cam trong hệ world (world->cam)
    t = -R @ eye                      # X_cam = R (X_world - eye)
    K = intrinsics_from_fov(fov_y_deg, image_size)
    return CameraCalib(K=K, R=R, t=t, image_size=image_size)


def camera_center(calib: CameraCalib) -> np.ndarray:
    """Tâm quang của camera trong hệ world: C = -R^T t."""
    return -calib.R.T @ calib.t


def project_points(calib: CameraCalib, pts3d: np.ndarray) -> np.ndarray:
    """Chiếu điểm 3D (..., 3) trong hệ world xuống pixel (..., 2).

    Không mô phỏng méo ống kính (dist=0) — đủ cho thực nghiệm hình học tổng hợp.
    Điểm sau lưng camera (Z_cam <= 0) trả về NaN để phía gọi tự xử lý.
    """
    pts = np.asarray(pts3d, dtype=np.float64)
    flat = pts.reshape(-1, 3)
    cam = flat @ calib.R.T + calib.t                 # (N,3) trong hệ cam
    depth = cam[:, 2:3]
    img = flat @ calib.P[:, :3].T + calib.P[:, 3]     # = P @ [X,1], phần 3 chiều
    with np.errstate(divide="ignore", invalid="ignore"):
        uv = img[:, :2] / img[:, 2:3]
    uv[depth[:, 0] <= 1e-6] = np.nan
    return uv.reshape(pts.shape[:-1] + (2,))


def ray_angle_deg(
    calib_a: CameraCalib, calib_b: CameraCalib, point: np.ndarray
) -> float:
    """Góc (độ) giữa hai tia từ hai tâm máy tới cùng một điểm 3D.

    Đây là "góc giao hội" (parallax) quyết định điều kiện tam giác hoá: góc càng
    gần 90° thì độ sâu ước lượng càng ổn định; góc nhỏ (hai máy gần nhau) => sai
    số theo chiều sâu nổ to. Dùng để dán nhãn kết quả thực nghiệm.
    """
    p = np.asarray(point, dtype=np.float64)
    ca = camera_center(calib_a)
    cb = camera_center(calib_b)
    ra = _normalize(p - ca)
    rb = _normalize(p - cb)
    cos = float(np.clip(ra @ rb, -1.0, 1.0))
    return float(np.degrees(np.arccos(cos)))
