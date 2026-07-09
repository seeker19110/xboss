import { HAS_TEST_DB } from "./setup"; // phải đứng đầu: chặn DATABASE_URL thật trước khi lib/db load
import { test } from "node:test";
import assert from "node:assert/strict";

// ===== Test thuần (không cần DB) =====

test("validateTechLink: URL không https bị chặn", async () => {
  const { validateTechLink } = await import("@/lib/tech");
  const base = {
    category: "bim" as const,
    title: "P6 Online",
    url: "https://acc.autodesk.com/x",
    embed: false,
    note: null,
  };

  assert.equal(validateTechLink(base), null);
  assert.match(validateTechLink({ ...base, url: "http://acc.autodesk.com/x" })!, /https:\/\//i);
  assert.match(validateTechLink({ ...base, url: "" })!, /url/i);
  assert.match(validateTechLink({ ...base, title: "" })!, /tiêu đề/i);
  assert.match(validateTechLink({ ...base, category: "xxx" as never })!, /nhóm/i);
});

test("validateTechLink: embed chỉ cho host whitelist", async () => {
  const { validateTechLink, EMBED_HOST_WHITELIST } = await import("@/lib/tech");
  assert.ok(EMBED_HOST_WHITELIST.length > 0);

  const whitelisted = EMBED_HOST_WHITELIST[0];
  const okEmbed = {
    category: "bim" as const,
    title: "BIM viewer",
    url: `https://${whitelisted}/model/123`,
    embed: true,
    note: null,
  };
  assert.equal(validateTechLink(okEmbed), null);

  const badEmbed = {
    category: "bim" as const,
    title: "BIM viewer lạ",
    url: "https://evil-viewer.example.com/model/123",
    embed: true,
    note: null,
  };
  const err = validateTechLink(badEmbed);
  assert.match(err!, /nhúng iframe/i);
  assert.match(err!, /evil-viewer\.example\.com/);

  // embed=false thì host lạ vẫn hợp lệ (chỉ link ra ngoài, không nhúng).
  assert.equal(validateTechLink({ ...badEmbed, embed: false }), null);
});

test("validateAlbumInput: tên mốc bắt buộc, ngày đúng định dạng", async () => {
  const { validateAlbumInput } = await import("@/lib/tech");
  assert.equal(
    validateAlbumInput({
      milestoneLabel: "Hoàn thiện tầng 10",
      capturedDate: "2026-07-01",
      note: null,
    }),
    null,
  );
  assert.match(
    validateAlbumInput({ milestoneLabel: "", capturedDate: null, note: null })!,
    /tên mốc/i,
  );
  assert.match(
    validateAlbumInput({ milestoneLabel: "Mốc X", capturedDate: "01/07/2026", note: null })!,
    /ngày chụp/i,
  );
});

// ===== Test tích hợp (cần Postgres riêng: đặt TEST_DATABASE_URL) =====

test("listTechLinks: lọc theo category + projectId", { skip: !HAS_TEST_DB }, async () => {
  const { run, insertId } = await import("@/lib/db");
  const { listTechLinks } = await import("@/lib/tech");

  const pId = await insertId(
    `INSERT INTO projects (name, code) VALUES ('DA Tech Test', 'PJT-TECH1')`,
  );
  const bimId = await insertId(
    `INSERT INTO tech_links (project_id, category, title, url) VALUES (?, 'bim', 'BIM viewer', 'https://viewer.autodesk.com/x')`,
    pId,
  );
  const scheduleId = await insertId(
    `INSERT INTO tech_links (project_id, category, title, url) VALUES (?, 'schedule', 'P6 Online', 'https://p6.example.com')`,
    pId,
  );

  const all = await listTechLinks(pId);
  assert.equal(all.length, 2);

  const bimOnly = await listTechLinks(pId, "bim");
  assert.equal(bimOnly.length, 1);
  assert.equal(bimOnly[0].id, bimId);

  await run(`DELETE FROM tech_links WHERE id IN (?, ?)`, bimId, scheduleId);
  await run(`DELETE FROM projects WHERE id = ?`, pId);
});

test(
  "listAlbums + listAlbumPhotos: album gắn đúng ảnh qua album_id (task_id NULL)",
  { skip: !HAS_TEST_DB },
  async () => {
    const { run, insertId } = await import("@/lib/db");
    const { listAlbums, listAlbumPhotos } = await import("@/lib/tech");

    const pId = await insertId(
      `INSERT INTO projects (name, code) VALUES ('DA Tech Test 2', 'PJT-TECH2')`,
    );
    const albumId = await insertId(
      `INSERT INTO progress_albums (project_id, milestone_label, captured_date) VALUES (?, 'Mốc test', '2026-07-01')`,
      pId,
    );
    const photoId = await insertId(
      `INSERT INTO task_photos (task_id, album_id, file_name, original_name, mime_type, size_bytes)
       VALUES (NULL, ?, 'alb-test.jpg', 'test.jpg', 'image/jpeg', 1000)`,
      albumId,
    );

    const albums = await listAlbums(pId);
    assert.equal(albums.length, 1);
    assert.equal(albums[0].id, albumId);
    assert.equal(albums[0].photoCount, 1);

    const photos = await listAlbumPhotos(albumId);
    assert.equal(photos.length, 1);
    assert.equal(photos[0].id, photoId);

    await run(`DELETE FROM task_photos WHERE id = ?`, photoId);
    await run(`DELETE FROM progress_albums WHERE id = ?`, albumId);
    await run(`DELETE FROM projects WHERE id = ?`, pId);
  },
);
