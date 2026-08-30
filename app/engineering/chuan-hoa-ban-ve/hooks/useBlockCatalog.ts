"use client";

import { useCallback, useState } from "react";
import type { BlockCatalogItem } from "../types";

// Thư viện block thiết bị dùng cho bóc tách BOQ.
export function useBlockCatalog() {
  const [blockCatalogs, setBlockCatalogs] = useState<BlockCatalogItem[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(false);

  const fetchBlockCatalogs = useCallback(async () => {
    setLoadingBlocks(true);
    try {
      const res = await fetch("/api/engineering/cad/blocks");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setBlockCatalogs(data);
        } else {
          setBlockCatalogs([]);
        }
      }
    } catch (e) {
      console.error("Fetch blocks error:", e);
      setBlockCatalogs([]);
    } finally {
      setLoadingBlocks(false);
    }
  }, []);

  return { blockCatalogs, loadingBlocks, fetchBlockCatalogs };
}
