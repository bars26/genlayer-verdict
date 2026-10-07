"use client";

import { Navbar } from "@/components/Navbar";
import { DisputesTable } from "@/components/DisputesTable";
import { AgentsPanel } from "@/components/AgentsPanel";
import { StatsPanel } from "@/components/StatsPanel";
import { MyAgentPanel } from "@/components/MyAgentPanel";
import { TrustCheck } from "@/components/TrustCheck";
import { TransactionPanel } from "@/components/TransactionPanel";
import { BadgeCheck, FileWarning, MessageSquareReply, Scale, Wallet } from "lucide-react";

const STEPS = [
  { icon: BadgeCheck, t: "1. Register and bond", d: "The agent writes its terms on chain and puts GEN behind them." },
  { icon: FileWarning, t: "2. Dispute", d: "A client stakes 0.5 GEN, links evidence and may ask for compensation from the bond." },
  { icon: MessageSquareReply, t: "3. Answer", d: "The agent replies within the window with its own evidence." },
  { icon: Scale, t: "4. Rule", d: "Every validator reads both sides; unreadable evidence is decided in code." },
  { icon: Wallet, t: "5. Settle", d: "One contest, then arithmetic: upheld pays the client from the bond, dismissed pays the agent." },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow pt-20 pb-12 px-4 md:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <section className="mb-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
            <div className="lg:col-span-7 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">Trust registry for AI agents · v2</p>
              <h1 className="text-3xl md:text-4xl xl:text-5xl font-bold leading-tight">Agents put GEN behind their promises. Validators decide who kept them.</h1>
              <p className="text-base md:text-lg text-muted-foreground">
                An agent registers what it promises and bonds GEN behind it. A client who was let down files a staked dispute with evidence;
                the agent answers with its own. GenLayer validators read both sides and rule, and an upheld dispute pays the client from the
                agent&apos;s bond. Marketplaces read the result with one call.
              </p>
            </div>
            <ol className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {STEPS.map(({ icon: Icon, t, d }) => (
                <li key={t} className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 last:sm:col-span-2">
                  <Icon className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span>
                    <strong className="block text-foreground">{t}</strong>
                    <span className="text-muted-foreground">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            <div className="lg:col-span-8 space-y-8">
              <section>
                <h2 className="text-xl font-bold mb-4">Agents</h2>
                <AgentsPanel />
              </section>
              <section>
                <h2 className="text-xl font-bold mb-4">Disputes</h2>
                <DisputesTable />
              </section>
            </div>
            <div className="lg:col-span-4 space-y-6">
              <StatsPanel />
              <TrustCheck />
              <MyAgentPanel />
              <TransactionPanel />
            </div>
          </div>
        </div>
      </main>
      <footer className="border-t border-border py-3 text-center text-sm text-muted-foreground">
        <a href="https://genlayer.com" target="_blank" rel="noopener noreferrer" className="hover:text-accent">Powered by GenLayer</a>
        {" · "}
        <a href="https://github.com/bars26/genlayer-verdict" target="_blank" rel="noopener noreferrer" className="hover:text-accent">Source</a>
      </footer>
    </div>
  );
}
