import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { LogIn } from "lucide-react";

export function LoginGate({ children, message }: { children?: React.ReactNode; message: string }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  if (!user) {
    return (
      <Card className="border-border/50">
        <CardContent className="p-8 text-center space-y-4">
          <LogIn className="w-10 h-10 text-muted-foreground mx-auto" />
          <div>
            <h3 className="font-display font-bold text-lg mb-1">Sign in Required</h3>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
          <Button onClick={() => navigate("/login")}>
            <LogIn className="w-4 h-4 mr-2" /> Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}
