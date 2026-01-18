"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { RetroGrid } from "@/components/ui/shadcn-io/retro-grid";
import { Particles } from "@/components/ui/particles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  ArrowRight, 
  ArrowLeft, 
  User, 
  Sparkles,
  CheckCircle,
  Image as ImageIcon
} from "lucide-react";

type Step = 
  | "welcome"
  | "what-to-expect"
  | "name"
  | "shoulder-length"
  | "neck-to-back"
  | "head-to-back"
  | "neck-length"
  | "customize"
  | "preview";

interface MeasurementData {
  name: string;
  gender: string;
  ageGroup: string;
  bloodPressureLevel: string;
  earDiscomfortSideSleep: "yes" | "no" | "";
  bedFirmness: string;
  acidReflux: "yes" | "no" | "";
  shoulderLength: string;
  neckToBack: string;
  headToBack: string;
  neckLength: string;
}

type SuggestedBomLine = {
  quantity: number | string;
  item: { id: number; category: string; name: string; size: string | null; subtype: string | null } | null;
};

type MpConfigSuggestion = {
  recommended: { size: "XS" | "S" | "M" | "L" | "XL"; kind: "basic" | "premium" };
  product: { id: number; size: "XS" | "S" | "M" | "L" | "XL"; kind: "basic" | "premium" } | null;
  bom: SuggestedBomLine[];
  reasons: string[];
};

