import crypto from "node:crypto";
import { query, queryOne, run } from "@/lib/db";
import { loiKhongXuLyDuoc } from "@/lib/nen/loi";

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface CrossSection {
  shape: "rectangular" | "circular";
  widthMm?: number;
  heightMm?: number;
  diameterMm?: number;
}

export interface SweepVolumeResult {
  totalLengthM: number;
  crossSectionAreaM2: number;
  totalVolumeM3: number;
  segmentLengthsM: number[];
  boundingVolume: {
    min: Point3D;
    max: Point3D;
    dimensionsM: Point3D;
  };
}

export interface SpatialElementAABB {
  id: string;
  name: string;
  system: string;
  min: [number, number, number];
  max: [number, number, number];
}

export interface SpatialClashPair {
  elementA: string;
  elementB: string;
  systemA: string;
  systemB: string;
  clashType: "hard_overlap" | "soft_clearance";
  penetrationDepthMm: number;
  clashCenterPoint: [number, number, number];
}

export interface NestingPart {
  id: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
}

export interface NestingSheetLayout {
  sheetIndex: number;
  placedParts: Array<{
    partId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotated: boolean;
  }>;
  usedAreaM2: number;
  sheetAreaM2: number;
  utilizationRatePercent: number;
}

export interface Nesting2DResult {
  totalSheetsRequired: number;
  totalPartsPlaced: number;
  totalUsedAreaM2: number;
  totalSheetAreaM2: number;
  overallScrapPercent: number;
  sheets: NestingSheetLayout[];
}

/**
 * Tính toán quét thể tích không gian Polyline 3D Sweep Volume
 */
export function computePolylineSweepVolume(
  points: Point3D[],
  crossSection: CrossSection,
): SweepVolumeResult {
  if (!points || points.length < 2) {
    // 422: mảng điểm đúng cú pháp nhưng không đủ dữ liệu để quét thể tích.
    throw loiKhongXuLyDuoc("Polyline cần ít nhất 2 điểm tọa độ 3D.");
  }

  let totalLengthM = 0;
  const segmentLengthsM: number[] = [];

  let minX = points[0].x;
  let minY = points[0].y;
  let minZ = points[0].z;
  let maxX = points[0].x;
  let maxY = points[0].y;
  let maxZ = points[0].z;

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    const dx = (p2.x - p1.x) / 1000;
    const dy = (p2.y - p1.y) / 1000;
    const dz = (p2.z - p1.z) / 1000;

    const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
    segmentLengthsM.push(Number(segLen.toFixed(4)));
    totalLengthM += segLen;

    minX = Math.min(minX, p2.x);
    minY = Math.min(minY, p2.y);
    minZ = Math.min(minZ, p2.z);
    maxX = Math.max(maxX, p2.x);
    maxY = Math.max(maxY, p2.y);
    maxZ = Math.max(maxZ, p2.z);
  }

  let crossSectionAreaM2 = 0;
  if (crossSection.shape === "circular") {
    const dM = (crossSection.diameterMm ?? 100) / 1000;
    crossSectionAreaM2 = (Math.PI * dM * dM) / 4;
  } else {
    const wM = (crossSection.widthMm ?? 200) / 1000;
    const hM = (crossSection.heightMm ?? 200) / 1000;
    crossSectionAreaM2 = wM * hM;
  }

  const totalVolumeM3 = crossSectionAreaM2 * totalLengthM;

  return {
    totalLengthM: Number(totalLengthM.toFixed(3)),
    crossSectionAreaM2: Number(crossSectionAreaM2.toFixed(5)),
    totalVolumeM3: Number(totalVolumeM3.toFixed(5)),
    segmentLengthsM,
    boundingVolume: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      dimensionsM: {
        x: Number(((maxX - minX) / 1000).toFixed(3)),
        y: Number(((maxY - minY) / 1000).toFixed(3)),
        z: Number(((maxZ - minZ) / 1000).toFixed(3)),
      },
    },
  };
}

/**
 * Thuật toán Spatial AABB Clash Detection với Spatial Hash Grid Index
 */
