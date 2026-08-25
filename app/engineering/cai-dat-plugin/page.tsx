"use client";

// Hướng dẫn cài đặt plugin XBoss cho AutoCAD (M99 §13) — bản web dành cho kỹ sư trên máy
// trạm, KHÔNG có sẵn repo mã nguồn nên không đọc được plugin-autocad/CAI-DAT.md trực tiếp.
// Trang này trình bày lại đúng nội dung phần "người dùng cuối" của tệp đó (không phần
// build/đóng gói dành cho người phát hành — xem README.md trong repo). Link tới trang này
// từ khối "Bảng Điều Khiển Plugin AutoCAD" trên /engineering/chuan-hoa-ban-ve.
//
// Trang tĩnh, không gọi API — không cần Skeleton/rỗng/lỗi.

import Link from "next/link";
import {
  Download,
  KeyRound,
  Wrench,
  LayoutList,
  AlertTriangle,
  MonitorSmartphone,
} from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import { Section } from "@/app/components/ui";

const LENH_CHINH: { lenh: string; mo_ta: string }[] = [
  { lenh: "XBOSS_LOGIN", mo_ta: "Ghép thiết bị lần đầu / xin token mới" },
  { lenh: "XBOSS_RULEPACK", mo_ta: "Nạp tay bộ quy tắc (JSON) khi máy không ra được mạng" },
  { lenh: "XBOSS_KIEMTRA", mo_ta: "Chỉ kiểm, không đụng bản vẽ; xuất báo cáo JSON cạnh tệp DWG" },
  { lenh: "XBOSS_CHUANHOA", mo_ta: "Chuẩn hóa theo bộ quy tắc; sai thì 1 lần UNDO về nguyên trạng" },
  { lenh: "XBOSS_BATCH", mo_ta: "Xử lý hàng loạt cả thư mục, kết quả vào da-chuan-hoa/" },
  { lenh: "XBOSS_BOCKL", mo_ta: "Bóc khối lượng theo layer, tô màu + đánh dấu vùng đã bóc" },
  { lenh: "XBOSS_BOCKL_XOA", mo_ta: "Gỡ đánh dấu, trả màu đối tượng về trước khi bóc" },
  { lenh: "XBOSS_BOCKL_XUAT", mo_ta: "Xuất Excel đúng mẫu công ty, tuỳ chọn đối chiếu KL BOQ" },
  { lenh: "XBOSS_UPLOAD", mo_ta: "Gửi bản vẽ đã chuẩn hóa về XBoss (server kiểm định lại)" },
  { lenh: "XBOSS_BANG", mo_ta: "Bật/tắt bảng điều khiển XBoss trong AutoCAD" },
  { lenh: "XBOSS_VE_NEN", mo_ta: "Chuẩn bị nền: khóa/làm mờ thiết kế, tạo layer đích" },
  { lenh: "XBOSS_VE", mo_ta: "Vẽ tuyến ống/máng đúng chuẩn ngay từ đầu" },
  { lenh: "XBOSS_VE_NHAN", mo_ta: "Ghi nhãn size tự động bám tuyến" },
  { lenh: "XBOSS_VE_DOI", mo_ta: "Đổi size/hệ đoạn đã vẽ, dựng lại nét biên" },
  { lenh: "XBOSS_VE_PHUKIEN", mo_ta: "Chèn co/tê/van/miệng gió bám tuyến" },
  { lenh: "XBOSS_VE_THIETBI", mo_ta: "Chèn thiết bị FCU/AHU… kèm TAG" },
  { lenh: "XBOSS_VE_THUVIEN", mo_ta: "Nạp tay thư viện block khi máy không ra được mạng" },
  { lenh: "XBOSS_VE_DEXUAT", mo_ta: "Đề xuất block mới vào thư viện (Admin/PM duyệt trên web)" },
  { lenh: "XBOSS_VE_GIADO", mo_ta: "Rải giá đỡ cách đều đúng chuẩn treo đỡ" },
  { lenh: "XBOSS_VE_LOCHO", mo_ta: "Chèn lỗ chờ xuyên tường/sàn, xuất bảng builder's work" },
  { lenh: "XBOSS_VE_TAG", mo_ta: "Đánh tag tuần tự + tìm tag trùng" },
  { lenh: "XBOSS_VE_THONGKE", mo_ta: "Sinh bảng thiết bị/khối lượng ngay trong bản vẽ" },
  { lenh: "XBOSS_VE_MATCAT", mo_ta: "Dựng mặt cắt từ tuyến đã vẽ (cao độ nhập tay)" },
  { lenh: "XBOSS_VE_TRANGIN", mo_ta: "Tạo trang in đúng khổ/tỉ lệ, khung tên điền sẵn" },
  { lenh: "XBOSS_VE_BAOCAO", mo_ta: "Xem lại cả buổi vẽ: tuyến/block theo hệ, size ngoài danh mục" },
];

