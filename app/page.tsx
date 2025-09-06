import { ModeToggle } from "@/components/mode-toggle";
import { Ripple } from "@/components/ui/shadcn-io/ripple";
import { Button } from "@/components/ui/button";
import { Wrench, Heart, Sparkles } from "lucide-react";
import Link from "next/link";


export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Header with theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ModeToggle />
      </div>

      {/* Hero Section with Ripple Background */}
      <main className="flex-1 flex items-center justify-center p-8 relative">
        <div className="text-center space-y-8 max-w-4xl mx-auto relative z-10">
          <div className="space-y-4">
            <h1 className="text-6xl md:text-7xl font-bold text-foreground tracking-tight">
              Create Your Perfect
              <span className="block text-primary">Custom Pillow</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Design and customize pillows that match your style. From unique fabrics to personalized designs,
              bring your vision to life with our intuitive pillow maker.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/mp-maker">
              <Button size="lg" className="text-lg px-8 py-6 h-auto">
                <Sparkles className="mr-2 h-5 w-5" />
                Start Designing
              </Button>
            </Link>
            <Link href="/mp-care">
              <Button variant="outline" size="lg" className="text-lg px-8 py-6 h-auto">
                Learn More
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="bg-card/50 backdrop-blur-sm border rounded-lg p-6">
              <Wrench className="h-8 w-8 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Easy Customization</h3>
              <p className="text-sm text-muted-foreground">
                Choose from hundreds of fabrics, sizes, and designs
              </p>
            </div>
            <div className="bg-card/50 backdrop-blur-sm border rounded-lg p-6">
              <Heart className="h-8 w-8 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Quality Materials</h3>
              <p className="text-sm text-muted-foreground">
                Premium fabrics that last and feel amazing
              </p>
            </div>
            <div className="bg-card/50 backdrop-blur-sm border rounded-lg p-6">
              <Sparkles className="h-8 w-8 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Unique Designs</h3>
              <p className="text-sm text-muted-foreground">
                Create one-of-a-kind pillows for your space
              </p>
            </div>
          </div>
        </div>

        {/* Ripple Background Effect */}
        <Ripple
          mainCircleSize={300}
          mainCircleOpacity={0.15}
          numCircles={6}
          className="absolute inset-0"
        />
      </main>

    </div>
  );
}
