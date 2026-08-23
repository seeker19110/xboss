import { createHash } from "crypto";
import { query, queryOne, withProjectScope } from "@/lib/db";
import {
  createEngineeringObject,
  createEngineeringSource,
  createSourceRevision,
} from "@/lib/engineering-kernel";
import { ingestIntelligencePackage } from "@/lib/engineering-intel";
import { createWorkflow, submitForApproval } from "@/lib/engineering-workflow";

export interface BridgeTaskResult {
  sourceId: string;
  sourceRevisionId: string;
  createdObjectIds: string[];
  suggestionId: string | null;
  workflowId: string | null;
  summary: string;
}

/**
 * Phân tích và chuyển đổi kết quả tác vụ bất đồng bộ của MEPF Worker thành:
 * 1. Engineering Source & Revision (Lưu vết nguồn gốc)
 * 2. Engineering Objects (Spool, Ống, Thiết bị, Xung đột...)
 * 3. Engineering Suggestion (Đề xuất kỹ thuật ENG-2)
 * 4. Engineering Workflow (Luồng phê duyệt Gate 0 ENG-3)
 */
export async function bridgeTaskResultToEngineering(params: {
  taskId: string;
  projectId: number;
  userId: number;
}): Promise<BridgeTaskResult> {
  const { taskId, projectId, userId } = params;

  return withProjectScope(
    projectId,
    async () => {
      // 1. Đọc task từ DB
      const task = await queryOne<{
        id: string;
        project_id: number;
        task_type: string;
        status: string;
        payload: Record<string, unknown>;
        result: Record<string, unknown> | null;
        created_at: string;
      }>(
        `SELECT id, project_id, task_type, status, payload, result, created_at
       FROM engineering_async_tasks
       WHERE id = ? AND project_id = ?`,
        taskId,
        projectId,
      );

      if (!task) {
        throw new Error(`Không tìm thấy tác vụ ${taskId} thuộc dự án ${projectId}`);
      }

      if (task.status !== "completed") {
        throw new Error(
          `Tác vụ ${taskId} đang ở trạng thái '${task.status}', chưa thể kết xuất đối tượng kỹ thuật`,
        );
      }

      if (!task.result) {
        throw new Error(`Tác vụ ${taskId} không có dữ liệu kết quả`);
      }

      const taskResult = task.result as Record<string, any>;
      const taskType = task.task_type;

      // 2. Tạo Source & Source Revision để lưu vết
      const resultJson = JSON.stringify(taskResult);
      const sha256Hash = createHash("sha256").update(resultJson).digest("hex");

      const source = (await createEngineeringSource(
        {
          projectId,
          sourceType: taskType.includes("cad") ? "cad" : taskType.includes("bim") ? "bim" : "other",
          title: `MEPF Worker Run: ${taskType} [${task.id.slice(0, 8)}]`,
          metadata: {
            taskId: task.id,
            taskType: task.task_type,
            generatedAt: task.created_at,
            engine: "mepf-worker-daemon",
          },
        },
        userId,
      )) as { id: string } | null;

      if (!source?.id) {
        throw new Error("Không thể khởi tạo engineering_source cho tác vụ này");
      }

      const sourceRevision = (await createSourceRevision(
        {
          sourceId: source.id,
          revisionNo: 1,
          sha256: sha256Hash,
          parserName: "mepf-worker-bridge",
          parserVersion: "1.0.0",
          metadata: {
            taskPayload: task.payload,
            bridgedAt: new Date().toISOString(),
          },
        },
        userId,
      )) as { id: string } | null;

      if (!sourceRevision?.id) {
        throw new Error("Không thể khởi tạo engineering_source_revision cho tác vụ này");
      }

      const createdObjectIds: string[] = [];
      const createdObjectExternalKeys: string[] = [];

      // 3. Trích xuất các thực thể cụ thể theo từng loại tác vụ
      if (
        taskType === "mepf.hvac.calc" ||
        taskType === "mepf.cad.analyze" ||
        taskType === "mepf.qs.takeoff"
      ) {
        // Bóc tách Spool / Duct / Pipe / Fittings
        const items = (taskResult.spools ||
          taskResult.takeoff_items ||
          taskResult.ducts ||
          taskResult.pipes ||
          []) as Array<Record<string, any>>;

        for (const [idx, item] of items.slice(0, 50).entries()) {
          const objType = item.type || (taskType.includes("hvac") ? "duct_spool" : "mep_component");
          const objName = item.name || item.spool_id || `${objType.toUpperCase()}-${idx + 1}`;
          const externalKey = item.external_key || `WORKER-${task.id.slice(0, 6)}-${idx + 1}`;

          const createdObj = (await createEngineeringObject(
            {
              projectId,
              objectType: objType,
              discipline: item.discipline || (taskType.includes("hvac") ? "HVAC" : "MEP"),
              externalKey,
              name: objName,
              properties: {
                dimensions: item.dimensions || item.size || null,
                length_m: item.length || item.length_m || null,
                area_m2: item.area_m2 || null,
                material: item.material || null,
                thickness_mm: item.thickness_mm || null,
                velocity_ms: item.velocity_ms || null,
                pressure_drop_pa: item.pressure_drop_pa || null,
              },
              geometryRef: item.geometry || { index: idx },
              sourceRevisionId: sourceRevision.id,
            },
            userId,
          )) as { id: string } | null;

          if (createdObj?.id) {
            createdObjectIds.push(createdObj.id);
            createdObjectExternalKeys.push(externalKey);
          }
        }
      } else if (taskType === "mepf.bim.clash.detect") {
        // Bóc tách Clash items
        const clashes = (taskResult.clashes || taskResult.clash_items || []) as Array<
          Record<string, any>
        >;

        for (const [idx, clash] of clashes.slice(0, 50).entries()) {
          const externalKey = clash.clash_id || `CLASH-${task.id.slice(0, 6)}-${idx + 1}`;

          const createdObj = (await createEngineeringObject(
            {
              projectId,
              objectType: "clash_item",
              discipline: clash.discipline || "COORDINATION",
              externalKey,
              name:
                clash.name ||
                `Va chạm #${idx + 1}: ${clash.element_a || "A"} vs ${clash.element_b || "B"}`,
              properties: {
                severity: clash.severity || "medium",
                distance_mm: clash.distance_mm || 0,
                element_a: clash.element_a || null,
                element_b: clash.element_b || null,
                location: clash.location || null,
                status: "open",
              },
              geometryRef: clash.point || {},
              sourceRevisionId: sourceRevision.id,
            },
            userId,
          )) as { id: string } | null;

          if (createdObj?.id) {
            createdObjectIds.push(createdObj.id);
            createdObjectExternalKeys.push(externalKey);
          }
        }
      } else {
        // Generic payload extraction
        const externalKey = `TASK-RES-${task.id.slice(0, 8)}`;
        const createdObj = (await createEngineeringObject(
          {
            projectId,
            objectType: "mepf_computation_result",
            discipline: "MEPF",
            externalKey,
            name: `Kết quả tính toán ${taskType}`,
            properties: taskResult,
            geometryRef: {},
            sourceRevisionId: sourceRevision.id,
          },
          userId,
        )) as { id: string } | null;

        if (createdObj?.id) {
          createdObjectIds.push(createdObj.id);
          createdObjectExternalKeys.push(externalKey);
        }
      }

      // 4. Tạo Package & Suggestion kỹ thuật (ENG-2)
      let suggestionId: string | null = null;
      if (createdObjectIds.length > 0) {
        const isClash = taskType.includes("clash");
        const priority = isClash ? "high_impact" : "optimization";
        const suggestionClass = isClash
          ? "constructability"
          : taskType.includes("qs")
            ? "quantity_cost"
            : "mep";

        const intelPkg = await ingestIntelligencePackage(projectId, null, {
          objective: `Gói Đề Xuất Tự Động từ ${taskType} (${createdObjectIds.length} đối tượng)`,
          sourceRevisionId: sourceRevision.id,
          provenance: {
            engine: "mepf-worker-daemon",
            timestamp: new Date().toISOString(),
          },
          traceId: task.id,
          suggestions: [
            {
              suggestionClass,
              priority,
              severity: isClash ? "high" : "medium",
              title: `Đề xuất thẩm định ${createdObjectIds.length} đối tượng từ ${taskType}`,
              body: `Bóc tách tự động từ Worker. Cần Kỹ sư rà soát trước khi đồng bộ vào WBS/BOQ.`,
              externalObjectKey: createdObjectExternalKeys[0],
              evidence: [
                {
                  kind: "fact",
                  statement: `Sinh bởi tác vụ ${taskType} [${task.id.slice(0, 8)}]`,
                  locator: `source_revision:${sourceRevision.id}`,
                },
              ],
              confidenceSignals: {
                sourceQuality: 0.9,
                extractionConfidence: 0.95,
                ruleValidated: true,
                completeness: 1.0,
              },
            },
          ],
        });

        if (intelPkg.suggestions.length > 0) {
          suggestionId = intelPkg.suggestions[0].id;
        }
      }

      // 5. Khởi tạo Workflow Phê Duyệt Gate 0 (ENG-3).
      // Gate 0 (§8) cấm lập workflow từ đề xuất chưa ai chấp nhận: ENG-2 quyết định trước,
      // ENG-3 mới lập kế hoạch thực hiện. Đề xuất do worker sinh ra luôn ở trạng thái chờ
      // duyệt, nên bridge KHÔNG tự tạo workflow ở đây (và không tự accept thay người —
      // làm vậy là vô hiệu hoá chốt kiểm soát). Workflow sẽ được lập khi người duyệt
      // chấp nhận đề xuất.
      let workflowId: string | null = null;
      const suggestionAccepted = suggestionId
        ? (
            await queryOne<{ status: string }>(
              `SELECT status FROM engineering_suggestions WHERE id = ? AND project_id = ?`,
              suggestionId,
              projectId,
            )
          )?.status === "accepted"
        : false;
      if (suggestionId && suggestionAccepted) {
        const workflow = await createWorkflow(projectId, userId, {
          suggestionId,
          title: `Phê duyệt kết quả ${taskType} [${task.id.slice(0, 8)}]`,
          description: `Luồng thẩm định đối tượng kỹ thuật tạo bởi MEPF-Agents Worker.`,
          riskInputs: {
            safetyRisk: taskType.includes("ff") || taskType.includes("fire"),
            regulatoryRisk: false,
            financialImpact: 0,
            crossDiscipline: taskType.includes("clash"),
            reversible: true,
            uncertainty: "low",
            scopeImpact: "medium",
          },
          hasSideEffect: false,
          rollbackStrategy: "Huỷ kích hoạt các đối tượng kỹ thuật tạm",
        });

        await submitForApproval(projectId, workflow.id, userId);
        workflowId = workflow.id;
      }

      // 6. Ghi nhận ID liên kết vào task
      await query(
        `UPDATE engineering_async_tasks
       SET payload = jsonb_set(
         COALESCE(payload, '{}'::jsonb),
         '{bridged}',
         ?::jsonb
       )
       WHERE id = ?`,
        JSON.stringify({
          bridgedAt: new Date().toISOString(),
          sourceId: source.id,
          sourceRevisionId: sourceRevision.id,
          objectCount: createdObjectIds.length,
          suggestionId,
          workflowId,
        }),
        taskId,
      );

      return {
        sourceId: source.id,
        sourceRevisionId: sourceRevision.id,
        createdObjectIds,
        suggestionId,
        workflowId,
        summary: workflowId
          ? `Đã chuyển đổi thành công ${createdObjectIds.length} đối tượng kỹ thuật, 1 đề xuất ENG-2 và luồng duyệt Gate 0 (${workflowId}).`
          : `Đã chuyển đổi thành công ${createdObjectIds.length} đối tượng kỹ thuật và 1 đề xuất ENG-2. Chưa lập luồng duyệt — đề xuất cần được chấp nhận (ENG-2) trước.`,
      };
    },
    { readOnly: false },
  );
}
