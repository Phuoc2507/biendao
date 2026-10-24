"""Video một máy → chuyển động 3D (17 khớp) cho app sân khấu.

Bộ dựng tư thế (GVHMR, chạy trên máy có card NVIDIA) ghi khớp SMPL 24 theo hệ
camera ra tệp .npz; gói này đổi tệp đó thành <ten>.motion.json để app gắn lên
nhân vật 3D. Phần ở đây thuần numpy, chạy được và test được không cần GPU.
"""
