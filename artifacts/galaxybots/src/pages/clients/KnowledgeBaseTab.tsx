import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Loader2, Upload, Trash2, FileText, File, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface KBDocument {
  id: number;
  clientId: number;
  title: string;
  sourceFilename: string;
  fileType: string;
  chunkCount: number;
  uploadedAt: string;
}

export function KnowledgeBaseTab({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: documents, isLoading } = useQuery<KBDocument[]>({
    queryKey: ["knowledge-base", clientId],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${BASE}/api/knowledge-base/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, docTitle }: { file: File; docTitle: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      if (docTitle) formData.append("title", docTitle);
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${BASE}/api/knowledge-base/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-base", clientId] });
      setTitle("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${BASE}/api/knowledge-base/documents/${documentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-base", clientId] });
    },
  });

  const handleUpload = () => {
    if (!selectedFile) return;
    uploadMutation.mutate({ file: selectedFile, docTitle: title || selectedFile.name });
  };

  const fileTypeIcon = (type: string) => {
    if (type === "pdf") return <FileText className="w-4 h-4 text-red-400" />;
    if (type === "docx") return <FileText className="w-4 h-4 text-blue-400" />;
    if (type === "md") return <FileText className="w-4 h-4 text-purple-400" />;
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Document
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload SOPs, pricing sheets, policies, or any reference document. Bots will automatically retrieve relevant sections when answering questions.
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-xs font-tech uppercase text-muted-foreground">Document Title (optional)</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Employee Handbook 2026"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-tech uppercase text-muted-foreground">File</label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,.md"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
              <p className="text-xs text-muted-foreground">Supported: PDF, DOCX, TXT, Markdown. Max 20MB.</p>
            </div>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || uploadMutation.isPending}
              variant="glow"
              className="w-full font-tech"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Processing & Indexing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload & Index
                </>
              )}
            </Button>
            {uploadMutation.isError && (
              <div className="flex items-center gap-2 text-destructive text-xs">
                <AlertCircle className="w-3 h-3" />
                {uploadMutation.error?.message || "Upload failed"}
              </div>
            )}
            {uploadMutation.isSuccess && (
              <p className="text-green-400 text-xs text-center font-tech">Document uploaded and indexed successfully!</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-display flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Indexed Documents
            {documents && documents.length > 0 && (
              <Badge variant="secondary" className="text-xs ml-2">
                {documents.length}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : !documents || documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No documents uploaded yet.</p>
              <p className="text-xs mt-1">Upload documents above to build your company knowledge base.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-border/30 hover:border-border/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {fileTypeIcon(doc.fileType)}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{doc.sourceFilename}</span>
                        <span className="text-border">|</span>
                        <span>{doc.chunkCount} chunks</span>
                        <span className="text-border">|</span>
                        <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(doc.id)}
                    disabled={deleteMutation.isPending}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
