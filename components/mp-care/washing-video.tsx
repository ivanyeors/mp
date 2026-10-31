"use client";

import { YouTubeAutoplayOnView } from "@/components/effects/youtube-autoplay-on-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** The two washing videos: Basic and Premium Mpillow come apart differently. */
const WASHING_VIDEOS = [
  { value: "basic", label: "Basic Mpillow", videoId: "dsuB9ndOixY" },
  { value: "premium", label: "Premium Mpillow", videoId: "LxtHJL9s58E" },
] as const;

/**
 * The washing video, with a switch between the Basic and Premium Mpillow.
 * Only the chosen video is mounted, so switching stops the other one.
 */
export function MpCareWashingVideo() {
  return (
    <Tabs defaultValue={WASHING_VIDEOS[0].value} className="gap-3">
      <TabsList aria-label="Choose your pillow">
        {WASHING_VIDEOS.map((video) => (
          <TabsTrigger key={video.value} value={video.value}>
            {video.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {WASHING_VIDEOS.map((video) => (
        <TabsContent key={video.value} value={video.value}>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="relative aspect-video bg-muted/20">
              <YouTubeAutoplayOnView
                videoId={video.videoId}
                title={`How to wash your ${video.label}`}
                controls={1}
              />
            </div>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
