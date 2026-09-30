"""Hình học đa-view: dựng camera ảo, chiếu 3D->2D, và tam giác hoá 2D->3D.

Gói này thuần numpy (không opencv) để chạy được ngay trên máy không GPU. Nó là
nền cho thực nghiệm tổng hợp đo độ chính xác 2-camera theo góc đặt máy — bằng
chứng hình học cho tuyên bố lõi của luận văn (2 máy lệch ~60-90° tốt hơn 1 máy).
"""

from choreo.geom.cameras import look_at_camera, project_points, ray_angle_deg
from choreo.geom.triangulate import triangulate_dlt

__all__ = [
    "look_at_camera",
    "project_points",
    "ray_angle_deg",
    "triangulate_dlt",
]
