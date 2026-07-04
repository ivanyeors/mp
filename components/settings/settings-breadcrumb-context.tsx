"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type SettingsBreadcrumbContextValue = {
  detailLabel: string | null;
  setDetailLabel: (label: string | null) => void;
};

const SettingsBreadcrumbContext = createContext<SettingsBreadcrumbContextValue | null>(null);

export function SettingsBreadcrumbProvider({ children }: { children: ReactNode }) {
  const [detailLabel, setDetailLabelState] = useState<string | null>(null);

  const setDetailLabel = useCallback((label: string | null) => {
    setDetailLabelState(label);
  }, []);

  const value = useMemo(
    () => ({ detailLabel, setDetailLabel }),
    [detailLabel, setDetailLabel],
  );

  return (
    <SettingsBreadcrumbContext.Provider value={value}>
      {children}
    </SettingsBreadcrumbContext.Provider>
  );
}

export function useSettingsBreadcrumbDetailLabel(): string | null {
  return useContext(SettingsBreadcrumbContext)?.detailLabel ?? null;
}

/** Publish the current entity name into the settings breadcrumb trail. */
export function useSettingsBreadcrumbDetail(label: string | null | undefined) {
  const ctx = useContext(SettingsBreadcrumbContext);

  useEffect(() => {
    if (!ctx) return;
    if (!label) {
      ctx.setDetailLabel(null);
      return;
    }
    ctx.setDetailLabel(label);
    return () => ctx.setDetailLabel(null);
  }, [ctx, label]);
}
