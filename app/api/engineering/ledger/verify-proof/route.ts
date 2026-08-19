import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, CAN } from "@/lib/auth";
import {
  hashLeafRecord,
  verifyMerkleProof,
  MerkleProofStep,
} from "@/lib/engineering-merkle-ledger";

export const dynamic = "force-dynamic";

// POST /api/engineering/ledger/verify-proof — Xác thực Merkle Proof
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!CAN.viewEngineeringGraph(user.role)) {
    return NextResponse.json({ error: "Không có quyền xác minh sổ cái" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const leafRecord = body.leafRecord;
    const leafHash = body.leafHash || (leafRecord ? hashLeafRecord(leafRecord) : null);
    const proof: MerkleProofStep[] = body.proof || [];
    const expectedRoot: string = body.expectedRoot;

    if (!leafHash || !expectedRoot) {
      return NextResponse.json(
        { error: "Thiếu leafHash (hoặc leafRecord) và expectedRoot" },
        { status: 400 },
      );
    }

    const isValid = verifyMerkleProof(leafHash, proof, expectedRoot);

    return NextResponse.json({
      success: true,
      isValid,
      leafHash,
      expectedRoot,
      proofStepsCount: proof.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
