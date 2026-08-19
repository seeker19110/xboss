import { NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import { listCadLispTemplates, generateAutoLispDetailScript } from "@/lib/engineering-cad-skills";

export const dynamic = "force-dynamic";

// GET /api/engineering/cad/lisp — Danh sách các mẫu AutoLISP Generator
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xem mẫu AutoLISP" }, { status: 403 });
  }

  try {
    const templates = await listCadLispTemplates();
    return NextResponse.json(templates);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/engineering/cad/lisp — Sinh mã AutoLISP theo tham số đầu vào
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.manageEngineeringTwin(user.role)) {
    return NextResponse.json({ error: "Không có quyền sinh mã AutoLISP" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { templateType, params } = body;

    if (!templateType) {
      return NextResponse.json({ error: "Cần cung cấp templateType" }, { status: 422 });
    }

    const script = generateAutoLispDetailScript(templateType, params || {});
    return NextResponse.json({
      templateType,
      fileName: `xboss_${templateType}_detail.lsp`,
      lispCode: script,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
