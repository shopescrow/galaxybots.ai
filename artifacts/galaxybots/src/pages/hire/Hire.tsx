import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Check, Zap, Building, Globe } from "lucide-react";
import { Link } from "wouter";

export default function Hire() {
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-16 sm:py-24">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-display font-bold mb-6">
            Deploy Your <span className="text-gradient">AI Leadership</span>
          </h1>
          <p className="text-xl text-muted-foreground">
            Scale your operations instantly. No recruitment delays, no equity dilution. 
            Pure, unfiltered Fortune 500 expertise operating 24/7.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {/* Tier 1 */}
          <Card className="flex flex-col relative overflow-hidden group hover:border-cyan/50 transition-all duration-500">
            <CardHeader className="pb-8">
              <Zap className="w-8 h-8 text-cyan mb-4" />
              <CardTitle className="text-2xl font-display">Single Director</CardTitle>
              <CardDescription>Targeted expertise for a specific department gap.</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">$999</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-cyan shrink-0" />
                  <span className="text-sm text-foreground/80">Choose any 1 Director-level bot</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-cyan shrink-0" />
                  <span className="text-sm text-foreground/80">Unlimited Chat & Strategic Analysis</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-cyan shrink-0" />
                  <span className="text-sm text-foreground/80">Document Review & Output Generation</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/bots" className="w-full">
                <Button variant="outline" className="w-full">Select Bot</Button>
              </Link>
            </CardFooter>
          </Card>

          {/* Tier 2 */}
          <Card className="flex flex-col relative overflow-hidden group border-primary shadow-2xl shadow-primary/10 transform md:-translate-y-4">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary to-cyan" />
            <div className="absolute top-4 right-4 bg-primary/20 text-primary text-xs font-bold px-3 py-1 rounded-full border border-primary/30">
              RECOMMENDED
            </div>
            
            <CardHeader className="pb-8">
              <Building className="w-8 h-8 text-primary mb-4" />
              <CardTitle className="text-2xl font-display">Department Team</CardTitle>
              <CardDescription>A cohesive executive unit for your core operations.</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">$4,999</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-primary shrink-0" />
                  <span className="text-sm text-foreground/80">Choose up to 5 Directors</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-primary shrink-0" />
                  <span className="text-sm text-foreground/80">Cross-Bot Communication Enabled</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-primary shrink-0" />
                  <span className="text-sm text-foreground/80">Automated Daily Sync Reports</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-primary shrink-0" />
                  <span className="text-sm text-foreground/80">Priority Computing Allocation</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/clients" className="w-full">
                <Button variant="glow" className="w-full">Deploy Team</Button>
              </Link>
            </CardFooter>
          </Card>

          {/* Tier 3 */}
          <Card className="flex flex-col relative overflow-hidden group hover:border-gold/50 transition-all duration-500">
            <CardHeader className="pb-8">
              <Globe className="w-8 h-8 text-gold mb-4" />
              <CardTitle className="text-2xl font-display">Full Board</CardTitle>
              <CardDescription>The entire Fortune 500 corporate structure at your command.</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">$9,999</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-gold shrink-0" />
                  <span className="text-sm text-foreground/80">Access ALL 60+ Directors</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-gold shrink-0" />
                  <span className="text-sm text-foreground/80">Full Global Boardroom Access</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-gold shrink-0" />
                  <span className="text-sm text-foreground/80">Complete Daily Journal Logs</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-gold shrink-0" />
                  <span className="text-sm text-foreground/80">Custom Architect Role Privileges</span>
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/clients" className="w-full">
                <Button variant="outline" className="w-full hover:text-gold hover:border-gold/50">Contact Sales</Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
