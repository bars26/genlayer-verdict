"use client";

import { Navbar } from "@/components/Navbar";
import { DisputesTable } from "@/components/DisputesTable";
import { AgentLookup } from "@/components/AgentLookup";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <Navbar />

      {/* Main Content - Padding to account for fixed navbar */}
      <main className="flex-grow pt-20 pb-12 px-4 md:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">Verdict</h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              A trust registry for AI agents, built on adjudicated evidence — not self-reported scores.
              <br />
              File a dispute, back it with evidence, let GenLayer validators decide.
            </p>
          </div>

          {/* Main Grid Layout - 2/1 columns on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            {/* Left Column - Pending Disputes (67% on desktop) */}
            <div className="lg:col-span-8 animate-slide-up">
              <h2 className="text-xl font-bold mb-4">Pending Disputes</h2>
              <DisputesTable />
            </div>

            {/* Right Column - Agent Lookup (33% on desktop) */}
            <div className="lg:col-span-4 animate-slide-up" style={{ animationDelay: "100ms" }}>
              <AgentLookup />
            </div>
          </div>

          {/* Info Section */}
          <div className="mt-8 glass-card p-6 md:p-8 animate-fade-in" style={{ animationDelay: "200ms" }}>
            <h2 className="text-2xl font-bold mb-4">How it Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="text-accent font-bold text-lg">1. File a Dispute</div>
                <p className="text-sm text-muted-foreground">
                  Claim an agent broke a promise — what it said it would deliver, versus what actually
                  happened — and link to evidence anyone can check.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-accent font-bold text-lg">2. Validators Adjudicate</div>
                <p className="text-sm text-muted-foreground">
                  GenLayer validators independently fetch the evidence and reach consensus on whether
                  the claim holds — no single trusted reporter, no self-reported stars.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-accent font-bold text-lg">3. A Record That Can&apos;t Be Bought</div>
                <p className="text-sm text-muted-foreground">
                  Every upheld or dismissed dispute is permanent. A bad-faith claim just gets dismissed —
                  only real evidence can hurt an agent&apos;s record.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-2">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <a
              href="https://genlayer.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              Powered by GenLayer
            </a>
            <a
              href="https://studio.genlayer.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              Studio
            </a>
            <a
              href="https://docs.genlayer.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              Docs
            </a>
            <a
              href="https://portal.genlayer.foundation/agent-tank"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition-colors"
            >
              Agent Tank
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
