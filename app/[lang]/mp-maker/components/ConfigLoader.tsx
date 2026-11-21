"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useOncePerKey } from "@/hooks/use-once-per-key";
import { getApiErrorMessage } from "@/lib/utils";
import { useBuilder } from "./BuilderProvider";

export function ConfigLoader() {
  const builder = useBuilder();
  const searchParams = useSearchParams();
  const configId = searchParams.get("config");
  const heightParam = searchParams.get("height");
  const positionParam = searchParams.get("position");

  const loadBolsterDirect = useCallback(async (height: number, position: string) => {
    builder.setIsLoadingRecommendation(true);
    builder.goToStep("recommendation");
    builder.setBolsterPreferences({ height_cm: height, sleep_position: position as "side" | "stomach" | "other" });

    try {
      const res = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bolster_preferences: { height_cm: height, sleep_position: position } }),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error(getApiErrorMessage(data.error, "Failed to get recommendation"));
        builder.goToStep("preferences");
        return;
      }
      builder.setRecommendation(data);
      const defaultCover = data.components?.covers?.find((c: { base_quantity: number }) => c.base_quantity > 0);
      const defaultCase = data.components?.cases?.find((c: { base_quantity: number }) => c.base_quantity > 0);
      if (defaultCover) builder.setSelectedCover(defaultCover.item_id);
      if (defaultCase) builder.setSelectedCase(defaultCase.item_id);
      builder.setConfigLoaded(true);
    } catch {
      toast.error("Something went wrong");
      builder.goToStep("preferences");
    } finally {
      builder.setIsLoadingRecommendation(false);
    }
  }, [builder]);

  const bolsterWarmStart =
    heightParam && positionParam && !builder.configLoaded ? `${heightParam}:${positionParam}` : null;
  useOncePerKey(bolsterWarmStart, () => {
    if (!heightParam || !positionParam) return;
    const h = parseInt(heightParam, 10);
    if (h >= 80 && h <= 250) {
      loadBolsterDirect(h, positionParam);
    }
  });

  const loadConfig = useCallback(async (id: string) => {
    builder.setConfigId(id);
    builder.setIsLoadingRecommendation(true);
    builder.goToStep("recommendation");

    try {
      const responseRes = await fetch(`/api/mp-config/responses/${id}`);
      const responseData = await responseRes.json();

      if (!responseData.ok || !responseData.response) {
        toast.error("Could not load your measurement data");
        builder.goToStep("preferences");
        return;
      }

      const data = responseData.response.data;

      const measurementPreferences = {
        measurements: {
          shoulder_length_cm: parseFloat(data.shoulderLength) || 0,
          neck_to_back_cm: parseFloat(data.neckToBack) || 0,
          head_to_back_cm: parseFloat(data.headToBack) || 0,
          neck_length_cm: parseFloat(data.neckLength) || 0,
        },
        demographics: {
          gender: data.gender ?? "",
          age_group: data.ageGroup ?? "",
        },
        health: {
          blood_pressure: data.bloodPressureLevel ?? "",
          ear_discomfort_side_sleep: data.earDiscomfortSideSleep === "yes",
          bed_firmness: data.bedFirmness ?? "",
          acid_reflux: data.acidReflux === "yes",
          sleep_pain_areas: data.sleepPainAreas ?? [],
          sleep_position_type: data.sleepPositionType ?? [],
          uses_bolster: data.usesBolster === "yes",
        },
      };

      const customizeRes = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurement_preferences: measurementPreferences }),
      });
      const customizeData = await customizeRes.json();

      if (!customizeData.ok) {
        toast.error(getApiErrorMessage(customizeData.error, "Failed to get recommendation"));
        builder.goToStep("preferences");
        return;
      }

      builder.setRecommendation(customizeData);

      const defaultCover = customizeData.components?.covers?.find(
        (c: { base_quantity: number }) => c.base_quantity > 0
      );
      const defaultCase = customizeData.components?.cases?.find(
        (c: { base_quantity: number }) => c.base_quantity > 0
      );
      if (defaultCover) builder.setSelectedCover(defaultCover.item_id);
      if (defaultCase) builder.setSelectedCase(defaultCase.item_id);

      builder.setConfigLoaded(true);
    } catch {
      toast.error("Something went wrong loading your data");
      builder.goToStep("preferences");
    } finally {
      builder.setIsLoadingRecommendation(false);
    }
  }, [builder]);

  useOncePerKey(configId && !builder.configLoaded ? configId : null, loadConfig);

  return null;
}
