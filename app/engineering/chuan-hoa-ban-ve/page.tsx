"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Layers, Download, FileSpreadsheet } from "lucide-react";
import AppHeader from "@/app/components/AppHeader";
import PluginControlPanel from "./components/PluginControlPanel";
import ThuVienBlockPanel from "./components/ThuVienBlockPanel";
import MaBoqDuAnPanel from "./components/MaBoqDuAnPanel";
import UploadAndBrowsePanel from "./components/UploadAndBrowsePanel";
import CadViewportStudio from "./components/CadViewportStudio";
import StepTabsNav from "./components/StepTabsNav";
import DiagnosticPurgePanel from "./components/DiagnosticPurgePanel";
import LayersFontPanel from "./components/LayersFontPanel";
import BoqDimCtbPanel from "./components/BoqDimCtbPanel";
import XrefDiffPanel from "./components/XrefDiffPanel";
import Step2NamingPanel from "./components/Step2NamingPanel";
import { useAutoHealEngine } from "./hooks/useAutoHealEngine";
import { useBlockCatalog } from "./hooks/useBlockCatalog";
import { useCadDiff } from "./hooks/useCadDiff";
import { useCadExporters } from "./hooks/useCadExporters";
import { useCadHealthScore } from "./hooks/useCadHealthScore";
import { useCadReviewApproval } from "./hooks/useCadReviewApproval";
import { useCadSource } from "./hooks/useCadSource";
import { useCadStandardization } from "./hooks/useCadStandardization";
import { useCadViewport } from "./hooks/useCadViewport";
import { useFontDoctor } from "./hooks/useFontDoctor";
import { useSmartNaming } from "./hooks/useSmartNaming";
import type { Step1SubTab } from "./types";

