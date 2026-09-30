# Báo cáo tái lập — tầng nhận thức

Sinh tự động bởi `experiments/run_all.py`. Mỗi dòng xác nhận script chạy được (mã thoát 0) VÀ tái sinh đúng file kết quả của nó. Các con số khoa học nằm trong từng `ket-qua-*.md` tương ứng.

**Kết quả: 18/18 thực nghiệm tái lập thành công.** Tổng thời gian 603.7s.

| # | Script | File kết quả | Trạng thái | Thời gian |
|---|--------|--------------|-----------|-----------|
| 1 | `synthetic_2view.py` | `ket-qua-2view-tong-hop.md` | ✅ OK | 39.5s |
| 2 | `ban_do_dat_may.py` | `ket-qua-ban-do-dat-may.md` | ✅ OK | 7.8s |
| 3 | `do_nhay_sync_calib.py` | `ket-qua-do-nhay-sync-calib.md` | ✅ OK | 10.2s |
| 4 | `robust_outliers.py` | `ket-qua-robust-outliers.md` | ✅ OK | 9.0s |
| 5 | `rang_buoc_xuong.py` | `ket-qua-rang-buoc-xuong.md` | ✅ OK | 2.1s |
| 6 | `trong_so_tin_cay.py` | `ket-qua-trong-so-tin-cay.md` | ✅ OK | 13.9s |
| 7 | `hieu_chuan_tin_cay.py` | `ket-qua-hieu-chuan-tin-cay.md` | ✅ OK | 12.0s |
| 8 | `tong_hop_khu_nhieu.py` | `ket-qua-tong-hop-khu-nhieu.md` | ✅ OK | 35.6s |
| 9 | `danh_gia_khong_gt.py` | `ket-qua-danh-gia-khong-gt.md` | ✅ OK | 11.2s |
| 10 | `danh_gia_loco.py` | `ket-qua-danh-gia-loco.md` | ✅ OK | 60.1s |
| 11 | `phan_biet_lech_he_thong.py` | `ket-qua-phan-biet-lech.md` | ✅ OK | 5.3s |
| 12 | `phong_thu_bo_tuc.py` | `ket-qua-phong-thu-bo-tuc.md` | ✅ OK | 11.3s |
| 13 | `sua_bang_held_out.py` | `ket-qua-sua-bang-held-out.md` | ✅ OK | 15.7s |
| 14 | `tran_dong_thuan.py` | `ket-qua-tran-dong-thuan.md` | ✅ OK | 10.7s |
| 15 | `moc_tuyet_doi.py` | `ket-qua-moc-tuyet-doi.md` | ✅ OK | 8.4s |
| 16 | `bias_tron.py` | `ket-qua-bias-tron.md` | ✅ OK | 49.4s |
| 17 | `kiem_dinh_envelope.py` | `ket-qua-kiem-dinh-envelope.md` | ✅ OK | 149.4s |
| 18 | `hinh_hoc_frontier.py` | `ket-qua-hinh-hoc-frontier.md` | ✅ OK | 152.0s |

## Tiêu đề từng doc (đối chiếu nội dung)

1. **synthetic_2view** → Kết quả thực nghiệm tổng hợp: độ chính xác tam giác hoá 2-view
2. **ban_do_dat_may** → Bản đồ đặt góc máy 2 camera (có che khuất)
3. **do_nhay_sync_calib** → Độ nhạy tam giác hoá 2-view với sai số đồng bộ & hiệu chỉnh
4. **robust_outliers** → Bền vững với outlier 2D: DLT thường vs robust (cổng tái chiếu)
5. **rang_buoc_xuong** → Ràng buộc độ dài xương: khử nhiễu bằng chiếu ràng buộc đối xứng (PBD)
6. **trong_so_tin_cay** → Tam giác hoá có trọng số tin cậy (weighted DLT)
7. **hieu_chuan_tin_cay** → Hiệu chuẩn confidence → phương sai (đóng nốt Vòng 10)
8. **tong_hop_khu_nhieu** → Capstone: cộng dồn ba lớp khử nhiễu trên nhiễu hỗn hợp
9. **danh_gia_khong_gt** → Thước đo GT-free: sai số tái chiếu held-out có bám sát MPJPE?
10. **danh_gia_loco** → LOCO: khử tính tuỳ tiện của việc chọn camera giữ lại
11. **phan_biet_lech_he_thong** → V49 — Tầng đa-view tách "detector lệch hệ thống" khỏi "múa sai thật"
12. **phong_thu_bo_tuc** → V50 — Dựng bền (robust) vs cổng held-out: hai phòng thủ BỔ TÚC
13. **sua_bang_held_out** → V51 — SỬA hỏng 3D bằng chẩn đoán held-out (LOVO): đóng đúng KHE robust để hở
14. **tran_dong_thuan** → V52 — TRẦN của chọn-view-bằng-đồng-thuận (LOVO) khi NHIỀU camera cùng lệch
15. **moc_tuyet_doi** → V53 — Mốc TUYỆT ĐỐI (tham chiếu ngoài đồng thuận) phá trần V52 tới đâu, cho bias nào?
16. **bias_tron** → V54 — Bias TRỘN hai nguồn: giao thức 2-tầng (mốc→LOVO) compose tới đâu, và vì sao THỨ TỰ?
17. **kiem_dinh_envelope** → V55 — Kiểm định envelope V54 như một LUẬT DỰ ĐOÁN (Monte-Carlo, gồm confound)
18. **hinh_hoc_frontier** → V56 — Phần dư FRONTIER của V55 có phân-tách bằng hình-học rig không? (confound-controlled)
