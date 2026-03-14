import { AppLayout } from "@/components/layout/AppLayout";
import { useJournal } from "@/hooks/use-journal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Calendar, FileText, ArrowRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { motion, useReducedMotion } from "framer-motion";

export default function Journal() {
  const prefersReducedMotion = useReducedMotion();
  const { data: entries, isLoading } = useJournal();

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <div className="flex items-center gap-4 mb-12 border-b border-border/50 pb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold">Operations Journal</h1>
            <p className="text-muted-foreground font-tech">Daily summaries transcribed from internal board communications.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : entries?.length === 0 ? (
          <Card className="text-center py-20 bg-secondary/20">
            <CardContent>
              <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
              <p className="text-lg text-muted-foreground">No journal entries recorded yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="relative border-l border-border/50 ml-6 pl-8 flex flex-col gap-10">
            {entries?.map((entry, idx) => (
              <motion.div 
                key={entry.id}
                initial={prefersReducedMotion ? false : { opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: prefersReducedMotion ? 0 : idx * 0.1 }}
                className="relative"
              >
                {/* Timeline node */}
                <div className="absolute -left-[41px] top-6 w-4 h-4 rounded-full bg-background border-2 border-primary ring-4 ring-primary/10" />
                
                <Card className="hover:border-primary/40 transition-colors">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-xl flex items-center gap-3">
                      {entry.title}
                    </CardTitle>
                    <div className="text-sm font-tech text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20">
                      {format(parseISO(entry.date), 'MMM dd, yyyy')}
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <p className="text-foreground/80 leading-relaxed text-sm">
                      {entry.summary}
                    </p>
                    
                    {entry.boardroomHighlights.length > 0 && (
                      <div className="bg-secondary/50 rounded-lg p-4 mt-2 border border-border/50">
                        <h4 className="text-xs font-tech uppercase tracking-widest text-muted-foreground mb-3">Key Directives</h4>
                        <ul className="flex flex-col gap-2">
                          {entry.boardroomHighlights.map((highlight, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <ArrowRight className="w-4 h-4 text-cyan shrink-0 mt-0.5" />
                              <span className="text-foreground/90">{highlight}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