export default function ChuanHoaBanVePage() {
  // ── Quy trình 2 bước ──
  // Bước 1: ⚡ Studio Chuẩn Hóa CAD 2D (1-Click Auto-Heal, WCS 2D & Viewport)
  // Bước 2: 💾 Đặt Tên Chuẩn ISO 19650 & Lưu Trữ Dự Án (Smart Naming & Storage Center)
  const [activeStep, setActiveStep] = useState<1 | 2>(1);
  const [step1SubTab, setStep1SubTab] = useState<Step1SubTab>("diagnostic_purge");

  const viewport = useCadViewport();
  const fontDoctor = useFontDoctor();
  const review = useCadReviewApproval();
  const diff = useCadDiff();
  const blockCatalog = useBlockCatalog();

  const source = useCadSource({ onLayersParsed: viewport.initVisibleLayersFromDxf });

  const naming = useSmartNaming({
    dxfData: source.dxfData,
    conversionInfo: source.conversionInfo,
    is2dApproved: review.is2dApproved,
    approverName: review.approverName,
    reviewerRemarks: review.reviewerRemarks,
  });

  const standardization = useCadStandardization({
    dxfData: source.dxfData,
    setDxfData: source.setDxfData,
    onFontSampleDetected: fontDoctor.applyDetectedSample,
    onDrawingFileNameDetected: naming.applyDrawingFileName,
  });

  const health = useCadHealthScore({
    dxfData: source.dxfData,
    manualLayers: standardization.manualLayers,
    manualTexts: standardization.manualTexts,
    manualBlocks: standardization.manualBlocks,
    dimOverrides: standardization.dimOverrides,
    purgeState: standardization.purgeState,
  });

  const autoHeal = useAutoHealEngine({
    dxfData: source.dxfData,
    setDxfData: source.setDxfData,
    setManualLayers: standardization.setManualLayers,
    setManualTexts: standardization.setManualTexts,
    setDimOverrides: standardization.setDimOverrides,
    setPurgeState: standardization.setPurgeState,
    setWcsConfig: standardization.setWcsConfig,
    setIsReviewDone: review.setIsReviewDone,
  });

  const exporters = useCadExporters({
    dxfData: source.dxfData,
    conversionInfo: source.conversionInfo,
    saveConfig: naming.saveConfig,
    generatedFileName: naming.generatedFileName,
    wcsConfig: standardization.wcsConfig,
    scores: {
      layerScore: health.layerScore,
      fontScore: health.fontScore,
      geometryScore: health.geometryScore,
      dimScore: health.dimScore,
      blockScore: health.blockScore,
      xrefScore: health.xrefScore,
      totalHealthScore: health.totalHealthScore,
    },
    counts: {
      layersCount: standardization.manualLayers.length,
      textCount: standardization.manualTexts.length,
      blocksCount: standardization.manualBlocks.length,
      dimsCount: standardization.dimOverrides.length,
    },
  });

  const { fetchDesignDrawings, runDxfAnalysis } = source;
  const { runDiffAnalysis } = diff;
  const { fetchBlockCatalogs } = blockCatalog;

  useEffect(() => {
    fetchDesignDrawings();
    runDxfAnalysis();
    runDiffAnalysis();
    fetchBlockCatalogs();
  }, [fetchDesignDrawings, runDxfAnalysis, runDiffAnalysis, fetchBlockCatalogs]);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AppHeader
        title={
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Layers className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-zinc-100 text-sm sm:text-base uppercase">
                  CHUẨN HÓA BẢN VẼ CAD 2D (ISO 19650)
                </span>
                <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-400 border border-emerald-500/20">
                  TCVN • ISO 19650
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 line-clamp-1">
                Chuẩn Hóa Layer AIA/BS1192, Bác Sĩ Font UTF-8, Gốc Tọa Độ WCS 2D (X, Y), Bóc Tách
                Block BOQ, Phục Hồi Dim Thực & Cây XREF
              </span>
            </div>
          </div>
        }
        bottomActions={
          <div className="flex items-center gap-2">
            <Link
              href="/ban-ve-thiet-ke"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
              <span>Bản Vẽ Thiết Kế</span>
            </Link>
            <button
              onClick={exporters.handleDownloadConvertedDxf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-on-accent-dark font-bold text-xs shadow-sm transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Tệp DXF 2D</span>
            </button>
          </div>
        }
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 space-y-4">
        {/* ══════════════════════════════════════════════════════════════════════
            BẢNG ĐIỀU KHIỂN PLUGIN AUTOCAD (M99 PR6) — rule pack, gói cài, lịch sử upload
        ══════════════════════════════════════════════════════════════════════ */}
        <PluginControlPanel />

        {/* ══════════════════════════════════════════════════════════════════════
            THƯ VIỆN BLOCK CHUẨN (M100 PR2) — version hiện hành, lịch sử, phát hành
        ══════════════════════════════════════════════════════════════════════ */}
        <ThuVienBlockPanel />

        {/* ══════════════════════════════════════════════════════════════════════
            MÃ BOQ THEO DỰ ÁN (M101 PR4) — gán mã cho hạng mục bóc tách XBOSS_BOCKL
        ══════════════════════════════════════════════════════════════════════ */}
        <MaBoqDuAnPanel />

        {/* ══════════════════════════════════════════════════════════════════════
            TOP BAR: CHỌN NGUỒN CAD (TỪ THIẾT KẾ HOẶC TẢI LÊN FILE .DXF)
        ══════════════════════════════════════════════════════════════════════ */}
        <UploadAndBrowsePanel
          sourceMode={source.sourceMode}
          setSourceMode={source.setSourceMode}
          selectedDrawingId={source.selectedDrawingId}
          setSelectedDrawingId={source.setSelectedDrawingId}
          uploadedFileName={source.uploadedFileName}
          fileInputRef={source.fileInputRef}
          folderInputRef={source.folderInputRef}
          explorerCategory={source.explorerCategory}
          setExplorerCategory={source.setExplorerCategory}
          expandedSystems={source.expandedSystems}
          drawingSearchQuery={source.drawingSearchQuery}
          setDrawingSearchQuery={source.setDrawingSearchQuery}
          toggleSystemExpand={source.toggleSystemExpand}
          allDrawingsList={source.allDrawingsList}
          filteredExplorerDrawings={source.filteredExplorerDrawings}
          folderFiles={source.folderFiles}
          folderName={source.folderName}
          selectedFolderFile={source.selectedFolderFile}
          folderFilter={source.folderFilter}
          setFolderFilter={source.setFolderFilter}
          loading={source.loading}
          conversionInfo={source.conversionInfo}
          runDxfAnalysis={source.runDxfAnalysis}
          handleSyncServerDrawings={source.handleSyncServerDrawings}
          handleFileUpload={source.handleFileUpload}
          handleDownloadConvertedDxf={exporters.handleDownloadConvertedDxf}
          handleFolderUpload={source.handleFolderUpload}
          handleSelectFolderDrawing={source.handleSelectFolderDrawing}
          analysisError={source.analysisError}
          ambiguousCandidates={source.ambiguousCandidates}
          resolveAmbiguousCandidate={source.resolveAmbiguousCandidate}
          cancelAmbiguousCandidates={source.cancelAmbiguousCandidates}
        />

        {/* ══════════════════════════════════════════════════════════════════════
            STUDIO ĐỒ HỌA CAD 2D VECTOR VIEWPORT & BẢNG ĐIỂM SỨC KHỎE 6D
        ══════════════════════════════════════════════════════════════════════ */}
        <CadViewportStudio
          isAutoHealing={autoHeal.isAutoHealing}
          dxfData={source.dxfData}
          canvasZoom={viewport.canvasZoom}
          setCanvasZoom={viewport.setCanvasZoom}
          canvasPan={viewport.canvasPan}
          setCanvasPan={viewport.setCanvasPan}
          isDraggingCanvas={viewport.isDraggingCanvas}
          setIsDraggingCanvas={viewport.setIsDraggingCanvas}
          dragStartPos={viewport.dragStartPos}
          setDragStartPos={viewport.setDragStartPos}
          cursorWcsCoords={viewport.cursorWcsCoords}
          setCursorWcsCoords={viewport.setCursorWcsCoords}
          selectedCadEntity={viewport.selectedCadEntity}
          setSelectedCadEntity={viewport.setSelectedCadEntity}
          visibleLayers={viewport.visibleLayers}
          setVisibleLayers={viewport.setVisibleLayers}
          showDefectsHighlight={viewport.showDefectsHighlight}
          setShowDefectsHighlight={viewport.setShowDefectsHighlight}
          hoveredCadEntity={viewport.hoveredCadEntity}
          setHoveredCadEntity={viewport.setHoveredCadEntity}
          purgeState={standardization.purgeState}
          toggleLayerVisibility={viewport.toggleLayerVisibility}
          layerScore={health.layerScore}
          fontScore={health.fontScore}
          geometryScore={health.geometryScore}
          dimScore={health.dimScore}
          blockScore={health.blockScore}
          xrefScore={health.xrefScore}
          totalHealthScore={health.totalHealthScore}
          triggerAutoHealWithProgress={autoHeal.triggerAutoHealWithProgress}
          handleDownloadMasterBundle={exporters.handleDownloadMasterBundle}
        />
        <StepTabsNav
          activeStep={activeStep}
          setActiveStep={setActiveStep}
          step1SubTab={step1SubTab}
          setStep1SubTab={setStep1SubTab}
          isAutoHealing={autoHeal.isAutoHealing}
          healCompleted={autoHeal.healCompleted}
          saveConfig={naming.saveConfig}
          totalHealthScore={health.totalHealthScore}
          triggerAutoHealWithProgress={autoHeal.triggerAutoHealWithProgress}
        />

        {/* ══════════════════════════════════════════════════════════════════════
            BƯỚC 1.1: CHẨN ĐOÁN DỊ TẬT, DỌN RÁC SÂU (PURGE/OVERKILL) & GỐC TỌA ĐỘ WCS
        ══════════════════════════════════════════════════════════════════════ */}
        {activeStep === 1 && step1SubTab === "diagnostic_purge" && (
          <DiagnosticPurgePanel
            setStep1SubTab={setStep1SubTab}
            dxfData={source.dxfData}
            manualLayers={standardization.manualLayers}
            purgeState={standardization.purgeState}
            wcsConfig={standardization.wcsConfig}
            setWcsConfig={standardization.setWcsConfig}
            handleRunDeepPurge={standardization.handleRunDeepPurge}
            handleAlignWcsOrigin={standardization.handleAlignWcsOrigin}
            hasRealData={health.hasRealData}
            totalHealthScore={health.totalHealthScore}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            BƯỚC 1.2: CHUẨN HÓA LAYER AIA/BS1192 & BÁC SĨ FONT CHỮ UTF-8
        ══════════════════════════════════════════════════════════════════════ */}
        {activeStep === 1 && step1SubTab === "layers_font" && (
          <LayersFontPanel
            setStep1SubTab={setStep1SubTab}
            selectedDisciplineFilter={standardization.selectedDisciplineFilter}
            setSelectedDisciplineFilter={standardization.setSelectedDisciplineFilter}
            layerSearch={standardization.layerSearch}
            setLayerSearch={standardization.setLayerSearch}
            legacyInput={fontDoctor.legacyInput}
            setLegacyInput={fontDoctor.setLegacyInput}
            convertedText={fontDoctor.convertedText}
            sampleFontSnippets={fontDoctor.sampleFontSnippets}
            handleConvertFont={fontDoctor.handleConvertFont}
            filteredLayers={standardization.filteredLayers}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            BƯỚC 1.3: BÓC TÁCH THIẾT BỊ BOQ, BÁC SĨ DIM ẢO & BẢNG NÉT IN CTB
        ══════════════════════════════════════════════════════════════════════ */}
        {activeStep === 1 && step1SubTab === "boq_dim_ctb" && (
          <BoqDimCtbPanel
            setStep1SubTab={setStep1SubTab}
            blockCatalogs={blockCatalog.blockCatalogs}
            loadingBlocks={blockCatalog.loadingBlocks}
            dimOverrides={standardization.dimOverrides}
            ctbMappings={standardization.ctbMappings}
            handleFixDimOverride={standardization.handleFixDimOverride}
            handleFixAllDims={standardization.handleFixAllDims}
            handleDownloadCtb={standardization.handleDownloadCtb}
            fetchBlockCatalogs={blockCatalog.fetchBlockCatalogs}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            BƯỚC 1.4: CÂY LIÊN KẾT XREF & SO SÁNH PHIÊN BẢN DIFF
        ══════════════════════════════════════════════════════════════════════ */}
        {activeStep === 1 && step1SubTab === "xref_diff" && (
          <XrefDiffPanel
            setActiveStep={setActiveStep}
            dxfData={source.dxfData}
            diffResult={diff.diffResult}
            hasRealData={health.hasRealData}
            handleToggleXrefBind={source.handleToggleXrefBind}
            runDiffAnalysis={diff.runDiffAnalysis}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            BƯỚC 2: ĐẶT TÊN CHUẨN ISO 19650, KÝ DUYỆT GATE 0 & LƯU TRỮ DỰ ÁN
        ══════════════════════════════════════════════════════════════════════ */}
        {activeStep === 2 && (
          <Step2NamingPanel
            setCad2dApprovalStatus={review.setCad2dApprovalStatus}
            approverName={review.approverName}
            setApproverName={review.setApproverName}
            approvedAt={review.approvedAt}
            manualLayers={standardization.manualLayers}
            manualTexts={standardization.manualTexts}
            manualBlocks={standardization.manualBlocks}
            reviewerRemarks={review.reviewerRemarks}
            setReviewerRemarks={review.setReviewerRemarks}
            handleUpdateManualLayer={standardization.handleUpdateManualLayer}
            handleUpdateManualText={standardization.handleUpdateManualText}
            handleUpdateManualBlock={standardization.handleUpdateManualBlock}
            handleSaveManualReview={review.handleSaveManualReview}
            handleApprove2d={review.handleApprove2d}
            saveConfig={naming.saveConfig}
            setSaveConfig={naming.setSaveConfig}
            savingToServer={naming.savingToServer}
            savedResult={naming.savedResult}
            generatedFileName={naming.generatedFileName}
            is2dApproved={review.is2dApproved}
            targetFolderDisplay={naming.targetFolderDisplay}
            handleSaveToProjectServer={naming.handleSaveToProjectServer}
            handleDownloadStandardizedNamedDxf={exporters.handleDownloadStandardizedNamedDxf}
            handleDownloadMasterBundle={exporters.handleDownloadMasterBundle}
          />
        )}
      </main>
    </div>
  );
}
