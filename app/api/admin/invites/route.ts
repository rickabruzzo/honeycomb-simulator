import { NextResponse } from "next/server";
import { getAdminInvites } from "@/lib/adminInvites";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const invites = await getAdminInvites(50);
    return NextResponse.json(invites, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (error) {
    console.error("Failed to get admin invites:", error);
    return NextResponse.json(
      { error: "Failed to load invites" },
      { status: 500 }
    );
  }
}
