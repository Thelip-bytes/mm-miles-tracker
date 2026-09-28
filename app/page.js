"use client";

import dynamic from "next/dynamic";

// The whole app reads/writes localStorage and Firebase at mount time, so it
// only ever makes sense running in the browser — loading it with ssr:false
// avoids any server/client hydration mismatch.
const Root = dynamic(() => import("@/components/Root"), { ssr: false });

export default function Page() {
  return (
    <div className="mm-app-root">
      <Root />
    </div>
  );
}
