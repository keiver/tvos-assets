const major = parseInt(process.versions.node.split(".")[0], 10);
if (major < 18) {
  console.error(
    `tvos-image-creator requires Node.js >= 18 (current: ${process.versions.node}). ` +
    `Please upgrade Node.js and try again.`,
  );
  process.exit(1);
}
