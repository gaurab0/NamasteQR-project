import * as esbuild from 'esbuild';

async function buildServer() {
  await esbuild.build({
    entryPoints: ['server.ts'],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    sourcemap: true,
    outfile: 'dist/server.cjs'
  });
  console.log('Successfully built dist/server.cjs');
}

buildServer().catch((err) => {
  console.error(err);
  process.exit(1);
});
