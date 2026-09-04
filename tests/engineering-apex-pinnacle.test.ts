import test from "node:test";
import assert from "node:assert/strict";
import "@/tests/setup";
import { computeApexScore } from "@/lib/ky-thuat/engineering-pinnacle-synergy";
import { DASHBOARD_TREE, findActiveNav } from "@/app/lib/dashboardTree";

test("Apex Synergy: computeApexScore tính đúng trọng số 5 trục và phân hạng statusTier", () => {
  // Trạng thái OPTIMAL
  const optimal = computeApexScore({
    spatial: 98,
    financial: 95,
    legal: 96,
    site: 97,
    agent: 99,
  });
  assert.ok(optimal.apexIndex >= 90);
  assert.equal(optimal.statusTier, "OPTIMAL");

  // Trạng thái CRITICAL khi điểm trung bình < 60
  const critical = computeApexScore({
    spatial: 40,
    financial: 50,
    legal: 45,
    site: 50,
    agent: 40,
  });
  assert.ok(critical.apexIndex < 60);
  assert.equal(critical.statusTier, "CRITICAL");
});

test("DASHBOARD_TREE: Cụm Kỹ thuật Không gian & AI chứa đầy đủ các phân hệ và định tuyến chuẩn xác", () => {
  const engCluster = DASHBOARD_TREE.find(
    (c) => c.label === "Kỹ thuật Không gian & AI (Engineering OS)",
  );
  assert.ok(engCluster, "Phải có cụm Kỹ thuật Không gian & AI trên Sidebar");
  assert.ok(engCluster!.dashboards.length >= 10, "Phải chứa ít nhất 10 phân hệ kỹ thuật cốt lõi");

  // Kiểm tra tìm active nav
  const activeCockpit = findActiveNav("/engineering");
  assert.ok(activeCockpit);
  assert.equal(activeCockpit?.dashboard.label, "Apex Cockpit (M88)");

  const activeSpatial = findActiveNav("/engineering/spatial-viewer");
  assert.ok(activeSpatial);
  assert.equal(activeSpatial?.dashboard.label, "Spatial Viewer (M74)");
});
