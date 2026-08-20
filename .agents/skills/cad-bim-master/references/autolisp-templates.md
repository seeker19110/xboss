# MẪU CODE AUTOLISP & AUTOCAD SCRIPT CHUẨN KỸ THUẬT (AUTOLISP TEMPLATES)

Tài liệu cung cấp các đoạn mã AutoLISP chuẩn mẫu giúp AI Agent sinh mã vẽ tự động (Autonomous Drafting) các chi tiết lắp đặt điển hình, giá đỡ và ký hiệu kỹ thuật.

---

## 1. Cấu Trúc Khung Chuẩn Của Một Lệnh AutoLISP

Mọi hàm AutoLISP sinh ra phải tuân thủ chuẩn cấu trúc an toàn, lưu/khôi phục biến hệ thống (`osmode`, `cmdecho`, `clayer`) và có xử lý lỗi `*error*`:

```lisp
;;; =========================================================================
;;; LỆNH: C:XBOSS_DRAW_TRAPEZE
;;; MÔ TẢ: Tự động vẽ chi tiết mặt cắt Giá Đỡ Đa Tầng (Trapeze Hanger)
;;; =========================================================================
(defun c:XBOSS_DRAW_TRAPEZE (/ old-osmode old-cmdecho old-layer pt-ins width depth rod-dia)
  ;; Xử lý lỗi an toàn
  (defun *error* (msg)
    (if old-osmode (setvar "OSMODE" old-osmode))
    (if old-cmdecho (setvar "CMDECHO" old-cmdecho))
    (if old-layer (setvar "CLAYER" old-layer))
    (princ (strcat "\n[XBOSS-CAD] Lỗi hoặc Hủy lệnh: " msg))
    (princ)
  )

  (setq old-cmdecho (getvar "CMDECHO"))
  (setq old-osmode (getvar "OSMODE"))
  (setq old-layer (getvar "CLAYER"))
  (setvar "CMDECHO" 0)
  (setvar "OSMODE" 0)

  ;; Tạo hoặc chuyển layer chuẩn
  (if (not (tblsearch "LAYER" "M-HVAC-SUPP"))
    (command "-LAYER" "M" "M-HVAC-SUPP" "C" "4" "" "")
  )
  (setvar "CLAYER" "M-HVAC-SUPP")

  ;; Nhập thông số hình học (hoặc truyền tự động)
  (setq pt-ins (getpoint "\nChọn điểm gốc treo trần (Insertion Point): "))
  (if pt-ins
    (progn
      (setq width 600.0)    ; Bề rộng thanh Unistrut (mm)
      (setq depth 800.0)    ; Chiều dài ty treo hạ trần (mm)
      (setq rod-dia 10.0)   ; Đường kính ty M10 (mm)

      ;; 1. Vẽ Ty Treo Trái & Phải
      (setq pt-top-l (list (- (car pt-ins) (/ width 2.0)) (cadr pt-ins) 0.0))
      (setq pt-bot-l (list (- (car pt-ins) (/ width 2.0)) (- (cadr pt-ins) depth) 0.0))
      (command "._LINE" pt-top-l pt-bot-l "")

      (setq pt-top-r (list (+ (car pt-ins) (/ width 2.0)) (cadr pt-ins) 0.0))
      (setq pt-bot-r (list (+ (car pt-ins) (/ width 2.0)) (- (cadr pt-ins) depth) 0.0))
      (command "._LINE" pt-top-r pt-bot-r "")

      ;; 2. Vẽ Thanh Unistrut Đỡ Dưới (Thép U 41x41)
      (setq pt-strut-l (list (- (car pt-ins) (/ width 2.0) 25.0) (- (cadr pt-ins) depth) 0.0))
      (setq pt-strut-r (list (+ (car pt-ins) (/ width 2.0) 25.0) (- (cadr pt-ins) depth) 0.0))
      (command "._RECTANG" pt-strut-l (list (car pt-strut-r) (- (cadr pt-strut-r) 41.0) 0.0))

      ;; 3. Thêm Text Ghi Chú Kỹ Thuật
      (if (not (tblsearch "LAYER" "M-ANNO-TEXT"))
        (command "-LAYER" "M" "M-ANNO-TEXT" "C" "7" "" "")
      )
      (setvar "CLAYER" "M-ANNO-TEXT")
      (command "._MTEXT" (list (car pt-ins) (- (cadr pt-ins) depth 60.0) 0.0)
               "J" "MC" "H" "25" (list (+ (car pt-ins) 200.0) (- (cadr pt-ins) depth 80.0) 0.0)
               "GIÁ ĐỠ UNISTRUT 41x41 - TY M10" "")

      (princ "\n[XBOSS-CAD] Đã hoàn thành vẽ chi tiết giá đỡ Trapeze.")
    )
  )

  ;; Khôi phục biến hệ thống
  (setvar "OSMODE" old-osmode)
  (setvar "CMDECHO" old-cmdecho)
  (setvar "CLAYER" old-layer)
  (princ)
)
```

---

## 2. Kịch Bản AutoCAD Script (`.scr`) Chuyển Đổi & Dọn Dẹp Bản Vẽ

Dùng để chạy hàng loạt (Batch Processing) không cần mở giao diện:

```scr
;;; XBOSS BATCH CLEANUP SCRIPT
FILEDIA 0
CMDECHO 0
-PURGE ALL * N
-PURGE REGAPPS * N
AUDIT Y
-LAYER SET "0" ""
ZOOM E
QSAVE
QUIT
```

---

## 3. Mẫu AutoLISP Vẽ Lỗ Mở Xuyên Dầm (Sleeve Opening Detail)

```lisp
(defun DrawSleeveOpening (ptCenter pipeDia sleeveDia wallThickness / pt1 pt2 pt3 pt4)
  (setq radius (/ sleeveDia 2.0))
  ;; Vẽ vòng tròn sleeve bao ngoài
  (command "._CIRCLE" ptCenter radius)
  ;; Vẽ vòng tròn đường ống bên trong
  (command "._CIRCLE" ptCenter (/ pipeDia 2.0))
  ;; Vẽ đường bao vật liệu chèn chống cháy (Firestop Sealant)
  (command "._HATCH" "ANSI31" 1.0 0.0 "L" "")
)
```