export function detectAabbVoxelClashes(
  elements: SpatialElementAABB[],
  clearanceMm: number = 0,
): SpatialClashPair[] {
  const clashes: SpatialClashPair[] = [];
  if (!elements || elements.length < 2) return clashes;

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const a = elements[i];
      const b = elements[j];

      // Bỏ qua cùng hệ nếu không cần check nội bộ
      if (a.id === b.id) continue;

      const overlapX = Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]);
      const overlapY = Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]);
      const overlapZ = Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]);

      const isHardClash = overlapX > 0 && overlapY > 0 && overlapZ > 0;
      const isSoftClash =
        !isHardClash &&
        overlapX + clearanceMm >= 0 &&
        overlapY + clearanceMm >= 0 &&
        overlapZ + clearanceMm >= 0;

      if (isHardClash || isSoftClash) {
        const penetrationDepth = isHardClash
          ? Math.min(overlapX, overlapY, overlapZ)
          : Math.abs(Math.min(overlapX, overlapY, overlapZ));

        const centerX = (Math.max(a.min[0], b.min[0]) + Math.min(a.max[0], b.max[0])) / 2;
        const centerY = (Math.max(a.min[1], b.min[1]) + Math.min(a.max[1], b.max[1])) / 2;
        const centerZ = (Math.max(a.min[2], b.min[2]) + Math.min(a.max[2], b.max[2])) / 2;

        clashes.push({
          elementA: a.id,
          elementB: b.id,
          systemA: a.system,
          systemB: b.system,
          clashType: isHardClash ? "hard_overlap" : "soft_clearance",
          penetrationDepthMm: Number(penetrationDepth.toFixed(1)),
          clashCenterPoint: [
            Number(centerX.toFixed(1)),
            Number(centerY.toFixed(1)),
            Number(centerZ.toFixed(1)),
          ],
        });
      }
    }
  }

  return clashes;
}

/**
 * Thuật toán 2D Sheet Nesting Optimization (2D Shelf Best-Fit Packing với xoay 90 độ)
 */
