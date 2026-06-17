'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, CheckCircle, Clock, Circle, ZoomIn, RotateCcw, Layers } from 'lucide-react';
import type { FlatMesh, IfcAPI } from 'web-ifc';

export type ElementStatus = 'chua_lap' | 'dang_lap' | 'hoan_thanh';

interface ElementInfo {
  expressID: number;
  globalId: string;
  status: ElementStatus;
}

interface StoredStatus {
  global_id: string;
  status: ElementStatus;
  note: string | null;
  updated_at: string;
  updated_by_name: string | null;
}

interface Props {
  fileId: number;
  onLoaded?: (total: number, withStatus: number) => void;
}

const STATUS_HEX: Record<ElementStatus, number> = {
  chua_lap:   0x71717a,  // zinc-500 – chưa lắp
  dang_lap:   0xf59e0b,  // amber-400 – đang lắp
  hoan_thanh: 0x10b981,  // emerald-500 – hoàn thành
};

const STATUS_LABEL: Record<ElementStatus, string> = {
  chua_lap:   'Chưa lắp',
  dang_lap:   'Đang lắp đặt',
  hoan_thanh: 'Hoàn thành',
};

const STATUS_OPACITY: Record<ElementStatus, number> = {
  chua_lap:   0.45,
  dang_lap:   0.80,
  hoan_thanh: 0.90,
};

