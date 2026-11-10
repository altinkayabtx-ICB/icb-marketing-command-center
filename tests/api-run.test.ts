import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { generateText } = vi.hoisted(() => ({
  generateText: vi.fn()
}));

vi.mock("ai", () => ({
  generateText,
  Output: {
    object: (options: unknown) => options
  }
}));

import handler from "../api/run";
import { tokenEquals } from "../lib/auth";
import {
  INSTANCE_LIMIT_MULTIPLIER,
  resetRateLimitState
} from "../lib/rate-limit";

const TOKEN = "test-token";

const validBody = {
  project: "ICB Marketing Department V2",
  objective: "Check routing and QA.",
  stage: "research",
  strategyStatus: "active",
  importance: "standard",
  requestedWorkerIds: ["portfolio-strategy"],
  autoCorrect: false
};

const cannedOutput = {
  status: "READY",
  deliverable: "test deliverable",
  findings: [],
  claims: [],
  missingInformation: [],
  handoffNotes: "",
  executiveSummary: "test summary",
  decisionsRequired: [],
  nextActions: [],
  qaStatus: "not_applicable"
};

type TestResponse = {
  statusCode: number;
  body: unknown;
  headers: Map<string, string>;
  setHeader: (name: string, value: string | number) => TestResponse;
  status: (code: number) => TestResponse;
  json: (payload: unknown) => TestResponse;
};

function createRes(): TestResponse {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: new Map<string, string>(),
    setHeader(name: string, value: string | number) {
      this.headers.set(name.toLowerCase(), String(value));
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

async function post(options: {
  authorization?: string;
  body?: unknown;
  ip?: string;
  method?: string;
}) {
  const headers: Record<string, string> = {};
  if (options.authorization !== undefined) {
    headers.authorization = options.authorization;
  }
  if (options.ip) headers["x-forwarded-for"] = options.ip;

  const req = {
    method: options.method ?? "POST",
    headers,
    body: options.body === undefined ? validBody : options.body
  };
  const res = createRes();
  await handler(req, res);
  return res;
}

const envKeys = [
  "ICB_RUN_TOKEN",
  "ICB_RUN_RATE_LIMIT",
  "ICB_RUN_RATE_WINDOW_MS"
] as const;

let previousEnv: Record<(typeof envKeys)[number], string | undefined>;

beforeEach(() => {
  previousEnv = {
    ICB_RUN_TOKEN: process.env.ICB_RUN_TOKEN,
    ICB_RUN_RATE_LIMIT: process.env.ICB_RUN_RATE_LIMIT,
    ICB_RUN_RATE_WINDOW_MS: process.env.ICB_RUN_RATE_WINDOW_MS
  };
  process.env.ICB_RUN_TOKEN = TOKEN;
  process.env.ICB_RUN_RATE_LIMIT = "100";
  process.env.ICB_RUN_RATE_WINDOW_MS = "60000";
  resetRateLimitState();
  generateText.mockReset();
  generateText.mockResolvedValue({ output: cannedOutput, usage: {} });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const key of envKeys) {
    const prior = previousEnv[key];
    if (prior === undefined) delete process.env[key];
    else process.env[key] = prior;
  }
  resetRateLimitState();
  vi.restoreAllMocks();
});

describe("POST /api/run authentication", () => {
  it("returns 401 for an unauthenticated request and does not call the model", async () => {
    const res = await post({ ip: "203.0.113.10" });

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(res.headers.get("www-authenticate")).toBe("Bearer");
    expect(generateText).not.toHaveBeenCalled();
  });

  it.each([
    ["missing scheme", TOKEN],
    ["empty bearer", "Bearer"],
    ["blank bearer", "Bearer   "],
    ["basic scheme", `Basic ${TOKEN}`],
    ["extra token material", `Bearer ${TOKEN} extra`]
  ])(
    "returns 401 for malformed credentials (%s) and does not call the model",
    async (_label, authorization) => {
      const res = await post({
        authorization,
        ip: "203.0.113.11"
      });

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
      expect(generateText).not.toHaveBeenCalled();
    }
  );

  it("returns 401 for an invalid token and does not call the model", async () => {
    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((message?: unknown) => {
      errors.push(String(message));
    });

    const res = await post({
      authorization: "Bearer wrong-token",
      ip: "203.0.113.12"
    });

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "Unauthorized" });
    expect(JSON.stringify(res.body)).not.toContain("wrong-token");
    expect(JSON.stringify(res.body)).not.toContain(TOKEN);
    expect(errors.join("\n")).not.toContain("wrong-token");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("rejects a token whose length differs from the configured secret", async () => {
    const res = await post({
      authorization: "Bearer test-token-extended",
      ip: "203.0.113.13"
    });

    expect(res.statusCode).toBe(401);
    expect(generateText).not.toHaveBeenCalled();
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["blank", "   "]
  ])(
    "rejects every request when server auth config is %s and does not call the model",
    async (_label, value) => {
      if (value === undefined) delete process.env.ICB_RUN_TOKEN;
      else process.env.ICB_RUN_TOKEN = value;

      const res = await post({
        authorization: `Bearer ${TOKEN}`,
        ip: "203.0.113.14"
      });

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: "Unauthorized" });
      expect(generateText).not.toHaveBeenCalled();
    }
  );

  it("passes an authorized request through to the model client", async () => {
    const res = await post({
      authorization: `Bearer ${TOKEN}`,
      ip: "203.0.113.15"
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ status: "READY" });
    expect(generateText).toHaveBeenCalled();

    const serializedCalls = generateText.mock.calls.map((call) =>
      JSON.stringify(call[0])
    );
    expect(
      serializedCalls.some((call) => call.includes(validBody.objective))
    ).toBe(true);
    expect(serializedCalls.join("\n")).not.toContain(TOKEN);
  });

  it("accepts a bearer scheme with any capitalization", async () => {
    const res = await post({
      authorization: `bEaReR ${TOKEN}`,
      ip: "203.0.113.16"
    });

    expect(res.statusCode).toBe(200);
    expect(generateText).toHaveBeenCalled();
  });
});

