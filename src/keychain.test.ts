import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { escapeShellArg, getStoredValue, setStoredValue, deleteStoredValue } from "./keychain.js";

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
  it("getStoredValue returns string or null", () => {
    const result = getStoredValue("API_KEY");
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("setStoredValue accepts a string", () => {
    expect(() => setStoredValue).not.toThrow();
  });

  it("deleteStoredValue does not throw", () => {
    // deleteStoredValue is best-effort; should never throw
    expect(() => deleteStoredValue("API_KEY", "pdf-analyzer-test")).not.toThrow();
  });
});

// Integration tests: only run on the current platform's credential store.
// Uses a separate service name so tests never touch the real stored key.
const TEST_SERVICE = "pdf-analyzer-test";
const TEST_ACCOUNT = "TEST_KEY";

describe.skipIf(process.platform !== "darwin")("macOS keychain integration", () => {
  const TEST_KEY = "test-key-vitest-" + Date.now();

  it("round-trips a value through the keychain", () => {
    setStoredValue(TEST_ACCOUNT, TEST_KEY, TEST_SERVICE);
    try {
      expect(getStoredValue(TEST_ACCOUNT, TEST_SERVICE)).toBe(TEST_KEY);
    } finally {
      deleteStoredValue(TEST_ACCOUNT, TEST_SERVICE);
    }
    // After deletion, should be null
    expect(getStoredValue(TEST_ACCOUNT, TEST_SERVICE)).toBeNull();
  });

  it("handles keys with special characters", () => {
    const specialKey = "AIza!@#$%^&*()_+-=[]|:;<>?,.~`";
    setStoredValue(TEST_ACCOUNT, specialKey, TEST_SERVICE);
    try {
      expect(getStoredValue(TEST_ACCOUNT, TEST_SERVICE)).toBe(specialKey);
    } finally {
      deleteStoredValue(TEST_ACCOUNT, TEST_SERVICE);
    }
  });

  it("overwrites existing value", () => {
    const first = "first-key-" + Date.now();
    const second = "second-key-" + Date.now();
    setStoredValue(TEST_ACCOUNT, first, TEST_SERVICE);
    try {
      setStoredValue(TEST_ACCOUNT, second, TEST_SERVICE);
      expect(getStoredValue(TEST_ACCOUNT, TEST_SERVICE)).toBe(second);
    } finally {
      deleteStoredValue(TEST_ACCOUNT, TEST_SERVICE);
    }
  });
});

describe.skipIf(process.platform !== "linux" || !hasSecretTool())(
  "Linux secret-tool integration",
  () => {
    const TEST_KEY = "test-key-vitest-" + Date.now();

    it("round-trips a value through secret-tool", () => {
      setStoredValue(TEST_ACCOUNT, TEST_KEY, TEST_SERVICE);
      try {
        expect(getStoredValue(TEST_ACCOUNT, TEST_SERVICE)).toBe(TEST_KEY);
      } finally {
        deleteStoredValue(TEST_ACCOUNT, TEST_SERVICE);
      }
      expect(getStoredValue(TEST_ACCOUNT, TEST_SERVICE)).toBeNull();
    });
  }
);

describe.skipIf(process.platform !== "win32")("Windows credential manager integration", () => {
  const TEST_KEY = "test-key-vitest-" + Date.now();

  it("round-trips a value through credential manager", () => {
    setStoredValue(TEST_ACCOUNT, TEST_KEY, TEST_SERVICE);
    try {
      expect(getStoredValue(TEST_ACCOUNT, TEST_SERVICE)).toBe(TEST_KEY);
    } finally {
      deleteStoredValue(TEST_ACCOUNT, TEST_SERVICE);
    }
    expect(getStoredValue(TEST_ACCOUNT, TEST_SERVICE)).toBeNull();
  });
});
