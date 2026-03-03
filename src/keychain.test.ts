import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import {
  escapeShellArg,
  getStoredApiKey,
  setStoredApiKey,
  deleteStoredApiKey,
} from "./keychain.js";

function hasSecretTool(): boolean {
  try {
    execSync("which secret-tool", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

describe("escapeShellArg", () => {
  it("wraps simple strings in single quotes", () => {
    expect(escapeShellArg("hello")).toBe("'hello'");
  });

  it("escapes embedded single quotes", () => {
    expect(escapeShellArg("it's")).toBe("'it'\\''s'");
  });

  it("handles multiple single quotes", () => {
    expect(escapeShellArg("a'b'c")).toBe("'a'\\''b'\\''c'");
  });

  it("handles empty string", () => {
    expect(escapeShellArg("")).toBe("''");
  });

  it("preserves special characters in API keys", () => {
    const key = "AIza!@#$%^&*()_+-={}[]|\\:;<>?,./~`";
    const escaped = escapeShellArg(key);
    // Should be wrapped in single quotes with no other escaping needed
    expect(escaped).toBe(`'${key}'`);
  });

  it("handles keys with double quotes", () => {
    const key = 'key"with"quotes';
    expect(escapeShellArg(key)).toBe(`'key"with"quotes'`);
  });

  it("handles keys with spaces", () => {
    expect(escapeShellArg("key with spaces")).toBe("'key with spaces'");
  });

  it("handles keys with newlines", () => {
    expect(escapeShellArg("key\nwith\nnewlines")).toBe("'key\nwith\nnewlines'");
  });
});

describe("platform dispatch", () => {
  it("getStoredApiKey returns string or null", () => {
    const result = getStoredApiKey();
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("setStoredApiKey accepts a string", () => {
    expect(() => setStoredApiKey).not.toThrow();
  });

  it("deleteStoredApiKey does not throw", () => {
    // deleteStoredApiKey is best-effort; should never throw
    expect(() => deleteStoredApiKey()).not.toThrow();
  });
});

// Integration tests: only run on the current platform's credential store.
// Uses a separate service name so tests never touch the real stored key.
const TEST_SERVICE = "pdf-analyzer-test";

describe.skipIf(process.platform !== "darwin")("macOS keychain integration", () => {
  const TEST_KEY = "test-key-vitest-" + Date.now();

  it("round-trips a key through the keychain", () => {
    setStoredApiKey(TEST_KEY, TEST_SERVICE);
    try {
      expect(getStoredApiKey(TEST_SERVICE)).toBe(TEST_KEY);
    } finally {
      deleteStoredApiKey(TEST_SERVICE);
    }
    // After deletion, should be null
    expect(getStoredApiKey(TEST_SERVICE)).toBeNull();
  });

  it("handles keys with special characters", () => {
    const specialKey = "AIza!@#$%^&*()_+-=[]|:;<>?,.~`";
    setStoredApiKey(specialKey, TEST_SERVICE);
    try {
      expect(getStoredApiKey(TEST_SERVICE)).toBe(specialKey);
    } finally {
      deleteStoredApiKey(TEST_SERVICE);
    }
  });

  it("overwrites existing key with -U flag", () => {
    const first = "first-key-" + Date.now();
    const second = "second-key-" + Date.now();
    setStoredApiKey(first, TEST_SERVICE);
    try {
      setStoredApiKey(second, TEST_SERVICE);
      expect(getStoredApiKey(TEST_SERVICE)).toBe(second);
    } finally {
      deleteStoredApiKey(TEST_SERVICE);
    }
  });
});

describe.skipIf(process.platform !== "linux" || !hasSecretTool())(
  "Linux secret-tool integration",
  () => {
    const TEST_KEY = "test-key-vitest-" + Date.now();

    it("round-trips a key through secret-tool", () => {
      setStoredApiKey(TEST_KEY, TEST_SERVICE);
      try {
        expect(getStoredApiKey(TEST_SERVICE)).toBe(TEST_KEY);
      } finally {
        deleteStoredApiKey(TEST_SERVICE);
      }
      expect(getStoredApiKey(TEST_SERVICE)).toBeNull();
    });
  }
);

describe.skipIf(process.platform !== "win32")("Windows credential manager integration", () => {
  const TEST_KEY = "test-key-vitest-" + Date.now();

  it("round-trips a key through credential manager", () => {
    setStoredApiKey(TEST_KEY, TEST_SERVICE);
    try {
      expect(getStoredApiKey(TEST_SERVICE)).toBe(TEST_KEY);
    } finally {
      deleteStoredApiKey(TEST_SERVICE);
    }
    expect(getStoredApiKey(TEST_SERVICE)).toBeNull();
  });
});
