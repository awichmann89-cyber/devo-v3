"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { SignatureEditor } from "@/components/ui/signature-editor";
import { saveSignature } from "./actions";
import { toastError } from "@/lib/toast";

export function SignatureForm({ initialHtml }: { initialHtml: string }) {
  const [html, setHtml] = useState(initialHtml);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await saveSignature(html);
        toast.success("Signatur gespeichert");
      } catch (err) {
        toastError(err, "Speichern");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SignatureEditor value={html} onChange={setHtml} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Speichern
        </Button>
      </div>
    </form>
  );
}
