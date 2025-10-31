#!/usr/bin/env node
/**
 * Inspect a workflow execution and its node snapshots without mutating data.
 *
 * Usage:
 *   node tests/keep/test-execution-inspect.js <EXECUTION_ID>
 * Env:
 *   API_BASE (default: http://localhost:3001/api)
 *   API_TOKEN (JWT bearer token)
 */

const API_BASE = process.env.API_BASE || "http://localhost:3001/api";
const API_TOKEN = process.env.API_TOKEN || "";

async function main() {
  const executionId = process.argv[2];
  if (!executionId) {
    console.error(
      "Missing execution id. Usage: node tests/keep/test-execution-inspect.js <EXECUTION_ID>"
    );
    process.exit(1);
  }

  const headers = { Accept: "application/json" };
  if (API_TOKEN) headers["Authorization"] = `Bearer ${API_TOKEN}`;

  const fetchJson = async (url) => {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `HTTP ${res.status} ${res.statusText} for ${url}: ${text}`
      );
    }
    return res.json();
  };

  const execUrl = `${API_BASE}/workflow/executions/${executionId}`;
  console.log(`[GET] ${execUrl}`);
  const execution = await fetchJson(execUrl);

  console.log("\n=== Execution Summary ===");
  console.log("id:", execution.id);
  console.log("status:", execution.status);
  console.log("workflow:", execution.workflow?.name || "(unknown)");
  console.log(
    "nodeSnapshots:",
    Array.isArray(execution.nodeSnapshots) ? execution.nodeSnapshots.length : 0
  );

  const describeData = (label, data) => {
    const type = Array.isArray(data) ? "array" : typeof data;
    const size = Array.isArray(data)
      ? data.length
      : data && typeof data === "object" && "count" in data
        ? data.count
        : undefined;
    const hits =
      data && typeof data === "object" && Array.isArray(data.hits)
        ? data.hits.length
        : undefined;
    const parts = [`${label}: type=${type}`];
    if (size !== undefined) parts.push(`size=${size}`);
    if (hits !== undefined) parts.push(`hits=${hits}`);
    return parts.join(", ");
  };

  // Print execution-level results.hits if present
  if (execution.results && Array.isArray(execution.results.hits)) {
    console.log("results.hits:", execution.results.hits.length);
    if (execution.results.hits[0]) {
      try {
        console.log(
          "results.hits[0] keys:",
          Object.keys(execution.results.hits[0]).slice(0, 10)
        );
      } catch {}
    }
  }

  if (Array.isArray(execution.nodeSnapshots)) {
    console.log("\n=== Node Snapshots ===");
    const nodeDetails = [];
    for (const snap of execution.nodeSnapshots) {
      const nodeUrl = `${API_BASE}/workflow/executions/${executionId}/snapshots/${encodeURIComponent(snap.nodeId)}`;
      process.stdout.write(`\n[GET] ${nodeUrl}\n`);
      const node = await fetchJson(nodeUrl);
      console.log(
        `Node: ${node.nodeName} (${node.nodeId}) status=${node.status} progress=${node.progress}`
      );
      console.log("  " + describeData("inputData", node.inputData));
      console.log("  " + describeData("outputData", node.outputData));

      // If object with hits arrays, print small samples safely
      const printHitsSample = (label, data) => {
        if (data && typeof data === "object" && Array.isArray(data.hits)) {
          console.log(`  ${label}.hits length:`, data.hits.length);
          const first = data.hits[0];
          if (first) {
            try {
              console.log(
                `  ${label}.hits[0] keys:`,
                Object.keys(first).slice(0, 10)
              );
            } catch {}
          }
        }
      };
      printHitsSample("inputData", node.inputData);
      printHitsSample("outputData", node.outputData);

      // Spot differences vs snapshot list entry
      if (snap.status !== node.status) {
        console.log(
          `  ! status mismatch list='${snap.status}' detail='${node.status}'`
        );
      }

      nodeDetails.push({
        id: node.nodeId,
        name: node.nodeName,
        inputData: node.inputData,
        outputData: node.outputData,
      });
    }

    // Compare each node's output with the next node's input
    console.log("\n=== Output -> Next Input Consistency Checks ===");
    for (let i = 0; i < nodeDetails.length - 1; i++) {
      const current = nodeDetails[i];
      const next = nodeDetails[i + 1];
      const curOut = current.outputData;
      const nextIn = next.inputData;

      const typeOf = (d) => (Array.isArray(d) ? "array" : typeof d);
      const summary = (d) => {
        const parts = [typeOf(d)];
        if (Array.isArray(d)) parts.push(`len=${d.length}`);
        if (d && typeof d === "object") {
          if (Array.isArray(d.hits)) parts.push(`hits=${d.hits.length}`);
          if (typeof d.count === "number") parts.push(`count=${d.count}`);
          try {
            parts.push(`keys=${Object.keys(d).slice(0, 8).join(",")}`);
          } catch {}
        }
        return parts.join(", ");
      };

      const equalDeep = (() => {
        try {
          return JSON.stringify(curOut) === JSON.stringify(nextIn);
        } catch {
          return false;
        }
      })();

      const sameType = typeOf(curOut) === typeOf(nextIn);
      const sameLen =
        Array.isArray(curOut) && Array.isArray(nextIn)
          ? curOut.length === nextIn.length
          : undefined;
      const sameHitsLen =
        curOut &&
        nextIn &&
        typeof curOut === "object" &&
        typeof nextIn === "object" &&
        Array.isArray(curOut.hits) &&
        Array.isArray(nextIn.hits)
          ? curOut.hits.length === nextIn.hits.length
          : undefined;

      console.log(`\n${current.name} -> ${next.name}`);
      console.log(`  output: ${summary(curOut)}`);
      console.log(`  next input: ${summary(nextIn)}`);
      console.log(
        `  sameType=${sameType}${sameLen !== undefined ? `, sameLen=${sameLen}` : ""}${sameHitsLen !== undefined ? `, sameHits=${sameHitsLen}` : ""}, deepEqual=${equalDeep}`
      );

      if (!equalDeep) {
        // Print tiny samples
        const sample = (d) => {
          if (Array.isArray(d)) return d.slice(0, 1);
          if (d && typeof d === "object") {
            const o = {};
            for (const k of Object.keys(d).slice(0, 5)) o[k] = d[k];
            return o;
          }
          return d;
        };
        try {
          console.log(
            "  sample output:",
            JSON.stringify(sample(curOut), null, 2)
          );
        } catch {}
        try {
          console.log(
            "  sample next input:",
            JSON.stringify(sample(nextIn), null, 2)
          );
        } catch {}
      }
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Error:", err?.message || err);
  process.exit(1);
});
