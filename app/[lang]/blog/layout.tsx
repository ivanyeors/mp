export default function BlogLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-background text-foreground min-h-screen">
            <main className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
                {children}
            </main>
        </div>
    );
}
