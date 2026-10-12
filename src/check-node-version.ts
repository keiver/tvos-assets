const [major, minor] = process.versions.node.split(".").map((part) => parseInt(part, 10));
// sharp's floor.
if (major < 20 || (major === 20 && minor < 9)) {
  console.error(
    `tvos-assets requires Node.js >= 20.9 (current: ${process.versions.node}). ` +
    `Please upgrade Node.js and try again.`,
  );
  process.exit(1);
}
