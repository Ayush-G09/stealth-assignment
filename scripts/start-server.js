const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const OS = { darwin: "darwin", linux: "linux", win32: "windows" };
const ARCH = { arm64: "arm64", x64: "amd64" };
const SUPPORTED = ["darwin-arm64", "darwin-amd64", "linux-amd64", "windows-amd64"];

const target = `${OS[process.platform]}-${ARCH[process.arch]}`;
if (!SUPPORTED.includes(target)) {
  console.error(
    `No mock API binary for ${process.platform}/${process.arch}. ` +
      `Supported: ${SUPPORTED.join(", ")}. Please contact us and we'll send one.`,
  );
  process.exit(1);
}

const binary = path.join(
  __dirname,
  "..",
  "bin",
  `mock-api-${target}${process.platform === "win32" ? ".exe" : ""}`,
);
if (!fs.existsSync(binary)) {
  console.error(`Missing ${binary}. Clone the repository with git rather than downloading a zip.`);
  process.exit(1);
}
if (process.platform !== "win32") {
  fs.chmodSync(binary, 0o755);
}

const child = spawn(binary, process.argv.slice(2), { stdio: "inherit" });

child.on("error", (err) => {
  console.error(`Could not start the mock API: ${err.message}`);
  if (process.platform === "darwin") {
    console.error("If macOS blocked it, run: xattr -d com.apple.quarantine bin/*");
  }
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
