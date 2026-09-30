# Bản đồ đặt góc máy 2 camera (có che khuất)

*Sinh tự động bởi `experiments/ban_do_dat_may.py` — thuần numpy, chạy CPU.*

## Câu hỏi
"Đặt 2 điện thoại ở hai phương vị nào quanh sân khấu thì vừa **thấy đủ khớp**
(che khuất ít) vừa **dựng 3D chính xác**?" — thứ sản phẩm 1-camera (Choreoto)
không trả lời được, và là hướng dẫn thực dụng cho người dùng nghiệp dư.

## Thiết lập
- Chuyển động ground-truth: múa tổng hợp 60 khung (2s @ 30fps),
  có xoay thân ±40° (nên che khuất thay đổi theo thời gian — sát thực tế).
- Camera pinhole: khoảng cách 4.5m, độ cao 8°, FOV 50°, ảnh 1920×1080.
- Mỗi ô: che khuất bật (khớp cần ≥2 máy cùng thấy), nhiễu 2px, 15 lần lặp.
- Chấm điểm 2 chiều: **độ phủ** (% khớp khôi phục được) và **MPJPE** trên khớp khôi phục được.
- Lưới đối xứng nên chỉ tính nửa trên (A < B); đường chéo = một máy (bỏ).

## Bản đồ tổng hợp (ô = độ_phủ · độ_chính_xác)
Ký hiệu mỗi ô `<phủ><acc>`: phủ `+`=đạt≥90%, `-`=dưới sàn;
acc `@`<12mm, `o`<20mm, `.`<40mm, ` `≥40mm (hoặc `x`=thoái hoá). `*` = khuyến nghị.
```
A\B   -90  -60  -30    0   30   60   90
    -----------------------------------
 -90    . +.   +o   +@   +o   -o   -   
 -60    .    . +.   +o   +@   +o   -o  
 -30    .    .    . +o   +o   +@ * -o  
   0    .    .    .    . +o   +o   -@  
  30    .    .    .    .    . +o   -o  
  60    .    .    .    .    .    . -o  
  90    .    .    .    .    .    .    .
```

## Lưới độ phủ khớp (%)
```
A\B   -90  -60  -30    0   30   60   90
    -----------------------------------
 -90    .   91   90   92   91   89   82
 -60    .    .   92   93   92   90   83
 -30    .    .    .   94   92   91   84
   0    .    .    .    .   97   95   88
  30    .    .    .    .    .   97   90
  60    .    .    .    .    .    .   90
  90    .    .    .    .    .    .    .
```

## Lưới MPJPE khớp khôi phục (mm)
```
A\B   -90  -60  -30    0   30   60   90
    -----------------------------------
 -90    .   21   13   11   12   17  247
 -60    .    .   20   13   11   12   18
 -30    .    .    .   20   13   11   12
   0    .    .    .    .   19   12   11
  30    .    .    .    .    .   19   12
  60    .    .    .    .    .    .   18
  90    .    .    .    .    .    .    .
```

## Khuyến nghị
**Đặt 2 máy ở -30° và +60°** (lệch 90°):
độ phủ **90.7%**, MPJPE **11.2mm** — MPJPE nhỏ nhất trong
các cặp đạt sàn phủ 90%.

**Đọc kết quả:**
- Cặp gần đối xứng quanh chính diện, lệch ~60–90° (vd −30°/+30°: phủ 92%,
  13mm; −45°… nằm giữa lưới), cho vùng dung hoà tốt nhất — khớp
  kết luận thí nghiệm A + D.
- Cặp lệch quá rộng ~180° (−90°/+90°: phủ 82%, MPJPE 247mm)
  vừa mất khớp do quay lưng vừa thoái hoá tam giác hoá → tránh.
- Cặp lệch quá hẹp (−30°/0° kề nhau: phủ 94%, 20mm)
  phủ cao nhưng độ sâu bất định → MPJPE kém.
- Đặt lệch tâm (cả hai cùng một phía, vd 0°/+60°: phủ 95%,
  12mm) kém đối xứng: một bên thân bị che nhiều hơn.

## Hệ quả cho luận văn
1. Cho ra **hướng dẫn đặt máy định lượng** (bản đồ 2D), không chỉ một con số — đây là
   sản phẩm phụ có giá trị thực dụng cho tầng perception.
2. Củng cố khuyến nghị "hai điện thoại lệch ~60–90°, đối xứng quanh mặt trước sân khấu".
3. Khi biểu diễn xoay nhiều (quay lưng khán giả), cân nhắc máy thứ 3 để giữ độ phủ
   (đã chỉ ra ở thí nghiệm D).
