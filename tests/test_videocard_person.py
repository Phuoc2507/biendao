import numpy as np

from choreo.videocard.person import MainPersonFilter, components


def _frame(boxes, h=120, w=200):
    a = np.zeros((h, w), np.float32)
    for x0, y0, x1, y1 in boxes:
        a[y0:y1, x0:x1] = 1.0
    return a


def test_components_lon_truoc():
    m = _frame([(10, 10, 20, 20), (50, 10, 90, 100)]) > 0.5
    cs = components(m)
    assert len(cs) == 2
    assert cs[0].sum() > cs[1].sum()


def test_giu_nguoi_lon_nhat_xoa_nguoi_dung_xem():
    f = MainPersonFilter()
    out = f(_frame([(40, 10, 80, 110), (150, 40, 170, 110)]))
    assert out[60, 60] == 1.0
    assert out[:, 140:].max() == 0.0


def test_bam_theo_nguoi_chinh_khi_nguoi_xem_to_hon():
    f = MainPersonFilter()
    f(_frame([(40, 10, 80, 110), (150, 60, 165, 110)]))
    # vũ công dịch sang trái, người xem tiến lại gần máy (to hơn vũ công)
    out = f(_frame([(34, 20, 70, 110), (120, 0, 190, 120)]))
    assert out[60, 50] == 1.0
    assert out[:, 110:].max() == 0.0


def test_di_sat_nguoi_xem_khong_bi_gop():
    f = MainPersonFilter()
    f(_frame([(40, 10, 80, 110), (150, 40, 170, 110)]))
    # vũ công đi sát người xem (cách 2 px, vẫn là hai mảng tách rời)
    f(_frame([(100, 10, 140, 110), (142, 40, 162, 110)]))
    f(_frame([(100, 10, 140, 110), (142, 40, 162, 110)]))
    out = f(_frame([(60, 10, 100, 110), (150, 40, 170, 110)]))  # vũ công đi ra
    assert out[60, 80] == 1.0
    assert out[60, 160] == 0.0


def test_khung_trong_tra_nguyen():
    f = MainPersonFilter()
    z = np.zeros((40, 40), np.float32)
    assert f(z) is z


def test_mat_dau_chon_mang_gan_tam_cu():
    f = MainPersonFilter()
    f(_frame([(40, 10, 80, 110), (160, 40, 180, 110)]))
    f(np.zeros((120, 200), np.float32))  # khung trống giữ nguyên trạng thái
    out = f(_frame([(100, 10, 140, 110), (160, 40, 180, 110)]))  # nhảy xa
    assert out[60, 120] == 1.0
    assert out[60, 170] == 0.0


def test_may_lia_mat_dau_chon_manh_co_vu_cong():
    f = MainPersonFilter()
    f(_frame([(100, 10, 140, 110), (10, 60, 22, 100)]))
    # máy lia: vũ công văng sang phải, người xem nhỏ lại gần tâm cũ hơn
    out = f(_frame([(150, 10, 190, 110), (110, 60, 122, 100)]))
    assert out[60, 170] == 1.0
    assert out[80, 116] == 0.0


def _rgb(boxes_colors, h=120, w=200):
    im = np.zeros((h, w, 3), np.uint8)
    for (x0, y0, x1, y1), col in boxes_colors:
        im[y0:y1, x0:x1] = col
    return im


def test_tach_ra_sau_khi_chong_len_nhan_theo_mau_ao():
    den, trang = (20, 20, 20), (240, 240, 240)
    f = MainPersonFilter()
    d, x = (40, 10, 80, 110), (120, 30, 150, 110)
    f(_frame([d, x]), _rgb([(d, den), (x, trang)]))
    # vũ công lướt qua chồng lên người xem: một mảng dính
    m = (90, 10, 150, 110)
    f(_frame([m]), _rgb([((90, 10, 130, 110), den), ((130, 30, 150, 110), trang)]))
    # tách ra: người xem đứng yên trùng chỗ cũ, vũ công đi xa sang phải
    d2, x2 = (160, 10, 196, 110), (120, 30, 150, 110)
    out = f(_frame([d2, x2]), _rgb([(d2, den), (x2, trang)]))
    assert out[60, 175] == 1.0
    assert out[60, 135] == 0.0
