"""Chạy TRONG môi trường GVHMR (máy có card NVIDIA), không cần gói choreo.

    cd GVHMR
    python tools/demo/demo.py --video=the/Lan.mp4 -s        # GVHMR tự ghi hmr4d_results.pt
    python D:/bien/choreo/pose3d/gvhmr_dump.py outputs/demo/Lan --video the/Lan.mp4

Ghi Lan.npz: joints_cam (T, 24, 3) khớp SMPL hệ camera OpenCV (mét) và fps của video.
Sau đó ở máy nào cũng được: python -m choreo.pose3d Lan.npz --out the/

CHƯA chạy thử trên máy thật (máy soạn không có card NVIDIA); tên hàm theo bản demo GVHMR.
"""

import argparse
import os

import numpy as np
import torch


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("result_dir", help="thư mục GVHMR ghi kết quả (có hmr4d_results.pt)")
    ap.add_argument("--video", required=True, help="video gốc, để lấy fps và tên")
    ap.add_argument("--out", default=None, help="tệp .npz ra (mặc định: <tên video>.npz cạnh video)")
    a = ap.parse_args()

    import cv2
    from hmr4d.utils.smplx_utils import make_smplx

    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()

    pred = torch.load(os.path.join(a.result_dir, "hmr4d_results.pt"), map_location="cpu")
    smplx = make_smplx("supermotion")
    smplx2smpl = torch.load("hmr4d/utils/body_model/smplx2smpl_sparse.pt")
    J_reg = torch.load("hmr4d/utils/body_model/smpl_neutral_J_regressor.pt")
    with torch.no_grad():
        out = smplx(**pred["smpl_params_incam"])
        verts = torch.stack([torch.matmul(smplx2smpl, v) for v in out.vertices])  # (T, 6890, 3)
        joints = torch.einsum("jv,tvc->tjc", J_reg, verts).numpy()  # (T, 24, 3)

    dst = a.out or os.path.splitext(a.video)[0] + ".npz"
    np.savez(dst, joints_cam=joints.astype(np.float32), fps=float(fps))
    print(f"{dst}: {joints.shape[0]} khung, {fps:.2f} fps")


if __name__ == "__main__":
    main()
