import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Hexagon, Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";

const NAV_LINKS = [
  { href: "/bots", label: "Roster" },
  { href: "/boardroom", label: "Boardroom" },
  { href: "/journal", label: "Journal" },
  { href: "/clients", label: "Clients" },
];

export function Navbar() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/60 backdrop-blur-xl">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 group-hover:border-primary transition-colors">
              <Hexagon className="w-6 h-6 text-primary" />
              <div className="absolute inset-0 bg-primary/20 blur-md rounded-full group-hover:bg-primary/40 transition-all opacity-0 group-hover:opacity-100" />
            </div>
            <span className="font-display font-bold text-xl tracking-wider text-foreground">
              GALAXY<span className="text-primary">BOTS</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 font-tech text-sm font-medium">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-4 py-2 rounded-lg transition-all duration-200",
                  location.startsWith(link.href)
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-4">
          <Link href="/hire">
            <Button variant="glow">Hire Directors</Button>
          </Link>
        </div>

        {/* Mobile toggle */}
        <button 
          className="md:hidden p-2 text-muted-foreground hover:text-foreground"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden absolute top-20 left-0 w-full bg-background border-b border-border/40 p-4 flex flex-col gap-2 shadow-2xl">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className={cn(
                "px-4 py-3 rounded-lg transition-colors font-tech font-medium",
                location.startsWith(link.href)
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
          <div className="h-px bg-border/50 my-2" />
          <Link href="/hire" onClick={() => setIsOpen(false)}>
            <Button variant="glow" className="w-full">Hire Directors</Button>
          </Link>
        </div>
      )}
    </header>
  );
}
