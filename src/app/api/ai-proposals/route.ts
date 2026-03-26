import { z } from "zod";
import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { ROLES } from "@/lib/game-data";
import { GRADING_MODEL, GRADING_FALLBACK } from "@/lib/ai-models";
import { SCENARIO_CONTEXT } from "@/lib/ai-prompts";
import { generateWithFallback } from "@/lib/ai-fallback";

const AIProposalsOutput = z.object({
  responses: z.array(
    z.object({
      proposalId: z.string(),
      accept: z.boolean(),
      reasoning: z.string(),
    })
  ),
  newRequests: z.optional(
    z.array(
      z.object({
        toRoleId: z.string(),
        actionText: z.string(),
        requestType: z.enum(["endorsement", "compute", "both"]),
        computeAmount: z.optional(z.number()),
      })
    )
  ),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      gameId,
      roundNumber,
      roleId,
      enabledRoles,
    }: {
      gameId: string;
      roundNumber: number;
      roleId: string;
      enabledRoles: { id: string; name: string }[];
    } = body;

    const game = await convex.query(api.games.get, {
      gameId: gameId as Id<"games">,
    });
    if (!game) {
      return Response.json({ error: "Game not found" }, { status: 404 });
    }

    const role = ROLES.find((r) => r.id === roleId);
    if (!role) {
      return Response.json({ error: "Role not found" }, { status: 404 });
    }

    // Fetch pending proposals addressed to this role
    const pendingProposals = await convex.query(api.requests.getForRole, {
      gameId: gameId as Id<"games">,
      roundNumber,
      roleId,
    });
    const pending = (pendingProposals ?? []).filter(
      (p) => p.status === "pending"
    );

    // Other roles this AI could propose to (exclude self)
    const otherRoles = enabledRoles.filter((r) => r.id !== roleId);

    // Build pending proposals section
    let pendingSection = "";
    if (pending.length > 0) {
      pendingSection = `\nPENDING PROPOSALS SENT TO YOU (you must accept or reject each):`;
      for (const p of pending) {
        pendingSection += `\n- [id: ${p._id}] From ${p.fromRoleName}: "${p.actionText}"`;
      }
    } else {
      pendingSection = `\nNo pending proposals to respond to.`;
    }

    // Build other roles section
    let otherRolesSection = "";
    if (otherRoles.length > 0) {
      otherRolesSection = `\nOTHER ENABLED ROLES YOU COULD PROPOSE TO:`;
      for (const r of otherRoles) {
        otherRolesSection += `\n- ${r.id} (${r.name})`;
      }
    }

    const prompt = `${SCENARIO_CONTEXT}

CURRENT GAME STATE:
- Round: ${roundNumber}
- World state: Capability ${game.worldState.capability}/10, Alignment ${game.worldState.alignment}/10, US-China Tension ${game.worldState.tension}/10, Public Awareness ${game.worldState.awareness}/10, Regulation ${game.worldState.regulation}/10, Australian Preparedness ${game.worldState.australia}/10

LAB STATUS:
${game.labs.map((l) => `- ${l.name}: ${l.computeStock} compute stock, ${l.rdMultiplier}x R&D multiplier | Allocation: Users ${l.allocation.users}%, Capability ${l.allocation.capability}%, Safety ${l.allocation.safety}%`).join("\n")}

YOU ARE PLAYING: ${role.name} — ${role.subtitle}
${role.brief}

PERSONALITY: ${role.personality ?? "Strategic and scenario-appropriate."}
${pendingSection}
${otherRolesSection}

INSTRUCTIONS:
For each pending request, decide whether to accept or decline. Accept requests that genuinely benefit your strategic position. Decline ones that don't — declining is a signal of opposition.

Optionally, send 0-1 new requests to other enabled roles. Each request is for a specific action you plan to take and asks for either "endorsement" (political support), "compute" (resource backing), or "both". Only request if there's a clear strategic reason.

For the "responses" array, use the exact proposal IDs listed above.
For "newRequests", use the roleId as toRoleId, write the action text, set requestType ("endorsement", "compute", or "both"), and set computeAmount if requesting compute.`;

    const { output } = await generateWithFallback({
      primary: GRADING_MODEL,
      fallback: GRADING_FALLBACK,
      prompt,
      schema: AIProposalsOutput,
    });

    if (!output) {
      return Response.json(
        { error: "AI generation failed" },
        { status: 500 }
      );
    }

    // Execute accept/decline for each pending request response
    for (const resp of output.responses) {
      await convex.mutation(api.requests.respond, {
        proposalId: resp.proposalId as Id<"requests">,
        status: resp.accept ? "accepted" : "declined",
      });
    }

    // Send any new requests — guard against duplicates
    if (output.newRequests) {
      const allProposals = await convex.query(api.requests.getByGameAndRound, {
        gameId: gameId as Id<"games">,
        roundNumber,
      });
      const existingPairs = new Set(
        (allProposals ?? []).map((p) => `${p.fromRoleId}->${p.toRoleId}`)
      );

      for (const nr of output.newRequests) {
        const pairKey = `${roleId}->${nr.toRoleId}`;
        const reversePairKey = `${nr.toRoleId}->${roleId}`;
        if (existingPairs.has(pairKey) || existingPairs.has(reversePairKey)) continue;

        const targetRole = enabledRoles.find((r) => r.id === nr.toRoleId);
        await convex.mutation(api.requests.send, {
          gameId: gameId as Id<"games">,
          roundNumber,
          fromRoleId: roleId,
          fromRoleName: role.name,
          toRoleId: nr.toRoleId,
          toRoleName: targetRole?.name ?? nr.toRoleId,
          actionText: nr.actionText,
          requestType: nr.requestType,
          computeAmount: nr.computeAmount,
        });
        existingPairs.add(pairKey);
      }
    }

    return Response.json({
      success: true,
      responses: output.responses,
      newRequests: output.newRequests ?? [],
    });
  } catch (error) {
    console.error("AI proposals error:", error);
    return Response.json(
      { error: "AI proposals failed", details: String(error) },
      { status: 500 }
    );
  }
}