describe("POST /api/run rate limit", () => {
  it("returns 429 after repeated invalid credentials and does not call the model", async () => {
    process.env.ICB_RUN_RATE_LIMIT = "1";
    const ip = "203.0.113.70";

    const first = await post({ authorization: "Bearer wrong-token", ip });
    expect(first.statusCode).toBe(401);
    expect(generateText).not.toHaveBeenCalled();

    const second = await post({ authorization: "Bearer wrong-token", ip });
    expect(second.statusCode).toBe(429);
    expect(second.body).toEqual({ error: "Too many requests" });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("returns 429 once the client window is exhausted and does not call the model", async () => {
    process.env.ICB_RUN_RATE_LIMIT = "1";
    const ip = "203.0.113.50";

    const first = await post({ authorization: `Bearer ${TOKEN}`, ip });
    expect(first.statusCode).toBe(200);
    const callsAfterAllowed = generateText.mock.calls.length;
    expect(callsAfterAllowed).toBeGreaterThan(0);

    const second = await post({ authorization: `Bearer ${TOKEN}`, ip });
    expect(second.statusCode).toBe(429);
    expect(second.body).toEqual({ error: "Too many requests" });
    expect(second.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(generateText.mock.calls.length).toBe(callsAfterAllowed);
  });

  it("returns 429 for a new client address after the instance window is exhausted", async () => {
    process.env.ICB_RUN_RATE_LIMIT = "1";
    const allowedClients = INSTANCE_LIMIT_MULTIPLIER;

    for (let index = 0; index < allowedClients; index += 1) {
      const res = await post({
        authorization: `Bearer ${TOKEN}`,
        ip: `203.0.113.${index + 1}`
      });
      expect(res.statusCode).toBe(200);
    }

    const callsAfterAllowed = generateText.mock.calls.length;
    const blocked = await post({
      authorization: `Bearer ${TOKEN}`,
      ip: "198.51.100.20"
    });

    expect(blocked.statusCode).toBe(429);
    expect(generateText.mock.calls.length).toBe(callsAfterAllowed);
  });
});

describe("token comparison", () => {
  it("matches equal secrets and rejects different lengths without throwing", () => {
    expect(tokenEquals("same-secret", "same-secret")).toBe(true);
    expect(tokenEquals("short", "short-but-longer")).toBe(false);
    expect(tokenEquals("short-but-longer", "short")).toBe(false);
  });
});

describe("non-POST", () => {
  it("does not call the model for a different method", async () => {
    const res = await post({
      method: "GET",
      authorization: `Bearer ${TOKEN}`,
      ip: "203.0.113.60"
    });

    expect(res.statusCode).toBe(405);
    expect(generateText).not.toHaveBeenCalled();
  });
});
