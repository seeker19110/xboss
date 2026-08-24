/**
 * lib/engineering-god-tier-db.ts
 * Database persistence layer for God-Tier CAD/BIM Module (Server-only).
 */

import { query, queryOne, run } from "@/lib/db";
import {
  GodTierModelRecord,
  GodTierClashRecord,
  BoundingBox3D,
} from "@/lib/ky-thuat/engineering-god-tier";

export async function listGodTierModels(projectId: number): Promise<GodTierModelRecord[]> {
  return query<GodTierModelRecord>(
    `SELECT * FROM engineering_god_tier_models
     WHERE project_id = ?
     ORDER BY created_at DESC`,
    projectId,
  );
}

export async function getGodTierModel(
  projectId: number,
  modelId: string,
): Promise<GodTierModelRecord | null> {
  const row = await queryOne<GodTierModelRecord>(
    `SELECT * FROM engineering_god_tier_models
     WHERE project_id = ? AND (id::text = ? OR model_code = ?)`,
    projectId,
    modelId,
    modelId,
  );
  return row || null;
}

export async function saveGodTierModel(
  projectId: number,
  data: {
    model_code: string;
    name: string;
    discipline?: string;
    lod_level?: string;
    total_elements: number;
    instanced_mesh_url?: string;
    spatial_octree_data?: Record<string, unknown>;
    bounding_box?: BoundingBox3D;
    merkle_root_hash?: string;
    created_by?: number;
  },
): Promise<string> {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO engineering_god_tier_models (
       project_id, model_code, name, discipline, lod_level,
       total_elements, instanced_mesh_url, spatial_octree_data,
       bounding_box, merkle_root_hash, created_by
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)
     ON CONFLICT (project_id, model_code) DO UPDATE
     SET name = EXCLUDED.name,
         total_elements = EXCLUDED.total_elements,
         spatial_octree_data = EXCLUDED.spatial_octree_data,
         bounding_box = EXCLUDED.bounding_box,
         merkle_root_hash = EXCLUDED.merkle_root_hash,
         updated_at = NOW()
     RETURNING id`,

    projectId,
    data.model_code,
    data.name,
    data.discipline || "combined",
    data.lod_level || "LOD_400",
    data.total_elements,
    data.instanced_mesh_url || null,
    JSON.stringify(data.spatial_octree_data || {}),
    JSON.stringify(data.bounding_box || { min: [0, 0, 0], max: [0, 0, 0] }),
    data.merkle_root_hash || null,
    data.created_by || null,
  );

  return row ? row.id : "";
}

export async function listGodTierClashes(
  projectId: number,
  modelId?: string,
): Promise<GodTierClashRecord[]> {
  if (modelId) {
    return query<GodTierClashRecord>(
      `SELECT * FROM engineering_god_tier_clashes
       WHERE project_id = ? AND (model_id::text = ? OR model_id IN (SELECT id FROM engineering_god_tier_models WHERE model_code = ?))
       ORDER BY created_at DESC`,
      projectId,
      modelId,
      modelId,
    );
  }
  return query<GodTierClashRecord>(
    `SELECT * FROM engineering_god_tier_clashes
     WHERE project_id = ?
     ORDER BY created_at DESC`,
    projectId,
  );
}

export async function resolveGodTierClash(
  projectId: number,
  clashId: string,
  userId: number,
  status: "resolved" | "ignored" | "rfi_issued",
): Promise<boolean> {
  const res = await run(
    `UPDATE engineering_god_tier_clashes
     SET status = ?, resolved_by = ?, resolved_at = NOW(), updated_at = NOW()
     WHERE project_id = ? AND (id::text = ? OR clash_code = ?)`,
    status,
    userId,
    projectId,
    clashId,
    clashId,
  );
  return res.changes > 0;
}
