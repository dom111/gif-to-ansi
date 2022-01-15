const { sassPlugin } = require('esbuild-sass-plugin'),
  { Prettier } = require('esbuild-plugin-prettier'),
  esbuild = require('esbuild'),
  buildOptions = {
    entryPoints: ['src/js/app.ts', 'src/css/app.scss'],
    bundle: true,
    minify: true,
    sourcemap: true,
    watch: false,
    outdir: 'dist',
    plugins: [sassPlugin(), new Prettier()],
  };

process.argv.forEach((arg) => {
  if (arg === 'watch') {
    buildOptions.watch = {
      onRebuild(error, result) {
        if (error) {
          console.log('\x1b[31mError rebuilding:\x1b[0m');
          console.error(error);

          return;
        }

        console.log('\x1b[32mRebuilt.\x1b[0m');
      },
    };
  }
});

process.stdout.write(`Building... `);

esbuild
  .build(buildOptions)
  .then(() => {
    console.log('\x1b[32mdone.\x1b[0m');
  })
  .catch((e) => {
    console.log(`\x1b[31mfailed.\x1b[0m`);
    console.log('');
    console.error(e);

    process.exit(1);
  });
