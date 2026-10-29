"use client";

import React from "react";
import { signOut } from "next-auth/react";

/** Client-side sign-out link for trainee pages (the server-action form lives in TopNav). */
export function SignOutLink({ children = "Sign out", callbackUrl = "/signin" }: { children?: React.ReactNode; callbackUrl?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl })}
      className="text-sm text-white/60 underline underline-offset-4 hover:text-white"
    >
      {children}
    </button>
  );
}
