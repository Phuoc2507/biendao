# Biến video thành người 3D trên máy RTX

Tài liệu cho máy hỗ trợ văn nghệ (RTX 5060, 8 GB). Kết quả: mỗi video thẻ `Lan.mp4` ra một tệp `Lan.motion.json` để kéo thả vào app (xem mục *Người 3D từ video* trong [huong-dan-san-khau-the-video.md](huong-dan-san-khau-the-video.md)).

Đường đi: video → **GVHMR** (dựng tư thế người 3D, chạy trên card) → `gvhmr_dump.py` (lấy 24 khớp SMPL ra tệp `.npz`) → `python -m choreo.pose3d` (đổi sang 17 khớp của app, cân thẳng, đặt lên sàn, bỏ trôi) → `.motion.json`.

> Lưu ý: phần chạy trên card **chưa được thử trên máy thật** (máy soạn không có card NVIDIA). Phần đổi `.npz` sang `.motion.json` đã có test. Gặp lỗi ở bước 3 hoặc 4 thì gửi nguyên dòng lỗi để sửa.

## 1. Giấy phép, phải tự làm

GVHMR dùng mô hình cơ thể **SMPL / SMPL-X**. Bạn tự đăng ký tài khoản và đồng ý điều khoản tại trang SMPL và SMPL-X (Viện Max Planck), rồi tải các tệp mô hình theo đúng chỉ dẫn trong README của GVHMR. Giấy phép chỉ cho **dùng phi thương mại** (văn nghệ khoa, học tập là được; bán app thì không).

## 2. Cài môi trường

1. Cài driver NVIDIA mới nhất, Python 3.10 (Miniconda tiện nhất), Git.
2. Card dòng 50 (Blackwell) cần PyTorch bản **CUDA 12.8** trở lên; bản cu121, cu118 cũ không chạy trên 5060. Trong môi trường conda mới:

   ```bash
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
   ```

   Kiểm tra: `python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"` phải in `True` và tên card.
3. Tải GVHMR từ GitHub (`zju3dv/GVHMR`) và làm theo tệp `docs/INSTALL.md` của họ: cài các gói còn lại, đặt các tệp mô hình SMPL/SMPL-X và checkpoint vào `inputs/checkpoints`. Khi họ ghi cài torch bản khác thì **bỏ qua dòng đó**, giữ bản cu128 ở trên.
4. 8 GB card là đủ cho một người trong video dài vài phút; video quá dài thì cắt đôi.

## 3. Chạy GVHMR cho từng video

Trong thư mục GVHMR, với môi trường vừa cài:

```bash
python tools/demo/demo.py --video=D:/vannghe/the/Lan.mp4 -s
```

`-s` là máy quay đứng yên (quay bằng chân máy). Quay cầm tay thì bỏ `-s`. Kết quả nằm ở `outputs/demo/Lan/hmr4d_results.pt`, kèm video xem thử để kiểm tra người 3D có bám đúng không.

Video có nhiều người thì GVHMR lấy người to nhất; nên dùng video thẻ một người, hoặc cắt khung trước.

## 4. Lấy khớp ra `.npz`

Vẫn trong thư mục GVHMR:

```bash
python D:/bien/choreo/pose3d/gvhmr_dump.py outputs/demo/Lan --video D:/vannghe/the/Lan.mp4
```

Ra `Lan.npz` cạnh video.

## 5. Đổi sang tệp cho app

Ở máy nào cũng được (không cần card), trong `D:\bien`:

```bash
python -m choreo.pose3d D:/vannghe/the/Lan.npz --out D:/vannghe/the
```

Thả nhiều tệp `.npz` một lần cũng được; tệp hỏng chỉ báo lỗi, không chặn tệp khác. Tuỳ chọn: `--drift 1.5` (giây, cửa sổ bỏ trôi chậm của vị trí; tăng nếu người múa đi lại nhiều mà bị kéo về giữa), `--smooth 3` (khung, làm mượt; 1 là tắt).

Ra `Lan.motion.json`. Tên tệp phải trùng tên vũ công hoặc tên video thẻ trong app.

## 6. Gỡ rối

* `torch.cuda.is_available()` ra `False`: driver cũ hoặc cài nhầm torch bản CPU, cài lại theo bước 2.
* `no kernel image is available`: torch không có bản cho card dòng 50, cài lại bản cu128.
* Thiếu tệp `smplx2smpl_sparse.pt` hoặc `smpl_neutral_J_regressor.pt` khi chạy bước 4: chưa đặt đủ tệp mô hình theo INSTALL của GVHMR; chạy bước 4 **từ thư mục gốc GVHMR**.
* Người 3D trong app bị ngược trái phải: báo lại kèm video, đừng tự lật thẻ.