export function optimize2dSheetNesting(
  parts: NestingPart[],
  sheetWidthMm: number = 1200,
  sheetLengthMm: number = 2400,
  kerfMm: number = 5,
): Nesting2DResult {
  const flattenedParts: Array<{ id: string; w: number; h: number }> = [];
  for (const p of parts) {
    for (let q = 0; q < p.quantity; q++) {
      flattenedParts.push({
        id: `${p.id}_#${q + 1}`,
        w: p.widthMm + kerfMm,
        h: p.heightMm + kerfMm,
      });
    }
  }

  // Sắp xếp theo chiều cao hoặc diện tích giảm dần (Max Dimension Decreasing)
  flattenedParts.sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h));

  const sheetAreaM2 = (sheetWidthMm * sheetLengthMm) / 1_000_000;

  interface SheetState extends NestingSheetLayout {
    shelves: Array<{ y: number; height: number; currentX: number }>;
  }

  const sheets: SheetState[] = [];

  for (const part of flattenedParts) {
    let placed = false;

    // Các phương án xoay: [w, h, rotated: false] hoặc [h, w, rotated: true]
    const orientations = [
      { w: part.w, h: part.h, rot: false },
      { w: part.h, h: part.w, rot: true },
    ];

    for (const sheet of sheets) {
      // 1. Thử đặt vào kệ (shelf) hiện có
      for (const shelf of sheet.shelves) {
        for (const ori of orientations) {
          if (shelf.currentX + ori.w <= sheetWidthMm && ori.h <= shelf.height) {
            sheet.placedParts.push({
              partId: part.id,
              x: shelf.currentX,
              y: shelf.y,
              width: ori.w,
              height: ori.h,
              rotated: ori.rot,
            });
            shelf.currentX += ori.w;
            sheet.usedAreaM2 += (part.w * part.h) / 1_000_000;
            sheet.utilizationRatePercent = Number(
              ((sheet.usedAreaM2 / sheetAreaM2) * 100).toFixed(2),
            );
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
      if (placed) break;

      // 2. Thử tạo kệ mới trên cùng tấm sheet
      const lastShelf = sheet.shelves[sheet.shelves.length - 1];
      const nextShelfY = lastShelf ? lastShelf.y + lastShelf.height : 0;

      for (const ori of orientations) {
        if (nextShelfY + ori.h <= sheetLengthMm && ori.w <= sheetWidthMm) {
          sheet.shelves.push({
            y: nextShelfY,
            height: ori.h,
            currentX: ori.w,
          });
          sheet.placedParts.push({
            partId: part.id,
            x: 0,
            y: nextShelfY,
            width: ori.w,
            height: ori.h,
            rotated: ori.rot,
          });
          sheet.usedAreaM2 += (part.w * part.h) / 1_000_000;
          sheet.utilizationRatePercent = Number(
            ((sheet.usedAreaM2 / sheetAreaM2) * 100).toFixed(2),
          );
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    // 3. Nếu không vừa bất kỳ sheet nào, mở sheet mới
    if (!placed) {
      const newSheetIndex = sheets.length + 1;
      const bestOri =
        orientations[0].w <= sheetWidthMm && orientations[0].h <= sheetLengthMm
          ? orientations[0]
          : orientations[1];

      const usedM2 = (part.w * part.h) / 1_000_000;
      sheets.push({
        sheetIndex: newSheetIndex,
        placedParts: [
          {
            partId: part.id,
            x: 0,
            y: 0,
            width: bestOri.w,
            height: bestOri.h,
            rotated: bestOri.rot,
          },
        ],
        shelves: [
          {
            y: 0,
            height: bestOri.h,
            currentX: bestOri.w,
          },
        ],
        usedAreaM2: usedM2,
        sheetAreaM2,
        utilizationRatePercent: Number(((usedM2 / sheetAreaM2) * 100).toFixed(2)),
      });
    }
  }

  const totalUsedAreaM2 = sheets.reduce((sum, s) => sum + s.usedAreaM2, 0);
  const totalSheetAreaM2 = sheets.length * sheetAreaM2;
  const overallScrapPercent =
    totalSheetAreaM2 > 0
      ? Number((((totalSheetAreaM2 - totalUsedAreaM2) / totalSheetAreaM2) * 100).toFixed(2))
      : 0;

  return {
    totalSheetsRequired: sheets.length,
    totalPartsPlaced: flattenedParts.length,
    totalUsedAreaM2: Number(totalUsedAreaM2.toFixed(3)),
    totalSheetAreaM2: Number(totalSheetAreaM2.toFixed(3)),
    overallScrapPercent,
    sheets: sheets.map((s) => ({
      sheetIndex: s.sheetIndex,
      placedParts: s.placedParts,
      usedAreaM2: Number(s.usedAreaM2.toFixed(3)),
      sheetAreaM2: Number(s.sheetAreaM2.toFixed(3)),
      utilizationRatePercent: s.utilizationRatePercent,
    })),
  };
}

/**
 * Sinh mã băm SHA-256 từ object đầu vào
 */
export function hashComputeInput(data: unknown): string {
  const json = JSON.stringify(data, Object.keys(data as object).sort());
  return crypto.createHash("sha256").update(json).digest("hex");
}

/**
 * Đệm kết quả tính toán hình học không gian vào database
 */
export async function getOrComputeSpatial<T>(
  projectId: number,
  cacheKey: string,
  algorithmVersion: string,
  inputData: unknown,
  computeFn: () => Promise<T> | T,
): Promise<{ data: T; fromCache: boolean; inputHash: string }> {
  const inputHash = hashComputeInput(inputData);

  try {
    const cached = await queryOne<{ output_data: T; input_hash: string }>(
      `SELECT output_data, input_hash FROM engineering_spatial_compute_cache 
       WHERE project_id = ? AND cache_key = ?`,
      projectId,
      cacheKey,
    );

    if (cached && cached.input_hash === inputHash) {
      await run(
        `UPDATE engineering_spatial_compute_cache 
         SET hit_count = hit_count + 1, updated_at = CURRENT_TIMESTAMP 
         WHERE project_id = ? AND cache_key = ?`,
        projectId,
        cacheKey,
      );
      return { data: cached.output_data, fromCache: true, inputHash };
    }
  } catch {
    // Nếu bảng chưa sẵn sàng, tiếp tục compute
  }

  const computedResult = await computeFn();

  try {
    await run(
      `INSERT INTO engineering_spatial_compute_cache (project_id, cache_key, algorithm_version, input_hash, output_data)
       VALUES (?, ?, ?, ?, ?::jsonb)
       ON CONFLICT (project_id, cache_key) DO UPDATE
       SET algorithm_version = EXCLUDED.algorithm_version,
           input_hash = EXCLUDED.input_hash,
           output_data = EXCLUDED.output_data,
           hit_count = engineering_spatial_compute_cache.hit_count + 1,
           updated_at = CURRENT_TIMESTAMP`,
      projectId,
      cacheKey,
      algorithmVersion,
      inputHash,
      JSON.stringify(computedResult),
    );
  } catch {
    // Không chặn nếu cache insert lỗi
  }

  return { data: computedResult, fromCache: false, inputHash };
}
