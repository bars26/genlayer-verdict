"use client";

export type FeePresetLevel = "low" | "standard" | "high";

export type FeePresetEstimate = {
  level: FeePresetLevel;
  estimate?: {
    distribution?: Record<string, unknown>;
    messageAllocations?: Record<string, unknown>[];
    feeValue?: bigint | number | string;
    fee_value?: bigint | number | string;
    observed?: Record<string, unknown>;
  };
  observed?: Record<string, unknown>;
};

const PRESET_OPTIONS: Record<FeePresetLevel, Record<string, unknown>> = {
  low: {
    appealRounds: 0n,
    rotations: [0n],
  },
  standard: {
    appealRounds: 1n,
    rotations: [0n, 0n],
  },
  high: {
    appealRounds: 2n,
    rotations: [0n, 0n, 0n],
  },
};

function transactionFeesFromEstimate(estimate: FeePresetEstimate["estimate"]) {
  if (!estimate?.distribution) return undefined;

  const fees: Record<string, unknown> = {
    distribution: estimate.distribution,
  };

  if (estimate.messageAllocations) {
    fees.messageAllocations = estimate.messageAllocations;
  }

  const feeValue = estimate.feeValue ?? estimate.fee_value;
  if (feeValue !== undefined) {
    fees.feeValue = feeValue;
  }

  return fees;
}

export function feePresetToTransactionFees(preset?: FeePresetEstimate) {
  return transactionFeesFromEstimate(preset?.estimate);
}

export async function estimateWriteFeePreset(
  client: any,
  request: {
    address: `0x${string}`;
    functionName: string;
    args: unknown[];
    value?: bigint;
  },
  level: FeePresetLevel = "standard",
): Promise<FeePresetEstimate | undefined> {
  if (typeof client?.estimateTransactionFees !== "function") {
    return undefined;
  }

  const options = PRESET_OPTIONS[level];
  const initialEstimate = await client.estimateTransactionFees(options);
  let estimate = initialEstimate;

  if (
    typeof client.simulateWriteContract === "function" &&
    typeof client.estimateTransactionFeesFromSimulation === "function"
  ) {
    const simulation = await client.simulateWriteContract({
      ...request,
      includeReceipt: true,
      value: request.value ?? 0n,
      fees: transactionFeesFromEstimate(initialEstimate),
    });

    estimate = await client.estimateTransactionFeesFromSimulation({
      ...options,
      simulation,
    });
  }

  return {
    level,
    estimate,
    observed: estimate?.observed,
  };
}
