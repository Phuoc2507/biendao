# V42 — Chấm TUYỆT ĐỐI theo tham chiếu: phá trần nhận dạng 50% (capstone tầng đánh giá)

> Thực nghiệm tầng ĐÁNH GIÁ (web/TS), dùng chính chuỗi lấy mẫu pha đã ship (`samplePoseSequence`)
> và so trực tiếp với bộ nhóm-tương-đối `phaseAlignAt`+`formOutlierIndex`.
> Kịch bản: [`web/experiments/absolute-reference.ts`](../web/experiments/absolute-reference.ts).
> Tái lập (trong `web/`):
> `npx esbuild experiments/absolute-reference.ts --bundle --platform=node --format=cjs --outfile=ar.cjs && node ar.cjs`

## Vì sao đo & kết luận thẳng

V41 chốt: đánh giá NHÓM-TƯƠNG-ĐỐI có **trần nhận dạng 50%** — quá nửa nhóm cùng sai một kiểu
thì không tham chiếu NGOÀI, bài toán vô định. Kết luận V41 chỉ ra lối thoát *nguyên lý*: THAM
CHIẾU TUYỆT ĐỐI. Vòng này **đo** lối thoát đó thay vì chỉ phát biểu. Chấm tuyệt đối = căn PHA
mỗi vũ công vào clip THAM CHIẾU (vũ đạo dự định; quét τ khử canon y hệt bộ nhóm) rồi lấy
residual RMS tối thiểu = lỗi HÌNH DÁNG của riêng người đó. Không đồng thuận → không có gì để
swamping/masking → không có điểm sụp.

**Kết luận:** chấm tuyệt đối bắt **đủ k người sai ở MỌI k** (1..N−1), vu oan **0%** khắp nơi,
KHÔNG sụp ở 50% — trên đúng dữ liệu mà bộ nhóm-tương-đối sụp. VÀ vẫn **bất biến pha**: vũ công
múa ĐÚNG nhưng trễ canon τ tới 0.8s cho residual 0.00cm, không bị buộc tội. Hai lối đo BÙ nhau:
tuyệt đối cần nhãn (clip gán — có ở DAW & ở Gate-0 camera held-out), nhóm-tương-đối không cần
nhãn (mocap thật, nhóm khuyết vũ đạo gốc). Đây là mảnh khép tầng đánh giá: **biết trần ở đâu
(V41) và biết khi nào vượt được (V42).**

## Kết quả

### (1)+(3) k người sai ĐỒNG DẠNG (WRONG[0]), N=7 — TUYỆT ĐỐI vs NHÓM-TƯƠNG-ĐỐI (cùng dữ liệu)

| k | k/N | abs bắt đúng (TB/khung) | abs vu oan | **rel hit** | **rel vu oan** |
|--:|:---:|:----------------------:|:----------:|:-----------:|:--------------:|
| 0 | .00 | 0.00 / 0 | 0% | 0% | 0% |
| 1 | .14 | **1.00 / 1** | 0% | 100% | 0% |
| 2 | .29 | **2.00 / 2** | 0% | 100% | 0% |
| 3 | .43 | **3.00 / 3** | 0% | 100% | 0% |
| 4 | .57 | **4.00 / 4** | 0% | 0% | **100%** |
| 5 | .71 | **5.00 / 5** | 0% | 0% | **100%** |
| 6 | .86 | **6.00 / 6** | 0% | 0% | **100%** |

### (2) BẤT BIẾN PHA — vũ công múa ĐÚNG (REF) nhưng trễ canon τ. abs residual phải ~0

| τ (s) | abs residual TB (cm) | bị cờ tuyệt đối? |
|------:|:--------------------:|:----------------:|
| 0.0 | 0.00 | 0% |
| 0.2 | 0.00 | 0% |
| 0.4 | 0.00 | 0% |
| 0.6 | 0.00 | 0% |
| 0.8 | 0.00 | 0% |

## Đọc kết quả

- **Không có điểm sụp — tuyến tính hoàn hảo.** abs bắt đúng = k/k ở MỌI k, kể cả k=6/7 (86%
  nhóm sai). Vì mỗi vũ công đo ĐỘC LẬP với clip vũ đạo, không có "đa số" để dựng đồng thuận
  giả → swamping/masking không tồn tại. Đúng chỗ k=4..6 mà bộ nhóm-tương-đối vu oan 100% (V41),
  bộ tuyệt đối vẫn nêu đúng cả 4/5/6 người sai, vu oan 0%. Tương phản trực tiếp, cùng dữ liệu.
- **Bất biến pha giữ nguyên.** Trễ canon τ tới 0.8s → residual 0.00cm vì residual = min theo τ
  (quét ±maxLag). Chấm tuyệt đối KHÔNG lẫn "trễ có chủ đích" thành "sai hình" — đúng tinh thần
  tách pha–biên độ (V35). Không có cái này thì chấm tuyệt đối sẽ báo động giả mọi canon.
- **Giá phải trả: cần NHÃN.** Bộ tuyệt đối đòi biết "vũ đạo dự định" của từng người. Có sẵn ở
  hai nơi: (a) DAW demonstrator — mỗi mannequin gắn 1 clip, biết chính xác; (b) tầng perception
  Gate-0 — camera HELD-OUT (V13/V14) là tham chiếu tuyệt đối vật lý. KHÔNG có ở: mocap thật của
  nhóm nhảy tự do không kèm vũ đạo gốc → đó đúng địa hạt của bộ nhóm-tương-đối.

## Kết luận cho luận văn

Khép tầng đánh giá bằng một cặp bù hoàn chỉnh, mỗi vế có ranh giới ĐO ĐƯỢC:

1. **Nhóm-tương-đối** (V33/V35, không nhãn): đúng cho mocap thật/nhóm tự do; hỏng an toàn với
   lỗi đa dạng; trần nhận dạng **50%** (V41).
2. **Tuyệt đối theo tham chiếu** (V42, cần nhãn): **không có điểm sụp**, bắt đủ người sai ở mọi
   tỉ lệ, vẫn bất biến canon; áp dụng ở DAW (clip gán) và Gate-0 (camera held-out).

Thông điệp thiết kế: **chọn thước theo việc có hay không NHÃN tham chiếu**, đừng ép một thước
gánh cả hai. Trần 50% của vế không-nhãn không phải khuyết điểm cài đặt mà là giới hạn thông tin;
khi thông tin tham chiếu CÓ (đúng ca demonstrator và Gate-0), dùng vế tuyệt đối để vượt nó — đo
đạc xác nhận vượt sạch. Đây là ứng dụng trực tiếp của kết luận mở V41, đóng lại bằng bằng chứng.
