import * as esbuild from 'https://deno.land/x/esbuild@v0.17.11/mod.js';

await esbuild.build({
  entryPoints: ['./src/psychds-validator.ts'],
  bundle: true,
  outfile: './bundled/bundle.js',
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  external: ['https://deno.land/std/*', 'jsonld'],
  loader: {
    '.json': 'json',
  },
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
});

esbuild.stop();