const { AsyncLocalStorage } = require("node:async_hooks");

if (typeof globalThis !== "undefined" && !globalThis.AsyncLocalStorage) {
  globalThis.AsyncLocalStorage = AsyncLocalStorage;
}