export default function CaiDatPluginPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <AppHeader
        title={
          <>
            <Download className="w-5 h-5" /> Cài Đặt Plugin AutoCAD
          </>
        }
        search={false}
      />
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-8">
        <p className="text-sm text-zinc-400">
          Hướng dẫn cài plugin XBoss cho AutoCAD dành cho kỹ sư MEP/QS trên máy trạm. Cần dựng gói
          cài hoặc đổi bộ quy tắc chuẩn hóa (dành cho người phát hành) thì xem{" "}
          <code className="px-1 rounded bg-zinc-900 border border-zinc-800">
            plugin-autocad/README.md
          </code>{" "}
          trong mã nguồn.
        </p>

        <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/30 p-4">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-300 shrink-0" aria-hidden="true" />
          <p className="text-sm text-amber-300">
            Plugin chỉ chạy trên <strong>AutoCAD 2026</strong>, nền <strong>.NET 10</strong>. Bản
            2021–2024 chạy runtime khác nên <strong>không nạp được</strong> plugin — plugin đọc
            phiên bản AutoCAD lúc nạp và báo tiếng Việt rồi dừng, thay vì lỗi khó hiểu giữa chừng.
            AutoCAD LT không hỗ trợ.
          </p>
        </div>

        <Section title="1. Lấy gói cài" icon={Download}>
          <div className="space-y-2 text-sm text-zinc-300">
            <p>
              Vào XBoss →{" "}
              <Link
                href="/engineering/chuan-hoa-ban-ve"
                className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
              >
                Chuẩn hóa bản vẽ CAD
              </Link>{" "}
              → khối <strong>Bảng Điều Khiển Plugin AutoCAD</strong> → nút{" "}
              <strong>Tải Gói Cài Plugin</strong>.
            </p>
            <p className="text-zinc-400">
              Nếu chỗ đó hiện hướng dẫn thay vì nút tải, nghĩa là quản trị chưa khai đường tải gói
              cài — hỏi quản trị hệ thống, đừng tự tải gói từ nguồn khác.
            </p>
          </div>
        </Section>

        <Section title="2. Cài đặt" icon={Wrench}>
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-zinc-300">
            <li>Đóng hẳn AutoCAD.</li>
            <li>
              Giải nén gói vào:{" "}
              <code className="px-1 rounded bg-zinc-900 border border-zinc-800 text-xs">
                %APPDATA%\Autodesk\ApplicationPlugins\XBoss.bundle\
              </code>{" "}
              (đường dẫn cuối phải đúng dạng{" "}
              <code className="px-1 rounded bg-zinc-900 border border-zinc-800 text-xs">
                ...\ApplicationPlugins\XBoss.bundle\PackageContents.xml
              </code>
              ).
            </li>
            <li>
              Mở AutoCAD 2026. Dòng lệnh hiện <code>[XBoss] Plugin ... đã nạp</code> là xong.
            </li>
          </ol>
          <p className="text-xs text-zinc-500">
            Gỡ cài đặt: đóng AutoCAD, xoá thư mục <code>XBoss.bundle</code>. Không để lại gì trong
            bản vẽ.
          </p>
        </Section>

        <Section title="3. Đăng nhập lần đầu (ghép thiết bị)" icon={KeyRound}>
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-zinc-300">
            <li>
              Trong AutoCAD gõ <code>XBOSS_LOGIN</code> → plugin hiện mã ghép dạng{" "}
              <code>XXXX-XXXX</code> (sống 10 phút).
            </li>
            <li>
              Mở XBoss trên trình duyệt →{" "}
              <Link
                href="/engineering/thiet-bi-cad"
                className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 inline-flex items-center gap-1"
              >
                <MonitorSmartphone className="w-3.5 h-3.5" aria-hidden="true" />
                Thiết Bị &amp; Token
              </Link>{" "}
              → nhập mã → <strong>Duyệt</strong>.
            </li>
            <li>
              Quay lại AutoCAD: plugin nhận token (hạn 90 ngày) và tự tải bộ quy tắc đang phát
              hành.
            </li>
          </ol>
          <p className="text-xs text-zinc-500">
            Token lưu trong Windows Credential Manager, không ghi ra tệp. Mất máy/nghi lộ → vào
            trang Thiết Bị &amp; Token bấm <strong>Thu hồi</strong>; lần gọi kế tiếp của máy đó
            nhận 401 và phải ghép lại.
          </p>
          <p className="text-xs text-zinc-500">
            Máy không ra được mạng nội bộ: tải tệp JSON bộ quy tắc từ bảng điều khiển plugin (nút
            Tải JSON), chép sang máy trạm rồi gõ <code>XBOSS_RULEPACK</code> chọn tệp. Chuẩn hóa
            vẫn chạy, nhưng không tải bản vẽ lên được cho tới khi bộ quy tắc khớp bản đang phát
            hành.
          </p>
        </Section>

        <Section title="4. Bảng lệnh chính" icon={LayoutList}>
          <p className="text-xs text-zinc-500 mb-2">
            Không cần thuộc tên lệnh: trên Ribbon có tab <strong>XBoss</strong> — đủ nút cho mọi
            lệnh dưới đây, chia theo nhóm Kết nối / Chuẩn hóa / Bóc khối lượng / Vẽ shop drawing,
            rê chuột vào nút là có chú thích tiếng Việt.
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-xs">
              <thead className="text-zinc-400 bg-zinc-900">
                <tr>
                  <th className="text-left font-semibold py-2 px-3">Lệnh</th>
                  <th className="text-left font-semibold py-2 px-3">Làm gì</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {LENH_CHINH.map((r) => (
                  <tr key={r.lenh} className="border-t border-zinc-900">
                    <td className="py-2 px-3 font-mono font-bold text-zinc-100 whitespace-nowrap">
                      {r.lenh}
                    </td>
                    <td className="py-2 px-3">{r.mo_ta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            Trình tự khuyên dùng: <code>XBOSS_KIEMTRA</code> → <code>XBOSS_CHUANHOA</code> → kiểm
            mắt → <code>QSAVE</code> → <code>XBOSS_UPLOAD</code>.
          </p>
        </Section>

        <Section title="5. Trục trặc thường gặp" icon={AlertTriangle}>
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>
              <strong>Không thấy dòng &quot;đã nạp&quot; khi mở AutoCAD</strong> — sai đường dẫn
              XBoss.bundle, hoặc không phải AutoCAD 2026.
            </li>
            <li>
              <strong>Lệnh báo &quot;chưa nạp bộ quy tắc&quot;</strong> — chạy{" "}
              <code>XBOSS_LOGIN</code> (có
              mạng) hoặc <code>XBOSS_RULEPACK</code> (nạp tệp JSON).
            </li>
            <li>
              <strong>Gọi lệnh nhận 401</strong> — token hết hạn hoặc đã bị thu hồi →{" "}
              <code>XBOSS_LOGIN</code> ghép lại.
            </li>
            <li>
              <strong>XBOSS_UPLOAD báo 422 kèm danh sách lỗi</strong> — server kiểm định không
              đạt, sửa đúng các lỗi liệt kê rồi tải lại; không có bản vẽ nào được ghi sổ.
            </li>
            <li>
              <strong>XBOSS_UPLOAD báo trùng rev</strong> — rev đó đã có với nội dung khác, tăng
              rev rồi gửi lại.
            </li>
          </ul>
        </Section>
      </main>
    </div>
  );
}
