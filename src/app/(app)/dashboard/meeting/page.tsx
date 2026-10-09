"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function MeetingFallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check query params or raw search
      const idParam = searchParams.get("id");
      if (idParam) {
        router.replace(`/dashboard/meeting/${idParam}`);
        return;
      }

      const rawSearch = window.location.search.replace(/^\?/, "").trim();
      if (rawSearch) {
        const extracted = rawSearch.split("&")[0].split("=")[0];
        if (extracted) {
          router.replace(`/dashboard/meeting/${extracted}`);
          return;
        }
      }

      // If no ID at all, redirect to meetings feed in dashboard
      router.replace("/dashboard");
    }
  }, [router, searchParams]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-voiceflow-orange" />
      <p className="text-sm text-muted-foreground font-medium">Loading meeting details...</p>
    </div>
  );
}
