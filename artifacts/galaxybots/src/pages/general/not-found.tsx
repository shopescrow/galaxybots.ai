import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";

export default function NotFound() {
  return (
    <AppLayout>
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 text-center">
        <div className="w-20 h-20 bg-destructive/10 rounded-2xl flex items-center justify-center border border-destructive/20 mb-6">
          <AlertTriangle className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="text-2xl sm:text-4xl font-display font-bold mb-4">404: SECTOR NOT FOUND</h1>
        <p className="text-muted-foreground mb-8 max-w-md font-tech">
          The structural directive you requested does not exist in the current architecture. 
          Please return to the main hub.
        </p>
        <Link href="/">
          <Button variant="glow">Return to Operations</Button>
        </Link>
      </div>
    </AppLayout>
  );
}