export default function IFCViewer({ fileId, onLoaded }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Three.js refs (không dùng state để tránh re-render)
  const rendererRef  = useRef<unknown>(null);
  const sceneRef     = useRef<unknown>(null);
  const cameraRef    = useRef<unknown>(null);
  const controlsRef  = useRef<unknown>(null);
  const ifcApiRef    = useRef<unknown>(null);
  const modelIDRef   = useRef<number>(-1);
  const animFrameRef = useRef<number>(0);
  const cleanupRef   = useRef<(() => void) | null>(null);

  // Maps: expressID ↔ GlobalId ↔ meshes
  const expressToMeshes   = useRef(new Map<number, unknown[]>());
  const expressToGlobalId = useRef(new Map<number, string>());
  const statusMap         = useRef(new Map<string, ElementStatus>());

  const [loading, setLoading]   = useState(true);
  const [stage, setStage]       = useState('Đang khởi tạo...');
  const [progress, setProgress] = useState(0);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<ElementInfo | null>(null);
  const [stats, setStats]       = useState({ total: 0, dang_lap: 0, hoan_thanh: 0 });
  const [filter, setFilter]     = useState<ElementStatus | 'all'>('all');

  const computeStats = useCallback(() => {
    let dang_lap = 0, hoan_thanh = 0;
    for (const s of statusMap.current.values()) {
      if (s === 'dang_lap') dang_lap++;
      if (s === 'hoan_thanh') hoan_thanh++;
    }
    setStats({ total: expressToMeshes.current.size, dang_lap, hoan_thanh });
  }, []);

  const applyColor = useCallback((expressID: number, status: ElementStatus) => {
    const meshes = expressToMeshes.current.get(expressID);
    if (!meshes) return;
    // Dynamic import đã chạy rồi nên THREE có sẵn qua closure
    for (const mesh of meshes) {
      const m = mesh as { material: { color: { setHex: (n: number) => void }; opacity: number; needsUpdate: boolean } };
      m.material.color.setHex(STATUS_HEX[status]);
      m.material.opacity = STATUS_OPACITY[status];
      m.material.needsUpdate = true;
    }
  }, []);

  const applyFilter = useCallback((f: ElementStatus | 'all') => {
    for (const [expressID, meshes] of expressToMeshes.current) {
      const globalId = expressToGlobalId.current.get(expressID);
      const status = (globalId ? statusMap.current.get(globalId) : undefined) ?? 'chua_lap';
      const visible = f === 'all' || status === f;
      for (const mesh of meshes) {
        (mesh as { visible: boolean }).visible = visible;
      }
    }
  }, []);

  const handleStatusChange = useCallback(async (
    expressID: number,
    globalId: string,
    newStatus: ElementStatus
  ) => {
    applyColor(expressID, newStatus);
    statusMap.current.set(globalId, newStatus);
    computeStats();
    setSelected(prev => prev?.expressID === expressID ? { ...prev, status: newStatus } : prev);

    try {
      await fetch('/api/ifc/elements', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, updates: [{ globalId, status: newStatus }] }),
      });
    } catch { /* lưu bất đồng bộ, không block UI */ }
  }, [fileId, applyColor, computeStats]);

  const resetCamera = useCallback(() => {
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) return;
    // Tái dùng logic fit-to-scene từ lúc load xong
    const THREE = (window as unknown as { __THREE__: typeof import('three') }).__THREE__;
    if (!THREE) return;
    const box = new THREE.Box3().setFromObject(sceneRef.current as import('three').Object3D);
    const center = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const cam = cameraRef.current as import('three').PerspectiveCamera;
    cam.position.set(center.x + maxDim, center.y + maxDim * 0.5, center.z + maxDim);
    (controlsRef.current as { target: import('three').Vector3; update: () => void }).target.copy(center);
    (controlsRef.current as { update: () => void }).update();
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    let cancelled = false;

    (async () => {
      try {
        // Import dynamic để tránh SSR
        setStage('Đang tải thư viện 3D...');
        const [THREE, { OrbitControls }, WebIFC] = await Promise.all([
          import('three'),
          import('three/addons/controls/OrbitControls.js'),
          import('web-ifc'),
        ]);
        if (cancelled) return;

        // Lưu THREE vào global để resetCamera dùng được
        (window as unknown as Record<string, unknown>).__THREE__ = THREE;

        // --- Khởi tạo Scene ---
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x18181b);
        sceneRef.current = scene;

        const w = canvas.clientWidth || 800;
        const h = canvas.clientHeight || 600;
        const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100000);
        camera.position.set(10, 10, 10);
        cameraRef.current = camera;

        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        rendererRef.current = renderer;

        const ambient = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(ambient);
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(100, 200, 100);
        scene.add(sun);
        const fill = new THREE.DirectionalLight(0xffffff, 0.3);
        fill.position.set(-100, -100, -100);
        scene.add(fill);

        const controls = new OrbitControls(camera, canvas);
        controls.enableDamping  = true;
        controls.dampingFactor  = 0.08;
        controls.screenSpacePanning = false;
        controlsRef.current = controls;

        const ro = new ResizeObserver(() => {
          const cw = canvas.clientWidth;
          const ch = canvas.clientHeight;
          camera.aspect = cw / ch;
          camera.updateProjectionMatrix();
          renderer.setSize(cw, ch);
        });
        ro.observe(canvas);

        let rafId = 0;
        const animate = () => {
          rafId = requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();
        animFrameRef.current = rafId;

        cleanupRef.current = () => {
          cancelAnimationFrame(rafId);
          ro.disconnect();
          controls.dispose();
          renderer.dispose();
          scene.traverse(obj => {
            const mesh = obj as import('three').Mesh;
            if (mesh.isMesh) {
              mesh.geometry.dispose();
              if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.dispose());
              else mesh.material.dispose();
            }
          });
          if (ifcApiRef.current && modelIDRef.current >= 0) {
            try { (ifcApiRef.current as IfcAPI).CloseModel(modelIDRef.current); } catch {}
          }
        };

        // --- Khởi tạo IFC API ---
        setStage('Đang tải WASM IFC...');
        setProgress(5);
        const ifcAPI = new WebIFC.IfcAPI();
        ifcAPI.SetWasmPath('/wasm/');
        await ifcAPI.Init();
        ifcApiRef.current = ifcAPI;
        if (cancelled) return;

        // --- Tải trạng thái đã lưu ---
        setStage('Đang tải trạng thái lắp đặt...');
        setProgress(10);
        try {
          const r = await fetch(`/api/ifc/elements?fileId=${fileId}`);
          if (r.ok) {
            const storedList = await r.json() as StoredStatus[];
            for (const s of storedList) {
              if (s.status === 'dang_lap' || s.status === 'hoan_thanh') {
                statusMap.current.set(s.global_id, s.status);
              }
            }
          }
        } catch { /* không block nếu API lỗi */ }
        if (cancelled) return;

        // --- Tải file IFC ---
        setStage('Đang tải file IFC...');
        setProgress(15);
        const fileRes = await fetch(`/api/ifc/files/${fileId}`);
        if (!fileRes.ok) throw new Error('Không tải được file IFC từ server');
        const arrayBuffer = await fileRes.arrayBuffer();
        if (cancelled) return;

        // --- Phân tích IFC ---
        setStage('Đang phân tích mô hình IFC...');
        setProgress(40);
        const uint8 = new Uint8Array(arrayBuffer);
        const modelID = ifcAPI.OpenModel(uint8, {
          COORDINATE_TO_ORIGIN: true,
        });
        modelIDRef.current = modelID;
        if (cancelled) return;

        // --- Dựng geometry Three.js từ mesh IFC ---
        setStage('Đang dựng mô hình 3D...');
        setProgress(50);
        const allExpressIDs: number[] = [];

        ifcAPI.StreamAllMeshes(modelID, (flatMesh: FlatMesh) => {
          const expressID = flatMesh.expressID;
          allExpressIDs.push(expressID);
          const meshes: import('three').Mesh[] = [];

          for (let i = 0; i < flatMesh.geometries.size(); i++) {
            const placed = flatMesh.geometries.get(i);
            const geomData = ifcAPI.GetGeometry(modelID, placed.geometryExpressID);

            const vPtr  = geomData.GetVertexData();
            const vSize = geomData.GetVertexDataSize();
            const iPtr  = geomData.GetIndexData();
            const iSize = geomData.GetIndexDataSize();

            if (vSize === 0 || iSize === 0) { geomData.delete(); continue; }

            const rawVerts = ifcAPI.GetVertexArray(vPtr, vSize);
            const rawInds  = ifcAPI.GetIndexArray(iPtr, iSize);
            geomData.delete(); // giải phóng bộ nhớ WASM ngay lập tức

            const nVerts = rawVerts.length / 6; // mỗi vertex = pos(3) + normal(3)
            const pos    = new Float32Array(nVerts * 3);
            const nrm    = new Float32Array(nVerts * 3);
            for (let j = 0; j < nVerts; j++) {
              const s = j * 6, d = j * 3;
              pos[d] = rawVerts[s]; pos[d+1] = rawVerts[s+1]; pos[d+2] = rawVerts[s+2];
              nrm[d] = rawVerts[s+3]; nrm[d+1] = rawVerts[s+4]; nrm[d+2] = rawVerts[s+5];
            }

            const bufGeom = new THREE.BufferGeometry();
            bufGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            bufGeom.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3));
            bufGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(rawInds), 1));

            const mat = new THREE.MeshLambertMaterial({
              color: STATUS_HEX.chua_lap,
              transparent: true,
              opacity: STATUS_OPACITY.chua_lap,
              side: THREE.DoubleSide,
            });

            const mesh = new THREE.Mesh(bufGeom, mat);
            mesh.userData.expressID = expressID;
            mesh.applyMatrix4(new THREE.Matrix4().fromArray(placed.flatTransformation));
            scene.add(mesh);
            meshes.push(mesh);
          }

          if (meshes.length) expressToMeshes.current.set(expressID, meshes);
        });
        if (cancelled) return;

        // --- Lấy GlobalId cho mỗi expressID ---
        setStage('Đang ánh xạ định danh cấu kiện...');
        setProgress(75);
        let done = 0;
        for (const expressID of allExpressIDs) {
          try {
            const line = ifcAPI.GetLine(modelID, expressID, false) as {
              GlobalId?: { value: string }
            };
            const gid = line?.GlobalId?.value;
            if (gid) {
              expressToGlobalId.current.set(expressID, gid);
              // Áp dụng màu theo trạng thái đã lưu
              const stored = statusMap.current.get(gid);
              if (stored) applyColor(expressID, stored);
            }
          } catch { /* element không có GlobalId, bỏ qua */ }
          done++;
          if (done % 50 === 0) {
            setProgress(75 + Math.floor((done / allExpressIDs.length) * 20));
          }
        }
        if (cancelled) return;

        // --- Fit camera vào toàn bộ model ---
        const box = new THREE.Box3().setFromObject(scene);
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const size   = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          camera.far   = maxDim * 20;
          camera.near  = maxDim * 0.0001;
          camera.updateProjectionMatrix();
          camera.position.set(
            center.x + maxDim * 0.8,
            center.y + maxDim * 0.5,
            center.z + maxDim * 0.8
          );
          controls.target.copy(center);
          controls.update();
        }

        setProgress(100);
        computeStats();
        onLoaded?.(allExpressIDs.length, statusMap.current.size);
        setLoading(false);

      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Lỗi không xác định khi tải mô hình');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, [fileId, applyColor, computeStats, onLoaded]);

  // Xử lý click chọn cấu kiện (raycasting)
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (loading || !canvasRef.current || !sceneRef.current || !cameraRef.current) return;

    const canvas  = canvasRef.current;
    const rect    = canvas.getBoundingClientRect();
    const ndcX    = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY    = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const THREE = (window as unknown as { __THREE__: typeof import('three') }).__THREE__;
    if (!THREE) return;

    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(ndcX, ndcY),
      cameraRef.current as import('three').Camera
    );

    const targets: import('three').Object3D[] = [];
    (sceneRef.current as import('three').Scene).traverse(obj => {
      if ((obj as import('three').Mesh).isMesh && obj.userData.expressID !== undefined && (obj as import('three').Mesh).visible) {
        targets.push(obj);
      }
    });

    const hits = ray.intersectObjects(targets, false);
    if (!hits.length) { setSelected(null); return; }

    const expressID = hits[0].object.userData.expressID as number;
    const globalId  = expressToGlobalId.current.get(expressID) ?? `#${expressID}`;
    const status    = statusMap.current.get(globalId) ?? 'chua_lap';
    setSelected({ expressID, globalId, status });
  }, [loading]);

  // Đổi filter hiển thị
  const handleFilter = useCallback((f: ElementStatus | 'all') => {
    setFilter(f);
    applyFilter(f);
  }, [applyFilter]);

  const chua_lap = stats.total - stats.dang_lap - stats.hoan_thanh;

  return (
    <div className="relative w-full h-full select-none">
      {/* Canvas 3D */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block cursor-crosshair"
        onClick={handleCanvasClick}
        aria-label="Bản vẽ 3D IFC — click để chọn cấu kiện"
      />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/95 gap-4">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-zinc-300">{stage}</p>
          <div className="w-56 bg-zinc-800 rounded-full h-1.5">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500">{progress}%</p>
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/90">
          <div className="bg-zinc-900 border border-red-800 rounded-xl p-6 max-w-sm mx-4 text-center">
            <p className="text-red-400 font-semibold mb-2">Không tải được mô hình</p>
            <p className="text-sm text-zinc-400">{error}</p>
          </div>
        </div>
      )}

      {/* Thanh thống kê + filter (khi đã tải xong) */}
      {!loading && !error && (
        <div className="absolute top-3 left-3 flex flex-col gap-2 pointer-events-none">
          {/* Thống kê */}
          <div className="bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-xl px-3 py-2 flex gap-3 text-xs pointer-events-auto">
            <span className="text-zinc-400">{stats.total} cấu kiện</span>
            <span className="flex items-center gap-1 text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-zinc-500 inline-block" />
              {chua_lap}
            </span>
            <span className="flex items-center gap-1 text-amber-400">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              {stats.dang_lap}
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              {stats.hoan_thanh}
            </span>
          </div>

          {/* Filter theo trạng thái */}
          <div className="bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-xl px-2 py-1.5 flex gap-1 pointer-events-auto">
            <Layers className="w-3.5 h-3.5 text-zinc-500 self-center ml-1 mr-0.5" />
            {(['all', 'chua_lap', 'dang_lap', 'hoan_thanh'] as const).map(f => (
              <button
                key={f}
                onClick={() => handleFilter(f)}
                className={`px-2 py-0.5 rounded-lg text-xs transition ${
                  filter === f
                    ? f === 'hoan_thanh' ? 'bg-emerald-900 text-emerald-300 border border-emerald-700'
                    : f === 'dang_lap'   ? 'bg-amber-900 text-amber-300 border border-amber-700'
                    : f === 'chua_lap'   ? 'bg-zinc-700 text-zinc-200 border border-zinc-500'
                    : 'bg-zinc-700 text-zinc-200 border border-zinc-500'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {f === 'all' ? 'Tất cả' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nút đặt lại camera */}
      {!loading && !error && (
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          <button
            onClick={resetCamera}
            title="Đặt lại camera"
            className="bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-xl p-2 text-zinc-400 hover:text-white hover:border-zinc-500 transition"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleFilter('all')}
            title="Hiện tất cả"
            className="bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-xl p-2 text-zinc-400 hover:text-white hover:border-zinc-500 transition"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Hướng dẫn nhanh */}
      {!loading && !error && !selected && (
        <div className="absolute bottom-4 right-3 bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-xl px-3 py-2 text-[10px] text-zinc-500 leading-relaxed">
          <p>🖱 Chuột trái: xoay · Phải: di chuyển · Scroll: zoom</p>
          <p>👆 Click vào cấu kiện để đổi trạng thái lắp đặt</p>
        </div>
      )}

      {/* Panel chi tiết cấu kiện đã chọn */}
      {selected && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 pointer-events-auto">
          <div className="bg-zinc-900/95 backdrop-blur border border-zinc-700 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <p className="text-[10px] text-zinc-500 mb-0.5 uppercase tracking-wide">GlobalId</p>
                <p className="text-sm font-mono text-zinc-200 truncate" title={selected.globalId}>
                  {selected.globalId}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                aria-label="Đóng"
                className="shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 mb-2 font-medium">Trạng thái lắp đặt</p>
            <div className="grid grid-cols-3 gap-2">
              {(['chua_lap', 'dang_lap', 'hoan_thanh'] as ElementStatus[]).map(s => {
                const active = selected.status === s;
                const Icon = s === 'hoan_thanh' ? CheckCircle : s === 'dang_lap' ? Clock : Circle;
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(selected.expressID, selected.globalId, s)}
                    className={`flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl border text-xs font-medium transition-all ${
                      active
                        ? s === 'hoan_thanh' ? 'bg-emerald-900/60 border-emerald-500 text-emerald-300 shadow-emerald-900/50 shadow-lg'
                        : s === 'dang_lap'   ? 'bg-amber-900/60 border-amber-500 text-amber-300 shadow-amber-900/50 shadow-lg'
                        : 'bg-zinc-800 border-zinc-500 text-zinc-200'
                        : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 hover:bg-zinc-900'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-center leading-tight">{STATUS_LABEL[s]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
