import { NextRequest, NextResponse } from "next/server";
import { listTrainees, archiveTrainee } from "@/lib/traineeStore";
import { invalidateBootstrapCache } from "@/lib/memoryStore";

/**
 * POST /api/admin/archive-trainees-by-name
 * Bulk archive trainees by matching names (case-insensitive)
 *
 * Request body:
 * {
 *   "names": ["First Last", "Another Person", ...]
 * }
 *
 * Returns:
 * {
 *   "archivedCount": number,
 *   "archivedIds": string[],
 *   "notFound": string[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.names || !Array.isArray(body.names)) {
      return NextResponse.json(
        { error: "Missing required field: names (array of strings)" },
        { status: 400 }
      );
    }

    // Normalize names for matching (lowercase, trim)
    const targetNames = body.names.map((name: string) =>
      name.toLowerCase().trim()
    );

    // Get all trainees (including archived to avoid re-archiving)
    const allTrainees = await listTrainees(true);

    const archivedIds: string[] = [];
    const notFound: string[] = [];

    for (const targetName of targetNames) {
      // Try to match "First Last" or individual fields
      const matchedTrainee = allTrainees.find((t) => {
        const fullName = `${t.firstName} ${t.lastName}`.toLowerCase().trim();
        const firstName = t.firstName.toLowerCase().trim();
        const lastName = t.lastName.toLowerCase().trim();

        return (
          fullName === targetName ||
          firstName === targetName ||
          lastName === targetName
        );
      });

      if (matchedTrainee && !matchedTrainee.isArchived) {
        // Archive the trainee
        const success = await archiveTrainee(matchedTrainee.id);
        if (success) {
          archivedIds.push(matchedTrainee.id);
          console.log(`[Admin] Archived trainee: ${matchedTrainee.firstName} ${matchedTrainee.lastName} (${matchedTrainee.id})`);
        }
      } else if (!matchedTrainee) {
        notFound.push(targetName);
      }
      // If already archived, skip silently
    }

    // Invalidate bootstrap cache so changes appear immediately
    if (archivedIds.length > 0) {
      invalidateBootstrapCache();
    }

    return NextResponse.json({
      archivedCount: archivedIds.length,
      archivedIds,
      notFound,
    });
  } catch (error) {
    console.error("[Admin] Failed to archive trainees:", error);
    return NextResponse.json(
      { error: "Failed to archive trainees" },
      { status: 500 }
    );
  }
}
