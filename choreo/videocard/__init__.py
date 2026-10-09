"""Tạo "thẻ video" cho sân khấu ảo: khớp nhạc, xoá phông, cắt khung sát người.

Lõi (align, crop) chỉ cần numpy. Phần nặng (matting cần onnxruntime, ffio cần
ffmpeg) import có bảo vệ trong cli để thiếu phụ thuộc vẫn báo lỗi rõ ràng.
"""
