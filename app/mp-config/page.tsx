"use client";

import { useState } from "react";
import Image from "next/image";
import { RetroGrid } from "@/components/ui/shadcn-io/retro-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
  shoulderLength: string;
  neckToBack: string;
  headToBack: string;
  neckLength: string;
}

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
    shoulderLength: "",
    neckToBack: "",
    headToBack: "",
    neckLength: "",
  });

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

  const updateMeasurement = (field: keyof MeasurementData, value: string) => {
    setMeasurementData((prev) => ({ ...prev, [field]: value }));
  };

  const currentStepIndex = stepOrder.indexOf(currentStep);
  const progressValue =
    currentStepIndex <= 0
      ? 0
      : Math.round((currentStepIndex / (stepOrder.length - 1)) * 100);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Retro Grid Background */}
      <RetroGrid className="z-0" opacity={0.3} speed={gridSpeed} />

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
                  Welcome to <span className="text-primary">Mpillow Config</span>
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
            <Card className="bg-card/80 backdrop-blur-sm p-8 space-y-6">
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
                    <p className="text-sm text-muted-foreground">We&apos;ll start with your name</p>
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
                    <h3 className="font-semibold">Customize your pillow</h3>
                    <p className="text-sm text-muted-foreground">
                      See your custom configuration come to life
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={goToPreviousStep}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={goToNextStep}>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </Card>
          )}

          {/* Name Input Step */}
          {currentStep === "name" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 space-y-6">
              <div className="text-center space-y-2">
                <User className="h-12 w-12 mx-auto text-primary" />
                <h2 className="text-3xl font-bold">What&apos;s your name?</h2>
                <p className="text-muted-foreground">Let&apos;s personalize your experience</p>
              </div>

              <div className="space-y-4">
                <Input
                  placeholder="Enter your name"
                  value={measurementData.name}
                  onChange={(e) => updateMeasurement("name", e.target.value)}
                  className="text-lg h-12"
                  autoFocus
                />
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={goToPreviousStep}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button
                  onClick={goToNextStep}
                  disabled={!measurementData.name.trim()}
                >
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </Card>
          )}

          {/* Shoulder Length Measurement */}
          {currentStep === "shoulder-length" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 space-y-6">
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

              <div className="flex justify-between pt-4">
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
            </Card>
          )}

          {/* Neck to Back Measurement */}
          {currentStep === "neck-to-back" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 space-y-6">
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

              <div className="flex justify-between pt-4">
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
            </Card>
          )}

          {/* Head to Back Measurement */}
          {currentStep === "head-to-back" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 space-y-6">
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

              <div className="flex justify-between pt-4">
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
            </Card>
          )}

          {/* Neck Length Measurement */}
          {currentStep === "neck-length" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 space-y-6">
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

              <div className="flex justify-between pt-4">
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
            </Card>
          )}

          {/* Customize Button Step */}
          {currentStep === "customize" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 space-y-6">
              <div className="text-center space-y-2">
                <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
                <h2 className="text-3xl font-bold">Great job, {measurementData.name}!</h2>
                <p className="text-muted-foreground">
                  All measurements collected. Ready to see your custom pillow?
                </p>
              </div>

              <div className="space-y-3 bg-muted/50 p-6 rounded-lg">
                <h3 className="font-semibold text-lg mb-4">Your Measurements:</h3>
                <div className="grid grid-cols-2 gap-4">
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

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={goToPreviousStep}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={goToNextStep} size="lg" className="group">
                  <Sparkles className="mr-2 h-5 w-5" />
                  Generate Results
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </div>
            </Card>
          )}

          {/* Preview Step */}
          {currentStep === "preview" && (
            <Card className="bg-card/80 backdrop-blur-sm p-8 space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-3xl font-bold">Your Custom Mpillow</h2>
                <p className="text-muted-foreground">
                  Here&apos;s a preview of your personalized pillow configuration
                </p>
              </div>

              <div className="aspect-video bg-muted/50 rounded-lg flex items-center justify-center border-2 border-dashed border-muted-foreground/20">
                <div className="text-center space-y-4">
                  <ImageIcon className="h-24 w-24 mx-auto text-muted-foreground/50" />
                  <p className="text-muted-foreground">Pillow Configuration Preview</p>
                  <p className="text-sm text-muted-foreground/70">
                    Customized for {measurementData.name}
                  </p>
                </div>
              </div>

              <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
                <p className="text-sm text-center">
                  ✨ Your pillow is optimized for your unique measurements and sleeping style
                </p>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={goToPreviousStep}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button size="lg">
                  Save Configuration
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