export default function MpConfigPage() {
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [gridSpeed, setGridSpeed] = useState<"slow" | "fast" | "reverse">("slow");
  const [shoulderLengthUnit, setShoulderLengthUnit] = useState<"cm" | "in">("cm");
  const [neckToBackUnit, setNeckToBackUnit] = useState<"cm" | "in">("cm");
  const [headToBackUnit, setHeadToBackUnit] = useState<"cm" | "in">("cm");
  const [neckLengthUnit, setNeckLengthUnit] = useState<"cm" | "in">("cm");
  const [measurementData, setMeasurementData] = useState<MeasurementData>({
    name: "",
    gender: "",
    ageGroup: "",
    bloodPressureLevel: "",
    earDiscomfortSideSleep: "",
    bedFirmness: "",
    acidReflux: "",
    shoulderLength: "",
    neckToBack: "",
    headToBack: "",
    neckLength: "",
  });

  const [responseId, setResponseId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [suggestion, setSuggestion] = useState<MpConfigSuggestion | null>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const lastSavedRef = useRef<string>("");

  const stepOrder: Step[] = [
    "welcome",
    "what-to-expect",
    "name",
    "shoulder-length",
    "neck-to-back",
    "head-to-back",
    "neck-length",
    "customize",
    "preview",
  ];

  const goToNextStep = () => {
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      // Trigger fast grid animation
      setGridSpeed("fast");
      setIsTransitioning(true);
      
      setTimeout(() => {
        setCurrentStep(stepOrder[currentIndex + 1]);
        setIsTransitioning(false);
        
        // Return to slow animation after transition
        setTimeout(() => {
          setGridSpeed("slow");
        }, 100);
      }, 300);
    }
  };

  const goToPreviousStep = () => {
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      // Trigger reverse grid animation (moving backward)
      setGridSpeed("reverse");
      setIsTransitioning(true);
      
      setTimeout(() => {
        setCurrentStep(stepOrder[currentIndex - 1]);
        setIsTransitioning(false);
        
        // Return to slow animation after transition
        setTimeout(() => {
          setGridSpeed("slow");
        }, 100);
      }, 300);
    }
  };

  const updateMeasurement = <K extends keyof MeasurementData>(
    field: K,
    value: MeasurementData[K],
  ) => {
    setMeasurementData((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = "mp_config_response_id";
    let id = window.localStorage.getItem(key);
    if (!id) {
      id = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      window.localStorage.setItem(key, id);
    }
    setResponseId(id);
  }, []);

  const hasAnyInput = useMemo(() => {
    const d = measurementData;
    return (
      d.name.trim() ||
      d.gender.trim() ||
      d.ageGroup.trim() ||
      d.bloodPressureLevel.trim() ||
      d.earDiscomfortSideSleep !== "" ||
      d.bedFirmness.trim() ||
      d.acidReflux !== "" ||
      d.shoulderLength.trim() ||
      d.neckToBack.trim() ||
      d.headToBack.trim() ||
      d.neckLength.trim()
    );
  }, [measurementData]);

  const upsertToDb = async (opts?: { isFinal?: boolean }) => {
    if (!responseId) return null;
    if (!hasAnyInput) return responseId;

    const snapshot = JSON.stringify({ responseId, measurementData, isFinal: opts?.isFinal ?? null });
    if (!opts?.isFinal && snapshot === lastSavedRef.current) return responseId;

    setSaveStatus("saving");
    try {
      const res = await fetch("/api/mp-config/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: responseId,
          data: measurementData,
          ...(typeof opts?.isFinal === "boolean" ? { isFinal: opts.isFinal } : {}),
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to save");
      lastSavedRef.current = snapshot;
      setSaveStatus("saved");
      return payload?.id ?? responseId;
    } catch {
      setSaveStatus("error");
      return null;
    }
  };

  const loadSuggestion = async () => {
    if (!responseId) return;
    setSuggestionLoading(true);
    try {
      const res = await fetch(`/api/mp-config/responses/${encodeURIComponent(responseId)}`, {
        method: "GET",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "Failed to load suggestion");
      setSuggestion(payload?.suggestion ?? null);
    } catch {
      setSuggestion(null);
    } finally {
      setSuggestionLoading(false);
    }
  };

  useEffect(() => {
    if (!responseId) return;
    if (!hasAnyInput) return;
    const t = window.setTimeout(() => {
      upsertToDb();
    }, 650);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [responseId, hasAnyInput, measurementData]);

  const currentStepIndex = stepOrder.indexOf(currentStep);
  const progressValue =
    currentStepIndex <= 0
      ? 0
      : Math.round((currentStepIndex / (stepOrder.length - 1)) * 100);

  const hasAnsweredAdditionalQuestions =
    measurementData.bloodPressureLevel.trim() !== "" &&
    measurementData.bedFirmness.trim() !== "" &&
    measurementData.earDiscomfortSideSleep !== "" &&
    measurementData.acidReflux !== "";

  const saveLabel:
    | { text: string; className: string }
    | null =
    saveStatus === "saving"
      ? {
          text: "Saving…",
          className: "border-primary/20 bg-primary/10 text-primary",
        }
      : saveStatus === "saved"
        ? {
            text: "Saved",
            className:
              "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          }
        : saveStatus === "error"
          ? {
              text: "Save failed",
              className: "border-destructive/20 bg-destructive/10 text-destructive",
            }
          : null;

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Retro Grid Background */}
      <RetroGrid className="z-0" opacity={0.3} speed={gridSpeed} />

      {/* Interactive particles */}
      <Particles
        className="absolute inset-0 z-0"
        quantity={100}
        ease={80}
        staticity={50}
        color="#ffffff"
        size={0.8}
      />

      {/* Content Container */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div
          className={`w-full max-w-2xl transition-all duration-300 ${
            isTransitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
          }`}
        >
          {/* Progress Indicator */}
          {currentStep !== "welcome" && (
            <div className="mb-6 flex justify-center">
              <Progress
                value={progressValue}
                aria-label="Configuration progress"
                className="w-full max-w-2xl"
              />
            </div>
          )}

          {/* Welcome Step */}
          {currentStep === "welcome" && (
            <div className="flex flex-col items-center justify-center space-y-8 text-center">
              <div className="space-y-4">
                <Image
                  src="/mpillow_logo_2026.png"
                  alt="Mpillow Logo"
                  width={200}
                  height={200}
                  className="mx-auto mb-6"
                  priority
                />
                <h1 className="text-6xl font-bold tracking-tight">
                  Customise <span className="text-primary">Mpillow</span>
                </h1>
                <p className="text-xl text-muted-foreground">
                  Let&apos;s create your perfect pillow, customized just for you
                </p>
              </div>
              <Button size="lg" onClick={goToNextStep} className="group">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          )}

          {/* What to Expect Step */}
          {currentStep === "what-to-expect" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <Sparkles className="h-12 w-12 mx-auto text-primary" />
                <h2 className="text-3xl font-bold">What to Expect</h2>
                <p className="text-muted-foreground">Here&apos;s how the process works</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start space-x-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    1
                  </div>
                  <div>
                    <h3 className="font-semibold">Tell us about yourself</h3>
                    <p className="text-sm text-muted-foreground">Provide us helpful information for us to work with</p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    2
                  </div>
                  <div>
                    <h3 className="font-semibold">Take measurements</h3>
                    <p className="text-sm text-muted-foreground">
                      We&apos;ll guide you through 4 simple measurements
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4 p-4 rounded-lg bg-muted/50">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    3
                  </div>
                  <div>
                    <h3 className="font-semibold">See your results</h3>
                    <p className="text-sm text-muted-foreground">
                      Get your personalized pillow recommendation
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button onClick={goToNextStep}>
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Name Input Step */}
          {currentStep === "name" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <User className="h-12 w-12 mx-auto text-primary" />
                <h2 className="text-3xl font-bold">Tell us about yourself</h2>
                <p className="text-muted-foreground">Let&apos;s personalize your experience</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="mp-name" className="text-sm font-medium">
                    What&apos;s your name?
                  </label>
                  <Input
                    id="mp-name"
                    placeholder="Enter your name"
                    value={measurementData.name}
                    onChange={(e) => updateMeasurement("name", e.target.value)}
                    className="text-lg h-12"
                    autoFocus
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Gender</div>
                  <Select
                    value={measurementData.gender}
                    onValueChange={(v) => updateMeasurement("gender", v)}
                  >
                    <SelectTrigger className="w-full justify-between text-lg h-12">
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Age group</div>
                  <Select
                    value={measurementData.ageGroup}
                    onValueChange={(v) => updateMeasurement("ageGroup", v)}
                  >
                    <SelectTrigger className="w-full justify-between text-lg h-12">
                      <SelectValue placeholder="Select age group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="under-18">Under 18</SelectItem>
                      <SelectItem value="18-24">18–24</SelectItem>
                      <SelectItem value="25-34">25–34</SelectItem>
                      <SelectItem value="35-44">35–44</SelectItem>
                      <SelectItem value="45-54">45–54</SelectItem>
                      <SelectItem value="55-64">55–64</SelectItem>
                      <SelectItem value="65-plus">65+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={goToNextStep}
                    disabled={
                      !measurementData.name.trim() ||
                      !measurementData.gender.trim() ||
                      !measurementData.ageGroup.trim()
                    }
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Shoulder Length Measurement */}
          {currentStep === "shoulder-length" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <Image
                  src="/shoulder-length.svg"
                  alt="Shoulder length measurement"
                  width={200}
                  height={200}
                  className="mx-auto w-[200px] h-auto"
                  style={{ height: "auto" }}
                />
                <h2 className="text-3xl font-bold">Shoulder Length</h2>
                <p className="text-muted-foreground">
                  Measure from the left shoulder to the right shoulder
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <Input
                    type="number"
                    placeholder="Enter measurement"
                    value={
                      shoulderLengthUnit === "cm"
                        ? measurementData.shoulderLength
                        : (() => {
                            const cm = Number(measurementData.shoulderLength);
                            if (!measurementData.shoulderLength) return "";
                            if (!Number.isFinite(cm)) return measurementData.shoulderLength;
                            const inches = cm / 2.54;
                            return String(Math.round(inches * 100) / 100);
                          })()
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        updateMeasurement("shoulderLength", "");
                        return;
                      }

                      const n = Number(raw);
                      if (!Number.isFinite(n)) {
                        updateMeasurement("shoulderLength", raw);
                        return;
                      }

                      const cm =
                        shoulderLengthUnit === "cm" ? n : Math.round(n * 2.54 * 100) / 100;
                      updateMeasurement("shoulderLength", String(cm));
                    }}
                    className="text-lg h-12"
                    autoFocus
                  />
                  <Tabs
                    value={shoulderLengthUnit}
                    onValueChange={(v) => setShoulderLengthUnit(v as "cm" | "in")}
                  >
                    <TabsList className="h-12">
                      <TabsTrigger value="cm" className="px-3">
                        cm
                      </TabsTrigger>
                      <TabsTrigger value="in" className="px-3">
                        in
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <p className="text-sm text-muted-foreground">
                  💡 Tip: Have someone help you measure for accuracy
                </p>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={goToNextStep}
                    disabled={!measurementData.shoulderLength}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Neck to Back Measurement */}
          {currentStep === "neck-to-back" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <Image
                  src="/neck-to-back.svg"
                  alt="Neck to back measurement"
                  width={200}
                  height={200}
                  className="mx-auto w-[200px] h-auto"
                  style={{ height: "auto" }}
                />
                <h2 className="text-3xl font-bold">Neck to Back</h2>
                <p className="text-muted-foreground">
                  Measure from the base of your neck to your upper back
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <Input
                    type="number"
                    placeholder="Enter measurement"
                    value={
                      neckToBackUnit === "cm"
                        ? measurementData.neckToBack
                        : (() => {
                            const cm = Number(measurementData.neckToBack);
                            if (!measurementData.neckToBack) return "";
                            if (!Number.isFinite(cm)) return measurementData.neckToBack;
                            const inches = cm / 2.54;
                            return String(Math.round(inches * 100) / 100);
                          })()
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        updateMeasurement("neckToBack", "");
                        return;
                      }

                      const n = Number(raw);
                      if (!Number.isFinite(n)) {
                        updateMeasurement("neckToBack", raw);
                        return;
                      }

                      const cm =
                        neckToBackUnit === "cm" ? n : Math.round(n * 2.54 * 100) / 100;
                      updateMeasurement("neckToBack", String(cm));
                    }}
                    className="text-lg h-12"
                    autoFocus
                  />
                  <Tabs
                    value={neckToBackUnit}
                    onValueChange={(v) => setNeckToBackUnit(v as "cm" | "in")}
                  >
                    <TabsList className="h-12">
                      <TabsTrigger value="cm" className="px-3">
                        cm
                      </TabsTrigger>
                      <TabsTrigger value="in" className="px-3">
                        in
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <p className="text-sm text-muted-foreground">
                  💡 Tip: Measure while sitting in your typical sleeping position
                </p>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={goToNextStep}
                    disabled={!measurementData.neckToBack}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Head to Back Measurement */}
          {currentStep === "head-to-back" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <Image
                  src="/head-to-back.svg"
                  alt="Head to back measurement"
                  width={200}
                  height={200}
                  className="mx-auto w-[200px] h-auto"
                  style={{ height: "auto" }}
                />
                <h2 className="text-3xl font-bold">Head to Back</h2>
                <p className="text-muted-foreground">
                  Measure from the back of your head to your upper back
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <Input
                    type="number"
                    placeholder="Enter measurement"
                    value={
                      headToBackUnit === "cm"
                        ? measurementData.headToBack
                        : (() => {
                            const cm = Number(measurementData.headToBack);
                            if (!measurementData.headToBack) return "";
                            if (!Number.isFinite(cm)) return measurementData.headToBack;
                            const inches = cm / 2.54;
                            return String(Math.round(inches * 100) / 100);
                          })()
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        updateMeasurement("headToBack", "");
                        return;
                      }

                      const n = Number(raw);
                      if (!Number.isFinite(n)) {
                        updateMeasurement("headToBack", raw);
                        return;
                      }

                      const cm =
                        headToBackUnit === "cm" ? n : Math.round(n * 2.54 * 100) / 100;
                      updateMeasurement("headToBack", String(cm));
                    }}
                    className="text-lg h-12"
                    autoFocus
                  />
                  <Tabs
                    value={headToBackUnit}
                    onValueChange={(v) => setHeadToBackUnit(v as "cm" | "in")}
                  >
                    <TabsList className="h-12">
                      <TabsTrigger value="cm" className="px-3">
                        cm
                      </TabsTrigger>
                      <TabsTrigger value="in" className="px-3">
                        in
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <p className="text-sm text-muted-foreground">
                  💡 Tip: This helps us determine the ideal pillow height for you
                </p>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={goToNextStep}
                    disabled={!measurementData.headToBack}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Neck Length Measurement */}
          {currentStep === "neck-length" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <Image
                  src="/neck-length.svg"
                  alt="Neck length measurement"
                  width={200}
                  height={200}
                  className="mx-auto w-[200px] h-auto"
                  style={{ height: "auto" }}
                />
                <h2 className="text-3xl font-bold">Neck Length</h2>
                <p className="text-muted-foreground">
                  Measure vertically the length of your neck from c1 and stop at the shoulders
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <Input
                    type="number"
                    placeholder="Enter measurement"
                    value={
                      neckLengthUnit === "cm"
                        ? measurementData.neckLength
                        : (() => {
                            const cm = Number(measurementData.neckLength);
                            if (!measurementData.neckLength) return "";
                            if (!Number.isFinite(cm)) return measurementData.neckLength;
                            const inches = cm / 2.54;
                            return String(Math.round(inches * 100) / 100);
                          })()
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        updateMeasurement("neckLength", "");
                        return;
                      }

                      const n = Number(raw);
                      if (!Number.isFinite(n)) {
                        updateMeasurement("neckLength", raw);
                        return;
                      }

                      const cm =
                        neckLengthUnit === "cm" ? n : Math.round(n * 2.54 * 100) / 100;
                      updateMeasurement("neckLength", String(cm));
                    }}
                    className="text-lg h-12"
                    autoFocus
                  />
                  <Tabs
                    value={neckLengthUnit}
                    onValueChange={(v) => setNeckLengthUnit(v as "cm" | "in")}
                  >
                    <TabsList className="h-12">
                      <TabsTrigger value="cm" className="px-3">
                        cm
                      </TabsTrigger>
                      <TabsTrigger value="in" className="px-3">
                        in
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <p className="text-sm text-muted-foreground">
                  💡 Tip: This is the final measurement - almost done!
                </p>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={goToNextStep}
                    disabled={!measurementData.neckLength}
                  >
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Customize Button Step */}
          {currentStep === "customize" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
                <h2 className="text-3xl font-bold">Great job, {measurementData.name}!</h2>
                <p className="text-muted-foreground">
                  All measurements collected. Ready to see your custom pillow?
                </p>
              </div>

              <div className="space-y-2 bg-muted/50 p-4 rounded-lg">
                <h3 className="font-semibold text-lg mb-2">Your Measurements:</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Shoulder Length</p>
                    <p className="text-lg font-medium">{measurementData.shoulderLength} cm</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Neck to Back</p>
                    <p className="text-lg font-medium">{measurementData.neckToBack} cm</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Head to Back</p>
                    <p className="text-lg font-medium">{measurementData.headToBack} cm</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Neck Length</p>
                    <p className="text-lg font-medium">{measurementData.neckLength} cm</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 bg-muted/50 p-4 rounded-lg">
                <h4 className="font-semibold text-lg">A few more questions</h4>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Blood Pressure levels</h3>
                    <Select
                      value={measurementData.bloodPressureLevel}
                      onValueChange={(v) => updateMeasurement("bloodPressureLevel", v)}
                    >
                      <SelectTrigger className="w-full justify-between text-lg h-12">
                        <SelectValue placeholder="Select blood pressure level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="low-blood">Low Blood</SelectItem>
                        <SelectItem value="high-blood">High Blood</SelectItem>
                        <SelectItem value="unsure">Unsure</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium">Ear discomfort during side sleep?</h3>
                    </div>
                    <Tabs
                      value={measurementData.earDiscomfortSideSleep}
                      onValueChange={(v) =>
                        updateMeasurement("earDiscomfortSideSleep", v as "yes" | "no")
                      }
                    >
                      <TabsList className="h-12">
                        <TabsTrigger value="yes" className="px-4">
                          Yes
                        </TabsTrigger>
                        <TabsTrigger value="no" className="px-4">
                          No
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Bed firmness</h3>
                    <Select
                      value={measurementData.bedFirmness}
                      onValueChange={(v) => updateMeasurement("bedFirmness", v)}
                    >
                      <SelectTrigger className="w-full justify-between text-lg h-12">
                        <SelectValue placeholder="Select bed firmness" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="soft">Soft</SelectItem>
                        <SelectItem value="medium-soft">Medium Soft</SelectItem>
                        <SelectItem value="firm">Firm</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-medium">Acid Reflux?</h3>
                    </div>
                    <Tabs
                      value={measurementData.acidReflux}
                      onValueChange={(v) => updateMeasurement("acidReflux", v as "yes" | "no")}
                    >
                      <TabsList className="h-12">
                        <TabsTrigger value="yes" className="px-4">
                          Yes
                        </TabsTrigger>
                        <TabsTrigger value="no" className="px-4">
                          No
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    onClick={async () => {
                      await upsertToDb();
                      await loadSuggestion();
                      goToNextStep();
                    }}
                    disabled={!hasAnsweredAdditionalQuestions}
                    size="lg"
                    className="group"
                  >
                    <Sparkles className="mr-2 h-5 w-5" />
                    Generate Results
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Preview Step */}
          {currentStep === "preview" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 gap-4">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold">Your Custom Mpillow</h2>
                <p className="text-muted-foreground">
                  Here&apos;s a preview of your personalized pillow configuration
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-medium">Recommendation (from your answers + current inventory config)</div>
                  <Button variant="secondary" size="sm" onClick={loadSuggestion} disabled={suggestionLoading}>
                    {suggestionLoading ? "Refreshing…" : "Refresh"}
                  </Button>
                </div>
                {suggestionLoading && (
                  <div className="text-sm text-muted-foreground">Generating suggestion…</div>
                )}
                {!suggestionLoading && !suggestion && (
                  <div className="text-sm text-muted-foreground">
                    No suggestion yet. Click Refresh (or go back and click Generate Results).
                  </div>
                )}
                {!suggestionLoading && suggestion && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-md bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground">Recommended kind</div>
                        <div className="text-lg font-semibold">{suggestion.recommended.kind}</div>
                      </div>
                      <div className="rounded-md bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground">Recommended size</div>
                        <div className="text-lg font-semibold">{suggestion.recommended.size}</div>
                      </div>
                    </div>

                    {suggestion.product ? (
                      <div className="rounded-md bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground">Matched active product</div>
                        <div className="text-sm">
                          Product #{suggestion.product.id} ({suggestion.product.kind} · {suggestion.product.size})
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-md bg-background/60 p-3 text-sm text-muted-foreground">
                        No active product found for this recommendation (check `app/settings/inventory/configure/`).
                      </div>
                    )}

                    {suggestion.bom?.length ? (
                      <div className="rounded-md bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground mb-2">Current BOM for recommended product</div>
                        <div className="space-y-1">
                          {suggestion.bom.map((line, idx) => {
                            const item = line.item;
                            const label = item
                              ? `${item.category} · ${item.name}${item.subtype ? ` (${item.subtype})` : ""}${
                                  item.size ? ` · ${item.size}` : ""
                                }`
                              : "Unknown item";
                            return (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <div className="truncate">{label}</div>
                                <div className="shrink-0 tabular-nums">x{line.quantity}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : suggestion.product ? (
                      <div className="rounded-md bg-background/60 p-3 text-sm text-muted-foreground">
                        No BOM lines configured yet for this product.
                      </div>
                    ) : null}

                    {suggestion.reasons?.length ? (
                      <div className="rounded-md bg-background/60 p-3">
                        <div className="text-xs text-muted-foreground mb-2">Why this suggestion</div>
                        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                          {suggestion.reasons.map((r, idx) => (
                            <li key={idx}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="pt-4">
                <div className="flex justify-between">
                  <Button variant="outline" onClick={goToPreviousStep}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <Button
                    size="lg"
                    onClick={async () => {
                      await upsertToDb({ isFinal: true });
                    }}
                    disabled={!responseId || !hasAnyInput}
                  >
                    Save Configuration
                  </Button>
                </div>
                {saveLabel && (
                  <div className="mt-2 flex items-center justify-start">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${saveLabel.className}`}
                    >
                      {saveLabel.text}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
