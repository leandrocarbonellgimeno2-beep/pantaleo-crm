"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function NuovoImmobile() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/immobili?new=true");
  }, [router]);

  return (
    <div className="flex h-[80vh] items-center justify-center">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );
}
